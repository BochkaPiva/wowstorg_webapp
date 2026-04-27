import {
  calcOrderPricing,
  daysBetween,
  type OrderDiscountInput,
} from "@/server/orders/order-pricing";

export { daysBetween };

export function calcOrderTotalAmount(args: {
  startDate: Date;
  endDate: Date;
  payMultiplier: number | null;
  deliveryPrice: number | null;
  montagePrice: number | null;
  demontagePrice: number | null;
  lines: Array<{ requestedQty: number; pricePerDaySnapshot: unknown }>;
  discount?: OrderDiscountInput;
}): number {
  return calcOrderPricing({
    ...args,
    discount: args.discount,
  }).grandTotal;
}
