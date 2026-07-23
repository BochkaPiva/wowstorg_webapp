import {
  OrderStatus,
  Prisma,
  ProjectBall,
  ProjectMode,
  ProjectStatus,
} from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { calcOrderPricing } from "@/server/orders/order-pricing";

const TERMINAL_PROJECTS = [ProjectStatus.COMPLETED, ProjectStatus.CANCELLED] as const;
const ACTIVE_ORDERS = [
  OrderStatus.SUBMITTED,
  OrderStatus.ESTIMATE_SENT,
  OrderStatus.CHANGES_REQUESTED,
  OrderStatus.APPROVED_BY_GREENWICH,
  OrderStatus.PICKING,
  OrderStatus.ISSUED,
  OrderStatus.RETURN_DECLARED,
] as const;

const QuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  view: z.enum(["attention", "month", "all", "undated", "estimates", "warehouse"]).default("attention"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  phase: z.string().trim().max(80).optional(),
  kind: z.enum(["all", "project", "order", "estimate"]).default("all"),
});

type WorkPhase =
  | "NEW"
  | "ESTIMATING"
  | "WAITING_CLIENT"
  | "APPROVED"
  | "PREPARING"
  | "IN_PROGRESS"
  | "CLOSING"
  | "DONE"
  | "PAUSED"
  | "CANCELLED";

function projectPhase(status: ProjectStatus, mode: ProjectMode): WorkPhase {
  if (status === ProjectStatus.CANCELLED) return "CANCELLED";
  if (status === ProjectStatus.COMPLETED) return "DONE";
  if (status === ProjectStatus.ON_HOLD) return "PAUSED";
  if (mode === ProjectMode.ESTIMATE_ONLY) {
    return status === ProjectStatus.PROPOSAL_SENT || status === ProjectStatus.AWAITING_CLIENT_INPUT
      ? "WAITING_CLIENT"
      : "ESTIMATING";
  }
  if (status === ProjectStatus.LEAD || status === ProjectStatus.BRIEFING) return "NEW";
  if (status === ProjectStatus.INTERNAL_PREP || status === ProjectStatus.PROPOSAL_REVISION) return "ESTIMATING";
  if (
    status === ProjectStatus.PROPOSAL_SENT
    || status === ProjectStatus.CONTRACT_SENT
    || status === ProjectStatus.AWAITING_CLIENT_INPUT
  ) return "WAITING_CLIENT";
  if (status === ProjectStatus.CONTRACT_SIGNED) return "APPROVED";
  if (
    status === ProjectStatus.CONTRACT_PREP
    || status === ProjectStatus.PREPRODUCTION
    || status === ProjectStatus.AWAITING_VENDOR
    || status === ProjectStatus.READY_TO_RUN
  ) return "PREPARING";
  if (status === ProjectStatus.LIVE) return "IN_PROGRESS";
  return "CLOSING";
}

function orderPhase(status: OrderStatus): WorkPhase {
  switch (status) {
    case OrderStatus.SUBMITTED:
      return "NEW";
    case OrderStatus.ESTIMATE_SENT:
      return "WAITING_CLIENT";
    case OrderStatus.CHANGES_REQUESTED:
      return "ESTIMATING";
    case OrderStatus.APPROVED_BY_GREENWICH:
      return "APPROVED";
    case OrderStatus.PICKING:
      return "PREPARING";
    case OrderStatus.ISSUED:
      return "IN_PROGRESS";
    case OrderStatus.RETURN_DECLARED:
      return "CLOSING";
    case OrderStatus.CLOSED:
      return "DONE";
    case OrderStatus.CANCELLED:
      return "CANCELLED";
  }
}

function dateOnly(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

function customerView(customer: {
  id: string;
  name: string;
  logoKey: string | null;
  logoUpdatedAt: Date | null;
} | null) {
  if (!customer) return null;
  return {
    id: customer.id,
    name: customer.name,
    logoUrl: customer.logoKey
      ? `/api/customers/${customer.id}/logo?v=${customer.logoUpdatedAt?.getTime() ?? 0}`
      : null,
  };
}

const orderSelect = {
  id: true,
  status: true,
  source: true,
  eventName: true,
  readyByDate: true,
  startDate: true,
  endDate: true,
  rentalStartPartOfDay: true,
  rentalEndPartOfDay: true,
  createdAt: true,
  updatedAt: true,
  warehouseInternalNote: true,
  payMultiplier: true,
  deliveryEnabled: true,
  deliveryPrice: true,
  montageEnabled: true,
  montagePrice: true,
  demontageEnabled: true,
  demontagePrice: true,
  rentalDiscountType: true,
  rentalDiscountPercent: true,
  rentalDiscountAmount: true,
  customer: { select: { id: true, name: true, logoKey: true, logoUpdatedAt: true } },
  greenwichUser: { select: { id: true, displayName: true } },
  lines: {
    orderBy: [{ position: "asc" as const }],
    select: {
      id: true,
      requestedQty: true,
      approvedQty: true,
      issuedQty: true,
      pricePerDaySnapshot: true,
      item: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.OrderSelect;

type QueueOrder = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

function serializeOrder(order: QueueOrder) {
  const pricing = calcOrderPricing({
    startDate: order.startDate,
    endDate: order.endDate,
    rentalStartPartOfDay: order.rentalStartPartOfDay,
    rentalEndPartOfDay: order.rentalEndPartOfDay,
    payMultiplier: order.payMultiplier,
    deliveryEnabled: order.deliveryEnabled,
    deliveryPrice: order.deliveryPrice,
    montageEnabled: order.montageEnabled,
    montagePrice: order.montagePrice,
    demontageEnabled: order.demontageEnabled,
    demontagePrice: order.demontagePrice,
    lines: order.lines,
    discount: order,
  });
  return {
    id: order.id,
    status: order.status,
    phase: orderPhase(order.status),
    source: order.source,
    title: order.eventName?.trim() || order.customer.name,
    customer: customerView(order.customer),
    assignee: order.greenwichUser?.displayName ?? "Wowstorg",
    readyByDate: dateOnly(order.readyByDate),
    startDate: dateOnly(order.startDate),
    endDate: dateOnly(order.endDate),
    rentalStartPartOfDay: order.rentalStartPartOfDay,
    rentalEndPartOfDay: order.rentalEndPartOfDay,
    totalAmount: pricing.grandTotal,
    note: order.warehouseInternalNote,
    lines: order.lines.slice(0, 6).map((line) => ({
      id: line.id,
      name: line.item.name,
      requestedQty: line.requestedQty,
      approvedQty: line.approvedQty,
      issuedQty: line.issuedQty,
    })),
    linesCount: order.lines.length,
    updatedAt: order.updatedAt.toISOString(),
  };
}

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function parseRange(args: z.infer<typeof QuerySchema>) {
  const today = startOfTodayUtc();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  const from = args.from ? new Date(`${args.from}T00:00:00.000Z`) : monthStart;
  const to = args.to ? new Date(`${args.to}T23:59:59.999Z`) : monthEnd;
  return { today, from, to };
}

export async function GET(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    view: url.searchParams.get("view") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    phase: url.searchParams.get("phase") ?? undefined,
    kind: url.searchParams.get("kind") ?? undefined,
  });
  if (!parsed.success) return jsonError(400, "Некорректные параметры", parsed.error.flatten());

  const query = parsed.data;
  const { today, from, to } = parseRange(query);
  if (to < from) return jsonError(400, "Дата окончания не может быть раньше начала");
  const nextSevenDays = new Date(today);
  nextSevenDays.setUTCDate(nextSevenDays.getUTCDate() + 7);

  const searchProject: Prisma.ProjectWhereInput | undefined = query.q
    ? {
        OR: [
          { title: { contains: query.q, mode: "insensitive" } },
          { customer: { name: { contains: query.q, mode: "insensitive" } } },
          { leadCustomerName: { contains: query.q, mode: "insensitive" } },
          { owner: { displayName: { contains: query.q, mode: "insensitive" } } },
        ],
      }
    : undefined;
  const searchOrder: Prisma.OrderWhereInput | undefined = query.q
    ? {
        OR: [
          { eventName: { contains: query.q, mode: "insensitive" } },
          { customer: { name: { contains: query.q, mode: "insensitive" } } },
          { greenwichUser: { displayName: { contains: query.q, mode: "insensitive" } } },
        ],
      }
    : undefined;

  const projectDateWhere: Prisma.ProjectWhereInput | undefined =
    query.view === "undated" || query.view === "estimates"
      ? undefined
      : query.view === "attention"
        ? {
            OR: [
              { eventStartDate: null },
              {
                eventStartDate: { lte: nextSevenDays },
                OR: [{ eventEndDate: null }, { eventEndDate: { gte: today } }],
              },
              { updatedAt: { lte: new Date(Date.now() - 3 * 86_400_000) } },
            ],
          }
        : {
            eventStartDate: { lte: to },
            OR: [{ eventEndDate: null }, { eventEndDate: { gte: from } }],
          };

  const projects = query.kind === "order"
    ? []
    : await prisma.project.findMany({
        where: {
          archivedAt: null,
          status: { notIn: [...TERMINAL_PROJECTS] },
          ...(query.kind === "estimate" || query.view === "estimates" ? { mode: ProjectMode.ESTIMATE_ONLY } : {}),
          ...(query.view === "undated" ? { eventStartDate: null, eventEndDate: null } : {}),
          AND: [
            ...(searchProject ? [searchProject] : []),
            ...(projectDateWhere ? [projectDateWhere] : []),
          ],
        },
        orderBy: [{ eventStartDate: "asc" }, { updatedAt: "desc" }],
        take: 250,
        select: {
          id: true,
          title: true,
          mode: true,
          leadCustomerName: true,
          status: true,
          ball: true,
          eventStartDate: true,
          eventEndDate: true,
          eventDateConfirmed: true,
          openBlockers: true,
          internalSummary: true,
          createdAt: true,
          updatedAt: true,
          customer: { select: { id: true, name: true, logoKey: true, logoUpdatedAt: true } },
          owner: { select: { id: true, displayName: true } },
          orders: {
            where: { status: { in: [...ACTIVE_ORDERS] } },
            orderBy: [{ readyByDate: "asc" }, { createdAt: "asc" }],
            take: 20,
            select: orderSelect,
          },
          estimateVersions: {
            orderBy: [{ isPrimary: "desc" }, { versionNumber: "desc" }],
            take: 1,
            select: { id: true, versionNumber: true, title: true },
          },
          _count: { select: { orders: true, tasks: true } },
        },
      });

  const standaloneOrderDateWhere: Prisma.OrderWhereInput | undefined =
    query.view === "attention"
      ? { readyByDate: { lte: nextSevenDays } }
      : query.view === "all" || query.view === "warehouse" || query.view === "month"
        ? { startDate: { lte: to }, endDate: { gte: from } }
        : undefined;

  const orders =
    query.kind === "project"
    || query.kind === "estimate"
    || query.view === "undated"
    || query.view === "estimates"
      ? []
      : await prisma.order.findMany({
          where: {
            projectId: null,
            status: { in: [...ACTIVE_ORDERS] },
            AND: [
              ...(searchOrder ? [searchOrder] : []),
              ...(standaloneOrderDateWhere ? [standaloneOrderDateWhere] : []),
            ],
          },
          orderBy: [{ readyByDate: "asc" }, { updatedAt: "desc" }],
          take: 250,
          select: orderSelect,
        });

  const projectItems = projects.map((project) => {
    const phase = projectPhase(project.status, project.mode);
    const childOrders = project.orders.map(serializeOrder);
    return {
      key: `project:${project.id}`,
      id: project.id,
      kind: project.mode === ProjectMode.ESTIMATE_ONLY ? "ESTIMATE_ONLY" as const : "PROJECT" as const,
      title: project.title,
      phase,
      status: project.status,
      ball: project.ball,
      customer: customerView(project.customer),
      customerFallback: project.leadCustomerName,
      owner: project.owner,
      startDate: dateOnly(project.eventStartDate),
      endDate: dateOnly(project.eventEndDate),
      dateConfirmed: project.eventDateConfirmed,
      blockers: project.openBlockers,
      summary: project.internalSummary,
      estimate: project.estimateVersions[0]
        ? {
            id: project.estimateVersions[0].id,
            versionNumber: project.estimateVersions[0].versionNumber,
            title: project.estimateVersions[0].title,
          }
        : null,
      orders: childOrders,
      ordersCount: project._count.orders,
      tasksCount: project._count.tasks,
      totalAmount: childOrders.reduce((sum, order) => sum + order.totalAmount, 0),
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  });
  const orderItems = orders.map((order) => {
    const serialized = serializeOrder(order);
    return {
      key: `order:${order.id}`,
      id: order.id,
      kind: "STANDALONE_ORDER" as const,
      title: serialized.title,
      phase: serialized.phase,
      status: serialized.status,
      ball: ProjectBall.WOWSTORG,
      customer: serialized.customer,
      customerFallback: null,
      owner: { id: serialized.assignee, displayName: serialized.assignee },
      startDate: serialized.startDate,
      endDate: serialized.endDate,
      readyByDate: serialized.readyByDate,
      dateConfirmed: true,
      blockers: null,
      summary: serialized.note,
      estimate: null,
      orders: [serialized],
      ordersCount: 1,
      tasksCount: 0,
      totalAmount: serialized.totalAmount,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  });

  const phaseFilter = query.phase?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  const phaseSet = new Set(phaseFilter);
  const priority: Record<WorkPhase, number> = {
    ESTIMATING: 0,
    PREPARING: 1,
    CLOSING: 2,
    NEW: 3,
    APPROVED: 4,
    IN_PROGRESS: 5,
    WAITING_CLIENT: 6,
    PAUSED: 7,
    DONE: 8,
    CANCELLED: 9,
  };
  const items = [...projectItems, ...orderItems]
    .filter((item) => phaseSet.size === 0 || phaseSet.has(item.phase))
    .sort((a, b) => {
      const phaseDiff = priority[a.phase] - priority[b.phase];
      if (phaseDiff !== 0) return phaseDiff;
      const aDate = a.startDate ? new Date(a.startDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bDate = b.startDate ? new Date(b.startDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aDate - bDate || b.updatedAt.localeCompare(a.updatedAt);
    });

  return jsonOk({
    items,
    meta: {
      total: items.length,
      projects: projectItems.length,
      standaloneOrders: orderItems.length,
      estimates: projectItems.filter((item) => item.kind === "ESTIMATE_ONLY").length,
      undated: projectItems.filter((item) => item.startDate == null).length,
      from: dateOnly(from),
      to: dateOnly(to),
    },
  });
}
