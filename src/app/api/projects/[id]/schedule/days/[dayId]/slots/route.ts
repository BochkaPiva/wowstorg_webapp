import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { assertProjectEditable } from "@/server/projects/project-guard";

const PostSchema = z
  .object({
    intervalText: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(10000),
    sortOrder: z.number().int().min(0).max(10000).optional(),
  })
  .strict();

export async function POST(
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

  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  const day = await prisma.projectScheduleDay.findFirst({
    where: { id: dayId, projectId },
    select: { id: true },
  });
  if (!day) return jsonError(404, "День не найден");

  let sortOrder = parsed.data.sortOrder;
  if (sortOrder === undefined) {
    const agg = await prisma.projectScheduleSlot.aggregate({
      where: { dayId },
      _max: { sortOrder: true },
    });
    sortOrder = (agg._max.sortOrder ?? -1) + 1;
  }

  const slot = await prisma.projectScheduleSlot.create({
    data: {
      dayId,
      sortOrder,
      intervalText: parsed.data.intervalText.trim(),
      description: parsed.data.description.trim(),
    },
  });

  return jsonOk({ slot });
}
