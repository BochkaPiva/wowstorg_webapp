import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { assertProjectEditable } from "@/server/projects/project-guard";

const PatchSchema = z
  .object({
    intervalText: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(10000).optional(),
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

  if (parsed.data.intervalText !== undefined) {
    const interval = parseIntervalMinutes(parsed.data.intervalText);
    if (!interval) {
      return jsonError(400, "Интервал должен быть в формате ЧЧ:ММ–ЧЧ:ММ");
    }
    if (interval.to <= interval.from) {
      return jsonError(400, "Интервал должен идти вперёд (например 09:00–10:30)");
    }
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

  scheduleAfterResponse("notifyProjectScheduleSlotUpdated", async () => {
    const { notifyProjectNoisyBlock } = await import("@/server/projects/project-notifications");
    await notifyProjectNoisyBlock({
      projectId,
      actorUserId: auth.user.id,
      block: "schedule",
      action: `Обновлён слот тайминга ${updated.intervalText}.`,
    });
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
  scheduleAfterResponse("notifyProjectScheduleSlotDeleted", async () => {
    const { notifyProjectNoisyBlock } = await import("@/server/projects/project-notifications");
    await notifyProjectNoisyBlock({
      projectId,
      actorUserId: auth.user.id,
      block: "schedule",
      action: "Удалён слот тайминга проекта.",
    });
  });
  return jsonOk({ ok: true });
}
