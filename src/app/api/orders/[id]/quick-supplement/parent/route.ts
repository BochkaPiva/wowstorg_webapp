import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

/**
 * Parent info for quick supplement creation (cart prefill).
 * We intentionally return only the minimal fields needed by the UI.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  const parent = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      customer: { select: { id: true, name: true } },
      greenwichUserId: true,
      readyByDate: true,
      startDate: true,
      endDate: true,
      rentalStartPartOfDay: true,
      rentalEndPartOfDay: true,
      eventName: true,
      comment: true,
      payMultiplier: true,
    },
  });

  if (!parent) return jsonError(404, "Not found");

  // Allow if either:
  // - Greenwich is assigned to the parent
  // - Warehouse can initiate for quick supplement in general
  if (auth.user.role === "GREENWICH" && parent.greenwichUserId !== auth.user.id) {
    return jsonError(403, "Forbidden");
  }

  // Quick supplement must be created only for a regular (non-quick) issued order.
  // We use raw query because the Prisma client in this repo may lag schema updates.
  const quickRow = await prisma.$queryRaw<Array<{ parentOrderId: string | null }>>`
    SELECT "parentOrderId"
    FROM "Order"
    WHERE "id" = ${id}
    LIMIT 1
  `;
  if (quickRow?.[0]?.parentOrderId) {
    return jsonError(400, "Quick supplement can be created only for main orders");
  }

  // For UI simplification: quick supplement parent must be issued.
  if (parent.status !== "ISSUED") {
    return jsonError(400, "Quick supplement can be created only for issued orders");
  }
  if (!parent.greenwichUserId) {
    return jsonError(400, "Parent must have assigned Grinvich employee");
  }

  return jsonOk({
    parentId: parent.id,
    customer: parent.customer,
    greenwichUserId: parent.greenwichUserId,
    readyByDate: parent.readyByDate.toISOString().slice(0, 10),
    startDate: parent.startDate.toISOString().slice(0, 10),
    endDate: parent.endDate.toISOString().slice(0, 10),
    rentalStartPartOfDay: parent.rentalStartPartOfDay,
    rentalEndPartOfDay: parent.rentalEndPartOfDay,
    eventName: parent.eventName ?? "",
    comment: parent.comment ?? "",
    payMultiplier: parent.payMultiplier != null ? Number(parent.payMultiplier) : null,
  });
}

