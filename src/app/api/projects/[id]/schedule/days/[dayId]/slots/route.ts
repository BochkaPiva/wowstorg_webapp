import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { assertProjectEditable } from "@/server/projects/project-guard";

const PostSchema = z
  .object({
    intervalText: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(10000),
    sortOrder: z.number().int().min(0).max(10000).optional(),
  })
  .strict();

function parseIntervalMinutes(intervalText: string): { from: number; to: number } | null {
  const t = intervalText.trim().replace(/\s+/g, "");
  const m = /^(\d{2}):(\d{2})[–-](\d{2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h1 = Number(m[1]);
  const m1 = Number(m[2]);
  const h2 = Number(m[3]);
  const m2 = Number(m[4]);
  const ok =
    [h1, m1, h2, m2].every((x) => Number.isFinite(x)) &&
    h1 >= 0 &&
    h1 <= 23 &&
    h2 >= 0 &&
    h2 <= 23 &&
    m1 >= 0 &&
    m1 <= 59 &&
    m2 >= 0 &&
    m2 <= 59;
  if (!ok) return null;
  const from = h1 * 60 + m1;
  const to = h2 * 60 + m2;
  return { from, to };
}

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

  const interval = parseIntervalMinutes(parsed.data.intervalText);
  if (!interval) {
    return jsonError(400, "Интервал должен быть в формате ЧЧ:ММ–ЧЧ:ММ");
  }
  if (interval.to <= interval.from) {
    return jsonError(400, "Интервал должен идти вперёд (например 09:00–10:30)");
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

  scheduleAfterResponse("notifyProjectScheduleSlotCreated", async () => {
    const { notifyProjectNoisyBlock } = await import("@/server/projects/project-notifications");
    await notifyProjectNoisyBlock({
      projectId,
      actorUserId: auth.user.id,
      block: "schedule",
      action: `Добавлен слот тайминга ${slot.intervalText}.`,
    });
  });

  return jsonOk({ slot });
}
