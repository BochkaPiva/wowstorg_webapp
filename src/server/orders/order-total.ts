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
  deliveryEnabled?: boolean;
  deliveryPrice: number | null;
  montageEnabled?: boolean;
  montagePrice: number | null;
  demontageEnabled?: boolean;
  demontagePrice: number | null;
  lines: Array<{
    requestedQty: number;
    pricePerDaySnapshot: unknown;
    payMultiplierSnapshot?: unknown;
  }>;
  discount?: OrderDiscountInput;
  clientPaymentMethod?: "NON_CASH" | "CASH" | string | null;
}): number {
  return calcOrderPricing({
    ...args,
    discount: args.discount,
  }).grandTotal;
}
