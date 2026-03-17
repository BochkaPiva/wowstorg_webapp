import { jsonOk } from "@/server/http";
import { destroySession } from "@/server/auth/session";

export async function POST() {
  await destroySession();
  return jsonOk({ ok: true });
}

