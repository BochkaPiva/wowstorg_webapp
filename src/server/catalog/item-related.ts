import type { ItemRelationKind, PrismaClient, Role } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import { PAY_MULTIPLIER_GREENWICH } from "@/lib/constants";
import { usableStockUnits } from "@/lib/inventory-stock";
import type { RentalPartOfDay } from "@/lib/rental-days";
import { parseDateOnlyToUtcMidnight } from "@/server/dates";
import { getReservedQtyByItemId } from "@/server/orders/reserve";

import { MAX_ITEM_RELATIONS_PER_SOURCE } from "@/lib/item-related-constants";

export type ItemRelationInput = {
  relatedItemId: string;
  kind: ItemRelationKind;
  sortOrder: number;
  defaultSuggestedQty: number;
  note?: string | null;
};

export type CatalogRelatedSuggestion = {
  relatedItemId: string;
  name: string;
  kind: ItemRelationKind;
  note: string | null;
  suggestedQty: number;
  alreadyInCart: number;
  pricePerDay: number;
  photo1Key: string | null;
  availability: { availableNow: number; availableForDates?: number };
  sourceItemIds: string[];
  sourceItemNames: string[];
};

export type CatalogRelatedGroup = {
  sourceItemId: string;
  sourceItemName: string;
  sourceQtyInCart: number;
  suggestions: CatalogRelatedSuggestion[];
};

function kindRank(kind: ItemRelationKind): number {
  return kind === "REQUIRED" ? 0 : 1;
}

export function validateItemRelationsForReplace(args: {
  sourceItemId: string;
  relations: ItemRelationInput[];
}): { ok: true } | { ok: false; message: string } {
  if (args.relations.length > MAX_ITEM_RELATIONS_PER_SOURCE) {
    return { ok: false, message: `Не более ${MAX_ITEM_RELATIONS_PER_SOURCE} связей на позицию` };
  }

  const seen = new Set<string>();
  for (const row of args.relations) {
    if (row.relatedItemId === args.sourceItemId) {
      return { ok: false, message: "Нельзя связать позицию саму с собой" };
    }
    if (seen.has(row.relatedItemId)) {
      return { ok: false, message: "Дублирующаяся связанная позиция в списке" };
    }
    seen.add(row.relatedItemId);
    if (row.defaultSuggestedQty < 1) {
      return { ok: false, message: "Количество должно быть не меньше 1" };
    }
  }

  return { ok: true };
}

export async function replaceItemRelations(args: {
  db: Prisma.TransactionClient;
  sourceItemId: string;
  relations: ItemRelationInput[];
}): Promise<void> {
  const validation = validateItemRelationsForReplace({
    sourceItemId: args.sourceItemId,
    relations: args.relations,
  });
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  if (args.relations.length > 0) {
    const relatedIds = args.relations.map((r) => r.relatedItemId);
    const found = await args.db.item.findMany({
      where: { id: { in: relatedIds } },
      select: { id: true },
    });
    if (found.length !== relatedIds.length) {
      throw new Error("RELATED_ITEM_NOT_FOUND");
    }
  }

  await args.db.itemRelatedItem.deleteMany({ where: { sourceItemId: args.sourceItemId } });
  if (args.relations.length === 0) return;

  await args.db.itemRelatedItem.createMany({
    data: args.relations.map((row) => ({
      sourceItemId: args.sourceItemId,
      relatedItemId: row.relatedItemId,
      kind: row.kind,
      sortOrder: row.sortOrder,
      defaultSuggestedQty: row.defaultSuggestedQty,
      note: row.note?.trim() ? row.note.trim() : null,
    })),
  });
}

export async function getCatalogRelatedSuggestions(args: {
  db: Prisma.TransactionClient | PrismaClient;
  role: Role;
  cartLines: Array<{ itemId: string; qty: number }>;
  startDate?: string;
  endDate?: string;
  rentalStartPartOfDay?: RentalPartOfDay;
  rentalEndPartOfDay?: RentalPartOfDay;
  excludeOrderId?: string;
}): Promise<{ groups: CatalogRelatedGroup[]; flat: CatalogRelatedSuggestion[] }> {
  const cartLines = args.cartLines.filter((l) => l.qty > 0 && l.itemId.trim());
  if (cartLines.length === 0) {
    return { groups: [], flat: [] };
  }

  const cartQtyByItemId = new Map<string, number>();
  const cartItemIds: string[] = [];
  for (const line of cartLines) {
    cartItemIds.push(line.itemId);
    cartQtyByItemId.set(line.itemId, (cartQtyByItemId.get(line.itemId) ?? 0) + line.qty);
  }

  const sourceItems = await args.db.item.findMany({
    where: { id: { in: cartItemIds }, isActive: true },
    select: { id: true, name: true },
  });
  const sourceNameById = new Map(sourceItems.map((i) => [i.id, i.name]));
  const activeSourceIds = sourceItems.map((i) => i.id);
  if (activeSourceIds.length === 0) {
    return { groups: [], flat: [] };
  }

  const isGreenwich = args.role === "GREENWICH";
  const relations = await args.db.itemRelatedItem.findMany({
    where: { sourceItemId: { in: activeSourceIds } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      sourceItemId: true,
      relatedItemId: true,
      kind: true,
      sortOrder: true,
      defaultSuggestedQty: true,
      note: true,
      relatedItem: {
        select: {
          id: true,
          name: true,
          isActive: true,
          internalOnly: true,
          pricePerDay: true,
          photo1Key: true,
          total: true,
          inRepair: true,
          broken: true,
          missing: true,
        },
      },
    },
  });

  const groups: CatalogRelatedGroup[] = [];
  const flatMap = new Map<string, CatalogRelatedSuggestion>();

  for (const sourceItemId of activeSourceIds) {
    const sourceItemName = sourceNameById.get(sourceItemId) ?? sourceItemId;
    const sourceQtyInCart = cartQtyByItemId.get(sourceItemId) ?? 0;
    const sourceRelations = relations.filter((r) => r.sourceItemId === sourceItemId);
    const suggestions: CatalogRelatedSuggestion[] = [];

    for (const rel of sourceRelations) {
      const related = rel.relatedItem;
      if (!related.isActive) continue;
      if (isGreenwich && related.internalOnly) continue;
      if (cartQtyByItemId.has(related.id)) continue;

      const suggestedQty = Math.max(1, rel.defaultSuggestedQty);
      const suggestion: CatalogRelatedSuggestion = {
        relatedItemId: related.id,
        name: related.name,
        kind: rel.kind,
        note: rel.note,
        suggestedQty,
        alreadyInCart: 0,
        pricePerDay: Number(related.pricePerDay),
        photo1Key: related.photo1Key,
        availability: { availableNow: usableStockUnits(related) },
        sourceItemIds: [sourceItemId],
        sourceItemNames: [sourceItemName],
      };
      suggestions.push(suggestion);

      const prev = flatMap.get(related.id);
      if (!prev) {
        flatMap.set(related.id, suggestion);
      } else {
        const mergedSourceIds = [...new Set([...prev.sourceItemIds, sourceItemId])];
        const mergedSourceNames = mergedSourceIds.map((id) => sourceNameById.get(id) ?? id);
        flatMap.set(related.id, {
          ...prev,
          kind: kindRank(rel.kind) < kindRank(prev.kind) ? rel.kind : prev.kind,
          suggestedQty: Math.max(prev.suggestedQty, suggestedQty),
          sourceItemIds: mergedSourceIds,
          sourceItemNames: mergedSourceNames,
        });
      }
    }

    if (suggestions.length > 0) {
      groups.push({ sourceItemId, sourceItemName, sourceQtyInCart, suggestions });
    }
  }

  const relatedIds = [...flatMap.keys()];
  if (relatedIds.length === 0) {
    return { groups, flat: [] };
  }

  let reservedByItemId = new Map<string, number>();
  if (args.startDate && args.endDate) {
    try {
      const start = parseDateOnlyToUtcMidnight(args.startDate);
      const end = parseDateOnlyToUtcMidnight(args.endDate);
      if (start.getTime() <= end.getTime()) {
        reservedByItemId = await getReservedQtyByItemId({
          db: args.db,
          startDate: start,
          endDate: end,
          rentalStartPartOfDay: args.rentalStartPartOfDay ?? "MORNING",
          rentalEndPartOfDay: args.rentalEndPartOfDay ?? "EVENING",
          ...(args.excludeOrderId ? { excludeOrderId: args.excludeOrderId } : {}),
        });
      }
    } catch {
      // ignore invalid dates
    }
  }

  const relatedItemById = new Map<
    string,
    {
      total: number;
      inRepair: number;
      broken: number;
      missing: number;
    }
  >();
  for (const rel of relations) {
    relatedItemById.set(rel.relatedItem.id, rel.relatedItem);
  }

  const priceMultiplier = isGreenwich ? PAY_MULTIPLIER_GREENWICH : 1;
  const enrich = (s: CatalogRelatedSuggestion): CatalogRelatedSuggestion => {
    const itemRow = relatedItemById.get(s.relatedItemId);
    const availableNow = itemRow ? usableStockUnits(itemRow) : s.availability.availableNow;
    const reserved = reservedByItemId.get(s.relatedItemId) ?? 0;
    const availableForDates =
      args.startDate && args.endDate ? Math.max(0, availableNow - reserved) : undefined;
    const basePrice = s.pricePerDay;
    const pricePerDay =
      priceMultiplier !== 1 ? Math.round(basePrice * priceMultiplier * 100) / 100 : basePrice;
    return {
      ...s,
      pricePerDay,
      availability: {
        availableNow,
        ...(availableForDates !== undefined ? { availableForDates } : {}),
      },
    };
  };

  const flat = [...flatMap.values()]
    .map(enrich)
    .sort((a, b) => {
      const k = kindRank(a.kind) - kindRank(b.kind);
      if (k !== 0) return k;
      return a.name.localeCompare(b.name, "ru");
    });

  const flatById = new Map(flat.map((s) => [s.relatedItemId, s]));

  const enrichedGroups = groups
    .map((g) => ({
      ...g,
      suggestions: g.suggestions
        .map((s) => flatById.get(s.relatedItemId))
        .filter((s): s is CatalogRelatedSuggestion => Boolean(s)),
    }))
    .filter((g) => g.suggestions.length > 0);

  return { groups: enrichedGroups, flat };
}
