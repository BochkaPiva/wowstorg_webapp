"use client";

import React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { AppShell } from "@/app/_ui/AppShell";
import { OrderFinancialSummary } from "@/app/orders/OrderFinancialSummary";
import { OrderStatusStepper, type OrderStatus } from "@/app/_ui/OrderStatusStepper";
import { ToggleSwitch } from "@/app/_ui/ToggleSwitch";
import { useAuth } from "@/app/providers";
import { ORDER_TAX_RATE } from "@/lib/constants";
import { roundMoney } from "@/lib/money";
import {
  calcWarehouseProfitEstimate,
  ORDER_SERVICE_INTERNAL_PAYMENT_FIELD_LABEL,
  ORDER_SERVICE_PAYMENT_METHOD_LABELS,
  type OrderServicePaymentMethod,
} from "@/lib/order-service-internal-costs";
import {
  billableRentalDaysFromDateOnly,
  type RentalPartOfDay,
} from "@/lib/rental-days";
import {
  isEnabledServicePriceSpecified,
  listMissingEnabledServicePrices,
} from "@/server/orders/service-pricing";

type OrderLine = {
  id: string;
  itemId: string;
  requestedQty: number;
  approvedQty: number | null;
  issuedQty: number | null;
  pricePerDaySnapshot: number | null;
  warehouseComment: string | null;
  greenwichComment?: string | null;
  item: { id: string; name: string; type: string; photo1Key: string | null };
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

type OrderHiddenExpense = {
  id?: string;
  title: string;
  comment: string | null;
  cost: number | null;
  internalPaymentMethod: OrderServicePaymentMethod;
};

type Order = {
  id: string;
  status: OrderStatus;
  source: string;
  parentOrderId?: string | null;
  /** Только WOWSTORG: ссылка на карточку мероприятия. */
  project?: { id: string; title: string } | null;
  readyByDate: string;
  startDate: string;
  endDate: string;
  rentalStartPartOfDay?: RentalPartOfDay;
  rentalEndPartOfDay?: RentalPartOfDay;
  createdAt: string;
  updatedAt: string;
  eventName: string | null;
  comment: string | null;
  customer: { id: string; name: string };
  createdBy: { id: string; displayName: string };
  greenwichUserId?: string | null;
  greenwichUser: { id: string; displayName: string; ratingScore?: number } | null;
  deliveryEnabled: boolean;
  deliveryComment: string | null;
  deliveryPrice: number | null;
  deliveryInternalCost?: number | null;
  deliveryInternalPaymentMethod?: OrderServicePaymentMethod;
  montageEnabled: boolean;
  montageComment: string | null;
  montagePrice: number | null;
  montageInternalCost?: number | null;
  montageInternalPaymentMethod?: OrderServicePaymentMethod;
  demontageEnabled: boolean;
  demontageComment: string | null;
  demontagePrice: number | null;
  demontageInternalCost?: number | null;
  demontageInternalPaymentMethod?: OrderServicePaymentMethod;
  hiddenExpenses?: OrderHiddenExpense[];
  payMultiplier?: number | null;
  rentalDiscountType: "NONE" | "PERCENT" | "AMOUNT";
  rentalDiscountPercent: number | null;
  rentalDiscountAmount: number | null;
  greenwichRequestedDiscountType: "NONE" | "PERCENT" | "AMOUNT";
  greenwichRequestedDiscountPercent: number | null;
  greenwichRequestedDiscountAmount: number | null;
  greenwichDiscountRequestComment: string | null;
  warehouseInternalNote?: string | null;
  estimateFileKey?: string | null;
  lines: OrderLine[];
  returnSplits?: ReturnSplit[];
};

type CatalogItemOption = {
  id: string;
  name: string;
  photo1Key?: string | null;
  pricePerDay?: number | null;
  availableForDates?: number;
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
  OK: "Все в норме",
  NEEDS_REPAIR: "Требует ремонта",
  BROKEN: "Сломано",
  MISSING: "Утеряно",
};

const CONDITIONS: ReturnSplit["condition"][] = ["OK", "NEEDS_REPAIR", "BROKEN", "MISSING"];
const CONDITION_LEGEND: Array<{
  condition: ReturnSplit["condition"];
  description: string;
  className: string;
}> = [
  {
    condition: "OK",
    description: "Вернулось в исходном состоянии: реквизит чистый, целый и готов снова уйти в аренду.",
    className: "border-emerald-200 bg-emerald-50 text-emerald-950",
  },
  {
    condition: "NEEDS_REPAIR",
    description: "Есть поломка или износ, но вещь можно восстановить: нужен ремонт, замена детали или обслуживание.",
    className: "border-amber-200 bg-amber-50 text-amber-950",
  },
  {
    condition: "BROKEN",
    description: "Серьезное повреждение: скорее всего, реквизит уже нельзя нормально восстановить или использовать дальше.",
    className: "border-rose-200 bg-rose-50 text-rose-950",
  },
  {
    condition: "MISSING",
    description: "Реквизит не вернулся: потерян, не найден или остался не у клиента.",
    className: "border-zinc-200 bg-zinc-50 text-zinc-900",
  },
];
const DISCOUNT_TYPE_OPTIONS: Array<{ value: "NONE" | "PERCENT" | "AMOUNT"; label: string; hint: string }> = [
  { value: "NONE", label: "Без скидки", hint: "Итог без ручной скидки" },
  { value: "PERCENT", label: "Процент", hint: "Например, 10%" },
  { value: "AMOUNT", label: "Сумма", hint: "Фиксированная сумма" },
];

const orderShellClass =
  "overflow-hidden rounded-[2rem] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(246,241,255,0.82)_52%,rgba(255,247,218,0.72))] shadow-[0_24px_70px_rgba(76,29,149,0.12)]";
const orderGlassCardClass =
  "rounded-[1.5rem] border border-white/75 bg-white/76 shadow-[0_18px_45px_rgba(24,24,27,0.08)] backdrop-blur";
const orderSoftCardClass =
  "rounded-[1.35rem] border border-zinc-200/70 bg-white/82 shadow-[0_12px_34px_rgba(24,24,27,0.06)] backdrop-blur";
const orderSectionHeaderClass =
  "border-b border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.88),rgba(245,240,255,0.78))] px-5 py-4";
const orderInputClass =
  "rounded-2xl border border-zinc-200/80 bg-white/88 px-4 py-2.5 text-sm shadow-inner shadow-zinc-950/[0.03] outline-none placeholder:text-zinc-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-100";
const orderPrimaryButtonClass =
  "rounded-2xl border border-violet-500/30 bg-[linear-gradient(135deg,#7c1fff,#b409e8)] px-4 py-2.5 text-sm font-black text-white shadow-[0_14px_30px_rgba(124,31,255,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(124,31,255,0.28)] disabled:translate-y-0 disabled:opacity-50";
const orderSecondaryButtonClass =
  "rounded-2xl border border-zinc-200/80 bg-white/85 px-4 py-2.5 text-sm font-bold text-zinc-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-white disabled:translate-y-0 disabled:opacity-50";
const orderDangerButtonClass =
  "rounded-2xl border border-rose-200 bg-white/85 px-4 py-2.5 text-sm font-bold text-rose-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-50 disabled:translate-y-0 disabled:opacity-50";
const orderWarningButtonClass =
  "rounded-2xl border border-amber-300/70 bg-[linear-gradient(135deg,#f59e0b,#d97706)] px-4 py-2.5 text-sm font-black text-white shadow-[0_14px_30px_rgba(217,119,6,0.2)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(217,119,6,0.24)] disabled:translate-y-0 disabled:opacity-50";

function PencilIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l9.06-9.06.92.92-9.06 9.06zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    </svg>
  );
}

function CloseIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

function fmtDate(s: string) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtDateRentPart(dateIso: string, part: RentalPartOfDay) {
  return `${fmtDate(dateIso)} · ${part === "MORNING" ? "утро" : "вечер"}`;
}

function orderTotal(order: {
  lines: { pricePerDaySnapshot: number | null; requestedQty: number }[];
  startDate: string;
  endDate: string;
  rentalStartPartOfDay?: RentalPartOfDay;
  rentalEndPartOfDay?: RentalPartOfDay;
  payMultiplier?: number | null;
  deliveryEnabled?: boolean;
  deliveryPrice: number | null;
  montageEnabled?: boolean;
  montagePrice: number | null;
  demontageEnabled?: boolean;
  demontagePrice: number | null;
  rentalDiscountType?: "NONE" | "PERCENT" | "AMOUNT";
  rentalDiscountPercent?: number | null;
  rentalDiscountAmount?: number | null;
}): number {
  return calcOrderPricingClient(order).grandTotal;
}

function calcOrderPricingClient(order: {
  lines: { pricePerDaySnapshot: number | null; requestedQty: number }[];
  startDate: string;
  endDate: string;
  rentalStartPartOfDay?: RentalPartOfDay;
  rentalEndPartOfDay?: RentalPartOfDay;
  payMultiplier?: number | null;
  deliveryEnabled?: boolean;
  deliveryPrice: number | null;
  montageEnabled?: boolean;
  montagePrice: number | null;
  demontageEnabled?: boolean;
  demontagePrice: number | null;
  rentalDiscountType?: "NONE" | "PERCENT" | "AMOUNT";
  rentalDiscountPercent?: number | null;
  rentalDiscountAmount?: number | null;
}) {
  const startPart: RentalPartOfDay = order.rentalStartPartOfDay ?? "MORNING";
  const endPart: RentalPartOfDay = order.rentalEndPartOfDay ?? "MORNING";
  const days = billableRentalDaysFromDateOnly({
    startDate: order.startDate,
    endDate: order.endDate,
    rentalStartPartOfDay: startPart,
    rentalEndPartOfDay: endPart,
  });
  const multiplier = order.payMultiplier != null ? Number(order.payMultiplier) : 1;
  const rentalBeforeDiscount = order.lines.reduce(
    (sum, l) => sum + (l.pricePerDaySnapshot ?? 0) * l.requestedQty * days * multiplier,
    0,
  );
  const rawDiscount =
    order.rentalDiscountType === "PERCENT"
      ? rentalBeforeDiscount * ((order.rentalDiscountPercent ?? 0) / 100)
      : order.rentalDiscountType === "AMOUNT"
        ? (order.rentalDiscountAmount ?? 0)
        : 0;
  const discountAmount = Math.min(Math.max(0, rawDiscount), rentalBeforeDiscount);
  const rentalAfterDiscount = Math.max(0, rentalBeforeDiscount - discountAmount);
  const services =
    (order.deliveryEnabled === false ? 0 : order.deliveryPrice ?? 0) +
    (order.montageEnabled === false ? 0 : order.montagePrice ?? 0) +
    (order.demontageEnabled === false ? 0 : order.demontagePrice ?? 0);
  const grandTotalBeforeTax = roundMoney(rentalAfterDiscount + services);
  const taxAmount = roundMoney(grandTotalBeforeTax * ORDER_TAX_RATE);
  return {
    days,
    multiplier,
    rentalBeforeDiscount,
    discountAmount,
    rentalAfterDiscount,
    services,
    grandTotalBeforeTax,
    taxRate: ORDER_TAX_RATE,
    taxAmount,
    grandTotal: roundMoney(grandTotalBeforeTax + taxAmount),
  };
}

function formatDiscountLabel(type: string | null | undefined, percent?: number | null, amount?: number | null) {
  if (type === "PERCENT" && percent != null) return `${percent}%`;
  if (type === "AMOUNT" && amount != null) return `${amount.toLocaleString("ru-RU")} ₽`;
  return "нет";
}

function orderServicesProfitEstimate(order: {
  deliveryEnabled: boolean;
  deliveryInternalCost?: number | null;
  deliveryInternalPaymentMethod?: OrderServicePaymentMethod;
  montageEnabled: boolean;
  montageInternalCost?: number | null;
  montageInternalPaymentMethod?: OrderServicePaymentMethod;
  demontageEnabled: boolean;
  demontageInternalCost?: number | null;
  demontageInternalPaymentMethod?: OrderServicePaymentMethod;
  hiddenExpenses?: OrderHiddenExpense[] | null;
  lines: { pricePerDaySnapshot: number | null; requestedQty: number }[];
  startDate: string;
  endDate: string;
  rentalStartPartOfDay?: RentalPartOfDay;
  rentalEndPartOfDay?: RentalPartOfDay;
  payMultiplier?: number | null;
  deliveryPrice: number | null;
  montagePrice: number | null;
  demontagePrice: number | null;
  rentalDiscountType?: "NONE" | "PERCENT" | "AMOUNT";
  rentalDiscountPercent?: number | null;
  rentalDiscountAmount?: number | null;
}) {
  const pricing = calcOrderPricingClient(order);
  return calcWarehouseProfitEstimate({
    clientGrandTotal: pricing.grandTotal,
    clientTaxAmount: pricing.taxAmount,
    delivery: {
      enabled: order.deliveryEnabled,
      internalCost: order.deliveryInternalCost,
      internalPaymentMethod: order.deliveryInternalPaymentMethod,
    },
    montage: {
      enabled: order.montageEnabled,
      internalCost: order.montageInternalCost,
      internalPaymentMethod: order.montageInternalPaymentMethod,
    },
    demontage: {
      enabled: order.demontageEnabled,
      internalCost: order.demontageInternalCost,
      internalPaymentMethod: order.demontageInternalPaymentMethod,
    },
    hiddenExpenses: order.hiddenExpenses,
  });
}

function lineIssuedQty(l: OrderLine): number {
  const q = l.issuedQty ?? l.approvedQty ?? l.requestedQty;
  return typeof q === "number" && Number.isFinite(q) ? q : 0;
}

type SplitRow = { condition: ReturnSplit["condition"]; qty: number };
/** Сырые строки черновика: qty может быть "" для возможности стереть поле. */
type SplitRowRaw = { condition: ReturnSplit["condition"]; qty: number | "" };

function nextDefaultCondition(used: ReturnSplit["condition"][]): ReturnSplit["condition"] {
  if (!used.includes("OK")) return "OK";
  const next = CONDITIONS.find((c) => !used.includes(c));
  return next ?? "OK";
}

function normalizeRows(total: number, rows: SplitRowRaw[]): SplitRow[] {
  const clean = rows
    .filter((r) => CONDITIONS.includes(r.condition))
    .map((r) => ({ condition: r.condition, qty: Math.max(0, Math.floor(Number(r.qty) || 0)) }));

  if (total <= 0) return [{ condition: "OK", qty: 0 }];
  if (clean.length === 0) return [{ condition: "OK", qty: total }];

  // Сначала строки не-OK, затем OK. Иначе при порядке [OK, NEEDS_REPAIR] первая «OK» забирает весь total
  // и цикл прерывается — дефекты ниже не учитываются (типичный порядок в форме: сначала «В норме»).
  clean.sort((a, b) => {
    const ao = a.condition === "OK" ? 1 : 0;
    const bo = b.condition === "OK" ? 1 : 0;
    return ao - bo;
  });

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

function ProductThumb({
  itemId,
  photo1Key,
  size = "sm",
}: {
  itemId: string;
  photo1Key?: string | null;
  size?: "sm" | "md";
}) {
  const boxClass =
    size === "md"
      ? "h-14 w-14 rounded-2xl"
      : "h-11 w-11 rounded-xl";
  const previewWidth = size === "md" ? 160 : 120;

  if (photo1Key) {
    return (
      <img
        src={`/api/inventory/positions/${itemId}/photo?w=${previewWidth}`}
        alt=""
        aria-hidden="true"
        className={`${boxClass} shrink-0 border border-zinc-200 bg-zinc-100 object-cover shadow-sm`}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`${boxClass} shrink-0 border border-zinc-200 bg-[linear-gradient(180deg,rgba(245,243,255,0.95),rgba(255,255,255,0.98))] text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500 shadow-sm flex items-center justify-center`}
    >
      WOW
    </div>
  );
}

function ProductIdentity({
  itemId,
  photo1Key,
  name,
  subtitle,
  size = "sm",
  nameClassName = "font-medium text-zinc-900",
}: {
  itemId: string;
  photo1Key?: string | null;
  name: string;
  subtitle?: React.ReactNode;
  size?: "sm" | "md";
  nameClassName?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <ProductThumb itemId={itemId} photo1Key={photo1Key} size={size} />
      <div className="min-w-0">
        <div className={`truncate ${nameClassName}`} title={name}>
          {name}
        </div>
        {subtitle ? <div className="mt-0.5 text-xs text-zinc-500">{subtitle}</div> : null}
      </div>
    </div>
  );
}

function AddLineRow({
  catalogItems,
  existingItemIds,
  onAdd,
}: {
  catalogItems: CatalogItemOption[];
  existingItemIds: string[];
  onAdd: (itemId: string, itemName: string, qty: number, maxForDates?: number) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<CatalogItemOption | null>(null);
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
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[220px] flex-1 rounded-2xl border border-violet-200/80 bg-violet-50/70 px-3 py-2 shadow-sm">
            <ProductIdentity
              itemId={selected.id}
              photo1Key={selected.photo1Key}
              name={selected.name}
              subtitle={
                selected.availableForDates != null ? (
                  <>
                    Доступно на даты:{" "}
                    <span className="font-semibold text-zinc-700">{selected.availableForDates}</span>
                  </>
                ) : undefined
              }
            />
          </div>
          <div className="flex items-center overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/88 shadow-sm">
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
          <button
            type="button"
            onClick={() => {
              const n = qty === "" ? 1 : qty;
              onAdd(selected.id, selected.name, n, selected.availableForDates);
              setSelected(null);
              setQty(1);
              setSearch("");
            }}
            className={orderPrimaryButtonClass}
          >
            Добавить
          </button>
          <button
            type="button"
            onClick={() => { setSelected(null); setSearch(""); }}
            className={orderSecondaryButtonClass + " px-3 py-2"}
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
            className={orderInputClass + " w-full"}
          />
          {open && (
            <>
              <div
                className="fixed inset-0 z-40"
                aria-hidden
                onClick={() => setOpen(false)}
              />
              <ul
                className="absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-auto rounded-2xl border border-white/75 bg-white/95 shadow-[0_18px_45px_rgba(24,24,27,0.14)] backdrop-blur"
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
                        <ProductIdentity
                          itemId={i.id}
                          photo1Key={i.photo1Key}
                          name={i.name}
                          subtitle={
                            i.availableForDates != null ? (
                              <>
                                Доступно: <span className="font-semibold text-zinc-700">{i.availableForDates}</span>
                              </>
                            ) : undefined
                          }
                        />
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
  showInternalPrice,
  internalPrice,
  onInternalPriceChange,
  internalPaymentMethod,
  onInternalPaymentMethodChange,
  lockEnabled = false,
  hideComment = false,
}: {
  label: string;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  comment: string;
  onCommentChange: (v: string) => void;
  showPrice: boolean;
  price: number | "";
  onPriceChange: (v: number | "") => void;
  showInternalPrice?: boolean;
  internalPrice?: number | "";
  onInternalPriceChange?: (v: number | "") => void;
  internalPaymentMethod?: OrderServicePaymentMethod;
  onInternalPaymentMethodChange?: (v: OrderServicePaymentMethod) => void;
  lockEnabled?: boolean;
  hideComment?: boolean;
}) {
  const priceMissing = enabled && !isEnabledServicePriceSpecified(price);
  const gridCols =
    hideComment && showInternalPrice
      ? "sm:grid-cols-[minmax(8rem,12rem)_minmax(10rem,14rem)]"
      : showPrice && showInternalPrice
      ? "sm:grid-cols-[1fr_auto_auto_auto]"
      : showPrice
        ? "sm:grid-cols-[1fr_auto]"
        : "";
  return (
    <div
      className={[
        "rounded-[1.35rem] border p-4 shadow-sm transition-colors",
        enabled ? "border-violet-200/80 bg-violet-50/45" : "border-zinc-200/70 bg-white/65",
      ].join(" ")}
    >
      <ToggleSwitch checked={enabled} onChange={onEnabledChange} label={label} disabled={lockEnabled} />
      {enabled && (
        <div className={`mt-3 grid gap-3 ${gridCols}`}>
          {!hideComment ? (
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">Комментарий</label>
            <input
              type="text"
              value={comment}
              onChange={(e) => onCommentChange(e.target.value)}
              placeholder="Описание или примечание"
              className={orderInputClass + " w-full"}
            />
          </div>
          ) : null}
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
                className={`w-full rounded-2xl border px-3 py-2 text-sm text-right tabular-nums outline-none focus:ring-4 ${
                  priceMissing
                    ? "border-amber-300 bg-amber-50/50 focus:border-amber-400 focus:ring-amber-200"
                    : "border-zinc-200/80 bg-white/88 focus:border-violet-300 focus:ring-violet-100"
                }`}
              />
              {priceMissing && (
                <p className="mt-1 text-xs text-amber-600">Укажите цену для отправки сметы</p>
              )}
            </div>
          ) : null}
          {showInternalPrice && internalPrice !== undefined && onInternalPriceChange ? (
            <div className="min-w-[120px]">
              <label className="block text-xs font-medium text-zinc-500 mb-1">Внутр. (₽)</label>
              <input
                type="number"
                min={0}
                step={1}
                value={internalPrice === "" ? "" : internalPrice}
                onChange={(e) =>
                  onInternalPriceChange(e.target.value === "" ? "" : Number(e.target.value))
                }
                placeholder="необяз."
                className={orderInputClass + " w-full text-right tabular-nums"}
              />
            </div>
          ) : null}
          {showInternalPrice && internalPaymentMethod && onInternalPaymentMethodChange ? (
            <div className="min-w-[130px]">
              <label className="block text-xs font-medium text-zinc-500 mb-1">
                {ORDER_SERVICE_INTERNAL_PAYMENT_FIELD_LABEL}
              </label>
              <select
                value={internalPaymentMethod}
                onChange={(e) => onInternalPaymentMethodChange(e.target.value as OrderServicePaymentMethod)}
                className={orderInputClass + " w-full font-semibold text-zinc-800"}
              >
                <option value="NON_CASH">{ORDER_SERVICE_PAYMENT_METHOD_LABELS.NON_CASH}</option>
                <option value="CASH">{ORDER_SERVICE_PAYMENT_METHOD_LABELS.CASH}</option>
              </select>
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
  const orderEditSaveRef = React.useRef<HTMLButtonElement | null>(null);
  const [showFloatingOrderSave, setShowFloatingOrderSave] = React.useState(false);

  type ReturnLineDraft = { comment: string; rows: SplitRowRaw[] };
  const [declareOpen, setDeclareOpen] = React.useState(false);
  const [declareDraft, setDeclareDraft] = React.useState<Record<string, ReturnLineDraft>>({});
  const [checkInDraft, setCheckInDraft] = React.useState<Record<string, ReturnLineDraft>>({});

  type EditLine = {
    id?: string;
    itemId: string;
    itemName: string;
    itemPhoto1Key?: string | null;
    pricePerDaySnapshot?: number | null;
    requestedQty: number | string;
    lineComment: string;
  };
  type EditHiddenExpense = {
    id?: string;
    title: string;
    comment: string;
    cost: number | "";
    internalPaymentMethod: OrderServicePaymentMethod;
  };
  const [isEditing, setIsEditing] = React.useState(false);
  const [editLines, setEditLines] = React.useState<EditLine[]>([]);
  const [editHiddenExpenses, setEditHiddenExpenses] = React.useState<EditHiddenExpense[]>([]);
  const [editEventName, setEditEventName] = React.useState("");
  const [editComment, setEditComment] = React.useState("");
  const [editDeliveryEnabled, setEditDeliveryEnabled] = React.useState(false);
  const [editDeliveryComment, setEditDeliveryComment] = React.useState("");
  const [editDeliveryPrice, setEditDeliveryPrice] = React.useState<number | "">("");
  const [editDeliveryInternalCost, setEditDeliveryInternalCost] = React.useState<number | "">("");
  const [editDeliveryInternalPaymentMethod, setEditDeliveryInternalPaymentMethod] =
    React.useState<OrderServicePaymentMethod>("NON_CASH");
  const [editMontageEnabled, setEditMontageEnabled] = React.useState(false);
  const [editMontageComment, setEditMontageComment] = React.useState("");
  const [editMontagePrice, setEditMontagePrice] = React.useState<number | "">("");
  const [editMontageInternalCost, setEditMontageInternalCost] = React.useState<number | "">("");
  const [editMontageInternalPaymentMethod, setEditMontageInternalPaymentMethod] =
    React.useState<OrderServicePaymentMethod>("NON_CASH");
  const [editDemontageEnabled, setEditDemontageEnabled] = React.useState(false);
  const [editDemontageComment, setEditDemontageComment] = React.useState("");
  const [editDemontagePrice, setEditDemontagePrice] = React.useState<number | "">("");
  const [editDemontageInternalCost, setEditDemontageInternalCost] = React.useState<number | "">("");
  const [editDemontageInternalPaymentMethod, setEditDemontageInternalPaymentMethod] =
    React.useState<OrderServicePaymentMethod>("NON_CASH");
  const [editRentalDiscountType, setEditRentalDiscountType] = React.useState<"NONE" | "PERCENT" | "AMOUNT">("NONE");
  const [editRentalDiscountPercent, setEditRentalDiscountPercent] = React.useState<number | "">("");
  const [editRentalDiscountAmount, setEditRentalDiscountAmount] = React.useState<number | "">("");
  const [editGreenwichRequestedDiscountType, setEditGreenwichRequestedDiscountType] =
    React.useState<"NONE" | "PERCENT" | "AMOUNT">("NONE");
  const [editGreenwichRequestedDiscountPercent, setEditGreenwichRequestedDiscountPercent] =
    React.useState<number | "">("");
  const [editGreenwichRequestedDiscountAmount, setEditGreenwichRequestedDiscountAmount] =
    React.useState<number | "">("");
  const [editGreenwichDiscountRequestComment, setEditGreenwichDiscountRequestComment] = React.useState("");
  const [catalogItems, setCatalogItems] = React.useState<CatalogItemOption[]>([]);

  const user = state.status === "authenticated" ? state.user : null;
  const isGreenwich = user?.role === "GREENWICH";
  const isWarehouse = user?.role === "WOWSTORG";
  const from = searchParams.get("from");
  /** Встроено в карточку проекта (iframe): без оболочки AppShell и без ухода в очередь после приёмки */
  const embed = searchParams.get("embed") === "1";
  const warehouseBackHref = from === "warehouse-archive" ? "/warehouse/archive" : "/warehouse/queue";
  const warehouseBackLabel = from === "warehouse-archive" ? "В архив" : "В очередь";

  const [internalNoteDraft, setInternalNoteDraft] = React.useState("");
  const [internalNoteOpen, setInternalNoteOpen] = React.useState(false);
  const [internalNoteBusy, setInternalNoteBusy] = React.useState(false);
  const catalogItemsById = React.useMemo(
    () => new Map(catalogItems.map((item) => [item.id, item])),
    [catalogItems],
  );
  const orderPricing = order ? calcOrderPricingClient(order) : null;
  const warehouseProfitEstimate =
    order && isWarehouse ? orderServicesProfitEstimate(order) : null;
  const editPricing = React.useMemo(() => {
    if (!order) return null;
    return calcOrderPricingClient({
      lines: editLines.map((line) => ({
        pricePerDaySnapshot:
          line.pricePerDaySnapshot ?? catalogItemsById.get(line.itemId)?.pricePerDay ?? 0,
        requestedQty: Number(line.requestedQty) || 0,
      })),
      startDate: order.startDate,
      endDate: order.endDate,
      rentalStartPartOfDay: order.rentalStartPartOfDay ?? "MORNING",
      rentalEndPartOfDay: order.rentalEndPartOfDay ?? "MORNING",
      payMultiplier: order.payMultiplier,
      deliveryPrice: editDeliveryEnabled ? Number(editDeliveryPrice || 0) : 0,
      montagePrice: editMontageEnabled ? Number(editMontagePrice || 0) : 0,
      demontagePrice: editDemontageEnabled ? Number(editDemontagePrice || 0) : 0,
      rentalDiscountType: isWarehouse ? editRentalDiscountType : order.rentalDiscountType,
      rentalDiscountPercent: isWarehouse
        ? editRentalDiscountPercent === "" ? null : Number(editRentalDiscountPercent)
        : order.rentalDiscountPercent,
      rentalDiscountAmount: isWarehouse
        ? editRentalDiscountAmount === "" ? null : Number(editRentalDiscountAmount)
        : order.rentalDiscountAmount,
    });
  }, [
    catalogItemsById,
    editDeliveryEnabled,
    editDeliveryPrice,
    editDemontageEnabled,
    editDemontagePrice,
    editLines,
    editMontageEnabled,
    editMontagePrice,
    editRentalDiscountAmount,
    editRentalDiscountPercent,
    editRentalDiscountType,
    isWarehouse,
    order,
  ]);

  function notifyProjectParent() {
    if (!embed || typeof window === "undefined") return;
    try {
      window.parent.postMessage({ type: "wowstorg:project-refresh-request" }, window.location.origin);
    } catch {
      /* ignore */
    }
  }
  const canEditOrder =
    Boolean(
      order &&
        ((isWarehouse &&
          ["SUBMITTED", "ESTIMATE_SENT", "CHANGES_REQUESTED", "APPROVED_BY_GREENWICH"].includes(order.status)) ||
          (isGreenwich &&
            user &&
            !order.parentOrderId &&
            order.greenwichUserId === user.id &&
            ["SUBMITTED", "ESTIMATE_SENT", "CHANGES_REQUESTED", "APPROVED_BY_GREENWICH"].includes(order.status))),
    );
  const canEditClosedOrderServiceCosts = Boolean(order && isWarehouse && order.status === "CLOSED" && !canEditOrder);
  const isClosedServiceCostEdit = Boolean(isEditing && canEditClosedOrderServiceCosts);

  const loadOrder = React.useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as
        | { order?: Order; error?: { message?: string } }
        | null;
      if (!res.ok) {
        setOrder(null);
        setError(data?.error?.message ?? "Не удалось загрузить заявку");
        return;
      }
      setOrder(data?.order ?? null);
    } catch {
      setOrder(null);
      setError("Не удалось загрузить заявку");
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
    if (!order || !isWarehouse) return;
    setInternalNoteDraft(order.warehouseInternalNote ?? "");
  }, [order, isWarehouse]);

  React.useEffect(() => {
    if (!isEditing || typeof IntersectionObserver === "undefined") {
      setShowFloatingOrderSave(false);
      return;
    }

    const saveButton = orderEditSaveRef.current;
    if (!saveButton) {
      setShowFloatingOrderSave(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setShowFloatingOrderSave(!entry.isIntersecting),
      { threshold: 0.1 },
    );

    observer.observe(saveButton);
    return () => observer.disconnect();
  }, [isEditing]);

  React.useEffect(() => {
    if (!order) return;
    if (isWarehouse && order.status === "RETURN_DECLARED") {
      // Всегда стартуем от текущей декларации Greenwich из order.returnSplits.
      // Не используем локальный declareDraft, чтобы не подхватить устаревшие данные
      // при переходе между разными заявками в рамках одной сессии.
      setCheckInDraft(buildDraftFromPhase("DECLARED"));
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
      const data = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: { message?: string };
            notification?: { queued?: boolean; sent?: boolean; message?: string };
          }
        | null;
      if (!res.ok) {
        setActionError(data?.error?.message ?? "Ошибка операции");
        return;
      }
      const n = data?.notification;
      if (path.includes("cancel") && n && !n.queued && "sent" in n && n.sent === false && n.message) {
        alert(`Заявка отменена.\n\n⚠️ ${n.message}`);
      }
      await loadOrder();
      notifyProjectParent();
      if (
        !embed &&
        (path.includes("check-in") || path.includes("cancel"))
      ) {
        if (isWarehouse) router.push("/warehouse/queue");
        else if (isGreenwich) router.push("/orders");
      }
    } catch {
      setActionError("Ошибка сети или ответа сервера");
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
        itemPhoto1Key: l.item.photo1Key,
        pricePerDaySnapshot: l.pricePerDaySnapshot,
        requestedQty: l.requestedQty,
        lineComment: (isGreenwich ? (l.greenwichComment ?? "") : (l.warehouseComment ?? "")) as string,
      })),
    );
    setEditEventName(order.eventName ?? "");
    setEditComment(order.comment ?? "");
    setEditDeliveryEnabled(order.deliveryEnabled);
    setEditDeliveryComment(order.deliveryComment ?? "");
    setEditDeliveryPrice(order.deliveryPrice ?? "");
    setEditDeliveryInternalCost(
      order.deliveryInternalCost != null ? Number(order.deliveryInternalCost) : "",
    );
    setEditDeliveryInternalPaymentMethod(order.deliveryInternalPaymentMethod ?? "NON_CASH");
    setEditMontageEnabled(order.montageEnabled);
    setEditMontageComment(order.montageComment ?? "");
    setEditMontagePrice(order.montagePrice ?? "");
    setEditMontageInternalCost(
      order.montageInternalCost != null ? Number(order.montageInternalCost) : "",
    );
    setEditMontageInternalPaymentMethod(order.montageInternalPaymentMethod ?? "NON_CASH");
    setEditDemontageEnabled(order.demontageEnabled);
    setEditDemontageComment(order.demontageComment ?? "");
    setEditDemontagePrice(order.demontagePrice ?? "");
    setEditDemontageInternalCost(
      order.demontageInternalCost != null ? Number(order.demontageInternalCost) : "",
    );
    setEditDemontageInternalPaymentMethod(order.demontageInternalPaymentMethod ?? "NON_CASH");
    setEditHiddenExpenses(
      (order.hiddenExpenses ?? []).map((expense) => ({
        id: expense.id,
        title: expense.title,
        comment: expense.comment ?? "",
        cost: expense.cost != null ? Number(expense.cost) : "",
        internalPaymentMethod: expense.internalPaymentMethod ?? "NON_CASH",
      })),
    );
    setEditRentalDiscountType(order.rentalDiscountType ?? "NONE");
    setEditRentalDiscountPercent(order.rentalDiscountPercent ?? "");
    setEditRentalDiscountAmount(order.rentalDiscountAmount ?? "");
    setEditGreenwichRequestedDiscountType(order.greenwichRequestedDiscountType ?? "NONE");
    setEditGreenwichRequestedDiscountPercent(order.greenwichRequestedDiscountPercent ?? "");
    setEditGreenwichRequestedDiscountAmount(order.greenwichRequestedDiscountAmount ?? "");
    setEditGreenwichDiscountRequestComment(order.greenwichDiscountRequestComment ?? "");
    setIsEditing(true);
    setActionError(null);
    if (canEditClosedOrderServiceCosts) {
      setCatalogItems([]);
      return;
    }
    const start = order.startDate.slice(0, 10);
    const end = order.endDate.slice(0, 10);
    const rsp = encodeURIComponent(order.rentalStartPartOfDay ?? "MORNING");
    const rep = encodeURIComponent(order.rentalEndPartOfDay ?? "MORNING");
    fetch(
      `/api/catalog/items?all=true&startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&rentalStartPartOfDay=${rsp}&rentalEndPartOfDay=${rep}&excludeOrderId=${encodeURIComponent(orderId)}`,
      { cache: "no-store" },
    )
      .then((r) => r.json().catch(() => null))
      .then((data: { items?: { id: string; name: string; photo1Key?: string | null; pricePerDay?: number; availability?: { availableForDates?: number } }[] } | null) => {
        setCatalogItems(
          (data?.items ?? []).map((i) => ({
            id: i.id,
            name: i.name,
            photo1Key: i.photo1Key ?? null,
            pricePerDay: i.pricePerDay ?? null,
            availableForDates: i.availability?.availableForDates,
          })),
        );
      })
      .catch(() => setCatalogItems([]));
  }

  function hiddenExpensePayload() {
    return editHiddenExpenses
      .map((expense) => ({
        id: expense.id,
        title: expense.title.trim(),
        comment: expense.comment.trim() || null,
        cost: expense.cost === "" ? 0 : Number(expense.cost),
        internalPaymentMethod: expense.internalPaymentMethod,
      }))
      .filter((expense) => expense.title.length > 0 || expense.cost > 0);
  }

  async function saveOrderEdit() {
    if (!orderId || !order) return;
    const incompleteHiddenExpense = editHiddenExpenses.some(
      (expense) =>
        expense.title.trim().length === 0 &&
        (expense.comment.trim().length > 0 || expense.cost !== ""),
    );
    if (incompleteHiddenExpense) {
      setActionError("Укажите название для каждой скрытой траты.");
      return;
    }
    if (isClosedServiceCostEdit) {
      const body = {
        ...(order.deliveryEnabled
          ? {
              deliveryInternalCost: editDeliveryInternalCost === "" ? null : Number(editDeliveryInternalCost),
              deliveryInternalPaymentMethod: editDeliveryInternalPaymentMethod,
            }
          : {}),
        ...(order.montageEnabled
          ? {
              montageInternalCost: editMontageInternalCost === "" ? null : Number(editMontageInternalCost),
              montageInternalPaymentMethod: editMontageInternalPaymentMethod,
            }
          : {}),
        ...(order.demontageEnabled
          ? {
              demontageInternalCost: editDemontageInternalCost === "" ? null : Number(editDemontageInternalCost),
              demontageInternalPaymentMethod: editDemontageInternalPaymentMethod,
            }
          : {}),
        hiddenExpenses: hiddenExpensePayload(),
      };
      setBusy(true);
      setActionError(null);
      try {
        const res = await fetch(`/api/orders/${orderId}/warehouse-edit`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const text = await res.text();
        let data: { error?: { message?: string } } = {};
        try {
          if (text) data = JSON.parse(text) as { error?: { message?: string } };
        } catch {
          data = {};
        }
        if (!res.ok) {
          setActionError(data?.error?.message ?? "Ошибка сохранения");
          return;
        }
        await loadOrder();
        notifyProjectParent();
        setIsEditing(false);
      } catch {
        setActionError("Ошибка сети или ответ сервера");
      } finally {
        setBusy(false);
      }
      return;
    }
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
      const max = catalogItemsById.get(row.itemId)?.availableForDates;
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
          ...(isWarehouse
            ? {
                deliveryInternalCost: editDeliveryEnabled
                  ? editDeliveryInternalCost === ""
                    ? null
                    : Number(editDeliveryInternalCost)
                  : null,
                deliveryInternalPaymentMethod: editDeliveryEnabled
                  ? editDeliveryInternalPaymentMethod
                  : "NON_CASH",
              }
            : {}),
          montageEnabled: editMontageEnabled,
          montageComment: editMontageComment.trim() || undefined,
          ...(isWarehouse ? { montagePrice: editMontageEnabled && editMontagePrice !== "" ? Number(editMontagePrice) : undefined } : {}),
          ...(isWarehouse
            ? {
                montageInternalCost: editMontageEnabled
                  ? editMontageInternalCost === ""
                    ? null
                    : Number(editMontageInternalCost)
                  : null,
                montageInternalPaymentMethod: editMontageEnabled
                  ? editMontageInternalPaymentMethod
                  : "NON_CASH",
              }
            : {}),
          demontageEnabled: editDemontageEnabled,
          demontageComment: editDemontageComment.trim() || undefined,
          ...(isWarehouse ? { demontagePrice: editDemontageEnabled && editDemontagePrice !== "" ? Number(editDemontagePrice) : undefined } : {}),
          ...(isWarehouse
            ? {
                demontageInternalCost: editDemontageEnabled
                  ? editDemontageInternalCost === ""
                    ? null
                    : Number(editDemontageInternalCost)
                  : null,
                demontageInternalPaymentMethod: editDemontageEnabled
                  ? editDemontageInternalPaymentMethod
                  : "NON_CASH",
                hiddenExpenses: hiddenExpensePayload(),
              }
            : {}),
          ...(isWarehouse
            ? {
                rentalDiscountType: editRentalDiscountType,
                rentalDiscountPercent:
                  editRentalDiscountType === "PERCENT" && editRentalDiscountPercent !== ""
                    ? Number(editRentalDiscountPercent)
                    : null,
                rentalDiscountAmount:
                  editRentalDiscountType === "AMOUNT" && editRentalDiscountAmount !== ""
                    ? Number(editRentalDiscountAmount)
                    : null,
              }
            : {
                greenwichRequestedDiscountType: editGreenwichRequestedDiscountType,
                greenwichRequestedDiscountPercent:
                  editGreenwichRequestedDiscountType === "PERCENT" &&
                  editGreenwichRequestedDiscountPercent !== ""
                    ? Number(editGreenwichRequestedDiscountPercent)
                    : null,
                greenwichRequestedDiscountAmount:
                  editGreenwichRequestedDiscountType === "AMOUNT" &&
                  editGreenwichRequestedDiscountAmount !== ""
                    ? Number(editGreenwichRequestedDiscountAmount)
                    : null,
                greenwichDiscountRequestComment: editGreenwichDiscountRequestComment.trim() || null,
              }),
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
      const text = await res.text();
      let data: { error?: { message?: string } } = {};
      try {
        if (text) data = JSON.parse(text) as { error?: { message?: string } };
      } catch {
        data = {};
      }
      if (!res.ok) {
        setActionError(data?.error?.message ?? "Ошибка сохранения");
        return;
      }
      await loadOrder();
      notifyProjectParent();
      setIsEditing(false);
    } catch {
      setActionError("Ошибка сети или ответа сервера");
    } finally {
      setBusy(false);
    }
  }

  async function saveInternalNote() {
    if (!orderId || !isWarehouse) return;
    setInternalNoteBusy(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/internal-note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: internalNoteDraft.trim() || null }),
      });
      if (res.ok) {
        await loadOrder();
        setInternalNoteOpen(false);
        notifyProjectParent();
      } else {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setActionError(j?.error?.message ?? "Не удалось сохранить комментарий");
      }
    } finally {
      setInternalNoteBusy(false);
    }
  }

  function addEditLine(itemId: string, itemName: string, qty: number, maxForDates?: number) {
    if (!itemId || qty < 1) return;
    const safeQty = maxForDates != null ? Math.min(maxForDates, qty) : qty;
    const option = catalogItemsById.get(itemId);
    setEditLines((prev) => [
      ...prev,
      {
        itemId,
        itemName,
        itemPhoto1Key: option?.photo1Key ?? null,
        pricePerDaySnapshot: option?.pricePerDay ?? null,
        requestedQty: safeQty,
        lineComment: "",
      },
    ]);
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
          const max = catalogItemsById.get(row.itemId)?.availableForDates;
          const n = Number(next.requestedQty);
          if (max != null && Number.isFinite(n)) {
            next.requestedQty = Math.min(max, Math.max(1, Math.floor(n))) as never;
          }
        }
        return next;
      }),
    );
  }

  function addHiddenExpense() {
    setEditHiddenExpenses((prev) => [
      ...prev,
      { title: "", comment: "", cost: "", internalPaymentMethod: "NON_CASH" },
    ]);
  }

  function removeHiddenExpense(index: number) {
    setEditHiddenExpenses((prev) => prev.filter((_, i) => i !== index));
  }

  function updateHiddenExpense<K extends keyof EditHiddenExpense>(
    index: number,
    field: K,
    value: EditHiddenExpense[K],
  ) {
    setEditHiddenExpenses((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }

  const canCancel =
    order &&
    ["SUBMITTED", "ESTIMATE_SENT", "CHANGES_REQUESTED"].includes(order.status) &&
    (isWarehouse || (isGreenwich && user && order.greenwichUserId === user.id));

  const canSendEstimate =
    (order?.status === "SUBMITTED" || order?.status === "CHANGES_REQUESTED") &&
    listMissingEnabledServicePrices(order).length === 0;
  const canStartPicking =
    order?.status === "APPROVED_BY_GREENWICH" &&
    listMissingEnabledServicePrices(order).length === 0;
  const sendEstimateBlocked =
    (order?.status === "SUBMITTED" || order?.status === "CHANGES_REQUESTED") &&
    isWarehouse &&
    !canSendEstimate &&
    (order.deliveryEnabled || order.montageEnabled || order.demontageEnabled);
  const startPickingBlocked =
    order?.status === "APPROVED_BY_GREENWICH" &&
    isWarehouse &&
    !canStartPicking &&
    (order.deliveryEnabled || order.montageEnabled || order.demontageEnabled);
  const isOrderGreenwichUser = order && user && order.greenwichUserId === user.id;

  if (loading) {
    const body = <div className="text-sm text-zinc-600">Загрузка…</div>;
    return embed ? (
      <div className="p-4">{body}</div>
    ) : (
      <AppShell title="Заявка">{body}</AppShell>
    );
  }

  if (error || !order) {
    const body = (
      <div className="space-y-3">
        <p className="text-sm text-red-600">{error ?? "Заявка не найдена"}</p>
        {!embed ? (
          <Link
            href={isWarehouse ? warehouseBackHref : "/orders"}
            className="inline-block rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
          >
            ← Назад
          </Link>
        ) : null}
      </div>
    );
    return embed ? (
      <div className="p-4">{body}</div>
    ) : (
      <AppShell title="Заявка">{body}</AppShell>
    );
  }

  const statusLabel = STATUS_LABEL[order.status] ?? order.status;

  const statusHeaderClass =
    order.status === "CANCELLED"
      ? "bg-[#5b0b17]/10 text-[#5b0b17]"
      : order.status === "CLOSED"
        ? "bg-violet-50 text-violet-900"
      : "bg-white";

  const inner = (
      <div className="space-y-6">
        {!embed ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href={isWarehouse ? warehouseBackHref : "/orders"}
              className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-4 py-2 text-sm font-bold text-zinc-700 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:text-zinc-950"
            >
              ← {isWarehouse ? warehouseBackLabel : "Мои заявки"}
            </Link>
          </div>
        ) : null}

        <div
          className={[
            orderShellClass,
            order.status === "CANCELLED"
              ? "border-[#5b0b17]/20"
              : "border-white/70",
          ].join(" ")}
        >
          <div className={["border-b border-white/70 px-4 py-5 sm:px-6", statusHeaderClass].join(" ")}>
            <div className={orderGlassCardClass}>
              <div className="p-4">
                <OrderStatusStepper status={order.status} source={order.source as "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL"} />
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-6">
            <div className="space-y-4">
              <div className="text-2xl font-black tracking-[-0.01em] text-zinc-950 sm:text-4xl">
                {order.customer.name}
                {order.greenwichUser
                  ? ` · ${order.greenwichUser.displayName}${
                      isWarehouse && order.greenwichUser.ratingScore != null
                        ? ` · рейтинг ${order.greenwichUser.ratingScore}`
                        : ""
                    }`
                  : ""}
              </div>
              {order.parentOrderId ? (
                <p className="text-sm text-violet-700">
                  Доп. заявка к заявке №{order.parentOrderId.slice(0, 8)}
                </p>
              ) : null}
              {isWarehouse && order.project ? (
                <p className="text-sm text-zinc-700">
                  <span className="text-zinc-500">Проект: </span>
                  <Link
                    href={`/projects/${order.project.id}`}
                    className="font-semibold text-violet-700 hover:text-violet-900"
                  >
                    {order.project.title}
                  </Link>
                </p>
              ) : null}
              {order.eventName ? (
                <p className="text-sm text-zinc-600">Мероприятие: {order.eventName}</p>
              ) : null}
              <p className="hidden">
                Готовность к: <strong>{fmtDate(order.readyByDate)}</strong> · Период:{" "}
                <strong>{fmtDateRentPart(order.startDate, order.rentalStartPartOfDay ?? "MORNING")}</strong> —{" "}
                <strong>{fmtDateRentPart(order.endDate, order.rentalEndPartOfDay ?? "MORNING")}</strong>
              </p>
              <p className="text-xs text-zinc-400">
                Создал: {order.createdBy.displayName} · {fmtDate(order.createdAt)}
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                <div className={orderSoftCardClass + " p-4"}>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">Готовность</div>
                  <div className="mt-2 text-xl font-black text-zinc-950">{fmtDate(order.readyByDate)}</div>
                </div>
                <div className={orderSoftCardClass + " p-4 md:col-span-2"}>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">Период</div>
                  <div className="mt-2 text-xl font-black text-zinc-950">
                    {fmtDateRentPart(order.startDate, order.rentalStartPartOfDay ?? "MORNING")} —{" "}
                    {fmtDateRentPart(order.endDate, order.rentalEndPartOfDay ?? "MORNING")}
                  </div>
                </div>
              </div>
              {orderPricing ? (
                <OrderFinancialSummary
                  pricing={{
                    grandTotalBeforeTax: orderPricing.grandTotalBeforeTax,
                    taxRate: orderPricing.taxRate,
                    taxAmount: orderPricing.taxAmount,
                    grandTotal: orderPricing.grandTotal,
                  }}
                  warehouse={warehouseProfitEstimate}
                  discountLabel={
                    orderPricing.discountAmount > 0
                      ? formatDiscountLabel(
                          order.rentalDiscountType,
                          order.rentalDiscountPercent,
                          order.rentalDiscountAmount,
                        )
                      : null
                  }
                />
              ) : null}
              {order.estimateFileKey ? (
                <p className="mt-3">
                  <a
                    href={`/api/orders/${order.id}/estimate`}
                    className={orderSecondaryButtonClass + " inline-flex items-center gap-1.5"}
                    download
                  >
                    📥 Скачать смету (xlsx)
                  </a>
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {isWarehouse ? (
          <div className={orderGlassCardClass + " p-4"}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-zinc-800">Внутренний комментарий (только склад)</div>
              <button
                type="button"
                onClick={() => {
                  setInternalNoteOpen((v) => !v);
                  setInternalNoteDraft(order.warehouseInternalNote ?? "");
                }}
                aria-label={internalNoteOpen ? "Закрыть внутренний комментарий" : "Редактировать внутренний комментарий"}
                title={internalNoteOpen ? "Закрыть" : "Редактировать внутренний комментарий"}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200/80 bg-white/85 text-zinc-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:text-violet-700 disabled:translate-y-0 disabled:opacity-50"
              >
                {internalNoteOpen ? <CloseIcon /> : <PencilIcon />}
              </button>
            </div>
            {order.warehouseInternalNote && !internalNoteOpen ? (
              <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950 shadow-sm whitespace-pre-wrap">
                <span className="font-semibold text-amber-800">Заметка:</span> {order.warehouseInternalNote}
              </div>
            ) : null}
            {internalNoteOpen ? (
              <div className="mt-3 space-y-2 border-t border-white/70 pt-3">
                <textarea
                  value={internalNoteDraft}
                  onChange={(e) => setInternalNoteDraft(e.target.value)}
                  rows={3}
                  className={orderInputClass + " w-full"}
                  placeholder="Заметка для сотрудников склада…"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={internalNoteBusy}
                    onClick={() => void saveInternalNote()}
                    className={orderPrimaryButtonClass + " px-3 py-1.5"}
                  >
                    {internalNoteBusy ? "…" : "Сохранить"}
                  </button>
                  <button
                    type="button"
                    disabled={internalNoteBusy}
                    onClick={() => {
                      setInternalNoteDraft(order.warehouseInternalNote ?? "");
                      setInternalNoteOpen(false);
                    }}
                    className={orderSecondaryButtonClass + " px-3 py-1.5"}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {(canEditOrder || canEditClosedOrderServiceCosts || isEditing || actionError) ? (
          <div className="rounded-[1.5rem] border border-white/75 bg-white/78 p-3 shadow-[0_14px_36px_rgba(24,24,27,0.06)] backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black text-zinc-900">
                  {isClosedServiceCostEdit || canEditClosedOrderServiceCosts
                    ? "Внутренние затраты заявки"
                    : "Редактирование заявки"}
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {isClosedServiceCostEdit || canEditClosedOrderServiceCosts
                    ? "Себестоимость доп. услуг и скрытые траты можно поправить без изменения клиентской сметы."
                    : "Изменения сохраняются после проверки заявки."}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(canEditOrder || canEditClosedOrderServiceCosts) && !isEditing ? (
                  <button
                    type="button"
                    onClick={startEditing}
                    className={orderSecondaryButtonClass}
                  >
                    {canEditClosedOrderServiceCosts ? "Редактировать затраты" : "Редактировать заявку"}
                  </button>
                ) : null}
                {isEditing ? (
                  <>
                    <button
                      ref={orderEditSaveRef}
                      type="button"
                      disabled={busy}
                      onClick={saveOrderEdit}
                      className={orderPrimaryButtonClass}
                    >
                      {busy ? "…" : isClosedServiceCostEdit ? "Сохранить затраты" : isGreenwich ? "Запросить изменения" : "Сохранить"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => { setIsEditing(false); setActionError(null); }}
                      className={orderSecondaryButtonClass}
                    >
                      Отмена
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            {actionError ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
                {actionError}
              </div>
            ) : null}
          </div>
        ) : null}

        {isWarehouse && order.greenwichRequestedDiscountType !== "NONE" ? (
          <div className="rounded-[1.5rem] border border-amber-200/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.9),rgba(255,255,255,0.82))] p-4 shadow-[0_18px_45px_rgba(217,119,6,0.08)] backdrop-blur">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Запрос скидки от Grinvich
            </div>
            <div className="mt-1 text-lg font-bold text-amber-950">
              {formatDiscountLabel(
                order.greenwichRequestedDiscountType,
                order.greenwichRequestedDiscountPercent,
                order.greenwichRequestedDiscountAmount,
              )}
            </div>
            {order.greenwichDiscountRequestComment ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-amber-900">
                {order.greenwichDiscountRequestComment}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-amber-800">
              Это только запрос клиента. На сумму заявки влияет только подтвержденная скидка склада.
            </p>
          </div>
        ) : null}

        {!isEditing && order.comment ? (
          <div className={orderGlassCardClass + " p-4"}>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Комментарий</div>
            <p className="mt-1 text-sm text-zinc-800 whitespace-pre-wrap">{order.comment}</p>
          </div>
        ) : null}

        {isEditing ? (
          <>
            {isClosedServiceCostEdit ? (
              <div className="rounded-[1.5rem] border border-emerald-200/80 bg-emerald-50/70 px-5 py-4 text-sm text-emerald-950">
                Закрытая заявка: можно менять только внутреннюю себестоимость доп. услуг и способ оплаты. Клиентская смета и состав заявки останутся без изменений.
              </div>
            ) : (
            <>
            <div className={orderGlassCardClass + " overflow-hidden"}>
              <div className={orderSectionHeaderClass}>
                <span className="text-sm font-semibold text-zinc-700">Мероприятие и комментарий</span>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1.5">Мероприятие</label>
                  <input
                    type="text"
                    value={editEventName}
                    onChange={(e) => setEditEventName(e.target.value)}
                    className={orderInputClass + " w-full"}
                    placeholder="Название мероприятия"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1.5">Комментарий (для склада)</label>
                  <textarea
                    value={editComment}
                    onChange={(e) => setEditComment(e.target.value)}
                    rows={2}
                    className={orderInputClass + " w-full"}
                    placeholder="Комментарий к заявке для склада"
                  />
                </div>
              </div>
            </div>
            <div className="overflow-hidden rounded-[1.5rem] border border-emerald-200/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.9),rgba(255,255,255,0.82))] shadow-[0_18px_45px_rgba(5,150,105,0.08)] backdrop-blur">
              <div className="border-b border-white/70 px-5 py-4">
                <span className="text-sm font-semibold text-emerald-900">
                  {isWarehouse ? "Скидка на реквизит" : "Запрос скидки"}
                </span>
              </div>
              <div className="p-5">
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Тип
                  </div>
                  <div className="grid items-start gap-3 sm:grid-cols-3">
                    {DISCOUNT_TYPE_OPTIONS.map((option) => {
                      const selectedType = isWarehouse ? editRentalDiscountType : editGreenwichRequestedDiscountType;
                      const active = selectedType === option.value;
                      const showValueInput = active && option.value !== "NONE";
                      const inputValue =
                        option.value === "PERCENT"
                          ? isWarehouse
                            ? editRentalDiscountPercent
                            : editGreenwichRequestedDiscountPercent
                          : isWarehouse
                            ? editRentalDiscountAmount
                            : editGreenwichRequestedDiscountAmount;
                      return (
                        <div
                          key={option.value}
                          onClick={() => {
                            if (isWarehouse) setEditRentalDiscountType(option.value);
                            else setEditGreenwichRequestedDiscountType(option.value);
                          }}
                          className={[
                            "min-h-[72px] overflow-hidden rounded-2xl border px-3 py-3 text-left transition-all duration-300 ease-out shadow-sm",
                            active
                              ? "border-emerald-400 bg-gradient-to-br from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-100 ring-2 ring-emerald-100"
                              : "border-emerald-100 bg-white/90 text-zinc-800 hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-md",
                          ].join(" ")}
                          role="radio"
                          aria-checked={active}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            e.preventDefault();
                            if (isWarehouse) setEditRentalDiscountType(option.value);
                            else setEditGreenwichRequestedDiscountType(option.value);
                          }}
                        >
                          <div className="flex flex-col gap-3">
                            <div>
                              <span className="block text-sm font-semibold">{option.label}</span>
                              <span className={["mt-1 block text-xs", active ? "text-emerald-50" : "text-zinc-500"].join(" ")}>
                                {option.hint}
                              </span>
                            </div>
                            {option.value !== "NONE" ? (
                              <div
                                className={[
                                  "transition-all duration-300 ease-out",
                                  showValueInput
                                    ? "max-h-24 translate-y-0 opacity-100"
                                    : "pointer-events-none max-h-0 -translate-y-1 opacity-0",
                                ].join(" ")}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <label className="block text-xs font-semibold uppercase tracking-wide text-emerald-50">
                                  {option.value === "PERCENT" ? "Процент" : "Сумма, ₽"}
                                  <input
                                    type="number"
                                    min={0}
                                    max={option.value === "PERCENT" ? 100 : undefined}
                                    value={inputValue}
                                    onChange={(e) => {
                                      const value = e.target.value === "" ? "" : Number(e.target.value);
                                      if (option.value === "PERCENT") {
                                        if (isWarehouse) setEditRentalDiscountPercent(value);
                                        else setEditGreenwichRequestedDiscountPercent(value);
                                      } else if (isWarehouse) {
                                        setEditRentalDiscountAmount(value);
                                      } else {
                                        setEditGreenwichRequestedDiscountAmount(value);
                                      }
                                    }}
                                    className="mt-1 w-full rounded-2xl border border-white/30 bg-white/95 px-3 py-2 text-sm font-semibold text-emerald-950 shadow-inner outline-none placeholder:text-emerald-300 focus:border-white focus:ring-4 focus:ring-white/40"
                                    placeholder={option.value === "PERCENT" ? "10" : "5000"}
                                    autoFocus={showValueInput}
                                    tabIndex={showValueInput ? 0 : -1}
                                  />
                                </label>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {!isWarehouse ? (
                  <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Комментарий к запросу
                    <textarea
                      value={editGreenwichDiscountRequestComment}
                      onChange={(e) => setEditGreenwichDiscountRequestComment(e.target.value)}
                      rows={2}
                      className={orderInputClass + " mt-1 w-full normal-case text-zinc-800"}
                      placeholder="Например: нужна скидка из-за объема заявки"
                    />
                  </label>
                ) : null}
              </div>
            </div>
            <div className={orderGlassCardClass + " overflow-hidden"}>
              <div className={orderSectionHeaderClass}>
                <span className="text-sm font-semibold text-zinc-700">Состав заявки</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/70 bg-white/55">
                      <th className="text-left px-5 py-3 font-semibold text-zinc-700">Позиция</th>
                      <th className="text-right px-5 py-3 font-semibold text-zinc-700 w-36">Кол-во</th>
                      <th className="text-left px-5 py-3 font-semibold text-zinc-700">
                        {isWarehouse ? "Коммент. склада (для Grinvich)" : "Комментарий (для склада)"}
                      </th>
                      <th className="w-24 px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {editLines.map((line, idx) => (
                      <tr key={line.id ?? `new-${idx}`} className="border-b border-white/70 hover:bg-white/60">
                        <td className="px-5 py-3">
                          <ProductIdentity
                            itemId={line.itemId}
                            photo1Key={catalogItemsById.get(line.itemId)?.photo1Key ?? line.itemPhoto1Key}
                            name={line.itemName}
                            subtitle={
                              catalogItemsById.get(line.itemId)?.availableForDates != null ? (
                                <>
                                  Доступно:{" "}
                                  <span className="font-semibold text-zinc-700">
                                    {catalogItemsById.get(line.itemId)?.availableForDates}
                                  </span>
                                </>
                              ) : undefined
                            }
                          />
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="inline-flex items-center overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/88 shadow-sm">
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
                            className={orderInputClass + " w-full max-w-sm"}
                            placeholder="Комментарий к позиции"
                          />
                        </td>
                        <td className="px-5 py-3">
                          <button
                            type="button"
                            onClick={() => removeEditLine(idx)}
                            className={orderDangerButtonClass + " px-3 py-2 text-xs"}
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
            <div className={orderGlassCardClass}>
              <div className={orderSectionHeaderClass}>
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
            </>
            )}
            <div className={orderGlassCardClass + " overflow-hidden"}>
              <div className={orderSectionHeaderClass}>
                <span className="text-sm font-semibold text-zinc-700">Доп. услуги</span>
              </div>
              <div className="p-5 space-y-4">
                {isClosedServiceCostEdit ? (
                  <>
                    {!editDeliveryEnabled &&
                    !editMontageEnabled &&
                    !editDemontageEnabled &&
                    editHiddenExpenses.length === 0 ? (
                      <div className="rounded-2xl border border-zinc-200 bg-white/75 px-4 py-3 text-sm text-zinc-600">
                        В закрытой заявке нет включенных доп. услуг.
                      </div>
                    ) : null}
                    {editDeliveryEnabled ? (
                      <ServiceEditRow
                        label="Доставка"
                        enabled={editDeliveryEnabled}
                        onEnabledChange={setEditDeliveryEnabled}
                        comment={editDeliveryComment}
                        onCommentChange={setEditDeliveryComment}
                        showPrice={false}
                        price={editDeliveryPrice}
                        onPriceChange={setEditDeliveryPrice}
                        showInternalPrice={isWarehouse}
                        internalPrice={editDeliveryInternalCost}
                        onInternalPriceChange={setEditDeliveryInternalCost}
                        internalPaymentMethod={editDeliveryInternalPaymentMethod}
                        onInternalPaymentMethodChange={setEditDeliveryInternalPaymentMethod}
                        lockEnabled
                        hideComment
                      />
                    ) : null}
                    {editMontageEnabled ? (
                      <ServiceEditRow
                        label="Монтаж"
                        enabled={editMontageEnabled}
                        onEnabledChange={setEditMontageEnabled}
                        comment={editMontageComment}
                        onCommentChange={setEditMontageComment}
                        showPrice={false}
                        price={editMontagePrice}
                        onPriceChange={setEditMontagePrice}
                        showInternalPrice={isWarehouse}
                        internalPrice={editMontageInternalCost}
                        onInternalPriceChange={setEditMontageInternalCost}
                        internalPaymentMethod={editMontageInternalPaymentMethod}
                        onInternalPaymentMethodChange={setEditMontageInternalPaymentMethod}
                        lockEnabled
                        hideComment
                      />
                    ) : null}
                    {editDemontageEnabled ? (
                      <ServiceEditRow
                        label="Демонтаж"
                        enabled={editDemontageEnabled}
                        onEnabledChange={setEditDemontageEnabled}
                        comment={editDemontageComment}
                        onCommentChange={setEditDemontageComment}
                        showPrice={false}
                        price={editDemontagePrice}
                        onPriceChange={setEditDemontagePrice}
                        showInternalPrice={isWarehouse}
                        internalPrice={editDemontageInternalCost}
                        onInternalPriceChange={setEditDemontageInternalCost}
                        internalPaymentMethod={editDemontageInternalPaymentMethod}
                        onInternalPaymentMethodChange={setEditDemontageInternalPaymentMethod}
                        lockEnabled
                        hideComment
                      />
                    ) : null}
                  </>
                ) : (
                  <>
                <ServiceEditRow
                  label="Доставка"
                  enabled={editDeliveryEnabled}
                  onEnabledChange={setEditDeliveryEnabled}
                  comment={editDeliveryComment}
                  onCommentChange={setEditDeliveryComment}
                  showPrice={isWarehouse}
                  price={editDeliveryPrice}
                  onPriceChange={setEditDeliveryPrice}
                  showInternalPrice={isWarehouse}
                  internalPrice={editDeliveryInternalCost}
                  onInternalPriceChange={setEditDeliveryInternalCost}
                  internalPaymentMethod={editDeliveryInternalPaymentMethod}
                  onInternalPaymentMethodChange={setEditDeliveryInternalPaymentMethod}
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
                  showInternalPrice={isWarehouse}
                  internalPrice={editMontageInternalCost}
                  onInternalPriceChange={setEditMontageInternalCost}
                  internalPaymentMethod={editMontageInternalPaymentMethod}
                  onInternalPaymentMethodChange={setEditMontageInternalPaymentMethod}
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
                  showInternalPrice={isWarehouse}
                  internalPrice={editDemontageInternalCost}
                  onInternalPriceChange={setEditDemontageInternalCost}
                  internalPaymentMethod={editDemontageInternalPaymentMethod}
                  onInternalPaymentMethodChange={setEditDemontageInternalPaymentMethod}
                />
                  </>
                )}
                {isWarehouse ? (
                  <div className="rounded-[1.35rem] border border-amber-200/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.86),rgba(255,255,255,0.78))] p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-black text-zinc-900">Скрытые траты</div>
                        <div className="mt-1 text-xs text-zinc-500">
                          Не попадают в клиентскую смету, но уменьшают прибыль заявки.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={addHiddenExpense}
                        className={orderSecondaryButtonClass + " px-3 py-2 text-xs"}
                      >
                        + Трата
                      </button>
                    </div>
                    <div className="mt-3 space-y-3">
                      {editHiddenExpenses.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-amber-200 bg-white/65 px-4 py-3 text-sm text-zinc-500">
                          Скрытых трат пока нет.
                        </div>
                      ) : null}
                      {editHiddenExpenses.map((expense, idx) => (
                        <div
                          key={expense.id ?? idx}
                          className="grid gap-3 rounded-2xl border border-white/80 bg-white/82 p-3 shadow-sm lg:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1.2fr)_8rem_9rem_auto]"
                        >
                          <input
                            type="text"
                            value={expense.title}
                            onChange={(e) => updateHiddenExpense(idx, "title", e.target.value)}
                            placeholder="Название траты"
                            className={orderInputClass + " w-full"}
                          />
                          <input
                            type="text"
                            value={expense.comment}
                            onChange={(e) => updateHiddenExpense(idx, "comment", e.target.value)}
                            placeholder="Комментарий"
                            className={orderInputClass + " w-full"}
                          />
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={expense.cost === "" ? "" : expense.cost}
                            onChange={(e) =>
                              updateHiddenExpense(idx, "cost", e.target.value === "" ? "" : Number(e.target.value))
                            }
                            placeholder="0"
                            className={orderInputClass + " w-full text-right tabular-nums"}
                          />
                          <select
                            value={expense.internalPaymentMethod}
                            onChange={(e) =>
                              updateHiddenExpense(
                                idx,
                                "internalPaymentMethod",
                                e.target.value as OrderServicePaymentMethod,
                              )
                            }
                            className={orderInputClass + " w-full font-semibold text-zinc-800"}
                          >
                            <option value="NON_CASH">{ORDER_SERVICE_PAYMENT_METHOD_LABELS.NON_CASH}</option>
                            <option value="CASH">{ORDER_SERVICE_PAYMENT_METHOD_LABELS.CASH}</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => removeHiddenExpense(idx)}
                            className={orderDangerButtonClass + " px-3 py-2 text-xs"}
                          >
                            Удалить
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            {!isClosedServiceCostEdit && editPricing ? (
              <div className="rounded-[1.5rem] border border-violet-200/80 bg-[linear-gradient(135deg,rgba(245,243,255,0.9),rgba(255,255,255,0.82))] p-4 text-sm text-violet-950 shadow-[0_18px_45px_rgba(124,58,237,0.08)] backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>Сумма до налога</span>
                  <span className="font-semibold tabular-nums">
                    {Math.round(editPricing.grandTotalBeforeTax).toLocaleString("ru-RU")} ₽
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                  <span>Налог {Math.round(editPricing.taxRate * 100)}%</span>
                  <span className="font-semibold tabular-nums">
                    {editPricing.taxAmount.toLocaleString("ru-RU")} ₽
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-violet-200 pt-2 text-base font-bold">
                  <span>Итого с налогом</span>
                  <span className="tabular-nums">{editPricing.grandTotal.toLocaleString("ru-RU")} ₽</span>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className={orderGlassCardClass + " overflow-hidden"}>
              <div className={orderSectionHeaderClass + " text-sm font-semibold text-zinc-700"}>
                Состав заявки
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/70 bg-white/55">
                      <th className="text-left p-3 font-semibold text-zinc-700">Позиция</th>
                      <th className="text-right p-3 font-semibold text-zinc-700">Запрос</th>
                      <th className="text-right p-3 font-semibold text-zinc-700">Соглас.</th>
                      <th className="text-right p-3 font-semibold text-zinc-700">Выдано</th>
                      <th className="text-right p-3 font-semibold text-zinc-700">Цена/сут</th>
                      <th className="text-left p-3 font-semibold text-zinc-700">Коммент. Grinvich</th>
                      <th className="text-left p-3 font-semibold text-zinc-700">Коммент. склада</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.lines.map((line) => (
                      <tr key={line.id} className="border-b border-white/70 hover:bg-white/60">
                        <td className="p-3">
                          <ProductIdentity
                            itemId={line.item.id}
                            photo1Key={line.item.photo1Key}
                            name={line.item.name}
                          />
                        </td>
                        <td className="p-3 text-right text-zinc-600">{line.requestedQty}</td>
                        <td className="p-3 text-right text-zinc-600">{line.approvedQty ?? "—"}</td>
                        <td className="p-3 text-right text-zinc-600">{line.issuedQty ?? "—"}</td>
                        <td className="p-3 text-right text-zinc-600">
                          {(() => {
                            if (line.pricePerDaySnapshot == null) return "—";
                            const multiplier = order.payMultiplier != null ? Number(order.payMultiplier) : 1;
                            const before = line.pricePerDaySnapshot * multiplier;
                            const pricing = calcOrderPricingClient(order);
                            const ratio =
                              pricing.rentalBeforeDiscount > 0
                                ? pricing.rentalAfterDiscount / pricing.rentalBeforeDiscount
                                : 1;
                            const after = before * ratio;
                            return pricing.discountAmount > 0 ? (
                              <span className="inline-flex flex-col items-end">
                                <span className="text-xs text-zinc-400 line-through">{before.toFixed(0)} ₽</span>
                                <span className="font-semibold text-emerald-700">{after.toFixed(0)} ₽</span>
                              </span>
                            ) : (
                              `${before.toFixed(0)} ₽`
                            );
                          })()}
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
              <div className={orderGlassCardClass + " p-4"}>
                <div className="text-sm font-semibold text-zinc-700 mb-2">Доп. услуги</div>
                <ul className="space-y-1.5 text-sm text-zinc-600">
                  {order.deliveryEnabled ? (
                    <li>
                      Доставка
                      {order.deliveryComment ? `: ${order.deliveryComment}` : ""}
                      {order.deliveryPrice != null ? ` · ${order.deliveryPrice} ₽` : ""}
                      {isWarehouse && order.deliveryInternalCost != null
                        ? ` · внутр. ${Number(order.deliveryInternalCost).toLocaleString("ru-RU")} ₽`
                        : ""}
                    </li>
                  ) : null}
                  {order.montageEnabled ? (
                    <li>
                      Монтаж
                      {order.montageComment ? `: ${order.montageComment}` : ""}
                      {order.montagePrice != null ? ` · ${order.montagePrice} ₽` : ""}
                      {isWarehouse && order.montageInternalCost != null
                        ? ` · внутр. ${Number(order.montageInternalCost).toLocaleString("ru-RU")} ₽`
                        : ""}
                    </li>
                  ) : null}
                  {order.demontageEnabled ? (
                    <li>
                      Демонтаж
                      {order.demontageComment ? `: ${order.demontageComment}` : ""}
                      {order.demontagePrice != null ? ` · ${order.demontagePrice} ₽` : ""}
                      {isWarehouse && order.demontageInternalCost != null
                        ? ` · внутр. ${Number(order.demontageInternalCost).toLocaleString("ru-RU")} ₽`
                        : ""}
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            {isWarehouse && (order.hiddenExpenses?.length ?? 0) > 0 ? (
              <div className={orderGlassCardClass + " p-4"}>
                <div className="text-sm font-semibold text-zinc-700 mb-2">Скрытые траты</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {order.hiddenExpenses!.map((expense) => (
                    <div
                      key={expense.id ?? expense.title}
                      className="rounded-2xl border border-amber-200/70 bg-amber-50/35 px-4 py-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-bold text-zinc-900">{expense.title}</div>
                          {expense.comment ? (
                            <div className="mt-1 text-xs text-zinc-500">{expense.comment}</div>
                          ) : null}
                        </div>
                        <div className="text-right">
                          <div className="font-black tabular-nums text-zinc-950">
                            {Number(expense.cost ?? 0).toLocaleString("ru-RU")} ₽
                          </div>
                          <div className="mt-1 text-[11px] font-semibold text-zinc-500">
                            {ORDER_SERVICE_PAYMENT_METHOD_LABELS[expense.internalPaymentMethod ?? "NON_CASH"]}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}

        {/* Приёмка: склад редактирует и закрывает */}
        {isWarehouse && order.status === "RETURN_DECLARED" && !isEditing ? (
          <div className={orderGlassCardClass + " overflow-hidden"}>
            <div className={orderSectionHeaderClass + " text-sm font-semibold text-zinc-700"}>
              Приёмка (как отправил Grinvich)
            </div>
            <div className="p-4 space-y-4">
              {order.lines.filter((l) => lineIssuedQty(l) > 0).map((l) => {
                const total = lineIssuedQty(l);
                const draft = checkInDraft[l.id] ?? { comment: "", rows: [{ condition: "OK", qty: total }] };
                const rows = normalizeRows(total, draft.rows);
                const usedAll = rows.map((r) => r.condition);
                return (
                  <div key={l.id} className={orderSoftCardClass + " p-3"}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <ProductIdentity
                        itemId={l.item.id}
                        photo1Key={l.item.photo1Key}
                        name={l.item.name}
                        size="md"
                        nameClassName="text-sm font-semibold text-zinc-900"
                      />
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
                              className={orderInputClass}
                            >
                              {options.map((c) => (
                                <option key={c} value={c} disabled={c !== r.condition && usedAll.includes(c)}>
                                  {CONDITION_LABEL[c]}
                                </option>
                              ))}
                            </select>
                            {r.condition !== "OK" ? (
                              <input
                                type="text"
                                inputMode="numeric"
                                min={0}
                                max={remaining}
                                value={draft.rows[idx]?.qty === "" ? "" : String(r.qty)}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw !== "" && !/^\d*$/.test(raw)) return;
                                  const v =
                                    raw === ""
                                      ? ""
                                      : Math.max(0, Math.min(remaining, Math.floor(Number(raw) || 0)));
                                  const nextRows = draft.rows.slice();
                                  nextRows[idx] = { condition: r.condition, qty: v };
                                  updateLineDraft("checkin", l.id, { ...draft, rows: nextRows });
                                }}
                                onBlur={() => {
                                  if (draft.rows[idx]?.qty === "") {
                                    const nextRows = draft.rows.slice();
                                    nextRows[idx] = { condition: r.condition, qty: Math.min(1, remaining) };
                                    updateLineDraft("checkin", l.id, { ...draft, rows: nextRows });
                                  }
                                }}
                                className={orderInputClass + " w-24"}
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
                          className={orderInputClass + " mt-1 w-full"}
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
                  className={orderWarningButtonClass}
                >
                  {busy ? "…" : "Принять (закрыть)"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setCheckInDraft(buildDraftFromPhase("DECLARED"))}
                  className={orderSecondaryButtonClass}
                >
                  Сбросить к декларации
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Приёмка: итог (в архиве/после закрытия) */}
        {order.status === "CLOSED" && (order.returnSplits ?? []).some((s) => s.phase === "CHECKED_IN") ? (
          <div className={orderGlassCardClass + " overflow-hidden"}>
            <div className={orderSectionHeaderClass + " text-sm font-semibold text-zinc-700"}>
              Приёмка (итог)
            </div>
            <div className="p-4 space-y-3">
              {order.lines.filter((l) => lineIssuedQty(l) > 0).map((l) => {
                const total = lineIssuedQty(l);
                const splits = checkedInByLine.get(l.id) ?? [];
                const comment = splits.find((s) => (s.comment ?? "").trim() !== "")?.comment ?? "";
                return (
                  <div key={l.id} className={orderSoftCardClass + " p-3"}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <ProductIdentity
                        itemId={l.item.id}
                        photo1Key={l.item.photo1Key}
                        name={l.item.name}
                        size="md"
                        nameClassName="text-sm font-semibold text-zinc-900"
                      />
                      <div className="text-xs text-zinc-600">
                        Получено: <span className="font-semibold">{total}</span>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-zinc-700">
                      {splits.length ? (
                        <div className="flex flex-wrap gap-2">
                          {splits.map((s) => (
                            <span key={s.id} className="rounded-full border border-zinc-200/80 bg-white/85 px-3 py-1 text-xs font-bold text-zinc-800 shadow-sm">
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-sm">
              <div className="w-full max-w-3xl overflow-hidden rounded-[2rem] border border-white/75 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(246,241,255,0.88))] shadow-[0_28px_90px_rgba(24,24,27,0.28)]">
                <div className="flex items-center justify-between gap-3 border-b border-white/70 bg-white/70 px-5 py-4">
                  <div className="text-sm font-semibold text-zinc-900">Отправить на приёмку</div>
                  <button
                    type="button"
                    onClick={() => setDeclareOpen(false)}
                    className={orderSecondaryButtonClass + " px-3 py-1.5"}
                  >
                    Закрыть
                  </button>
                </div>
                <div className="max-h-[70vh] space-y-4 overflow-auto p-5">
                  <div className="text-sm text-zinc-600">
                    Полученное количество фиксировано. Если статус не «Все в норме», укажите количество и при необходимости разбейте остаток на следующий статус.
                  </div>
                  <details className="group rounded-[1.5rem] border border-violet-100 bg-violet-50/60">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-violet-950">
                      <span>Что означают статусы?</span>
                      <span className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-semibold text-violet-700 transition group-open:rotate-180">
                        ↓
                      </span>
                    </summary>
                    <div className="grid gap-2 border-t border-violet-100 p-3 sm:grid-cols-2">
                      {CONDITION_LEGEND.map((item) => (
                        <div key={item.condition} className={`rounded-2xl border p-3 text-sm ${item.className}`}>
                          <div className="font-bold">{CONDITION_LABEL[item.condition]}</div>
                          <div className="mt-1 text-xs leading-relaxed opacity-80">{item.description}</div>
                        </div>
                      ))}
                    </div>
                  </details>
                  {order.lines.filter((l) => lineIssuedQty(l) > 0).map((l) => {
                    const total = lineIssuedQty(l);
                    const draft = declareDraft[l.id] ?? { comment: "", rows: [{ condition: "OK", qty: total }] };
                    const rows = normalizeRows(total, draft.rows);
                    const usedAll = rows.map((r) => r.condition);
                    return (
                      <div key={l.id} className={orderSoftCardClass + " p-4"}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <ProductIdentity
                            itemId={l.item.id}
                            photo1Key={l.item.photo1Key}
                            name={l.item.name}
                            size="md"
                            nameClassName="text-sm font-semibold text-zinc-900"
                          />
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
                                  className={orderInputClass}
                                >
                                  {options.map((c) => (
                                    <option key={c} value={c} disabled={c !== r.condition && usedAll.includes(c)}>
                                      {CONDITION_LABEL[c]}
                                    </option>
                                  ))}
                                </select>
                                {r.condition !== "OK" ? (
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    min={0}
                                    max={remaining}
                                    value={draft.rows[idx]?.qty === "" ? "" : String(r.qty)}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      if (raw !== "" && !/^\d*$/.test(raw)) return;
                                      const v =
                                        raw === ""
                                          ? ""
                                          : Math.max(0, Math.min(remaining, Math.floor(Number(raw) || 0)));
                                      const nextRows = draft.rows.slice();
                                      nextRows[idx] = { condition: r.condition, qty: v };
                                      updateLineDraft("declare", l.id, { ...draft, rows: nextRows });
                                    }}
                                    onBlur={() => {
                                      if (draft.rows[idx]?.qty === "") {
                                        const nextRows = draft.rows.slice();
                                        nextRows[idx] = { condition: r.condition, qty: Math.min(1, remaining) };
                                        updateLineDraft("declare", l.id, { ...draft, rows: nextRows });
                                      }
                                    }}
                                    className={orderInputClass + " w-24"}
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
                              className={orderInputClass + " mt-1 w-full"}
                              placeholder="Комментарий по позиции (опционально)"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t border-white/70 bg-white/72 px-5 py-4">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void submitReturnDeclared(declareDraft).then(() => setDeclareOpen(false));
                    }}
                    className={orderWarningButtonClass}
                  >
                    {busy ? "…" : "Отправить на приёмку"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDeclareOpen(false)}
                    className={orderSecondaryButtonClass}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}

        {(
          sendEstimateBlocked ||
          (isWarehouse && (order.status === "SUBMITTED" || order.status === "CHANGES_REQUESTED") && !isEditing) ||
          (isWarehouse && order.status === "APPROVED_BY_GREENWICH") ||
          (isWarehouse && order.status === "PICKING") ||
          (isGreenwich && (order.status === "ESTIMATE_SENT" || order.status === "CHANGES_REQUESTED") && isOrderGreenwichUser && !isEditing) ||
          (isGreenwich && order.status === "ISSUED" && order.greenwichUserId === user?.id) ||
          (isWarehouse && order.status === "ISSUED") ||
          canCancel
        ) ? (
        <div className="flex flex-wrap gap-2 rounded-[1.5rem] border border-white/70 bg-white/70 p-3 shadow-[0_14px_36px_rgba(24,24,27,0.06)] backdrop-blur">
          {sendEstimateBlocked ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800">
              <span className="font-medium">Чтобы отправить смету</span>, укажите цены для всех включённых доп. услуг в блоке «Доп. услуги» выше.
            </div>
          ) : null}
          {isWarehouse && (order.status === "SUBMITTED" || order.status === "CHANGES_REQUESTED") && !isEditing && (
            <button
              type="button"
              disabled={busy || !canSendEstimate}
              onClick={() => doAction("POST", `/api/orders/${orderId}/send-estimate`)}
              className={orderPrimaryButtonClass}
            >
              {busy ? "…" : "Отправить смету"}
            </button>
          )}
          {isWarehouse && order.status === "APPROVED_BY_GREENWICH" && (
            <button
              type="button"
              disabled={busy || !canStartPicking}
              onClick={() => doAction("POST", `/api/orders/${orderId}/start-picking`)}
              className={orderPrimaryButtonClass}
              title={startPickingBlocked ? "Сначала укажите цены для включённых доп. услуг" : undefined}
            >
              {busy ? "…" : "Начать сборку"}
            </button>
          )}
          {isWarehouse && order.status === "PICKING" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => doAction("POST", `/api/orders/${orderId}/issue`)}
              className="rounded-2xl border border-emerald-400/60 bg-[linear-gradient(135deg,#10b981,#059669)] px-4 py-2.5 text-sm font-black text-white shadow-[0_14px_30px_rgba(5,150,105,0.2)] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
            >
              {busy ? "…" : "Выдать"}
            </button>
          )}
          {isGreenwich && (order.status === "ESTIMATE_SENT" || order.status === "CHANGES_REQUESTED") && isOrderGreenwichUser && !isEditing && (
            <button
              type="button"
              disabled={busy}
              onClick={() => doAction("POST", `/api/orders/${orderId}/approve`, {})}
              className={orderPrimaryButtonClass}
            >
              {busy ? "…" : "Согласовать смету"}
            </button>
          )}
          {isWarehouse && order.status === "RETURN_DECLARED" ? null : null}
          {/* Доп.-заявка: тоже нужна отправка на приёмку; «Быстрая доп.-выдача» только с основной выданной заявки */}
          {isGreenwich && order.status === "ISSUED" && order.greenwichUserId === user?.id && !order.parentOrderId && (
            <button
              type="button"
              disabled={busy || !order.greenwichUserId}
              onClick={() => router.push(`/catalog?quickParentId=${orderId}`)}
              className={orderPrimaryButtonClass}
            >
              {busy ? "…" : "Быстрая доп.-выдача"}
            </button>
          )}
          {isGreenwich && order.status === "ISSUED" && order.greenwichUserId === user?.id && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const okDraft = buildDraftFromPhase("DECLARED");
                  void submitReturnDeclared(okDraft);
                }}
                className={orderWarningButtonClass}
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
                className={orderSecondaryButtonClass}
              >
                По позициям…
              </button>
            </>
          )}
          {isWarehouse && order.status === "ISSUED" && Boolean(order.greenwichUserId) && !order.parentOrderId && (
            <button
              type="button"
              disabled={busy}
              onClick={() => router.push(`/catalog?quickParentId=${orderId}`)}
              className={orderPrimaryButtonClass}
            >
              {busy ? "…" : "Быстрая доп.-выдача"}
            </button>
          )}
          {isWarehouse && order.status === "ISSUED" && !order.greenwichUserId && (
            <button
              type="button"
              disabled={busy}
              onClick={() => doAction("POST", `/api/orders/${orderId}/return-declared`)}
              className={orderWarningButtonClass}
            >
              {busy ? "…" : "На приёмку"}
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!confirm("Отменить заявку? Она попадёт в архив.")) return;
                doAction("POST", `/api/orders/${orderId}/cancel`);
              }}
              className={orderDangerButtonClass}
            >
              {busy ? "…" : "Отменить заявку"}
            </button>
          )}
        </div>
        ) : null}

        {showFloatingOrderSave && typeof document !== "undefined"
          ? createPortal(
              <button
                type="button"
                disabled={busy}
                onClick={saveOrderEdit}
                className="fixed bottom-6 right-6 z-[170] inline-flex items-center gap-2 rounded-2xl border border-violet-500/30 bg-[linear-gradient(135deg,#7c1fff,#b409e8)] px-5 py-3 text-sm font-black text-white shadow-[0_18px_45px_rgba(124,31,255,0.32)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_52px_rgba(124,31,255,0.36)] disabled:translate-y-0 disabled:opacity-50"
              >
                {busy
                  ? "Сохраняю…"
                  : isClosedServiceCostEdit
                    ? "Сохранить затраты"
                    : isGreenwich
                      ? "Запросить изменения"
                      : "Сохранить заявку"}
              </button>,
              document.body,
            )
          : null}
      </div>
  );

  return embed ? (
    <div className="w-full max-w-5xl mx-auto p-2 sm:p-4">{inner}</div>
  ) : (
    <AppShell title={`Заявка ${order.id.slice(0, 8)}`}>{inner}</AppShell>
  );
}
