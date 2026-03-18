import { readFileSync } from "fs";
import { join } from "path";

import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";

const ESTIMATES_DIR = join(process.cwd(), "data", "estimates");

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

  try {
    const filePath = join(ESTIMATES_DIR, order.estimateFileKey);
    const buf = readFileSync(filePath);
    const filename = `smeta-${order.id}.xlsx`;
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buf.length),
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
