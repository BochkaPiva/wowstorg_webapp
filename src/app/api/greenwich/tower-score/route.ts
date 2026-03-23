import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { recomputeGreenwichAchievements } from "@/server/achievements/service";

const BodySchema = z.object({
  score: z.number().int().min(0).max(10000),
});

export async function POST(req: Request) {
  const auth = await requireRole("GREENWICH");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  const score = parsed.data.score;

  await prisma.$transaction(async (tx) => {
    const current = await tx.userTowerStats.findUnique({
      where: { userId: auth.user.id },
      select: { bestScore: true },
    });
    const bestScore = Math.max(current?.bestScore ?? 0, score);

    await tx.userTowerStats.upsert({
      where: { userId: auth.user.id },
      update: {
        lastScore: score,
        bestScore,
      },
      create: {
        userId: auth.user.id,
        lastScore: score,
        bestScore,
      },
    });

    await recomputeGreenwichAchievements(tx, auth.user.id);
  });

  return jsonOk({ ok: true });
}
