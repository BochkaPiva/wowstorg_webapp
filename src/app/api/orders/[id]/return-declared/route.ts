import { z } from "zod";

import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { declareOrderReturn } from "@/server/orders/declare-return";

const ConditionSchema = z.enum(["OK", "DIRTY", "NEEDS_REPAIR", "BROKEN", "MISSING"]);
const DeclareBody = z.object({
  lines: z.array(z.object({
    orderLineId: z.string().min(1),
    comment: z.string().trim().max(2000).optional(),
    splits: z.array(z.object({
      condition: ConditionSchema,
      qty: z.number().int().min(0),
    })).min(1),
  })).min(1),
}).optional();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = undefined;
  }
  const parsed = DeclareBody.safeParse(body);
  if (!parsed.success) return jsonError(400, "Некорректные данные возврата", parsed.error.flatten());

  const result = await declareOrderReturn({
    orderId: id,
    actor: { userId: auth.user.id, role: auth.user.role },
    lines: parsed.data?.lines,
  });
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : result.code === "FORBIDDEN" ? 403 : result.code === "CONFLICT" ? 409 : 400;
    return jsonError(status, result.message);
  }

  const fullOrder = result.order;
  type NotifyReturn = typeof import("@/server/notifications/order-notifications").notifyReturnDeclared;
  const payload = fullOrder as Parameters<NotifyReturn>[0];
  scheduleAfterResponse("notifyReturnDeclared", async () => {
    const { notifyReturnDeclared } = await import("@/server/notifications/order-notifications");
    const { notifyWarehouseOrderInApp } = await import("@/server/notifications/in-app");
    await notifyReturnDeclared(payload);
    await notifyWarehouseOrderInApp({
      orderId: fullOrder.id,
      title: "Заявка ожидает приёмки",
      body: `Заказчик: ${fullOrder.customer?.name ?? "—"}`,
    });
  });

  return jsonOk({ ok: true });
}
