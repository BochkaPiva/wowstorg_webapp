import { hash } from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";

const BodySchema = z.object({
  login: z.string().trim().min(1).max(128),
  password: z.string().min(6).max(512),
  passwordConfirm: z.string().min(6).max(512),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  const { login, password, passwordConfirm } = parsed.data;
  if (password !== passwordConfirm) {
    return jsonError(400, "Пароли не совпадают");
  }

  const user = await prisma.user.findUnique({
    where: { login },
    select: { id: true, isActive: true, mustSetPassword: true },
  });
  if (!user) return jsonError(400, "Неверные данные для первой авторизации");
  if (!user.isActive) return jsonError(403, "Аккаунт отключен администратором");
  if (!user.mustSetPassword) return jsonError(400, "Первая авторизация уже выполнена");

  const passwordHash = await hash(password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mustSetPassword: false,
      passwordSetAt: new Date(),
    },
  });
  return jsonOk({ ok: true });
}

