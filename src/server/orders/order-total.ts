export function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  const days = Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
  return days === 0 ? 1 : days;
}

export function calcOrderTotalAmount(args: {
  startDate: Date;
  endDate: Date;
  payMultiplier: number | null;
  deliveryPrice: number | null;
  montagePrice: number | null;
  demontagePrice: number | null;
  lines: Array<{ requestedQty: number; pricePerDaySnapshot: unknown }>;
}): number {
  const days = daysBetween(args.startDate, args.endDate);
  const multiplier = args.payMultiplier ?? 1;
  const rental = args.lines.reduce((sum, l) => {
    const price = l.pricePerDaySnapshot != null ? Number(l.pricePerDaySnapshot) : 0;
    return sum + price * l.requestedQty * days * multiplier;
  }, 0);
  const services =
    (args.deliveryPrice ?? 0) + (args.montagePrice ?? 0) + (args.demontagePrice ?? 0);
  return Math.round(rental + services);
}
