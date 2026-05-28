import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const column = await prisma.workTaskColumn.findUnique({
    where: { id },
    select: { id: true, isDone: true },
  });
  if (!column) return jsonError(404, "Колонка не найдена");
  if (!column.isDone) return jsonError(400, "Архивировать можно только задачи из колонки завершения");

  const result = await prisma.workTask.updateMany({
    where: {
      columnId: id,
      completedAt: { not: null },
      archivedAt: null,
    },
    data: { archivedAt: new Date() },
  });

  return jsonOk({ archivedCount: result.count });
}
