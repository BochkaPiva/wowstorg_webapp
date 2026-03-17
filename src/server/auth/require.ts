import { jsonError } from "@/server/http";
import { getCurrentUser, PublicUser } from "@/server/auth/session";

export async function requireUser(): Promise<
  | { ok: true; user: PublicUser }
  | { ok: false; response: Response }
> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, response: jsonError(401, "Unauthorized") };
  }
  return { ok: true, user };
}

export async function requireRole(
  role: PublicUser["role"],
): Promise<
  | { ok: true; user: PublicUser }
  | { ok: false; response: Response }
> {
  const res = await requireUser();
  if (!res.ok) return res;
  if (res.user.role !== role) {
    return { ok: false, response: jsonError(403, "Forbidden") };
  }
  return res;
}

