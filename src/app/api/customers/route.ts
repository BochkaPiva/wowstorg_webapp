import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole, requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const all = url.searchParams.get("all") === "true" && auth.user.role === "WOWSTORG";

  const customers = await prisma.customer.findMany({
    where: all ? undefined : { isActive: true },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, isActive: true, notes: true, logoKey: true, logoUpdatedAt: true },
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

  const customer = await prisma.customer.create({
    data: { name: parsed.data.name, notes: parsed.data.notes },
    select: { id: true, name: true, logoKey: true, logoUpdatedAt: true },
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
}

