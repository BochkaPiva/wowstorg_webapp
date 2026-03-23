import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonOk } from "@/server/http";
import {
  getGreenwichAchievementsSnapshot,
  recomputeGreenwichAchievements,
} from "@/server/achievements/service";

export async function GET() {
  const auth = await requireRole("GREENWICH");
  if (!auth.ok) return auth.response;

  await prisma.$transaction(async (tx) => {
    await recomputeGreenwichAchievements(tx, auth.user.id);
  });
  const data = await getGreenwichAchievementsSnapshot(prisma, auth.user.id);
  return jsonOk(data);
}
