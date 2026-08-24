import { WorkTaskPriority } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { parseDateOnlyToUtcMidnight } from "@/server/dates";
import { jsonError, jsonOk } from "@/server/http";
import { appendWorkTaskActivity } from "@/server/work-task-activity";
import { dateOnlyOrNull } from "@/server/work-tasks";
import { nextChecklistSortOrder } from "@/server/work-tasks";

const CreateChecklistItemSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    parentId: z.string().trim().min(1).optional().nullable(),
    description: z.string().trim().max(3000).optional().nullable(),
    assigneeUserId: z.string().trim().min(1).optional().nullable(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional().nullable(),
    reminderAt: z.string().datetime({ offset: true }).optional().nullable(),
    priority: z.nativeEnum(WorkTaskPriority).optional(),
    color: z.string().trim().max(40).optional().nullable(),
  })
  .strict();

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: taskId } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const parsed = CreateChecklistItemSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  const task = await prisma.workTask.findUnique({ where: { id: taskId }, select: { id: true } });
  if (!task) return jsonError(404, "Задача не найдена");

  const parentId = parsed.data.parentId || null;
  if (parentId) {
    const parent = await prisma.workTaskChecklistItem.findFirst({
      where: { id: parentId, taskId },
      select: { id: true },
    });
    if (!parent) return jsonError(404, "Родительская подзадача не найдена");
  }

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.workTaskChecklistItem.create({
      data: {
        taskId,
        parentId,
        title: parsed.data.title,
        description: parsed.data.description || null,
        assigneeUserId: parsed.data.assigneeUserId || null,
        dueDate: parsed.data.dueDate ? parseDateOnlyToUtcMidnight(parsed.data.dueDate) : null,
        reminderAt: parsed.data.reminderAt ? new Date(parsed.data.reminderAt) : null,
        priority: parsed.data.priority ?? WorkTaskPriority.NORMAL,
        color: parsed.data.color || null,
        sortOrder: await nextChecklistSortOrder(tx, taskId, parentId),
        createdById: auth.user.id,
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
    await appendWorkTaskActivity(tx, {
      taskId,
      actorUserId: auth.user.id,
      kind: "SUBTASK_CREATED",
      message: `Создана подзадача «${created.title}»`,
      metadata: { checklistItemId: created.id },
    });
    return created;
  });

  return jsonOk({
    item: {
      ...item,
      dueDate: dateOnlyOrNull(item.dueDate),
      reminderAt: item.reminderAt?.toISOString() ?? null,
      completedAt: item.completedAt?.toISOString() ?? null,
      updatedAt: item.updatedAt.toISOString(),
    },
  });
}
