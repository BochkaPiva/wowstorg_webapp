import { z } from "zod";

import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { getCatalogRelatedSuggestions } from "@/server/catalog/item-related";
import { getGreenwichItemBenefits } from "@/server/ratings/greenwich-offers";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  itemIds: z.string().trim().min(1).max(2000),
  qtys: z.string().trim().max(2000).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  rentalStartPartOfDay: z.enum(["MORNING", "EVENING"]).optional(),
  rentalEndPartOfDay: z.enum(["MORNING", "EVENING"]).optional(),
  excludeOrderId: z.string().trim().min(1).max(64).optional(),
});

function parseCartLines(itemIdsRaw: string, qtysRaw?: string) {
  const ids = itemIdsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const qtyParts = (qtysRaw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const lines: Array<{ itemId: string; qty: number }> = [];
  for (let i = 0; i < ids.length; i++) {
    const qty = Number.parseInt(qtyParts[i] ?? "1", 10);
    lines.push({ itemId: ids[i]!, qty: Number.isFinite(qty) && qty > 0 ? qty : 1 });
  }
  return lines;
}

export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    itemIds: url.searchParams.get("itemIds") ?? undefined,
    qtys: url.searchParams.get("qtys") ?? undefined,
    startDate: url.searchParams.get("startDate") ?? undefined,
    endDate: url.searchParams.get("endDate") ?? undefined,
    rentalStartPartOfDay: url.searchParams.get("rentalStartPartOfDay") ?? undefined,
    rentalEndPartOfDay: url.searchParams.get("rentalEndPartOfDay") ?? undefined,
    excludeOrderId: url.searchParams.get("excludeOrderId") ?? undefined,
  });
  if (!parsed.success) {
    return jsonError(400, "Invalid query", parsed.error.flatten());
  }

  const cartLines = parseCartLines(parsed.data.itemIds, parsed.data.qtys);
  if (cartLines.length > 100) {
    return jsonError(400, "Слишком много позиций в запросе");
  }

  const result = await getCatalogRelatedSuggestions({
    db: prisma,
    role: auth.user.role,
    cartLines,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
    rentalStartPartOfDay: parsed.data.rentalStartPartOfDay,
    rentalEndPartOfDay: parsed.data.rentalEndPartOfDay,
    excludeOrderId: parsed.data.excludeOrderId,
    priceMultiplier: 1,
  });

  if (auth.user.role !== "GREENWICH" || result.flat.length === 0) {
    return jsonOk(result);
  }

  const benefits = await prisma.$transaction((tx) =>
    getGreenwichItemBenefits(tx, {
      userId: auth.user.id,
      itemIds: result.flat.map((item) => item.relatedItemId),
    }),
  );
  const enrich = (item: (typeof result.flat)[number]) => {
    const benefit = benefits.get(item.relatedItemId);
    if (!benefit) return item;
    return {
      ...item,
      basePricePerDay: item.pricePerDay,
      pricePerDay: Math.round(item.pricePerDay * benefit.payMultiplier * 100) / 100,
      loyalty: {
        discountPercent: benefit.discountPercent,
        source: benefit.source,
        sourceLabel: benefit.sourceLabel,
        offerId: benefit.offerId,
        offerTitle: benefit.offerTitle,
        offerEndsAt: benefit.offerEndsAt,
      },
    };
  };
  const flat = result.flat.map(enrich);
  const flatById = new Map(flat.map((item) => [item.relatedItemId, item]));
  const groups = result.groups.map((group) => ({
    ...group,
    suggestions: group.suggestions.map((item) => flatById.get(item.relatedItemId) ?? item),
  }));

  return jsonOk({ groups, flat });
}
