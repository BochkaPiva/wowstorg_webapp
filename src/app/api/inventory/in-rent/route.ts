import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonOk } from "@/server/http";

const RENT_STATUSES = ["ISSUED", "RETURN_DECLARED"] as const;
const OMSK_TZ = "Asia/Omsk";

function getOmskTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: OMSK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const todayYmd = getOmskTodayYmd();
  const today = new Date(`${todayYmd}T00:00:00.000Z`);

  const orders = await prisma.order.findMany({
    where: {
      status: { in: [...RENT_STATUSES] },
    },
    orderBy: [{ endDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      status: true,
      customer: { select: { name: true } },
      startDate: true,
      endDate: true,
      lines: {
        orderBy: [{ position: "asc" }],
        select: {
          itemId: true,
          requestedQty: true,
          issuedQty: true,
          item: { select: { name: true } },
        },
      },
    },
  });

  const rows: Array<{
    orderId: string;
    status: (typeof RENT_STATUSES)[number];
    customerName: string;
    itemId: string;
    itemName: string;
    qty: number;
    startDate: string;
    endDate: string;
    overdueDays: number;
  }> = [];

  for (const o of orders) {
    for (const l of o.lines) {
      const qty = l.issuedQty ?? l.requestedQty;
      if (qty <= 0) continue;
      const overdueDays = Math.max(
        0,
        Math.round((today.getTime() - o.endDate.getTime()) / (24 * 60 * 60 * 1000)),
      );
      rows.push({
        orderId: o.id,
        status: o.status as (typeof RENT_STATUSES)[number],
        customerName: o.customer.name,
        itemId: l.itemId,
        itemName: l.item.name,
        qty,
        startDate: o.startDate.toISOString().slice(0, 10),
        endDate: o.endDate.toISOString().slice(0, 10),
        overdueDays,
      });
    }
  }

  const byItemMap = new Map<
    string,
    {
      itemId: string;
      itemName: string;
      qtyInRent: number;
      rentOrdersCount: number;
      nearestReleaseDate: string;
      overdueUnits: number;
    }
  >();
  for (const r of rows) {
    const prev = byItemMap.get(r.itemId);
    if (!prev) {
      byItemMap.set(r.itemId, {
        itemId: r.itemId,
        itemName: r.itemName,
        qtyInRent: r.qty,
        rentOrdersCount: 1,
        nearestReleaseDate: r.endDate,
        overdueUnits: r.overdueDays > 0 ? r.qty : 0,
      });
      continue;
    }
    prev.qtyInRent += r.qty;
    prev.rentOrdersCount += 1;
    if (r.endDate < prev.nearestReleaseDate) prev.nearestReleaseDate = r.endDate;
    if (r.overdueDays > 0) prev.overdueUnits += r.qty;
  }

  const byItem = [...byItemMap.values()].sort((a, b) => {
    if (b.overdueUnits !== a.overdueUnits) return b.overdueUnits - a.overdueUnits;
    if (b.qtyInRent !== a.qtyInRent) return b.qtyInRent - a.qtyInRent;
    return a.nearestReleaseDate.localeCompare(b.nearestReleaseDate);
  });

  const summary = {
    rowsCount: rows.length,
    itemsInRent: byItem.length,
    unitsInRent: rows.reduce((s, r) => s + r.qty, 0),
    overdueRows: rows.filter((r) => r.overdueDays > 0).length,
    overdueUnits: rows.reduce((s, r) => s + (r.overdueDays > 0 ? r.qty : 0), 0),
  };

  return jsonOk({ today: todayYmd, summary, byItem, rows });
}

