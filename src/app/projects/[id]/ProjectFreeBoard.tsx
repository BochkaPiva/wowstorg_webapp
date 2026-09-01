"use client";

import React from "react";
import ReactGridLayout from "react-grid-layout/legacy";
import {
  useContainerWidth,
  type Layout,
  type LayoutItem,
} from "react-grid-layout";

import {
  PROJECT_FREE_BOARD_COLUMNS,
  PROJECT_FREE_BOARD_MAX_ITEMS,
  PROJECT_FREE_BOARD_PORTS,
  ProjectFreeBoardItemInputSchema,
  createProjectFreeBoardConnector,
  createProjectFreeBoardGroup,
  createProjectFreeBoardItem,
  createProjectFreeBoardLinkedItem,
  duplicateProjectFreeBoardItem,
  type ProjectFreeBoardItemDto,
  type ProjectFreeBoardItemInput,
  type ProjectFreeBoardLinkable,
  type ProjectFreeBoardLinkables,
  type ProjectFreeBoardLinkedItemType,
  type ProjectFreeBoardPort,
} from "@/lib/projects/project-free-board";
import {
  cloneProjectFreeBoardItems,
  projectFreeBoardOperationsForSnapshot,
} from "@/lib/projects/project-free-board-history";
import {
  applyOptimisticOperations,
  coalesceProjectFreeBoardOperations,
  itemDtoToInput,
  withExpectedRevision,
  type ProjectFreeBoardMutationEnvelope,
  type ProjectFreeBoardOperation,
} from "@/lib/projects/project-free-board-queue";
import {
  readProjectBoardRecovery,
  writeProjectBoardRecovery,
} from "@/lib/projects/project-free-board-storage";

type SaveState = "idle" | "saving" | "saved" | "offline" | "error" | "invalid";
type BasicItemType = "NOTE" | "STICKER" | "HEADING" | "CHECKLIST" | "LINK";
type BoardConnector = Extract<ProjectFreeBoardItemInput, { type: "CONNECTOR" }>;
type ConnectorDraft = {
  sourceId: string;
  sourcePort: ProjectFreeBoardPort;
  pointer: { x: number; y: number };
};
type SelectionBox = { left: number; top: number; width: number; height: number };
type BoardInsertPoint = { x: number; y: number };
type BoardContextMenu = {
  left: number;
  top: number;
  insertAt: BoardInsertPoint;
};

type BoardResponse = {
  board: {
    readOnly: boolean;
    items: ProjectFreeBoardItemDto[];
    invalidItemIds: string[];
    linkables: ProjectFreeBoardLinkables;
  };
};

type BatchResponse = {
  duplicate: boolean;
  result: {
    changedItems: ProjectFreeBoardItemDto[];
    deletedIds: string[];
    deletedRevisions?: Record<string, number>;
  };
};

const ITEM_LABEL: Record<BasicItemType, string> = {
  NOTE: "Заметка",
  STICKER: "Стикер",
  HEADING: "Текст",
  CHECKLIST: "Чек-лист",
  LINK: "Ссылка",
};

const ITEM_ACCENT: Record<string, string> = {
  LILAC: "border-violet-200 bg-violet-50/95",
  YELLOW: "border-amber-200 bg-amber-50/95",
  MINT: "border-emerald-200 bg-emerald-50/95",
  BLUE: "border-sky-200 bg-sky-50/95",
  ROSE: "border-rose-200 bg-rose-50/95",
  NEUTRAL: "border-zinc-200 bg-white/95",
};

const EMPTY_LINKABLES: ProjectFreeBoardLinkables = {
  tasks: [],
  orders: [],
  files: [],
  estimateSections: [],
};

const LINKED_ITEM_LABEL: Record<ProjectFreeBoardLinkedItemType, string> = {
  TASK: "Задача",
  ORDER: "Заявка",
  FILE: "Файл",
  ESTIMATE_SECTION: "Раздел сметы",
};

const LINKABLE_COLLECTION: Record<ProjectFreeBoardLinkedItemType, keyof ProjectFreeBoardLinkables> = {
  TASK: "tasks",
  ORDER: "orders",
  FILE: "files",
  ESTIMATE_SECTION: "estimateSections",
};

const BOARD_PORT_POSITION: Record<ProjectFreeBoardPort, string> = {
  TOP: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize",
  RIGHT: "right-0 top-1/2 -translate-y-1/2 translate-x-1/2 cursor-ew-resize",
  BOTTOM: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize",
  LEFT: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
};

function storageKey(actorUserId: string, projectId: string, kind: "inflight" | "pending") {
  return `${actorUserId}:${projectId}:board-v2:${kind}`;
}

function saveEnvelope(actorUserId: string, projectId: string, kind: "inflight" | "pending", envelope: ProjectFreeBoardMutationEnvelope | null) {
  void writeProjectBoardRecovery(storageKey(actorUserId, projectId, kind), envelope);
}

function useMobileBreakpoint() {
  const [mobile, setMobile] = React.useState(false);
  React.useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return mobile;
}

function Icon({ name }: { name: BasicItemType | ProjectFreeBoardLinkedItemType | "GROUP" | "drag" | "trash" | "plus" | "retry" | "copy" | "undo" | "redo" | "link" | "select" | "connect" }) {
  const paths: Record<string, React.ReactNode> = {
    NOTE: <path d="M6 3h9l3 3v15H6V3zm3 6h6V7H9v2zm0 4h6v-2H9v2zm0 4h4v-2H9v2z" />,
    STICKER: <path d="M5 4h14v11l-5 5H5V4zm10 11h2.5L15 17.5V15z" />,
    HEADING: <path d="M4 5h16v3h-6v11h-4V8H4V5z" />,
    CHECKLIST: <path d="M4 6h3v3H4V6zm5 0h11v2H9V6zM4 11h3v3H4v-3zm5 0h11v2H9v-2zM4 16h3v3H4v-3zm5 0h11v2H9v-2z" />,
    LINK: <path d="M9 7h-2a5 5 0 000 10h3v-2H7a3 3 0 010-6h2V7zm6 0h2a5 5 0 010 10h-3v-2h3a3 3 0 000-6h-2V7zm-7 4h8v2H8v-2z" />,
    TASK: <path d="M4 4h16v16H4V4zm3 3v2h10V7H7zm0 4v2h7v-2H7zm0 4v2h5v-2H7z" />,
    ORDER: <path d="M6 3h12v18H6V3zm3 4h6V5H9v2zm0 4h6V9H9v2zm0 4h4v-2H9v2z" />,
    FILE: <path d="M6 2h8l4 4v16H6V2zm8 2.5V8h3.5L14 4.5zM9 12h6v-2H9v2zm0 4h6v-2H9v2z" />,
    ESTIMATE_SECTION: <path d="M4 4h16v16H4V4zm3 3v2h10V7H7zm0 4v2h4v-2H7zm6 0v2h4v-2h-4zm-6 4v2h4v-2H7zm6 0v2h4v-2h-4z" />,
    GROUP: <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />,
    drag: <path d="M9 4h2v2H9V4zm4 0h2v2h-2V4zM9 9h2v2H9V9zm4 0h2v2h-2V9zM9 14h2v2H9v-2zm4 0h2v2h-2v-2z" />,
    trash: <path d="M7 7h10l-1 14H8L7 7zm2-4h6l1 2h4v2H4V5h4l1-2z" />,
    plus: <path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4z" />,
    retry: <path d="M12 4a8 8 0 017.7 6h-2.1A6 6 0 106 15l2-2H3V8l1.6 1.6A8 8 0 0112 4z" />,
    copy: <path d="M8 8h11v11H8V8zm-3 8H3V3h13v2H5v11z" />,
    undo: <path d="M9 7V3L2 9l7 6v-4c5 0 8 1.5 11 5-1-6-4-9-11-9z" />,
    redo: <path d="M15 7V3l7 6-7 6v-4c-5 0-8 1.5-11 5 1-6 4-9 11-9z" />,
    link: <path d="M9 7h-2a5 5 0 000 10h3v-2H7a3 3 0 010-6h2V7zm6 0h2a5 5 0 010 10h-3v-2h3a3 3 0 000-6h-2V7zm-7 4h8v2H8v-2z" />,
    select: <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />,
    connect: <path d="M7 6a3 3 0 100 6 3 3 0 000-6zm10 6a3 3 0 100 6 3 3 0 000-6zM9.8 8.2l4.4 3.6 1.2-1.6L11 6.6 9.8 8.2z" />,
  };
  return <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-current" aria-hidden>{paths[name]}</svg>;
}

function itemColor(item: ProjectFreeBoardItemInput) {
  const color = "color" in item.payload ? item.payload.color : undefined;
  return ITEM_ACCENT[color ?? "NEUTRAL"] ?? ITEM_ACCENT.NEUTRAL;
}

function itemToLayout(item: ProjectFreeBoardItemInput, readOnly: boolean): LayoutItem {
  return {
    i: item.id,
    x: item.x,
    y: item.y,
    w: item.width,
    h: item.height,
    minW: item.type === "HEADING" ? 6 : 4,
    minH: item.type === "HEADING" ? 2 : 3,
    maxW: PROJECT_FREE_BOARD_COLUMNS,
    maxH: 20,
    static: readOnly,
  };
}

function nextPosition(items: readonly ProjectFreeBoardItemInput[]) {
  const bottom = items.reduce((value, item) => item.type === "CONNECTOR" ? value : Math.max(value, item.y + item.height), 0);
  return { x: 0, y: bottom };
}

function itemDisplayName(item: ProjectFreeBoardItemInput) {
  if (item.type === "CONNECTOR") return item.payload.label || "Связь";
  if (item.type === "NOTE" || item.type === "STICKER" || item.type === "HEADING") return item.payload.text;
  if (item.type === "CHECKLIST") return item.payload.title || "Чек-лист";
  if (item.type === "LINK") return item.payload.label || item.payload.url || "Ссылка";
  if (item.type === "GROUP") return item.payload.title || "Группа";
  return item.payload.label || "Связанный блок";
}

export function ProjectFreeBoard({
  projectId,
  actorUserId,
  readOnly: projectReadOnly,
}: {
  projectId: string;
  actorUserId: string;
  readOnly: boolean;
}) {
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1200 });
  const mobile = useMobileBreakpoint();
  const [items, setItems] = React.useState<ProjectFreeBoardItemInput[]>([]);
  const itemsRef = React.useRef<ProjectFreeBoardItemInput[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [serverReadOnly, setServerReadOnly] = React.useState(false);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [message, setMessage] = React.useState("");
  const [linkables, setLinkables] = React.useState<ProjectFreeBoardLinkables>(EMPTY_LINKABLES);
  const [linkPickerType, setLinkPickerType] = React.useState<ProjectFreeBoardLinkedItemType | null>(null);
  const [linkQuery, setLinkQuery] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());
  const [activeItemId, setActiveItemId] = React.useState<string | null>(null);
  const [historyVersion, setHistoryVersion] = React.useState(0);
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = React.useState(false);
  const [spacePressed, setSpacePressed] = React.useState(false);
  const [selectedConnectorId, setSelectedConnectorId] = React.useState<string | null>(null);
  const [connectorDraft, setConnectorDraft] = React.useState<ConnectorDraft | null>(null);
  const [selectionBox, setSelectionBox] = React.useState<SelectionBox | null>(null);
  const [contextMenu, setContextMenu] = React.useState<BoardContextMenu | null>(null);
  const [linkInsertAt, setLinkInsertAt] = React.useState<BoardInsertPoint | null>(null);
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const panGestureRef = React.useRef<{ pointerId: number; startX: number; startY: number; panX: number; panY: number } | null>(null);
  const selectionGestureRef = React.useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    additive: boolean;
    moved: boolean;
  } | null>(null);
  const pendingRef = React.useRef<ProjectFreeBoardOperation[]>([]);
  const inFlightRef = React.useRef<ProjectFreeBoardMutationEnvelope | null>(null);
  const flushingRef = React.useRef(false);
  const flushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const conflictRetriesRef = React.useRef(0);
  const aliveRef = React.useRef(true);
  const undoRef = React.useRef<ProjectFreeBoardItemInput[][]>([]);
  const redoRef = React.useRef<ProjectFreeBoardItemInput[][]>([]);
  const deletedRevisionByIdRef = React.useRef(new Map<string, number>());
  const lastHistoryCaptureRef = React.useRef<{ key: string; at: number } | null>(null);
  const readOnly = projectReadOnly || serverReadOnly;

  const replaceItems = React.useCallback((next: ProjectFreeBoardItemInput[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const pushHistory = React.useCallback((key: string, force = false) => {
    const now = Date.now();
    const last = lastHistoryCaptureRef.current;
    if (!force && last?.key === key && now - last.at < 900) return;
    undoRef.current = [...undoRef.current.slice(-49), cloneProjectFreeBoardItems(itemsRef.current)];
    redoRef.current = [];
    lastHistoryCaptureRef.current = { key, at: now };
    setHistoryVersion((value) => value + 1);
  }, []);

  const persistPending = React.useCallback(() => {
    const operations = pendingRef.current;
    saveEnvelope(
      actorUserId,
      projectId,
      "pending",
      operations.length ? { mutationId: crypto.randomUUID(), operations } : null,
    );
  }, [actorUserId, projectId]);

  const refreshCanonicalRevisions = React.useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/workspace/items`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as BoardResponse | null;
    if (!response.ok || !body?.board) throw new Error("Не удалось обновить доску");
    const revisionById = new Map(body.board.items.map((item) => [item.id, item.revision]));
    const rebase = (operation: ProjectFreeBoardOperation): ProjectFreeBoardOperation => {
      const id = operation.op === "UPSERT" ? operation.item.id : operation.itemId;
      const revision = revisionById.get(id);
      if (operation.op === "DELETE") return { ...operation, expectedRevision: revision ?? null };
      return { ...operation, item: { ...operation.item, expectedRevision: revision ?? null } };
    };
    pendingRef.current = pendingRef.current.map(rebase);
    if (inFlightRef.current) {
      inFlightRef.current = {
        mutationId: crypto.randomUUID(),
        operations: inFlightRef.current.operations.map(rebase),
      };
      saveEnvelope(actorUserId, projectId, "inflight", inFlightRef.current);
    }
    replaceItems(
      itemsRef.current.map((item) => ({
        ...item,
        expectedRevision: revisionById.get(item.id) ?? item.expectedRevision ?? null,
      })),
    );
  }, [actorUserId, projectId, replaceItems]);

  const flush = React.useCallback(async () => {
    if (!loaded || readOnly || flushingRef.current) return;
    let envelope = inFlightRef.current;
    if (!envelope) {
      const operations = coalesceProjectFreeBoardOperations(pendingRef.current).slice(0, 100);
      if (!operations.length) {
        setSaveState("saved");
        return;
      }
      const sentIds = new Set(operations.map((operation) => operation.op === "UPSERT" ? operation.item.id : operation.itemId));
      pendingRef.current = pendingRef.current.filter((operation) => {
        const id = operation.op === "UPSERT" ? operation.item.id : operation.itemId;
        return !sentIds.has(id);
      });
      persistPending();
      envelope = { mutationId: crypto.randomUUID(), operations };
      inFlightRef.current = envelope;
      saveEnvelope(actorUserId, projectId, "inflight", envelope);
    }

    flushingRef.current = true;
    setSaveState("saving");
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/workspace/items/batch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(envelope),
      });
      if (response.status === 409 && conflictRetriesRef.current < 2) {
        conflictRetriesRef.current += 1;
        await refreshCanonicalRevisions();
        flushingRef.current = false;
        window.setTimeout(() => void flush(), 80);
        return;
      }
      const body = (await response.json().catch(() => null)) as BatchResponse | { error?: { message?: string } } | null;
      if (!response.ok || !body || !("result" in body)) {
        const errorMessage = body && "error" in body ? body.error?.message : null;
        throw new Error(errorMessage || "Не удалось сохранить доску");
      }

      conflictRetriesRef.current = 0;
      const revisionById = new Map(body.result.changedItems.map((item) => [item.id, item.revision]));
      for (const [itemId, revision] of Object.entries(body.result.deletedRevisions ?? {})) {
        revisionById.set(itemId, revision);
        deletedRevisionByIdRef.current.set(itemId, revision);
      }
      const deletedIds = new Set(body.result.deletedIds);
      const pendingUpserts = new Set(
        pendingRef.current.flatMap((operation) => operation.op === "UPSERT" ? [operation.item.id] : []),
      );
      replaceItems(
        itemsRef.current
          .filter((item) => !deletedIds.has(item.id) || pendingUpserts.has(item.id))
          .map((item) => {
            const revision = revisionById.get(item.id);
            return revision == null ? item : { ...item, expectedRevision: revision };
          }),
      );
      pendingRef.current = pendingRef.current.map((operation) => withExpectedRevision(operation, revisionById));
      inFlightRef.current = null;
      saveEnvelope(actorUserId, projectId, "inflight", null);
      persistPending();
      setSaveState(pendingRef.current.length ? "saving" : "saved");
    } catch (error) {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      setSaveState(offline ? "offline" : "error");
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить доску");
    } finally {
      flushingRef.current = false;
      if (aliveRef.current && !inFlightRef.current && pendingRef.current.length) {
        window.setTimeout(() => void flush(), 120);
      }
    }
  }, [actorUserId, loaded, persistPending, projectId, readOnly, refreshCanonicalRevisions, replaceItems]);

  const scheduleFlush = React.useCallback((delay = 450) => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => void flush(), delay);
  }, [flush]);

  const enqueue = React.useCallback((operation: ProjectFreeBoardOperation, delay = 450) => {
    pendingRef.current = coalesceProjectFreeBoardOperations([...pendingRef.current, operation]);
    persistPending();
    setSaveState("saving");
    scheduleFlush(delay);
  }, [persistPending, scheduleFlush]);

  const enqueueMany = React.useCallback((operations: readonly ProjectFreeBoardOperation[], delay = 80) => {
    if (!operations.length) return;
    pendingRef.current = coalesceProjectFreeBoardOperations([...pendingRef.current, ...operations]);
    persistPending();
    setSaveState("saving");
    scheduleFlush(delay);
  }, [persistPending, scheduleFlush]);

  React.useEffect(() => {
    aliveRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/workspace/items`, { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as BoardResponse | null;
        if (!response.ok || !body?.board) throw new Error("Не удалось загрузить доску проекта");
        const canonical = body.board.items.map(itemDtoToInput);
        const [storedInFlight, storedPending] = await Promise.all([
          readProjectBoardRecovery(storageKey(actorUserId, projectId, "inflight")),
          readProjectBoardRecovery(storageKey(actorUserId, projectId, "pending")),
        ]);
        inFlightRef.current = storedInFlight;
        pendingRef.current = storedPending?.operations ?? [];
        const optimistic = applyOptimisticOperations(
          applyOptimisticOperations(canonical, storedInFlight?.operations ?? []),
          pendingRef.current,
        );
        if (cancelled) return;
        replaceItems(optimistic);
        setServerReadOnly(body.board.readOnly);
        setLinkables(body.board.linkables ?? EMPTY_LINKABLES);
        undoRef.current = [];
        redoRef.current = [];
        setHistoryVersion((value) => value + 1);
        setLoaded(true);
        if (body.board.invalidItemIds.length) {
          setMessage("Некоторые старые элементы скрыты: их данные требуют восстановления.");
          setSaveState("error");
        } else if (storedInFlight || pendingRef.current.length) {
          setSaveState("saving");
        } else {
          setSaveState("saved");
        }
      } catch (error) {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : "Не удалось загрузить доску");
        setSaveState("error");
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
      aliveRef.current = false;
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, [actorUserId, projectId, replaceItems]);

  React.useEffect(() => {
    if (!loaded || (!inFlightRef.current && !pendingRef.current.length)) return;
    void flush();
  }, [flush, loaded]);

  React.useEffect(() => {
    const retry = () => void flush();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [flush]);

  React.useEffect(() => {
    const warnAboutPendingChanges = (event: BeforeUnloadEvent) => {
      if (!inFlightRef.current && !pendingRef.current.length) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnAboutPendingChanges);
    return () => window.removeEventListener("beforeunload", warnAboutPendingChanges);
  }, []);

  const updateItem = React.useCallback((itemId: string, updater: (item: ProjectFreeBoardItemInput) => ProjectFreeBoardItemInput, delay = 450) => {
    const current = itemsRef.current.find((item) => item.id === itemId);
    if (!current) return;
    const nextItem = updater(current);
    pushHistory(`edit:${itemId}`);
    replaceItems(itemsRef.current.map((item) => item.id === itemId ? nextItem : item));
    const parsed = ProjectFreeBoardItemInputSchema.safeParse(nextItem);
    if (!parsed.success) {
      setSaveState("invalid");
      setMessage(nextItem.type === "LINK" ? "Проверьте адрес ссылки" : "Проверьте содержимое блока");
      return;
    }
    enqueue({ op: "UPSERT", item: parsed.data }, delay);
  }, [enqueue, pushHistory, replaceItems]);

  const addItem = React.useCallback((type: BasicItemType, insertAt?: BoardInsertPoint | null) => {
    if (readOnly) return;
    if (itemsRef.current.length >= PROJECT_FREE_BOARD_MAX_ITEMS) {
      setMessage(`На доске может быть не более ${PROJECT_FREE_BOARD_MAX_ITEMS} блоков`);
      setSaveState("invalid");
      return;
    }
    pushHistory(`add:${type}`, true);
    const draft = createProjectFreeBoardItem(type, insertAt ?? nextPosition(itemsRef.current));
    const item = insertAt
      ? { ...draft, x: Math.max(0, Math.min(PROJECT_FREE_BOARD_COLUMNS - draft.width, insertAt.x)), y: Math.max(0, Math.min(999, insertAt.y)) }
      : draft;
    replaceItems([...itemsRef.current, item]);
    enqueue({ op: "UPSERT", item }, 80);
    setContextMenu(null);
  }, [enqueue, pushHistory, readOnly, replaceItems]);

  const addLinkedItem = React.useCallback((type: ProjectFreeBoardLinkedItemType, linkable: ProjectFreeBoardLinkable) => {
    if (readOnly) return;
    if (itemsRef.current.length >= PROJECT_FREE_BOARD_MAX_ITEMS) {
      setMessage(`На доске может быть не более ${PROJECT_FREE_BOARD_MAX_ITEMS} блоков`);
      setSaveState("invalid");
      return;
    }
    const alreadyLinked = itemsRef.current.some((item) => {
      if (type === "TASK") return item.type === type && item.linkedTaskId === linkable.id;
      if (type === "ORDER") return item.type === type && item.linkedOrderId === linkable.id;
      if (type === "FILE") return item.type === type && item.linkedFileId === linkable.id;
      return item.type === type && item.linkedSectionId === linkable.id;
    });
    if (alreadyLinked) {
      setMessage("Эта карточка уже есть на доске");
      setSaveState("invalid");
      return;
    }
    pushHistory(`link:${type}`, true);
    const draft = createProjectFreeBoardLinkedItem(type, linkable, linkInsertAt ?? nextPosition(itemsRef.current));
    const item = linkInsertAt
      ? { ...draft, x: Math.max(0, Math.min(PROJECT_FREE_BOARD_COLUMNS - draft.width, linkInsertAt.x)), y: Math.max(0, Math.min(999, linkInsertAt.y)) }
      : draft;
    replaceItems([...itemsRef.current, item]);
    enqueue({ op: "UPSERT", item }, 80);
    setLinkPickerType(null);
    setLinkQuery("");
    setLinkInsertAt(null);
  }, [enqueue, linkInsertAt, pushHistory, readOnly, replaceItems]);

  const toggleSelection = React.useCallback((itemId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const groupSelectedItems = React.useCallback(() => {
    if (readOnly) return;
    const selected = itemsRef.current.filter((item) => item.type !== "GROUP" && item.type !== "CONNECTOR" && selectedIds.has(item.id));
    if (selected.length < 2) {
      setMessage("Выберите минимум два блока");
      setSaveState("invalid");
      return;
    }
    if (selected.length > 50) {
      setMessage("В одной группе может быть не более 50 блоков");
      setSaveState("invalid");
      return;
    }
    if (itemsRef.current.length >= PROJECT_FREE_BOARD_MAX_ITEMS) {
      setMessage(`На доске может быть не более ${PROJECT_FREE_BOARD_MAX_ITEMS} блоков`);
      setSaveState("invalid");
      return;
    }

    pushHistory("group:create", true);
    const selectedIdSet = new Set(selected.map((item) => item.id));
    const operations: ProjectFreeBoardOperation[] = [];
    let nextItems = itemsRef.current.reduce<ProjectFreeBoardItemInput[]>((result, item) => {
      if (item.type !== "GROUP") return [...result, item];
      const itemIds = item.payload.itemIds.filter((itemId) => !selectedIdSet.has(itemId));
      if (itemIds.length === item.payload.itemIds.length) return [...result, item];
      if (itemIds.length < 2) {
        operations.push({ op: "DELETE", itemId: item.id, expectedRevision: item.expectedRevision ?? null });
        return result;
      }
      const nextGroup: ProjectFreeBoardItemInput = { ...item, payload: { ...item.payload, itemIds } };
      operations.push({ op: "UPSERT", item: nextGroup });
      return [...result, nextGroup];
    }, []);
    const group = createProjectFreeBoardGroup(selected, nextPosition(nextItems));
    nextItems = [...nextItems, group];
    operations.push({ op: "UPSERT", item: group });
    replaceItems(nextItems);
    enqueueMany(operations, 80);
    setSelectedIds(new Set());
  }, [enqueueMany, pushHistory, readOnly, replaceItems, selectedIds]);

  const addConnector = React.useCallback((
    sourceId: string,
    targetId: string,
    sourcePort: ProjectFreeBoardPort = "RIGHT",
    targetPort: ProjectFreeBoardPort = "LEFT",
  ) => {
    if (readOnly) return;
    const alreadyExists = itemsRef.current.some((item) => item.type === "CONNECTOR" && (
      (item.payload.sourceId === sourceId && item.payload.targetId === targetId)
      || (item.payload.sourceId === targetId && item.payload.targetId === sourceId)
    ));
    if (alreadyExists) {
      setMessage("Эти блоки уже соединены");
      setSaveState("invalid");
      return;
    }
    if (itemsRef.current.length >= PROJECT_FREE_BOARD_MAX_ITEMS) return;
    pushHistory("connector:create", true);
    const connector = createProjectFreeBoardConnector(sourceId, targetId, sourcePort, targetPort);
    replaceItems([...itemsRef.current, connector]);
    enqueue({ op: "UPSERT", item: connector }, 80);
    setSelectedIds(new Set());
    setSelectedConnectorId(connector.id);
  }, [enqueue, pushHistory, readOnly, replaceItems]);

  const connectSelectedItems = React.useCallback(() => {
    const selected = itemsRef.current.filter((item) => item.type !== "GROUP" && item.type !== "CONNECTOR" && selectedIds.has(item.id));
    if (selected.length !== 2) {
      setMessage("Для связи выберите ровно два блока через Shift + клик");
      setSaveState("invalid");
      return;
    }
    const [source, target] = selected;
    if (!source || !target) return;
    addConnector(source.id, target.id);
  }, [addConnector, selectedIds]);

  const deleteItem = React.useCallback((item: ProjectFreeBoardItemInput) => {
    if (readOnly) return;
    pushHistory(`delete:${item.id}`, true);
    const operations: ProjectFreeBoardOperation[] = [
      { op: "DELETE", itemId: item.id, expectedRevision: item.expectedRevision ?? null },
    ];
    let nextItems = itemsRef.current.filter((candidate) => candidate.id !== item.id);
    if (item.type !== "GROUP" && item.type !== "CONNECTOR") {
      nextItems = nextItems.flatMap((candidate) => {
        if (candidate.type === "CONNECTOR" && (candidate.payload.sourceId === item.id || candidate.payload.targetId === item.id)) {
          operations.push({ op: "DELETE", itemId: candidate.id, expectedRevision: candidate.expectedRevision ?? null });
          return [];
        }
        if (candidate.type !== "GROUP" || !candidate.payload.itemIds.includes(item.id)) return [candidate];
        const itemIds = candidate.payload.itemIds.filter((itemId) => itemId !== item.id);
        if (itemIds.length < 2) {
          operations.push({ op: "DELETE", itemId: candidate.id, expectedRevision: candidate.expectedRevision ?? null });
          return [];
        }
        const nextGroup: ProjectFreeBoardItemInput = {
          ...candidate,
          payload: { ...candidate.payload, itemIds },
        };
        operations.push({ op: "UPSERT", item: nextGroup });
        return [nextGroup];
      });
    }
    replaceItems(nextItems);
    enqueueMany(operations, 80);
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(item.id);
      for (const operation of operations) {
        if (operation.op === "DELETE") next.delete(operation.itemId);
      }
      return next;
    });
    setSelectedConnectorId((current) => operations.some((operation) => operation.op === "DELETE" && operation.itemId === current) ? null : current);
  }, [enqueueMany, pushHistory, readOnly, replaceItems]);

  const duplicateItem = React.useCallback((item: ProjectFreeBoardItemInput) => {
    if (readOnly || item.type === "GROUP" || item.type === "CONNECTOR" || itemsRef.current.length >= PROJECT_FREE_BOARD_MAX_ITEMS) return;
    pushHistory(`duplicate:${item.id}`, true);
    const x = Math.min(PROJECT_FREE_BOARD_COLUMNS - item.width, item.x + 1);
    const clone = duplicateProjectFreeBoardItem(item, { x: Math.max(0, x), y: Math.min(999, item.y + 1) });
    replaceItems([...itemsRef.current, clone]);
    enqueue({ op: "UPSERT", item: clone }, 80);
  }, [enqueue, pushHistory, readOnly, replaceItems]);

  const restoreSnapshot = React.useCallback((target: ProjectFreeBoardItemInput[], destination: React.MutableRefObject<ProjectFreeBoardItemInput[][]>) => {
    const current = cloneProjectFreeBoardItems(itemsRef.current);
    const operations = projectFreeBoardOperationsForSnapshot(
      current,
      target,
      deletedRevisionByIdRef.current,
    );
    if (!operations.length) return;
    destination.current = [...destination.current.slice(-49), current];
    const restored = applyOptimisticOperations(current, operations);
    replaceItems(restored);
    enqueueMany(operations, 80);
    lastHistoryCaptureRef.current = null;
    setHistoryVersion((value) => value + 1);
  }, [enqueueMany, replaceItems]);

  const undo = React.useCallback(() => {
    if (readOnly) return;
    const target = undoRef.current.pop();
    if (!target) return;
    restoreSnapshot(target, redoRef);
  }, [readOnly, restoreSnapshot]);

  const redo = React.useCallback(() => {
    if (readOnly) return;
    const target = redoRef.current.pop();
    if (!target) return;
    restoreSnapshot(target, undoRef);
  }, [readOnly, restoreSnapshot]);

  React.useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (readOnly || event.altKey || (!event.ctrlKey && !event.metaKey)) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || (target instanceof HTMLElement && target.isContentEditable)
      ) return;
      if (event.key.toLocaleLowerCase("ru-RU") !== "z") return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, [readOnly, redo, undo]);

  const resetViewport = React.useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  React.useEffect(() => {
    const isBoardFocused = () => {
      const activeElement = document.activeElement;
      return Boolean(viewportRef.current && activeElement && viewportRef.current.contains(activeElement));
    };
    const isEditableTarget = (target: EventTarget | null) => target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement
      || (target instanceof HTMLElement && target.isContentEditable);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isBoardFocused() || isEditableTarget(event.target)) return;
      if (event.key === "Escape") {
        setContextMenu(null);
        setLinkPickerType(null);
        setLinkInsertAt(null);
      }
      if (event.code === "Space") {
        event.preventDefault();
        setSpacePressed(true);
      }
      if (event.key === "Home") {
        event.preventDefault();
        resetViewport();
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePressed(false);
    };
    const handleBlur = () => setSpacePressed(false);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [resetViewport]);

  const changeZoom = React.useCallback((direction: -1 | 1) => {
    setZoom((current) => Math.max(0.45, Math.min(1.5, Number((current + direction * 0.1).toFixed(2)))));
  }, []);

  const handleViewportPointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    viewportRef.current?.focus({ preventScroll: true });
    const target = event.target as HTMLElement;
    const isInteractive = Boolean(target.closest("[data-board-item], button, input, textarea, select, a, label"));
    const wantsPan = event.button === 1 || (event.button === 0 && (spacePressed || !isInteractive));
    if (wantsPan) {
      setContextMenu(null);
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsPanning(true);
      panGestureRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      return;
    }
    if (readOnly || event.button !== 2 || isInteractive) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const startX = (event.clientX - rect.left - pan.x) / zoom;
    const startY = (event.clientY - rect.top - pan.y) / zoom;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    selectionGestureRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      additive: event.shiftKey || event.metaKey,
      moved: false,
    };
    setContextMenu(null);
  }, [pan.x, pan.y, readOnly, spacePressed, zoom]);

  const handleViewportPointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = panGestureRef.current;
    if (gesture && gesture.pointerId === event.pointerId) {
      setPan({
        x: gesture.panX + event.clientX - gesture.startX,
        y: gesture.panY + event.clientY - gesture.startY,
      });
      return;
    }
    const selection = selectionGestureRef.current;
    if (!selection || selection.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    selection.currentX = (event.clientX - rect.left - pan.x) / zoom;
    selection.currentY = (event.clientY - rect.top - pan.y) / zoom;
    const distance = Math.hypot(event.clientX - selection.startClientX, event.clientY - selection.startClientY);
    if (!selection.moved && distance >= 6) {
      selection.moved = true;
      if (!selection.additive) setSelectedIds(new Set());
      setSelectedConnectorId(null);
    }
    if (!selection.moved) return;
    setSelectionBox({
      left: Math.min(selection.startX, selection.currentX),
      top: Math.min(selection.startY, selection.currentY),
      width: Math.abs(selection.currentX - selection.startX),
      height: Math.abs(selection.currentY - selection.startY),
    });
  }, [pan.x, pan.y, zoom]);

  const endViewportPan = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (panGestureRef.current?.pointerId === event.pointerId) {
      panGestureRef.current = null;
      setIsPanning(false);
    }
    const selection = selectionGestureRef.current;
    if (selection?.pointerId === event.pointerId) {
      selectionGestureRef.current = null;
      if (!selection.moved) {
        const rect = event.currentTarget.getBoundingClientRect();
        const gridMargin = 10;
        const gridPadding = 2;
        const canvasWidth = Math.max(3600, width);
        const columnWidth = (canvasWidth - gridPadding * 2 - gridMargin * (PROJECT_FREE_BOARD_COLUMNS - 1)) / PROJECT_FREE_BOARD_COLUMNS;
        const columnStep = columnWidth + gridMargin;
        const rowStep = 36;
        setContextMenu({
          left: Math.max(10, Math.min(rect.width - 226, event.clientX - rect.left)),
          top: Math.max(10, Math.min(rect.height - 238, event.clientY - rect.top)),
          insertAt: {
            x: Math.max(0, Math.min(PROJECT_FREE_BOARD_COLUMNS - 2, Math.floor((selection.startX - gridPadding) / columnStep))),
            y: Math.max(0, Math.min(999, Math.floor((selection.startY - gridPadding) / rowStep))),
          },
        });
        setSelectionBox(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        return;
      }
      const left = Math.min(selection.startX, selection.currentX);
      const top = Math.min(selection.startY, selection.currentY);
      const right = Math.max(selection.startX, selection.currentX);
      const bottom = Math.max(selection.startY, selection.currentY);
      const gridMargin = 10;
      const gridPadding = 2;
      const canvasWidth = Math.max(3600, width);
      const columnWidth = (canvasWidth - gridPadding * 2 - gridMargin * (PROJECT_FREE_BOARD_COLUMNS - 1)) / PROJECT_FREE_BOARD_COLUMNS;
      const matches = itemsRef.current.filter((item) => {
        if (item.type === "CONNECTOR") return false;
        const itemLeft = gridPadding + item.x * (columnWidth + gridMargin);
        const itemTop = gridPadding + item.y * 36;
        const itemRight = itemLeft + item.width * columnWidth + (item.width - 1) * gridMargin;
        const itemBottom = itemTop + item.height * 26 + (item.height - 1) * gridMargin;
        return itemRight >= left && itemLeft <= right && itemBottom >= top && itemTop <= bottom;
      });
      setSelectedIds((current) => {
        const next = selection.additive ? new Set(current) : new Set<string>();
        matches.forEach((item) => next.add(item.id));
        return next;
      });
      setSelectionBox(null);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, [width]);

  const handleViewportWheel = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    setZoom((current) => Math.max(0.45, Math.min(1.5, Number((current + direction * 0.08).toFixed(2)))));
  }, []);

  const beginConnectorDrag = React.useCallback((
    event: React.PointerEvent<HTMLButtonElement>,
    sourceId: string,
    sourcePort: ProjectFreeBoardPort,
  ) => {
    if (readOnly || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const viewport = viewportRef.current;
    if (!viewport) return;

    const toCanvasPoint = (clientX: number, clientY: number) => {
      const rect = viewport.getBoundingClientRect();
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    };
    setConnectorDraft({ sourceId, sourcePort, pointer: toCanvasPoint(event.clientX, event.clientY) });

    const move = (moveEvent: PointerEvent) => {
      setConnectorDraft((current) => current && current.sourceId === sourceId
        ? { ...current, pointer: toCanvasPoint(moveEvent.clientX, moveEvent.clientY) }
        : current);
    };
    const finish = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      setConnectorDraft(null);
      if (upEvent.type === "pointercancel") return;
      const targetElement = document.elementFromPoint(upEvent.clientX, upEvent.clientY)
        ?.closest<HTMLElement>("[data-board-item-id]");
      const targetId = targetElement?.dataset.boardItemId;
      if (!targetElement || !targetId || targetId === sourceId) return;
      const rect = targetElement.getBoundingClientRect();
      const distances: Array<[ProjectFreeBoardPort, number]> = [
        ["TOP", Math.abs(upEvent.clientY - rect.top)],
        ["RIGHT", Math.abs(upEvent.clientX - rect.right)],
        ["BOTTOM", Math.abs(upEvent.clientY - rect.bottom)],
        ["LEFT", Math.abs(upEvent.clientX - rect.left)],
      ];
      distances.sort((left, right) => left[1] - right[1]);
      addConnector(sourceId, targetId, sourcePort, distances[0]?.[0] ?? "LEFT");
    };
    const cancel = (cancelEvent: PointerEvent) => finish(cancelEvent);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  }, [addConnector, pan.x, pan.y, readOnly, zoom]);

  const beginItemDrag = React.useCallback((
    event: React.PointerEvent<HTMLElement>,
    item: ProjectFreeBoardItemInput,
  ) => {
    if (readOnly || spacePressed || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, button, a, label, [data-no-drag], [contenteditable='true'], .react-resizable-handle")) return;
    event.preventDefault();
    viewportRef.current?.focus({ preventScroll: true });

    const originals = new Map(itemsRef.current.map((candidate) => [candidate.id, candidate]));
    const memberIds = item.type === "GROUP" ? new Set(item.payload.itemIds) : new Set<string>();
    if (selectedIds.has(item.id)) {
      selectedIds.forEach((itemId) => memberIds.add(itemId));
    }
    const dragGridMargin = 10;
    const dragGridPadding = 2;
    const dragCanvasWidth = Math.max(3600, width);
    const dragColumnWidth = (dragCanvasWidth - dragGridPadding * 2 - dragGridMargin * (PROJECT_FREE_BOARD_COLUMNS - 1)) / PROJECT_FREE_BOARD_COLUMNS;
    const dragColumnStep = dragColumnWidth + dragGridMargin;
    const dragRowStep = 36;
    const startX = event.clientX;
    const startY = event.clientY;
    let lastDeltaX = 0;
    let lastDeltaY = 0;
    let historyCaptured = false;
    setActiveItemId(item.id);

    const move = (moveEvent: PointerEvent) => {
      const deltaX = Math.round((moveEvent.clientX - startX) / zoom / dragColumnStep);
      const deltaY = Math.round((moveEvent.clientY - startY) / zoom / dragRowStep);
      if (deltaX === lastDeltaX && deltaY === lastDeltaY) return;
      if (!historyCaptured) {
        pushHistory(`move:${item.id}`, true);
        historyCaptured = true;
      }
      lastDeltaX = deltaX;
      lastDeltaY = deltaY;
      replaceItems(itemsRef.current.map((candidate) => {
        const original = originals.get(candidate.id);
        if (!original || (candidate.id !== item.id && !memberIds.has(candidate.id))) return candidate;
        return {
          ...candidate,
          x: Math.max(0, Math.min(PROJECT_FREE_BOARD_COLUMNS - candidate.width, original.x + deltaX)),
          y: Math.max(0, Math.min(999, original.y + deltaY)),
        };
      }));
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      setActiveItemId(null);
      if (!historyCaptured) return;
      const changed = itemsRef.current.filter((candidate) => {
        const original = originals.get(candidate.id);
        return original && (candidate.x !== original.x || candidate.y !== original.y);
      });
      enqueueMany(changed.map((candidate) => ({ op: "UPSERT" as const, item: candidate })), 80);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  }, [enqueueMany, pushHistory, readOnly, replaceItems, selectedIds, spacePressed, width, zoom]);

  const commitGeometry = React.useCallback((_layout: Layout, oldItem: LayoutItem | null, newItem: LayoutItem | null) => {
    if (!newItem) return;
    const current = itemsRef.current.find((item) => item.id === newItem.i);
    if (!current) return;
    pushHistory(`geometry:${newItem.i}`, true);

    const deltaX = oldItem ? newItem.x - oldItem.x : 0;
    const deltaY = oldItem ? newItem.y - oldItem.y : 0;
    const memberIds = current.type === "GROUP" ? new Set(current.payload.itemIds) : new Set<string>();
    const changedItems = itemsRef.current.flatMap((item) => {
      if (item.id === current.id) {
        return [{ ...item, x: newItem.x, y: newItem.y, width: newItem.w, height: newItem.h }];
      }
      if (!memberIds.has(item.id) || (!deltaX && !deltaY)) return [];
      return [{
        ...item,
        x: Math.max(0, Math.min(PROJECT_FREE_BOARD_COLUMNS - item.width, item.x + deltaX)),
        y: Math.max(0, Math.min(999, item.y + deltaY)),
      }];
    });
    const changedById = new Map(changedItems.map((item) => [item.id, item]));
    const nextItems = itemsRef.current.map((item) => changedById.get(item.id) ?? item);
    const parsed = changedItems.map((item) => ProjectFreeBoardItemInputSchema.parse(item));
    replaceItems(nextItems);
    enqueueMany(parsed.map((item) => ({ op: "UPSERT" as const, item })), 80);
  }, [enqueueMany, pushHistory, replaceItems]);

  const linkedSummary = (item: ProjectFreeBoardItemInput): ProjectFreeBoardLinkable | null => {
    if (item.type === "TASK") {
      return linkables.tasks.find((candidate) => candidate.id === item.linkedTaskId) ?? null;
    }
    if (item.type === "ORDER") {
      return linkables.orders.find((candidate) => candidate.id === item.linkedOrderId) ?? null;
    }
    if (item.type === "FILE") {
      return linkables.files.find((candidate) => candidate.id === item.linkedFileId) ?? null;
    }
    if (item.type === "ESTIMATE_SECTION") {
      return linkables.estimateSections.find((candidate) => candidate.id === item.linkedSectionId) ?? null;
    }
    return null;
  };

  const groupByMemberId = new Map<string, ProjectFreeBoardItemInput & { type: "GROUP" }>();
  for (const group of items) {
    if (group.type !== "GROUP") continue;
    for (const itemId of group.payload.itemIds) groupByMemberId.set(itemId, group);
  }

  const renderItem = (item: ProjectFreeBoardItemInput) => {
    if (item.type === "CONNECTOR") return null;
    const linked = linkedSummary(item);
    const memberGroup = groupByMemberId.get(item.id);
    const selected = selectedIds.has(item.id);
    return (
    <article
      key={item.id}
      data-board-item
      data-board-item-id={item.id}
      data-active={activeItemId === item.id || undefined}
      onPointerDown={(event) => beginItemDrag(event, item)}
      onClickCapture={(event) => {
        if (!event.shiftKey && !event.metaKey) return;
        const target = event.target as HTMLElement;
        if (target.closest("input, textarea, select, button, a, label, [contenteditable='true']")) return;
        event.preventDefault();
        event.stopPropagation();
        toggleSelection(item.id);
      }}
      className={`group relative flex h-full min-h-0 cursor-grab flex-col overflow-visible rounded-[8px] border shadow-[0_2px_7px_rgba(31,24,46,0.09)] transition-[box-shadow,border-color] active:cursor-grabbing ${selected ? "border-violet-600 ring-2 ring-violet-500/30" : ""} ${itemColor(item)}`}
    >
      {!readOnly ? PROJECT_FREE_BOARD_PORTS.map((port) => (
        <button
          key={port}
          type="button"
          data-no-drag
          data-board-port={port}
          onPointerDown={(event) => beginConnectorDrag(event, item.id, port)}
          className={`absolute z-30 h-3.5 w-3.5 rounded-full border-2 border-violet-500 bg-white opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${BOARD_PORT_POSITION[port]}`}
          aria-label={`Начать связь: ${port === "TOP" ? "сверху" : port === "RIGHT" ? "справа" : port === "BOTTOM" ? "снизу" : "слева"}`}
          title="Потяните к другому блоку"
        />
      )) : null}
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
            {item.type === "GROUP" ? "Группа" : ITEM_LABEL[item.type as BasicItemType] ?? LINKED_ITEM_LABEL[item.type as ProjectFreeBoardLinkedItemType] ?? "Связанный блок"}
          </span>
          {memberGroup ? (
            <span className="truncate rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-black text-violet-700">
              {memberGroup.payload.title || "Группа"}
            </span>
          ) : null}
        </div>
        {!readOnly ? (
          <div className="flex items-center gap-1">
            {item.type !== "GROUP" ? (
              <button data-no-drag type="button" onClick={() => duplicateItem(item)} className="rounded-md p-1.5 text-zinc-400 opacity-40 hover:bg-violet-100 hover:text-violet-700 group-hover:opacity-100 focus:opacity-100" aria-label="Дублировать блок">
                <Icon name="copy" />
              </button>
            ) : null}
            <button data-no-drag type="button" onClick={() => deleteItem(item)} className="rounded-md p-1.5 text-zinc-400 opacity-40 hover:bg-rose-100 hover:text-rose-700 group-hover:opacity-100 focus:opacity-100" aria-label={item.type === "GROUP" ? "Распустить группу" : "Удалить блок"}>
              <Icon name="trash" />
            </button>
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 px-3 pb-3 pt-1.5">
        {(item.type === "NOTE" || item.type === "STICKER") ? (
          <textarea
            value={item.payload.text}
            onChange={(event) => updateItem(item.id, (current) => current.type === item.type ? { ...current, payload: { ...current.payload, text: event.target.value } } : current)}
            readOnly={readOnly}
            aria-label={ITEM_LABEL[item.type]}
            className="h-full min-h-20 w-full resize-none bg-transparent text-sm font-medium leading-5 text-zinc-800 outline-none placeholder:text-zinc-400"
          />
        ) : null}
        {item.type === "HEADING" ? (
          <textarea
            value={item.payload.text}
            onChange={(event) => updateItem(item.id, (current) => current.type === "HEADING" ? { ...current, payload: { ...current.payload, text: event.target.value } } : current)}
            readOnly={readOnly}
            aria-label="Текстовый блок"
            placeholder="Введите текст"
            className="h-full min-h-10 w-full resize-none bg-transparent text-base font-semibold leading-6 text-zinc-950 outline-none placeholder:text-zinc-400"
          />
        ) : null}
        {item.type === "LINK" ? (
          <div className="grid gap-2">
            <input
              value={item.payload.label ?? ""}
              onChange={(event) => updateItem(item.id, (current) => current.type === "LINK" ? { ...current, payload: { ...current.payload, label: event.target.value } } : current)}
              readOnly={readOnly}
              placeholder="Название ссылки"
              className="w-full bg-transparent text-base font-bold text-zinc-900 outline-none placeholder:text-zinc-400"
            />
            <input
              value={item.payload.url}
              onChange={(event) => updateItem(item.id, (current) => current.type === "LINK" ? { ...current, payload: { ...current.payload, url: event.target.value } } : current)}
              readOnly={readOnly}
              placeholder="https://"
              inputMode="url"
              className="w-full rounded-lg border border-black/10 bg-white/70 px-2.5 py-2 text-sm text-sky-800 outline-none focus:border-sky-400"
            />
          </div>
        ) : null}
        {item.type === "CHECKLIST" ? (
          <div className="flex h-full min-h-0 flex-col">
            <input
              value={item.payload.title ?? ""}
              onChange={(event) => updateItem(item.id, (current) => current.type === "CHECKLIST" ? { ...current, payload: { ...current.payload, title: event.target.value } } : current)}
              readOnly={readOnly}
              placeholder="Название списка"
              className="w-full bg-transparent text-base font-black text-zinc-900 outline-none placeholder:text-zinc-400"
            />
            <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {item.payload.items.map((entry) => (
                <label key={entry.id} className="flex items-start gap-2 rounded-lg px-1 py-1 text-sm text-zinc-700 hover:bg-white/55">
                  <input
                    type="checkbox"
                    checked={entry.isDone}
                    disabled={readOnly}
                    onChange={(event) => updateItem(item.id, (current) => current.type === "CHECKLIST" ? {
                      ...current,
                      payload: { ...current.payload, items: current.payload.items.map((row) => row.id === entry.id ? { ...row, isDone: event.target.checked } : row) },
                    } : current, 120)}
                    className="mt-0.5 h-4 w-4 accent-violet-700"
                  />
                  <span className={entry.isDone ? "line-through opacity-55" : ""}>{entry.text}</span>
                </label>
              ))}
            </div>
            {!readOnly && item.payload.items.length < 50 ? (
              <button
                type="button"
                onClick={() => updateItem(item.id, (current) => current.type === "CHECKLIST" ? {
                  ...current,
                  payload: { ...current.payload, items: [...current.payload.items, { id: crypto.randomUUID(), text: "Новый пункт", isDone: false }] },
                } : current, 100)}
                className="mt-2 inline-flex w-fit items-center gap-1 text-xs font-bold text-violet-700 hover:text-violet-950"
              >
                <Icon name="plus" /> Добавить пункт
              </button>
            ) : null}
          </div>
        ) : null}
        {item.type === "GROUP" ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-start gap-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-600 text-white shadow-sm">
                <Icon name="GROUP" />
              </div>
              <div className="min-w-0 flex-1">
                <input
                  value={item.payload.title ?? ""}
                  onChange={(event) => updateItem(item.id, (current) => current.type === "GROUP" ? {
                    ...current,
                    payload: { ...current.payload, title: event.target.value },
                  } : current)}
                  readOnly={readOnly}
                  placeholder="Название группы"
                  className="w-full bg-transparent text-base font-black text-zinc-950 outline-none placeholder:text-zinc-400"
                />
                <div className="mt-0.5 text-xs font-bold text-zinc-500">{item.payload.itemIds.length} блоков · перемещаются вместе</div>
              </div>
            </div>
            <div className="mt-2 min-h-0 space-y-1 overflow-y-auto rounded-lg border border-violet-200/80 bg-white/60 p-2">
              {item.payload.itemIds.slice(0, 4).map((itemId) => {
                const member = itemsRef.current.find((candidate) => candidate.id === itemId);
                return (
                  <div key={itemId} className="truncate text-xs font-semibold text-zinc-600">
                    {member ? itemDisplayName(member) : "Удалённый блок"}
                  </div>
                );
              })}
              {item.payload.itemIds.length > 4 ? (
                <div className="text-[11px] font-black text-violet-700">Ещё {item.payload.itemIds.length - 4}</div>
              ) : null}
            </div>
          </div>
        ) : null}
        {(item.type === "TASK" || item.type === "ORDER" || item.type === "FILE" || item.type === "ESTIMATE_SECTION") ? (
          <div className="flex h-full min-h-0 flex-col justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-black/5 bg-white/75 text-violet-700 shadow-sm">
                <Icon name={item.type} />
              </div>
              <div className="min-w-0">
                <div className="line-clamp-2 text-base font-black leading-5 text-zinc-950">
                  {linked?.label ?? item.payload.label ?? "Связь недоступна"}
                </div>
                <div className="mt-1 line-clamp-2 text-xs font-medium leading-4 text-zinc-500">
                  {linked?.meta ?? "Связанная сущность была удалена или перемещена"}
                </div>
              </div>
            </div>
            {linked ? (
              <a
                href={linked.href}
                className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-black/10 bg-white/75 px-2.5 py-1.5 text-xs font-black text-zinc-700 shadow-sm hover:border-violet-300 hover:text-violet-800"
              >
                Открыть <span aria-hidden>↗</span>
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
    );
  };

  const stateLabel: Record<SaveState, string> = {
    idle: "",
    saving: "Сохраняем…",
    saved: "Все изменения сохранены",
    offline: "Нет сети — изменения сохранены на устройстве",
    error: message || "Не удалось сохранить",
    invalid: message || "Проверьте данные блока",
  };
  const canUndo = historyVersion >= 0 && undoRef.current.length > 0;
  const canRedo = historyVersion >= 0 && redoRef.current.length > 0;
  const activeLinkables = linkPickerType
    ? linkables[LINKABLE_COLLECTION[linkPickerType]].filter((item) => {
        const query = linkQuery.trim().toLocaleLowerCase("ru-RU");
        return !query || `${item.label} ${item.meta}`.toLocaleLowerCase("ru-RU").includes(query);
      })
    : [];
  const boardItems = items.filter((item) => item.type !== "CONNECTOR");
  const connectors = items.filter((item): item is BoardConnector => item.type === "CONNECTOR");
  const gridMargin = 10;
  const gridPadding = 2;
  const gridRowHeight = 26;
  const gridMaxRows = 68;
  const canvasWidth = Math.max(3600, width);
  const canvasHeight = gridPadding * 2 + gridMaxRows * gridRowHeight + (gridMaxRows - 1) * gridMargin;
  const gridColumnWidth = (canvasWidth - gridPadding * 2 - gridMargin * (PROJECT_FREE_BOARD_COLUMNS - 1)) / PROJECT_FREE_BOARD_COLUMNS;
  const itemRect = (item: ProjectFreeBoardItemInput) => ({
    x: gridPadding + item.x * (gridColumnWidth + gridMargin),
    y: gridPadding + item.y * (gridRowHeight + gridMargin),
    width: item.width * gridColumnWidth + (item.width - 1) * gridMargin,
    height: item.height * gridRowHeight + (item.height - 1) * gridMargin,
  });
  const portPoint = (rect: ReturnType<typeof itemRect>, port: ProjectFreeBoardPort) => {
    if (port === "TOP") return { x: rect.x + rect.width / 2, y: rect.y };
    if (port === "RIGHT") return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
    if (port === "BOTTOM") return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
    return { x: rect.x, y: rect.y + rect.height / 2 };
  };
  const portVector = (port: ProjectFreeBoardPort) => {
    if (port === "TOP") return { x: 0, y: -1 };
    if (port === "RIGHT") return { x: 1, y: 0 };
    if (port === "BOTTOM") return { x: 0, y: 1 };
    return { x: -1, y: 0 };
  };
  const bezierPath = (
    start: { x: number; y: number },
    end: { x: number; y: number },
    sourcePort: ProjectFreeBoardPort,
    targetPort: ProjectFreeBoardPort,
  ) => {
    const bend = Math.max(58, Math.min(220, Math.hypot(end.x - start.x, end.y - start.y) * 0.42));
    const sourceVector = portVector(sourcePort);
    const targetVector = portVector(targetPort);
    return `M ${start.x} ${start.y} C ${start.x + sourceVector.x * bend} ${start.y + sourceVector.y * bend}, ${end.x + targetVector.x * bend} ${end.y + targetVector.y * bend}, ${end.x} ${end.y}`;
  };
  const connectionPath = (connector: BoardConnector) => {
    const source = boardItems.find((item) => item.id === connector.payload.sourceId);
    const target = boardItems.find((item) => item.id === connector.payload.targetId);
    if (!source || !target) return null;
    const sourceRect = itemRect(source);
    const targetRect = itemRect(target);
    const sourcePort = connector.payload.sourcePort ?? "RIGHT";
    const targetPort = connector.payload.targetPort ?? "LEFT";
    return bezierPath(portPoint(sourceRect, sourcePort), portPoint(targetRect, targetPort), sourcePort, targetPort);
  };
  const draftPath = (() => {
    if (!connectorDraft) return null;
    const source = boardItems.find((item) => item.id === connectorDraft.sourceId);
    if (!source) return null;
    return bezierPath(
      portPoint(itemRect(source), connectorDraft.sourcePort),
      connectorDraft.pointer,
      connectorDraft.sourcePort,
      connectorDraft.sourcePort === "RIGHT" ? "LEFT" : connectorDraft.sourcePort === "LEFT" ? "RIGHT" : connectorDraft.sourcePort === "TOP" ? "BOTTOM" : "TOP",
    );
  })();
  const selectedConnector = selectedConnectorId
    ? connectors.find((connector) => connector.id === selectedConnectorId) ?? null
    : null;

  return (
    <section
      className="project-free-board relative overflow-hidden bg-[#f7f5fb]"
      data-has-selection={selectedIds.size ? "true" : undefined}
      data-connector-selected={selectedConnector ? "true" : undefined}
      onKeyDown={(event) => {
        if (!selectedConnector || readOnly || (event.key !== "Delete" && event.key !== "Backspace")) return;
        const target = event.target as HTMLElement;
        if (target.matches("input, textarea, select, [contenteditable='true']")) return;
        event.preventDefault();
        deleteItem(selectedConnector);
      }}
    >
      <header className="project-free-board__toolbar" aria-label="Инструменты свободной доски">
        <div className="sr-only">
          <div className="text-sm font-extrabold tracking-tight text-zinc-900">Рабочее полотно</div>
          <p className="mt-0.5 text-xs text-zinc-500">ЛКМ по фону — двигать поле · ПКМ — добавить · ПКМ с движением — выделить · Ctrl + колесо — масштаб</p>
        </div>
        <div className="project-free-board__toolrail-inner">
          {!readOnly && selectedIds.size ? (
            <div className="project-free-board__selection-actions">
              <span className="px-2 text-xs font-black text-violet-800">Выбрано: {selectedIds.size}</span>
              <button
                type="button"
                onClick={groupSelectedItems}
                disabled={selectedIds.size < 2}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-violet-700 px-2.5 text-xs font-black text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Icon name="GROUP" /> Сгруппировать
              </button>
              <button
                type="button"
                onClick={connectSelectedItems}
                disabled={selectedIds.size !== 2}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 text-xs font-black text-violet-800 hover:border-violet-400 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Icon name="connect" /> Соединить
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="min-h-8 rounded-lg px-2 text-xs font-black text-zinc-500 hover:bg-white hover:text-zinc-900"
              >
                Сбросить
              </button>
            </div>
          ) : null}
          {!readOnly ? (
            <div className="project-free-board__history-actions">
              <button type="button" onClick={undo} disabled={!canUndo} className="project-free-board__tool-button" aria-label="Отменить последнее действие" title="Отменить">
                <Icon name="undo" />
              </button>
              <button type="button" onClick={redo} disabled={!canRedo} className="project-free-board__tool-button" aria-label="Повторить отменённое действие" title="Повторить">
                <Icon name="redo" />
              </button>
            </div>
          ) : null}
          {!readOnly ? (Object.keys(ITEM_LABEL) as BasicItemType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => addItem(type)}
              className="project-free-board__tool-button"
              aria-label={ITEM_LABEL[type]}
              title={ITEM_LABEL[type]}
            >
              <Icon name={type} />
            </button>
          )) : null}
          {!readOnly ? (
            <button
              type="button"
              onClick={() => {
                setLinkInsertAt(null);
                setLinkPickerType((current) => current ? null : "TASK");
              }}
              className="project-free-board__tool-button"
              data-active={linkPickerType ? "true" : undefined}
              aria-label="Добавить объект проекта"
              title="Объект проекта"
            >
              <Icon name="link" />
            </button>
          ) : readOnly ? (
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-bold text-zinc-500">Только просмотр</span>
          ) : null}
        </div>
      </header>

      {linkPickerType && !readOnly ? (
        <div className="project-free-board__link-picker">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Тип связанного блока">
              {(Object.keys(LINKED_ITEM_LABEL) as ProjectFreeBoardLinkedItemType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  role="tab"
                  aria-selected={linkPickerType === type}
                  onClick={() => setLinkPickerType(type)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-black ${linkPickerType === type ? "bg-violet-700 text-white" : "bg-white text-zinc-600 hover:text-violet-800"}`}
                >
                  <Icon name={type} /> {LINKED_ITEM_LABEL[type]}
                </button>
              ))}
            </div>
            <input
              value={linkQuery}
              onChange={(event) => setLinkQuery(event.target.value)}
              placeholder="Найти в проекте…"
              className="min-h-10 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-medium text-zinc-800 outline-none focus:border-violet-500 sm:w-72"
            />
          </div>
          <div className="mt-3 grid max-h-52 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
            {activeLinkables.map((linkable) => (
              <button
                key={linkable.id}
                type="button"
                onClick={() => addLinkedItem(linkPickerType, linkable)}
                className="flex min-w-0 items-start gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-left shadow-sm hover:border-violet-300 hover:shadow-md"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700"><Icon name={linkPickerType} /></div>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-zinc-900">{linkable.label}</span>
                  <span className="mt-0.5 block truncate text-xs font-medium text-zinc-500">{linkable.meta}</span>
                </span>
              </button>
            ))}
            {!activeLinkables.length ? (
              <div className="rounded-xl border border-dashed border-zinc-300 bg-white/60 px-4 py-5 text-sm font-medium text-zinc-500 sm:col-span-2 lg:col-span-3">
                {linkQuery ? "Ничего не найдено" : `В проекте пока нет сущностей типа «${LINKED_ITEM_LABEL[linkPickerType]}»`}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="project-free-board__status">
        <div className="flex items-center gap-3">
          <span className="font-medium text-zinc-500">
            {boardItems.length} блоков
            {connectors.length ? ` · ${connectors.length} связ.` : ""}
          </span>
          {selectedConnector ? (
            <button type="button" onClick={() => deleteItem(selectedConnector)} className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-1 font-bold text-violet-800 hover:bg-rose-100 hover:text-rose-700">
              <Icon name="trash" /> Удалить выбранную связь
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {!mobile ? (
            <div className="flex items-center rounded-lg border border-zinc-200 bg-white p-0.5" aria-label="Масштаб доски">
              <button type="button" onClick={() => changeZoom(-1)} className="grid h-7 w-7 place-items-center rounded-md text-base font-semibold text-zinc-600 hover:bg-zinc-100" aria-label="Уменьшить масштаб">−</button>
              <button type="button" onClick={resetViewport} className="min-w-14 px-1.5 text-[11px] font-bold text-zinc-600 hover:text-violet-800" title="Вернуться к началу">{Math.round(zoom * 100)}%</button>
              <button type="button" onClick={() => changeZoom(1)} className="grid h-7 w-7 place-items-center rounded-md text-base font-semibold text-zinc-600 hover:bg-zinc-100" aria-label="Увеличить масштаб">+</button>
            </div>
          ) : null}
          <span className={saveState === "error" || saveState === "invalid" ? "font-bold text-rose-700" : saveState === "offline" ? "font-bold text-amber-700" : "font-medium text-zinc-500"} aria-live="polite">
            {stateLabel[saveState]}
          </span>
          {(saveState === "error" || saveState === "offline") ? (
            <button type="button" onClick={() => void flush()} className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 font-bold text-zinc-700 hover:border-violet-300 hover:text-violet-800">
              <Icon name="retry" /> Повторить
            </button>
          ) : null}
        </div>
      </div>

      {!loaded ? (
        <div className="grid min-h-72 place-items-center px-4 py-12 text-sm font-semibold text-zinc-500">Готовим рабочее пространство…</div>
      ) : mobile ? (
        <div className="grid gap-3 p-3">{boardItems.length ? boardItems.map(renderItem) : <div className="p-8 text-center text-sm font-medium text-zinc-500">Добавьте первый блок кнопкой выше.</div>}</div>
      ) : (
        <div ref={containerRef} className="relative">
          <div
            ref={viewportRef}
            tabIndex={0}
            className={`project-free-board-viewport relative h-[70dvh] min-h-[620px] max-h-[900px] touch-none overflow-hidden outline-none ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
            onPointerDown={handleViewportPointerDown}
            onPointerMove={handleViewportPointerMove}
            onPointerUp={endViewportPan}
            onPointerCancel={endViewportPan}
            onWheel={handleViewportWheel}
            onContextMenu={(event) => event.preventDefault()}
          >
            {mounted ? (
              <div
                className="project-free-board-canvas absolute left-0 top-0"
                style={{
                  width: canvasWidth,
                  height: canvasHeight,
                  transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                  transformOrigin: "0 0",
                }}
              >
                {selectionBox ? (
                  <div
                    className="project-free-board__selection-box pointer-events-none absolute z-[30]"
                    style={{ left: selectionBox.left, top: selectionBox.top, width: selectionBox.width, height: selectionBox.height }}
                    aria-hidden
                  />
                ) : null}
                <svg className="pointer-events-none absolute inset-0 z-[4] overflow-visible" width={canvasWidth} height={canvasHeight} aria-label="Связи между блоками">
                  <defs>
                    <marker id={`project-board-arrow-${projectId}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
                      <path d="M0,0 L0,6 L7,3 z" fill="#7c3aed" />
                    </marker>
                  </defs>
                  {connectors.map((connector) => {
                    const path = connectionPath(connector);
                    if (!path) return null;
                    const isSelected = selectedConnectorId === connector.id;
                    return (
                      <g key={connector.id}>
                        <path
                          d={path}
                          fill="none"
                          stroke="transparent"
                          strokeWidth="18"
                          className="project-free-board-connector pointer-events-auto cursor-pointer"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedIds(new Set());
                            setSelectedConnectorId((current) => current === connector.id ? null : connector.id);
                          }}
                        />
                        <path
                          d={path}
                          fill="none"
                          stroke={isSelected ? "#5b21b6" : "#8b5cf6"}
                          strokeWidth={isSelected ? 3 : 2}
                          strokeLinecap="round"
                          markerEnd={`url(#project-board-arrow-${projectId})`}
                          className="project-free-board-connector pointer-events-none"
                        />
                      </g>
                    );
                  })}
                  {draftPath ? (
                    <path
                      d={draftPath}
                      fill="none"
                      stroke="#7c3aed"
                      strokeWidth="2.5"
                      strokeDasharray="7 5"
                      strokeLinecap="round"
                      markerEnd={`url(#project-board-arrow-${projectId})`}
                    />
                  ) : null}
                </svg>
                {boardItems.length ? (
                  <ReactGridLayout
                    width={canvasWidth}
                    layout={boardItems.map((item) => itemToLayout(item, readOnly))}
                    cols={PROJECT_FREE_BOARD_COLUMNS}
                    rowHeight={gridRowHeight}
                    margin={[gridMargin, gridMargin]}
                    containerPadding={[gridPadding, gridPadding]}
                    maxRows={gridMaxRows}
                    compactType={null}
                    allowOverlap
                    preventCollision={false}
                    isDraggable={false}
                    isResizable={!readOnly && !spacePressed}
                    resizeHandles={["se"]}
                    transformScale={zoom}
                    onResizeStart={(_layout, _oldItem, newItem) => setActiveItemId(newItem?.i ?? null)}
                    onResizeStop={(layout, oldItem, newItem) => {
                      commitGeometry(layout, oldItem, newItem);
                      setActiveItemId(null);
                    }}
                    style={{ height: canvasHeight }}
                  >
                    {boardItems.map(renderItem)}
                  </ReactGridLayout>
                ) : (
                  <div className="absolute left-10 top-10 z-[2] w-80 rounded-xl border border-dashed border-violet-300 bg-white/85 p-5 shadow-sm">
                    <div className="text-base font-extrabold text-zinc-900">Свободное поле готово</div>
                    <p className="mt-1 text-sm leading-5 text-zinc-500">Добавьте заметку, стикер, список или объект проекта кнопкой над полотном.</p>
                  </div>
                )}
              </div>
            ) : null}
            {contextMenu && !readOnly ? (
              <div
                className="project-free-board__context-menu"
                style={{ left: contextMenu.left, top: contextMenu.top }}
                role="menu"
                aria-label="Добавить блок в этой точке"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className="project-free-board__context-title">Добавить здесь</div>
                <div className="project-free-board__context-grid">
                  {(Object.keys(ITEM_LABEL) as BasicItemType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      role="menuitem"
                      onClick={() => addItem(type, contextMenu.insertAt)}
                    >
                      <Icon name={type} />
                      <span>{ITEM_LABEL[type]}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setLinkInsertAt(contextMenu.insertAt);
                      setLinkPickerType("TASK");
                      setContextMenu(null);
                    }}
                  >
                    <Icon name="link" />
                    <span>Объект проекта</span>
                  </button>
                </div>
                <div className="project-free-board__context-hint">ПКМ + движение — выделить область</div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
