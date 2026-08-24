import { WorkTaskPriority } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { parseDateOnlyToUtcMidnight } from "@/server/dates";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { notifyWorkTaskAssigned } from "@/server/work-task-notifications";
import { appendWorkTaskActivity } from "@/server/work-task-activity";
import { serializeWorkTaskCard, workTaskCardSelect } from "@/server/work-task-data";
import { nextTaskSortOrder, parseTimeToMinutes } from "@/server/work-tasks";

const CreateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().max(5000).optional().nullable(),
    assigneeUserId: z.string().trim().min(1).optional().nullable(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional().nullable(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional().nullable(),
    dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u).optional().nullable(),
    reminderAt: z.string().datetime({ offset: true }).optional().nullable(),
    reminderText: z.string().trim().max(1000).optional().nullable(),
    priority: z.nativeEnum(WorkTaskPriority).optional(),
    color: z.string().trim().max(40).optional().nullable(),
    projectId: z.string().trim().min(1).optional().nullable(),
    orderId: z.string().trim().min(1).optional().nullable(),
  })
  .strict();

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: columnId } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const parsed = CreateTaskSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  const column = await prisma.workTaskColumn.findUnique({
    where: { id: columnId },
    select: { id: true, boardId: true },
  });
  if (!column) return jsonError(404, "Колонка не найдена");

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.workTask.create({
      data: {
        boardId: column.boardId,
        columnId,
        title: parsed.data.title,
        description: parsed.data.description || null,
        assigneeUserId: parsed.data.assigneeUserId || null,
        startDate: parsed.data.startDate ? parseDateOnlyToUtcMidnight(parsed.data.startDate) : null,
        dueDate: parsed.data.dueDate ? parseDateOnlyToUtcMidnight(parsed.data.dueDate) : null,
        dueTimeMinutes: parseTimeToMinutes(parsed.data.dueTime),
        reminderAt: parsed.data.reminderAt ? new Date(parsed.data.reminderAt) : null,
        reminderText: parsed.data.reminderText || null,
        priority: parsed.data.priority ?? WorkTaskPriority.NORMAL,
        priorityStickerEnabled: Boolean(parsed.data.priority && parsed.data.priority !== WorkTaskPriority.NORMAL),
        priorityStickerConfigured: Boolean(parsed.data.priority && parsed.data.priority !== WorkTaskPriority.NORMAL),
        deadlineStickerEnabled: Boolean(parsed.data.startDate || parsed.data.dueDate || parsed.data.dueTime),
        reminderStickerEnabled: Boolean(parsed.data.reminderAt),
        assigneeStickerEnabled: Boolean(parsed.data.assigneeUserId),
        color: parsed.data.color || null,
        projectId: parsed.data.projectId || null,
        orderId: parsed.data.orderId || null,
        sortOrder: await nextTaskSortOrder(tx, columnId),
        createdById: auth.user.id,
      },
      select: workTaskCardSelect,
    });
    await appendWorkTaskActivity(tx, {
      taskId: created.id,
      actorUserId: auth.user.id,
      kind: "CREATED",
      message: "Создана задача",
    });
    return tx.workTask.findUniqueOrThrow({ where: { id: created.id }, select: workTaskCardSelect });
  });

  scheduleAfterResponse("notifyWorkTaskAssigned", async () => {
    await notifyWorkTaskAssigned({ taskId: task.id, actorUserId: auth.user.id });
  });

  return jsonOk({
    task: serializeWorkTaskCard(task),
  });
}
