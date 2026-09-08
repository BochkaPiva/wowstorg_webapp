import { ContractorOfferPriceType, Prisma } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";

const PatchSchema = z.object({
  expectedRevision: z.number().int().min(0),
  categoryId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  priceType: z.nativeEnum(ContractorOfferPriceType).optional(),
  clientPrice: z.number().finite().nonnegative().nullable().optional(),
  clientPriceMax: z.number().finite().nonnegative().nullable().optional(),
  internalCost: z.number().finite().nonnegative().nullable().optional(),
  unitLabel: z.string().trim().max(80).nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
  confirmPrice: z.boolean().optional(),
  note: z.string().trim().max(500).nullable().optional(),
}).strict();

export async function PATCH(req: Request, ctx: { params: Promise<{ contractorId: string; offerId: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const { contractorId, offerId } = await ctx.params;
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Проверьте предложение", parsed.error.flatten());

  try {
    const next = await prisma.$transaction(async (tx) => {
      const current = await tx.contractorOffer.findFirst({ where: { id: offerId, contractorId }, select: {
        revision: true, priceType: true, clientPrice: true, clientPriceMax: true, internalCost: true, unitLabel: true,
      } });
      if (!current) throw new Error("NOT_FOUND");
      if (current.revision !== parsed.data.expectedRevision) throw new Error("REVISION_CONFLICT");
      const priceChanged = parsed.data.clientPrice !== undefined || parsed.data.clientPriceMax !== undefined || parsed.data.internalCost !== undefined || parsed.data.priceType !== undefined;
      const confirmedAt = parsed.data.confirmPrice || priceChanged ? new Date() : undefined;
      const update = await tx.contractorOffer.update({ where: { id: offerId }, data: {
        categoryId: parsed.data.categoryId,
        title: parsed.data.title,
        description: parsed.data.description,
        priceType: parsed.data.priceType,
        clientPrice: parsed.data.clientPrice === undefined ? undefined : parsed.data.clientPrice == null ? null : new Prisma.Decimal(parsed.data.clientPrice),
        clientPriceMax: parsed.data.clientPriceMax === undefined ? undefined : parsed.data.clientPriceMax == null ? null : new Prisma.Decimal(parsed.data.clientPriceMax),
        internalCost: parsed.data.internalCost === undefined ? undefined : parsed.data.internalCost == null ? null : new Prisma.Decimal(parsed.data.internalCost),
        unitLabel: parsed.data.unitLabel,
        validUntil: parsed.data.validUntil,
        isActive: parsed.data.isActive,
        priceConfirmedAt: confirmedAt,
        priceConfirmedById: confirmedAt ? auth.user.id : undefined,
        revision: { increment: 1 },
      }, select: { revision: true, priceType: true, clientPrice: true, clientPriceMax: true, internalCost: true, unitLabel: true } });
      if (parsed.data.confirmPrice || priceChanged) await tx.contractorOfferPriceHistory.create({ data: {
        offerId, actorUserId: auth.user.id, reason: parsed.data.confirmPrice ? "CONFIRMED" : "UPDATED",
        priceType: update.priceType, clientPrice: update.clientPrice, clientPriceMax: update.clientPriceMax,
        internalCost: update.internalCost, unitLabel: update.unitLabel, note: parsed.data.note || null,
      } });
      return update.revision;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return jsonOk({ revision: next });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return jsonError(404, "Предложение не найдено");
    if (error instanceof Error && error.message === "REVISION_CONFLICT") return jsonError(409, "Цена уже изменилась. Обновите каталог.");
    throw error;
  }
}
