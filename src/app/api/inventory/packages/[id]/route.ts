import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

const UpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  isActive: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        itemId: z.string().min(1),
        defaultQty: z.number().int().min(0),
      }),
    )
    .optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  const kit = await prisma.kit.findUnique({
    where: { id },
    include: {
      lines: { orderBy: [{ defaultQty: "desc" }], include: { item: { select: { id: true, name: true, isActive: true } } } },
    },
  });
  if (!kit) return jsonError(404, "Not found");

  const items = await prisma.item.findMany({
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      isActive: true,
      total: true,
      inRepair: true,
      broken: true,
      missing: true,
    },
  });

  const itemsWithAvailable = items.map((i) => {
    const available = Math.max(0, i.total - i.inRepair - i.broken - i.missing);
    return { ...i, available };
  });

  return jsonOk({ kit, items: itemsWithAvailable });
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

  const existing = await prisma.kit.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return jsonError(404, "Not found");

  if (parsed.data.lines) {
    const itemIds = [...new Set(parsed.data.lines.map((l) => l.itemId))];
    const items = await prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, total: true, inRepair: true, broken: true, missing: true },
    });
    const availableById = new Map(
      items.map((i) => [
        i.id,
        Math.max(0, i.total - i.inRepair - i.broken - i.missing),
      ])
    );
    for (const line of parsed.data.lines.filter((l) => l.defaultQty > 0)) {
      const available = availableById.get(line.itemId) ?? 0;
      if (line.defaultQty > available) {
        return jsonError(
          400,
          `Количество по позиции превышает доступное на складе (макс. ${available})`
        );
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.kit.update({
      where: { id },
      data: {
        ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.isActive != null ? { isActive: parsed.data.isActive } : {}),
      },
    });

    if (parsed.data.lines) {
      await tx.kitLine.deleteMany({ where: { kitId: id } });
      const lines = parsed.data.lines.filter((l) => l.defaultQty > 0);
      if (lines.length) {
        await tx.kitLine.createMany({
          data: lines.map((l) => ({ kitId: id, itemId: l.itemId, defaultQty: l.defaultQty })),
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
  await prisma.kit.delete({ where: { id } }).catch(() => null);
  return jsonOk({ ok: true });
}

