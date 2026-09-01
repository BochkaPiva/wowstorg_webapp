import { Prisma, ProjectActivityKind, ProjectBall, ProjectMode, ProjectStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { appendProjectActivityLog } from "@/server/projects/activity-log";
import { ensureDefaultProjectFolders } from "@/server/projects/project-files";
import { normalizedLocalLineCostClientNumber } from "@/lib/project-estimate-local-line";
import {
  calcProjectEstimateRequisiteTotal,
  normalizeProjectEstimateDays,
} from "@/lib/project-estimate-requisite";
import { calcProjectEstimateTotals } from "@/lib/project-estimate-totals";
import {
  calcCashInternalCostTaxAmount,
  calcOrderServicesInternalCosts,
} from "@/lib/order-service-internal-costs";
import {
  getProjectEstimateLineCashInternalTotal,
  getProjectEstimateLineInternalTotal,
} from "@/lib/project-estimate-line-totals";
import { calcOrderPricing } from "@/server/orders/order-pricing";
import {
  buildInitialProjectWidgets,
  PROJECT_WIDGET_TYPES,
} from "@/lib/projects/project-widget-registry";
import { parseProjectWorkspaceTemplateWidgets } from "@/lib/projects/project-workspace-template";

const CreateSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    customerId: z.string().trim().min(1).optional(),
    customerName: z.string().trim().min(2).max(200).optional(),
    mode: z.nativeEnum(ProjectMode).optional(),
    status: z.nativeEnum(ProjectStatus).optional(),
    ball: z.nativeEnum(ProjectBall).optional(),
    ownerUserId: z.string().trim().min(1).optional(),
    memberUserIds: z.array(z.string().trim().min(1)).max(50).optional(),
    widgetTypes: z.array(z.enum(PROJECT_WIDGET_TYPES)).max(PROJECT_WIDGET_TYPES.length).optional(),
    workspaceTemplateId: z.string().trim().min(1).optional(),
  })
  .strict();

const SORT_VALUES = ["updated_desc", "updated_asc", "created_desc", "created_asc", "title_asc"] as const;
const STAGE_FILTERS = ["preparation", "execution", "completion"] as const;

const PROJECT_STATUS_SET = new Set<string>(Object.values(ProjectStatus));
const PROJECT_BALL_SET = new Set<string>(Object.values(ProjectBall));
const PROJECT_STATUS_BY_STAGE: Record<(typeof STAGE_FILTERS)[number], ProjectStatus[]> = {
  preparation: [
    ProjectStatus.LEAD,
    ProjectStatus.BRIEFING,
    ProjectStatus.INTERNAL_PREP,
    ProjectStatus.PROPOSAL_SENT,
    ProjectStatus.PROPOSAL_REVISION,
    ProjectStatus.CONTRACT_PREP,
    ProjectStatus.CONTRACT_SENT,
    ProjectStatus.CONTRACT_SIGNED,
    ProjectStatus.AWAITING_CLIENT_INPUT,
    ProjectStatus.AWAITING_VENDOR,
    ProjectStatus.ON_HOLD,
  ],
  execution: [ProjectStatus.PREPRODUCTION, ProjectStatus.READY_TO_RUN, ProjectStatus.LIVE],
  completion: [ProjectStatus.WRAP_UP, ProjectStatus.COMPLETED, ProjectStatus.CANCELLED],
};

function parseProjectsListQuery(url: URL): {
  archived: boolean;
  sort: (typeof SORT_VALUES)[number];
  statusFilter: "all" | ProjectStatus;
  stageFilter: "all" | (typeof STAGE_FILTERS)[number];
  ballFilter: "all" | ProjectBall;
  q?: string;
} {
  const archived = url.searchParams.get("archive") === "1";

  const sortRaw = url.searchParams.get("sort") ?? "";
  const sort = (SORT_VALUES as readonly string[]).includes(sortRaw)
    ? (sortRaw as (typeof SORT_VALUES)[number])
    : "updated_desc";

  const statusRaw = url.searchParams.get("status");
  let statusFilter: "all" | ProjectStatus = "all";
  if (statusRaw && statusRaw !== "all" && PROJECT_STATUS_SET.has(statusRaw)) {
    statusFilter = statusRaw as ProjectStatus;
  }

  const stageRaw = url.searchParams.get("stage") ?? "";
  const stageFilter = (STAGE_FILTERS as readonly string[]).includes(stageRaw)
    ? (stageRaw as (typeof STAGE_FILTERS)[number])
    : "all";

  const ballRaw = url.searchParams.get("ball");
  let ballFilter: "all" | ProjectBall = "all";
  if (ballRaw && ballRaw !== "all" && PROJECT_BALL_SET.has(ballRaw)) {
    ballFilter = ballRaw as ProjectBall;
  }

  const qRaw = url.searchParams.get("q")?.trim() ?? "";
  const q = qRaw.length > 0 ? qRaw.slice(0, 120) : undefined;

  return { archived, sort, statusFilter, stageFilter, ballFilter, q };
}

function orderByFromSort(sort: (typeof SORT_VALUES)[number]): Prisma.ProjectOrderByWithRelationInput[] {
  switch (sort) {
    case "updated_asc":
      return [{ updatedAt: "asc" }];
    case "created_desc":
      return [{ createdAt: "desc" }];
    case "created_asc":
      return [{ createdAt: "asc" }];
    case "title_asc":
      return [{ title: "asc" }];
    case "updated_desc":
    default:
      return [{ updatedAt: "desc" }];
  }
}

export async function GET(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const { archived, sort, statusFilter, stageFilter, ballFilter, q } = parseProjectsListQuery(url);

  const searchWhere: Prisma.ProjectWhereInput | undefined =
    q && q.length > 0
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { customer: { name: { contains: q, mode: "insensitive" } } },
            { leadCustomerName: { contains: q, mode: "insensitive" } },
            { id: { contains: q, mode: "insensitive" } },
            { owner: { displayName: { contains: q, mode: "insensitive" } } },
          ],
        }
      : undefined;

  const statusWhere: Prisma.ProjectWhereInput | undefined =
    statusFilter !== "all"
      ? { status: statusFilter }
      : stageFilter !== "all"
        ? { status: { in: PROJECT_STATUS_BY_STAGE[stageFilter] } }
        : undefined;

  const ballWhere: Prisma.ProjectWhereInput | undefined =
    ballFilter === "all" ? undefined : { ball: ballFilter };

  const projects = await prisma.project.findMany({
    where: {
      AND: [
        archived ? { archivedAt: { not: null } } : { archivedAt: null },
        ...(statusWhere ? [statusWhere] : []),
        ...(ballWhere ? [ballWhere] : []),
        ...(searchWhere ? [searchWhere] : []),
      ],
    },
    orderBy: orderByFromSort(sort),
    take: 500,
    select: {
      id: true,
      title: true,
      mode: true,
      leadCustomerName: true,
      status: true,
      ball: true,
      archivedAt: true,
      archiveNote: true,
      eventStartDate: true,
      eventEndDate: true,
      eventDateConfirmed: true,
      updatedAt: true,
      createdAt: true,
      customer: {
        select: { id: true, name: true, logoKey: true, logoUpdatedAt: true },
      },
      owner: { select: { id: true, displayName: true } },
      _count: { select: { orders: true } },
      draftOrders: {
        select: {
          estimateVersionId: true,
          lines: {
            select: {
              qty: true,
              plannedDays: true,
              pricePerDaySnapshot: true,
            },
          },
        },
      },
      estimateVersions: {
        orderBy: [{ sortOrder: "asc" }, { versionNumber: "asc" }],
        select: {
          id: true,
          isPrimary: true,
          versionNumber: true,
          includeInProjectTotals: true,
          commissionEnabled: true,
          clientTaxEnabled: true,
          clientChargeTaxEnabled: true,
          sections: {
            select: {
              kind: true,
              linkedOrder: {
                select: {
                  startDate: true,
                  endDate: true,
                  rentalStartPartOfDay: true,
                  rentalEndPartOfDay: true,
                  payMultiplier: true,
                  deliveryEnabled: true,
                  deliveryPrice: true,
                  deliveryInternalCost: true,
                  deliveryInternalPaymentMethod: true,
                  montageEnabled: true,
                  montagePrice: true,
                  montageInternalCost: true,
                  montageInternalPaymentMethod: true,
                  demontageEnabled: true,
                  demontagePrice: true,
                  demontageInternalCost: true,
                  demontageInternalPaymentMethod: true,
                  hiddenExpenses: {
                    select: {
                      cost: true,
                      internalPaymentMethod: true,
                    },
                  },
                  rentalDiscountType: true,
                  rentalDiscountPercent: true,
                  rentalDiscountAmount: true,
                  clientPaymentMethod: true,
                  lines: {
                    select: {
                      requestedQty: true,
                      issuedQty: true,
                      pricePerDaySnapshot: true,
                      payMultiplierSnapshot: true,
                    },
                  },
                },
              },
              lines: {
                select: {
                  costClient: true,
                  costInternal: true,
                  qty: true,
                  unitPriceClient: true,
                  paymentMethod: true,
                  internalExpenses: {
                    select: {
                      cost: true,
                      paymentMethod: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  type ProjectRow = (typeof projects)[number];
  type ProjectVersion = ProjectRow["estimateVersions"][number];

  function addDraftOrdersClientSubtotal(draftOrders: ProjectRow["draftOrders"], targetVersionId: string | null) {
    let clientSubtotal = 0;
    for (const draft of draftOrders) {
      if (targetVersionId != null && draft.estimateVersionId !== targetVersionId) continue;
      for (const line of draft.lines) {
        const days = normalizeProjectEstimateDays(line.plannedDays ?? 1) ?? 1;
        clientSubtotal +=
          line.pricePerDaySnapshot != null
            ? calcProjectEstimateRequisiteTotal({
                pricePerDay: line.pricePerDaySnapshot,
                qty: line.qty,
                plannedDays: days,
              }) ?? 0
            : 0;
      }
    }
    return clientSubtotal;
  }

  function versionFinancials(version: ProjectVersion | null, draftOrders: ProjectRow["draftOrders"]) {
    let clientSubtotal = 0;
    let internalSubtotal = 0;
    let cashInternalSubtotal = 0;

    if (version) {
      for (const section of version.sections) {
        if (section.kind === "REQUISITE" && section.linkedOrder) {
          const order = section.linkedOrder;
          const pricing = calcOrderPricing({
            startDate: order.startDate,
            endDate: order.endDate,
            rentalStartPartOfDay: order.rentalStartPartOfDay,
            rentalEndPartOfDay: order.rentalEndPartOfDay,
            payMultiplier: order.payMultiplier,
            lines: order.lines,
            deliveryPrice: order.deliveryEnabled ? order.deliveryPrice : 0,
            montagePrice: order.montageEnabled ? order.montagePrice : 0,
            demontagePrice: order.demontageEnabled ? order.demontagePrice : 0,
            discount: order,
            clientPaymentMethod: order.clientPaymentMethod,
          });
          clientSubtotal += pricing.grandTotalBeforeTax;
          const serviceCosts = calcOrderServicesInternalCosts({
            delivery: {
              enabled: order.deliveryEnabled,
              internalCost: order.deliveryInternalCost,
              internalPaymentMethod: order.deliveryInternalPaymentMethod,
            },
            montage: {
              enabled: order.montageEnabled,
              internalCost: order.montageInternalCost,
              internalPaymentMethod: order.montageInternalPaymentMethod,
            },
            demontage: {
              enabled: order.demontageEnabled,
              internalCost: order.demontageInternalCost,
              internalPaymentMethod: order.demontageInternalPaymentMethod,
            },
            hiddenExpenses: order.hiddenExpenses.map((expense) => ({
              cost: expense.cost,
              internalPaymentMethod: expense.internalPaymentMethod,
            })),
          });
          internalSubtotal += serviceCosts.internalCostTotal;
          cashInternalSubtotal += serviceCosts.cashInternalCostTotal;
          continue;
        }

        for (const line of section.lines) {
          clientSubtotal +=
            normalizedLocalLineCostClientNumber({
              costClient: line.costClient != null ? Number(line.costClient) : null,
              qty: line.qty != null ? Number(line.qty) : null,
              unitPriceClient: line.unitPriceClient != null ? Number(line.unitPriceClient) : null,
            }) ?? 0;

          const lineInternal = getProjectEstimateLineInternalTotal(line);
          internalSubtotal += lineInternal;
          cashInternalSubtotal += getProjectEstimateLineCashInternalTotal(line);
        }
      }
    }

    clientSubtotal += addDraftOrdersClientSubtotal(draftOrders, version?.id ?? null);
    const cashInternalCostTax = calcCashInternalCostTaxAmount(cashInternalSubtotal);

    return calcProjectEstimateTotals({
      clientSubtotal,
      internalSubtotal,
      cashInternalCostTax,
      commissionEnabled: version?.commissionEnabled,
      clientTaxEnabled: version?.clientTaxEnabled,
      clientChargeTaxEnabled: version?.clientChargeTaxEnabled,
    });
  }

  function draftOrdersFinancials(draftOrders: ProjectRow["draftOrders"]) {
    const clientSubtotal = addDraftOrdersClientSubtotal(draftOrders, null);
    return calcProjectEstimateTotals({ clientSubtotal, internalSubtotal: 0, cashInternalCostTax: 0 });
  }

  function sumFinancials(financials: ReturnType<typeof calcProjectEstimateTotals>[]) {
    const clientSubtotal = financials.reduce((sum, item) => sum + item.clientSubtotal, 0);
    const internalSubtotal = financials.reduce((sum, item) => sum + item.internalSubtotal, 0);
    const cashInternalCostTax = financials.reduce((sum, item) => sum + item.cashInternalCostTax, 0);
    const internalExpensesTotal = financials.reduce((sum, item) => sum + item.internalExpensesTotal, 0);
    const commission = financials.reduce((sum, item) => sum + item.commission, 0);
    const clientChargeTax = financials.reduce((sum, item) => sum + item.clientChargeTax, 0);
    const revenueTotal = financials.reduce((sum, item) => sum + item.revenueTotal, 0);
    const tax = financials.reduce((sum, item) => sum + item.tax, 0);
    const grossMargin = financials.reduce((sum, item) => sum + item.grossMargin, 0);
    const marginAfterTax = financials.reduce((sum, item) => sum + item.marginAfterTax, 0);
    const marginAfterTaxPct = revenueTotal > 0 ? Math.round((marginAfterTax / revenueTotal) * 10000) / 100 : 0;
    return {
      clientSubtotal,
      internalSubtotal,
      cashInternalCostTax,
      internalExpensesTotal,
      commission,
      clientChargeTax,
      revenueTotal,
      tax,
      grossMargin,
      marginAfterTax,
      marginAfterTaxPct,
    };
  }

  const serialized = projects.map((project) => {
    const includedVersions = project.estimateVersions.filter((version) => version.includeInProjectTotals);
    const financials =
      includedVersions.length > 0
        ? sumFinancials(includedVersions.map((version) => versionFinancials(version, project.draftOrders)))
        : draftOrdersFinancials(project.draftOrders);

    return {
      id: project.id,
      title: project.title,
      mode: project.mode,
      status: project.status,
      ball: project.ball,
      archivedAt: project.archivedAt?.toISOString() ?? null,
      archiveNote: project.archiveNote,
      eventStartDate: project.eventStartDate?.toISOString() ?? null,
      eventEndDate: project.eventEndDate?.toISOString() ?? null,
      eventDateConfirmed: project.eventDateConfirmed,
      updatedAt: project.updatedAt.toISOString(),
      createdAt: project.createdAt.toISOString(),
      customer: project.customer
        ? {
            id: project.customer.id,
            name: project.customer.name,
            logoUrl: project.customer.logoKey
              ? `/api/customers/${project.customer.id}/logo?v=${project.customer.logoUpdatedAt?.getTime() ?? 0}`
              : null,
          }
        : null,
      leadCustomerName: project.leadCustomerName,
      owner: project.owner,
      _count: project._count,
      finance: {
        revenueTotal: financials.revenueTotal,
        marginAfterTax: financials.marginAfterTax,
        marginAfterTaxPct: financials.marginAfterTaxPct,
      },
    };
  });

  return jsonOk({ projects: serialized });
}

export async function POST(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  const projectMode = parsed.data.mode ?? ProjectMode.FULL;
  if (projectMode === ProjectMode.ESTIMATE_ONLY) {
    return jsonError(409, "Быстрый расчёт теперь создаётся через независимую смету");
  }
  if (projectMode === ProjectMode.FULL && !parsed.data.customerId && !parsed.data.customerName) {
    return jsonError(400, "Укажите заказчика");
  }

  try {
    const project = await prisma.$transaction(async (tx) => {
      const ownerUserId = parsed.data.ownerUserId ?? auth.user.id;
      const memberUserIds = Array.from(new Set([ownerUserId, ...(parsed.data.memberUserIds ?? [])]));
      if (memberUserIds.length > 50) {
        throw new Error("PROJECT_MEMBERS_LIMIT");
      }
      const validUsers = await tx.user.findMany({
        where: { id: { in: memberUserIds }, role: "WOWSTORG", isActive: true },
        select: { id: true },
      });
      if (validUsers.length !== memberUserIds.length) {
        throw new Error("PROJECT_USERS_NOT_FOUND");
      }

      let customerId: string | null = parsed.data.customerId?.trim() || null;

      if (!customerId && projectMode === ProjectMode.FULL) {
        const name = parsed.data.customerName!.trim();
        const existing = await tx.customer.findFirst({
          where: { name: { equals: name, mode: "insensitive" } },
          select: { id: true },
        });
        if (existing) {
          customerId = existing.id;
        } else {
          const created = await tx.customer.create({
            data: { name },
            select: { id: true },
          });
          customerId = created.id;
        }
      } else if (customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: customerId },
          select: { id: true },
        });
        if (!customer) {
          throw new Error("CUSTOMER_NOT_FOUND");
        }
      }

      let templateWidgets = null;
      if (parsed.data.workspaceTemplateId) {
        const template = await tx.projectWorkspaceTemplate.findFirst({
          where: { id: parsed.data.workspaceTemplateId, ownerUserId: auth.user.id },
          select: { widgets: true },
        });
        if (!template) throw new Error("PROJECT_TEMPLATE_NOT_FOUND");
        try {
          templateWidgets = parseProjectWorkspaceTemplateWidgets(template.widgets);
        } catch {
          throw new Error("PROJECT_TEMPLATE_INVALID");
        }
      }

      const p = await tx.project.create({
        data: {
          title: parsed.data.title,
          customerId,
          mode: projectMode,
          leadCustomerName: null,
          ownerUserId,
          createdByUserId: auth.user.id,
          status: parsed.data.status ?? ProjectStatus.LEAD,
          ball: parsed.data.ball ?? ProjectBall.CLIENT,
        },
        select: {
          id: true,
          title: true,
          mode: true,
          leadCustomerName: true,
          status: true,
          ball: true,
          archivedAt: true,
          customerId: true,
          ownerUserId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      await tx.projectMember.createMany({
        data: memberUserIds.map((userId) => ({
          projectId: p.id,
          userId,
          role: userId === ownerUserId ? "OWNER" : "EDITOR",
          addedById: auth.user.id,
        })),
      });
      const widgets = templateWidgets ?? buildInitialProjectWidgets(parsed.data.widgetTypes).map((widget) => ({
        ...widget,
        isVisible: true,
      }));
      await tx.projectWidget.createMany({
        data: widgets.map((widget) => ({
          ...widget,
          projectId: p.id,
          createdById: auth.user.id,
          updatedById: auth.user.id,
        })),
      });
      await ensureDefaultProjectFolders(tx, p.id);
      await appendProjectActivityLog(tx, {
        projectId: p.id,
        actorUserId: auth.user.id,
        kind: ProjectActivityKind.PROJECT_CREATED,
        payload: {
          title: p.title,
          mode: p.mode,
          ownerUserId,
          memberUserIds,
          widgetTypes: widgets.map((widget) => widget.type),
          workspaceTemplateId: parsed.data.workspaceTemplateId ?? null,
        },
      });
      return p;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return jsonOk({ project });
  } catch (e) {
    if (e instanceof Error && e.message === "CUSTOMER_NOT_FOUND") {
      return jsonError(400, "Заказчик не найден");
    }
    if (e instanceof Error && e.message === "PROJECT_USERS_NOT_FOUND") {
      return jsonError(400, "Ответственный или участник проекта недоступен");
    }
    if (e instanceof Error && e.message === "PROJECT_MEMBERS_LIMIT") {
      return jsonError(400, "В проекте может быть не больше 50 участников");
    }
    if (e instanceof Error && e.message === "PROJECT_TEMPLATE_NOT_FOUND") {
      return jsonError(404, "Шаблон рабочего пространства не найден");
    }
    if (e instanceof Error && e.message === "PROJECT_TEMPLATE_INVALID") {
      return jsonError(409, "Шаблон устарел или повреждён. Сохраните его заново");
    }
    throw e;
  }
}
