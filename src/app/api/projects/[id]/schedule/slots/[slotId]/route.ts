import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { assertProjectEditable } from "@/server/projects/project-guard";

const PatchSchema = z
  .object({
    intervalText: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(10000).optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
  })
  .strict();

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; slotId: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId, slotId } = await ctx.params;
  if (!projectId?.trim() || !slotId?.trim()) return jsonError(400, "Invalid id");

  const guard = await assertProjectEditable(projectId);
  if (!guard.ok) return jsonError(guard.status, guard.message);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  const slot = await prisma.projectScheduleSlot.findFirst({
    where: { id: slotId, day: { projectId } },
    select: { id: true },
  });
  if (!slot) return jsonError(404, "Слот не найден");

  const updated = await prisma.projectScheduleSlot.update({
    where: { id: slotId },
    data: {
      ...(parsed.data.intervalText !== undefined ? { intervalText: parsed.data.intervalText } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
    },
  });

  return jsonOk({ slot: updated });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; slotId: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId, slotId } = await ctx.params;
  if (!projectId?.trim() || !slotId?.trim()) return jsonError(400, "Invalid id");

  const guard = await assertProjectEditable(projectId);
  if (!guard.ok) return jsonError(guard.status, guard.message);

  const slot = await prisma.projectScheduleSlot.findFirst({
    where: { id: slotId, day: { projectId } },
    select: { id: true },
  });
  if (!slot) return jsonError(404, "Слот не найден");

  await prisma.projectScheduleSlot.delete({ where: { id: slotId } });
  return jsonOk({ ok: true });
}
