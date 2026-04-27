export type OrderDiscountType = "NONE" | "PERCENT" | "AMOUNT";

export type OrderDiscountInput = {
  rentalDiscountType?: OrderDiscountType | string | null;
  rentalDiscountPercent?: unknown;
  rentalDiscountAmount?: unknown;
};

export type OrderPricingLine = {
  itemId?: string;
  requestedQty?: number;
  issuedQty?: number | null;
  pricePerDaySnapshot: unknown;
};

export type OrderPricingAllocation = {
  itemId?: string;
  qty: number;
  rentalBeforeDiscount: number;
  discountAmount: number;
  rentalAfterDiscount: number;
};

export type OrderPricingBreakdown = {
  days: number;
  payMultiplier: number;
  rentalSubtotalBeforeDiscount: number;
  discountType: OrderDiscountType;
  discountPercent: number | null;
  discountAmount: number;
  rentalSubtotalAfterDiscount: number;
  servicesTotal: number;
  grandTotal: number;
  lineAllocations: OrderPricingAllocation[];
};

export function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  const days = Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
  return days === 0 ? 1 : days;
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeOrderDiscount(input: OrderDiscountInput): {
  type: OrderDiscountType;
  percent: number | null;
  amount: number | null;
} {
  const rawType = input.rentalDiscountType;
  const type: OrderDiscountType =
    rawType === "PERCENT" || rawType === "AMOUNT" ? rawType : "NONE";
  if (type === "PERCENT") {
    const percent = num(input.rentalDiscountPercent);
    return { type, percent, amount: null };
  }
  if (type === "AMOUNT") {
    const amount = num(input.rentalDiscountAmount);
    return { type, percent: null, amount };
  }
  return { type: "NONE", percent: null, amount: null };
}

export function calcOrderPricing(args: {
  startDate: Date;
  endDate: Date;
  payMultiplier: unknown;
  deliveryPrice?: unknown;
  montagePrice?: unknown;
  demontagePrice?: unknown;
  lines: OrderPricingLine[];
  discount?: OrderDiscountInput;
  quantityMode?: "requested" | "issued";
}): OrderPricingBreakdown {
  const days = daysBetween(args.startDate, args.endDate);
  const payMultiplier = num(args.payMultiplier) || 1;
  const quantityMode = args.quantityMode ?? "requested";
  const baseLines = args.lines.map((line) => {
    const qty =
      quantityMode === "issued"
        ? (line.issuedQty ?? line.requestedQty ?? 0)
        : (line.requestedQty ?? 0);
    const rentalBeforeDiscount = num(line.pricePerDaySnapshot) * qty * days * payMultiplier;
    return {
      itemId: line.itemId,
      qty,
      rentalBeforeDiscount,
    };
  });
  const rentalSubtotalBeforeDiscount = baseLines.reduce((sum, line) => sum + line.rentalBeforeDiscount, 0);
  const discount = normalizeOrderDiscount(args.discount ?? {});
  const requestedDiscount =
    discount.type === "PERCENT"
      ? rentalSubtotalBeforeDiscount * ((discount.percent ?? 0) / 100)
      : discount.type === "AMOUNT"
        ? (discount.amount ?? 0)
        : 0;
  const discountAmount = Math.min(Math.max(0, requestedDiscount), rentalSubtotalBeforeDiscount);
  const rentalSubtotalAfterDiscount = Math.max(0, rentalSubtotalBeforeDiscount - discountAmount);
  const servicesTotal = num(args.deliveryPrice) + num(args.montagePrice) + num(args.demontagePrice);
  const grandTotal = Math.round(rentalSubtotalAfterDiscount + servicesTotal);
  const lineAllocations = baseLines.map((line) => {
    const share =
      rentalSubtotalBeforeDiscount > 0
        ? line.rentalBeforeDiscount / rentalSubtotalBeforeDiscount
        : 0;
    const lineDiscount = discountAmount * share;
    return {
      itemId: line.itemId,
      qty: line.qty,
      rentalBeforeDiscount: line.rentalBeforeDiscount,
      discountAmount: lineDiscount,
      rentalAfterDiscount: Math.max(0, line.rentalBeforeDiscount - lineDiscount),
    };
  });

  return {
    days,
    payMultiplier,
    rentalSubtotalBeforeDiscount,
    discountType: discount.type,
    discountPercent: discount.percent,
    discountAmount,
    rentalSubtotalAfterDiscount,
    servicesTotal,
    grandTotal,
    lineAllocations,
  };
}

export function validateOrderDiscount(args: {
  discount: OrderDiscountInput;
  rentalSubtotalBeforeDiscount: number;
}): { ok: true } | { ok: false; message: string } {
  const discount = normalizeOrderDiscount(args.discount);
  if (discount.type === "NONE") return { ok: true };
  if (discount.type === "PERCENT") {
    if (discount.percent == null || discount.percent <= 0 || discount.percent > 100) {
      return { ok: false, message: "Процент скидки должен быть больше 0 и не больше 100" };
    }
    return { ok: true };
  }
  if (discount.amount == null || discount.amount <= 0) {
    return { ok: false, message: "Сумма скидки должна быть больше 0" };
  }
  if (discount.amount > args.rentalSubtotalBeforeDiscount) {
    return { ok: false, message: "Скидка не может быть больше суммы аренды реквизита" };
  }
  return { ok: true };
}
