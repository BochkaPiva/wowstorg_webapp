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

const DraftSlotSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    sortOrder: z.number().int().min(0).max(10000),
    intervalText: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(5000),
  })
  .strict();

const SaveDraftSchema = z
  .object({
    days: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).optional(),
            sortOrder: z.number().int().min(0).max(10000),
            dateNote: z.string().trim().min(1).max(500),
            slots: z.array(DraftSlotSchema).max(1000),
          })
          .strict(),
      )
      .max(365),
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

export async function PATCH(
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

  const parsed = SaveDraftSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  await prisma.$transaction(async (tx) => {
    const existingDays = await tx.projectScheduleDay.findMany({
      where: { projectId },
      include: {
        slots: {
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    const existingDayMap = new Map(existingDays.map((day) => [day.id, day]));
    const keptDayIds = new Set(
      parsed.data.days
        .map((day) => day.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        .filter((id) => existingDayMap.has(id)),
    );

    for (const day of existingDays) {
      if (!keptDayIds.has(day.id)) {
        await tx.projectScheduleDay.delete({ where: { id: day.id } });
      }
    }

    for (const dayDraft of parsed.data.days.sort((a, b) => a.sortOrder - b.sortOrder)) {
      const existingDay =
        dayDraft.id && existingDayMap.has(dayDraft.id) ? existingDayMap.get(dayDraft.id)! : null;

      const savedDay = existingDay
        ? await tx.projectScheduleDay.update({
            where: { id: existingDay.id },
            data: {
              sortOrder: dayDraft.sortOrder,
              dateNote: dayDraft.dateNote.trim(),
            },
          })
        : await tx.projectScheduleDay.create({
            data: {
              projectId,
              sortOrder: dayDraft.sortOrder,
              dateNote: dayDraft.dateNote.trim(),
            },
          });

      const existingSlotMap = new Map((existingDay?.slots ?? []).map((slot) => [slot.id, slot]));
      const keptSlotIds = new Set(
        dayDraft.slots
          .map((slot) => slot.id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
          .filter((id) => existingSlotMap.has(id)),
      );

      for (const slot of existingDay?.slots ?? []) {
        if (!keptSlotIds.has(slot.id)) {
          await tx.projectScheduleSlot.delete({ where: { id: slot.id } });
        }
      }

      for (const slotDraft of dayDraft.slots.sort((a, b) => a.sortOrder - b.sortOrder)) {
        const slotData = {
          dayId: savedDay.id,
          sortOrder: slotDraft.sortOrder,
          intervalText: slotDraft.intervalText.trim(),
          description: slotDraft.description.trim(),
        };

        if (slotDraft.id && existingSlotMap.has(slotDraft.id)) {
          await tx.projectScheduleSlot.update({
            where: { id: slotDraft.id },
            data: slotData,
          });
        } else {
          await tx.projectScheduleSlot.create({ data: slotData });
        }
      }
    }
  });

  scheduleAfterResponse("notifyProjectScheduleDraftSaved", async () => {
    const { notifyProjectNoisyBlock } = await import("@/server/projects/project-notifications");
    await notifyProjectNoisyBlock({
      projectId,
      actorUserId: auth.user.id,
      block: "schedule",
      action: "Сохранён черновик тайминга проекта.",
    });
  });

  return jsonOk({ ok: true });
}
