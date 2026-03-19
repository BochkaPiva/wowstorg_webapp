import { hash } from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

const UpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(200).optional(),
  role: z.enum(["GREENWICH", "WOWSTORG"]).optional(),
  telegramChatId: z.string().trim().max(64).nullable().optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).max(512).optional(),
  // Ручная правка рейтинга Greenwich.
  // Если задано `greenwichRatingAuto=true` — выключаем ручную блокировку и применяем авто-пересчёт.
  // Если задано `greenwichRatingScore` — ставим manualLocked=true и фиксируем score.
  greenwichRatingScore: z.number().int().min(0).max(100).optional(),
  greenwichRatingAuto: z.boolean().optional(),
});

/** Обновить пользователя. Только WOWSTORG. */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  try {
    const { id } = await ctx.params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, "Invalid JSON");
    }
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return jsonError(404, "Пользователь не найден");

    const data: Record<string, unknown> = {};
    if (parsed.data.displayName !== undefined) data.displayName = parsed.data.displayName;
    if (parsed.data.role !== undefined) data.role = parsed.data.role;
    if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
    if (parsed.data.password !== undefined) {
      data.passwordHash = await hash(parsed.data.password, 10);
    }

    const telegramChatId = parsed.data.telegramChatId;

    // Prisma Client может быть старым (EPERM на generate) и не знать поле telegramChatId.
    // Поэтому обновляем его отдельным SQL при необходимости.
    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        login: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (telegramChatId !== undefined) {
      await prisma.$executeRaw`
        UPDATE "User"
        SET "telegramChatId" = ${telegramChatId}
        WHERE "id" = ${id}
      `;
    }

    if (
      parsed.data.greenwichRatingScore !== undefined ||
      parsed.data.greenwichRatingAuto === true
    ) {
      if (updated.role !== "GREENWICH") {
        return jsonError(400, "Рейтинг доступен только пользователям роли GREENWICH");
      }

      const orders = await prisma.order.findMany({
        where: { greenwichUserId: id },
        select: {
          greenwichRatingOverdueDelta: true,
          greenwichRatingIncidentsDelta: true,
        },
      });

      const sum = orders.reduce(
        (s, o) => s + o.greenwichRatingOverdueDelta + o.greenwichRatingIncidentsDelta,
        0,
      );

      const clamp0to100 = (n: number) => Math.max(0, Math.min(100, n));
      const base = 100 + sum;

      const score = parsed.data.greenwichRatingAuto === true
        ? clamp0to100(base)
        : clamp0to100(parsed.data.greenwichRatingScore ?? base);

      const manualLocked = parsed.data.greenwichRatingAuto === true ? false : true;

      await prisma.$executeRaw`
        INSERT INTO "GreenwichRating" ("userId", "score", "manualLocked", "updatedAt")
        VALUES (${id}, ${score}, ${manualLocked}, NOW())
        ON CONFLICT ("userId") DO UPDATE
        SET "score" = EXCLUDED."score",
            "manualLocked" = EXCLUDED."manualLocked",
            "updatedAt" = NOW()
      `;
    }

    const telegramRow = (await prisma.$queryRaw<
      Array<{ telegramChatId: string | null }>
    >`SELECT "telegramChatId" FROM "User" WHERE "id" = ${id} LIMIT 1`)?.[0];

    return jsonOk({
      user: {
        ...updated,
        telegramChatId: telegramRow?.telegramChatId ?? null,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (e) {
    console.error("[PATCH /api/admin/users/[id]]", e);
    const message = e instanceof Error ? e.message : "Ошибка сохранения";
    return jsonError(500, message);
  }
}
