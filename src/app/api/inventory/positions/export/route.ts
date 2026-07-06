import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { buildInventoryPositionsExportXlsx } from "@/server/inventory-positions-export-xlsx";

export const runtime = "nodejs";

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const items = await prisma.item.findMany({
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      type: true,
      isActive: true,
      internalOnly: true,
      pricePerDay: true,
      purchasePricePerUnit: true,
      total: true,
      inRepair: true,
      broken: true,
      missing: true,
      photo1Key: true,
      photo2Key: true,
      updatedAt: true,
      categories: {
        select: {
          category: { select: { name: true } },
        },
        orderBy: { category: { order: "asc" } },
      },
    },
  });

  const buffer = await buildInventoryPositionsExportXlsx(items);
  const filename = `wowstorg-catalog-${todayYmd()}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
