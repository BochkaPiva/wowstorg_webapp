import { z } from "zod";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(128).regex(/^[a-z0-9-]+$/),
});

export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const categories = await prisma.category.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      order: true,
      createdAt: true,
      updatedAt: true,
      items: { select: { itemId: true } },
    },
  });

  return jsonOk({
    collections: categories.map((c) => ({
      id: c.id,
      name: c.name,
      description: null,
      isActive: true,
      itemsCount: c.items.length,
      updatedAt: c.updatedAt.toISOString(),
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

  const existing = await prisma.category.findUnique({ where: { slug: parsed.data.slug }, select: { id: true } });
  if (existing) return jsonError(400, "Категория с таким slug уже есть");

  const c = await prisma.category.create({
    data: { name: parsed.data.name, slug: parsed.data.slug },
    select: { id: true },
  });

  return jsonOk({ ok: true, id: c.id });
}

