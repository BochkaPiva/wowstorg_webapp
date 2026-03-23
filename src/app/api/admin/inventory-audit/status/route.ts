import { requireRole } from "@/server/auth/require";
import { jsonOk } from "@/server/http";
import { getLatestInventoryAuditStatus } from "@/server/inventory-audit";

export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const status = await getLatestInventoryAuditStatus();
  return jsonOk({ status });
}

