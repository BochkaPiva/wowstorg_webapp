import { requireRole } from "@/server/auth/require";
import { buildOperationsDashboard } from "@/server/dashboard/operations";
import { jsonOk } from "@/server/http";
import { getOrSetRuntimeCache } from "@/server/runtime-cache";

export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const data = await getOrSetRuntimeCache(`dash:wowstorg:operations:${auth.user.id}`, 12_000, () =>
    buildOperationsDashboard(auth.user.id),
  );

  return jsonOk(data);
}
