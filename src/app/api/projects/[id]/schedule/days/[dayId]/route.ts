import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { assertProjectEditable } from "@/server/projects/project-guard";

const PatchSchema = z
  .object({
    dateNote: z.string().trim().min(1).max(500).optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
  })
  .strict();

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; dayId: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId, dayId } = await ctx.params;
  if (!projectId?.trim() || !dayId?.trim()) return jsonError(400, "Invalid id");

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

  const day = await prisma.projectScheduleDay.findFirst({
    where: { id: dayId, projectId },
    select: { id: true },
  });
  if (!day) return jsonError(404, "День не найден");

  const updated = await prisma.projectScheduleDay.update({
    where: { id: dayId },
    data: {
      ...(parsed.data.dateNote !== undefined ? { dateNote: parsed.data.dateNote } : {}),
      ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
    },
  });

  return jsonOk({ day: updated });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; dayId: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId, dayId } = await ctx.params;
  if (!projectId?.trim() || !dayId?.trim()) return jsonError(400, "Invalid id");

  const guard = await assertProjectEditable(projectId);
  if (!guard.ok) return jsonError(guard.status, guard.message);

  const day = await prisma.projectScheduleDay.findFirst({
    where: { id: dayId, projectId },
    select: { id: true },
  });
  if (!day) return jsonError(404, "День не найден");

  await prisma.projectScheduleDay.delete({ where: { id: dayId } });
  return jsonOk({ ok: true });
}
