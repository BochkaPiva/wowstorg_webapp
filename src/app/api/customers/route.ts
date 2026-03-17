import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole, requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const customers = await prisma.customer.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true },
    take: 1000,
  });

  return jsonOk({ customers });
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
    select: { id: true, name: true },
  });

  return jsonOk({ customer });
}

