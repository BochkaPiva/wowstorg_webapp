import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { parseDateOnlyToUtcMidnight } from "@/server/dates";
import { getReservedQtyByItemId } from "@/server/orders/reserve";
import { PAY_MULTIPLIER_GREENWICH } from "@/lib/constants";
import { usableStockUnits } from "@/lib/inventory-stock";

const QuerySchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(128).optional(),
  internalOnly: z.enum(["true", "false"]).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  excludeOrderId: z.string().trim().min(1).max(64).optional(),
  ids: z.string().trim().max(2000).optional(), // comma-separated item ids for cart
  all: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(64).default(32),
});

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
    all: url.searchParams.get("all") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
  });
  if (!parsed.success) {
    return jsonError(400, "Invalid query", parsed.error.flatten());
  }

  const { query, category, internalOnly, startDate, endDate, excludeOrderId, ids, all, page, pageSize } =
    parsed.data;

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

  const select = {
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
  } satisfies Prisma.ItemSelect;

  const usePagination = !ids?.trim() && all !== "true";
  const total = usePagination ? await prisma.item.count({ where }) : undefined;
  const currentPage = usePagination ? page : 1;
  const currentPageSize = usePagination ? pageSize : 0;
  const skip = usePagination ? (currentPage - 1) * currentPageSize : undefined;
  const take = usePagination ? currentPageSize : undefined;

  const items = await prisma.item.findMany({
    where,
    orderBy: [{ name: "asc" }],
    ...(usePagination ? { skip, take } : {}),
    select,
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
  const mappedItems = items.map((i) => {
    const availableNow = usableStockUnits(i);
    const reserved = reservedByItemId.get(i.id) ?? 0;
    const availableForDates =
      startDate && endDate
        ? Math.max(0, availableNow - reserved)
        : undefined;
    const basePrice = Number(i.pricePerDay);
    // Всегда число в JSON: иначе Prisma Decimal для WOWSTORG уезжает строкой, клиент теряет цену (сумма 0 в смете).
    const pricePerDay =
      priceMultiplier !== 1
        ? Math.round(basePrice * priceMultiplier * 100) / 100
        : basePrice;

    return {
      ...i,
      pricePerDay,
      availability: {
        availableNow,
        ...(availableForDates !== undefined && { availableForDates }),
      },
    };
  });

  return jsonOk({
    items: mappedItems,
    pagination: usePagination
      ? {
          page: currentPage,
          pageSize: currentPageSize,
          total: total ?? mappedItems.length,
          totalPages: Math.max(1, Math.ceil((total ?? mappedItems.length) / currentPageSize)),
        }
      : null,
  });
}

