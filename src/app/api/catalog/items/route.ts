import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { parseDateOnlyToUtcMidnight } from "@/server/dates";
import { getReservedQtyByItemId } from "@/server/orders/reserve";
import { PAY_MULTIPLIER_GREENWICH } from "@/lib/constants";

const QuerySchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(128).optional(),
  internalOnly: z.enum(["true", "false"]).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  excludeOrderId: z.string().trim().min(1).max(64).optional(),
  ids: z.string().trim().max(2000).optional(), // comma-separated item ids for cart
});

function computeAvailableNow(item: {
  total: number;
  inRepair: number;
  broken: number;
  missing: number;
}) {
  return Math.max(0, item.total - item.inRepair - item.broken - item.missing);
}

export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    query: url.searchParams.get("query") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    internalOnly: url.searchParams.get("internalOnly") ?? undefined,
    startDate: url.searchParams.get("startDate") ?? undefined,
    endDate: url.searchParams.get("endDate") ?? undefined,
    excludeOrderId: url.searchParams.get("excludeOrderId") ?? undefined,
    ids: url.searchParams.get("ids") ?? undefined,
  });
  if (!parsed.success) {
    return jsonError(400, "Invalid query", parsed.error.flatten());
  }

  const { query, category, internalOnly, startDate, endDate, excludeOrderId, ids } = parsed.data;

  const internalOnlyBool =
    auth.user.role === "GREENWICH"
      ? false
      : internalOnly
        ? internalOnly === "true"
        : false;

  const where: Prisma.ItemWhereInput = {
    isActive: true,
    internalOnly: internalOnlyBool,
    ...(query
      ? { name: { contains: query, mode: "insensitive" } }
      : {}),
  };

  if (ids?.trim()) {
    const idList = ids.split(",").map((s) => s.trim()).filter(Boolean);
    if (idList.length) where.id = { in: idList };
  }

  if (category) {
    where.OR = [
      { categories: { some: { categoryId: category } } },
      { categories: { some: { category: { slug: category } } } },
    ];
  }

  const items = await prisma.item.findMany({
    where,
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      type: true,
      pricePerDay: true,
      photo1Key: true,
      photo2Key: true,
      total: true,
      inRepair: true,
      broken: true,
      missing: true,
      internalOnly: true,
      categories: { select: { categoryId: true } },
    },
  });

  let reservedByItemId: Map<string, number> = new Map();
  if (startDate && endDate) {
    try {
      const start = parseDateOnlyToUtcMidnight(startDate);
      const end = parseDateOnlyToUtcMidnight(endDate);
      // Включая один день аренды (start === end): пересечение по дням всё равно считается.
      if (start.getTime() <= end.getTime()) {
        reservedByItemId = await getReservedQtyByItemId({
          db: prisma,
          startDate: start,
          endDate: end,
          ...(excludeOrderId ? { excludeOrderId } : {}),
        });
      }
    } catch {
      // invalid dates: keep reserved empty
    }
  }

  const isGreenwich = auth.user.role === "GREENWICH";
  const priceMultiplier = isGreenwich ? PAY_MULTIPLIER_GREENWICH : 1;

  return jsonOk({
    items: items.map((i) => {
      const availableNow = computeAvailableNow(i);
      const reserved = reservedByItemId.get(i.id) ?? 0;
      const availableForDates =
        startDate && endDate
          ? Math.max(0, availableNow - reserved)
          : undefined;
      const basePrice = Number(i.pricePerDay);
      const pricePerDay =
        priceMultiplier !== 1
          ? Math.round(basePrice * priceMultiplier * 100) / 100
          : i.pricePerDay;

      return {
        ...i,
        pricePerDay,
        availability: {
          availableNow,
          ...(availableForDates !== undefined && { availableForDates }),
        },
      };
    }),
  });
}

