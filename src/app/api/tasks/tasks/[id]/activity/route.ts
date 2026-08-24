import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { appendWorkTaskActivity, serializeWorkTaskActivity } from "@/server/work-task-activity";

const CommentSchema = z.object({
  message: z.string().trim().min(1).max(4000),
}).strict();

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const task = await prisma.workTask.findUnique({ where: { id }, select: { id: true } });
  if (!task) return jsonError(404, "Задача не найдена");
  const activities = await prisma.workTaskActivity.findMany({
    where: { taskId: id },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      kind: true,
      message: true,
      metadata: true,
      createdAt: true,
      actor: { select: { id: true, displayName: true } },
    },
  });
  return jsonOk({ activities: activities.map(serializeWorkTaskActivity) });
}

export async function POST(
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
    return jsonError(400, "Некорректный JSON");
  }
  const parsed = CommentSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Напишите короткую заметку", parsed.error.flatten());
  const task = await prisma.workTask.findUnique({ where: { id }, select: { id: true } });
  if (!task) return jsonError(404, "Задача не найдена");
  const activity = await appendWorkTaskActivity(prisma, {
    taskId: id,
    actorUserId: auth.user.id,
    kind: "COMMENT",
    message: parsed.data.message,
  });
  return jsonOk({ activity: serializeWorkTaskActivity(activity) });
}
