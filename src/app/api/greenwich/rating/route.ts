import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { getOrSetRuntimeCache } from "@/server/runtime-cache";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "GREENWICH") {
    return jsonError(403, "Доступно только для сотрудников Greenwich");
  }

  const data = await getOrSetRuntimeCache(`greenwich:rating:${auth.user.id}`, 15_000, async () => {
    const row = await prisma.greenwichRating.findUnique({
      where: { userId: auth.user.id },
      select: { score: true },
    });
    return { score: row?.score ?? 100 };
  });
  return jsonOk(data);
}
