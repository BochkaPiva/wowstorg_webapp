import { Prisma } from "@prisma/client";
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
  const [items, incidents] = await prisma.$transaction([
    prisma.item.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, total: true, inRepair: true, broken: true },
  }),
    prisma.incident.findMany({
    where: { status: "OPEN", condition },
    select: { orderLine: { select: { itemId: true } }, qty: true, repairedQty: true, utilizedQty: true },
  }),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  const linked = new Map<string, number>();
  for (const row of incidents) {
    const id = row.orderLine.itemId;
    linked.set(id, (linked.get(id) ?? 0) + Math.max(0, row.qty - row.repairedQty - row.utilizedQty));
  }
  const list = items.map((it) => ({
    id: it.id,
    name: it.name,
    qty: Math.max(0, it[field] - (linked.get(it.id) ?? 0)),
    condition,
    total: it.total,
    inRepair: it.inRepair,
    broken: it.broken,
  })).filter((it) => it.qty > 0);

  const discrepancies = items
    .filter(it => it[field] < (linked.get(it.id) ?? 0))
    .map(it => ({ id: it.id, name: it.name, recorded: it[field], linked: linked.get(it.id) ?? 0 }));
  return jsonOk({ items: list, discrepancies });
}
