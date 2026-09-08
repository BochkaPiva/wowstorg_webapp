import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { normalizeContractorName } from "@/server/contractors/identity";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";

const CategorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).nullable().optional(),
}).strict();

export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const categories = await prisma.contractorCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, description: true, sortOrder: true, _count: { select: { offers: true } } },
  });
  return jsonOk({ categories });
}

export async function POST(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const parsed = CategorySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Проверьте название категории", parsed.error.flatten());
  const normalizedName = normalizeContractorName(parsed.data.name);
  if (!normalizedName) return jsonError(400, "Название должно содержать буквы или цифры");

  try {
    const max = await prisma.contractorCategory.aggregate({ _max: { sortOrder: true } });
    const category = await prisma.contractorCategory.create({
      data: {
        name: parsed.data.name,
        normalizedName,
        description: parsed.data.description || null,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
      select: { id: true, name: true, description: true, sortOrder: true },
    });
    return jsonOk({ category });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonError(409, "Такая категория уже существует");
    }
    throw error;
  }
}

