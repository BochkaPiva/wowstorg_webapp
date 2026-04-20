import { z } from "zod";

import { deleteOrdersForCleanup, OrderCleanupError } from "@/server/admin/order-cleanup";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

const BodySchema = z.object({
  orderIds: z.array(z.string().trim().min(1)).min(1).max(200),
  confirmation: z.literal("DELETE"),
});

export async function POST(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Некорректные данные для удаления", parsed.error.flatten());
  }

  try {
    const result = await deleteOrdersForCleanup(parsed.data.orderIds);
    return jsonOk(result);
  } catch (error) {
    if (error instanceof OrderCleanupError) {
      return jsonError(error.status, error.message, error.details);
    }
    console.error("[POST /api/admin/order-cleanup/delete]", error);
    return jsonError(500, "Не удалось удалить выбранные заявки");
  }
}
