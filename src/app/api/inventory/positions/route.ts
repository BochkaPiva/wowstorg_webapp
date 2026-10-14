import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  type: z.enum(["ASSET", "BULK", "CONSUMABLE"]),
  pricePerDay: z.number().finite().min(0),
  purchasePricePerUnit: z.number().finite().min(0).nullable().optional(),
  total: z.number().int().min(0),
  inRepair: z.number().int().min(0).default(0),
  broken: z.number().int().min(0).default(0),
  missing: z.number().int().min(0).default(0),
  categoryIds: z.array(z.string().min(1)).max(100).default([]),
  collectionIds: z.array(z.string().min(1)).max(100).default([]),
  internalOnly: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const QuerySchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  includeInactive: z.enum(["true", "false"]).optional(),
  internalOnly: z.enum(["true", "false"]).optional(),
  options: z.enum(["true"]).optional(),
});

export async function GET(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    query: url.searchParams.get("query") ?? undefined,
    includeInactive: url.searchParams.get("includeInactive") ?? undefined,
    internalOnly: url.searchParams.get("internalOnly") ?? undefined,
    options: url.searchParams.get("options") ?? undefined,
  });
  if (!parsed.success) return jsonError(400, "Invalid query", parsed.error.flatten());
  if (parsed.data.options) {
    const [categories, collections] = await Promise.all([
      prisma.category.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
      prisma.collection.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, isActive: true } }),
    ]);
    return jsonOk({ categories, collections });
  }

  const { query, includeInactive, internalOnly } = parsed.data;
  const where: Prisma.ItemWhereInput = {
    ...(includeInactive === "true" ? {} : { isActive: true }),
    ...(internalOnly ? { internalOnly: internalOnly === "true" } : {}),
    ...(query ? { name: { contains: query, mode: "insensitive" } } : {}),
  };

  const items = await prisma.item.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      description: true,
      type: true,
      isActive: true,
      internalOnly: true,
      pricePerDay: true,
      purchasePricePerUnit: true,
      total: true,
      inRepair: true,
      broken: true,
      missing: true,
      photo1Key: true,
      createdAt: true,
      updatedAt: true,
      categories: { select: { categoryId: true, category: { select: { name: true } } } },
      collections: { select: { collectionId: true, collection: { select: { name: true } }, position: true } },
    },
  });

  return jsonOk({ items });
}

export async function POST(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid payload", parsed.error.flatten());

  const { name, description, type, pricePerDay, purchasePricePerUnit, total, inRepair, broken, missing, categoryIds, collectionIds, internalOnly, isActive } = parsed.data;
  if (inRepair + broken + missing > total) return jsonError(400, "Ремонт, поломки и потери вместе не могут превышать общее количество.");

  try {
    const item = await prisma.$transaction(async tx => {
      const created = await tx.item.create({
        data: {
          name, description: description ?? null, type,
          pricePerDay: new Prisma.Decimal(pricePerDay),
          purchasePricePerUnit: purchasePricePerUnit == null ? null : new Prisma.Decimal(purchasePricePerUnit),
          total, inRepair, broken, missing,
          categories: { create: [...new Set(categoryIds)].map(categoryId => ({ categoryId })) },
          collections: { create: [...new Set(collectionIds)].map((collectionId, position) => ({ collectionId, position })) },
          internalOnly: Boolean(internalOnly), isActive: isActive ?? true,
        },
        select: { id: true, updatedAt: true },
      });
      if (missing > 0) await tx.lossRecord.create({ data: { itemId: created.id, qty: missing, status: "OPEN" } });
      return created;
    });

    return jsonOk({ ok: true, id: item.id, updatedAt: item.updatedAt });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError) return jsonError(409, "Категория или подборка изменилась. Обновите форму и повторите.");
    throw cause;
  }
}

