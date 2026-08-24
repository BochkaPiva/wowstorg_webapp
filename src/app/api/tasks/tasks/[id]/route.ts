import { WorkTaskPriority } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { parseDateOnlyToUtcMidnight } from "@/server/dates";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { notifyWorkTaskAssigned, notifyWorkTaskStatusChanged } from "@/server/work-task-notifications";
import { appendWorkTaskActivity, serializeWorkTaskActivity } from "@/server/work-task-activity";
import { serializeWorkTaskCard, workTaskCardSelect } from "@/server/work-task-data";
import { nextTaskSortOrder, parseTimeToMinutes } from "@/server/work-tasks";

const PatchTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    description: z.string().trim().max(5000).optional().nullable(),
    assigneeUserId: z.string().trim().min(1).optional().nullable(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional().nullable(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional().nullable(),
    dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u).optional().nullable(),
    reminderAt: z.string().datetime({ offset: true }).optional().nullable(),
    reminderText: z.string().trim().max(1000).optional().nullable(),
    priority: z.nativeEnum(WorkTaskPriority).optional(),
    priorityStickerEnabled: z.boolean().optional(),
    priorityStickerConfigured: z.boolean().optional(),
    deadlineStickerEnabled: z.boolean().optional(),
    reminderStickerEnabled: z.boolean().optional(),
    assigneeStickerEnabled: z.boolean().optional(),
    color: z.string().trim().max(40).optional().nullable(),
    projectId: z.string().trim().min(1).optional().nullable(),
    orderId: z.string().trim().min(1).optional().nullable(),
    columnId: z.string().trim().min(1).optional(),
    sortOrder: z.number().int().optional(),
    completed: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .strict();

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const task = await prisma.workTask.findUnique({
    where: { id },
    select: {
      ...workTaskCardSelect,
      column: { select: { id: true, title: true, isDone: true } },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          kind: true,
          message: true,
          metadata: true,
          createdAt: true,
          actor: { select: { id: true, displayName: true } },
        },
      },
    },
  });
  if (!task) return jsonError(404, "Задача не найдена");
  const activities = task.activities.map(serializeWorkTaskActivity);
  return jsonOk({ task: { ...serializeWorkTaskCard(task), activities } });
}

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

  const parsed = PatchTaskSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  const previousTask = await prisma.workTask.findUnique({
    where: { id },
    select: {
      title: true,
      description: true,
      assigneeUserId: true,
      startDate: true,
      dueDate: true,
      dueTimeMinutes: true,
      reminderAt: true,
      reminderText: true,
      priority: true,
      color: true,
      projectId: true,
      orderId: true,
      completedAt: true,
      archivedAt: true,
      column: { select: { id: true, title: true } },
    },
  });
  if (!previousTask) return jsonError(404, "Задача не найдена");

  let boardId: string | undefined;
  let nextColumnTitle: string | undefined;
  let sortOrder = parsed.data.sortOrder;
  if (parsed.data.columnId) {
    const column = await prisma.workTaskColumn.findUnique({
      where: { id: parsed.data.columnId },
      select: { id: true, boardId: true, title: true },
    });
    if (!column) return jsonError(404, "Колонка не найдена");
    boardId = column.boardId;
    nextColumnTitle = column.title;
    if (sortOrder === undefined) sortOrder = await nextTaskSortOrder(prisma, column.id);
  }

  const task = await prisma.$transaction(async (tx) => {
    await tx.workTask.update({
      where: { id },
      data: {
        ...(boardId ? { boardId } : {}),
        ...(parsed.data.columnId !== undefined ? { columnId: parsed.data.columnId } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description || null } : {}),
        ...(parsed.data.assigneeUserId !== undefined ? {
          assigneeUserId: parsed.data.assigneeUserId || null,
          ...(parsed.data.assigneeUserId ? { assigneeStickerEnabled: true } : {}),
        } : {}),
        ...(parsed.data.startDate !== undefined ? {
          startDate: parsed.data.startDate ? parseDateOnlyToUtcMidnight(parsed.data.startDate) : null,
          ...(parsed.data.startDate ? { deadlineStickerEnabled: true } : {}),
        } : {}),
        ...(parsed.data.dueDate !== undefined ? {
          dueDate: parsed.data.dueDate ? parseDateOnlyToUtcMidnight(parsed.data.dueDate) : null,
          ...(parsed.data.dueDate ? { deadlineStickerEnabled: true } : {}),
        } : {}),
        ...(parsed.data.dueTime !== undefined ? {
          dueTimeMinutes: parseTimeToMinutes(parsed.data.dueTime),
          ...(parsed.data.dueTime ? { deadlineStickerEnabled: true } : {}),
        } : {}),
        ...(parsed.data.reminderAt !== undefined ? {
          reminderAt: parsed.data.reminderAt ? new Date(parsed.data.reminderAt) : null,
          ...(parsed.data.reminderAt ? { reminderStickerEnabled: true } : {}),
        } : {}),
        ...(parsed.data.reminderText !== undefined ? { reminderText: parsed.data.reminderText || null } : {}),
        ...(parsed.data.priority !== undefined ? {
          priority: parsed.data.priority,
          priorityStickerEnabled: true,
          priorityStickerConfigured: true,
        } : {}),
        ...(parsed.data.priorityStickerEnabled !== undefined ? { priorityStickerEnabled: parsed.data.priorityStickerEnabled } : {}),
        ...(parsed.data.priorityStickerConfigured !== undefined ? { priorityStickerConfigured: parsed.data.priorityStickerConfigured } : {}),
        ...(parsed.data.deadlineStickerEnabled !== undefined ? { deadlineStickerEnabled: parsed.data.deadlineStickerEnabled } : {}),
        ...(parsed.data.reminderStickerEnabled !== undefined ? { reminderStickerEnabled: parsed.data.reminderStickerEnabled } : {}),
        ...(parsed.data.assigneeStickerEnabled !== undefined ? { assigneeStickerEnabled: parsed.data.assigneeStickerEnabled } : {}),
        ...(parsed.data.priorityStickerEnabled === false ? { priority: WorkTaskPriority.NORMAL, priorityStickerConfigured: false } : {}),
        ...(parsed.data.deadlineStickerEnabled === false ? { startDate: null, dueDate: null, dueTimeMinutes: null } : {}),
        ...(parsed.data.reminderStickerEnabled === false ? { reminderAt: null, reminderText: null } : {}),
        ...(parsed.data.assigneeStickerEnabled === false ? { assigneeUserId: null } : {}),
        ...(parsed.data.color !== undefined ? { color: parsed.data.color || null } : {}),
        ...(parsed.data.projectId !== undefined ? { projectId: parsed.data.projectId || null } : {}),
        ...(parsed.data.orderId !== undefined ? { orderId: parsed.data.orderId || null } : {}),
        ...(parsed.data.completed !== undefined ? { completedAt: parsed.data.completed ? new Date() : null } : {}),
        ...(parsed.data.archived !== undefined ? { archivedAt: parsed.data.archived ? new Date() : null } : {}),
      },
    });

    if (parsed.data.columnId && parsed.data.columnId !== previousTask.column.id && nextColumnTitle) {
      await appendWorkTaskActivity(tx, {
        taskId: id,
        actorUserId: auth.user.id,
        kind: "MOVED",
        message: `Перемещено: ${previousTask.column.title} → ${nextColumnTitle}`,
        metadata: { fromColumnId: previousTask.column.id, toColumnId: parsed.data.columnId },
      });
    }
    if (parsed.data.completed !== undefined && parsed.data.completed !== Boolean(previousTask.completedAt)) {
      await appendWorkTaskActivity(tx, {
        taskId: id,
        actorUserId: auth.user.id,
        kind: parsed.data.completed ? "COMPLETED" : "REOPENED",
        message: parsed.data.completed ? "Задача выполнена" : "Задача возвращена в работу",
      });
    }
    if (parsed.data.archived !== undefined && parsed.data.archived !== Boolean(previousTask.archivedAt)) {
      await appendWorkTaskActivity(tx, {
        taskId: id,
        actorUserId: auth.user.id,
        kind: parsed.data.archived ? "ARCHIVED" : "RESTORED",
        message: parsed.data.archived ? "Задача помещена в архив" : "Задача восстановлена из архива",
      });
    }
    const updatedFields = [
      parsed.data.title !== undefined && parsed.data.title !== previousTask.title ? "название" : null,
      parsed.data.description !== undefined && (parsed.data.description || null) !== previousTask.description ? "описание" : null,
      parsed.data.assigneeUserId !== undefined && (parsed.data.assigneeUserId || null) !== previousTask.assigneeUserId ? "исполнитель" : null,
      parsed.data.startDate !== undefined ? "дата начала" : null,
      parsed.data.dueDate !== undefined ? "дедлайн" : null,
      parsed.data.dueTime !== undefined ? "время дедлайна" : null,
      parsed.data.reminderAt !== undefined ? "напоминание" : null,
      parsed.data.reminderText !== undefined ? "текст напоминания" : null,
      parsed.data.priority !== undefined && parsed.data.priority !== previousTask.priority ? "приоритет" : null,
      parsed.data.color !== undefined && (parsed.data.color || null) !== previousTask.color ? "цвет" : null,
      parsed.data.projectId !== undefined && (parsed.data.projectId || null) !== previousTask.projectId ? "проект" : null,
      parsed.data.orderId !== undefined && (parsed.data.orderId || null) !== previousTask.orderId ? "заявка" : null,
    ].filter((value): value is string => Boolean(value));
    if (updatedFields.length > 0) {
      await appendWorkTaskActivity(tx, {
        taskId: id,
        actorUserId: auth.user.id,
        kind: "UPDATED",
        message: `Обновлено: ${updatedFields.join(", ")}`,
        metadata: { fields: updatedFields },
      });
    }
    return tx.workTask.findUniqueOrThrow({ where: { id }, select: workTaskCardSelect });
  });

  if (
    parsed.data.assigneeUserId !== undefined &&
    parsed.data.assigneeUserId &&
    parsed.data.assigneeUserId !== previousTask.assigneeUserId
  ) {
    scheduleAfterResponse("notifyWorkTaskAssigned", async () => {
      await notifyWorkTaskAssigned({ taskId: task.id, actorUserId: auth.user.id });
    });
  }

  if (parsed.data.columnId && parsed.data.columnId !== previousTask.column.id && nextColumnTitle) {
    scheduleAfterResponse("notifyWorkTaskStatusChanged", async () => {
      await notifyWorkTaskStatusChanged({
        taskId: task.id,
        actorUserId: auth.user.id,
        fromColumnTitle: previousTask.column.title,
        toColumnTitle: nextColumnTitle,
      });
    });
  }

  return jsonOk({ task: serializeWorkTaskCard(task) });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  await prisma.workTask.delete({ where: { id } });
  return jsonOk({ ok: true });
}
