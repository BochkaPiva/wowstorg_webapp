"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { AppShell } from "@/app/_ui/AppShell";
import { LoadingRegion, Skeleton } from "@/app/_ui/Skeleton";
import { priceFreshness, type ContractorPriceType } from "@/lib/contractor-offers";
import { PROPOSAL_STATUS, proposalMoney, proposalTotals, type Proposal, type ProposalItem } from "@/lib/proposals";
import { proposalNextStep } from "@/lib/proposal-guidance";
import { proposalBudget } from "@/lib/proposal-summary";
import { useAuth } from "@/app/providers";
import { formFields, proposalCommandLabel, readProposalRecovery, restoreFormFields, type ProposalCommand, type ProposalHistoryEntry, type ProposalRecovery } from "@/lib/proposal-recovery";
import { dispatchProposalCommand, isQueuedId, projectProposalCommands } from "@/lib/proposal-outbox";
import { ProposalApiError, proposalCommandRequest, proposalRequest } from "./api";
import { proposalOrder } from "@/lib/proposal-order";
import { ProposalMoveHandle, type ProposalDrop } from "./ProposalMoveHandle";
import { ProposalComparison } from "./ProposalComparison";
import base from "./proposals.module.css";
import styles from "./workspace.module.css";

type Category = { id: string; name: string };
type Offer = { id: string; title: string; description: string | null; clientPrice: number | null; clientPriceMax: number | null; priceType: ContractorPriceType; unitLabel: string | null; priceConfirmedAt: string | null; category: Category };
type Contractor = { id: string; name: string; photoUrl: string | null; offers: Offer[] };
type Drawer = { kind: "catalog"; sectionId: string } | { kind: "item"; item: ProposalItem } | { kind: "manual"; sectionId: string } | { kind: "convert" } | { kind: "transfer" } | { kind: "document" } | null;

function Photo({ url, name }: { url?: string | null; name: string }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [url]);
  return <div className={styles.photo}>{url && !failed ? <Image src={url} alt={name} fill sizes="100px" unoptimized onError={() => setFailed(true)} /> : <span>{name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("")}</span>}</div>;
}

function priceLabel(price: number | null, type: ContractorPriceType, qty = 1, max?: number | null) {
  if (price == null) return "По запросу";
  if (type === "RANGE" && max != null) return `${proposalMoney(price * qty)} — ${proposalMoney(max * qty)}`;
  return `${type === "FROM" || type === "RANGE" ? "от " : ""}${proposalMoney(price * qty)}`;
}

const roleLabel: Record<ProposalItem["selectionRole"], string> = { PRIMARY: "Включено", ALTERNATIVE: "Альтернатива", OPTIONAL: "Дополнительно", EXCLUDED: "Не включать" };

export function ProposalWorkspace({ proposalId, embedded = false }: { proposalId: string; embedded?: boolean }) {
  const router = useRouter();
  const { state: auth } = useAuth();
  const recoveryKey = auth.status === "authenticated" ? `wowstorg:proposal-recovery:v1:${auth.user.id}:${proposalId}` : null;
  const [proposal, setProposal] = React.useState<Proposal | null>(null);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [contractors, setContractors] = React.useState<Contractor[]>([]);
  const [catalogLoading, setCatalogLoading] = React.useState(false);
  const [catalogLoaded, setCatalogLoaded] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [conflict, setConflict] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [variantId, setVariantId] = React.useState("");
  const [sectionId, setSectionId] = React.useState("");
  const [drawer, setDrawerState] = React.useState<Drawer>(null);
  const [mode, setMode] = React.useState<"compose" | "compare" | "preview">("compose");
  const [sectionForm, setSectionForm] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("");
  const [catalogQuery, setCatalogQuery] = React.useState("");
  const [catalogCursor, setCatalogCursor] = React.useState<string | null>(null);
  const [catalogReload, setCatalogReload] = React.useState(0);
  const [catalogMoreLoading, setCatalogMoreLoading] = React.useState(false);
  const catalogGeneration = React.useRef(0);
  const catalogMoreFlight = React.useRef(false);
  const inFlight = React.useRef(false);
  const drawerRef = React.useRef<HTMLElement>(null);
  const transferId = React.useRef<string | null>(null);
  const dirty = React.useRef(false);
  const sectionDirty = React.useRef(false);
  const sectionFormRef = React.useRef<HTMLFormElement>(null);
  const [undoStack, setUndoStack] = React.useState<ProposalHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = React.useState<ProposalHistoryEntry[]>([]);
  const [recovery, setRecovery] = React.useState<ProposalRecovery | null>(null);
  const [pending, setPending] = React.useState<ProposalRecovery["pending"]>(null);
  const [queued, setQueued] = React.useState<ProposalCommand[]>([]);
  const queuedRef = React.useRef<ProposalCommand[]>([]);
  const previews = React.useRef(new Map<string, ProposalItem>());
  const [paused, setPaused] = React.useState(false);
  const mounted = React.useRef(true);
  const [storageWarning, setStorageWarning] = React.useState("");
  const recoveryRead = React.useRef<string | null>(null);
  const recoveryGate = React.useRef(false);
  const restoredFields = React.useRef<ProposalRecovery | null>(null);
  const afterCommands = React.useRef(new Map<string, { run: (next: Proposal) => void; context: number }>());
  const contextVersion = React.useRef(0);
  const persistedJournal = React.useRef("");
  const [drag, setDrag] = React.useState<{ target: ProposalDrop | null; source: string } | null>(null);

  function persistRecovery(next?: Partial<ProposalRecovery>) {
    if (!recoveryKey || !proposal || recoveryGate.current) return false;
    const activeDrawer = drawer && ["item", "manual", "document", "convert"].includes(drawer.kind) && dirty.current ? {
      kind: drawer.kind as NonNullable<ProposalRecovery["drawer"]>["kind"],
      targetId: drawer.kind === "item" ? drawer.item.id : drawer.kind === "manual" ? drawer.sectionId : undefined,
      fields: formFields(drawerRef.current?.querySelector("form") ?? null) ?? {},
    } : null;
    const data: ProposalRecovery = { version: 1, revision: proposal.revision, savedAt: new Date().toISOString(),
      variantId, sectionId: target?.id ?? sectionId, drawer: activeDrawer,
      sectionFields: sectionDirty.current ? formFields(sectionFormRef.current) : null,
      undo: undoStack, redo: redoStack, pending, queued: queuedRef.current, ...next };
    try {
      const fingerprint = JSON.stringify({ ...data, savedAt: "" });
      if (persistedJournal.current === fingerprint) return true;
      if (!data.drawer && !data.sectionFields && !data.pending && !data.queued.length && !data.undo.length && !data.redo.length) localStorage.removeItem(recoveryKey);
      else localStorage.setItem(recoveryKey, JSON.stringify(data));
      persistedJournal.current = fingerprint;
      return true;
    } catch { setStorageWarning("Браузер не разрешил сохранить резервную копию. Изменение не отправлено: освободите место или разрешите локальное хранилище."); return false; }
  }
  const persistLatest = React.useRef(persistRecovery);
  React.useLayoutEffect(() => { persistLatest.current = persistRecovery; });
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  React.useEffect(() => {
    if (!proposal || !recoveryKey || recoveryRead.current === recoveryKey) return;
    recoveryRead.current = recoveryKey;
    try {
      const saved = readProposalRecovery(localStorage.getItem(recoveryKey));
      if (!saved) return;
      if (saved.drawer || saved.sectionFields || saved.pending || saved.queued.length) { recoveryGate.current = true; setRecovery(saved); }
      else if (saved.revision === proposal.revision) { setUndoStack(saved.undo); setRedoStack(saved.redo); }
    } catch { setStorageWarning("Локальное восстановление недоступно в этом браузере."); }
  }, [proposal, recoveryKey]);

  React.useEffect(() => {
    if (!restoredFields.current) return;
    const saved = restoredFields.current;
    if (saved.drawer) restoreFormFields(drawerRef.current?.querySelector("form") ?? null, saved.drawer.fields);
    if (saved.sectionFields) restoreFormFields(sectionFormRef.current, saved.sectionFields);
    dirty.current = Boolean(saved.drawer); sectionDirty.current = Boolean(saved.sectionFields);
    restoredFields.current = null;
  }, [drawer, sectionForm]);
  React.useEffect(() => { if (recoveryRead.current === recoveryKey) persistRecovery(); });

  function openDrawer(next: Drawer) {
    if (dirty.current && !window.confirm("В форме есть несохранённые изменения. Закрыть без сохранения?")) return false;
    contextVersion.current += 1;
    dirty.current = false; persistRecovery({ drawer: null }); setDrawerState(next); return true;
  }
  function setDrawer(next: Drawer) { openDrawer(next); }
  function discardContext() {
    if ((dirty.current || sectionDirty.current) && !window.confirm("Есть несохранённые поля. Продолжить без их сохранения?")) return false;
    dirty.current = false; sectionDirty.current = false;
    contextVersion.current += 1;
    persistRecovery({ drawer: null, sectionFields: null });
    setDrawerState(null); setSectionForm(false); return true;
  }

  const load = React.useCallback(async (signal?: AbortSignal) => {
    const data = await proposalRequest<{ proposal: Proposal }>(`/api/proposals/${proposalId}`, "GET", undefined, signal);
    setProposal(data.proposal); setConflict(false); setError("");
    setVariantId((current) => data.proposal.variants.some((variant) => variant.id === current) ? current : data.proposal.variants[0]?.id ?? "");
  }, [proposalId]);
  React.useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Ошибка загрузки"); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    void proposalRequest<{ categories: Category[] }>("/api/contractor-categories", "GET", undefined, controller.signal).then((data) => setCategories(data.categories)).catch(() => { /* Custom sections remain available if categories cannot load. */ });
    return () => controller.abort();
  }, [load]);
  React.useEffect(() => {
    if (drawer) { drawerRef.current?.focus(); drawerRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" }); }
  }, [drawer]);
  React.useEffect(() => {
    if (!drawer) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); event.stopImmediatePropagation(); openDrawer(null); } };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });
  React.useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => { if (dirty.current || sectionDirty.current || inFlight.current || queuedRef.current.length) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", onLeave); return () => window.removeEventListener("beforeunload", onLeave);
  }, []);
  const catalogSectionId = drawer?.kind === "catalog" ? drawer.sectionId : null;
  React.useEffect(() => { const timer = setTimeout(() => setCatalogQuery(search.trim()), 250); return () => clearTimeout(timer); }, [search]);
  const catalogUrl = React.useCallback((cursor?: string) => `/api/contractors?${new URLSearchParams({ paged: "1", limit: "24", search: catalogQuery, categoryId: categoryFilter, ...(cursor ? { cursor } : {}) })}`, [catalogQuery, categoryFilter]);
  React.useEffect(() => {
    catalogGeneration.current += 1;
    if (!catalogSectionId) return;
    const controller = new AbortController(); setCatalogLoading(true); setCatalogLoaded(false); setCatalogCursor(null);
    void proposalRequest<{ contractors: Contractor[]; nextCursor: string | null }>(catalogUrl(), "GET", undefined, controller.signal).then((data) => { setContractors(data.contractors); setCatalogCursor(data.nextCursor); setCatalogLoaded(true); }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Каталог не загрузился"); }).finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => controller.abort();
  }, [catalogSectionId, catalogUrl, catalogReload]);
  async function moreCatalog() {
    if (!catalogCursor || catalogMoreFlight.current || catalogLoading) return;
    const version = catalogGeneration.current; catalogMoreFlight.current = true; setCatalogMoreLoading(true);
    try {
      const data = await proposalRequest<{ contractors: Contractor[]; nextCursor: string | null }>(catalogUrl(catalogCursor));
      if (version === catalogGeneration.current) { setContractors((current) => [...current, ...data.contractors.filter((row) => !current.some((old) => old.id === row.id))]); setCatalogCursor(data.nextCursor); }
    } catch (cause) { if (version === catalogGeneration.current) setError(cause instanceof Error ? cause.message : "Не удалось загрузить ещё"); }
    finally { catalogMoreFlight.current = false; setCatalogMoreLoading(false); }
  }

  const visibleProposal = React.useMemo(() => proposal ? projectProposalCommands(proposal, [...(pending ? [pending] : []), ...queued], previews.current) : null, [proposal, pending, queued]);
  const variant = visibleProposal?.variants.find((entry) => entry.id === variantId) ?? visibleProposal?.variants[0];
  const sections = variant?.sections ?? [];
  const items = sections.flatMap((section) => section.items);
  const totals = proposalTotals(items);
  const budget = proposalBudget(items);
  const target = sections.find((section) => section.id === sectionId) ?? sections[0];
  const readOnly = proposal?.owner?.type === "PROJECT" && Boolean(proposal.owner.archivedAt);
  const locked = (busy && !pending) || conflict || readOnly || paused || Boolean(recovery);
  const unconfirmed = Boolean(pending) || queued.length > 0;
  const nextStep = proposalNextStep(variant, visibleProposal?.clientIntro ?? null);

  function dragTarget(drop: ProposalDrop | null, source?: string) {
    setDrag((current) => !source ? null : current?.source === source && current.target?.kind === drop?.kind && current.target?.id === drop?.id && current.target?.placement === drop?.placement ? current : { target: drop, source });
  }
  function dropState(kind: "section" | "item", id: string) {
    return drag?.target?.kind === kind && drag.target.id === id ? drag.target.placement : undefined;
  }
  const dropName = drag?.target?.kind === "section" ? sections.find((section) => section.id === drag.target!.id)?.title : items.find((item) => item.id === drag?.target?.id)?.offerTitleSnapshot;
  function moveSection(id: string, beforeId: string | null) {
    const ids = sections.map((section) => section.id);
    if (locked || proposalOrder(ids, id, beforeId).every((entry, index) => entry === ids[index]) || !discardContext()) return;
    void mutate({ action: "MOVE_SECTION", sectionId: id, beforeId });
  }
  function moveItem(id: string, destinationId: string, beforeId: string | null) {
    const source = sections.find((section) => section.items.some((item) => item.id === id));
    const destination = sections.find((section) => section.id === destinationId);
    if (locked || !source || !destination || isQueuedId(id) || (beforeId && isQueuedId(beforeId))) return;
    const ids = destination.items.map((item) => item.id);
    if (source.id === destination.id && proposalOrder(ids, id, beforeId).every((entry, index) => entry === ids[index])) return;
    if (!discardContext()) return;
    void mutate({ action: "MOVE_ITEM", itemId: id, sectionId: destinationId, beforeId }, () => setSectionId(destinationId));
  }
  function dropSection(id: string, drop: ProposalDrop) {
    const remaining = sections.filter((section) => section.id !== id);
    const index = remaining.findIndex((section) => section.id === drop.id);
    if (index < 0) return;
    moveSection(id, drop.placement === "before" ? drop.id : remaining[index + 1]?.id ?? null);
  }
  function dropItem(id: string, drop: ProposalDrop) {
    if (drop.kind === "section") { moveItem(id, drop.id, null); return; }
    const destination = sections.find((section) => section.items.some((item) => item.id === drop.id));
    if (!destination) return;
    const remaining = destination.items.filter((item) => item.id !== id);
    const index = remaining.findIndex((item) => item.id === drop.id);
    moveItem(id, destination.id, drop.placement === "before" ? drop.id : remaining[index + 1]?.id ?? null);
  }

  function followNextStep() {
    if (nextStep.kind === "SECTION") { setSectionForm(true); return; }
    if (nextStep.kind === "CATALOG" && nextStep.sectionId) { void openCatalog(nextStep.sectionId); return; }
    if (nextStep.kind === "ITEM") {
      const item = items.find((entry) => entry.id === nextStep.itemId);
      if (item && openDrawer({ kind: "item", item })) setSectionId(nextStep.sectionId ?? "");
      return;
    }
    if (nextStep.kind === "DOCUMENT") { openDrawer({ kind: "document" }); return; }
    if (discardContext()) setMode("preview");
  }

  function failure(cause: unknown) {
    setError(cause instanceof Error ? cause.message : "Не удалось сохранить. Попробуйте ещё раз.");
    if (cause instanceof ProposalApiError && cause.status === 409) setConflict(true);
  }
  function mutate(operation: Record<string, unknown>, after?: (next: Proposal) => void, savedForm?: "drawer" | "section") {
    if (!proposal || locked) return;
    if (queuedRef.current.length >= 50) { setError("Очередь заполнена. Дождитесь сохранения текущих изменений."); return; }
    // Ref prevents duplicate clicks even before React has painted the local projection.
    if (operation.action === "ADD_CATALOG_ITEM" && [pending, ...queuedRef.current].some(command => command?.operation.action === "ADD_CATALOG_ITEM" && command.operation.sectionId === operation.sectionId && command.operation.offerId === operation.offerId)) return;
    const command: ProposalCommand = { operation: { ...operation, action: operation.action as ProposalCommand["operation"]["action"], mutationId: crypto.randomUUID(), expectedRevision: proposal.revision }, label: proposalCommandLabel(operation.action), savedForm };
    const nextQueue = [...queuedRef.current, command];
    if (!persistRecovery({ queued: nextQueue, ...(savedForm === "drawer" ? { drawer: null } : {}), ...(savedForm === "section" ? { sectionFields: null } : {}) })) return;
    if (operation.action === "ADD_CATALOG_ITEM") {
      const match = catalogOffers.find(row => row.offer.id === operation.offerId);
      if (match) previews.current.set(command.operation.mutationId, {
        id: `queued:${command.operation.mutationId}`, offerId: match.offer.id, selectionRole: "PRIMARY", qty: 1,
        clientUnitPrice: match.offer.clientPrice, internalUnitCost: null, priceTypeSnapshot: match.offer.priceType,
        unitLabel: match.offer.unitLabel, contractorNameSnapshot: match.contractor.name, offerTitleSnapshot: match.offer.title,
        offerDescriptionSnapshot: match.offer.description, clientNote: null,
        assetSnapshot: match.contractor.photoUrl ? [{ url: match.contractor.photoUrl }] : null,
      });
    }
    if (savedForm === "drawer") { dirty.current = false; setDrawerState(null); }
    if (savedForm === "section") { sectionDirty.current = false; setSectionForm(false); }
    if (after && savedForm !== "drawer") afterCommands.current.set(command.operation.mutationId, { run: after, context: contextVersion.current });
    queuedRef.current = nextQueue; setQueued(nextQueue); setNotice("");
  }
  async function sendCommand(command: ProposalCommand, remaining = queuedRef.current) {
    if (!proposal || inFlight.current || readOnly) return;
    const recoveringRequest = recoveryGate.current && recovery?.pending?.operation.mutationId === command.operation.mutationId;
    if (!recoveringRequest && !persistLatest.current({ pending: command, queued: remaining })) { setPaused(true); return; }
    queuedRef.current = remaining; setQueued(remaining); setPending(command); setPaused(false);
    inFlight.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const data = await proposalCommandRequest<{ proposal: Proposal; changeId?: string }>(`/api/proposals/${proposalId}/mutations`, command.operation);
      if (!mounted.current) return;
      setProposal(data.proposal);
      const entry = { id: data.changeId ?? String(command.operation.mutationId), label: command.label };
      const exact = data.proposal.revision === Number(command.operation.expectedRevision) + 1;
      const previousUndo = recovery?.undo ?? undoStack, previousRedo = recovery?.redo ?? redoStack;
      const nextUndo = !exact ? [] : command.direction === "undo" ? previousUndo.slice(0, -1) : [...previousUndo, entry].slice(-50);
      const nextRedo = !exact ? [] : command.direction === "undo" ? [...previousRedo, entry].slice(-50) : command.direction === "redo" ? previousRedo.slice(0, -1) : [];
      setUndoStack(nextUndo); setRedoStack(nextRedo); setPending(null); setConflict(!exact);
      if (!exact) setError("Запрос уже сохранён, но после него КП изменилось. Загрузите актуальные данные перед следующей правкой.");
      if (!exact) {
        // Do not stamp a colleague's newer revision onto our queued commands: that would
        // silently rebase them after reload. Keep the last revision owned by this request.
        const current = recovery ?? readProposalRecovery(recoveryKey ? localStorage.getItem(recoveryKey) : null);
        if (current) {
          const stale = { ...current, revision: command.operation.expectedRevision + 1, pending: null, queued: queuedRef.current, undo: [], redo: [] };
          recoveryGate.current = true; setRecovery(stale);
          try { if (recoveryKey) localStorage.setItem(recoveryKey, JSON.stringify(stale)); } catch { setStorageWarning("Скачайте локальную копию перед закрытием редактора."); }
        }
      } else if (recoveringRequest && recovery) {
        const recovered = { ...recovery, revision: data.proposal.revision, pending: null, queued: queuedRef.current, undo: nextUndo, redo: nextRedo };
        if (recovered.drawer || recovered.sectionFields || !exact) {
          setRecovery(recovered);
          try { if (recoveryKey) localStorage.setItem(recoveryKey, JSON.stringify(recovered)); } catch { setStorageWarning("Не удалось обновить локальную копию. Скачайте её перед закрытием."); }
        } else {
          recoveryGate.current = false; setRecovery(null);
          persistLatest.current({ revision: data.proposal.revision, pending: null, undo: nextUndo, redo: nextRedo });
        }
      } else persistLatest.current({ revision: data.proposal.revision, pending: null, undo: nextUndo, redo: nextRedo });
      previews.current.delete(command.operation.mutationId);
      transferId.current = null;
      if (command.direction) setNotice(command.direction === "undo" ? "Действие отменено" : "Действие возвращено");
      const after = afterCommands.current.get(command.operation.mutationId);
      if (exact && after?.context === contextVersion.current) after.run(data.proposal);
      afterCommands.current.delete(command.operation.mutationId);
    } catch (cause) {
      if (!mounted.current) return;
      failure(cause);
      setPaused(true);
      // Definitive rejection stays in the local journal; never silently discard a submitted form.
      if (cause instanceof ProposalApiError && cause.status < 500 && !recoveringRequest) {
        queuedRef.current = [command, ...queuedRef.current]; setQueued(queuedRef.current); setPending(null);
        persistLatest.current({ pending: null });
      } else if (cause instanceof ProposalApiError && cause.status < 500 && recoveringRequest && recovery) {
        const rejected = { ...recovery, pending: null, queued: [command, ...queuedRef.current].slice(0, 50) };
        // A definitive rejection is no longer an uncertain commit. Keep its payload
        // downloadable, and allow the user to keep the server version explicitly.
        setPending(null); setRecovery(rejected); queuedRef.current = []; setQueued([]);
        try { if (recoveryKey) localStorage.setItem(recoveryKey, JSON.stringify(rejected)); } catch { setStorageWarning("Скачайте локальную копию перед закрытием редактора."); }
      }
    }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  const drainQueue = React.useEffectEvent(() => {
    if (!proposal || busy || inFlight.current || pending || paused || conflict || recovery || readOnly || !queuedRef.current.length) return;
    const [first, ...remaining] = queuedRef.current;
    void sendCommand(dispatchProposalCommand(first, proposal.revision), remaining);
  });
  React.useEffect(() => { drainQueue(); }, [proposal, busy, pending, paused, conflict, recovery, queued]);
  function history(direction: "undo" | "redo") {
    const entry = (direction === "undo" ? undoStack : redoStack).at(-1);
    if (!entry || locked || unconfirmed || inFlight.current || !discardContext()) return;
    void sendCommand({ operation: { action: "RESTORE_CHANGE", changeId: entry.id, mutationId: crypto.randomUUID(), expectedRevision: proposal!.revision }, direction, label: entry.label });
  }
  const onHistoryKey = React.useEffectEvent((event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.repeat) return;
      const element = event.target as HTMLElement;
      if (element.closest("input,textarea,select,[contenteditable=true]")) return; // Preserve native text undo.
      if (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y") {
        event.preventDefault(); history(event.shiftKey || event.key.toLowerCase() === "y" ? "redo" : "undo");
      }
  });
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => onHistoryKey(event);
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);

  function recoverDraft() {
    if (!recovery || !proposal || recovery.revision !== proposal.revision) return;
    const savedVariant = proposal.variants.find((entry) => entry.id === recovery.variantId);
    if (!savedVariant) { setError("Вариант из локальной копии больше недоступен. Скачайте копию полей."); return; }
    const savedDrawer = recovery.drawer;
    let nextDrawer: Drawer = null;
    if (savedDrawer?.kind === "item") {
      const item = savedVariant.sections.flatMap((section) => section.items).find((entry) => entry.id === savedDrawer.targetId);
      if (!item) { setError("Услуга из локальной копии больше недоступна. Скачайте копию полей."); return; }
      nextDrawer = { kind: "item", item };
    } else if (savedDrawer?.kind === "manual") {
      if (!savedVariant.sections.some((section) => section.id === savedDrawer.targetId)) return;
      nextDrawer = { kind: "manual", sectionId: savedDrawer.targetId! };
    } else if (savedDrawer) nextDrawer = { kind: savedDrawer.kind };
    restoredFields.current = recovery; setDrawerState(nextDrawer); setSectionForm(Boolean(recovery.sectionFields));
    setVariantId(recovery.variantId); setSectionId(recovery.sectionId); setUndoStack(recovery.undo); setRedoStack(recovery.redo);
    recoveryGate.current = false; setRecovery(null); setPaused(false); setMode("compose"); setNotice(recovery.queued.length ? "Продолжаем сохранение локальных изменений" : "Поля восстановлены только в форме. На сервер ничего не отправлено");
    queuedRef.current = recovery.queued; setQueued(recovery.queued);
  }
  function downloadRecovery() {
    let copy = recovery;
    try { copy ??= readProposalRecovery(recoveryKey ? localStorage.getItem(recoveryKey) : null); }
    catch { setStorageWarning("Локальная копия недоступна. Не закрывайте редактор до проверки сохранения."); }
    if (!copy) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(copy, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `kp-${proposalId}-local.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function openCatalog(id: string) {
    if (!openDrawer({ kind: "catalog", sectionId: id })) return;
    setSectionId(id); setSearch("");
    setCategoryFilter(sections.find((section) => section.id === id)?.category?.id ?? "");
    setCatalogReload((value) => value + 1);
  }
  async function refresh() {
    if (inFlight.current) return;
    if (pending) { setError("Сначала проверьте неподтверждённый запрос — повтор использует тот же идентификатор и не создаст дубли."); return; }
    if ((dirty.current || sectionDirty.current || queuedRef.current.length) && !window.confirm("Загрузить серверную версию и убрать локальные изменения? Сначала скачайте локальную копию, если её нужно сохранить.")) return;
    inFlight.current = true; setBusy(true);
    try { await load(); dirty.current = false; sectionDirty.current = false; queuedRef.current = []; setQueued([]); setPaused(false); previews.current.clear(); afterCommands.current.clear(); setSectionForm(false); transferId.current = null; setDrawerState(null); setUndoStack([]); setRedoStack([]); if (!recovery && recoveryKey) { try { localStorage.removeItem(recoveryKey); } catch { /* Browser storage may be unavailable. */ } } setNotice("Загружена актуальная версия с сервера"); }
    catch (cause) { failure(cause); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function convert(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!proposal || locked || unconfirmed || inFlight.current) return;
    const fields = new FormData(event.currentTarget); inFlight.current = true; setBusy(true); setError("");
    try {
      const owner = proposal.owner;
      const result = await proposalRequest<{ project: { id: string } }>(`/api/proposals/${proposalId}/convert`, "POST", {
        expectedRevision: proposal.revision, projectTitle: fields.get("title"),
        ...(owner?.type === "STANDALONE" && owner.customer ? { customerId: owner.customer.id } : { customerName: fields.get("customer") }),
      });
      dirty.current = false; persistRecovery({ drawer: null, sectionFields: null, undo: [], redo: [], pending: null }); router.push(`/projects/${result.project.id}`);
    } catch (cause) { failure(cause); setBusy(false); }
    finally { inFlight.current = false; }
  }
  async function transfer() {
    if (!proposal || proposal.owner?.type !== "PROJECT" || !variant || locked || unconfirmed || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    transferId.current ??= crypto.randomUUID();
    try {
      const data = await proposalRequest<{ result: { transferred: number; skipped: number } }>(`/api/projects/${proposal.owner.projectId}/proposals/${proposal.id}/transfer-to-estimate`, "POST", {
        mutationId: transferId.current, expectedProposalRevision: proposal.revision,
        variantId: variant.id, itemIds: items.filter((item) => item.selectionRole === "PRIMARY").map((item) => item.id),
      });
      transferId.current = null; setDrawer(null); setNotice(`Добавлено в смету: ${data.result.transferred}. Уже перенесено ранее: ${data.result.skipped}.`);
      if (embedded) window.dispatchEvent(new CustomEvent("project-activity-refresh"));
    } catch (cause) { failure(cause); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function changeVariant(id: string) { if (!discardContext()) return false; transferId.current = null; setVariantId(id); setSectionId(""); return true; }
  function copyVariant() {
    if (!proposal || !variant || locked || !discardContext()) return;
    setMode("compose");
    void mutate({ action: "ADD_VARIANT", title: `Вариант ${proposal.variants.length + 1}`, sourceVariantId: variant.id }, (next) => changeVariant(next.variants[next.variants.length - 1].id));
  }
  const catalogOffers = contractors.flatMap((contractor) => contractor.offers.map((offer) => ({ contractor, offer })));

  function retryRecovery() {
    if (!recovery?.pending || busy) return;
    const saved = recovery;
    // An explicit retry preserves the originally dispatched revision and UUID.
    queuedRef.current = saved.queued; setQueued(saved.queued);
    setUndoStack(saved.undo); setRedoStack(saved.redo);
    void sendCommand(saved.pending!, saved.queued);
  }
  const onEmbeddedClose = React.useEffectEvent((event: Event) => {
    if (drawer) { event.preventDefault(); openDrawer(null); return; }
    if (inFlight.current || pending || queuedRef.current.length || recovery) {
      event.preventDefault(); setNotice("Сначала завершите сохранение или разберите локальную копию."); return;
    }
    if ((dirty.current || sectionDirty.current) && !window.confirm("Закрыть редактор? Введённые поля останутся в локальной копии.")) event.preventDefault();
  });
  React.useEffect(() => {
    if (!embedded) return;
    const close = (event: Event) => onEmbeddedClose(event);
    window.addEventListener("proposal-workspace:close", close);
    return () => window.removeEventListener("proposal-workspace:close", close);
  }, [embedded]);

  const content = <div className={`${base.page} ${styles.workspace} ${embedded ? styles.embedded : ""}`} data-proposal-workspace data-mode={mode} onChange={() => persistRecovery()}>
      <span className={styles.moveAnnouncement} role="status">{drag?.target ? `${drag.target.placement === "inside" ? "Перенести в раздел" : drag.target.placement === "before" ? "Вставить перед" : "Вставить после"} «${dropName}». Escape — отменить.` : drag ? "Выберите место переноса. Escape — отменить." : ""}</span>
      {loading ? <LoadingRegion className={styles.loading}><Skeleton /><Skeleton /><Skeleton /></LoadingRegion> : !proposal ? <div className={base.error} role="alert">{error || "КП не найдено"}<button onClick={() => void refresh()}>Повторить</button></div> : <>
        <section className={styles.commandBand} aria-label="Управление КП">
        <header className={styles.header}>
          <div><h1>{visibleProposal?.title}</h1><p>{proposal.owner?.type === "PROJECT" ? embedded ? proposal.owner.title : <Link href={`/projects/${proposal.owner.projectId}`}>{proposal.owner.title}</Link> : proposal.owner?.type === "STANDALONE" ? proposal.owner.customer?.name ?? proposal.owner.leadCustomerName ?? "Временное КП · без проекта" : "КП"} <span>· {PROPOSAL_STATUS[proposal.status]}</span></p></div>
          <div className={styles.headerActions}><div className={styles.historyControls} role="group" aria-label="История действий"><button disabled={locked || unconfirmed || !undoStack.length} aria-label="Отменить действие" title={`Ctrl+Z${undoStack.length ? ` · ${undoStack.at(-1)!.label}` : ""}`} onClick={() => history("undo")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5-5 5 5 5M4 10h9a6 6 0 0 1 0 12" /></svg></button><button disabled={locked || unconfirmed || !redoStack.length} aria-label="Вернуть действие" title={`Ctrl+Shift+Z${redoStack.length ? ` · ${redoStack.at(-1)!.label}` : ""}`} onClick={() => history("redo")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 5 5-5 5m5-5h-9a6 6 0 0 0 0 12" /></svg></button></div><span className={styles.saveState} role="status" data-pending={unconfirmed && !paused || undefined}>{conflict ? "Конфликт версий" : paused || recovery ? "Нужна проверка" : unconfirmed || busy ? `Сохраняем${queued.length ? ` · ещё ${queued.length}` : ""}…` : "Сохранено"}</span>{mode === "preview" ? <button className={base.secondary} disabled={unconfirmed || busy || Boolean(recovery) || conflict} onClick={() => window.print()}>Печать / PDF</button> : null}{proposal.owner?.type === "STANDALONE" ? <button className={base.primary} disabled={locked || unconfirmed} onClick={() => { if (openDrawer({ kind: "convert" })) setMode("compose"); }}>Создать проект</button> : <button className={base.primary} disabled={locked || unconfirmed || !items.some((item) => item.selectionRole === "PRIMARY")} onClick={() => { if (openDrawer({ kind: "transfer" })) { transferId.current = null; setMode("compose"); } }}>В смету</button>}</div>
        </header>
        {error ? <div className={styles.recovery} role="alert"><span>{error}</span><div className={styles.recoveryActions}>{paused ? <button className={base.quiet} onClick={downloadRecovery}>Скачать локальную копию</button> : null}{!pending ? <button className={base.quiet} disabled={busy} onClick={() => void refresh()}>Загрузить с сервера</button> : null}</div></div> : null}
        {storageWarning ? <p className={styles.context} role="alert">{storageWarning}</p> : null}
        {pending && paused && !busy ? <div className={styles.recovery} role="status"><span>Связь прервалась. Изменение осталось в локальной копии.</span><button className={base.secondary} onClick={() => void sendCommand(pending)}>Проверить сохранение</button></div> : null}
        {recovery ? <div className={styles.recovery} role="status"><div><strong>{recovery.pending ? "Проверим последнее сохранение" : "Есть локальная копия"}</strong><p>{recovery.revision === proposal.revision ? "Можно продолжить с сохранёнными полями и очередью изменений." : "На сервере новая версия. Локальная копия не перезапишет работу коллег."}</p></div><div className={styles.recoveryActions}>{recovery.pending ? <button className={base.secondary} disabled={busy} onClick={retryRecovery}>Проверить сохранение</button> : recovery.revision === proposal.revision ? <button className={base.secondary} onClick={recoverDraft}>{recovery.queued.length ? "Продолжить сохранение" : "Восстановить поля"}</button> : null}<button className={base.quiet} onClick={downloadRecovery}>Скачать локальную копию</button>{!recovery.pending ? <button className={base.quiet} disabled={busy} onClick={() => { if (!window.confirm("Удалить только локальную копию? Серверное КП останется без изменений.")) return; recoveryGate.current = false; setRecovery(null); setUndoStack([]); setRedoStack([]); if (recoveryKey) { try { localStorage.removeItem(recoveryKey); } catch { /* No server write. */ } } }}>Оставить серверную версию</button> : null}</div></div> : null}
        <div className={styles.modeBar}><div className={base.tabs}><button aria-pressed={mode === "compose"} onClick={() => setMode("compose")}>Состав мероприятия</button><button aria-pressed={mode === "compare"} onClick={() => { if (discardContext()) setMode("compare"); }}>Сравнить варианты</button><button aria-pressed={mode === "preview"} onClick={() => { if (discardContext()) setMode("preview"); }}>Вид для клиента</button></div><div><span className={styles.notice} role="status">{notice}</span><button className={base.quiet} disabled={locked} onClick={() => { if (openDrawer({ kind: "document" })) setMode("compose"); }}>Оформление КП</button></div></div>
        {mode !== "compare" ? <div className={styles.variants} role="group" aria-label="Варианты КП">{proposal.variants.map((entry) => <button key={entry.id} aria-pressed={entry.id === variant?.id} onClick={() => changeVariant(entry.id)}>{entry.title}</button>)}{mode === "compose" ? <button disabled={locked || !variant} onClick={copyVariant}>+ Новый вариант</button> : null}</div> : null}
        </section>
        {mode === "compare" ? <><ProposalComparison variants={visibleProposal?.variants ?? []} activeVariantId={variant?.id ?? ""} disabled={false} copyDisabled={locked || !variant} onCopy={copyVariant} Photo={Photo} onOpen={(id, nextMode) => { if (changeVariant(id)) setMode(nextMode); }} /><p className={styles.comparisonPrintNotice}>Чтобы сохранить КП в PDF, откройте «Вид для клиента» нужного варианта. Экспорт таблицы сравнения пока не подключён.</p></> : null}
        <article className={styles.preview} data-hidden={mode !== "preview"} aria-hidden={mode !== "preview"}>
          <div className={styles.previewBrand}>ВАУСТОРГ</div><h2>{visibleProposal?.title}</h2><p>{variant?.title}</p>
          {visibleProposal?.clientIntro ? <p className={styles.prose}>{visibleProposal.clientIntro}</p> : null}
          {sections.map((section) => <section key={section.id}><h3>{section.title}</h3>{section.items.filter((item) => item.selectionRole !== "EXCLUDED").map((item) => <div className={styles.previewItem} key={item.id}><Photo url={item.assetSnapshot?.[0]?.url} name={item.offerTitleSnapshot} /><div><h4>{item.offerTitleSnapshot}</h4><p>{item.offerDescriptionSnapshot}</p>{item.clientNote ? <p>{item.clientNote}</p> : null}<small>{roleLabel[item.selectionRole]} · {item.qty} {item.unitLabel ?? "шт."}</small></div><strong>{priceLabel(item.clientUnitPrice, item.priceTypeSnapshot, item.qty)}</strong></div>)}</section>)}
          <footer><span>{totals.preliminary ? "Предварительно, от" : "Основной состав"}</span><strong>{proposalMoney(totals.client)}</strong>{totals.unresolved ? <p>Дополнительно {totals.unresolved} услуг с ценой по запросу. Они не включены в итог.</p> : null}<p>Альтернативы и дополнительные опции не входят в основной итог. Наличие и финальная стоимость уточняются перед согласованием.</p></footer>
          {visibleProposal?.clientOutro ? <p className={styles.prose}>{visibleProposal.clientOutro}</p> : null}
        </article>{mode === "compose" ? <div className={styles.layout} data-drawer={Boolean(drawer)}>
          <aside className={styles.outline} aria-label="Структура мероприятия"><h2>Мероприятие</h2><div className={styles.outlineList}>{sections.map((section, index) => <div className={styles.outlineRow} key={section.id} data-proposal-drop-kind="section" data-proposal-drop-id={section.id} data-drop={dropState("section", section.id)} data-moving={drag?.source === section.id || undefined}>
            <ProposalMoveHandle kind="section" id={section.id} name={section.title} disabled={locked} canUp={index > 0} canDown={index < sections.length - 1} onTarget={dragTarget} onDrop={(drop) => dropSection(section.id, drop)} onStep={(direction) => moveSection(section.id, direction === -1 ? sections[index - 1].id : sections[index + 2]?.id ?? null)} />
            <button className={styles.outlineChoice} aria-pressed={section.id === target?.id} onClick={() => { if (openDrawer(null)) setSectionId(section.id); }}><span>{section.title}</span><small>{section.items.length} услуг</small></button>
          </div>)}</div><button className={base.quiet} disabled={locked} aria-expanded={sectionForm} onClick={() => { if (sectionForm && sectionDirty.current && !window.confirm("Закрыть раздел без сохранения введённых полей?")) return; contextVersion.current += 1; sectionDirty.current = false; setSectionForm(!sectionForm); }}>Добавить раздел</button>
            {sectionForm ? <form ref={sectionFormRef} className={styles.form} onChangeCapture={() => { sectionDirty.current = true; }} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void mutate({ action: "ADD_SECTION", variantId: variant?.id, title: data.get("title"), categoryId: data.get("category") || null }, (next) => { const created = next.variants.find((entry) => entry.id === variant?.id)?.sections.at(-1); if (created && !drawer) setSectionId(created.id); setSectionForm(false); }, "section"); }}><label>Название<input name="title" disabled={locked} minLength={2} maxLength={160} required placeholder="Например, шоу-программа" /></label><label>Категория<select name="category" disabled={locked}><option value="">Своя категория</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><button className={base.secondary} disabled={locked}>Добавить</button></form> : null}
            <div className={styles.budget}><span>Основной состав</span><strong>{budget.label}</strong>{totals.unresolved ? <small>{budget.detail}</small> : null}<dl><div><dt>Расходы</dt><dd>{totals.unconfirmedCost ? "Не все указаны" : proposalMoney(totals.cost)}</dd></div><div><dt>Маржа</dt><dd>{totals.unconfirmedCost || totals.unresolved ? "Уточните цены" : proposalMoney(totals.margin)}</dd></div></dl></div>
          </aside>
          <section className={styles.canvas} aria-label="Состав раздела">
            {!readOnly && !conflict && Boolean(target?.items.length) && !drawer && nextStep.kind !== "CATALOG" ? <div className={styles.nextStep} aria-label="Следующий шаг"><div><strong>{nextStep.title}</strong><p>{nextStep.reason}</p></div><button className={base.quiet} disabled={locked} onClick={followNextStep}>{nextStep.action}</button></div> : null}
            {target ? <><div className={styles.sectionHeading}><div><h2>{target.title}</h2><p>{target.category?.name ?? "Раздел мероприятия"}</p></div><button className={base.secondary} disabled={locked} onClick={() => void openCatalog(target.id)}>Подобрать услугу</button></div>
              {!target.items.length ? <div className={styles.emptySection}><h3>Кто сделает эту часть мероприятия?</h3><p>Выберите услугу из каталога — фото, описание и цена появятся здесь. Или добавьте свой вариант.</p><button className={base.secondary} disabled={locked} onClick={() => setDrawer({ kind: "manual", sectionId: target.id })}>Добавить свою услугу</button></div> : <div className={styles.itemList}>{target.items.map((item, index) => <div className={styles.itemRow} key={item.id} data-proposal-drop-kind="item" data-proposal-drop-id={item.id} data-drop={dropState("item", item.id)} data-moving={drag?.source === item.id || undefined}>
                <ProposalMoveHandle kind="item" id={item.id} name={item.offerTitleSnapshot} disabled={locked || isQueuedId(item.id)} canUp={index > 0} canDown={index < target.items.length - 1} onTarget={dragTarget} onDrop={(drop) => dropItem(item.id, drop)} onStep={(direction) => moveItem(item.id, target.id, direction === -1 ? target.items[index - 1].id : target.items[index + 2]?.id ?? null)} />
                <button className={styles.item} disabled={isQueuedId(item.id)} onClick={() => setDrawer({ kind: "item", item })}><Photo url={item.assetSnapshot?.[0]?.url} name={item.offerTitleSnapshot} /><div className={styles.itemCopy}><h3>{item.offerTitleSnapshot}</h3><p>{item.contractorNameSnapshot}</p>{item.offerDescriptionSnapshot ? <p className={styles.description}>{item.offerDescriptionSnapshot}</p> : null}<span>{isQueuedId(item.id) ? "Сохраняем · " : ""}{roleLabel[item.selectionRole]} · {item.qty} {item.unitLabel ?? "шт."}</span></div><strong>{priceLabel(item.clientUnitPrice, item.priceTypeSnapshot, item.qty)}</strong></button>
              </div>)}</div>}
              <div className={styles.sectionFooter}><button className={base.quiet} disabled={locked} onClick={() => setDrawer({ kind: "manual", sectionId: target.id })}>Своя услуга</button><button className={base.quiet} disabled={locked} onClick={() => { if (window.confirm(`Удалить раздел «${target.title}» и его услуги?`) && discardContext()) void mutate({ action: "REMOVE_SECTION", sectionId: target.id }, () => setSectionId("")); }}>Удалить раздел</button></div>
            </> : <div className={styles.emptySection}><h2>С чего начнём мероприятие?</h2><p>Добавьте первый раздел. Затем подберите подрядчиков и соберите несколько вариантов для клиента.</p><div className={styles.suggestions}>{categories.slice(0, 6).map((category) => <button key={category.id} className={base.secondary} disabled={locked} onClick={() => void mutate({ action: "ADD_SECTION", variantId: variant?.id, title: category.name, categoryId: category.id }, (next) => setSectionId(next.variants.find((entry) => entry.id === variant?.id)?.sections.at(-1)?.id ?? ""))}>{category.name}</button>)}</div><button className={base.quiet} disabled={locked} onClick={() => setSectionForm(true)}>Свой раздел</button></div>}
          </section>
          {drawer ? <aside className={styles.drawer} ref={drawerRef} tabIndex={-1} onChangeCapture={(event) => { if ((event.target as HTMLElement).closest("form")) dirty.current = true; }} aria-label={drawer.kind === "catalog" ? "Подбор услуг" : "Параметры КП"}><div className={styles.drawerHeading}><h2>{drawer.kind === "catalog" ? "Подбор услуг" : drawer.kind === "item" ? "Настроить услугу" : drawer.kind === "manual" ? "Своя услуга" : drawer.kind === "transfer" ? "Перенос в смету" : drawer.kind === "document" ? "Оформление КП" : "Создать проект"}</h2><button className={base.quiet} onClick={() => openDrawer(null)}>Закрыть</button></div><fieldset className={styles.drawerFields} disabled={Boolean(readOnly)}>
            {drawer.kind === "item" && sections.length > 1 ? <label className={styles.moveDestination}>Раздел услуги<select aria-label="Перенести услугу в раздел" disabled={locked} value={sections.find((section) => section.items.some((item) => item.id === drawer.item.id))?.id ?? target?.id} onChange={(event) => moveItem(drawer.item.id, event.target.value, null)}>{sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}</select><small>Переносит услугу целиком. Можно отменить через Ctrl+Z.</small></label> : null}
            {drawer.kind === "catalog" ? <><p className={styles.context}>В раздел «{sections.find((section) => section.id === drawer.sectionId)?.title}»</p><input autoFocus aria-label="Найти подрядчика или услугу" placeholder="Подрядчик или услуга" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Категория услуг" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">Все категории</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{catalogLoading ? <LoadingRegion className={styles.loading}><Skeleton /><Skeleton /></LoadingRegion> : !catalogLoaded ? <button className={base.secondary} onClick={() => void openCatalog(drawer.sectionId)}>Повторить загрузку каталога</button> : catalogOffers.length ? <div className={styles.offerList}>{catalogOffers.map(({ contractor, offer }) => {
              const added = sections.find((section) => section.id === drawer.sectionId)?.items.some((item) => item.offerId === offer.id);
              return <div className={styles.offer} key={offer.id}><Photo url={contractor.photoUrl} name={contractor.name} /><div><h3>{offer.title}</h3><p>{contractor.name}</p><p>{offer.description}</p><strong>{priceLabel(offer.clientPrice, offer.priceType, 1, offer.clientPriceMax)}{offer.unitLabel ? ` / ${offer.unitLabel}` : ""}</strong><small>{priceFreshness(offer.priceConfirmedAt) === "FRESH" ? "Цена подтверждена" : "Цену нужно уточнить"}</small><button className={base.secondary} disabled={locked || added} onClick={() => void mutate({ action: "ADD_CATALOG_ITEM", sectionId: drawer.sectionId, offerId: offer.id })}>{added ? "Уже в разделе" : "Добавить в раздел"}</button></div></div>;
            })}</div> : <p className={styles.context}>Нет подходящих услуг. Выберите все категории или измените запрос.</p>}{catalogCursor && catalogLoaded ? <button className={base.secondary} disabled={catalogMoreLoading} onClick={() => void moreCatalog()}>{catalogMoreLoading ? "Загружаем…" : "Показать ещё услуги"}</button> : null}<button className={base.quiet} disabled={locked} onClick={() => setDrawer({ kind: "manual", sectionId: drawer.sectionId })}>Добавить свою услугу</button></> : null}
            {drawer.kind === "item" || drawer.kind === "manual" ? <form className={styles.form} key={drawer.kind === "item" ? drawer.item.id : drawer.sectionId} onSubmit={(event) => {
              event.preventDefault(); const data = new FormData(event.currentTarget);
              const number = (key: string) => data.get(key) === "" ? null : Number(data.get(key));
              void mutate(drawer.kind === "item" ? { action: "UPDATE_ITEM", itemId: drawer.item.id, qty: number("qty"), clientUnitPrice: number("price"), internalUnitCost: number("cost"), selectionRole: data.get("role"), clientNote: data.get("note") || null } : { action: "ADD_MANUAL_ITEM", sectionId: drawer.sectionId, title: data.get("title"), description: data.get("description") || null, clientUnitPrice: number("price"), internalUnitCost: number("cost"), unitLabel: data.get("unit") || null }, () => setDrawer(null), "drawer");
            }}>{drawer.kind === "item" ? <><h3>{drawer.item.offerTitleSnapshot}</h3><label>Количество<input name="qty" type="number" min="0.001" max="100000" step="any" required defaultValue={drawer.item.qty} /></label><label>Вариант включения<select name="role" defaultValue={drawer.item.selectionRole}>{Object.entries(roleLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></> : <><label>Название<input name="title" required minLength={2} maxLength={200} /></label><label>Описание для клиента<textarea name="description" maxLength={2000} /></label><label>Единица<input name="unit" placeholder="Мероприятие, час, человек" maxLength={80} /></label></>}
              <label>Цена клиенту за единицу<input name="price" type="number" min="0" step="0.01" placeholder="По запросу" defaultValue={drawer.kind === "item" ? drawer.item.clientUnitPrice ?? "" : ""} /></label><label>Внутренний расход за единицу<input name="cost" type="number" min="0" step="0.01" placeholder="Ещё не уточнён" defaultValue={drawer.kind === "item" ? drawer.item.internalUnitCost ?? "" : ""} /></label><p className={styles.context}>Внутренние расходы не попадают в вид для клиента.</p>{drawer.kind === "item" ? <label>Комментарий для клиента<textarea name="note" maxLength={2000} defaultValue={drawer.item.clientNote ?? ""} /></label> : null}<button className={base.primary} disabled={locked}>Сохранить</button>{drawer.kind === "item" ? <button type="button" className={base.quiet} disabled={locked} onClick={() => { if (window.confirm(`Удалить услугу «${drawer.item.offerTitleSnapshot}»?`)) void mutate({ action: "REMOVE_ITEM", itemId: drawer.item.id }, () => setDrawer(null), "drawer"); }}>Удалить услугу</button> : null}</form> : null}
            {drawer.kind === "convert" ? <form className={styles.form} onSubmit={convert}><p className={styles.context}>Все варианты, услуги и фотографии перейдут в проект. КП не будет копироваться или заменять смету.</p><label>Название проекта<input name="title" required minLength={2} maxLength={300} defaultValue={proposal.title} /></label><label>Заказчик<input name="customer" required minLength={2} maxLength={200} readOnly={proposal.owner?.type === "STANDALONE" && Boolean(proposal.owner.customer)} defaultValue={proposal.owner?.type === "STANDALONE" ? proposal.owner.customer?.name ?? proposal.owner.leadCustomerName ?? "" : ""} /></label><button className={base.primary} disabled={locked}>{busy ? "Создаём…" : "Создать проект с этим КП"}</button></form> : null}
            {drawer.kind === "transfer" ? <><p className={styles.context}>В смету добавятся основные услуги варианта «{variant?.title}». Существующие строки не будут заменены. Ранее перенесённые услуги пропускаются — их цены в смете не обновляются.</p><ul className={styles.transferList}>{items.filter((item) => item.selectionRole === "PRIMARY").map((item) => <li key={item.id}>{item.offerTitleSnapshot}<strong>{priceLabel(item.clientUnitPrice, item.priceTypeSnapshot, item.qty)}</strong></li>)}</ul>{totals.unresolved ? <p className={styles.context}>Внимание: {totals.unresolved} цен не указаны. В смете они останутся пустыми.</p> : null}<button className={base.primary} disabled={locked} onClick={() => void transfer()}>Подтвердить перенос</button></> : null}
            {drawer.kind === "document" ? <form className={styles.form} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void mutate({ action: "UPDATE_PROPOSAL", title: data.get("title"), clientIntro: data.get("intro") || null, clientOutro: data.get("outro") || null }, () => setDrawer(null), "drawer"); }}><label>Название<input name="title" defaultValue={proposal.title} required minLength={2} maxLength={200} /></label><label>Вступление для клиента<textarea name="intro" maxLength={4000} defaultValue={proposal.clientIntro ?? ""} /></label><label>Заключение<textarea name="outro" maxLength={4000} defaultValue={proposal.clientOutro ?? ""} /></label><button className={base.primary} disabled={locked}>Сохранить текст</button></form> : null}
          </fieldset></aside> : null}
        </div> : null}
      </>}
    </div>
  ;
  return embedded ? content : <AppShell title="Конструктор КП" backHref={proposal?.owner?.type === "PROJECT" ? `/projects/${proposal.owner.projectId}` : "/proposals"}>{content}</AppShell>;
}
