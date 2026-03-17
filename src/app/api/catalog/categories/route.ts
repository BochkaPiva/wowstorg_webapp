import { prisma } from "@/server/db";
import { jsonOk } from "@/server/http";
import { requireUser } from "@/server/auth/require";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const categories = await prisma.category.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, order: true },
  });

  return jsonOk({ categories });
}

