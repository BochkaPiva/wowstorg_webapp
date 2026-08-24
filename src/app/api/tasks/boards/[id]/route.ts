import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { serializeWorkTaskCard, workTaskCardSelect } from "@/server/work-task-data";

const PatchBoardSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(1000).optional().nullable(),
    archived: z.boolean().optional(),
  })
  .strict();

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const searchParams = new URL(req.url).searchParams;
  const projectId = searchParams.get("projectId")?.trim() || null;
  const includeClosedProjectTasks = searchParams.get("includeClosedProjectTasks") === "1";
  const archived = searchParams.get("archived") === "1";
  const visibleTaskWhere: Prisma.WorkTaskWhereInput = projectId
    ? { projectId }
    : includeClosedProjectTasks
      ? {}
      : {
          OR: [
            { projectId: null },
            {
              project: {
                archivedAt: null,
                status: { notIn: ["COMPLETED", "CANCELLED"] },
              },
            },
          ],
        };
  const taskWhere: Prisma.WorkTaskWhereInput = {
    AND: [
      visibleTaskWhere,
      archived ? { archivedAt: { not: null } } : { archivedAt: null },
    ],
  };

  const board = await prisma.workTaskBoard.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      isDefault: true,
      updatedAt: true,
      columns: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          color: true,
          sortOrder: true,
          isDone: true,
          updatedAt: true,
          tasks: {
            where: taskWhere,
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            take: 200,
            select: workTaskCardSelect,
          },
        },
      },
    },
  });

  if (!board) return jsonError(404, "Доска не найдена");

  const syncTime = Math.max(
    board.updatedAt.getTime(),
    ...board.columns.flatMap((column) => [
      column.updatedAt.getTime(),
      ...column.tasks.flatMap((task) => [
        task.updatedAt.getTime(),
        ...task.checklistItems.map((item) => item.updatedAt.getTime()),
        task.activities[0]?.createdAt.getTime() ?? 0,
      ]),
    ]),
  );

  return jsonOk({
    board: {
      ...board,
      updatedAt: board.updatedAt.toISOString(),
      syncToken: new Date(syncTime).toISOString(),
      columns: board.columns.map((column) => ({
        ...column,
        updatedAt: column.updatedAt.toISOString(),
        tasks: column.tasks.map(serializeWorkTaskCard),
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
