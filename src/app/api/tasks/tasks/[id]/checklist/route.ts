import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { nextChecklistSortOrder } from "@/server/work-tasks";

const CreateChecklistItemSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
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

  const item = await prisma.workTaskChecklistItem.create({
    data: {
      taskId,
      title: parsed.data.title,
      sortOrder: await nextChecklistSortOrder(prisma, taskId),
      createdById: auth.user.id,
    },
    select: { id: true },
  });

  return jsonOk({ item });
}

