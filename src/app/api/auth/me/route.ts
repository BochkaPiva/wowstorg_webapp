import { jsonOk } from "@/server/http";
import { getCurrentUser } from "@/server/auth/session";

export async function GET() {
  const user = await getCurrentUser();
  return jsonOk({ user });
}

