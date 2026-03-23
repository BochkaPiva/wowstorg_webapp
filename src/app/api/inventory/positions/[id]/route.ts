import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

const UpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  type: z.enum(["ASSET", "BULK", "CONSUMABLE"]).optional(),
  pricePerDay: z.number().finite().min(0).optional(),
  purchasePricePerUnit: z.number().finite().min(0).nullable().optional(),
  total: z.number().int().min(0).optional(),
  inRepair: z.number().int().min(0).optional(),
  broken: z.number().int().min(0).optional(),
  missing: z.number().int().min(0).optional(),
  internalOnly: z.boolean().optional(),
  isActive: z.boolean().optional(),
  categoryIds: z.array(z.string().min(1)).optional(),
  collectionIds: z.array(z.string().min(1)).optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  const item = await prisma.item.findUnique({
    where: { id },
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
      photo2Key: true,
      categories: { select: { categoryId: true } },
      collections: { select: { collectionId: true, position: true } },
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!item) return jsonError(404, "Not found");

  const categories = await prisma.category.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true },
  });

  const collections = await prisma.collection.findMany({
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, isActive: true },
  });

  return jsonOk({ item, categories, collections });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid payload", parsed.error.flatten());

  const data = parsed.data;

  const existing = await prisma.item.findUnique({
    where: { id },
    select: { id: true, total: true, inRepair: true, broken: true, missing: true },
  });
  if (!existing) return jsonError(404, "Not found");

  const nextTotal = data.total ?? existing.total;
  const nextInRepair = data.inRepair ?? existing.inRepair;
  const nextBroken = data.broken ?? existing.broken;
  const nextMissing = data.missing ?? existing.missing;
  if (nextInRepair + nextBroken + nextMissing > nextTotal) {
    return jsonError(400, "Сумма «ремонт + сломано + утеряно» не может превышать общее количество");
  }

  const updateData: Prisma.ItemUpdateInput = {
    ...(data.name != null ? { name: data.name } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.type != null ? { type: data.type } : {}),
    ...(data.pricePerDay != null ? { pricePerDay: new Prisma.Decimal(data.pricePerDay) } : {}),
    ...(data.purchasePricePerUnit !== undefined
      ? {
          purchasePricePerUnit:
            data.purchasePricePerUnit == null
              ? null
              : new Prisma.Decimal(data.purchasePricePerUnit),
        }
      : {}),
    ...(data.total != null ? { total: data.total } : {}),
    ...(data.inRepair != null ? { inRepair: data.inRepair } : {}),
    ...(data.broken != null ? { broken: data.broken } : {}),
    ...(data.missing != null ? { missing: data.missing } : {}),
    ...(data.internalOnly != null ? { internalOnly: data.internalOnly } : {}),
    ...(data.isActive != null ? { isActive: data.isActive } : {}),
  };

  await prisma.$transaction(async (tx) => {
    await tx.item.update({ where: { id }, data: updateData });

    // Синхронизация «утеряно» с базой утерь: запись без заявки (ручное редактирование позиции).
    const manualLoss = await tx.lossRecord.findFirst({
      where: { itemId: id, orderId: null, status: "OPEN" },
      select: { id: true },
    });
    if (nextMissing === 0) {
      if (manualLoss) {
        await tx.lossRecord.update({
          where: { id: manualLoss.id },
          data: { qty: 0, foundQty: 0, writtenOffQty: 0, status: "FOUND", resolvedAt: new Date() },
        });
      }
    } else {
      if (manualLoss) {
        await tx.lossRecord.update({
          where: { id: manualLoss.id },
          data: { qty: nextMissing, foundQty: 0, writtenOffQty: 0 },
        });
      } else {
        await tx.lossRecord.create({
          data: {
            itemId: id,
            orderId: null,
            orderLineId: null,
            qty: nextMissing,
            foundQty: 0,
            writtenOffQty: 0,
            status: "OPEN",
          },
        });
      }
    }

    if (data.categoryIds) {
      await tx.itemCategory.deleteMany({ where: { itemId: id } });
      if (data.categoryIds.length) {
        await tx.itemCategory.createMany({
          data: data.categoryIds.map((categoryId) => ({ itemId: id, categoryId })),
        });
      }
    }

    if (data.collectionIds) {
      await tx.collectionItem.deleteMany({ where: { itemId: id } });
      if (data.collectionIds.length) {
        await tx.collectionItem.createMany({
          data: data.collectionIds.map((collectionId, idx) => ({
            itemId: id,
            collectionId,
            position: idx,
          })),
        });
      }
    }
  });

  return jsonOk({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  await prisma.item.delete({ where: { id } }).catch(() => null);
  return jsonOk({ ok: true });
}

