import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

const QuerySchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(128).optional(), // categoryId or slug (v1: accept both)
  internalOnly: z.enum(["true", "false"]).optional(),
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
  });
  if (!parsed.success) {
    return jsonError(400, "Invalid query", parsed.error.flatten());
  }

  const { query, category, internalOnly } = parsed.data;

  // GREENWICH никогда не должен видеть internalOnly
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
      ? {
          name: { contains: query, mode: "insensitive" },
        }
      : {}),
  };

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

  return jsonOk({
    items: items.map((i) => ({
      ...i,
      availability: {
        availableNow: computeAvailableNow(i),
      },
    })),
  });
}

