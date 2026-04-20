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
        include: {
          item: {
            select: {
              id: true,
              name: true,
              photo1Key: true,
              type: true,
              total: true,
              inRepair: true,
              broken: true,
              missing: true,
            },
          },
        },
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
      project: { select: { id: true, title: true } },
    },
  });

  if (!order) return jsonError(404, "Not found");

  if (auth.user.role === "GREENWICH" && order.greenwichUserId !== auth.user.id) {
    return jsonError(403, "Forbidden");
  }

  // parentOrderId is used to mark quick supplements.
  // We use raw SQL because the Prisma client in this repo may lag schema updates.
  const quickRow = await prisma.$queryRaw<Array<{ parentOrderId: string | null }>>`
    SELECT "parentOrderId"
    FROM "Order"
    WHERE "id" = ${id}
    LIMIT 1
  `;

  const { greenwichUser, lines, returnSplits, project, ...orderBase } = order;

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
    deliveryInternalCost: order.deliveryInternalCost != null ? Number(order.deliveryInternalCost) : null,
    montagePrice: order.montagePrice != null ? Number(order.montagePrice) : null,
    montageInternalCost: order.montageInternalCost != null ? Number(order.montageInternalCost) : null,
    demontagePrice: order.demontagePrice != null ? Number(order.demontagePrice) : null,
    demontageInternalCost: order.demontageInternalCost != null ? Number(order.demontageInternalCost) : null,
    payMultiplier: order.payMultiplier != null ? Number(order.payMultiplier) : null,
    greenwichUser: greenwichUser
      ? {
          id: greenwichUser.id,
          displayName: greenwichUser.displayName,
          ratingScore: greenwichUser.greenwichRating?.score ?? 100,
        }
      : null,
    parentOrderId: quickRow?.[0]?.parentOrderId ?? null,
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

  if (auth.user.role === "GREENWICH") {
    delete serialized.projectId;
  } else if (auth.user.role === "WOWSTORG") {
    serialized.project =
      order.projectId && project ? { id: project.id, title: project.title } : null;
  }

  return jsonOk({ order: serialized });
}

