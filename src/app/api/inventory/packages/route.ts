import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const packages = await prisma.kit.findMany({
    orderBy: [{ updatedAt: "desc" }],
    include: { lines: true },
  });

  return jsonOk({
    packages: packages.map((k) => ({
      id: k.id,
      name: k.name,
      description: k.description,
      isActive: k.isActive,
      createdAt: k.createdAt,
      updatedAt: k.updatedAt,
      linesCount: k.lines.length,
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid payload", parsed.error.flatten());

  const kit = await prisma.kit.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      isActive: parsed.data.isActive ?? true,
    },
    select: { id: true },
  });

  return jsonOk({ ok: true, id: kit.id });
}

