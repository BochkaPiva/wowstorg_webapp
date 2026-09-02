"use client";

import React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { AppShell } from "@/app/_ui/AppShell";
import { OrderDetailSkeleton } from "@/app/_ui/Skeleton";
import { getOrderDiscountError } from "@/app/orders/OrderDiscountControl";
import { OrderFinancialSummary } from "@/app/orders/OrderFinancialSummary";
import { orderReturnFallback, safeDetailReturnTo } from "@/lib/detail-return";
import { OrderDateChangeDialog } from "./OrderDateChangeDialog";
import { OrderStatusStepper, type OrderStatus } from "@/app/_ui/OrderStatusStepper";
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
  payMultiplierSnapshot?: number | null;
  greenwichDiscountPercent?: number | null;
  greenwichDiscountSource?: string | null;
  warehouseComment: string | null;
  greenwichComment?: string | null;
  item: { id: string; name: string; type: string; photo1Key: string | null };
};

type ReturnSplit = {
  id: string;
  orderLineId: string;
  phase: "DECLARED" | "CHECKED_IN";
  condition: "OK" | "DIRTY" | "NEEDS_REPAIR" | "BROKEN" | "MISSING";
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
  customer: { id: string; name: string; logoUrl?: string | null };
  createdBy: { id: string; displayName: string };
  greenwichUserId?: string | null;
  greenwichUser: { id: string; displayName: string; ratingScore?: number } | null;
  greenwichMonthlyBonus?: { id: string; code: string; discountPercent: number } | null;
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
  clientPaymentMethod?: OrderServicePaymentMethod;
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
  DIRTY: "Грязное",
  NEEDS_REPAIR: "Требует ремонта",
  BROKEN: "Сломано",
  MISSING: "Утеряно",
};

const CONDITIONS: ReturnSplit["condition"][] = ["OK", "DIRTY", "NEEDS_REPAIR", "BROKEN", "MISSING"];
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
    condition: "DIRTY",
    description: "Реквизит целый, но возвращён с загрязнениями и требует мойки или очистки перед следующей выдачей.",
    className: "border-sky-200 bg-sky-50 text-sky-950",
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
const orderShellClass =
  "overflow-hidden rounded-[18px] border border-zinc-200 bg-white shadow-[0_18px_50px_rgba(24,24,27,0.055)]";
const orderGlassCardClass =
  "rounded-[18px] border border-zinc-200 bg-white shadow-[0_12px_34px_rgba(24,24,27,0.045)]";
const orderSoftCardClass =
  "rounded-xl border border-zinc-200 bg-zinc-50";
const orderSectionHeaderClass =
  "border-b border-zinc-200 bg-zinc-50 px-5 py-4";
const orderInputClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-zinc-500 focus:border-violet-700 focus:ring-2 focus:ring-violet-100";
const orderPrimaryButtonClass =
  "rounded-md border border-yellow-400 bg-yellow-400 px-4 py-2.5 text-sm font-bold text-zinc-950 transition-colors duration-150 hover:bg-yellow-300 disabled:opacity-50";
const orderSecondaryButtonClass =
  "rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 transition-colors duration-150 hover:border-zinc-950 hover:bg-zinc-950 hover:text-white disabled:opacity-50";
const orderDangerButtonClass =
  "rounded-lg border border-rose-300 bg-white px-4 py-2.5 text-sm font-semibold text-rose-800 transition-colors duration-150 hover:bg-rose-50 disabled:opacity-50";
const orderWarningButtonClass =
  "rounded-lg border border-amber-600 bg-amber-600 px-4 py-2.5 text-sm font-bold text-white transition-colors duration-150 hover:bg-amber-700 disabled:opacity-50";

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

function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function formatRentalDays(days: number) {
  const mod10 = days % 10;
  const mod100 = days % 100;
  const word = mod10 === 1 && mod100 !== 11 ? "день" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "дня" : "дней";
  return `${days} ${word}`;
}

function orderTotal(order: {
  lines: { pricePerDaySnapshot: number | null; payMultiplierSnapshot?: number | null; requestedQty: number }[];
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
  clientPaymentMethod?: OrderServicePaymentMethod;
}): number {
  return calcOrderPricingClient(order).grandTotal;
}

function calcOrderPricingClient(order: {
  lines: { pricePerDaySnapshot: number | null; payMultiplierSnapshot?: number | null; requestedQty: number }[];
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
  clientPaymentMethod?: OrderServicePaymentMethod;
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
    (sum, l) => sum + (l.pricePerDaySnapshot ?? 0) * l.requestedQty * days * (l.payMultiplierSnapshot ?? multiplier),
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
  const taxRate = order.clientPaymentMethod === "CASH" ? 0 : ORDER_TAX_RATE;
  const taxAmount = roundMoney(grandTotalBeforeTax * taxRate);
  return {
    days,
    multiplier,
    rentalBeforeDiscount,
    discountAmount,
    rentalAfterDiscount,
    services,
    grandTotalBeforeTax,
    taxRate,
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
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [dropdownRect, setDropdownRect] = React.useState<{ left: number; top: number; width: number } | null>(null);
  const available = catalogItems.filter((i) => !existingItemIds.includes(i.id));
  const filtered =
    search.trim() === ""
      ? available
      : available.filter((i) =>
          i.name.toLowerCase().includes(search.trim().toLowerCase()),
        );
  const syncDropdownRect = React.useCallback(() => {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDropdownRect({ left: rect.left, top: rect.bottom + 8, width: rect.width });
  }, []);
  const showDropdown = React.useCallback(() => {
    syncDropdownRect();
    setOpen(true);
  }, [syncDropdownRect]);

  React.useEffect(() => {
    if (!open) return;
    syncDropdownRect();
    const handleViewportChange = () => syncDropdownRect();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, syncDropdownRect]);

  const dropdown =
    open && typeof document !== "undefined"
      ? createPortal(
          <>
            <div
              className="fixed inset-0 z-[9990]"
              aria-hidden
              onClick={() => setOpen(false)}
            />
            <ul
              className="fixed z-[10000] max-h-64 overflow-auto rounded-2xl border border-white/75 bg-white/95 shadow-[0_18px_45px_rgba(24,24,27,0.14)] backdrop-blur"
              style={{
                left: dropdownRect?.left ?? 0,
                top: dropdownRect?.top ?? 0,
                width: dropdownRect?.width ?? 0,
              }}
              role="listbox"
            >
              {filtered.length === 0 ? (
                <li className="px-4 py-3 text-sm text-zinc-500">
                  {available.length === 0 ? "\u0412\u0441\u0435 \u043f\u043e\u0437\u0438\u0446\u0438\u0438 \u0443\u0436\u0435 \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u044b" : "\u041d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e"}
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
                              {"\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e: "}
                              <span className="font-semibold text-zinc-700">{i.availableForDates}</span>
                            </>
                          ) : undefined
                        }
                      />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </>,
          document.body,
        )
      : null;

  return (
    <div className={`relative space-y-3 ${open ? "z-[90]" : ""}`}>
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
        <div className="relative z-[90]">
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); showDropdown(); }}
            onFocus={showDropdown}
            placeholder="Найти позицию по названию…"
            className={orderInputClass + " w-full"}
          />
          {dropdown}
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
      ? "lg:grid-cols-[minmax(16rem,1fr)_minmax(8rem,0.42fr)_minmax(8rem,0.42fr)_minmax(9rem,0.46fr)]"
      : showPrice
        ? "sm:grid-cols-[1fr_9rem]"
        : "";
  return (
    <div
      className={[
        "rounded-xl border px-4 py-3 transition-[background-color,border-color,box-shadow] duration-150 sm:px-4",
        enabled
          ? "border-violet-200 bg-white shadow-[0_8px_24px_rgba(76,29,149,0.06)]"
          : "border-zinc-200 bg-zinc-50/70",
      ].join(" ")}
    >
      <div className="flex min-h-10 items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={["h-2 w-2 rounded-full", enabled ? "bg-violet-600" : "bg-zinc-300"].join(" ")} />
            <div className="text-sm font-black text-zinc-950">{label}</div>
          </div>
          <div className="mt-0.5 pl-4 text-[11px] font-medium text-zinc-500">
            {enabled ? "Включено в заявку" : "Не включено"}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`${enabled ? "Отключить" : "Включить"}: ${label}`}
          disabled={lockEnabled}
          onClick={() => onEnabledChange(!enabled)}
          className="relative grid h-10 w-14 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-violet-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span
            className={[
              "relative block h-6 w-11 overflow-hidden rounded-full border transition-colors duration-150",
              enabled ? "border-violet-700 bg-violet-700" : "border-zinc-300 bg-zinc-300",
            ].join(" ")}
          >
            <span
              className={[
                "absolute left-0 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150",
                enabled ? "translate-x-6" : "translate-x-1",
              ].join(" ")}
            />
          </span>
        </button>
      </div>
      {enabled && (
        <div className={`mt-3 grid gap-3 border-t border-zinc-200/80 pt-3 ${gridCols}`}>
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
              className={`h-10 w-full rounded-md border px-3 text-sm text-right tabular-nums outline-none focus:ring-2 ${
                  priceMissing
                    ? "border-amber-300 bg-amber-50/50 focus:border-amber-400 focus:ring-amber-100"
                    : "border-zinc-300 bg-white focus:border-violet-700 focus:ring-violet-100"
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
  const [dateDialogOpen, setDateDialogOpen] = React.useState(false);
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
    pricePerDaySnapshot?: number | "" | null;
    payMultiplierSnapshot?: number | null;
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
  const [discountRequestOpen, setDiscountRequestOpen] = React.useState(false);
  const [catalogItems, setCatalogItems] = React.useState<CatalogItemOption[]>([]);

  const user = state.status === "authenticated" ? state.user : null;
  const isGreenwich = user?.role === "GREENWICH";
  const isWarehouse = user?.role === "WOWSTORG";
  const from = searchParams.get("from");
  /** Встроено в карточку проекта (iframe): без оболочки AppShell и без ухода в очередь после приёмки */
  const embed = searchParams.get("embed") === "1";
  const returnFallback = orderReturnFallback(from, {
    isWarehouse: Boolean(isWarehouse),
    projectId: order?.project?.id,
  });
  const backHref = safeDetailReturnTo(searchParams.get("returnTo"), returnFallback.href);
  const backLabel = returnFallback.label;

  const [internalNoteDraft, setInternalNoteDraft] = React.useState("");
  const [internalNoteOpen, setInternalNoteOpen] = React.useState(false);
  const [internalNoteBusy, setInternalNoteBusy] = React.useState(false);
  const catalogItemsById = React.useMemo(
    () => new Map(catalogItems.map((item) => [item.id, item])),
    [catalogItems],
  );
  const orderPricing = order ? calcOrderPricingClient(order) : null;
  const isInternalGreenwichOrder = Boolean(order?.greenwichUserId);
  const warehouseProfitEstimate =
    order && isWarehouse ? orderServicesProfitEstimate(order) : null;
  const editPricing = React.useMemo(() => {
    if (!order) return null;
    return calcOrderPricingClient({
      lines: editLines.map((line) => ({
        pricePerDaySnapshot:
          line.pricePerDaySnapshot === ""
            ? 0
            : line.pricePerDaySnapshot ?? catalogItemsById.get(line.itemId)?.pricePerDay ?? 0,
        payMultiplierSnapshot: line.payMultiplierSnapshot,
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
      clientPaymentMethod: order.clientPaymentMethod,
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
  const editWarehouseProfitEstimate = React.useMemo(() => {
    if (!editPricing || !isWarehouse) return null;
    return calcWarehouseProfitEstimate({
      clientGrandTotal: editPricing.grandTotal,
      clientTaxAmount: editPricing.taxAmount,
      delivery: {
        enabled: editDeliveryEnabled,
        internalCost: editDeliveryInternalCost === "" ? null : editDeliveryInternalCost,
        internalPaymentMethod: editDeliveryInternalPaymentMethod,
      },
      montage: {
        enabled: editMontageEnabled,
        internalCost: editMontageInternalCost === "" ? null : editMontageInternalCost,
        internalPaymentMethod: editMontageInternalPaymentMethod,
      },
      demontage: {
        enabled: editDemontageEnabled,
        internalCost: editDemontageInternalCost === "" ? null : editDemontageInternalCost,
        internalPaymentMethod: editDemontageInternalPaymentMethod,
      },
      hiddenExpenses: editHiddenExpenses.map((expense) => ({
        title: expense.title,
        comment: expense.comment || null,
        cost: expense.cost === "" ? 0 : expense.cost,
        internalPaymentMethod: expense.internalPaymentMethod,
      })),
    });
  }, [
    editDeliveryEnabled,
    editDeliveryInternalCost,
    editDeliveryInternalPaymentMethod,
    editDemontageEnabled,
    editDemontageInternalCost,
    editDemontageInternalPaymentMethod,
    editHiddenExpenses,
    editMontageEnabled,
    editMontageInternalCost,
    editMontageInternalPaymentMethod,
    editPricing,
    isWarehouse,
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
  const canEditOrderServicesOnly = Boolean(
    order && isWarehouse && order.status !== "CANCELLED" && !canEditOrder,
  );
  const canChangeOrderDates = Boolean(
    order &&
      ((isWarehouse &&
        ["SUBMITTED", "ESTIMATE_SENT", "CHANGES_REQUESTED", "APPROVED_BY_GREENWICH", "PICKING"].includes(order.status)) ||
        (isGreenwich &&
          user &&
          order.greenwichUserId === user.id &&
          ["SUBMITTED", "ESTIMATE_SENT", "CHANGES_REQUESTED", "APPROVED_BY_GREENWICH"].includes(order.status))),
  );
  const isServiceOnlyEdit = Boolean(isEditing && canEditOrderServicesOnly);

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
        payMultiplierSnapshot: l.payMultiplierSnapshot,
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
    setDiscountRequestOpen(order.greenwichRequestedDiscountType !== "NONE");
    setIsEditing(true);
    setActionError(null);
    if (canEditOrderServicesOnly) {
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

  function openDiscountRequestEditor() {
    if (!order) return;
    startEditing();
    setDiscountRequestOpen(true);
    if (order.greenwichRequestedDiscountType === "NONE") {
      setEditGreenwichRequestedDiscountType("PERCENT");
    }
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
    if (isServiceOnlyEdit) {
      const missingServicePrices = [
        editDeliveryEnabled && !isEnabledServicePriceSpecified(editDeliveryPrice) ? "Доставка" : null,
        editMontageEnabled && !isEnabledServicePriceSpecified(editMontagePrice) ? "Монтаж" : null,
        editDemontageEnabled && !isEnabledServicePriceSpecified(editDemontagePrice) ? "Демонтаж" : null,
      ].filter((label): label is string => Boolean(label));
      if (missingServicePrices.length > 0) {
        setActionError(`Укажите цену для включённых доп. услуг: ${missingServicePrices.join(", ")}.`);
        return;
      }
      const body = {
        deliveryEnabled: editDeliveryEnabled,
        deliveryComment: editDeliveryComment.trim() || null,
        deliveryPrice: editDeliveryEnabled ? Number(editDeliveryPrice) : 0,
        deliveryInternalCost:
          editDeliveryEnabled && editDeliveryInternalCost !== ""
            ? Number(editDeliveryInternalCost)
            : null,
        deliveryInternalPaymentMethod: editDeliveryEnabled
          ? editDeliveryInternalPaymentMethod
          : "NON_CASH",
        montageEnabled: editMontageEnabled,
        montageComment: editMontageComment.trim() || null,
        montagePrice: editMontageEnabled ? Number(editMontagePrice) : 0,
        montageInternalCost:
          editMontageEnabled && editMontageInternalCost !== ""
            ? Number(editMontageInternalCost)
            : null,
        montageInternalPaymentMethod: editMontageEnabled
          ? editMontageInternalPaymentMethod
          : "NON_CASH",
        demontageEnabled: editDemontageEnabled,
        demontageComment: editDemontageComment.trim() || null,
        demontagePrice: editDemontageEnabled ? Number(editDemontagePrice) : 0,
        demontageInternalCost:
          editDemontageEnabled && editDemontageInternalCost !== ""
            ? Number(editDemontageInternalCost)
            : null,
        demontageInternalPaymentMethod: editDemontageEnabled
          ? editDemontageInternalPaymentMethod
          : "NON_CASH",
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
    const invalidLinePrice = isWarehouse && editLines.some((line) => {
      const value = line.pricePerDaySnapshot;
      return value === "" || value == null || !Number.isFinite(Number(value)) || Number(value) < 0;
    });
    if (invalidLinePrice) {
      setActionError("Укажите стоимость для каждой позиции.");
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
    const discountError = getOrderDiscountError({
      type: isWarehouse ? editRentalDiscountType : editGreenwichRequestedDiscountType,
      percent: isWarehouse ? editRentalDiscountPercent : editGreenwichRequestedDiscountPercent,
      amount: isWarehouse ? editRentalDiscountAmount : editGreenwichRequestedDiscountAmount,
      rentalSubtotal: editPricing?.rentalBeforeDiscount ?? 0,
    });
    if (discountError) {
      setActionError(discountError);
      return;
    }
    if (
      isGreenwich &&
      editGreenwichRequestedDiscountType !== "NONE" &&
      !editGreenwichDiscountRequestComment.trim()
    ) {
      setActionError("Добавьте короткое обоснование скидки.");
      return;
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
                greenwichDiscountRequestComment:
                  editGreenwichRequestedDiscountType === "NONE"
                    ? null
                    : editGreenwichDiscountRequestComment.trim() || null,
              }),
          lines: editLines.map((l) => ({
            id: l.id,
            itemId: l.itemId,
            requestedQty: Math.max(1, parseInt(String(l.requestedQty), 10) || 1),
            ...(isWarehouse && l.pricePerDaySnapshot !== "" && l.pricePerDaySnapshot != null
              ? { pricePerDaySnapshot: Number(l.pricePerDaySnapshot) }
              : {}),
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

  function editLineRentalTotal(line: EditLine) {
    const price = line.pricePerDaySnapshot === "" ? 0 : Number(line.pricePerDaySnapshot ?? 0);
    const qty = Math.max(0, Number(line.requestedQty) || 0);
    const days = editPricing?.days ?? 1;
    const multiplier = Number(line.payMultiplierSnapshot ?? order?.payMultiplier ?? 1);
    return roundMoney(price * qty * days * multiplier);
  }

  function updateEditLineRentalTotal(index: number, total: number | "") {
    if (total === "") {
      updateEditLine(index, "pricePerDaySnapshot", "");
      return;
    }
    const line = editLines[index];
    if (!line) return;
    const qty = Math.max(1, Number(line.requestedQty) || 1);
    const days = Math.max(1, editPricing?.days ?? 1);
    const multiplier = Math.max(0.000001, Number(line.payMultiplierSnapshot ?? order?.payMultiplier ?? 1));
    updateEditLine(index, "pricePerDaySnapshot", roundMoney(total / (qty * days * multiplier)));
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
    const body = <OrderDetailSkeleton embed={embed} />;
    return embed ? (
      <div className="p-4">{body}</div>
    ) : (
      <AppShell title="Заявка" backHref={backHref}>{body}</AppShell>
    );
  }

  if (error || !order) {
    const body = (
      <div className="space-y-3">
        <p className="text-sm text-red-600">{error ?? "Заявка не найдена"}</p>
        {!embed ? (
          <Link
            href={backHref}
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
      <AppShell title="Заявка" backHref={backHref}>{body}</AppShell>
    );
  }

  const statusLabel = STATUS_LABEL[order.status] ?? order.status;

  const inner = (
      <div className="order-detail space-y-5">
        {!embed ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:border-zinc-950 hover:text-zinc-950"
            >
              ← {backLabel}
            </Link>
          </div>
        ) : null}

        <div
          className={[
            orderShellClass,
            isGreenwich ? "border-zinc-200" : "border-t-[5px] border-t-yellow-400",
            order.status === "CANCELLED"
              ? "border-[#5b0b17]/20"
              : "border-zinc-200",
          ].join(" ")}
        >
          <div className="grid gap-6 border-b border-zinc-200 bg-white px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="flex min-w-0 items-start gap-4">
              {isGreenwich ? (
                <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 text-sm font-black text-violet-700">
                  {order.customer.logoUrl ? (
                    <Image src={order.customer.logoUrl} alt="" width={56} height={56} unoptimized className="h-full w-full object-cover" />
                  ) : order.customer.name.slice(0, 2).toUpperCase()}
                </div>
              ) : null}
              <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-700">Заявка</span>
                <span className="h-1 w-1 rounded-full bg-zinc-300" aria-hidden="true" />
                <span className={[
                  "rounded-full px-2.5 py-1 text-xs font-bold",
                  order.status === "CANCELLED"
                    ? "bg-rose-50 text-rose-800"
                    : order.status === "CLOSED"
                      ? "bg-violet-50 text-violet-800"
                      : "bg-yellow-100 text-amber-950",
                ].join(" ")}>
                  {statusLabel}
                </span>
              </div>
              <h1 className="mt-2 truncate text-2xl font-black tracking-[-0.035em] text-zinc-950 sm:text-3xl">
                {order.eventName || order.customer.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600">
                <span className="font-semibold text-zinc-900">{order.customer.name}</span>
                {order.greenwichUser ? <span>{order.greenwichUser.displayName}</span> : null}
                {isWarehouse && order.greenwichUser?.ratingScore != null ? (
                  <span>Рейтинг {order.greenwichUser.ratingScore}</span>
                ) : null}
                {order.greenwichMonthlyBonus ? (
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 font-bold text-violet-800">
                    Бонус лидера +{order.greenwichMonthlyBonus.discountPercent}%
                  </span>
                ) : null}
                <span>Создана {fmtDate(order.createdAt)}</span>
              </div>
              {order.parentOrderId ? (
                <p className="mt-3 text-sm font-semibold text-violet-700">
                  Доп. заявка к заявке №{order.parentOrderId.slice(0, 8)}
                </p>
              ) : null}
              {isWarehouse && order.project ? (
                <p className="mt-3 text-sm text-zinc-700">
                  <span className="text-zinc-500">В проекте: </span>
                  <Link
                    href={`/projects/${order.project.id}`}
                    className="font-semibold text-violet-700 hover:text-violet-900"
                  >
                    {order.project.title}
                  </Link>
                </p>
              ) : null}
              </div>
            </div>

            <div className="flex min-w-[270px] flex-col items-stretch gap-3 lg:items-end">
              {(isEditing ? editPricing : orderPricing) ? (
                <div className="text-left lg:text-right">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">
                    {isEditing ? "Итого после изменений" : "Итого по заявке"}
                  </div>
                  <div className="mt-1 whitespace-nowrap text-3xl font-black tracking-[-0.04em] text-zinc-950">
                    {formatMoney((isEditing ? editPricing : orderPricing)!.grandTotal)}
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {canChangeOrderDates ? (
                  <button type="button" onClick={() => setDateDialogOpen(true)} className={orderSecondaryButtonClass}>
                    Изменить даты
                  </button>
                ) : null}
                {(canEditOrder || canEditOrderServicesOnly) && !isEditing ? (
                  <button type="button" onClick={startEditing} className={orderPrimaryButtonClass}>
                    {canEditOrderServicesOnly ? "Доп. услуги" : "Редактировать"}
                  </button>
                ) : null}
                {order.estimateFileKey ? (
                  <a href={`/api/orders/${order.id}/estimate`} className={orderSecondaryButtonClass} download>
                    Смета ↓
                  </a>
                ) : null}
                <a
                  href={`/api/orders/${order.id}/estimate/checklist`}
                  className={orderSecondaryButtonClass}
                  title={isGreenwich ? "Скачать чек-лист получения и возврата в Word" : "Скачать складской чек-лист в Word"}
                  download
                >
                  Чек-лист ↓
                </a>
              </div>
            </div>
          </div>

          <div className="grid border-b border-zinc-200 bg-[#f7f6f2] sm:grid-cols-[0.8fr_2fr_auto]">
            <div className="border-b border-zinc-200 px-5 py-4 sm:border-b-0 sm:border-r sm:px-7">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Готовность</div>
              <div className="mt-1 font-black text-zinc-950">{fmtDate(order.readyByDate)}</div>
            </div>
            <div className="border-b border-zinc-200 px-5 py-4 sm:border-b-0 sm:border-r sm:px-7">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Период аренды</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 font-black text-zinc-950">
                {fmtDateRentPart(order.startDate, order.rentalStartPartOfDay ?? "MORNING")} —{" "}
                {fmtDateRentPart(order.endDate, order.rentalEndPartOfDay ?? "MORNING")}
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-800">
                  {formatRentalDays((isEditing ? editPricing : orderPricing)?.days ?? 0)}
                </span>
              </div>
            </div>
            <div className="px-5 py-4 sm:px-7">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Ответственный</div>
              <div className="mt-1 whitespace-nowrap font-black text-zinc-950">{order.createdBy.displayName}</div>
            </div>
          </div>

          <div className="border-b border-zinc-200 bg-white px-3 py-4 sm:px-6">
            <OrderStatusStepper
              status={order.status}
              source={order.source as "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL"}
              density={isGreenwich ? "compact" : "regular"}
              compactWindow={isGreenwich ? 5 : 7}
            />
          </div>

          {!isEditing ? <div className="space-y-4 p-4 sm:p-6">
              {orderPricing ? (
                isGreenwich ? (
                  <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                    <div className="grid bg-zinc-200 sm:grid-cols-3">
                      <div className="bg-white px-4 py-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">До налога</div>
                        <div className="mt-1 font-black tabular-nums text-zinc-950">{formatMoney(orderPricing.grandTotalBeforeTax)}</div>
                      </div>
                      <div className="bg-white px-4 py-3 sm:border-l sm:border-zinc-200">
                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Налог {Math.round(orderPricing.taxRate * 100)}%</div>
                        <div className="mt-1 font-black tabular-nums text-zinc-950">{formatMoney(orderPricing.taxAmount)}</div>
                      </div>
                      <div className="bg-white px-4 py-3 sm:border-l sm:border-zinc-200">
                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Подтверждённая скидка</div>
                        <div className="mt-1 font-black tabular-nums text-emerald-700">
                          {orderPricing.discountAmount > 0 ? `− ${formatMoney(orderPricing.discountAmount)}` : "Нет"}
                        </div>
                      </div>
                    </div>
                    {(canEditOrder || order.greenwichRequestedDiscountType !== "NONE") ? (
                      <div className="flex flex-col gap-3 border-t border-zinc-200 bg-violet-50/55 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="text-xs font-black text-violet-950">
                            {order.greenwichRequestedDiscountType === "NONE"
                              ? "Нужна дополнительная скидка?"
                              : `Запрошено: ${formatDiscountLabel(
                                  order.greenwichRequestedDiscountType,
                                  order.greenwichRequestedDiscountPercent,
                                  order.greenwichRequestedDiscountAmount,
                                )}`}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-violet-800">
                            {order.greenwichDiscountRequestComment || "Запрос увидит менеджер ВАУСТОРГ и примет решение."}
                          </p>
                        </div>
                        {canEditOrder ? (
                          <button
                            type="button"
                            onClick={openDiscountRequestEditor}
                            className={orderSecondaryButtonClass + " shrink-0 px-3 py-2 text-xs"}
                          >
                            {order.greenwichRequestedDiscountType === "NONE" ? "Запросить скидку" : "Изменить запрос"}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : (
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
                )
              ) : null}
            {isWarehouse && order.greenwichRequestedDiscountType !== "NONE" ? (
              <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-inset ring-amber-200">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong>Grinvich запросил скидку</strong>
                  <span className="font-black tabular-nums">
                    {formatDiscountLabel(
                      order.greenwichRequestedDiscountType,
                      order.greenwichRequestedDiscountPercent,
                      order.greenwichRequestedDiscountAmount,
                    )}
                  </span>
                </div>
                {order.greenwichDiscountRequestComment ? (
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-amber-900">{order.greenwichDiscountRequestComment}</p>
                ) : null}
              </div>
            ) : null}
            {isWarehouse ? (
              <a
                href={`/api/orders/${order.id}/estimate/internal`}
                className={orderSecondaryButtonClass + " inline-flex items-center gap-1.5"}
                download
              >
                Внутренняя смета ↓
              </a>
            ) : null}
          </div> : null}
        </div>

        <OrderDateChangeDialog
          open={dateDialogOpen}
          orderId={order.id}
          initialValue={{
            readyByDate: order.readyByDate.slice(0, 10),
            startDate: order.startDate.slice(0, 10),
            endDate: order.endDate.slice(0, 10),
            rentalStartPartOfDay: order.rentalStartPartOfDay ?? "MORNING",
            rentalEndPartOfDay: order.rentalEndPartOfDay ?? "MORNING",
          }}
          onClose={() => setDateDialogOpen(false)}
          onApplied={async () => {
            await loadOrder();
            notifyProjectParent();
          }}
        />

        {isWarehouse && !isEditing ? (
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

        {actionError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800" role="alert">
            {actionError}
          </div>
        ) : null}

        {!isEditing && order.comment ? (
          <div className={orderGlassCardClass + " p-4"}>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Комментарий</div>
            <p className="mt-1 text-sm text-zinc-800 whitespace-pre-wrap">{order.comment}</p>
          </div>
        ) : null}

        {isEditing ? (
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
            <div className="min-w-0 space-y-5">
              {isServiceOnlyEdit ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
                  Даты, статус и реквизит останутся без изменений. Здесь меняются только услуги, расходы и итог заявки.
                </div>
              ) : (
                <>
                  <section className={orderGlassCardClass + " overflow-hidden"}>
                    <div className={orderSectionHeaderClass}>
                      <h2 className="text-base font-black text-zinc-950">Основное</h2>
                      <p className="mt-1 text-xs text-zinc-500">Название мероприятия и полная задача для склада.</p>
                    </div>
                    <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-zinc-600">Мероприятие</span>
                        <input
                          type="text"
                          value={editEventName}
                          onChange={(event) => setEditEventName(event.target.value)}
                          className={orderInputClass + " w-full"}
                          placeholder="Название мероприятия"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-zinc-600">Комментарий для склада</span>
                        <textarea
                          value={editComment}
                          onChange={(event) => setEditComment(event.target.value)}
                          rows={6}
                          className={orderInputClass + " min-h-36 w-full resize-y leading-6"}
                          placeholder="Что важно учесть при подготовке, выдаче и возврате…"
                        />
                      </label>
                    </div>
                  </section>

                  <section className={orderGlassCardClass + " overflow-hidden"}>
                    <div className={orderSectionHeaderClass + " flex flex-wrap items-end justify-between gap-3"}>
                      <div>
                        <h2 className="text-base font-black text-zinc-950">Реквизит</h2>
                        <p className="mt-1 text-xs text-zinc-500">
                          {editLines.length} поз. · {formatRentalDays(editPricing?.days ?? 0)} · сумма строки указана до общей скидки
                        </p>
                      </div>
                      <div className="whitespace-nowrap text-sm font-black tabular-nums text-zinc-950">
                        {formatMoney(editPricing?.rentalBeforeDiscount ?? 0)}
                      </div>
                    </div>
                    <div className="divide-y divide-zinc-200">
                      {editLines.map((line, idx) => {
                        const multiplier = Number(line.payMultiplierSnapshot ?? order.payMultiplier ?? 1);
                        const dailyRate = Number(line.pricePerDaySnapshot === "" ? 0 : line.pricePerDaySnapshot ?? 0) * multiplier;
                        const lineTotal = editLineRentalTotal(line);
                        const discountRatio = editPricing && editPricing.rentalBeforeDiscount > 0
                          ? editPricing.rentalAfterDiscount / editPricing.rentalBeforeDiscount
                          : 1;
                        return (
                          <article key={line.id ?? `new-${idx}`} className="px-4 py-3.5 transition-colors duration-150 hover:bg-zinc-50/70 sm:px-5">
                            <div className="grid items-end gap-x-4 gap-y-3 xl:grid-cols-[minmax(13rem,1.15fr)_8.5rem_minmax(11rem,0.72fr)_minmax(12rem,0.78fr)_2.5rem]">
                              <div className="self-center">
                                <ProductIdentity
                                  itemId={line.itemId}
                                  photo1Key={catalogItemsById.get(line.itemId)?.photo1Key ?? line.itemPhoto1Key}
                                  name={line.itemName}
                                  subtitle={catalogItemsById.get(line.itemId)?.availableForDates != null
                                    ? <>Доступно: <strong>{catalogItemsById.get(line.itemId)?.availableForDates}</strong></>
                                    : undefined}
                                />
                              </div>
                              <div>
                                <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500">Количество</div>
                                <div className="flex h-10 w-full items-center justify-between overflow-hidden rounded-md border border-zinc-300 bg-white">
                                  <button type="button" onClick={() => updateEditLine(idx, "requestedQty", Math.max(1, (Number(line.requestedQty) || 1) - 1))} className="h-full px-3 text-zinc-600 hover:bg-zinc-100" aria-label="Уменьшить">−</button>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={line.requestedQty === "" ? "" : String(line.requestedQty)}
                                    onChange={(event) => {
                                      const value = event.target.value;
                                      if (value === "" || /^\d+$/.test(value)) updateEditLine(idx, "requestedQty", value === "" ? "" : value);
                                    }}
                                    onBlur={() => { if (line.requestedQty === "") updateEditLine(idx, "requestedQty", 1 as never); }}
                                    className="w-10 border-0 bg-transparent text-center text-sm font-black tabular-nums outline-none"
                                  />
                                  <button type="button" onClick={() => updateEditLine(idx, "requestedQty", (Number(line.requestedQty) || 1) + 1)} className="h-full px-3 text-zinc-600 hover:bg-zinc-100" aria-label="Увеличить">+</button>
                                </div>
                              </div>
                              <div>
                                <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500">Ставка × срок</div>
                                <div className="flex h-10 items-center whitespace-nowrap rounded-md bg-zinc-100 px-3 text-xs font-semibold tabular-nums text-zinc-700">
                                  {formatMoney(dailyRate)} <span className="mx-1.5 text-zinc-400">×</span> {Number(line.requestedQty) || 0} <span className="mx-1.5 text-zinc-400">×</span> {editPricing?.days ?? 0} дн.
                                </div>
                              </div>
                              <label className="block">
                                <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500">Сумма позиции</span>
                                {isWarehouse ? (
                                  <span className="relative block">
                                    <input
                                      type="number"
                                      min={0}
                                      step={1}
                                      value={line.pricePerDaySnapshot === "" ? "" : Math.round(lineTotal)}
                                      onChange={(event) => updateEditLineRentalTotal(idx, event.target.value === "" ? "" : Number(event.target.value))}
                                      className={orderInputClass + " h-10 w-full pr-9 text-right font-black tabular-nums"}
                                    />
                                    <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm font-bold text-zinc-500">₽</span>
                                  </span>
                                ) : (
                                  <div className="flex h-10 items-center justify-end rounded-md border border-zinc-200 bg-zinc-50 px-3 font-black tabular-nums text-zinc-950">{formatMoney(lineTotal)}</div>
                                )}
                              </label>
                              <button
                                type="button"
                                onClick={() => removeEditLine(idx)}
                                className="grid h-10 w-10 place-items-center rounded-md text-lg text-zinc-400 hover:bg-rose-50 hover:text-rose-700"
                                aria-label={`Удалить позицию ${line.itemName}`}
                                title="Удалить позицию"
                              >
                                ×
                              </button>
                            </div>
                            <div className="mt-2 flex min-h-5 items-center justify-end">
                              {discountRatio < 1 ? (
                                <span className="text-[11px] font-bold text-emerald-700">
                                  После общей скидки: {formatMoney(lineTotal * discountRatio)}
                                </span>
                              ) : null}
                            </div>
                            <label className="mt-1 block">
                              <span className="sr-only">Комментарий к позиции</span>
                              <input
                                type="text"
                                value={line.lineComment}
                                onChange={(event) => updateEditLine(idx, "lineComment", event.target.value)}
                                className={orderInputClass + " h-10 w-full bg-zinc-50/70"}
                                placeholder={isWarehouse ? "Комментарий склада для Grinvich" : "Комментарий для склада"}
                              />
                            </label>
                          </article>
                        );
                      })}
                    </div>
                    <div className="border-t border-zinc-200 bg-zinc-50 p-4 sm:p-5">
                      <AddLineRow
                        catalogItems={catalogItems}
                        existingItemIds={editLines.map((line) => line.itemId)}
                        onAdd={addEditLine}
                      />
                    </div>
                  </section>
                </>
              )}

              <section className={orderGlassCardClass + " overflow-hidden"}>
                <div className={orderSectionHeaderClass}>
                  <h2 className="text-base font-black text-zinc-950">Услуги и расходы</h2>
                  <p className="mt-1 text-xs text-zinc-500">Клиентские цены, внутренняя себестоимость и скрытые траты — в одном блоке.</p>
                </div>
                <div className="space-y-2 bg-zinc-50/60 p-3 sm:p-4">
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
                {isWarehouse ? (
                  <div className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50/45 p-4">
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
                    <div className="mt-3">
                      {editHiddenExpenses.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-amber-300/80 bg-white/65 px-3 py-3 text-sm text-zinc-500">
                          Скрытых трат пока нет.
                        </div>
                      ) : null}
                      {editHiddenExpenses.map((expense, idx) => (
                        <div
                          key={expense.id ?? idx}
                          className="grid gap-3 border-t border-zinc-200 py-3 2xl:grid-cols-[minmax(10rem,1fr)_minmax(12rem,1.2fr)_8rem_9rem_auto] 2xl:items-end"
                        >
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-zinc-500">Трата</span>
                            <input type="text" value={expense.title} onChange={(e) => updateHiddenExpense(idx, "title", e.target.value)} placeholder="Название" className={orderInputClass + " w-full"} />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-zinc-500">Комментарий</span>
                            <input type="text" value={expense.comment} onChange={(e) => updateHiddenExpense(idx, "comment", e.target.value)} placeholder="Для внутреннего учёта" className={orderInputClass + " w-full"} />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-zinc-500">Сумма, ₽</span>
                            <input type="number" min={0} step={1} value={expense.cost === "" ? "" : expense.cost} onChange={(e) => updateHiddenExpense(idx, "cost", e.target.value === "" ? "" : Number(e.target.value))} placeholder="0" className={orderInputClass + " w-full text-right tabular-nums"} />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-zinc-500">Оплата</span>
                            <select value={expense.internalPaymentMethod} onChange={(e) => updateHiddenExpense(idx, "internalPaymentMethod", e.target.value as OrderServicePaymentMethod)} className={orderInputClass + " w-full font-semibold text-zinc-800"}>
                              <option value="NON_CASH">{ORDER_SERVICE_PAYMENT_METHOD_LABELS.NON_CASH}</option>
                              <option value="CASH">{ORDER_SERVICE_PAYMENT_METHOD_LABELS.CASH}</option>
                            </select>
                          </label>
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
              </section>
            </div>

            <aside className="space-y-4 xl:sticky xl:top-24">
              <section className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white shadow-[0_18px_50px_rgba(24,24,27,0.08)]">
                <div className="bg-zinc-950 px-5 py-5 text-white">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">Итого после изменений</div>
                  <div className="mt-2 whitespace-nowrap text-3xl font-black tracking-[-0.04em] tabular-nums">
                    {formatMoney(editPricing?.grandTotal ?? 0)}
                  </div>
                  <div className="mt-1 text-xs text-zinc-400">Пересчитывается сразу, сохраняется одной кнопкой.</div>
                </div>

                <div className="space-y-3 px-5 py-4 text-sm">
                  <div className="flex items-center justify-between gap-3 text-zinc-600"><span>Аренда</span><strong className="whitespace-nowrap tabular-nums text-zinc-950">{formatMoney(editPricing?.rentalBeforeDiscount ?? 0)}</strong></div>
                  {(editPricing?.discountAmount ?? 0) > 0 ? <div className="flex items-center justify-between gap-3 text-emerald-700"><span>Скидка</span><strong className="whitespace-nowrap tabular-nums">− {formatMoney(editPricing?.discountAmount ?? 0)}</strong></div> : null}
                  <div className="flex items-center justify-between gap-3 text-zinc-600"><span>Услуги</span><strong className="whitespace-nowrap tabular-nums text-zinc-950">{formatMoney(editPricing?.services ?? 0)}</strong></div>
                  <div className="flex items-center justify-between gap-3 text-zinc-600"><span>До налога</span><strong className="whitespace-nowrap tabular-nums text-zinc-950">{formatMoney(editPricing?.grandTotalBeforeTax ?? 0)}</strong></div>
                  <div className="flex items-center justify-between gap-3 text-zinc-600"><span>Налог {Math.round((editPricing?.taxRate ?? 0) * 100)}%</span><strong className="whitespace-nowrap tabular-nums text-zinc-950">{formatMoney(editPricing?.taxAmount ?? 0)}</strong></div>
                </div>

                {!isServiceOnlyEdit ? (
                  <div className="border-t border-zinc-200 px-5 py-4">
                    <div className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
                      {isWarehouse ? "Скидка на реквизит" : "Запрос скидки"}
                    </div>
                    {isWarehouse ? (
                      <>
                        <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-zinc-100 p-1">
                          {([['NONE', 'Нет'], ['PERCENT', '%'], ['AMOUNT', '₽']] as const).map(([value, label]) => (
                            <button key={value} type="button" onClick={() => setEditRentalDiscountType(value)} className={["rounded-md px-2 py-2 text-xs font-bold", editRentalDiscountType === value ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-white"].join(" ")}>{label}</button>
                          ))}
                        </div>
                        {editRentalDiscountType !== "NONE" ? (
                          <label className="mt-3 block">
                            <span className="relative block">
                              <input
                                type="number"
                                min={0}
                                max={editRentalDiscountType === "PERCENT" ? 100 : editPricing?.rentalBeforeDiscount}
                                step={editRentalDiscountType === "PERCENT" ? 0.5 : 1}
                                value={editRentalDiscountType === "PERCENT" ? editRentalDiscountPercent : editRentalDiscountAmount}
                                onChange={(event) => {
                                  const value = event.target.value === "" ? "" : Number(event.target.value);
                                  if (editRentalDiscountType === "PERCENT") setEditRentalDiscountPercent(value);
                                  else setEditRentalDiscountAmount(value);
                                }}
                                className={orderInputClass + " w-full pr-9 text-right font-black tabular-nums"}
                              />
                              <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm font-bold text-zinc-500">{editRentalDiscountType === "PERCENT" ? "%" : "₽"}</span>
                            </span>
                          </label>
                        ) : null}
                        <p className="mt-2 text-[11px] leading-4 text-zinc-500">
                          {isInternalGreenwichOrder ? "Дополняет уже рассчитанные цены Grinvich." : "Применяется только к аренде реквизита."}
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-zinc-800">
                              {editGreenwichRequestedDiscountType === "NONE"
                                ? "Дополнительная скидка не запрошена"
                                : `Запрос: ${formatDiscountLabel(
                                    editGreenwichRequestedDiscountType,
                                    editGreenwichRequestedDiscountPercent === "" ? null : Number(editGreenwichRequestedDiscountPercent),
                                    editGreenwichRequestedDiscountAmount === "" ? null : Number(editGreenwichRequestedDiscountAmount),
                                  )}`}
                            </div>
                            <p className="mt-1 text-[11px] leading-4 text-zinc-500">
                              На итог повлияет только после подтверждения ВАУСТОРГ.
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-expanded={discountRequestOpen}
                            onClick={() => {
                              setDiscountRequestOpen((open) => !open);
                              if (editGreenwichRequestedDiscountType === "NONE") {
                                setEditGreenwichRequestedDiscountType("PERCENT");
                              }
                            }}
                            className={orderSecondaryButtonClass + " shrink-0 px-3 py-2 text-xs"}
                          >
                            {discountRequestOpen ? "Скрыть" : editGreenwichRequestedDiscountType === "NONE" ? "Запросить" : "Изменить"}
                          </button>
                        </div>

                        {discountRequestOpen ? (
                          <div className="mt-3 space-y-3 border-t border-zinc-200 pt-3">
                            <div className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1" role="radiogroup" aria-label="Формат запроса скидки">
                              {([['PERCENT', 'Процент'], ['AMOUNT', 'Сумма']] as const).map(([value, label]) => (
                                <button
                                  key={value}
                                  type="button"
                                  role="radio"
                                  aria-checked={editGreenwichRequestedDiscountType === value}
                                  onClick={() => setEditGreenwichRequestedDiscountType(value)}
                                  className={[
                                    "rounded-md px-2 py-2 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600",
                                    editGreenwichRequestedDiscountType === value
                                      ? "bg-zinc-950 text-white"
                                      : "text-zinc-600 hover:bg-white hover:text-zinc-950",
                                  ].join(" ")}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-zinc-600">
                                {editGreenwichRequestedDiscountType === "PERCENT" ? "Желаемая скидка" : "Желаемая сумма"}
                              </span>
                              <span className="relative block">
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  max={editGreenwichRequestedDiscountType === "PERCENT" ? 100 : editPricing?.rentalBeforeDiscount}
                                  step={editGreenwichRequestedDiscountType === "PERCENT" ? 0.5 : 1}
                                  value={editGreenwichRequestedDiscountType === "PERCENT" ? editGreenwichRequestedDiscountPercent : editGreenwichRequestedDiscountAmount}
                                  onChange={(event) => {
                                    const value = event.target.value === "" ? "" : Number(event.target.value);
                                    if (editGreenwichRequestedDiscountType === "PERCENT") setEditGreenwichRequestedDiscountPercent(value);
                                    else setEditGreenwichRequestedDiscountAmount(value);
                                  }}
                                  className={orderInputClass + " w-full pr-9 text-right font-black tabular-nums"}
                                  placeholder={editGreenwichRequestedDiscountType === "PERCENT" ? "10" : "5000"}
                                />
                                <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm font-bold text-zinc-500">
                                  {editGreenwichRequestedDiscountType === "PERCENT" ? "%" : "₽"}
                                </span>
                              </span>
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-zinc-600">Почему нужна скидка</span>
                              <textarea
                                rows={3}
                                maxLength={1000}
                                value={editGreenwichDiscountRequestComment}
                                onChange={(event) => setEditGreenwichDiscountRequestComment(event.target.value)}
                                className={orderInputClass + " w-full resize-y"}
                                placeholder="Например: большой объём заявки или регулярное мероприятие"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                setEditGreenwichRequestedDiscountType("NONE");
                                setEditGreenwichRequestedDiscountPercent("");
                                setEditGreenwichRequestedDiscountAmount("");
                                setEditGreenwichDiscountRequestComment("");
                                setDiscountRequestOpen(false);
                              }}
                              className="text-xs font-semibold text-zinc-500 hover:text-rose-700"
                            >
                              Убрать запрос
                            </button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}

                {editWarehouseProfitEstimate ? (
                  <div className="grid grid-cols-2 gap-px border-t border-zinc-200 bg-zinc-200">
                    <div className="bg-emerald-50 px-4 py-3"><div className="text-[10px] font-black uppercase tracking-[0.1em] text-emerald-800">Прибыль</div><div className="mt-1 whitespace-nowrap font-black tabular-nums text-emerald-950">{formatMoney(editWarehouseProfitEstimate.profitEstimate)}</div></div>
                    <div className="bg-emerald-50 px-4 py-3"><div className="text-[10px] font-black uppercase tracking-[0.1em] text-emerald-800">Рентабельность</div><div className="mt-1 whitespace-nowrap font-black tabular-nums text-emerald-950">{editWarehouseProfitEstimate.profitabilityPct.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%</div></div>
                  </div>
                ) : null}

                <div className="border-t border-zinc-200 p-4">
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    {order.estimateFileKey ? <a href={`/api/orders/${order.id}/estimate`} className={orderSecondaryButtonClass + " justify-center text-center"} download>Клиентская смета ↓</a> : null}
                    {isWarehouse ? <a href={`/api/orders/${order.id}/estimate/internal`} className={orderSecondaryButtonClass + " justify-center text-center"} download>Внутренняя смета ↓</a> : null}
                  </div>
                  <button ref={orderEditSaveRef} type="button" disabled={busy} onClick={saveOrderEdit} className={orderPrimaryButtonClass + " mt-3 w-full"}>
                    {busy ? "Сохраняю…" : isServiceOnlyEdit ? "Сохранить услуги" : isGreenwich ? "Запросить изменения" : "Сохранить заявку"}
                  </button>
                  <button type="button" disabled={busy} onClick={() => { setIsEditing(false); setActionError(null); }} className="mt-2 w-full rounded-md px-4 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950">Отмена</button>
                </div>
              </section>
            </aside>
          </div>
        ) : (
          <>
            <div className={orderGlassCardClass + " overflow-hidden"}>
              <div className={orderSectionHeaderClass + " flex flex-wrap items-center justify-between gap-2"}>
                <div>
                  <div className="text-base font-black text-zinc-950">Состав заявки</div>
                  <div className="mt-0.5 text-xs text-zinc-500">{order.lines.length} поз. · количества и согласование склада</div>
                </div>
                {(canEditOrder || canEditOrderServicesOnly) ? (
                  <button type="button" onClick={startEditing} className={orderSecondaryButtonClass + " px-3 py-2 text-xs"}>
                    Изменить состав
                  </button>
                ) : null}
              </div>
              <div className="divide-y divide-zinc-200">
                    {order.lines.map((line, index) => (
                      <div key={line.id} className="grid gap-4 px-4 py-4 transition-colors hover:bg-zinc-50 sm:px-5 lg:grid-cols-[minmax(260px,1.35fr)_repeat(3,minmax(72px,0.35fr))_minmax(100px,0.55fr)] lg:items-center">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="hidden w-6 shrink-0 text-xs font-black tabular-nums text-zinc-300 sm:block">{String(index + 1).padStart(2, "0")}</span>
                          <ProductIdentity
                            itemId={line.item.id}
                            photo1Key={line.item.photo1Key}
                            name={line.item.name}
                            size="md"
                          />
                        </div>
                        {([
                          ["Запрошено", line.requestedQty],
                          ["Согласовано", line.approvedQty ?? "—"],
                          ["Выдано", line.issuedQty ?? "—"],
                        ] as const).map(([label, value]) => (
                          <div key={label} className="border-l border-zinc-200 pl-3 lg:border-l-0 lg:pl-0">
                            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">{label}</div>
                            <div className="mt-1 font-black tabular-nums text-zinc-950">{value}</div>
                          </div>
                        ))}
                        <div className="border-l border-zinc-200 pl-3 lg:border-l-0 lg:pl-0 lg:text-right">
                          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">Цена / сутки</div>
                          <div className="mt-1 text-sm text-zinc-700">
                          {(() => {
                            if (line.pricePerDaySnapshot == null) return "—";
                            const multiplier = order.payMultiplier != null ? Number(order.payMultiplier) : 1;
                            const before = line.pricePerDaySnapshot * (line.payMultiplierSnapshot ?? multiplier);
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
                          </div>
                        </div>
                        {(line.greenwichComment || line.warehouseComment) ? (
                          <div className="rounded-md bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600 lg:col-span-5">
                            {line.greenwichComment ? <span><strong className="text-zinc-800">Клиент:</strong> {line.greenwichComment}</span> : null}
                            {line.greenwichComment && line.warehouseComment ? <span className="mx-2 text-zinc-300">/</span> : null}
                            {line.warehouseComment ? <span><strong className="text-zinc-800">Склад:</strong> {line.warehouseComment}</span> : null}
                          </div>
                        ) : null}
                      </div>
                    ))}
              </div>
            </div>

            {(order.deliveryEnabled || order.montageEnabled || order.demontageEnabled) ? (
              <div className={orderGlassCardClass + " overflow-hidden"}>
                <div className={orderSectionHeaderClass}>
                  <div className="text-base font-black text-zinc-950">Дополнительные услуги</div>
                  <div className="mt-0.5 text-xs text-zinc-500">Логистика и работы, включённые в заявку</div>
                </div>
                <ul className="grid gap-px bg-zinc-200 sm:grid-cols-3">
                  {order.deliveryEnabled ? (
                    <li className="bg-white p-4">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">Услуга</div>
                      <div className="mt-1 font-black text-zinc-950">Доставка</div>
                      {order.deliveryComment ? <div className="mt-2 text-xs leading-5 text-zinc-500">{order.deliveryComment}</div> : null}
                      <div className="mt-3 font-black tabular-nums text-zinc-950">{order.deliveryPrice != null ? `${order.deliveryPrice.toLocaleString("ru-RU")} ₽` : "Цена не указана"}</div>
                      {isWarehouse && order.deliveryInternalCost != null ? <div className="mt-1 text-xs text-zinc-500">Внутр. {Number(order.deliveryInternalCost).toLocaleString("ru-RU")} ₽</div> : null}
                    </li>
                  ) : null}
                  {order.montageEnabled ? (
                    <li className="bg-white p-4">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">Услуга</div>
                      <div className="mt-1 font-black text-zinc-950">Монтаж</div>
                      {order.montageComment ? <div className="mt-2 text-xs leading-5 text-zinc-500">{order.montageComment}</div> : null}
                      <div className="mt-3 font-black tabular-nums text-zinc-950">{order.montagePrice != null ? `${order.montagePrice.toLocaleString("ru-RU")} ₽` : "Цена не указана"}</div>
                      {isWarehouse && order.montageInternalCost != null ? <div className="mt-1 text-xs text-zinc-500">Внутр. {Number(order.montageInternalCost).toLocaleString("ru-RU")} ₽</div> : null}
                    </li>
                  ) : null}
                  {order.demontageEnabled ? (
                    <li className="bg-white p-4">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">Услуга</div>
                      <div className="mt-1 font-black text-zinc-950">Демонтаж</div>
                      {order.demontageComment ? <div className="mt-2 text-xs leading-5 text-zinc-500">{order.demontageComment}</div> : null}
                      <div className="mt-3 font-black tabular-nums text-zinc-950">{order.demontagePrice != null ? `${order.demontagePrice.toLocaleString("ru-RU")} ₽` : "Цена не указана"}</div>
                      {isWarehouse && order.demontageInternalCost != null ? <div className="mt-1 text-xs text-zinc-500">Внутр. {Number(order.demontageInternalCost).toLocaleString("ru-RU")} ₽</div> : null}
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

        {!isEditing && (
          sendEstimateBlocked ||
          (isWarehouse && (order.status === "SUBMITTED" || order.status === "CHANGES_REQUESTED")) ||
          (isWarehouse && order.status === "APPROVED_BY_GREENWICH") ||
          (isWarehouse && order.status === "PICKING") ||
          (isGreenwich && (order.status === "ESTIMATE_SENT" || order.status === "CHANGES_REQUESTED") && isOrderGreenwichUser) ||
          (isGreenwich && order.status === "ISSUED" && order.greenwichUserId === user?.id) ||
          (isWarehouse && order.status === "ISSUED") ||
          canCancel
        ) ? (
        <div className={[
          "order-actionbar",
          isGreenwich && canCancel && !["ESTIMATE_SENT", "CHANGES_REQUESTED", "ISSUED"].includes(order.status)
            ? "!static !shadow-none"
            : "",
        ].join(" ")}>
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
              className="rounded-lg border border-emerald-700 bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition-colors duration-150 hover:bg-emerald-800 disabled:opacity-50"
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
                className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-lg border border-yellow-400 bg-yellow-400 px-5 py-3 text-sm font-bold text-zinc-950 shadow-sm transition-colors duration-150 hover:bg-yellow-300 disabled:opacity-50 sm:bottom-5 sm:right-5"
              >
                {busy
                  ? "Сохраняю…"
                  : isServiceOnlyEdit
                    ? "Сохранить доп. услуги"
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
    <AppShell title={`Заявка ${order.id.slice(0, 8)}`} backHref={backHref}>{inner}</AppShell>
  );
}
