"use client";

import Link from "next/link";
import React from "react";

type EstLine = {
  id: string;
  position: number;
  lineNumber: number;
  name: string;
  description: string | null;
  lineType: string;
  costClient: string | null;
  costInternal: string | null;
  orderLineId: string | null;
  itemId: string | null;
};

type RequisiteOrderLine = {
  id: string;
  itemId: string;
  requestedQty: number;
  approvedQty: number | null;
  issuedQty: number | null;
  pricePerDaySnapshot: number | null;
  warehouseComment: string | null;
  item: { id: string; name: string; type: string };
};

type RequisiteOrder = {
  id: string;
  status: string;
  source: string;
  readyByDate: string;
  startDate: string;
  endDate: string;
  eventName: string | null;
  comment: string | null;
  deliveryEnabled: boolean;
  deliveryComment: string | null;
  deliveryPrice: number | null;
  montageEnabled: boolean;
  montageComment: string | null;
  montagePrice: number | null;
  demontageEnabled: boolean;
  demontageComment: string | null;
  demontagePrice: number | null;
  payMultiplier?: number | null;
  lines: RequisiteOrderLine[];
};

type EstSection = {
  id: string;
  sortOrder: number;
  title: string;
  kind: "LOCAL" | "REQUISITE" | "DRAFT_REQUISITE";
  linkedOrderId: string | null;
  linkedDraftOrderId?: string | null;
  lines: EstLine[];
};

type LocalDraftLine = {
  id: string;
  position: number;
  lineNumber: number;
  name: string;
  description: string | null;
  lineType: string;
  costClient: string | null;
  costInternal: string | null;
  orderLineId: null;
  itemId: null;
};

type LocalDraftSection = {
  id: string;
  sortOrder: number;
  title: string;
  kind: "LOCAL";
  linkedOrderId: null;
  lines: LocalDraftLine[];
};

type StoredEstimateDraft = {
  versionNumber: number;
  sections: LocalDraftSection[];
};

type VersionMeta = {
  id: string;
  versionNumber: number;
  note: string | null;
  isPrimary: boolean;
  createdAt: string;
  createdBy: { displayName: string };
};

type EstimatePayload = {
  projectTitle: string;
  projectOrders?: Array<{
    id: string;
    status: string;
    eventName: string | null;
    startDate: string;
    endDate: string;
  }>;
  versions: VersionMeta[];
  current: {
    id: string;
    versionNumber: number;
    note: string | null;
    createdAt: string;
    sections: EstSection[];
  } | null;
};

/** Единый стиль с ProjectSchedulePanel и остальными блоками проекта */
const inputField =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200/50";
const btnPrimary =
  "rounded-lg border border-violet-300 bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50";
const btnSecondary =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50";
const btnSecondaryXs =
  "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50";
const btnGhostXs =
  "inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-50";
const inputFieldCompact =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200/50";
const menuPanel =
  "absolute right-0 top-full z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-zinc-200 bg-white p-1 shadow-[0_18px_48px_rgba(24,24,27,0.14)]";
const menuAction =
  "flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm text-zinc-800 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50";
const sectionTone = {
  requisite: "border-violet-200 bg-[linear-gradient(180deg,rgba(245,243,255,0.9),rgba(255,255,255,0.98))]",
  draftRequisite: "border-fuchsia-200 bg-[linear-gradient(180deg,rgba(253,244,255,0.94),rgba(255,255,255,0.98))]",
  local: "border-sky-100 bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,1))]",
};
const EDITABLE_ORDER_STATUSES = ["SUBMITTED", "ESTIMATE_SENT", "CHANGES_REQUESTED", "APPROVED_BY_GREENWICH"] as const;

function isEditableOrderStatus(status: string) {
  return EDITABLE_ORDER_STATUSES.includes(status as (typeof EDITABLE_ORDER_STATUSES)[number]);
}

function formatOrderMoney(n: number) {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Новая",
  ESTIMATE_SENT: "Смета отправлена",
  CHANGES_REQUESTED: "Изменения",
  APPROVED_BY_GREENWICH: "Согласована",
  PICKING: "Сборка",
  ISSUED: "Выдана",
  RETURN_DECLARED: "Ожидает приемки",
  CLOSED: "Закрыта",
  CANCELLED: "Отменена",
};

function orderStatusLabel(status: string) {
  return ORDER_STATUS_LABEL[status] ?? status;
}

function daysBetween(startDate: string, endDate: string): number {
  const a = new Date(`${startDate}T12:00:00`);
  const b = new Date(`${endDate}T12:00:00`);
  const ms = b.getTime() - a.getTime();
  const days = Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
  return days === 0 ? 1 : days;
}

function formatDateRu(dateOnly: string | null | undefined) {
  if (!dateOnly) return "—";
  const [y, m, d] = dateOnly.split("-").map((v) => Number(v));
  if (!y || !m || !d) return dateOnly;
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

function draftEstimateStorageKey(projectId: string, versionNumber: number) {
  return `project-estimate-draft:${projectId}:v${versionNumber}`;
}

function makeTempId(prefix: string) {
  return `draft-${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneLocalSections(sections: EstSection[]): LocalDraftSection[] {
  return sections
    .filter((section): section is EstSection & { kind: "LOCAL" } => section.kind === "LOCAL")
    .map((section) => ({
      id: section.id,
      sortOrder: section.sortOrder,
      title: section.title,
      kind: "LOCAL",
      linkedOrderId: null,
      lines: section.lines.map((line) => ({
        id: line.id,
        position: line.position,
        lineNumber: line.lineNumber,
        name: line.name,
        description: line.description,
        lineType: line.lineType,
        costClient: line.costClient,
        costInternal: line.costInternal,
        orderLineId: null,
        itemId: null,
      })),
    }));
}

function normalizeLocalSectionsForCompare(sections: LocalDraftSection[]) {
  return sections
    .map((section, sectionIndex) => ({
      title: section.title.trim(),
      sortOrder: sectionIndex,
      lines: section.lines.map((line, lineIndex) => ({
        name: line.name.trim(),
        description: line.description?.trim() || null,
        costClient: line.costClient == null || line.costClient === "" ? null : String(Number(line.costClient)),
        costInternal: line.costInternal == null || line.costInternal === "" ? null : String(Number(line.costInternal)),
        position: lineIndex,
        lineNumber: lineIndex + 1,
      })),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function isDraftRequisiteSection(
  section: EstSection,
): section is EstSection & { kind: "DRAFT_REQUISITE" } {
  return section.kind === "DRAFT_REQUISITE";
}

export function ProjectEstimatePanel({
  projectId,
  readOnly,
  selectedVersionNumber: selectedVersionNumberProp,
  onSelectedVersionNumberChange,
  onResolvedVersionChange,
}: {
  projectId: string;
  readOnly: boolean;
  selectedVersionNumber?: number | null;
  onSelectedVersionNumberChange?: (value: number | null) => void;
  onResolvedVersionChange?: (value: { id: string; versionNumber: number } | null) => void;
}) {
  const [data, setData] = React.useState<EstimatePayload | null>(null);
  /** null = основная версия с сервера; число = явный выбор */
  const [uncontrolledSelectedVersion, setUncontrolledSelectedVersion] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [newSectionTitle, setNewSectionTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [selectedImportOrderIds, setSelectedImportOrderIds] = React.useState<string[]>([]);
  const [versionPickerOpen, setVersionPickerOpen] = React.useState(false);
  const [actionsOpen, setActionsOpen] = React.useState(false);
  const [localSectionsDraft, setLocalSectionsDraft] = React.useState<LocalDraftSection[]>([]);
  const [estimateDraftDirty, setEstimateDraftDirty] = React.useState(false);
  const selectedVersion =
    selectedVersionNumberProp !== undefined ? selectedVersionNumberProp : uncontrolledSelectedVersion;

  const setSelectedVersion = React.useCallback(
    (value: number | null) => {
      if (onSelectedVersionNumberChange) {
        onSelectedVersionNumberChange(value);
        return;
      }
      setUncontrolledSelectedVersion(value);
    },
    [onSelectedVersionNumberChange],
  );

  const load = React.useCallback(
    (v: number | null) => {
      setLoading(true);
      const q = v != null ? `?version=${v}` : "";
      fetch(`/api/projects/${projectId}/estimate${q}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j: EstimatePayload & { error?: { message?: string } }) => {
          if (j.error?.message) {
            setError(j.error.message);
            setData(null);
          } else {
            setData(j);
            const versionNumber = j.current?.versionNumber ?? null;
            const baseSections = j.current?.sections ? cloneLocalSections(j.current.sections) : [];
            if (versionNumber != null) {
              const storageKey = draftEstimateStorageKey(projectId, versionNumber);
              const raw = window.localStorage.getItem(storageKey);
              if (raw) {
                try {
                  const parsed = JSON.parse(raw) as StoredEstimateDraft;
                  if (parsed.versionNumber === versionNumber && Array.isArray(parsed.sections)) {
                    setLocalSectionsDraft(parsed.sections);
                    setEstimateDraftDirty(true);
                  } else {
                    setLocalSectionsDraft(baseSections);
                    setEstimateDraftDirty(false);
                  }
                } catch {
                  setLocalSectionsDraft(baseSections);
                  setEstimateDraftDirty(false);
                }
              } else {
                setLocalSectionsDraft(baseSections);
                setEstimateDraftDirty(false);
              }
            } else {
              setLocalSectionsDraft([]);
              setEstimateDraftDirty(false);
            }
            setError(null);
            setVersionPickerOpen(false);
            setActionsOpen(false);
          }
        })
        .catch(() => {
          setError("Не удалось загрузить смету");
          setData(null);
        })
        .finally(() => setLoading(false));
    },
    [projectId],
  );

  React.useEffect(() => {
    load(selectedVersion);
  }, [load, selectedVersion]);

  React.useEffect(() => {
    function onRefresh() {
      load(selectedVersion);
    }
    window.addEventListener("project-activity-refresh", onRefresh);
    return () => window.removeEventListener("project-activity-refresh", onRefresh);
  }, [load, selectedVersion]);

  React.useEffect(() => {
    function closeMenus() {
      setVersionPickerOpen(false);
      setActionsOpen(false);
    }
    if (!versionPickerOpen && !actionsOpen) return;
    window.addEventListener("click", closeMenus);
    return () => window.removeEventListener("click", closeMenus);
  }, [versionPickerOpen, actionsOpen]);

  function refreshActivity() {
    window.dispatchEvent(new CustomEvent("project-activity-refresh"));
  }

  React.useEffect(() => {
    if (!onResolvedVersionChange) return;
    if (!data?.current) {
      onResolvedVersionChange(null);
      return;
    }
    onResolvedVersionChange({
      id: data.current.id,
      versionNumber: data.current.versionNumber,
    });
  }, [data?.current, onResolvedVersionChange]);

  const currentVersionNumber = selectedVersion ?? data?.current?.versionNumber ?? null;
  const estimateDraftStorageKey =
    currentVersionNumber != null ? draftEstimateStorageKey(projectId, currentVersionNumber) : null;

  React.useEffect(() => {
    if (!estimateDraftStorageKey) return;
    if (!estimateDraftDirty) {
      window.localStorage.removeItem(estimateDraftStorageKey);
      return;
    }
    const payload: StoredEstimateDraft = {
      versionNumber: currentVersionNumber!,
      sections: localSectionsDraft,
    };
    window.localStorage.setItem(estimateDraftStorageKey, JSON.stringify(payload));
  }, [currentVersionNumber, estimateDraftDirty, estimateDraftStorageKey, localSectionsDraft]);

  function mutateLocalSections(mutator: (prev: LocalDraftSection[]) => LocalDraftSection[]) {
    setLocalSectionsDraft((prev) => mutator(prev));
    setEstimateDraftDirty(true);
  }

  async function createVersion(duplicate: boolean) {
    if (readOnly) return;
    const note = window.prompt("Комментарий к версии (необязательно)") ?? "";
    const vNum = data?.current?.versionNumber;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estimate/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: note.trim() || null,
          ...(duplicate && vNum != null ? { duplicateFromVersionNumber: vNum } : {}),
        }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.version) {
        setSelectedVersion(j.version.versionNumber);
        refreshActivity();
      } else {
        window.alert(j?.error?.message ?? "Ошибка");
      }
    } finally {
      setBusy(false);
    }
  }

  async function setPrimaryVersion(versionNumber: number) {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estimate/versions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionNumber, isPrimary: true }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        setSelectedVersion(versionNumber);
        load(versionNumber);
      } else {
        window.alert(j?.error?.message ?? "Ошибка");
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteVersion(versionNumber: number) {
    if (!window.confirm(`Удалить версию v${versionNumber}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estimate/versions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionNumber }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        setSelectedVersion(null);
        load(null);
        refreshActivity();
      } else {
        window.alert(j?.error?.message ?? "Ошибка");
      }
    } finally {
      setBusy(false);
    }
  }

  async function importFromOrders() {
    if (selectedImportOrderIds.length === 0 || !data?.current) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estimate/versions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionNumber: data.current.versionNumber,
          importOrderIds: selectedImportOrderIds,
        }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        setImportOpen(false);
        setSelectedImportOrderIds([]);
        load(selectedVersion);
      } else {
        window.alert(j?.error?.message ?? "Ошибка");
      }
    } finally {
      setBusy(false);
    }
  }

  function addSection(e: React.FormEvent) {
    e.preventDefault();
    if (!newSectionTitle.trim() || readOnly) return;
    mutateLocalSections((prev) => [
      ...prev,
      {
        id: makeTempId("section"),
        sortOrder: prev.length,
        title: newSectionTitle.trim(),
        kind: "LOCAL",
        linkedOrderId: null,
        lines: [],
      },
    ]);
    setNewSectionTitle("");
  }

  function deleteSection(id: string) {
    if (!window.confirm("Удалить раздел и все его строки?")) return;
    mutateLocalSections((prev) =>
      prev
        .filter((section) => section.id !== id)
        .map((section, index) => ({ ...section, sortOrder: index })),
    );
  }

  function patchSection(sectionId: string, patch: { title?: string }) {
    mutateLocalSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              ...(patch.title != null ? { title: patch.title } : {}),
            }
          : section,
      ),
    );
  }

  function saveLine(sectionId: string, lineId: string, patch: Record<string, unknown>) {
    mutateLocalSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              lines: section.lines.map((line) =>
                line.id === lineId
                  ? {
                      ...line,
                      ...(typeof patch.name === "string" ? { name: patch.name } : {}),
                      ...(Object.prototype.hasOwnProperty.call(patch, "description")
                        ? {
                            description:
                              patch.description == null
                                ? null
                                : String(patch.description),
                          }
                        : {}),
                      ...(Object.prototype.hasOwnProperty.call(patch, "costClient")
                        ? {
                            costClient:
                              patch.costClient == null ? null : String(patch.costClient),
                          }
                        : {}),
                      ...(Object.prototype.hasOwnProperty.call(patch, "costInternal")
                        ? {
                            costInternal:
                              patch.costInternal == null ? null : String(patch.costInternal),
                          }
                        : {}),
                    }
                  : line,
              ),
            }
          : section,
      ),
    );
  }

  function deleteLine(sectionId: string, lineId: string) {
    mutateLocalSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              lines: section.lines
                .filter((line) => line.id !== lineId)
                .map((line, index) => ({ ...line, position: index, lineNumber: index + 1 })),
            }
          : section,
      ),
    );
  }

  function addLine(sectionId: string, payload: {
    name: string;
    description: string | null;
    costClient: number | null;
    costInternal: number | null;
  }) {
    mutateLocalSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;
        const index = section.lines.length;
        return {
          ...section,
          lines: [
            ...section.lines,
            {
              id: makeTempId("line"),
              position: index,
              lineNumber: index + 1,
              name: payload.name,
              description: payload.description,
              lineType: "OTHER",
              costClient: payload.costClient == null ? null : String(payload.costClient),
              costInternal: payload.costInternal == null ? null : String(payload.costInternal),
              orderLineId: null,
              itemId: null,
            },
          ],
        };
      }),
    );
  }

  async function saveEstimateDraft() {
    if (readOnly || currentVersionNumber == null) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estimate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionNumber: currentVersionNumber,
          localSections: localSectionsDraft.map((section, sectionIndex) => ({
            id: section.id.startsWith("draft-") ? undefined : section.id,
            title: section.title.trim(),
            sortOrder: sectionIndex,
            lines: section.lines.map((line, lineIndex) => ({
              id: line.id.startsWith("draft-") ? undefined : line.id,
              position: lineIndex,
              lineNumber: lineIndex + 1,
              name: line.name.trim(),
              description: line.description?.trim() || null,
              lineType: line.lineType || "OTHER",
              costClient: line.costClient == null || line.costClient === "" ? null : Number(line.costClient),
              costInternal: line.costInternal == null || line.costInternal === "" ? null : Number(line.costInternal),
            })),
          })),
        }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        setEstimateDraftDirty(false);
        if (estimateDraftStorageKey) window.localStorage.removeItem(estimateDraftStorageKey);
        load(selectedVersion);
        refreshActivity();
      } else {
        window.alert(j?.error?.message ?? "Ошибка");
      }
    } finally {
      setBusy(false);
    }
  }

  function discardEstimateDraft() {
    if (!window.confirm("Сбросить несохранённые изменения сметы?")) return;
    if (estimateDraftStorageKey) window.localStorage.removeItem(estimateDraftStorageKey);
    const baseSections = data?.current?.sections ? cloneLocalSections(data.current.sections) : [];
    setLocalSectionsDraft(baseSections);
    setEstimateDraftDirty(false);
  }

  const vn = currentVersionNumber;
  const currentVersionMeta = data?.versions.find((v) => v.versionNumber === vn) ?? null;
  const exportHref =
    vn != null
      ? `/api/projects/${projectId}/estimate/pdf?version=${encodeURIComponent(String(vn))}`
      : `/api/projects/${projectId}/estimate/pdf`;
  const availableImportOrders = React.useMemo(() => {
    if (!data?.projectOrders || !data.current) return [];
    const imported = new Set(
      data.current.sections
        .filter((s) => s.kind === "REQUISITE" && s.linkedOrderId)
        .map((s) => s.linkedOrderId as string),
    );
    return data.projectOrders.filter((o) => !imported.has(o.id));
  }, [data]);
  const orderedProjectOrders = React.useMemo(
    () =>
      [...(data?.projectOrders ?? [])].sort((a, b) => {
        if (a.startDate === b.startDate) return a.id.localeCompare(b.id);
        return a.startDate.localeCompare(b.startDate);
      }),
    [data?.projectOrders],
  );
  const orderMetaById = React.useMemo(() => {
    const map = new Map<
      string,
      { index: number; label: string; dateLabel: string; status: string; eventName: string | null }
    >();
    orderedProjectOrders.forEach((order, index) => {
      map.set(order.id, {
        index: index + 1,
        label: `Заявка №${index + 1}`,
        dateLabel: `${order.startDate} — ${order.endDate}`,
        status: order.status,
        eventName: order.eventName,
      });
    });
    return map;
  }, [orderedProjectOrders]);

  const renderedSections = React.useMemo(() => {
    if (!data?.current) return [];
    const requisites = data.current.sections.filter(
      (section) => section.kind === "REQUISITE" || section.kind === "DRAFT_REQUISITE",
    );
    return [...requisites, ...localSectionsDraft].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [data?.current, localSectionsDraft]);

  const dirtyLocalLineIds = React.useMemo(() => {
    const dirtyIds = new Set<string>();
    if (!data?.current) return dirtyIds;
    const baseline = cloneLocalSections(data.current.sections);
    const normalizedBase = normalizeLocalSectionsForCompare(baseline);
    const normalizedDraft = normalizeLocalSectionsForCompare(localSectionsDraft);
    const baseBySectionTitle = new Map(
      baseline.map((section, sectionIndex) => [
        `${normalizedBase[sectionIndex]?.title ?? section.title.trim()}::${sectionIndex}`,
        section,
      ]),
    );

    localSectionsDraft.forEach((section, sectionIndex) => {
      const normalizedSection = normalizedDraft[sectionIndex];
      const baseSection = baseBySectionTitle.get(`${normalizedSection?.title ?? section.title.trim()}::${sectionIndex}`);
      if (!baseSection) {
        section.lines.forEach((line) => dirtyIds.add(line.id));
        return;
      }
      const baseLines = normalizeLocalSectionsForCompare([baseSection])[0]?.lines ?? [];
      section.lines.forEach((line, lineIndex) => {
        const current = normalizedSection?.lines[lineIndex];
        const previous = baseLines[lineIndex];
        if (!previous || JSON.stringify(current) !== JSON.stringify(previous)) {
          dirtyIds.add(line.id);
        }
      });
    });

    return dirtyIds;
  }, [data?.current, localSectionsDraft]);

  const totals = React.useMemo(() => {
    const COMMISSION_RATE = 0.15;
    const sections = renderedSections;
    let clientSubtotal = 0;
    let internalSubtotal = 0;
    for (const s of sections) {
      for (const l of s.lines) {
        const c = l.costClient != null ? Number(l.costClient) : 0;
        const i = l.costInternal != null ? Number(l.costInternal) : 0;
        if (Number.isFinite(c)) clientSubtotal += c;
        if (Number.isFinite(i)) internalSubtotal += i;
      }
    }
    const commission = clientSubtotal * COMMISSION_RATE;
    const clientTotal = clientSubtotal + commission;
    const profit = clientSubtotal - internalSubtotal + commission;
    const profitPct = clientTotal > 0 ? (profit / clientTotal) * 100 : 0;
    return {
      clientSubtotal,
      commission,
      clientTotal,
      internalSubtotal,
      profit,
      profitPct,
    };
  }, [renderedSections]);

  function money(n: number) {
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-lg font-extrabold tracking-tight text-violet-900">Смета проекта</div>
        <div className="flex flex-wrap items-center gap-2">
          {vn != null ? (
            <a
              href={exportHref}
              className="rounded-lg border border-emerald-600/40 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
              target="_blank"
              rel="noreferrer"
            >
              Скачать XLSX
            </a>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        Блоки реквизита читаются из живых заявок проекта, а локальные разделы теперь можно спокойно собирать как черновик и сохранить в БД одним действием.
        Комиссия 15% считается от суммы клиентских строк и попадает в XLSX-выгрузку.
      </p>

      {loading ? (
        <p className="text-sm text-zinc-600">Загрузка…</p>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : !data ? (
        <p className="text-sm text-zinc-600">Нет данных сметы.</p>
      ) : !data.current && data.versions.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-zinc-600">Версий сметы ещё нет.</p>
          {!readOnly ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void createVersion(false)}
              className={btnPrimary}
            >
              Создать первую версию
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-white/80 p-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Версия сметы</div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <button
                    type="button"
                    className="inline-flex min-h-11 min-w-[12rem] items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left shadow-sm hover:border-violet-200 hover:bg-violet-50/60"
                    onClick={() => {
                      setVersionPickerOpen((v) => !v);
                      setActionsOpen(false);
                    }}
                  >
                    <span>
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Текущая</span>
                      <span className="block text-base font-semibold text-zinc-950">
                        {vn != null ? `v${vn}` : "Версия не выбрана"}
                      </span>
                    </span>
                    <svg viewBox="0 0 20 20" className={`h-4 w-4 text-zinc-500 transition ${versionPickerOpen ? "rotate-180" : ""}`} aria-hidden>
                      <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.1 1.02l-4.25 4.5a.75.75 0 01-1.1 0l-4.25-4.5a.75.75 0 01.02-1.06z" fill="currentColor" />
                    </svg>
                  </button>
                  {versionPickerOpen ? (
                    <div className={`${menuPanel} left-0 right-auto min-w-[17rem]`}>
                      {data.versions.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left ${
                            vn === v.versionNumber ? "bg-violet-50 text-violet-950" : "text-zinc-800 hover:bg-zinc-50"
                          }`}
                          onClick={() => {
                            setSelectedVersion(v.versionNumber);
                            setVersionPickerOpen(false);
                          }}
                        >
                          <span className="min-w-0">
                            <span className="block font-semibold">v{v.versionNumber}</span>
                            <span className="block text-xs text-zinc-500">{v.note?.trim() || "Без комментария"}</span>
                          </span>
                          {v.isPrimary ? (
                            <span className="rounded-full border border-violet-200 bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                              Основная
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                {currentVersionMeta ? (
                  <>
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold ${
                        currentVersionMeta.isPrimary
                          ? "border border-violet-200 bg-violet-50 text-violet-800"
                          : "border border-zinc-200 bg-zinc-50 text-zinc-700"
                      }`}
                    >
                      {currentVersionMeta.isPrimary ? "Основная версия" : "Черновая версия"}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {new Date(currentVersionMeta.createdAt).toLocaleDateString("ru-RU")} · {currentVersionMeta.createdBy.displayName}
                    </span>
                  </>
                ) : null}
              </div>
            </div>

            {!readOnly ? (
              <div className="relative flex items-start justify-start lg:justify-end">
                <button
                  type="button"
                  disabled={busy}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
                  onClick={() => {
                    setActionsOpen((v) => !v);
                    setVersionPickerOpen(false);
                  }}
                >
                  Действия
                  <svg viewBox="0 0 20 20" className={`h-4 w-4 text-zinc-500 transition ${actionsOpen ? "rotate-180" : ""}`} aria-hidden>
                    <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.1 1.02l-4.25 4.5a.75.75 0 01-1.1 0l-4.25-4.5a.75.75 0 01.02-1.06z" fill="currentColor" />
                  </svg>
                </button>
                {actionsOpen ? (
                  <div className={menuPanel}>
                    <button
                      type="button"
                      disabled={busy}
                      className={menuAction}
                      onClick={() => {
                        setActionsOpen(false);
                        void createVersion(false);
                      }}
                    >
                      <span>
                        <span className="block font-semibold">Новая версия</span>
                        <span className="block text-xs text-zinc-500">Создать чистый черновик</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={busy || !data.current}
                      className={menuAction}
                      onClick={() => {
                        setActionsOpen(false);
                        void createVersion(true);
                      }}
                    >
                      <span>
                        <span className="block font-semibold">Дублировать текущую</span>
                        <span className="block text-xs text-zinc-500">Скопировать разделы и строки</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={busy || !data.current || currentVersionMeta?.isPrimary === true}
                      className={menuAction}
                      onClick={() => {
                        if (!data.current) return;
                        setActionsOpen(false);
                        void setPrimaryVersion(data.current.versionNumber);
                      }}
                    >
                      <span>
                        <span className="block font-semibold">Сделать основной</span>
                        <span className="block text-xs text-zinc-500">Эта версия будет открываться по умолчанию</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={busy || availableImportOrders.length === 0}
                      className={menuAction}
                      onClick={() => {
                        setImportOpen((v) => !v);
                        setActionsOpen(false);
                      }}
                    >
                      <span>
                        <span className="block font-semibold">Подтянуть из заявок</span>
                        <span className="block text-xs text-zinc-500">
                          {availableImportOrders.length > 0
                            ? `Доступно заявок: ${availableImportOrders.length}`
                            : "Все заявки уже импортированы"}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={busy || !data.current || data.versions.length <= 1}
                      className={`${menuAction} text-red-700 hover:bg-red-50`}
                      onClick={() => {
                        if (!data.current) return;
                        setActionsOpen(false);
                        void deleteVersion(data.current.versionNumber);
                      }}
                    >
                      <span>
                        <span className="block font-semibold">Удалить версию</span>
                        <span className="block text-xs text-red-500">Недоступно для последней версии</span>
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {!data.current ? (
            <p className="text-sm text-zinc-600">Выберите версию.</p>
          ) : (
            <>
              {!readOnly ? (
                <div className="space-y-2 border-b border-zinc-200 pb-3">
                  {importOpen ? (
                    <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/40 p-3 space-y-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Выбери заявки проекта для импорта в текущую версию
                      </div>
                      {availableImportOrders.length === 0 ? (
                        <div className="text-sm text-zinc-600">Все заявки проекта уже добавлены в эту версию.</div>
                      ) : (
                        <div className="space-y-2">
                          {availableImportOrders.map((order) => (
                            <label
                              key={order.id}
                              className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                            >
                              <input
                                type="checkbox"
                                checked={selectedImportOrderIds.includes(order.id)}
                                onChange={(e) =>
                                  setSelectedImportOrderIds((prev) =>
                                    e.target.checked ? [...prev, order.id] : prev.filter((id) => id !== order.id),
                                  )
                                }
                                className="mt-0.5"
                              />
                              <span className="min-w-0">
                                <span className="block font-medium text-zinc-900">
                                  {order.eventName?.trim() ? order.eventName : `Заявка ${order.id.slice(0, 8)}…`}
                                </span>
                                <span className="block text-xs text-zinc-500">
                                  {order.startDate} — {order.endDate} · {order.status}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy || selectedImportOrderIds.length === 0}
                          onClick={() => void importFromOrders()}
                          className={btnPrimary}
                        >
                          Импортировать выбранные
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setImportOpen(false);
                            setSelectedImportOrderIds([]);
                          }}
                          className={btnSecondary}
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <form
                    onSubmit={addSection}
                    className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <input
                      value={newSectionTitle}
                      onChange={(e) => setNewSectionTitle(e.target.value)}
                      placeholder="Новый локальный раздел"
                      className={`min-w-[12rem] flex-1 ${inputField}`}
                      maxLength={200}
                    />
                    <button type="submit" disabled={busy} className={btnPrimary}>
                      Добавить раздел
                    </button>
                  </form>
                </div>
              ) : null}

              <div className="space-y-4">
                {renderedSections.map((sec) => (
                  <EstimateSectionBlock
                    key={sec.id}
                    sec={sec}
                    orderMeta={sec.linkedOrderId ? orderMetaById.get(sec.linkedOrderId) ?? null : null}
                    readOnly={readOnly}
                    busy={busy}
                    onPatchSection={patchSection}
                    onDeleteSection={deleteSection}
                  >
                    {sec.kind === "REQUISITE" && sec.linkedOrderId ? (
                      <RequisiteSectionEditor
                        projectId={projectId}
                        orderId={sec.linkedOrderId}
                        orderMeta={orderMetaById.get(sec.linkedOrderId) ?? null}
                        readOnly={readOnly}
                        onDone={() => {
                          load(selectedVersion);
                          refreshActivity();
                        }}
                      />
                    ) : isDraftRequisiteSection(sec) ? (
                      <DraftRequisiteReadOnlyBlock sec={sec} />
                    ) : (
                      <>
                        {sec.lines.map((ln) => (
                          <LineEditor
                            key={ln.id}
                            sectionId={sec.id}
                            line={ln}
                            isDirty={dirtyLocalLineIds.has(ln.id)}
                            readOnly={readOnly}
                            busy={busy}
                            onSave={saveLine}
                            onDelete={deleteLine}
                          />
                        ))}

                        {!readOnly ? (
                          <AddLineForm
                            sectionId={sec.id}
                            busy={busy}
                            onAdd={addLine}
                          />
                        ) : null}
                      </>
                    )}
                  </EstimateSectionBlock>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-2 rounded-2xl border border-zinc-200 bg-white/80 p-3 sm:grid-cols-2 xl:grid-cols-6">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-[11px] font-semibold text-zinc-600">Сумма (клиент)</div>
                  <div className="mt-1 text-base font-bold tabular-nums text-zinc-900">{money(totals.clientSubtotal)} ₽</div>
                </div>
                <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
                  <div className="text-[11px] font-semibold text-violet-800">Комиссия 15%</div>
                  <div className="mt-1 text-base font-bold tabular-nums text-violet-900">{money(totals.commission)} ₽</div>
                </div>
                <div className="rounded-xl border border-violet-300 bg-violet-100/70 px-3 py-2">
                  <div className="text-[11px] font-semibold text-violet-900">Итого клиент</div>
                  <div className="mt-1 text-base font-extrabold tabular-nums text-violet-950">{money(totals.clientTotal)} ₽</div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                  <div className="text-[11px] font-semibold text-amber-900">Себестоимость</div>
                  <div className="mt-1 text-base font-bold tabular-nums text-amber-950">{money(totals.internalSubtotal)} ₽</div>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <div className="text-[11px] font-semibold text-emerald-900">Прибыль</div>
                  <div className="mt-1 text-base font-bold tabular-nums text-emerald-950">{money(totals.profit)} ₽</div>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2">
                  <div className="text-[11px] font-semibold text-emerald-900">Маржа</div>
                  <div className="mt-1 text-base font-bold tabular-nums text-emerald-950">
                    {Number.isFinite(totals.profitPct) ? `${totals.profitPct.toFixed(0)}%` : "—"}
                  </div>
                </div>
              </div>

              {!readOnly && data?.current ? (
                <div className="flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-amber-200 bg-[linear-gradient(135deg,rgba(251,191,36,0.14),rgba(255,255,255,0.98),rgba(249,115,22,0.08))] p-4">
                  <button
                    type="button"
                    disabled={busy || !estimateDraftDirty}
                    onClick={discardEstimateDraft}
                    className={`${btnSecondary} min-h-11`}
                  >
                    Сбросить черновик
                  </button>
                  <button
                    type="button"
                    disabled={busy || !estimateDraftDirty}
                    onClick={() => void saveEstimateDraft()}
                    className="min-h-12 rounded-xl border border-amber-300 bg-[linear-gradient(135deg,#f59e0b,#f97316)] px-5 py-3 text-sm font-extrabold text-white shadow-[0_12px_28px_rgba(249,115,22,0.24)] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? "Сохраняю смету…" : "Сохранить смету"}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}

function EstimateSectionBlock({
  sec,
  orderMeta,
  readOnly,
  busy,
  onPatchSection,
  onDeleteSection,
  children,
}: {
  sec: EstSection;
  orderMeta: { index: number; label: string; dateLabel: string; status: string; eventName: string | null } | null;
  readOnly: boolean;
  busy: boolean;
  onPatchSection: (id: string, patch: { title?: string }) => void | Promise<void>;
  onDeleteSection: (id: string) => void | Promise<void>;
  children: React.ReactNode;
}) {
  const [titleDraft, setTitleDraft] = React.useState(sec.title);
  const [editingTitle, setEditingTitle] = React.useState(false);

  React.useEffect(() => {
    setTitleDraft(sec.title);
    setEditingTitle(false);
  }, [sec.id, sec.title]);

  function saveTitle() {
    const t = titleDraft.trim();
    if (!t || t === sec.title) return;
    void onPatchSection(sec.id, { title: t });
  }

  return (
    <details
      className={`rounded-2xl border p-3 shadow-sm sm:p-4 ${
        sec.kind === "REQUISITE"
          ? sectionTone.requisite
          : sec.kind === "DRAFT_REQUISITE"
            ? sectionTone.draftRequisite
            : sectionTone.local
      }`}
      open
    >
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  sec.kind === "REQUISITE"
                    ? "border border-violet-200 bg-violet-100 text-violet-900"
                    : sec.kind === "DRAFT_REQUISITE"
                      ? "border border-fuchsia-200 bg-fuchsia-100 text-fuchsia-900"
                    : "border border-sky-200 bg-sky-50 text-sky-900"
                }`}
              >
                {sec.kind === "REQUISITE"
                  ? "Реквизит"
                  : sec.kind === "DRAFT_REQUISITE"
                    ? "Demo-реквизит"
                    : "Локальный раздел"}
              </span>
              {orderMeta ? (
                <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
                  {orderMeta.label}
                </span>
              ) : null}
            </div>
            <div className="mt-2 text-lg font-semibold text-zinc-950">
              {sec.kind === "REQUISITE"
                ? orderMeta?.label ?? "Реквизит"
                : sec.kind === "DRAFT_REQUISITE"
                  ? sec.title
                  : sec.title}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
              {sec.kind === "REQUISITE" ? (
                <>
                  {orderMeta?.eventName?.trim() ? (
                    <span className="rounded-full border border-zinc-200 bg-white/80 px-2 py-1">
                      {orderMeta.eventName}
                    </span>
                  ) : null}
                  {orderMeta?.dateLabel ? (
                    <span className="rounded-full border border-zinc-200 bg-white/80 px-2 py-1">
                      {orderMeta.dateLabel
                        .split(" — ")
                        .map((value) => formatDateRu(value))
                        .join(" — ")}
                    </span>
                  ) : null}
                </>
              ) : sec.kind === "DRAFT_REQUISITE" ? (
                <span>Черновик проекта без дат. В очередь склада не попадает, пока не подтверждены периоды.</span>
              ) : (
                <span>Раздел проекта без связи с заявкой</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 self-start">
            {sec.linkedOrderId ? (
              <Link
                href={`/orders/${sec.linkedOrderId}`}
                className="rounded-lg border border-violet-200 bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:text-violet-900"
                onClick={(e) => e.stopPropagation()}
              >
                Открыть заявку
              </Link>
            ) : null}
            <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 text-zinc-400" aria-hidden>
              <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.1 1.02l-4.25 4.5a.75.75 0 01-1.1 0l-4.25-4.5a.75.75 0 01.02-1.06z" fill="currentColor" />
            </svg>
          </div>
        </div>
      </summary>
      <div className="mt-3 space-y-3">
        {!readOnly ? (
          sec.kind === "LOCAL" && editingTitle ? (
            <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 p-2.5 sm:flex-row sm:flex-wrap sm:items-end">
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                placeholder="Название раздела"
                className="min-w-[10rem] flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200/50"
                maxLength={200}
              />
              <button
                type="button"
                disabled={busy || titleDraft.trim() === sec.title.trim() || !titleDraft.trim()}
                className={btnPrimary}
                onClick={() => {
                  void saveTitle();
                  setEditingTitle(false);
                }}
              >
                Сохранить
              </button>
              <button
                type="button"
                className={btnSecondary}
                onClick={() => {
                  setTitleDraft(sec.title);
                  setEditingTitle(false);
                }}
              >
                Отмена
              </button>
            </div>
          ) : sec.kind === "LOCAL" ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className={btnGhostXs}
                onClick={() => setEditingTitle(true)}
                disabled={busy}
                title="Редактировать название раздела"
                aria-label="Редактировать название раздела"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l9.06-9.06.92.92L5.92 20.08zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                </svg>
                <span>Название</span>
              </button>
              {sec.kind === "LOCAL" ? (
                <button
                  type="button"
                  className={`${btnGhostXs} border-red-200 text-red-700 hover:bg-red-50`}
                  onClick={() => void onDeleteSection(sec.id)}
                  disabled={busy}
                >
                  Удалить раздел
                </button>
              ) : null}
            </div>
          ) : null
        ) : null}

        {children}
      </div>
    </details>
  );
}

function LineEditor({
  sectionId,
  line,
  isDirty,
  readOnly,
  busy,
  onSave,
  onDelete,
}: {
  sectionId: string;
  line: EstLine;
  isDirty: boolean;
  readOnly: boolean;
  busy: boolean;
  onSave: (sectionId: string, id: string, p: Record<string, unknown>) => void;
  onDelete: (sectionId: string, id: string) => void;
}) {
  return (
    <div
      className={`rounded-lg border p-2.5 text-sm shadow-sm ${
        isDirty
          ? "border-amber-300 bg-[linear-gradient(135deg,rgba(254,243,199,0.8),rgba(255,255,255,1))]"
          : "border-zinc-100 bg-zinc-50/60"
      }`}
    >
      <div className="mb-2 text-[11px] font-medium text-zinc-500">
        №{line.lineNumber}
        {line.orderLineId ? " · из заявки" : ""}
      </div>
      {readOnly ? (
        <div className="mt-1 space-y-0.5">
          <div className="font-medium">{line.name}</div>
          {line.description ? <div className="text-xs text-zinc-600">{line.description}</div> : null}
          <div className="text-xs">
            Клиент: {line.costClient ?? "—"} · Внутр.: {line.costInternal ?? "—"}
          </div>
        </div>
      ) : (
        <div className="grid gap-2 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1.7fr)_132px_132px_auto]">
          <label className="block text-[11px] font-semibold text-zinc-500">
            Название
            <input
              value={line.name}
              onChange={(e) => onSave(sectionId, line.id, { name: e.target.value })}
              className={`mt-1 w-full ${inputFieldCompact}`}
            />
          </label>
          <label className="block text-[11px] font-semibold text-zinc-500">
            Описание
            <input
              value={line.description ?? ""}
              onChange={(e) => onSave(sectionId, line.id, { description: e.target.value })}
              className={`mt-1 w-full ${inputFieldCompact}`}
            />
          </label>
          <label className="block text-[11px] font-semibold text-zinc-500">
            Клиент
            <input
              value={line.costClient ?? ""}
              onChange={(e) => onSave(sectionId, line.id, { costClient: e.target.value })}
              className={`mt-1 w-full ${inputFieldCompact}`}
              inputMode="decimal"
            />
          </label>
          <label className="block text-[11px] font-semibold text-zinc-500">
            Внутр.
            <input
              value={line.costInternal ?? ""}
              onChange={(e) => onSave(sectionId, line.id, { costInternal: e.target.value })}
              className={`mt-1 w-full ${inputFieldCompact}`}
              inputMode="decimal"
            />
          </label>
          <div className="flex flex-wrap items-end gap-2 xl:justify-end">
            {!line.orderLineId ? (
              <button
                type="button"
                disabled={busy}
                className={`${btnGhostXs} border-red-200 text-red-700 hover:bg-red-50`}
                onClick={() => void onDelete(sectionId, line.id)}
              >
                Удалить
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function AddLineForm({
  sectionId,
  busy,
  onAdd,
}: {
  sectionId: string;
  busy: boolean;
  onAdd: (
    sectionId: string,
    payload: {
      name: string;
      description: string | null;
      costClient: number | null;
      costInternal: number | null;
    },
  ) => void;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [cc, setCc] = React.useState("");
  const [ci, setCi] = React.useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(sectionId, {
      name: name.trim(),
      description: description.trim() || null,
      costClient: cc === "" ? null : parseFloat(cc.replace(",", ".")),
      costInternal: ci === "" ? null : parseFloat(ci.replace(",", ".")),
    });
    setName("");
    setDescription("");
    setCc("");
    setCi("");
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-2 border-t border-dashed border-zinc-200 pt-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_116px_116px_auto]"
    >
      <input
        placeholder="Новая строка"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={`min-w-[8rem] ${inputFieldCompact}`}
      />
      <input
        placeholder="Описание"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className={inputFieldCompact}
      />
      <input
        placeholder="Клиент"
        value={cc}
        onChange={(e) => setCc(e.target.value)}
        className={inputFieldCompact}
      />
      <input
        placeholder="Внутр."
        value={ci}
        onChange={(e) => setCi(e.target.value)}
        className={inputFieldCompact}
      />
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="min-h-10 rounded-lg border border-violet-300 bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
      >
        + строка
      </button>
    </form>
  );
}

function RequisiteSectionEditor({
  projectId,
  orderId,
  orderMeta,
  readOnly,
  onDone,
}: {
  projectId: string;
  orderId: string;
  orderMeta: { index: number; label: string; dateLabel: string; status: string; eventName: string | null } | null;
  readOnly: boolean;
  onDone: () => void;
}) {
  const [statusLegendOpen, setStatusLegendOpen] = React.useState(false);
  const [order, setOrder] = React.useState<RequisiteOrder | null>(null);
  const [catalogItems, setCatalogItems] = React.useState<
    Array<{ id: string; name: string; availableForDates?: number; pricePerDay?: number }>
  >([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lines, setLines] = React.useState<
    Array<{
      id?: string;
      itemId: string;
      name: string;
      description: string;
      requestedQty: number;
      warehouseComment: string;
      pricePerDaySnapshot: number | null;
    }>
  >([]);
  const [services, setServices] = React.useState({
    deliveryEnabled: false,
    deliveryComment: "",
    deliveryPrice: "",
    montageEnabled: false,
    montageComment: "",
    montagePrice: "",
    demontageEnabled: false,
    demontageComment: "",
    demontagePrice: "",
  });

  const editable = !readOnly && !!order && isEditableOrderStatus(order.status);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orderRes, catalogRes] = await Promise.all([
        fetch(`/api/orders/${orderId}`, { cache: "no-store" }),
        fetch(
          `/api/catalog/items?startDate=${encodeURIComponent(orderMeta?.dateLabel?.split(" — ")[0] ?? "")}&endDate=${encodeURIComponent(orderMeta?.dateLabel?.split(" — ")[1] ?? "")}&excludeOrderId=${encodeURIComponent(orderId)}`,
          { cache: "no-store" },
        ),
      ]);
      const orderJson = (await orderRes.json().catch(() => null)) as { order?: RequisiteOrder; error?: { message?: string } } | null;
      const catalogJson = (await catalogRes.json().catch(() => null)) as
        | { items?: { id: string; name: string; pricePerDay?: number; availability?: { availableForDates?: number } }[] }
        | null;
      if (!orderRes.ok || !orderJson?.order) {
        setError(orderJson?.error?.message ?? "Не удалось загрузить связанную заявку");
        setOrder(null);
        return;
      }
      const nextOrder = orderJson.order;
      setOrder(nextOrder);
      setLines(
        nextOrder.lines.map((line) => ({
          id: line.id,
          itemId: line.itemId,
          name: line.item.name,
          description: "",
          requestedQty: line.requestedQty,
          warehouseComment: line.warehouseComment ?? "",
          pricePerDaySnapshot: line.pricePerDaySnapshot,
        })),
      );
      setServices({
        deliveryEnabled: nextOrder.deliveryEnabled,
        deliveryComment: nextOrder.deliveryComment ?? "",
        deliveryPrice: nextOrder.deliveryPrice != null ? String(nextOrder.deliveryPrice) : "",
        montageEnabled: nextOrder.montageEnabled,
        montageComment: nextOrder.montageComment ?? "",
        montagePrice: nextOrder.montagePrice != null ? String(nextOrder.montagePrice) : "",
        demontageEnabled: nextOrder.demontageEnabled,
        demontageComment: nextOrder.demontageComment ?? "",
        demontagePrice: nextOrder.demontagePrice != null ? String(nextOrder.demontagePrice) : "",
      });
      setCatalogItems(
        (catalogJson?.items ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          availableForDates: item.availability?.availableForDates,
          pricePerDay: typeof item.pricePerDay === "number" ? item.pricePerDay : undefined,
        })),
      );
    } catch {
      setError("Не удалось загрузить связанную заявку");
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [orderId, orderMeta?.dateLabel]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function setServiceField<K extends keyof typeof services>(key: K, value: (typeof services)[K]) {
    setServices((prev) => ({ ...prev, [key]: value }));
  }

  function updateLine(index: number, patch: Partial<(typeof lines)[number]>) {
    setLines((prev) => prev.map((line, idx) => (idx === index ? { ...line, ...patch } : line)));
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  }

  function addLine(itemId: string, name: string, qty: number, description: string) {
    setLines((prev) => [
      ...prev,
      {
        itemId,
        name,
        description,
        requestedQty: qty,
        warehouseComment: "",
        pricePerDaySnapshot: catalogItems.find((item) => item.id === itemId)?.pricePerDay ?? null,
      },
    ]);
  }

  async function saveOrder() {
    if (!order) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/warehouse-edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryEnabled: services.deliveryEnabled,
          deliveryComment: services.deliveryComment.trim() || null,
          deliveryPrice:
            order.source === "WOWSTORG_EXTERNAL" && services.deliveryEnabled
            ? services.deliveryPrice.trim() === ""
              ? 0
              : Number(services.deliveryPrice.replace(",", "."))
            : 0,
          montageEnabled: services.montageEnabled,
          montageComment: services.montageComment.trim() || null,
          montagePrice:
            order.source === "WOWSTORG_EXTERNAL" && services.montageEnabled
            ? services.montagePrice.trim() === ""
              ? 0
              : Number(services.montagePrice.replace(",", "."))
            : 0,
          demontageEnabled: services.demontageEnabled,
          demontageComment: services.demontageComment.trim() || null,
          demontagePrice:
            order.source === "WOWSTORG_EXTERNAL" && services.demontageEnabled
            ? services.demontagePrice.trim() === ""
              ? 0
              : Number(services.demontagePrice.replace(",", "."))
            : 0,
          lines: lines.map((line) => ({
            ...(line.id ? { id: line.id } : {}),
            itemId: line.itemId,
            requestedQty: Math.max(1, Number(line.requestedQty) || 1),
            warehouseComment: line.warehouseComment.trim() || null,
          })),
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setError(json?.error?.message ?? "Не удалось сохранить заявку");
        return;
      }
      await load();
      onDone();
    } finally {
      setSaving(false);
    }
  }

  const rentalTotal = React.useMemo(() => {
    if (!order) return 0;
    const days = daysBetween(order.startDate, order.endDate);
    const multiplier = order.payMultiplier != null ? Number(order.payMultiplier) : 1;
    return lines.reduce(
      (sum, line) => sum + (line.pricePerDaySnapshot ?? 0) * line.requestedQty * days * multiplier,
      0,
    );
  }, [lines, order]);
  const servicesTotal =
    (services.deliveryEnabled ? Number(services.deliveryPrice || 0) : 0) +
    (services.montageEnabled ? Number(services.montagePrice || 0) : 0) +
    (services.demontageEnabled ? Number(services.demontagePrice || 0) : 0);

  if (loading) {
    return <div className="rounded-2xl border border-zinc-200 bg-white/80 px-4 py-4 text-sm text-zinc-600">Загрузка связанной заявки…</div>;
  }

  if (!order) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error ?? "Связанная заявка не найдена"}</div>;
  }

  return (
    <div className="space-y-4 rounded-2xl border border-violet-200/80 bg-white/90 p-3 shadow-inner">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_max-content] xl:grid-cols-[minmax(0,1fr)_200px_max-content]">
          <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Связанная заявка</div>
            <div className="mt-1 text-sm font-semibold text-violet-950">{orderMeta?.label ?? "Заявка"}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Период</div>
            <div className="mt-1 whitespace-nowrap text-sm font-semibold text-zinc-900">
              {formatDateRu(order.startDate)} — {formatDateRu(order.endDate)}
            </div>
          </div>
          <div className="relative flex items-start justify-end">
            <button
              type="button"
              onMouseEnter={() => setStatusLegendOpen(true)}
              onMouseLeave={() => setStatusLegendOpen(false)}
              onFocus={() => setStatusLegendOpen(true)}
              onBlur={() => setStatusLegendOpen(false)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white/90"
              aria-label="Статус редактирования заявки"
            >
              <span
                className={`inline-flex h-3.5 w-3.5 animate-pulse rounded-full ${
                  editable
                    ? "bg-emerald-500 shadow-[0_0_0_6px_rgba(34,197,94,0.14)]"
                    : "bg-red-500 shadow-[0_0_0_6px_rgba(239,68,68,0.12)]"
                }`}
              />
            </button>
            {statusLegendOpen ? (
              <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-2xl border border-zinc-200 bg-white p-3 text-xs shadow-xl">
                <div className="font-semibold text-zinc-900">Легенда</div>
                <div className="mt-2 flex items-center gap-2 text-zinc-700">
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  Зелёный: заявку можно редактировать из сметы
                </div>
                <div className="mt-1 flex items-center gap-2 text-zinc-700">
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                  Красный: заявка заблокирована текущим этапом
                </div>
                <div className="mt-2 text-zinc-500">Статус заявки не дублируется здесь, он уже виден в степпере сверху.</div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2 lg:justify-end">
          <Link
            href={`/orders/${order.id}?from=project`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Полная заявка
          </Link>
          {editable ? (
            <button
              type="button"
              disabled={saving || lines.length === 0}
              onClick={() => void saveOrder()}
              className={btnPrimary}
            >
              {saving ? "Сохранение…" : "Сохранить заявку"}
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</div> : null}

      <div className="space-y-3">
        <div className="space-y-3">
          <div className="space-y-2">
            {lines.map((line, index) => (
              <div key={line.id ?? `${line.itemId}-${index}`} className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1.3fr)_120px_132px_auto]">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Позиция
                    <input value={line.name} readOnly className={`mt-1 w-full ${inputField} bg-zinc-50`} />
                  </label>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Описание
                    <input
                      value={line.description}
                      onChange={(e) => updateLine(index, { description: e.target.value })}
                      className={`mt-1 w-full ${inputField}`}
                      disabled={!editable}
                      placeholder="Описание / примечание"
                    />
                  </label>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Кол-во
                    <input
                      type="number"
                      min={1}
                      value={line.requestedQty}
                      onChange={(e) => updateLine(index, { requestedQty: Math.max(1, Number(e.target.value) || 1) })}
                      className={`mt-1 w-full ${inputField}`}
                      disabled={!editable}
                    />
                  </label>
                  <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Сумма</div>
                    <div className="mt-1 text-sm font-bold text-violet-950">
                      {formatOrderMoney((line.pricePerDaySnapshot ?? 0) * line.requestedQty * daysBetween(order.startDate, order.endDate) * (order.payMultiplier != null ? Number(order.payMultiplier) : 1))} ₽
                    </div>
                  </div>
                  <div className="flex items-end justify-end gap-2">
                    {editable ? (
                      <button
                        type="button"
                        onClick={() => removeLine(index)}
                        className={`${btnGhostXs} border-red-200 text-red-700 hover:bg-red-50`}
                      >
                        Удалить
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {editable ? (
            <div className="rounded-2xl border border-dashed border-violet-300 bg-violet-50/50 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">Добавить позицию в заявку</div>
              <OrderLinePicker
                catalogItems={catalogItems}
                existingItemIds={lines.map((line) => line.itemId)}
                onAdd={addLine}
              />
            </div>
          ) : null}
        </div>
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Доп. услуги</div>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <OrderServiceCard
                title="Доставка"
                enabled={services.deliveryEnabled}
                comment={services.deliveryComment}
                price={services.deliveryPrice}
                editable={editable}
                showPrice={order.source === "WOWSTORG_EXTERNAL"}
                onEnabledChange={(value) => setServiceField("deliveryEnabled", value)}
                onCommentChange={(value) => setServiceField("deliveryComment", value)}
                onPriceChange={(value) => setServiceField("deliveryPrice", value)}
              />
              <OrderServiceCard
                title="Монтаж"
                enabled={services.montageEnabled}
                comment={services.montageComment}
                price={services.montagePrice}
                editable={editable}
                showPrice={order.source === "WOWSTORG_EXTERNAL"}
                onEnabledChange={(value) => setServiceField("montageEnabled", value)}
                onCommentChange={(value) => setServiceField("montageComment", value)}
                onPriceChange={(value) => setServiceField("montagePrice", value)}
              />
              <OrderServiceCard
                title="Демонтаж"
                enabled={services.demontageEnabled}
                comment={services.demontageComment}
                price={services.demontagePrice}
                editable={editable}
                showPrice={order.source === "WOWSTORG_EXTERNAL"}
                onEnabledChange={(value) => setServiceField("demontageEnabled", value)}
                onCommentChange={(value) => setServiceField("demontageComment", value)}
                onPriceChange={(value) => setServiceField("demontagePrice", value)}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">Итого по заявке</div>
            <div className="mt-3 space-y-2 text-sm text-zinc-700">
              <div className="flex items-center justify-between gap-3">
                <span>Аренда</span>
                <span className="font-semibold text-zinc-950">{formatOrderMoney(rentalTotal)} ₽</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Доп. услуги</span>
                <span className="font-semibold text-zinc-950">{formatOrderMoney(servicesTotal)} ₽</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-violet-200 pt-2 text-base font-bold text-violet-950">
                <span>Всего</span>
                <span>{formatOrderMoney(rentalTotal + servicesTotal)} ₽</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DraftRequisiteReadOnlyBlock({ sec }: { sec: EstSection & { kind: "DRAFT_REQUISITE" } }) {
  const total = sec.lines.reduce((sum, line) => sum + (line.costClient != null ? Number(line.costClient) : 0), 0);

  return (
    <div className="space-y-3 rounded-2xl border border-fuchsia-200/80 bg-white/90 p-3 shadow-inner">
      <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3 py-3 text-sm text-fuchsia-950">
        <div className="font-semibold">Demo-заявка пока живёт только внутри проекта.</div>
        <div className="mt-1 text-fuchsia-900/80">
          Она не резервирует остатки и не создаёт реальную заявку склада, пока не будут подтверждены даты и выполнена materialize.
        </div>
      </div>

      <div className="space-y-2">
        {sec.lines.map((line) => (
          <div key={line.id} className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1.4fr)_132px]">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Позиция</div>
                <div className="mt-1 text-sm font-semibold text-zinc-950">{line.name}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Описание</div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{line.description?.trim() || "—"}</div>
              </div>
              <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50 px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-700">Сумма</div>
                <div className="mt-1 text-sm font-bold text-fuchsia-950">
                  {formatOrderMoney(line.costClient != null ? Number(line.costClient) : 0)} ₽
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50/70 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-fuchsia-700">Предварительный итог demo-блока</div>
        <div className="mt-2 text-lg font-extrabold text-fuchsia-950">{formatOrderMoney(total)} ₽</div>
      </div>
    </div>
  );
}

function OrderLinePicker({
  catalogItems,
  existingItemIds,
  onAdd,
}: {
  catalogItems: Array<{ id: string; name: string; availableForDates?: number; pricePerDay?: number }>;
  existingItemIds: string[];
  onAdd: (itemId: string, name: string, qty: number, description: string) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [qty, setQty] = React.useState(1);
  const [description, setDescription] = React.useState("");
  const available = catalogItems.filter((item) => !existingItemIds.includes(item.id));
  const filtered =
    search.trim() === ""
      ? available
      : available.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()));
  const selected = available.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type="text"
          value={selected ? selected.name : search}
          onChange={(e) => {
            setSelectedId(null);
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Найти позицию в каталоге"
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-200"
        />
        {open ? (
          <>
            <div className="fixed inset-0 z-10" aria-hidden onClick={() => setOpen(false)} />
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-2xl border border-zinc-200 bg-white p-1 shadow-lg">
              {filtered.length === 0 ? (
                <div className="px-3 py-3 text-sm text-zinc-500">Нет доступных позиций</div>
              ) : (
                filtered.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-violet-50"
                    onClick={() => {
                      setSelectedId(item.id);
                      setSearch("");
                      setOpen(false);
                    }}
                  >
                    <span>{item.name}</span>
                    {item.availableForDates != null ? (
                      <span className="text-xs text-zinc-500">Доступно: {item.availableForDates}</span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </>
        ) : null}
      </div>

      {selected ? (
        <div className="grid gap-2 md:grid-cols-[120px_minmax(0,1fr)_auto]">
          <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Кол-во
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              className={`mt-1 w-28 ${inputField}`}
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Описание
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`mt-1 w-full ${inputField}`}
              placeholder="Описание для новой строки"
            />
          </label>
          <button
            type="button"
            className={`${btnPrimary} self-end`}
            onClick={() => {
              onAdd(selected.id, selected.name, qty, description);
              setSelectedId(null);
              setQty(1);
              setDescription("");
            }}
          >
            Добавить
          </button>
        </div>
      ) : null}
    </div>
  );
}

function OrderServiceCard({
  title,
  enabled,
  comment,
  price,
  editable,
  showPrice,
  onEnabledChange,
  onCommentChange,
  onPriceChange,
}: {
  title: string;
  enabled: boolean;
  comment: string;
  price: string;
  editable: boolean;
  showPrice: boolean;
  onEnabledChange: (value: boolean) => void;
  onCommentChange: (value: string) => void;
  onPriceChange: (value: string) => void;
}) {
  return (
    <div className={`rounded-xl border bg-white/90 px-3 py-2 transition-all ${enabled ? "border-violet-200 shadow-sm" : "border-zinc-200"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-zinc-900">{title}</div>
        <button
          type="button"
          onClick={() => editable && onEnabledChange(!enabled)}
          disabled={!editable}
          className={[
            "relative inline-flex h-7 w-12 items-center rounded-full border transition",
            enabled ? "border-violet-500 bg-violet-600" : "border-zinc-300 bg-zinc-200",
            !editable ? "cursor-not-allowed opacity-60" : "",
          ].join(" ")}
          role="switch"
          aria-checked={enabled}
          aria-label={title}
        >
          <span
            className={[
              "inline-flex h-5 w-5 rounded-full bg-white shadow transition-transform",
              enabled ? "translate-x-6" : "translate-x-1",
            ].join(" ")}
          />
        </button>
      </div>
      {enabled ? (
        <div className="mt-3 grid gap-3">
          <input
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            className={inputField}
            disabled={!editable}
            placeholder="Комментарий"
          />
          {showPrice ? (
            <input
              value={price}
              onChange={(e) => onPriceChange(e.target.value)}
              className={inputField}
              disabled={!editable}
              placeholder="Цена"
              inputMode="decimal"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
