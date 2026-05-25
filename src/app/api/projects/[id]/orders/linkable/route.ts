import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { listLinkableProjectOrders } from "@/server/projects/link-project-orders";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId } = await ctx.params;
  if (!projectId?.trim()) return jsonError(400, "Invalid id");

  const orders = await listLinkableProjectOrders(projectId);
  if (orders == null) return jsonError(404, "Проект не найден");

  return jsonOk({ orders });
}
