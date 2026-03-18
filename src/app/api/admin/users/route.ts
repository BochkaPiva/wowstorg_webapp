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
        createdAt: true,
      },
    });

    // Prisma Client может быть старым и не уметь select telegramChatId.
    // Подтягиваем значения напрямую из БД одним запросом.
    const telegramRows = (await prisma.$queryRaw<
      Array<{ id: string; telegramChatId: string | null }>
    >`SELECT "id", "telegramChatId" FROM "User"`) ?? [];
    const telegramById = new Map(telegramRows.map((r) => [r.id, r.telegramChatId]));

    return jsonOk({
      users: users.map((u) => ({
        ...u,
        telegramChatId: telegramById.get(u.id) ?? null,
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
  password: z.string().min(6).max(512),
  displayName: z.string().trim().min(1).max(200),
  role: z.enum(["GREENWICH", "WOWSTORG"]),
  telegramChatId: z.string().trim().max(64).optional(),
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

  const { login, password, displayName, role, telegramChatId } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { login } });
  if (existing) return jsonError(400, "Пользователь с таким логином уже существует");

  const passwordHash = await hash(password, 10);
  const user = await prisma.user.create({
    data: {
      login,
      passwordHash,
      displayName,
      role,
    },
    select: {
      id: true,
      login: true,
      displayName: true,
      role: true,
      isActive: true,
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
