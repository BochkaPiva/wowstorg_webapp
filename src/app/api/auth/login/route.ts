import { compare } from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { createSession } from "@/server/auth/session";

const BodySchema = z.object({
  login: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(512),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  const { login, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { login } });
  if (!user || !user.isActive) {
    return jsonError(401, "Wrong credentials");
  }
  if (user.mustSetPassword) {
    return jsonError(403, "FIRST_LOGIN_REQUIRED");
  }

  const ok = await compare(password, user.passwordHash);
  if (!ok) {
    return jsonError(401, "Wrong credentials");
  }

  await createSession(user.id);

  return jsonOk({
    user: {
      id: user.id,
      login: user.login,
      displayName: user.displayName,
      role: user.role,
    },
  });
}

