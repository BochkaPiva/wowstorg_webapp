import { ContractorOfferPriceType, Prisma } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";

const PriceTypeSchema = z.nativeEnum(ContractorOfferPriceType);
const CreateOfferSchema = z.object({
  categoryId: z.string().trim().min(1),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  priceType: PriceTypeSchema.default(ContractorOfferPriceType.FIXED),
  clientPrice: z.number().finite().nonnegative().nullable().optional(),
  clientPriceMax: z.number().finite().nonnegative().nullable().optional(),
  internalCost: z.number().finite().nonnegative().nullable().optional(),
  unitLabel: z.string().trim().max(80).nullable().optional(),
  priceConfirmedAt: z.coerce.date().nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.priceType !== ContractorOfferPriceType.ON_REQUEST && value.clientPrice == null) {
    ctx.addIssue({ code: "custom", path: ["clientPrice"], message: "Укажите ориентировочную цену" });
  }
  if (value.priceType === ContractorOfferPriceType.RANGE && value.clientPriceMax == null) {
    ctx.addIssue({ code: "custom", path: ["clientPriceMax"], message: "Укажите верхнюю границу" });
  }
});

export async function POST(req: Request, ctx: { params: Promise<{ contractorId: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const { contractorId } = await ctx.params;
  const parsed = CreateOfferSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Проверьте предложение", parsed.error.flatten());

  const contractor = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { id: true } });
  if (!contractor) return jsonError(404, "Подрядчик не найден");

  const confirmedAt = parsed.data.priceConfirmedAt ?? (parsed.data.clientPrice != null ? new Date() : null);
  const offer = await prisma.contractorOffer.create({
    data: {
      contractorId,
      categoryId: parsed.data.categoryId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      priceType: parsed.data.priceType,
      clientPrice: parsed.data.clientPrice == null ? null : new Prisma.Decimal(parsed.data.clientPrice),
      clientPriceMax: parsed.data.clientPriceMax == null ? null : new Prisma.Decimal(parsed.data.clientPriceMax),
      internalCost: parsed.data.internalCost == null ? null : new Prisma.Decimal(parsed.data.internalCost),
      unitLabel: parsed.data.unitLabel || null,
      priceConfirmedAt: confirmedAt,
      validUntil: parsed.data.validUntil ?? null,
      priceConfirmedById: confirmedAt ? auth.user.id : null,
      priceHistory: { create: {
        actorUserId: auth.user.id,
        reason: "CREATED",
        priceType: parsed.data.priceType,
        clientPrice: parsed.data.clientPrice == null ? null : new Prisma.Decimal(parsed.data.clientPrice),
        clientPriceMax: parsed.data.clientPriceMax == null ? null : new Prisma.Decimal(parsed.data.clientPriceMax),
        internalCost: parsed.data.internalCost == null ? null : new Prisma.Decimal(parsed.data.internalCost),
        unitLabel: parsed.data.unitLabel || null,
      } },
    },
    select: { id: true, title: true, revision: true },
  });
  return jsonOk({ offer });
}

