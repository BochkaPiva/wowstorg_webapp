import { WorkTaskPriority } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { parseDateOnlyToUtcMidnight } from "@/server/dates";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { notifyWorkTaskAssigned } from "@/server/work-task-notifications";
import { dateOnlyOrNull, nextTaskSortOrder } from "@/server/work-tasks";

const CreateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().max(5000).optional().nullable(),
    assigneeUserId: z.string().trim().min(1).optional().nullable(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional().nullable(),
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

  const task = await prisma.workTask.create({
    data: {
      boardId: column.boardId,
      columnId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      assigneeUserId: parsed.data.assigneeUserId || null,
      dueDate: parsed.data.dueDate ? parseDateOnlyToUtcMidnight(parsed.data.dueDate) : null,
      priority: parsed.data.priority ?? WorkTaskPriority.NORMAL,
      color: parsed.data.color || null,
      projectId: parsed.data.projectId || null,
      orderId: parsed.data.orderId || null,
      sortOrder: await nextTaskSortOrder(prisma, columnId),
      createdById: auth.user.id,
    },
    select: {
      id: true,
      title: true,
      description: true,
      priority: true,
      color: true,
      sortOrder: true,
      dueDate: true,
      completedAt: true,
      createdAt: true,
      assignee: { select: { id: true, displayName: true } },
      project: { select: { id: true, title: true } },
      order: { select: { id: true, eventName: true, customer: { select: { name: true } } } },
      checklistItems: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          isDone: true,
          sortOrder: true,
        },
      },
    },
  });

  scheduleAfterResponse("notifyWorkTaskAssigned", async () => {
    await notifyWorkTaskAssigned({ taskId: task.id, actorUserId: auth.user.id });
  });

  return jsonOk({
    task: {
      ...task,
      dueDate: dateOnlyOrNull(task.dueDate),
      createdAt: task.createdAt.toISOString(),
      completedAt: task.completedAt?.toISOString() ?? null,
      checklistDone: task.checklistItems.filter((item) => item.isDone).length,
      checklistTotal: task.checklistItems.length,
    },
  });
}
