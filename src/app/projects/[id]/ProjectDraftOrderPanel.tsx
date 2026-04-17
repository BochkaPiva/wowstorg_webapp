"use client";

import React from "react";
import { createPortal } from "react-dom";

type DraftLine = {
  id: string;
  sortOrder: number;
  itemId: string;
  itemName: string;
  qty: number;
  comment: string | null;
  periodGroup: string | null;
  pricePerDaySnapshot: number | null;
  availableNow: number;
  lastAvailableQty: number | null;
  lastAvailabilityNote: string | null;
};

type DraftOrder = {
  id: string;
  title: string | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  lines: DraftLine[];
};

type CatalogItem = {
  id: string;
  name: string;
  pricePerDay?: number;
  availability?: { availableNow?: number };
};

type MaterializePeriod = {
  key: string;
  title: string;
  startDate: string;
  endDate: string;
  lineIds: string[];
};

const inputField =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200/50";
const primaryBtn =
  "rounded-lg border border-violet-300 bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50";
const secondaryBtn =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50";

function formatDateRu(dateOnly: string) {
  const [y, m, d] = dateOnly.split("-").map((v) => Number(v));
  if (!y || !m || !d) return dateOnly;
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

function makeTempId(prefix: string) {
  return `draft-${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function todayDateOnly() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

function digitsOnlyQty(raw: string): string {
  return raw.replace(/\D/g, "");
}

function parseQtyDisplayInt(raw: string): number {
  const t = raw.trim();
  if (t === "") return 0;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 1 ? n : 0;
}

function parseQtyCommitInt(raw: string, fallback = 1): number {
  const t = raw.trim();
  if (t === "") return fallback;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

function cloneDraft(draft: DraftOrder | null) {
  return {
    title: draft?.title ?? "",
    comment: draft?.comment ?? "",
    lines:
      draft?.lines.map((line) => ({
        ...line,
        qty: String(line.qty),
        comment: line.comment ?? "",
        periodGroup: line.periodGroup ?? "",
      })) ?? [],
  };
}

export function ProjectDraftOrderPanel({
  projectId,
  readOnly,
}: {
  projectId: string;
  readOnly: boolean;
}) {
  const [draft, setDraft] = React.useState<DraftOrder | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [title, setTitle] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [lines, setLines] = React.useState<
    Array<
      Omit<DraftLine, "comment" | "periodGroup" | "qty"> & {
        comment: string;
        periodGroup: string;
        qty: string;
      }
    >
  >([]);

  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pickerSearch, setPickerSearch] = React.useState("");
  const [catalogItems, setCatalogItems] = React.useState<CatalogItem[]>([]);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmMode, setConfirmMode] = React.useState<"single" | "manual">("single");
  const [singleStartDate, setSingleStartDate] = React.useState(todayDateOnly());
  const [singleEndDate, setSingleEndDate] = React.useState(todayDateOnly());
  const [manualPeriods, setManualPeriods] = React.useState<MaterializePeriod[]>([]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [draftRes, catalogRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/draft-order`, { cache: "no-store" }),
        fetch(`/api/catalog/items`, { cache: "no-store" }),
      ]);
      const draftJson = (await draftRes.json().catch(() => null)) as
        | { draftOrder?: DraftOrder | null; error?: { message?: string } }
        | null;
      const catalogJson = (await catalogRes.json().catch(() => null)) as
        | { items?: CatalogItem[] }
        | null;

      if (!draftRes.ok) {
        setError(draftJson?.error?.message ?? "Не удалось загрузить demo-черновик");
        setDraft(null);
      } else {
        setDraft(draftJson?.draftOrder ?? null);
        const next = cloneDraft(draftJson?.draftOrder ?? null);
        setTitle(next.title);
        setComment(next.comment);
        setLines(next.lines);
      }
      setCatalogItems(catalogJson?.items ?? []);
    } catch {
      setError("Не удалось загрузить demo-черновик");
      setDraft(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function notifyRefresh() {
    window.dispatchEvent(new CustomEvent("project-activity-refresh"));
  }

  const dirty = React.useMemo(() => {
    const current = JSON.stringify({
      title: title.trim(),
      comment: comment.trim(),
      lines: lines.map((line, index) => ({
        itemId: line.itemId,
        itemName: line.itemName,
        qty: parseQtyCommitInt(line.qty, 1),
        comment: line.comment.trim(),
        periodGroup: line.periodGroup.trim(),
        sortOrder: index,
      })),
    });
    const base = JSON.stringify({
      title: draft?.title?.trim() ?? "",
      comment: draft?.comment?.trim() ?? "",
      lines: (draft?.lines ?? []).map((line, index) => ({
        itemId: line.itemId,
        itemName: line.itemName,
        qty: line.qty,
        comment: line.comment?.trim() ?? "",
        periodGroup: line.periodGroup?.trim() ?? "",
        sortOrder: index,
      })),
    });
    return current !== base;
  }, [comment, draft, lines, title]);

  const availableItems = React.useMemo(() => {
    const existing = new Set(lines.map((line) => line.itemId));
    const filtered = catalogItems.filter((item) => !existing.has(item.id));
    if (!pickerSearch.trim()) return filtered;
    return filtered.filter((item) => item.name.toLowerCase().includes(pickerSearch.trim().toLowerCase()));
  }, [catalogItems, lines, pickerSearch]);

  const periodGroups = React.useMemo(() => {
    const keys = new Set(lines.map((line) => line.periodGroup.trim()).filter(Boolean));
    return [...keys];
  }, [lines]);

  async function saveDraft() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/draft-order`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || null,
          comment: comment.trim() || null,
          lines: lines.map((line, index) => ({
            id: line.id.startsWith("draft-") ? undefined : line.id,
            itemId: line.itemId,
            itemName: line.itemName,
            qty: parseQtyCommitInt(line.qty, 1),
            comment: line.comment.trim() || null,
            periodGroup: line.periodGroup.trim() || null,
            pricePerDaySnapshot: line.pricePerDaySnapshot,
            sortOrder: index,
          })),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { draftOrder?: DraftOrder; error?: { message?: string } }
        | null;
      if (!res.ok || !data?.draftOrder) {
        setError(data?.error?.message ?? "Не удалось сохранить demo-черновик");
        return;
      }
      setDraft(data.draftOrder);
      const next = cloneDraft(data.draftOrder);
      setTitle(next.title);
      setComment(next.comment);
      setLines(next.lines);
      notifyRefresh();
    } finally {
      setBusy(false);
    }
  }

  function addItem(item: CatalogItem) {
    setLines((prev) => [
      ...prev,
      {
        id: makeTempId("draft-line"),
        sortOrder: prev.length,
        itemId: item.id,
        itemName: item.name,
        qty: "1",
        comment: "",
        periodGroup: "",
        pricePerDaySnapshot: typeof item.pricePerDay === "number" ? item.pricePerDay : null,
        availableNow: item.availability?.availableNow ?? 0,
        lastAvailableQty: null,
        lastAvailabilityNote: null,
      },
    ]);
    setPickerSearch("");
    setPickerOpen(false);
  }

  function updateLine(index: number, patch: Partial<(typeof lines)[number]>) {
    setLines((prev) => prev.map((line, idx) => (idx === index ? { ...line, ...patch } : line)));
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  }

  function resetManualPeriods() {
    const groups = periodGroups.length > 0 ? periodGroups : ["default"];
    const today = todayDateOnly();
    setManualPeriods(
      groups.map((group, index) => ({
        key: group,
        title: group === "default" ? `Период ${index + 1}` : group,
        startDate: today,
        endDate: today,
        lineIds: lines.filter((line) => (group === "default" ? !line.periodGroup.trim() : line.periodGroup.trim() === group)).map((line) => line.id),
      })),
    );
  }

  React.useEffect(() => {
    if (confirmOpen && confirmMode === "manual") {
      resetManualPeriods();
    }
  }, [confirmMode, confirmOpen]);

  async function materialize() {
    if (dirty) {
      setError("Сначала сохрани demo-черновик перед подтверждением дат.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const periods =
        confirmMode === "single"
          ? [
              {
                key: "single",
                title: "Общий период",
                readyByDate: singleStartDate,
                startDate: singleStartDate,
                endDate: singleEndDate,
                lineIds: lines.map((line) => line.id),
              },
            ]
          : manualPeriods.map((period) => ({
              key: period.key,
              title: period.title,
              readyByDate: period.startDate,
              startDate: period.startDate,
              endDate: period.endDate,
              lineIds: period.lineIds,
            }));
      const res = await fetch(`/api/projects/${projectId}/draft-order/materialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periods }),
      });
      const data = (await res.json().catch(() => null)) as
        | { createdOrders?: Array<{ id: string }>; error?: { message?: string } }
        | null;
      if (!res.ok) {
        setError(data?.error?.message ?? "Не удалось подтвердить даты");
        return;
      }
      setConfirmOpen(false);
      await load();
      notifyRefresh();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="rounded-2xl border border-fuchsia-200 bg-white px-4 py-4 text-sm text-zinc-600">Загрузка demo-черновика…</div>;
  }

  return (
    <div className="space-y-4 rounded-2xl border border-fuchsia-200 bg-[linear-gradient(180deg,rgba(253,244,255,0.95),rgba(255,255,255,0.98))] p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-extrabold tracking-tight text-fuchsia-950">Demo-заявка без дат</div>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            Собирай позиции заранее, не создавая реальную складскую заявку. После подтверждения дат система проверит доступность и материализует 1..N заявок выдачи для третьих лиц (проектные); дата готовности в заявке совпадает с датой начала периода.
          </p>
        </div>
        {!readOnly ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setConfirmOpen(true)} disabled={busy || lines.length === 0} className={secondaryBtn}>
              Подтвердить даты
            </button>
            <button type="button" onClick={() => void saveDraft()} disabled={busy || !dirty} className={primaryBtn}>
              {busy ? "Сохраняю…" : "Сохранить demo-черновик"}
            </button>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          Название demo-набора
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={`mt-1 ${inputField}`}
            placeholder="Например, Сцена / мебель / бренд-зона"
            disabled={readOnly}
          />
        </label>
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          Общий комментарий
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className={`mt-1 ${inputField}`}
            placeholder="Контекст для будущей materialize"
            disabled={readOnly}
          />
        </label>
      </div>

      {!readOnly ? (
        <div className="rounded-2xl border border-dashed border-fuchsia-300 bg-white/75 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fuchsia-700">Добавить позицию из каталога</div>
          <div className="relative">
            <input
              value={pickerSearch}
              onChange={(e) => {
                setPickerSearch(e.target.value);
                setPickerOpen(true);
              }}
              onFocus={() => setPickerOpen(true)}
              placeholder="Найти позицию без указания дат"
              className={inputField}
            />
            {pickerOpen ? (
              <>
                <div className="fixed inset-0 z-10" aria-hidden onClick={() => setPickerOpen(false)} />
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-2xl border border-zinc-200 bg-white p-1 shadow-lg">
                  {availableItems.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-zinc-500">Нет доступных позиций для добавления</div>
                  ) : (
                    availableItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-fuchsia-50"
                        onClick={() => addItem(item)}
                      >
                        <span>{item.name}</span>
                        <span className="text-xs text-zinc-500">Свободно сейчас: {item.availability?.availableNow ?? 0}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {!lines.length ? (
        <div className="rounded-xl border border-zinc-200 bg-white/70 px-3 py-4 text-sm text-zinc-600">Пока нет позиций в demo-черновике.</div>
      ) : (
        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={line.id} className="rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_120px_minmax(0,1fr)_140px_120px_auto]">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Позиция</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-950">{line.itemName}</div>
                  <div className="mt-1 text-xs text-zinc-500">Свободно сейчас: {line.availableNow}</div>
                </div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Кол-во
                  <input
                    value={line.qty}
                    inputMode="numeric"
                    onChange={(e) => updateLine(index, { qty: digitsOnlyQty(e.target.value) })}
                    onBlur={() => updateLine(index, { qty: String(parseQtyCommitInt(line.qty, 1)) })}
                    className={`mt-1 ${inputField} tabular-nums`}
                    disabled={readOnly}
                  />
                </label>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Комментарий
                  <input
                    value={line.comment}
                    onChange={(e) => updateLine(index, { comment: e.target.value })}
                    className={`mt-1 ${inputField}`}
                    placeholder="Описание / примечание"
                    disabled={readOnly}
                  />
                </label>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Группа периода
                  <input
                    value={line.periodGroup}
                    onChange={(e) => updateLine(index, { periodGroup: e.target.value })}
                    className={`mt-1 ${inputField}`}
                    placeholder="Например, День 1"
                    disabled={readOnly}
                  />
                </label>
                <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50 px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-700">Предв. сумма</div>
                  <div className="mt-1 text-sm font-bold text-fuchsia-950">
                    {Math.round((line.pricePerDaySnapshot ?? 0) * parseQtyDisplayInt(line.qty)).toLocaleString("ru-RU")}{" "}
                    ₽
                  </div>
                </div>
                {!readOnly ? (
                  <div className="flex items-end justify-end">
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                    >
                      Удалить
                    </button>
                  </div>
                ) : null}
              </div>
              {line.lastAvailabilityNote ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {line.lastAvailabilityNote}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {confirmOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-950/40 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-3xl border border-zinc-200 bg-white p-5 shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xl font-extrabold tracking-tight text-zinc-950">Подтверждение дат</div>
                <p className="mt-1 text-sm text-zinc-600">
                  Выбери один общий диапазон для всего demo-черновика или разложи строки по нескольким периодам.
                </p>
              </div>
              <button type="button" className={secondaryBtn} onClick={() => setConfirmOpen(false)}>
                Закрыть
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setConfirmMode("single")}
                className={confirmMode === "single" ? primaryBtn : secondaryBtn}
              >
                Один диапазон
              </button>
              <button
                type="button"
                onClick={() => setConfirmMode("manual")}
                className={confirmMode === "manual" ? primaryBtn : secondaryBtn}
              >
                Разбить по периодам
              </button>
            </div>

            {confirmMode === "single" ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Начало
                  <input type="date" value={singleStartDate} onChange={(e) => setSingleStartDate(e.target.value)} className={`mt-1 ${inputField}`} />
                </label>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Конец
                  <input type="date" value={singleEndDate} onChange={(e) => setSingleEndDate(e.target.value)} className={`mt-1 ${inputField}`} />
                </label>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {manualPeriods.map((period, index) => (
                  <div key={period.key} className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4">
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))]">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                        Название периода
                        <input
                          value={period.title}
                          onChange={(e) =>
                            setManualPeriods((prev) =>
                              prev.map((item, idx) => (idx === index ? { ...item, title: e.target.value } : item)),
                            )
                          }
                          className={`mt-1 ${inputField}`}
                        />
                      </label>
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                        Начало
                        <input
                          type="date"
                          value={period.startDate}
                          onChange={(e) =>
                            setManualPeriods((prev) =>
                              prev.map((item, idx) => (idx === index ? { ...item, startDate: e.target.value } : item)),
                            )
                          }
                          className={`mt-1 ${inputField}`}
                        />
                      </label>
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                        Конец
                        <input
                          type="date"
                          value={period.endDate}
                          onChange={(e) =>
                            setManualPeriods((prev) =>
                              prev.map((item, idx) => (idx === index ? { ...item, endDate: e.target.value } : item)),
                            )
                          }
                          className={`mt-1 ${inputField}`}
                        />
                      </label>
                    </div>
                    <div className="mt-3 rounded-xl border border-white/80 bg-white px-3 py-3 text-sm text-zinc-700">
                      {period.lineIds.length === 0 ? (
                        "В этот период пока не попала ни одна строка."
                      ) : (
                        <>
                          <div className="font-semibold text-zinc-900">
                            Строки периода: {period.lineIds.length}
                          </div>
                          <div className="mt-1 text-zinc-600">
                            {lines
                              .filter((line) => period.lineIds.includes(line.id))
                              .map((line) => line.itemName)
                              .join(", ")}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50/70 p-4">
              <div className="text-sm text-zinc-700">
                {confirmMode === "single" ? (
                  <>
                    Будет создана одна реальная заявка на период {formatDateRu(singleStartDate)} — {formatDateRu(singleEndDate)}.
                  </>
                ) : (
                  <>
                    Будет создано до {manualPeriods.length} реальных заявок по группам периода.
                  </>
                )}
              </div>
              <button type="button" onClick={() => void materialize()} disabled={busy} className={primaryBtn}>
                {busy ? "Проверяю доступность…" : "Создать реальные заявки"}
              </button>
            </div>
          </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
