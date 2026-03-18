import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

const UpdateSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});

/** Обновить заказчика. Только WOWSTORG. */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) return jsonError(404, "Заказчик не найден");

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;

  const updated = await prisma.customer.update({
    where: { id },
    data,
    select: { id: true, name: true, isActive: true, notes: true },
  });

  return jsonOk({ customer: updated });
}
