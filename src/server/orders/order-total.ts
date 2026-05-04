import type { RentalPartOfDay } from "@/lib/rental-days";
import {
  calcOrderPricing,
  daysBetween,
  type OrderDiscountInput,
} from "@/server/orders/order-pricing";

export { daysBetween };

export function calcOrderTotalAmount(args: {
  startDate: Date;
  endDate: Date;
  rentalStartPartOfDay?: RentalPartOfDay;
  rentalEndPartOfDay?: RentalPartOfDay;
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
