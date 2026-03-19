import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

type Condition = "NEEDS_REPAIR" | "BROKEN";

export async function GET(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const condition = url.searchParams.get("condition") as Condition | null;
  if (condition !== "NEEDS_REPAIR" && condition !== "BROKEN") {
    return jsonError(400, "Invalid condition");
  }

  const field = condition === "NEEDS_REPAIR" ? "inRepair" : "broken";
  const items = await prisma.item.findMany({
    where: { [field]: { gt: 0 }, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, inRepair: true, broken: true },
  });

  const list = items.map((it) => ({
    id: it.id,
    name: it.name,
    qty: condition === "NEEDS_REPAIR" ? it.inRepair : it.broken,
    condition,
  }));

  return jsonOk({ items: list });
}
