import { roundMoney } from "@/lib/money";

/** Days are an input calculator for the existing fixed-amount discount, not a shorter reserve. */
export function rentalDaysDiscount(args: {
  rentalSubtotal: number;
  rentalDays: number;
  excludedDays: number;
}): { ok: true; amount: number; chargedDays: number } | { ok: false; message: string } {
  if (!Number.isInteger(args.rentalDays) || args.rentalDays < 1 ||
      !Number.isFinite(args.rentalSubtotal) || args.rentalSubtotal <= 0) {
    return { ok: false, message: "Сначала укажите срок и стоимость аренды" };
  }
  if (!Number.isInteger(args.excludedDays) || args.excludedDays < 1 || args.excludedDays > args.rentalDays) {
    return { ok: false, message: `Укажите целое число дней от 1 до ${args.rentalDays}` };
  }
  // Do not round a per-day rate first: it can accumulate a kopeck error over several days.
  const amount = Math.min(args.rentalSubtotal, roundMoney(args.rentalSubtotal * args.excludedDays / args.rentalDays));
  if (amount <= 0) return { ok: false, message: "Стоимость выбранных дней меньше одной копейки" };
  return { ok: true, amount, chargedDays: args.rentalDays - args.excludedDays };
}
