import { buildInternalEstimateXlsx } from "@/server/estimate-xlsx";
import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true } },
      lines: {
        orderBy: [{ position: "asc" }],
        include: {
          item: { select: { name: true } },
        },
      },
      hiddenExpenses: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          title: true,
          comment: true,
          cost: true,
          internalPaymentMethod: true,
        },
      },
    },
  });

  if (!order) {
    return new Response(null, { status: 404 });
  }

  const buf = await buildInternalEstimateXlsx(order);
  const filename = `internal-smeta-${order.id}.xlsx`;

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buf.length),
    },
  });
}
