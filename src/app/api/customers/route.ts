import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole, requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { findCustomerByIdentity, normalizeCustomerName } from "@/server/customers/identity";

export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const all = url.searchParams.get("all") === "true" && auth.user.role === "WOWSTORG";

  const customers = await prisma.customer.findMany({
    where: all ? undefined : { isActive: true, mergedIntoId: null },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      isActive: true,
      notes: true,
      logoKey: true,
      logoUpdatedAt: true,
      mergedInto: { select: { id: true, name: true } },
      _count: { select: { orders: true, projects: true, standaloneEstimates: true, aliases: true } },
    },
    take: 1000,
  });

  return jsonOk({
    customers: customers.map((c) =>
      all
        ? {
            id: c.id,
            name: c.name,
            isActive: c.isActive,
            notes: c.notes,
            mergedInto: c.mergedInto,
            counts: c._count,
            logoUrl: c.logoKey ? `/api/customers/${c.id}/logo?v=${c.logoUpdatedAt?.getTime() ?? 0}` : null,
          }
        : {
            id: c.id,
            name: c.name,
            logoUrl: c.logoKey ? `/api/customers/${c.id}/logo?v=${c.logoUpdatedAt?.getTime() ?? 0}` : null,
          },
    ),
  });
}

const CreateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  notes: z.string().trim().max(2000).optional(),
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

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  const name = parsed.data.name.trim();
  const normalizedName = normalizeCustomerName(name);
  if (!normalizedName) return jsonError(400, "Название должно содержать буквы или цифры");

  try {
    const customer = await prisma.$transaction(async (tx) => {
      const existing = await findCustomerByIdentity(tx, name, { includeInactive: true });
      if (existing) throw new Error(`CUSTOMER_DUPLICATE:${existing.id}:${existing.name}`);
      return tx.customer.create({
        data: { name, normalizedName, notes: parsed.data.notes },
        select: { id: true, name: true, logoKey: true, logoUpdatedAt: true },
      });
    });

    return jsonOk({
      customer: {
        id: customer.id,
        name: customer.name,
        logoUrl: customer.logoKey
          ? `/api/customers/${customer.id}/logo?v=${customer.logoUpdatedAt?.getTime() ?? 0}`
          : null,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("CUSTOMER_DUPLICATE:")) {
      const [, customerId, ...nameParts] = error.message.split(":");
      return jsonError(409, `Заказчик «${nameParts.join(":")}» уже существует`, { customerId });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonError(409, "Заказчик с таким названием уже существует");
    }
    throw error;
  }
}

