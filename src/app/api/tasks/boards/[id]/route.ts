import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { dateOnlyOrNull } from "@/server/work-tasks";

const PatchBoardSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(1000).optional().nullable(),
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
  const board = await prisma.workTaskBoard.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      isDefault: true,
      columns: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          color: true,
          sortOrder: true,
          isDone: true,
          tasks: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            take: 200,
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
          },
        },
      },
    },
  });

  if (!board) return jsonError(404, "Доска не найдена");

  return jsonOk({
    board: {
      ...board,
      columns: board.columns.map((column) => ({
        ...column,
        tasks: column.tasks.map((task) => ({
          ...task,
          dueDate: dateOnlyOrNull(task.dueDate),
          createdAt: task.createdAt.toISOString(),
          checklistDone: task.checklistItems.filter((item) => item.isDone).length,
          checklistTotal: task.checklistItems.length,
        })),
      })),
    },
  });
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

  const parsed = PatchBoardSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  const board = await prisma.workTaskBoard.update({
    where: { id },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description || null } : {}),
      ...(parsed.data.archived !== undefined ? { archivedAt: parsed.data.archived ? new Date() : null } : {}),
    },
    select: { id: true, title: true, description: true, archivedAt: true },
  });

  return jsonOk({ board });
}
