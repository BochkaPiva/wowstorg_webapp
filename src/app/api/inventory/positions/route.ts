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
  total: z.number().int().min(0),
  internalOnly: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const QuerySchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  includeInactive: z.enum(["true", "false"]).optional(),
  internalOnly: z.enum(["true", "false"]).optional(),
});

export async function GET(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    query: url.searchParams.get("query") ?? undefined,
    includeInactive: url.searchParams.get("includeInactive") ?? undefined,
    internalOnly: url.searchParams.get("internalOnly") ?? undefined,
  });
  if (!parsed.success) return jsonError(400, "Invalid query", parsed.error.flatten());

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

  const { name, description, type, pricePerDay, total, internalOnly, isActive } = parsed.data;

  const item = await prisma.item.create({
    data: {
      name,
      description: description ?? null,
      type,
      pricePerDay: new Prisma.Decimal(pricePerDay),
      total,
      internalOnly: Boolean(internalOnly),
      isActive: isActive ?? true,
    },
    select: { id: true },
  });

  return jsonOk({ ok: true, id: item.id });
}

