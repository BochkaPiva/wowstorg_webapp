import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

const PatchColumnSchema = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    color: z.string().trim().max(40).optional().nullable(),
    sortOrder: z.number().int().optional(),
    isDone: z.boolean().optional(),
  })
  .strict();

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const parsed = PatchColumnSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  const column = await prisma.workTaskColumn.update({
    where: { id },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.color !== undefined ? { color: parsed.data.color || null } : {}),
      ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
      ...(parsed.data.isDone !== undefined ? { isDone: parsed.data.isDone } : {}),
    },
    select: { id: true },
  });

  return jsonOk({ column });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const taskCount = await prisma.workTask.count({ where: { columnId: id } });
  if (taskCount > 0) return jsonError(400, "Нельзя удалить колонку с задачами");

  await prisma.workTaskColumn.delete({ where: { id } });
  return jsonOk({ ok: true });
}

