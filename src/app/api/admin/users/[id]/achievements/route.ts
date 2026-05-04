import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { getGreenwichAchievementsSnapshot } from "@/server/achievements/service";

/** Чтение снимка ачивок пользователя для админки. Только WOWSTORG. Данные — из БД (пересчёт на событиях заявок). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { role: true },
  });
  if (!user) return jsonError(404, "Пользователь не найден");

  if (user.role !== "GREENWICH") {
    return jsonOk({
      applicable: false as const,
      cards: [],
      unreadNotifications: 0,
    });
  }

  const data = await getGreenwichAchievementsSnapshot(prisma, id);
  return jsonOk({
    applicable: true as const,
    ...data,
  });
}
