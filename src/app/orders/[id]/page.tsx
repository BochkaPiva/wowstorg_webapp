"use client";

import React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type OrderLine = {
  id: string;
  itemId: string;
  requestedQty: number;
  approvedQty: number | null;
  issuedQty: number | null;
  pricePerDaySnapshot: number | null;
  warehouseComment: string | null;
  greenwichComment?: string | null;
  item: { id: string; name: string; type: string };
};

type ReturnSplit = {
  id: string;
  orderLineId: string;
  phase: "DECLARED" | "CHECKED_IN";
  condition: "OK" | "NEEDS_REPAIR" | "BROKEN" | "MISSING";
  qty: number;
  comment: string | null;
  createdAt: string;
};

type Order = {
  id: string;
  status: string;
  source: string;
  readyByDate: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  eventName: string | null;
  comment: string | null;
  customer: { id: string; name: string };
  createdBy: { id: string; displayName: string };
  greenwichUser: { id: string; displayName: string } | null;
  deliveryEnabled: boolean;
  deliveryComment: string | null;
  deliveryPrice: number | null;
  montageEnabled: boolean;
  montageComment: string | null;
  montagePrice: number | null;
  demontageEnabled: boolean;
  demontageComment: string | null;
  demontagePrice: number | null;
  warehouseInternalNote?: string | null;
  lines: OrderLine[];
  returnSplits?: ReturnSplit[];
};

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Новая",
  ESTIMATE_SENT: "Смета отправлена",
  CHANGES_REQUESTED: "Запрошены изменения",
  APPROVED_BY_GREENWICH: "Согласована",
  PICKING: "Сборка",
  ISSUED: "Выдана",
  RETURN_DECLARED: "Ожидает приёмки",
  CLOSED: "Закрыта",
  CANCELLED: "Отменена",
};

const CONDITION_LABEL: Record<ReturnSplit["condition"], string> = {
  OK: "В норме",
  NEEDS_REPAIR: "Нужен ремонт",
  BROKEN: "Сломано",
  MISSING: "Потеряно",
};

const CONDITIONS: ReturnSplit["condition"][] = ["OK", "NEEDS_REPAIR", "BROKEN", "MISSING"];

function fmtDate(s: string) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function daysBetween(startDate: string, endDate: string): number {
  const a = new Date(startDate + "T12:00:00");
  const b = new Date(endDate + "T12:00:00");
  const ms = b.getTime() - a.getTime();
  const days = Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
  return days === 0 ? 1 : days;
}

function orderTotal(order: {
  lines: { pricePerDaySnapshot: number | null; requestedQty: number }[];
  startDate: string;
  endDate: string;
  payMultiplier: number | null;
  deliveryPrice: number | null;
  montagePrice: number | null;
  demontagePrice: number | null;
}): number {
  const days = daysBetween(order.startDate, order.endDate);
  const multiplier = order.payMultiplier != null ? Number(order.payMultiplier) : 1;
  const rental = order.lines.reduce(
    (sum, l) => sum + (l.pricePerDaySnapshot ?? 0) * l.requestedQty * days * multiplier,
    0,
  );
  const services =
    (order.deliveryPrice ?? 0) + (order.montagePrice ?? 0) + (order.demontagePrice ?? 0);
  return Math.round(rental + services);
}

function lineIssuedQty(l: OrderLine): number {
  const q = l.issuedQty ?? l.approvedQty ?? l.requestedQty;
  return typeof q === "number" && Number.isFinite(q) ? q : 0;
}

type SplitRow = { condition: ReturnSplit["condition"]; qty: number };

function nextDefaultCondition(used: ReturnSplit["condition"][]): ReturnSplit["condition"] {
  if (!used.includes("OK")) return "OK";
  const next = CONDITIONS.find((c) => !used.includes(c));
  return next ?? "OK";
}

function normalizeRows(total: number, rows: SplitRow[]): SplitRow[] {
  const clean = rows
    .filter((r) => CONDITIONS.includes(r.condition))
    .map((r) => ({ condition: r.condition, qty: Math.max(0, Math.floor(Number(r.qty) || 0)) }));

  if (total <= 0) return [{ condition: "OK", qty: 0 }];
  if (clean.length === 0) return [{ condition: "OK", qty: total }];

  const out: SplitRow[] = [];
  const used: ReturnSplit["condition"][] = [];
  let remaining = total;

  for (let i = 0; i < clean.length && remaining > 0 && out.length < CONDITIONS.length; i++) {
    const raw = clean[i]!;
    const condition = used.includes(raw.condition) ? nextDefaultCondition(used) : raw.condition;
    used.push(condition);

    if (condition === "OK") {
      out.push({ condition, qty: remaining });
      remaining = 0;
      break;
    }

    const qty = Math.min(Math.max(0, raw.qty), remaining);
    out.push({ condition, qty });
    remaining -= qty;
  }

  if (remaining > 0 && out.length < CONDITIONS.length) {
    out.push({ condition: nextDefaultCondition(out.map((r) => r.condition)), qty: remaining });
    remaining = 0;
  }

  // Если последняя строка не OK, но больше статусов нет — добиваем количеством
  const sum = out.reduce((s, r) => s + r.qty, 0);
  if (sum < total) {
    const diff = total - sum;
    out[out.length - 1] = { ...out[out.length - 1]!, qty: out[out.length - 1]!.qty + diff };
  }

  // Гарантируем, что у OK строка qty всегда остаток
  return out.map((r, idx) => {
    if (r.condition !== "OK") return r;
    const before = out.slice(0, idx).reduce((s, x) => s + x.qty, 0);
    return { condition: "OK", qty: Math.max(0, total - before) };
  });
}

function groupSplitsByLine(splits: ReturnSplit[] | undefined, phase: ReturnSplit["phase"]) {
  const byLine = new Map<string, ReturnSplit[]>();
  for (const s of splits ?? []) {
    if (s.phase !== phase) continue;
    const list = byLine.get(s.orderLineId) ?? [];
    list.push(s);
    byLine.set(s.orderLineId, list);
  }
  for (const [k, v] of byLine) {
    v.sort((a, b) => CONDITIONS.indexOf(a.condition) - CONDITIONS.indexOf(b.condition));
    byLine.set(k, v);
  }
  return byLine;
}

function AddLineRow({
  catalogItems,
  existingItemIds,
  onAdd,
}: {
  catalogItems: { id: string; name: string; availableForDates?: number }[];
  existingItemIds: string[];
  onAdd: (itemId: string, itemName: string, qty: number, maxForDates?: number) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<{ id: string; name: string } | null>(null);
  const [qty, setQty] = React.useState<number | "">(1);
  const [open, setOpen] = React.useState(false);
  const available = catalogItems.filter((i) => !existingItemIds.includes(i.id));
  const filtered =
    search.trim() === ""
      ? available
      : available.filter((i) =>
          i.name.toLowerCase().includes(search.trim().toLowerCase()),
        );
  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-zinc-600">Добавить позицию</div>
      {selected ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-xl bg-violet-100 px-3 py-2 text-sm font-medium text-violet-900">
            {selected.name}
          </span>
          <div className="flex items-center rounded-xl border border-zinc-200 bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => setQty((n) => Math.max(1, (typeof n === "number" ? n : 1) - 1))}
              className="px-3 py-2 text-zinc-600 hover:bg-zinc-50 font-medium"
              aria-label="Уменьшить"
            >
              −
            </button>
            <input
              type="text"
              inputMode="numeric"
              value={qty === "" ? "" : String(qty)}
              onChange={(e) => {
                if (e.target.value === "") {
                  setQty("");
                  return;
                }
                if (!/^\d+$/.test(e.target.value)) return;
                const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                const max = selected.availableForDates != null ? Math.max(1, selected.availableForDates) : undefined;
                setQty(max != null ? Math.min(max, v) : v);
              }}
              onBlur={() => {
                if (qty === "") setQty(1);
              }}
              className="w-14 border-0 bg-transparent py-2 text-center text-sm font-medium tabular-nums focus:outline-none focus:ring-0"
            />
            <button
              type="button"
              onClick={() => {
                const max = selected.availableForDates != null ? Math.max(1, selected.availableForDates) : undefined;
                setQty((n) => {
                  const base = typeof n === "number" ? n : 1;
                  return max != null ? Math.min(max, base + 1) : base + 1;
                });
              }}
              className="px-3 py-2 text-zinc-600 hover:bg-zinc-50 font-medium"
              aria-label="Увеличить"
            >
              +
            </button>
          </div>
          {selected.availableForDates != null ? (
            <div className="text-xs text-zinc-500">
              Доступно на даты: <span className="font-semibold text-zinc-700">{selected.availableForDates}</span>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => {
              const n = qty === "" ? 1 : qty;
              onAdd(selected.id, selected.name, n, selected.availableForDates);
              setSelected(null);
              setQty(1);
              setSearch("");
            }}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
          >
            Добавить
          </button>
          <button
            type="button"
            onClick={() => { setSelected(null); setSearch(""); }}
            className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
          >
            Отмена
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Найти позицию по названию…"
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm placeholder:text-zinc-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
          {open && (
            <>
              <div
                className="fixed inset-0 z-40"
                aria-hidden
                onClick={() => setOpen(false)}
              />
              <ul
                className="absolute top-full left-0 right-0 z-50 mt-1 max-h-56 overflow-auto rounded-xl border border-zinc-200 bg-white shadow-lg"
                role="listbox"
              >
                {filtered.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-zinc-500">
                    {available.length === 0 ? "Все позиции уже добавлены" : "Ничего не найдено"}
                  </li>
                ) : (
                  filtered.map((i) => (
                    <li key={i.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(i);
                          setOpen(false);
                          setSearch("");
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm hover:bg-violet-50 focus:bg-violet-50 focus:outline-none"
                        role="option"
                      >
                        {i.name}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ServiceEditRow({
  label,
  enabled,
  onEnabledChange,
  comment,
  onCommentChange,
  showPrice,
  price,
  onPriceChange,
}: {
  label: string;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  comment: string;
  onCommentChange: (v: string) => void;
  showPrice: boolean;
  price: number | "";
  onPriceChange: (v: number | "") => void;
}) {
  const priceNum = price === "" ? 0 : Number(price);
  const priceMissing = enabled && (price === "" || priceNum <= 0);
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/30 p-4">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          className="rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
        />
        <span className="text-sm font-semibold text-zinc-800">{label}</span>
      </label>
      {enabled && (
        <div className={`mt-3 grid gap-3 ${showPrice ? "sm:grid-cols-[1fr_auto]" : ""}`}>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">Комментарий</label>
            <input
              type="text"
              value={comment}
              onChange={(e) => onCommentChange(e.target.value)}
              placeholder="Описание или примечание"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-violet-300 focus:outline-none focus:ring-1 focus:ring-violet-200"
            />
          </div>
          {showPrice ? (
            <div className="min-w-[120px]">
              <label className="block text-xs font-medium text-zinc-500 mb-1">
                Цена (₽) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={price === "" ? "" : price}
                onChange={(e) => onPriceChange(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="0"
                className={`w-full rounded-xl border px-3 py-2 text-sm text-right tabular-nums focus:outline-none focus:ring-2 ${
                  priceMissing
                    ? "border-amber-300 bg-amber-50/50 focus:border-amber-400 focus:ring-amber-200"
                    : "border-zinc-200 bg-white focus:border-violet-300 focus:ring-violet-200"
                }`}
              />
              {priceMissing && (
                <p className="mt-1 text-xs text-amber-600">Укажите цену для отправки сметы</p>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function OrderDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state } = useAuth();
  const orderId = params.id;

  const [order, setOrder] = React.useState<Order | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  type ReturnLineDraft = { comment: string; rows: SplitRow[] };
  const [declareOpen, setDeclareOpen] = React.useState(false);
  const [declareDraft, setDeclareDraft] = React.useState<Record<string, ReturnLineDraft>>({});
  const [checkInDraft, setCheckInDraft] = React.useState<Record<string, ReturnLineDraft>>({});

  type EditLine = { id?: string; itemId: string; itemName: string; requestedQty: number | string; lineComment: string };
  const [isEditing, setIsEditing] = React.useState(false);
  const [editLines, setEditLines] = React.useState<EditLine[]>([]);
  const [editEventName, setEditEventName] = React.useState("");
  const [editComment, setEditComment] = React.useState("");
  const [editDeliveryEnabled, setEditDeliveryEnabled] = React.useState(false);
  const [editDeliveryComment, setEditDeliveryComment] = React.useState("");
  const [editDeliveryPrice, setEditDeliveryPrice] = React.useState<number | "">("");
  const [editMontageEnabled, setEditMontageEnabled] = React.useState(false);
  const [editMontageComment, setEditMontageComment] = React.useState("");
  const [editMontagePrice, setEditMontagePrice] = React.useState<number | "">("");
  const [editDemontageEnabled, setEditDemontageEnabled] = React.useState(false);
  const [editDemontageComment, setEditDemontageComment] = React.useState("");
  const [editDemontagePrice, setEditDemontagePrice] = React.useState<number | "">("");
  const [catalogItems, setCatalogItems] = React.useState<{ id: string; name: string; availableForDates?: number }[]>([]);

  const isGreenwich = state.status === "authenticated" && state.user.role === "GREENWICH";
  const isWarehouse = state.status === "authenticated" && state.user.role === "WOWSTORG";
  const from = searchParams.get("from");
  const warehouseBackHref = from === "warehouse-archive" ? "/warehouse/archive" : "/warehouse/queue";
  const warehouseBackLabel = from === "warehouse-archive" ? "В архив" : "В очередь";
  const canEditOrder =
    Boolean(
      order &&
        ((isWarehouse &&
          ["SUBMITTED", "ESTIMATE_SENT", "CHANGES_REQUESTED", "APPROVED_BY_GREENWICH", "PICKING"].includes(order.status)) ||
          (isGreenwich &&
            state.user &&
            order.greenwichUserId === state.user.id &&
            ["SUBMITTED", "ESTIMATE_SENT", "CHANGES_REQUESTED", "APPROVED_BY_GREENWICH"].includes(order.status))),
    );

  const loadOrder = React.useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
      const data = (await res.json()) as { order?: Order; error?: { message?: string } };
      if (!res.ok) {
        setOrder(null);
        setError(data?.error?.message ?? "Не удалось загрузить заявку");
        return;
      }
      setOrder(data.order ?? null);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  React.useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const declaredByLine = React.useMemo(() => groupSplitsByLine(order?.returnSplits, "DECLARED"), [order?.returnSplits]);
  const checkedInByLine = React.useMemo(() => groupSplitsByLine(order?.returnSplits, "CHECKED_IN"), [order?.returnSplits]);

  function buildDraftFromPhase(phase: ReturnSplit["phase"]): Record<string, ReturnLineDraft> {
    if (!order) return {};
    const byLine = phase === "DECLARED" ? declaredByLine : checkedInByLine;
    const draft: Record<string, ReturnLineDraft> = {};
    for (const l of order.lines) {
      const total = lineIssuedQty(l);
      const existing = byLine.get(l.id) ?? [];
      const comment = existing.find((s) => (s.comment ?? "").trim() !== "")?.comment ?? "";
      const rows = existing.length
        ? existing.map((s) => ({ condition: s.condition, qty: s.qty }))
        : [{ condition: "OK" as const, qty: total }];
      draft[l.id] = { comment: comment ?? "", rows: normalizeRows(total, rows) };
    }
    return draft;
  }

  React.useEffect(() => {
    if (!order) return;
    if (isWarehouse && order.status === "RETURN_DECLARED") {
      // стартуем от декларации Greenwich (если есть), иначе всё OK
      const base = Object.keys(declareDraft).length ? declareDraft : buildDraftFromPhase("DECLARED");
      setCheckInDraft(base);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.status, isWarehouse]);

  async function doAction(
    method: string,
    path: string,
    body?: object,
  ) {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json()) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok) {
        setActionError(data?.error?.message ?? "Ошибка операции");
        return;
      }
      await loadOrder();
      if (path.includes("check-in") || path.includes("cancel")) {
        if (isWarehouse) router.push("/warehouse/queue");
        else if (isGreenwich) router.push("/orders");
      }
    } finally {
      setBusy(false);
    }
  }

  function updateLineDraft(
    kind: "declare" | "checkin",
    lineId: string,
    next: ReturnLineDraft,
  ) {
    const line = order?.lines.find((l) => l.id === lineId);
    const total = line ? lineIssuedQty(line) : 0;
    const normalized: ReturnLineDraft = {
      comment: next.comment,
      rows: normalizeRows(total, next.rows),
    };
    if (kind === "declare") {
      setDeclareDraft((prev) => ({ ...prev, [lineId]: normalized }));
    } else {
      setCheckInDraft((prev) => ({ ...prev, [lineId]: normalized }));
    }
  }

  async function submitReturnDeclared(payload: Record<string, ReturnLineDraft>) {
    if (!orderId || !order) return;
    const lines = order.lines
      .filter((l) => lineIssuedQty(l) > 0)
      .map((l) => {
        const d = payload[l.id] ?? { comment: "", rows: [{ condition: "OK", qty: lineIssuedQty(l) }] };
        const total = lineIssuedQty(l);
        const rows = normalizeRows(total, d.rows);
        return {
          orderLineId: l.id,
          comment: d.comment.trim() || undefined,
          splits: rows.map((r) => ({ condition: r.condition, qty: r.qty })),
        };
      });
    await doAction("POST", `/api/orders/${orderId}/return-declared`, { lines });
  }

  async function submitCheckIn(payload: Record<string, ReturnLineDraft>) {
    if (!orderId || !order) return;
    const lines = order.lines
      .filter((l) => lineIssuedQty(l) > 0)
      .map((l) => {
        const d = payload[l.id] ?? { comment: "", rows: [{ condition: "OK", qty: lineIssuedQty(l) }] };
        const total = lineIssuedQty(l);
        const rows = normalizeRows(total, d.rows);
        return {
          orderLineId: l.id,
          comment: d.comment.trim() || undefined,
          splits: rows.map((r) => ({ condition: r.condition, qty: r.qty })),
        };
      });
    await doAction("POST", `/api/orders/${orderId}/check-in`, { lines });
  }

  function startEditing() {
    if (!order) return;
    setEditLines(
      order.lines.map((l) => ({
        id: l.id,
        itemId: l.item.id,
        itemName: l.item.name,
        requestedQty: l.requestedQty,
        lineComment: (isGreenwich ? (l.greenwichComment ?? "") : (l.warehouseComment ?? "")) as string,
      })),
    );
    setEditEventName(order.eventName ?? "");
    setEditComment(order.comment ?? "");
    setEditDeliveryEnabled(order.deliveryEnabled);
    setEditDeliveryComment(order.deliveryComment ?? "");
    setEditDeliveryPrice(order.deliveryPrice ?? "");
    setEditMontageEnabled(order.montageEnabled);
    setEditMontageComment(order.montageComment ?? "");
    setEditMontagePrice(order.montagePrice ?? "");
    setEditDemontageEnabled(order.demontageEnabled);
    setEditDemontageComment(order.demontageComment ?? "");
    setEditDemontagePrice(order.demontagePrice ?? "");
    setIsEditing(true);
    setActionError(null);
    const start = order.startDate.slice(0, 10);
    const end = order.endDate.slice(0, 10);
    fetch(
      `/api/catalog/items?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&excludeOrderId=${encodeURIComponent(orderId)}`,
      { cache: "no-store" },
    )
      .then((r) => r.json())
      .then((data: { items?: { id: string; name: string; availability?: { availableForDates?: number } }[] }) => {
        setCatalogItems(
          (data?.items ?? []).map((i) => ({
            id: i.id,
            name: i.name,
            availableForDates: i.availability?.availableForDates,
          })),
        );
      })
      .catch(() => setCatalogItems([]));
  }

  async function saveOrderEdit() {
    if (!orderId || !order) return;
    if (editLines.length === 0) {
      setActionError("Должна быть хотя бы одна позиция.");
      return;
    }
    const invalidQty = editLines.some((l) => {
      const n = Number(l.requestedQty);
      return l.requestedQty === "" || Number.isNaN(n) || n < 1;
    });
    if (invalidQty) {
      setActionError("Укажите количество (не менее 1) для каждой позиции.");
      return;
    }

    // Клиентская проверка доступности (для наглядной ошибки до запроса)
    for (const row of editLines) {
      const max = catalogItems.find((i) => i.id === row.itemId)?.availableForDates;
      if (max != null && Number(row.requestedQty) > max) {
        setActionError(`«${row.itemName}»: доступно ${max} шт. на выбранные даты`);
        return;
      }
    }
    setBusy(true);
    setActionError(null);
    try {
      const endpoint = isWarehouse ? "warehouse-edit" : "greenwich-edit";
      const res = await fetch(`/api/orders/${orderId}/${endpoint}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventName: editEventName.trim() || undefined,
          comment: editComment.trim() || undefined,
          deliveryEnabled: editDeliveryEnabled,
          deliveryComment: editDeliveryComment.trim() || undefined,
          ...(isWarehouse ? { deliveryPrice: editDeliveryEnabled && editDeliveryPrice !== "" ? Number(editDeliveryPrice) : undefined } : {}),
          montageEnabled: editMontageEnabled,
          montageComment: editMontageComment.trim() || undefined,
          ...(isWarehouse ? { montagePrice: editMontageEnabled && editMontagePrice !== "" ? Number(editMontagePrice) : undefined } : {}),
          demontageEnabled: editDemontageEnabled,
          demontageComment: editDemontageComment.trim() || undefined,
          ...(isWarehouse ? { demontagePrice: editDemontageEnabled && editDemontagePrice !== "" ? Number(editDemontagePrice) : undefined } : {}),
          lines: editLines.map((l) => ({
            id: l.id,
            itemId: l.itemId,
            requestedQty: Math.max(1, parseInt(String(l.requestedQty), 10) || 1),
            ...(isWarehouse
              ? { warehouseComment: l.lineComment.trim() || undefined }
              : { greenwichComment: l.lineComment.trim() || undefined }),
          })),
        }),
      });
      const data = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setActionError(data?.error?.message ?? "Ошибка сохранения");
        return;
      }
      await loadOrder();
      setIsEditing(false);
    } finally {
      setBusy(false);
    }
  }

  function addEditLine(itemId: string, itemName: string, qty: number, maxForDates?: number) {
    if (!itemId || qty < 1) return;
    const safeQty = maxForDates != null ? Math.min(maxForDates, qty) : qty;
    setEditLines((prev) => [...prev, { itemId, itemName, requestedQty: safeQty, lineComment: "" }]);
  }

  function removeEditLine(index: number) {
    setEditLines((prev) => prev.filter((_, i) => i !== index));
  }

  function updateEditLine<K extends keyof EditLine>(index: number, field: K, value: EditLine[K]) {
    setEditLines((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, [field]: value } as EditLine;
        if (field === "requestedQty") {
          if (next.requestedQty === "") return next;
          const max = catalogItems.find((it) => it.id === row.itemId)?.availableForDates;
          const n = Number(next.requestedQty);
          if (max != null && Number.isFinite(n)) {
            next.requestedQty = Math.min(max, Math.max(1, Math.floor(n))) as never;
          }
        }
        return next;
      }),
    );
  }

  const canCancel =
    order &&
    ["SUBMITTED", "ESTIMATE_SENT", "CHANGES_REQUESTED"].includes(order.status) &&
    (isWarehouse || (isGreenwich && state.user && order.greenwichUserId === state.user.id));

  const canSendEstimate =
    (order?.status === "SUBMITTED" || order?.status === "CHANGES_REQUESTED") &&
    (!order.deliveryEnabled || (order.deliveryPrice != null && Number(order.deliveryPrice) > 0)) &&
    (!order.montageEnabled || (order.montagePrice != null && Number(order.montagePrice) > 0)) &&
    (!order.demontageEnabled || (order.demontagePrice != null && Number(order.demontagePrice) > 0));
  const sendEstimateBlocked =
    (order?.status === "SUBMITTED" || order?.status === "CHANGES_REQUESTED") &&
    isWarehouse &&
    !canSendEstimate &&
    (order.deliveryEnabled || order.montageEnabled || order.demontageEnabled);
  const isOrderGreenwichUser = order && state.user && order.greenwichUserId === state.user.id;

  if (loading) {
    return (
      <AppShell title="Заявка">
        <div className="text-sm text-zinc-600">Загрузка…</div>
      </AppShell>
    );
  }

  if (error || !order) {
    return (
      <AppShell title="Заявка">
        <div className="space-y-3">
          <p className="text-sm text-red-600">{error ?? "Заявка не найдена"}</p>
          <Link
            href={isWarehouse ? warehouseBackHref : "/orders"}
            className="inline-block rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
          >
            ← Назад
          </Link>
        </div>
      </AppShell>
    );
  }

  const statusLabel = STATUS_LABEL[order.status] ?? order.status;

  const statusHeaderClass =
    order.status === "CANCELLED"
      ? "bg-zinc-500 text-white"
      : order.status === "CLOSED"
        ? "bg-green-600 text-white"
        : order.status === "ISSUED" || order.status === "RETURN_DECLARED"
          ? "bg-amber-500 text-white"
          : order.status === "APPROVED_BY_GREENWICH" || order.status === "PICKING"
            ? "bg-indigo-600 text-white"
            : order.status === "ESTIMATE_SENT" || order.status === "CHANGES_REQUESTED"
              ? "bg-violet-500 text-white"
              : "bg-violet-600 text-white";

  return (
    <AppShell title={`Заявка ${order.id.slice(0, 8)}`}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={isWarehouse ? warehouseBackHref : "/orders"}
            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900"
          >
            ← {isWarehouse ? warehouseBackLabel : "Мои заявки"}
          </Link>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
          <div className={`px-4 py-2.5 text-sm font-bold ${statusHeaderClass}`}>
            {statusLabel}
          </div>
          <div className="p-4">
            <div className="space-y-1">
              <div className="text-lg font-semibold text-zinc-900">
                {order.customer.name}
                {order.greenwichUser ? ` · ${order.greenwichUser.displayName}` : ""}
              </div>
              {order.eventName ? (
                <p className="text-sm text-zinc-600">Мероприятие: {order.eventName}</p>
              ) : null}
              <p className="text-sm text-zinc-500">
                Готовность к: <strong>{fmtDate(order.readyByDate)}</strong> · Период:{" "}
                <strong>{fmtDate(order.startDate)}</strong> — <strong>{fmtDate(order.endDate)}</strong>
              </p>
              <p className="text-xs text-zinc-400">
                Создал: {order.createdBy.displayName} · {fmtDate(order.createdAt)}
              </p>
              <p className="mt-2 text-sm font-semibold text-zinc-800">
                Сумма заявки: {orderTotal(order).toLocaleString("ru-RU")} ₽
              </p>
            </div>
          </div>
        </div>

        {!isEditing && order.comment ? (
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Комментарий</div>
            <p className="mt-1 text-sm text-zinc-800 whitespace-pre-wrap">{order.comment}</p>
          </div>
        ) : null}

        {isEditing ? (
          <>
            <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-zinc-200 bg-zinc-50/80 px-5 py-3">
                <span className="text-sm font-semibold text-zinc-700">Мероприятие и комментарий</span>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1.5">Мероприятие</label>
                  <input
                    type="text"
                    value={editEventName}
                    onChange={(e) => setEditEventName(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm placeholder:text-zinc-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    placeholder="Название мероприятия"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1.5">Комментарий (для склада)</label>
                  <textarea
                    value={editComment}
                    onChange={(e) => setEditComment(e.target.value)}
                    rows={2}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm placeholder:text-zinc-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    placeholder="Комментарий к заявке для склада"
                  />
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-zinc-200 bg-zinc-50/80 px-5 py-3">
                <span className="text-sm font-semibold text-zinc-700">Состав заявки</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50/50">
                      <th className="text-left px-5 py-3 font-semibold text-zinc-700">Позиция</th>
                      <th className="text-right px-5 py-3 font-semibold text-zinc-700 w-36">Кол-во</th>
                      <th className="text-left px-5 py-3 font-semibold text-zinc-700">
                        {isWarehouse ? "Коммент. склада (для Greenwich)" : "Комментарий (для склада)"}
                      </th>
                      <th className="w-24 px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {editLines.map((line, idx) => (
                      <tr key={line.id ?? `new-${idx}`} className="border-b border-zinc-100 hover:bg-zinc-50/50">
                        <td className="px-5 py-3">
                          <div className="font-medium text-zinc-900">{line.itemName}</div>
                          {(() => {
                            const item = catalogItems.find((i) => i.id === line.itemId);
                            return item?.availableForDates != null ? (
                              <div className="mt-0.5 text-xs text-zinc-500">
                                Доступно: <span className="font-semibold text-zinc-700">{item.availableForDates}</span>
                              </div>
                            ) : null;
                          })()}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="inline-flex items-center rounded-xl border border-zinc-200 bg-white overflow-hidden">
                            <button
                              type="button"
                              onClick={() => updateEditLine(idx, "requestedQty", Math.max(1, (Number(line.requestedQty) || 1) - 1))}
                              className="px-3 py-2 text-zinc-600 hover:bg-zinc-50 font-medium"
                              aria-label="Уменьшить"
                            >
                              −
                            </button>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={line.requestedQty === "" ? "" : String(line.requestedQty)}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === "" || /^\d+$/.test(v)) updateEditLine(idx, "requestedQty", v === "" ? "" : v);
                              }}
                              onBlur={() => {
                                if (line.requestedQty === "") updateEditLine(idx, "requestedQty", 1 as never);
                              }}
                              className="w-14 border-0 bg-transparent py-2 text-center text-sm font-medium tabular-nums focus:outline-none focus:ring-0"
                            />
                            <button
                              type="button"
                              onClick={() => updateEditLine(idx, "requestedQty", (Number(line.requestedQty) || 1) + 1)}
                              className="px-3 py-2 text-zinc-600 hover:bg-zinc-50 font-medium"
                              aria-label="Увеличить"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <input
                            type="text"
                            value={line.lineComment}
                            onChange={(e) => updateEditLine(idx, "lineComment", e.target.value)}
                            className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-200"
                            placeholder="Комментарий к позиции"
                          />
                        </td>
                        <td className="px-5 py-3">
                          <button
                            type="button"
                            onClick={() => removeEditLine(idx)}
                            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
                          >
                            Удалить
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-200 bg-zinc-50/80 px-5 py-3">
                <span className="text-sm font-semibold text-zinc-700">Добавить позицию</span>
              </div>
              <div className="p-5">
                <AddLineRow
                  catalogItems={catalogItems}
                  existingItemIds={editLines.map((l) => l.itemId)}
                  onAdd={addEditLine}
                />
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-zinc-200 bg-zinc-50/80 px-5 py-3">
                <span className="text-sm font-semibold text-zinc-700">Доп. услуги</span>
              </div>
              <div className="p-5 space-y-4">
                <ServiceEditRow
                  label="Доставка"
                  enabled={editDeliveryEnabled}
                  onEnabledChange={setEditDeliveryEnabled}
                  comment={editDeliveryComment}
                  onCommentChange={setEditDeliveryComment}
                  showPrice={isWarehouse}
                  price={editDeliveryPrice}
                  onPriceChange={setEditDeliveryPrice}
                />
                <ServiceEditRow
                  label="Монтаж"
                  enabled={editMontageEnabled}
                  onEnabledChange={setEditMontageEnabled}
                  comment={editMontageComment}
                  onCommentChange={setEditMontageComment}
                  showPrice={isWarehouse}
                  price={editMontagePrice}
                  onPriceChange={setEditMontagePrice}
                />
                <ServiceEditRow
                  label="Демонтаж"
                  enabled={editDemontageEnabled}
                  onEnabledChange={setEditDemontageEnabled}
                  comment={editDemontageComment}
                  onCommentChange={setEditDemontageComment}
                  showPrice={isWarehouse}
                  price={editDemontagePrice}
                  onPriceChange={setEditDemontagePrice}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
              <div className="border-b border-zinc-200 bg-zinc-50/80 px-4 py-2 text-sm font-semibold text-zinc-700">
                Состав заявки
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50/50">
                      <th className="text-left p-3 font-semibold text-zinc-700">Позиция</th>
                      <th className="text-right p-3 font-semibold text-zinc-700">Запрос</th>
                      <th className="text-right p-3 font-semibold text-zinc-700">Соглас.</th>
                      <th className="text-right p-3 font-semibold text-zinc-700">Выдано</th>
                      <th className="text-right p-3 font-semibold text-zinc-700">Цена/сут</th>
                      <th className="text-left p-3 font-semibold text-zinc-700">Коммент. Greenwich</th>
                      <th className="text-left p-3 font-semibold text-zinc-700">Коммент. склада</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.lines.map((line) => (
                      <tr key={line.id} className="border-b border-zinc-100">
                        <td className="p-3 font-medium text-zinc-900">{line.item.name}</td>
                        <td className="p-3 text-right text-zinc-600">{line.requestedQty}</td>
                        <td className="p-3 text-right text-zinc-600">{line.approvedQty ?? "—"}</td>
                        <td className="p-3 text-right text-zinc-600">{line.issuedQty ?? "—"}</td>
                        <td className="p-3 text-right text-zinc-600">
                          {line.pricePerDaySnapshot != null ? line.pricePerDaySnapshot.toFixed(0) : "—"} ₽
                        </td>
                        <td className="p-3 text-zinc-600 text-left max-w-[200px] truncate" title={line.greenwichComment ?? undefined}>
                          {line.greenwichComment ?? "—"}
                        </td>
                        <td className="p-3 text-zinc-600 text-left max-w-[200px] truncate" title={line.warehouseComment ?? undefined}>
                          {line.warehouseComment ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {(order.deliveryEnabled || order.montageEnabled || order.demontageEnabled) ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="text-sm font-semibold text-zinc-700 mb-2">Доп. услуги</div>
                <ul className="space-y-1.5 text-sm text-zinc-600">
                  {order.deliveryEnabled ? (
                    <li>
                      Доставка
                      {order.deliveryComment ? `: ${order.deliveryComment}` : ""}
                      {order.deliveryPrice != null ? ` · ${order.deliveryPrice} ₽` : ""}
                    </li>
                  ) : null}
                  {order.montageEnabled ? (
                    <li>
                      Монтаж
                      {order.montageComment ? `: ${order.montageComment}` : ""}
                      {order.montagePrice != null ? ` · ${order.montagePrice} ₽` : ""}
                    </li>
                  ) : null}
                  {order.demontageEnabled ? (
                    <li>
                      Демонтаж
                      {order.demontageComment ? `: ${order.demontageComment}` : ""}
                      {order.demontagePrice != null ? ` · ${order.demontagePrice} ₽` : ""}
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </>
        )}

        {/* Приёмка: склад редактирует и закрывает */}
        {isWarehouse && order.status === "RETURN_DECLARED" && !isEditing ? (
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-zinc-200 bg-zinc-50/80 px-4 py-2 text-sm font-semibold text-zinc-700">
              Приёмка (как отправил Greenwich)
            </div>
            <div className="p-4 space-y-4">
              {order.lines.filter((l) => lineIssuedQty(l) > 0).map((l) => {
                const total = lineIssuedQty(l);
                const draft = checkInDraft[l.id] ?? { comment: "", rows: [{ condition: "OK", qty: total }] };
                const rows = normalizeRows(total, draft.rows);
                const usedAll = rows.map((r) => r.condition);
                return (
                  <div key={l.id} className="rounded-xl border border-zinc-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-zinc-900">{l.item.name}</div>
                      <div className="text-xs text-zinc-600">
                        Получено: <span className="font-semibold">{total}</span>
                      </div>
                    </div>
                    <div className="mt-2 grid gap-2">
                      {rows.map((r, idx) => {
                        const usedBefore = rows.slice(0, idx).map((x) => x.condition);
                        const options = CONDITIONS.filter((c) => c === r.condition || !usedBefore.includes(c));
                        const remainingBefore = rows.slice(0, idx).reduce((s, x) => s + x.qty, 0);
                        const remaining = Math.max(0, total - remainingBefore);
                        return (
                          <div key={`${l.id}-${idx}`} className="flex flex-wrap items-center gap-2">
                            <select
                              value={r.condition}
                              onChange={(e) => {
                                const cond = e.target.value as ReturnSplit["condition"];
                                const nextRows = rows.slice();
                                const qty = cond === "OK" ? remaining : Math.min(Math.max(1, r.qty || 1), remaining);
                                nextRows[idx] = { condition: cond, qty };
                                updateLineDraft("checkin", l.id, { ...draft, rows: nextRows });
                              }}
                              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                            >
                              {options.map((c) => (
                                <option key={c} value={c} disabled={c !== r.condition && usedAll.includes(c)}>
                                  {CONDITION_LABEL[c]}
                                </option>
                              ))}
                            </select>
                            {r.condition !== "OK" ? (
                              <input
                                type="number"
                                min={0}
                                max={remaining}
                                value={r.qty}
                                onChange={(e) => {
                                  const v = Math.max(0, Math.min(remaining, Math.floor(Number(e.target.value) || 0)));
                                  const nextRows = rows.slice();
                                  nextRows[idx] = { ...r, qty: v };
                                  updateLineDraft("checkin", l.id, { ...draft, rows: nextRows });
                                }}
                                className="w-24 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                              />
                            ) : (
                              <div className="text-sm text-zinc-600">
                                Кол-во: <span className="font-semibold">{r.qty}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div className="pt-2">
                        <label className="block text-xs font-medium text-zinc-500">Комментарий (видно складу и в архиве)</label>
                        <input
                          value={draft.comment}
                          onChange={(e) => updateLineDraft("checkin", l.id, { ...draft, comment: e.target.value, rows })}
                          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                          placeholder="Комментарий по позиции (опционально)"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => submitCheckIn(checkInDraft)}
                  className="rounded-lg border border-amber-300 bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {busy ? "…" : "Принять (закрыть)"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setCheckInDraft(buildDraftFromPhase("DECLARED"))}
                  className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Сбросить к декларации
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Приёмка: итог (в архиве/после закрытия) */}
        {order.status === "CLOSED" && (order.returnSplits ?? []).some((s) => s.phase === "CHECKED_IN") ? (
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-zinc-200 bg-zinc-50/80 px-4 py-2 text-sm font-semibold text-zinc-700">
              Приёмка (итог)
            </div>
            <div className="p-4 space-y-3">
              {order.lines.filter((l) => lineIssuedQty(l) > 0).map((l) => {
                const total = lineIssuedQty(l);
                const splits = checkedInByLine.get(l.id) ?? [];
                const comment = splits.find((s) => (s.comment ?? "").trim() !== "")?.comment ?? "";
                return (
                  <div key={l.id} className="rounded-xl border border-zinc-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-zinc-900">{l.item.name}</div>
                      <div className="text-xs text-zinc-600">
                        Получено: <span className="font-semibold">{total}</span>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-zinc-700">
                      {splits.length ? (
                        <div className="flex flex-wrap gap-2">
                          {splits.map((s) => (
                            <span key={s.id} className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-800">
                              {CONDITION_LABEL[s.condition]}: {s.qty}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-zinc-500">Нет данных приёмки</span>
                      )}
                    </div>
                    {comment ? (
                      <div className="mt-2 text-sm text-zinc-600 whitespace-pre-wrap">
                        <span className="font-semibold text-zinc-700">Комментарий:</span> {comment}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Greenwich: отправка на приёмку с разбиением */}
        {declareOpen &&
          isGreenwich &&
          order.status === "ISSUED" &&
          typeof document !== "undefined" &&
          createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white shadow-xl overflow-hidden">
                <div className="border-b border-zinc-200 bg-zinc-50/80 px-5 py-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-zinc-900">Отправить на приёмку</div>
                  <button
                    type="button"
                    onClick={() => setDeclareOpen(false)}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Закрыть
                  </button>
                </div>
                <div className="p-5 space-y-4 max-h-[70vh] overflow-auto">
                  <div className="text-sm text-zinc-600">
                    Полученное количество фиксировано. Если статус не «В норме», укажите количество и при необходимости разбейте остаток на следующий статус.
                  </div>
                  {order.lines.filter((l) => lineIssuedQty(l) > 0).map((l) => {
                    const total = lineIssuedQty(l);
                    const draft = declareDraft[l.id] ?? { comment: "", rows: [{ condition: "OK", qty: total }] };
                    const rows = normalizeRows(total, draft.rows);
                    const usedAll = rows.map((r) => r.condition);
                    return (
                      <div key={l.id} className="rounded-xl border border-zinc-200 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-zinc-900">{l.item.name}</div>
                          <div className="text-xs text-zinc-600">
                            Получено: <span className="font-semibold">{total}</span>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2">
                          {rows.map((r, idx) => {
                            const usedBefore = rows.slice(0, idx).map((x) => x.condition);
                            const options = CONDITIONS.filter((c) => c === r.condition || !usedBefore.includes(c));
                            const remainingBefore = rows.slice(0, idx).reduce((s, x) => s + x.qty, 0);
                            const remaining = Math.max(0, total - remainingBefore);
                            return (
                              <div key={`${l.id}-${idx}`} className="flex flex-wrap items-center gap-2">
                                <select
                                  value={r.condition}
                                  onChange={(e) => {
                                    const cond = e.target.value as ReturnSplit["condition"];
                                    const nextRows = rows.slice();
                                    const qty = cond === "OK" ? remaining : Math.min(Math.max(1, r.qty || 1), remaining);
                                    nextRows[idx] = { condition: cond, qty };
                                    updateLineDraft("declare", l.id, { ...draft, rows: nextRows });
                                  }}
                                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                                >
                                  {options.map((c) => (
                                    <option key={c} value={c} disabled={c !== r.condition && usedAll.includes(c)}>
                                      {CONDITION_LABEL[c]}
                                    </option>
                                  ))}
                                </select>
                                {r.condition !== "OK" ? (
                                  <input
                                    type="number"
                                    min={0}
                                    max={remaining}
                                    value={r.qty}
                                    onChange={(e) => {
                                      const v = Math.max(0, Math.min(remaining, Math.floor(Number(e.target.value) || 0)));
                                      const nextRows = rows.slice();
                                      nextRows[idx] = { ...r, qty: v };
                                      updateLineDraft("declare", l.id, { ...draft, rows: nextRows });
                                    }}
                                    className="w-24 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                                  />
                                ) : (
                                  <div className="text-sm text-zinc-600">
                                    Кол-во: <span className="font-semibold">{r.qty}</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          <div className="pt-2">
                            <label className="block text-xs font-medium text-zinc-500">Комментарий (видно складу и в архиве)</label>
                            <input
                              value={draft.comment}
                              onChange={(e) => updateLineDraft("declare", l.id, { ...draft, comment: e.target.value, rows })}
                              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                              placeholder="Комментарий по позиции (опционально)"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-zinc-200 bg-white px-5 py-3 flex flex-wrap gap-2 justify-end">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void submitReturnDeclared(declareDraft).then(() => setDeclareOpen(false));
                    }}
                    className="rounded-lg border border-amber-300 bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {busy ? "…" : "Отправить на приёмку"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDeclareOpen(false)}
                    className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}

        {actionError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
            {actionError}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {canEditOrder && !isEditing && (
            <button
              type="button"
              onClick={startEditing}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Редактировать заявку
            </button>
          )}
          {isEditing && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={saveOrderEdit}
                className="rounded-lg border border-violet-300 bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {busy ? "…" : "Сохранить"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => { setIsEditing(false); setActionError(null); }}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Отмена
              </button>
            </>
          )}
          {sendEstimateBlocked ? (
            <p className="text-sm text-amber-700">
              Чтобы отправить смету, укажите цены для всех включённых доп. услуг (в режиме редактирования).
            </p>
          ) : null}
          {isWarehouse && (order.status === "SUBMITTED" || order.status === "CHANGES_REQUESTED") && !isEditing && (
            <button
              type="button"
              disabled={busy || !canSendEstimate}
              onClick={() => doAction("POST", `/api/orders/${orderId}/send-estimate`)}
              className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
            >
              {busy ? "…" : "Отправить смету"}
            </button>
          )}
          {isWarehouse && order.status === "APPROVED_BY_GREENWICH" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => doAction("POST", `/api/orders/${orderId}/start-picking`)}
              className="rounded-lg border border-indigo-300 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "…" : "Начать сборку"}
            </button>
          )}
          {isWarehouse && order.status === "PICKING" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => doAction("POST", `/api/orders/${orderId}/issue`)}
              className="rounded-lg border border-green-300 bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {busy ? "…" : "Выдать"}
            </button>
          )}
          {isGreenwich && (order.status === "ESTIMATE_SENT" || order.status === "CHANGES_REQUESTED") && isOrderGreenwichUser && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => doAction("POST", `/api/orders/${orderId}/approve`, {})}
                className="rounded-lg border border-violet-300 bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {busy ? "…" : "Согласовать смету"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => doAction("POST", `/api/orders/${orderId}/request-changes`)}
                className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                {busy ? "…" : "Запросить правки"}
              </button>
            </>
          )}
          {isWarehouse && order.status === "RETURN_DECLARED" ? null : null}
          {isGreenwich && order.status === "ISSUED" && order.greenwichUserId === state.user?.id && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const okDraft = buildDraftFromPhase("DECLARED");
                  void submitReturnDeclared(okDraft);
                }}
                className="rounded-lg border border-amber-300 bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {busy ? "…" : "Все в норме → на приёмку"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setDeclareDraft(buildDraftFromPhase("DECLARED"));
                  setDeclareOpen(true);
                }}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                По позициям…
              </button>
            </>
          )}
          {canCancel && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!confirm("Отменить заявку? Она попадёт в архив.")) return;
                doAction("POST", `/api/orders/${orderId}/cancel`);
              }}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {busy ? "…" : "Отменить заявку"}
            </button>
          )}
        </div>
      </div>
    </AppShell>
  );
}
