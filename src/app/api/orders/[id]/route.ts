import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true } },
      createdBy: { select: { id: true, displayName: true } },
      greenwichUser: {
        select: {
          id: true,
          displayName: true,
          greenwichRating: { select: { score: true } },
        },
      },
      lines: {
        orderBy: [{ position: "asc" }],
        include: { item: { select: { id: true, name: true, type: true } } },
      },
      returnSplits: {
        select: {
          id: true,
          orderLineId: true,
          phase: true,
          condition: true,
          qty: true,
          comment: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "asc" }],
      },
    },
  });

  if (!order) return jsonError(404, "Not found");

  if (auth.user.role === "GREENWICH" && order.greenwichUserId !== auth.user.id) {
    return jsonError(403, "Forbidden");
  }

  const { greenwichUser, lines, returnSplits, ...orderBase } = order;

  const serialized: Record<string, unknown> = {
    ...orderBase,
    readyByDate: order.readyByDate.toISOString().slice(0, 10),
    startDate: order.startDate.toISOString().slice(0, 10),
    endDate: order.endDate.toISOString().slice(0, 10),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    estimateSentAt: order.estimateSentAt?.toISOString() ?? null,
    greenwichConfirmedAt: order.greenwichConfirmedAt?.toISOString() ?? null,
    deliveryPrice: order.deliveryPrice != null ? Number(order.deliveryPrice) : null,
    montagePrice: order.montagePrice != null ? Number(order.montagePrice) : null,
    demontagePrice: order.demontagePrice != null ? Number(order.demontagePrice) : null,
    payMultiplier: order.payMultiplier != null ? Number(order.payMultiplier) : null,
    greenwichUser: greenwichUser
      ? {
          id: greenwichUser.id,
          displayName: greenwichUser.displayName,
          ratingScore: greenwichUser.greenwichRating?.score ?? 100,
        }
      : null,
    lines: lines.map((l) => ({
      ...l,
      pricePerDaySnapshot: l.pricePerDaySnapshot != null ? Number(l.pricePerDaySnapshot) : null,
      warehouseComment: l.warehouseComment ?? null,
      greenwichComment: l.greenwichComment ?? null,
    })),
    returnSplits: returnSplits.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
    })),
  };
  if (auth.user.role !== "WOWSTORG") {
    delete serialized.warehouseInternalNote;
  } else {
    serialized.warehouseInternalNote = order.warehouseInternalNote ?? null;
  }
  return jsonOk({ order: serialized });
}

