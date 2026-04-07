import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { assertProjectEditable } from "@/server/projects/project-guard";

const PostDaySchema = z
  .object({
    dateNote: z.string().trim().min(1).max(500),
    sortOrder: z.number().int().min(0).max(10000).optional(),
  })
  .strict();

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId } = await ctx.params;
  if (!projectId?.trim()) return jsonError(400, "Invalid id");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) return jsonError(404, "Проект не найден");

  const days = await prisma.projectScheduleDay.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
    include: {
      slots: { orderBy: { sortOrder: "asc" } },
    },
  });

  return jsonOk({
    days: days.map((d) => ({
      id: d.id,
      sortOrder: d.sortOrder,
      dateNote: d.dateNote,
      slots: d.slots.map((s) => ({
        id: s.id,
        sortOrder: s.sortOrder,
        intervalText: s.intervalText,
        description: s.description,
      })),
    })),
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId } = await ctx.params;
  if (!projectId?.trim()) return jsonError(400, "Invalid id");

  const guard = await assertProjectEditable(projectId);
  if (!guard.ok) return jsonError(guard.status, guard.message);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const parsed = PostDaySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  let sortOrder = parsed.data.sortOrder;
  if (sortOrder === undefined) {
    const agg = await prisma.projectScheduleDay.aggregate({
      where: { projectId },
      _max: { sortOrder: true },
    });
    sortOrder = (agg._max.sortOrder ?? -1) + 1;
  }

  const day = await prisma.projectScheduleDay.create({
    data: {
      projectId,
      sortOrder,
      dateNote: parsed.data.dateNote.trim(),
    },
  });

  scheduleAfterResponse("notifyProjectScheduleCreated", async () => {
    const { notifyProjectNoisyBlock } = await import("@/server/projects/project-notifications");
    await notifyProjectNoisyBlock({
      projectId,
      actorUserId: auth.user.id,
      block: "schedule",
      action: `Добавлен день тайминга «${day.dateNote}».`,
    });
  });

  return jsonOk({ day: { id: day.id, sortOrder: day.sortOrder, dateNote: day.dateNote, slots: [] } });
}
