import { prisma } from "@/server/db";
import { jsonOk } from "@/server/http";
import { requireUser } from "@/server/auth/require";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const kits = await prisma.kit.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }],
    include: {
      lines: {
        orderBy: [{ defaultQty: "desc" }],
        include: {
          item: { select: { id: true, name: true, type: true, isActive: true } },
        },
      },
    },
  });

  return jsonOk({ kits });
}

