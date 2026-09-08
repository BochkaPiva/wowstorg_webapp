import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { normalizeContractorName } from "@/server/contractors/identity";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";

const CreateContractorSchema = z.object({
  name: z.string().trim().min(2).max(200),
  shortDescription: z.string().trim().max(1000).nullable().optional(),
  websiteUrl: z.string().url().max(500).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  internalNotes: z.string().trim().max(5000).nullable().optional(),
  contact: z.object({
    personName: z.string().trim().max(160).nullable().optional(),
    role: z.string().trim().max(120).nullable().optional(),
    phone: z.string().trim().max(80).nullable().optional(),
    email: z.string().trim().email().max(240).nullable().optional(),
    telegram: z.string().trim().max(120).nullable().optional(),
  }).strict().optional(),
}).strict();

export async function GET(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const search = url.searchParams.get("search")?.trim();
  const categoryId = url.searchParams.get("categoryId")?.trim();
  const includeInactive = url.searchParams.get("all") === "true";
  const contractors = await prisma.contractor.findMany({
    where: {
      isActive: includeInactive ? undefined : true,
      ...(search ? { OR: [
        { name: { contains: search, mode: "insensitive" } },
        { shortDescription: { contains: search, mode: "insensitive" } },
        { offers: { some: { title: { contains: search, mode: "insensitive" } } } },
      ] } : {}),
      ...(categoryId ? { offers: { some: { categoryId, isActive: true } } } : {}),
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    take: 500,
    select: {
      id: true, name: true, shortDescription: true, websiteUrl: true, city: true,
      internalNotes: true, isActive: true, revision: true, updatedAt: true,
      contacts: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], select: {
        id: true, personName: true, role: true, phone: true, email: true, telegram: true, isPrimary: true,
      } },
      assets: { where: { kind: "PHOTO" }, orderBy: { sortOrder: "asc" }, take: 1, select: { id: true, storageKey: true, caption: true } },
      offers: { where: includeInactive ? undefined : { isActive: true }, orderBy: [{ category: { sortOrder: "asc" } }, { title: "asc" }], select: {
        id: true, title: true, description: true, priceType: true, clientPrice: true, clientPriceMax: true,
        internalCost: true, currencyCode: true, unitLabel: true, priceConfirmedAt: true, validUntil: true,
        isActive: true, revision: true, category: { select: { id: true, name: true } },
      } },
    },
  });

  return jsonOk({ contractors: contractors.map((contractor) => ({
    ...contractor,
    photoUrl: contractor.assets[0] ? `/api/contractors/${contractor.id}/assets/${contractor.assets[0].id}` : null,
    assets: undefined,
    offers: contractor.offers.map((offer) => ({
      ...offer,
      clientPrice: offer.clientPrice?.toNumber() ?? null,
      clientPriceMax: offer.clientPriceMax?.toNumber() ?? null,
      internalCost: offer.internalCost?.toNumber() ?? null,
    })),
  })) });
}

export async function POST(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const parsed = CreateContractorSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Проверьте данные подрядчика", parsed.error.flatten());
  const normalizedName = normalizeContractorName(parsed.data.name);
  if (!normalizedName) return jsonError(400, "Название должно содержать буквы или цифры");

  try {
    const contractor = await prisma.contractor.create({
      data: {
        name: parsed.data.name,
        normalizedName,
        shortDescription: parsed.data.shortDescription || null,
        websiteUrl: parsed.data.websiteUrl || null,
        city: parsed.data.city || null,
        internalNotes: parsed.data.internalNotes || null,
        createdById: auth.user.id,
        updatedById: auth.user.id,
        ...(parsed.data.contact ? { contacts: { create: {
          ...parsed.data.contact,
          personName: parsed.data.contact.personName || null,
          role: parsed.data.contact.role || null,
          phone: parsed.data.contact.phone || null,
          email: parsed.data.contact.email || null,
          telegram: parsed.data.contact.telegram || null,
          isPrimary: true,
        } } } : {}),
      },
      select: { id: true, name: true, revision: true },
    });
    return jsonOk({ contractor });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonError(409, "Подрядчик с таким названием уже существует");
    }
    throw error;
  }
}
