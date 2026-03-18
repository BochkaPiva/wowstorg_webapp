import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonOk } from "@/server/http";

/**
 * Список сотрудников Greenwich для выбора «заявка на кого» при создании заказа складом.
 * Доступно только WOWSTORG.
 */
export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const users = await prisma.user.findMany({
    where: { role: "GREENWICH", isActive: true },
    orderBy: [{ displayName: "asc" }],
    select: { id: true, displayName: true },
  });

  return jsonOk({ users });
}
