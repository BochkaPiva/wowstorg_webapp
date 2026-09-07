import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { findCustomerByIdentity, normalizeCustomerName } from "@/server/customers/identity";

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

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id } });
      if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
      if (customer.mergedIntoId) throw new Error("CUSTOMER_ALREADY_MERGED");

      const data: Prisma.CustomerUpdateInput = {};
      if (parsed.data.name !== undefined) {
        const name = parsed.data.name.trim();
        const normalizedName = normalizeCustomerName(name);
        if (!normalizedName) throw new Error("CUSTOMER_NAME_INVALID");
        const conflict = await findCustomerByIdentity(tx, name, {
          excludeCustomerId: id,
          includeInactive: true,
        });
        if (conflict) throw new Error(`CUSTOMER_DUPLICATE:${conflict.id}:${conflict.name}`);

        const oldNormalizedName = customer.normalizedName ?? normalizeCustomerName(customer.name);
        data.name = name;
        data.normalizedName = normalizedName;
        if (oldNormalizedName && oldNormalizedName !== normalizedName) {
          const existingAlias = await tx.customerAlias.findFirst({
            where: { customerId: id, name: customer.name },
          });
          if (!existingAlias) {
            await tx.customerAlias.create({
              data: { customerId: id, name: customer.name, normalizedName: oldNormalizedName },
            });
          }
        }
      }
      if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;
      if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;

      return tx.customer.update({
        where: { id },
        data,
        select: { id: true, name: true, isActive: true, notes: true, logoKey: true, logoUpdatedAt: true },
      });
    });

    return jsonOk({
      customer: {
        id: updated.id,
        name: updated.name,
        isActive: updated.isActive,
        notes: updated.notes,
        logoUrl: updated.logoKey
          ? `/api/customers/${updated.id}/logo?v=${updated.logoUpdatedAt?.getTime() ?? 0}`
          : null,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CUSTOMER_NOT_FOUND") return jsonError(404, "Заказчик не найден");
    if (error instanceof Error && error.message === "CUSTOMER_ALREADY_MERGED") return jsonError(409, "Карточка уже объединена с другим заказчиком");
    if (error instanceof Error && error.message === "CUSTOMER_NAME_INVALID") return jsonError(400, "Название должно содержать буквы или цифры");
    if (error instanceof Error && error.message.startsWith("CUSTOMER_DUPLICATE:")) {
      const [, customerId, ...nameParts] = error.message.split(":");
      return jsonError(409, `Заказчик «${nameParts.join(":")}» уже существует`, { customerId });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonError(409, "Заказчик или алиас с таким названием уже существует");
    }
    throw error;
  }
}
