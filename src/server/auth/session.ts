import crypto from "node:crypto";
import { cookies } from "next/headers";

import { prisma } from "@/server/db";

const COOKIE_NAME = "wowstorg_session";

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export type PublicUser = {
  id: string;
  login: string;
  displayName: string;
  role: "GREENWICH" | "WOWSTORG";
};

export async function getSessionCookieToken() {
  const jar = await cookies();
  return jar.get(COOKIE_NAME)?.value ?? null;
}

export async function createSession(userId: string) {
  const token = randomToken();
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days

  await prisma.session.create({
    data: { userId, tokenHash, expiresAt },
  });

  const jar = await cookies();
  jar.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const token = await getSessionCookieToken();
  if (token) {
    const tokenHash = sha256Hex(token);
    await prisma.session.deleteMany({ where: { tokenHash } });
  }

  const jar = await cookies();
  jar.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

export async function getCurrentUser(): Promise<PublicUser | null> {
  const token = await getSessionCookieToken();
  if (!token) return null;

  const tokenHash = sha256Hex(token);
  const session = await prisma.session.findFirst({
    where: { tokenHash, expiresAt: { gt: new Date() } },
    include: { user: true },
  });
  if (!session) return null;
  if (!session.user.isActive) return null;

  return {
    id: session.user.id,
    login: session.user.login,
    displayName: session.user.displayName,
    role: session.user.role,
  };
}

