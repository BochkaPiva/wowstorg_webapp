import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

/** Список всех пользователей (без passwordHash). Только WOWSTORG. */
export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  try {
    const users = await prisma.user.findMany({
      orderBy: [{ role: "asc" }, { displayName: "asc" }],
      select: {
        id: true,
        login: true,
        displayName: true,
        role: true,
        isActive: true,
        mustSetPassword: true,
        createdAt: true,
      },
    });

    // Prisma Client может быть старым и не уметь select telegramChatId.
    // Подтягиваем значения напрямую из БД одним запросом.
    const telegramRows = (await prisma.$queryRaw<
      Array<{ id: string; telegramChatId: string | null }>
    >`SELECT "id", "telegramChatId" FROM "User"`) ?? [];
    const telegramById = new Map(telegramRows.map((r) => [r.id, r.telegramChatId]));

    const userIds = users.map((u) => u.id);
    let ratingRows:
      | Array<{ userId: string; score: number; manualLocked: boolean }>
      | Array<{ userId: string; score: number }> = [];

    if (userIds.length) {
      try {
        ratingRows = await prisma.$queryRaw<
          Array<{ userId: string; score: number; manualLocked: boolean }>
        >`SELECT "userId", "score", "manualLocked" FROM "GreenwichRating" WHERE "userId" = ANY(${userIds}::text[])`;
      } catch {
        // Если миграция с колонкой manualLocked ещё не применена, не ломаем админку.
        ratingRows = await prisma.$queryRaw<
          Array<{ userId: string; score: number }>
        >`SELECT "userId", "score" FROM "GreenwichRating" WHERE "userId" = ANY(${userIds}::text[])`;
      }
    }

    const ratingByUserId = new Map(
      (ratingRows as Array<{ userId: string; score: number; manualLocked?: boolean }>).map((r) => [
        r.userId,
        { score: r.score, manualLocked: r.manualLocked ?? false },
      ]),
    );

    return jsonOk({
      users: users.map((u) => ({
        ...u,
        telegramChatId: telegramById.get(u.id) ?? null,
        greenwichRating: ratingByUserId.get(u.id) ?? null,
        createdAt: u.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error("[GET /api/admin/users]", e);
    const message = e instanceof Error ? e.message : "Ошибка загрузки пользователей";
    return jsonError(500, message);
  }
}

const CreateSchema = z.object({
  login: z.string().trim().min(1).max(128),
  displayName: z.string().trim().min(1).max(200),
  role: z.enum(["GREENWICH", "WOWSTORG"]),
  telegramChatId: z.string().trim().max(64).optional(),
  isActive: z.boolean().optional(),
});

/** Создать пользователя. Только WOWSTORG. */
export async function POST(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  const { login, displayName, role, telegramChatId, isActive } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { login } });
  if (existing) return jsonError(400, "Пользователь с таким логином уже существует");

  const tempSecret = `first-login:${randomUUID()}`;
  const passwordHash = await hash(tempSecret, 10);
  const user = await prisma.user.create({
    data: {
      login,
      passwordHash,
      mustSetPassword: true,
      passwordSetAt: null,
      displayName,
      role,
      isActive: isActive ?? true,
    },
    select: {
      id: true,
      login: true,
      displayName: true,
      role: true,
      isActive: true,
      mustSetPassword: true,
      createdAt: true,
    },
  });

  if (telegramChatId) {
    await prisma.$executeRaw`
      UPDATE "User"
      SET "telegramChatId" = ${telegramChatId}
      WHERE "id" = ${user.id}
    `;
  }

  return jsonOk({
    user: { ...user, telegramChatId: telegramChatId || null, createdAt: user.createdAt.toISOString() },
  });
}
