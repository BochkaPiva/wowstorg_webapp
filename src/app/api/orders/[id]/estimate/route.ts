import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { getEstimateFile } from "@/server/file-storage";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      estimateFileKey: true,
      greenwichUserId: true,
      status: true,
    },
  });

  if (!order || !order.estimateFileKey) {
    return new Response(null, { status: 404 });
  }

  const isWarehouse = auth.user.role === "WOWSTORG";
  const isOwner = order.greenwichUserId === auth.user.id;
  if (!isWarehouse && !isOwner) {
    return new Response(null, { status: 403 });
  }

  const buf = await getEstimateFile(order.estimateFileKey);
  if (!buf) return new Response(null, { status: 404 });
  const filename = `smeta-${order.id}.xlsx`;
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buf.length),
    },
  });
}
