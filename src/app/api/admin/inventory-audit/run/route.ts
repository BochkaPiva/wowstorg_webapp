import { requireRole } from "@/server/auth/require";
import { jsonOk } from "@/server/http";
import { runInventoryAudit } from "@/server/inventory-audit";

export async function POST() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const result = await runInventoryAudit({
    kind: "MANUAL",
    createdByUserId: auth.user.id,
  });
  return jsonOk(result);
}

