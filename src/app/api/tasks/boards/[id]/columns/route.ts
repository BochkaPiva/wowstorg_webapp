import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { nextColumnSortOrder } from "@/server/work-tasks";

const CreateColumnSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    color: z.string().trim().max(40).optional().nullable(),
    isDone: z.boolean().optional(),
  })
  .strict();

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: boardId } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const parsed = CreateColumnSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  const board = await prisma.workTaskBoard.findUnique({ where: { id: boardId }, select: { id: true } });
  if (!board) return jsonError(404, "Доска не найдена");

  const column = await prisma.workTaskColumn.create({
    data: {
      boardId,
      title: parsed.data.title,
      color: parsed.data.color || null,
      isDone: parsed.data.isDone ?? false,
      sortOrder: await nextColumnSortOrder(prisma, boardId),
      createdById: auth.user.id,
    },
    select: { id: true },
  });

  return jsonOk({ column });
}

