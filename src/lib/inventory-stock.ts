/**
 * Годные к выдаче единицы по складским ведрам (total − ремонт − брак − недостача).
 * Резервы по датам и пересечения с другими заявками сюда не входят — их считают отдельно
 * при создании/редактировании реальной заявки и при materialize.
 */
export type ItemStockBuckets = {
  total: number;
  inRepair: number;
  broken: number;
  missing: number;
};

export function usableStockUnits(item: ItemStockBuckets): number {
  return Math.max(0, item.total - item.inRepair - item.broken - item.missing);
}
