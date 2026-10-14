export type ItemType = "ASSET" | "BULK" | "CONSUMABLE";
export type Position = {
  id: string; name: string; description: string | null; type: ItemType;
  isActive: boolean; internalOnly: boolean; pricePerDay: string;
  purchasePricePerUnit: string | null; total: number; inRepair: number;
  broken: number; missing: number; photo1Key: string | null; updatedAt: string; createdAt?: string;
  categories: { categoryId: string; category?: { name: string } }[];
  collections: { collectionId: string; position: number; collection?: { name: string } }[];
};
export type Choice = { id: string; name: string; isActive?: boolean };
export type PositionData = { item?: Position; categories: Choice[]; collections: Choice[] };
export type PositionFormValues = ReturnType<typeof positionFormValues>;

export function positionFormValues(item?: Position, internalOnly = false) {
  return {
    name: item?.name ?? "", description: item?.description ?? "", type: item?.type ?? "ASSET" as ItemType,
    pricePerDay: item?.pricePerDay ?? "", purchasePricePerUnit: item?.purchasePricePerUnit ?? "",
    total: String(item?.total ?? 0), inRepair: String(item?.inRepair ?? 0),
    broken: String(item?.broken ?? 0), missing: String(item?.missing ?? 0),
    isActive: item?.isActive ?? true, internalOnly: item?.internalOnly ?? internalOnly,
    categoryIds: item?.categories.map(c => c.categoryId) ?? [],
    collectionIds: [...(item?.collections ?? [])].sort((a, b) => a.position - b.position).map(c => c.collectionId),
  };
}

export function positionPayload(form: PositionFormValues) {
  function number(raw: string, label: string, integer = false) {
    const value = Number(raw.trim().replace(",", "."));
    if (!raw.trim() || !Number.isFinite(value) || value < 0 || integer && !Number.isInteger(value)) throw new Error(`${label}: укажите ${integer ? "целое " : ""}число от нуля.`);
    return value;
  }
  if (!form.name.trim()) throw new Error("Укажите название позиции.");
  const total = number(form.total, "Всего", true);
  const inRepair = number(form.inRepair, "В ремонте", true);
  const broken = number(form.broken, "Сломано", true);
  const missing = number(form.missing, "Утеряно", true);
  if (inRepair + broken + missing > total) throw new Error("Ремонт, поломки и потери вместе не могут превышать общее количество.");
  return { ...form, name: form.name.trim(), description: form.description.trim() || null,
    pricePerDay: number(form.pricePerDay, "Цена аренды"),
    purchasePricePerUnit: form.purchasePricePerUnit.trim() ? number(form.purchasePricePerUnit, "Цена закупки") : null,
    total, inRepair, broken, missing,
  };
}

export function availableStock(item: Pick<Position, "total" | "inRepair" | "broken" | "missing">) {
  return Math.max(0, item.total - item.inRepair - item.broken - item.missing);
}
export const SORT_OPTIONS = [
  { value: "updated", label: "Недавно изменённые" }, { value: "created", label: "Недавно добавленные" },
  { value: "name", label: "Название: А → Я" }, { value: "name-desc", label: "Название: Я → А" },
  { value: "price", label: "Цена: по возрастанию" }, { value: "price-desc", label: "Цена: по убыванию" },
  { value: "stock", label: "Исправно: меньше сначала" }, { value: "stock-desc", label: "Исправно: больше сначала" },
] as const;
export type PositionSort = typeof SORT_OPTIONS[number]["value"];
export function sortPositions(items: Position[], sort: PositionSort) {
  return [...items].sort((a, b) => {
    let difference = 0;
    if (sort.startsWith("name")) difference = a.name.localeCompare(b.name, "ru", { numeric: true });
    else if (sort.startsWith("price")) difference = Number(a.pricePerDay) - Number(b.pricePerDay);
    else if (sort.startsWith("stock")) difference = availableStock(a) - availableStock(b);
    else difference = Date.parse(sort === "created" ? b.createdAt ?? b.updatedAt : b.updatedAt) - Date.parse(sort === "created" ? a.createdAt ?? a.updatedAt : a.updatedAt);
    if (sort.endsWith("-desc")) difference *= -1;
    return difference || a.name.localeCompare(b.name, "ru", { numeric: true }) || a.id.localeCompare(b.id);
  });
}
