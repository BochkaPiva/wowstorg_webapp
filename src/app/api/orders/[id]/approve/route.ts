import { z } from "zod";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { approveGreenwichEstimate } from "@/server/orders/approve-estimate";

const BodySchema = z.object({
  lines: z.array(z.object({
    orderLineId: z.string().min(1),
    approvedQty: z.number().int().min(0),
  })).optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("GREENWICH");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  const result = await approveGreenwichEstimate({
    orderId: id,
    greenwichUserId: auth.user.id,
    lines: parsed.data.lines,
  });
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : result.code === "FORBIDDEN" ? 403 : result.code === "CONFLICT" ? 409 : 400;
    return jsonError(status, result.message);
  }

  const fullOrder = result.order;
  type Fn = typeof import("@/server/notifications/order-notifications").notifyEstimateApproved;
  const payload = fullOrder as Parameters<Fn>[0];
  scheduleAfterResponse("notifyEstimateApproved", async () => {
    const { notifyEstimateApproved } = await import("@/server/notifications/order-notifications");
    const { notifyWarehouseOrderInApp } = await import("@/server/notifications/in-app");
    await notifyEstimateApproved(payload);
    await notifyWarehouseOrderInApp({
      orderId: fullOrder.id,
      title: "Смета согласована",
      body: `Заказчик: ${fullOrder.customer?.name ?? "—"}`,
    });
  });

  return jsonOk({ ok: true });
}
