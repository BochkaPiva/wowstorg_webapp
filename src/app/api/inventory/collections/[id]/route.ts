import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

const UpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  slug: z.string().trim().min(1).max(128).regex(/^[a-z0-9-]+$/).optional(),
  order: z.number().int().min(0).optional(),
  itemIds: z.array(z.string().min(1)).optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  const category = await prisma.category.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      order: true,
      items: { select: { itemId: true, item: { select: { id: true, name: true, isActive: true } } } },
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!category) return jsonError(404, "Not found");

  const items = await prisma.item.findMany({
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, isActive: true },
  });

  return jsonOk({
    collection: {
      id: category.id,
      name: category.name,
      description: null,
      isActive: true,
      slug: category.slug,
      order: category.order,
      items: category.items.map((i) => ({ itemId: i.itemId, position: 0, item: i.item })),
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    },
    items,
  });
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

  const existing = await prisma.category.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return jsonError(404, "Not found");

  if (parsed.data.slug != null) {
    const dup = await prisma.category.findFirst({ where: { slug: parsed.data.slug, id: { not: id } }, select: { id: true } });
    if (dup) return jsonError(400, "Категория с таким slug уже есть");
  }

  await prisma.$transaction(async (tx) => {
    await tx.category.update({
      where: { id },
      data: {
        ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
        ...(parsed.data.slug != null ? { slug: parsed.data.slug } : {}),
        ...(parsed.data.order != null ? { order: parsed.data.order } : {}),
      },
    });

    if (parsed.data.itemIds) {
      await tx.itemCategory.deleteMany({ where: { categoryId: id } });
      if (parsed.data.itemIds.length) {
        await tx.itemCategory.createMany({
          data: parsed.data.itemIds.map((itemId) => ({ categoryId: id, itemId })),
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
  await prisma.category.delete({ where: { id } }).catch(() => null);
  return jsonOk({ ok: true });
}

