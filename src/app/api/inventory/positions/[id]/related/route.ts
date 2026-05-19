import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { MAX_ITEM_RELATIONS_PER_SOURCE } from "@/lib/item-related-constants";
import { replaceItemRelations, validateItemRelationsForReplace } from "@/server/catalog/item-related";

const RelationSchema = z.object({
  relatedItemId: z.string().trim().min(1).max(64),
  kind: z.enum(["REQUIRED", "RECOMMENDED"]),
  sortOrder: z.number().int().min(0).max(1000),
  defaultSuggestedQty: z.number().int().min(1).max(100_000),
  note: z.string().trim().max(120).nullable().optional(),
});

const PutSchema = z.object({
  relations: z.array(RelationSchema).max(MAX_ITEM_RELATIONS_PER_SOURCE),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const source = await prisma.item.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!source) return jsonError(404, "Not found");

  const relations = await prisma.itemRelatedItem.findMany({
    where: { sourceItemId: id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      relatedItemId: true,
      kind: true,
      sortOrder: true,
      defaultSuggestedQty: true,
      note: true,
      relatedItem: {
        select: {
          id: true,
          name: true,
          isActive: true,
          internalOnly: true,
        },
      },
    },
  });

  return jsonOk({ relations });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }

  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  const source = await prisma.item.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!source) return jsonError(404, "Not found");

  const validation = validateItemRelationsForReplace({
    sourceItemId: id,
    relations: parsed.data.relations,
  });
  if (!validation.ok) {
    return jsonError(400, validation.message);
  }

  try {
    await prisma.$transaction(async (tx) => {
      await replaceItemRelations({
        db: tx,
        sourceItemId: id,
        relations: parsed.data.relations.map((row) => ({
          relatedItemId: row.relatedItemId,
          kind: row.kind,
          sortOrder: row.sortOrder,
          defaultSuggestedQty: row.defaultSuggestedQty,
          note: row.note ?? null,
        })),
      });
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message === "RELATED_ITEM_NOT_FOUND") {
      return jsonError(400, "Связанная позиция не найдена");
    }
    return jsonError(400, message || "Не удалось сохранить связи");
  }

  return jsonOk({ ok: true });
}
