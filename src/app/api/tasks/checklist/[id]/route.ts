import { WorkTaskPriority } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { parseDateOnlyToUtcMidnight } from "@/server/dates";
import { jsonError, jsonOk } from "@/server/http";
import { appendWorkTaskActivity } from "@/server/work-task-activity";
import { dateOnlyOrNull } from "@/server/work-tasks";

const PatchChecklistItemSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().trim().max(3000).optional().nullable(),
    assigneeUserId: z.string().trim().min(1).optional().nullable(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional().nullable(),
    reminderAt: z.string().datetime({ offset: true }).optional().nullable(),
    priority: z.nativeEnum(WorkTaskPriority).optional(),
    color: z.string().trim().max(40).optional().nullable(),
    isDone: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
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

  const parsed = PatchChecklistItemSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  const previous = await prisma.workTaskChecklistItem.findUnique({
    where: { id },
    select: { id: true, taskId: true, title: true, isDone: true },
  });
  if (!previous) return jsonError(404, "Подзадача не найдена");

  const item = await prisma.$transaction(async (tx) => {
    const updated = await tx.workTaskChecklistItem.update({
      where: { id },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description || null } : {}),
        ...(parsed.data.assigneeUserId !== undefined ? { assigneeUserId: parsed.data.assigneeUserId || null } : {}),
        ...(parsed.data.dueDate !== undefined ? { dueDate: parsed.data.dueDate ? parseDateOnlyToUtcMidnight(parsed.data.dueDate) : null } : {}),
        ...(parsed.data.reminderAt !== undefined ? { reminderAt: parsed.data.reminderAt ? new Date(parsed.data.reminderAt) : null } : {}),
        ...(parsed.data.priority !== undefined ? { priority: parsed.data.priority } : {}),
        ...(parsed.data.color !== undefined ? { color: parsed.data.color || null } : {}),
        ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
        ...(parsed.data.isDone !== undefined
          ? { isDone: parsed.data.isDone, completedAt: parsed.data.isDone ? new Date() : null }
          : {}),
      },
      select: {
        id: true,
        parentId: true,
        title: true,
        description: true,
        isDone: true,
        sortOrder: true,
        priority: true,
        color: true,
        dueDate: true,
        reminderAt: true,
        completedAt: true,
        updatedAt: true,
        assignee: { select: { id: true, displayName: true } },
      },
    });
    const toggled = parsed.data.isDone !== undefined && parsed.data.isDone !== previous.isDone;
    await appendWorkTaskActivity(tx, {
      taskId: previous.taskId,
      actorUserId: auth.user.id,
      kind: toggled ? (parsed.data.isDone ? "SUBTASK_COMPLETED" : "SUBTASK_REOPENED") : "SUBTASK_UPDATED",
      message: toggled
        ? parsed.data.isDone
          ? `Подзадача «${updated.title}» выполнена`
          : `Подзадача «${updated.title}» возвращена в работу`
        : `Обновлена подзадача «${updated.title}»`,
      metadata: { checklistItemId: updated.id },
    });
    return updated;
  });

  return jsonOk({ item: {
    ...item,
    dueDate: dateOnlyOrNull(item.dueDate),
    reminderAt: item.reminderAt?.toISOString() ?? null,
    completedAt: item.completedAt?.toISOString() ?? null,
    updatedAt: item.updatedAt.toISOString(),
  } });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const item = await prisma.workTaskChecklistItem.findUnique({
    where: { id },
    select: { taskId: true, title: true },
  });
  if (!item) return jsonError(404, "Подзадача не найдена");
  await prisma.$transaction(async (tx) => {
    await tx.workTaskChecklistItem.delete({ where: { id } });
    await appendWorkTaskActivity(tx, {
      taskId: item.taskId,
      actorUserId: auth.user.id,
      kind: "SUBTASK_DELETED",
      message: `Удалена подзадача «${item.title}»`,
      metadata: { checklistItemId: id },
    });
  });
  return jsonOk({ ok: true });
}
