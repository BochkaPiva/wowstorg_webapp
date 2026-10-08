import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { normalizeContractorName } from "@/server/contractors/identity";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";

const PatchSchema = z.object({
  expectedRevision: z.number().int().min(0),
  name: z.string().trim().min(2).max(200).optional(),
  shortDescription: z.string().trim().max(1000).nullable().optional(),
  websiteUrl: z.string().url().max(500).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  internalNotes: z.string().trim().max(5000).nullable().optional(),
  isActive: z.boolean().optional(),
}).strict();

export async function GET(_req: Request, ctx: { params: Promise<{ contractorId: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const { contractorId } = await ctx.params;
  const contractor = await prisma.contractor.findUnique({
    where: { id: contractorId },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
      assets: { where: { kind: "PHOTO" }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 12 },
      offers: { where: { isActive: true }, orderBy: [{ category: { sortOrder: "asc" } }, { title: "asc" }], include: { category: { select: { id: true, name: true } } } },
    },
  });
  if (!contractor) return jsonError(404, "Подрядчик не найден");
  return jsonOk({ contractor: {
    id: contractor.id, name: contractor.name, shortDescription: contractor.shortDescription,
    websiteUrl: contractor.websiteUrl, city: contractor.city, internalNotes: contractor.internalNotes,
    isActive: contractor.isActive, revision: contractor.revision, updatedAt: contractor.updatedAt,
    photoUrl: contractor.assets[0] ? `/api/contractors/${contractor.id}/assets/${contractor.assets[0].id}` : null,
    photos: contractor.assets.map((asset) => ({ id: asset.id, url: `/api/contractors/${contractor.id}/assets/${asset.id}`, caption: asset.caption })),
    contacts: contractor.contacts.map(({ id, personName, role, phone, email, telegram, isPrimary }) => ({ id, personName, role, phone, email, telegram, isPrimary })),
    offers: contractor.offers.map((offer) => ({
      id: offer.id, title: offer.title, description: offer.description, priceType: offer.priceType,
      clientPrice: offer.clientPrice?.toNumber() ?? null, clientPriceMax: offer.clientPriceMax?.toNumber() ?? null,
      internalCost: offer.internalCost?.toNumber() ?? null, currencyCode: offer.currencyCode,
      unitLabel: offer.unitLabel, priceConfirmedAt: offer.priceConfirmedAt, validUntil: offer.validUntil,
      isActive: offer.isActive, revision: offer.revision, category: offer.category,
    })),
  } });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ contractorId: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const { contractorId } = await ctx.params;
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Проверьте данные подрядчика", parsed.error.flatten());
  const { expectedRevision, ...input } = parsed.data;
  const normalizedName = input.name ? normalizeContractorName(input.name) : undefined;

  try {
    const result = await prisma.contractor.updateMany({
      where: { id: contractorId, revision: expectedRevision },
      data: {
        ...input,
        ...(input.name ? { name: input.name, normalizedName } : {}),
        shortDescription: input.shortDescription === "" ? null : input.shortDescription,
        city: input.city === "" ? null : input.city,
        internalNotes: input.internalNotes === "" ? null : input.internalNotes,
        websiteUrl: input.websiteUrl === "" ? null : input.websiteUrl,
        updatedById: auth.user.id,
        revision: { increment: 1 },
      },
    });
    if (result.count !== 1) return jsonError(409, "Карточка уже изменилась. Обновите данные.");
    return jsonOk({ revision: expectedRevision + 1 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonError(409, "Подрядчик с таким названием уже существует");
    }
    throw error;
  }
}
