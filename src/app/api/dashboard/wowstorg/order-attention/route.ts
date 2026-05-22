import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

const ORDER_STALE_BLOCK_KEY = "dashboard-order-stale";

const BodySchema = z.object({
  orderId: z.string().min(1),
  days: z.number().int().min(1).max(30).default(7),
});

export async function POST(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid body", parsed.error.flatten());

  const order = await prisma.order.findUnique({
    where: { id: parsed.data.orderId },
    select: { id: true, status: true },
  });
  if (!order) return jsonError(404, "Order not found");
  if (order.status === "CLOSED" || order.status === "CANCELLED") {
    return jsonError(409, "Order is not active");
  }

  const muteUntil = new Date(Date.now() + parsed.data.days * 24 * 60 * 60 * 1000);
  try {
    await prisma.orderNotificationCooldown.upsert({
      where: {
        orderId_blockKey: {
          orderId: order.id,
          blockKey: ORDER_STALE_BLOCK_KEY,
        },
      },
      create: {
        orderId: order.id,
        blockKey: ORDER_STALE_BLOCK_KEY,
        muteUntil,
      },
      update: {
        muteUntil,
      },
    });
  } catch (error) {
    console.error("[dashboard] Failed to persist order attention mute", error);
    return jsonError(503, "Order snooze is temporarily unavailable");
  }

  return jsonOk({ ok: true, muteUntil: muteUntil.toISOString() });
}
