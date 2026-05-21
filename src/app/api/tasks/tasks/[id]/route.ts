import { WorkTaskPriority } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { parseDateOnlyToUtcMidnight } from "@/server/dates";
import { jsonError, jsonOk } from "@/server/http";
import { nextTaskSortOrder } from "@/server/work-tasks";

const PatchTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    description: z.string().trim().max(5000).optional().nullable(),
    assigneeUserId: z.string().trim().min(1).optional().nullable(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional().nullable(),
    priority: z.nativeEnum(WorkTaskPriority).optional(),
    color: z.string().trim().max(40).optional().nullable(),
    projectId: z.string().trim().min(1).optional().nullable(),
    orderId: z.string().trim().min(1).optional().nullable(),
    columnId: z.string().trim().min(1).optional(),
    sortOrder: z.number().int().optional(),
    completed: z.boolean().optional(),
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

  const parsed = PatchTaskSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  let boardId: string | undefined;
  let sortOrder = parsed.data.sortOrder;
  if (parsed.data.columnId) {
    const column = await prisma.workTaskColumn.findUnique({
      where: { id: parsed.data.columnId },
      select: { id: true, boardId: true },
    });
    if (!column) return jsonError(404, "Колонка не найдена");
    boardId = column.boardId;
    if (sortOrder === undefined) sortOrder = await nextTaskSortOrder(prisma, column.id);
  }

  const task = await prisma.workTask.update({
    where: { id },
    data: {
      ...(boardId ? { boardId } : {}),
      ...(parsed.data.columnId !== undefined ? { columnId: parsed.data.columnId } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description || null } : {}),
      ...(parsed.data.assigneeUserId !== undefined ? { assigneeUserId: parsed.data.assigneeUserId || null } : {}),
      ...(parsed.data.dueDate !== undefined ? { dueDate: parsed.data.dueDate ? parseDateOnlyToUtcMidnight(parsed.data.dueDate) : null } : {}),
      ...(parsed.data.priority !== undefined ? { priority: parsed.data.priority } : {}),
      ...(parsed.data.color !== undefined ? { color: parsed.data.color || null } : {}),
      ...(parsed.data.projectId !== undefined ? { projectId: parsed.data.projectId || null } : {}),
      ...(parsed.data.orderId !== undefined ? { orderId: parsed.data.orderId || null } : {}),
      ...(parsed.data.completed !== undefined ? { completedAt: parsed.data.completed ? new Date() : null } : {}),
    },
    select: { id: true },
  });

  return jsonOk({ task });
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

