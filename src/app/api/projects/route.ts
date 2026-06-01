import { Prisma, ProjectActivityKind, ProjectBall, ProjectStatus } from "@prisma/client";
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
import { calcProjectEstimateTotals, getNumericAmount } from "@/lib/project-estimate-totals";
import {
  calcCashInternalCostTaxAmount,
  calcOrderServicesInternalCosts,
  isCashPaymentMethod,
} from "@/lib/order-service-internal-costs";
import { calcOrderPricing } from "@/server/orders/order-pricing";

const CreateSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    customerId: z.string().trim().min(1).optional(),
    customerName: z.string().trim().min(2).max(200).optional(),
    status: z.nativeEnum(ProjectStatus).optional(),
    ball: z.nativeEnum(ProjectBall).optional(),
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
      status: true,
      ball: true,
      archivedAt: true,
      archiveNote: true,
      eventStartDate: true,
      eventEndDate: true,
      eventDateConfirmed: true,
      updatedAt: true,
      createdAt: true,
      customer: { select: { id: true, name: true } },
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
                  lines: {
                    select: {
                      requestedQty: true,
                      issuedQty: true,
                      pricePerDaySnapshot: true,
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
    let cashInternalCostTax = 0;

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
          cashInternalCostTax += serviceCosts.cashInternalCostTax;
          continue;
        }

        for (const line of section.lines) {
          clientSubtotal +=
            normalizedLocalLineCostClientNumber({
              costClient: line.costClient != null ? Number(line.costClient) : null,
              qty: line.qty != null ? Number(line.qty) : null,
              unitPriceClient: line.unitPriceClient != null ? Number(line.unitPriceClient) : null,
            }) ?? 0;

          const lineInternal = getNumericAmount(line.costInternal);
          internalSubtotal += lineInternal;
          if (isCashPaymentMethod(line.paymentMethod)) {
            cashInternalCostTax += calcCashInternalCostTaxAmount(lineInternal);
          }
        }
      }
    }

    clientSubtotal += addDraftOrdersClientSubtotal(draftOrders, version?.id ?? null);

    return calcProjectEstimateTotals({
      clientSubtotal,
      internalSubtotal,
      cashInternalCostTax,
      commissionEnabled: version?.commissionEnabled,
      clientTaxEnabled: version?.clientTaxEnabled,
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
      status: project.status,
      ball: project.ball,
      archivedAt: project.archivedAt?.toISOString() ?? null,
      archiveNote: project.archiveNote,
      eventStartDate: project.eventStartDate?.toISOString() ?? null,
      eventEndDate: project.eventEndDate?.toISOString() ?? null,
      eventDateConfirmed: project.eventDateConfirmed,
      updatedAt: project.updatedAt.toISOString(),
      createdAt: project.createdAt.toISOString(),
      customer: project.customer,
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

  if (!parsed.data.customerId && !parsed.data.customerName) {
    return jsonError(400, "Укажите заказчика");
  }

  try {
    const project = await prisma.$transaction(async (tx) => {
      let customerId = parsed.data.customerId?.trim() || "";

      if (!customerId) {
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
      } else {
        const customer = await tx.customer.findUnique({
          where: { id: customerId },
          select: { id: true },
        });
        if (!customer) {
          throw new Error("CUSTOMER_NOT_FOUND");
        }
      }

      const p = await tx.project.create({
        data: {
          title: parsed.data.title,
          customerId,
          ownerUserId: auth.user.id,
          status: parsed.data.status ?? ProjectStatus.LEAD,
          ball: parsed.data.ball ?? ProjectBall.CLIENT,
        },
        select: {
          id: true,
          title: true,
          status: true,
          ball: true,
          archivedAt: true,
          customerId: true,
          ownerUserId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      await ensureDefaultProjectFolders(tx, p.id);
      await appendProjectActivityLog(tx, {
        projectId: p.id,
        actorUserId: auth.user.id,
        kind: ProjectActivityKind.PROJECT_CREATED,
        payload: { title: p.title },
      });
      return p;
    });

    return jsonOk({ project });
  } catch (e) {
    if (e instanceof Error && e.message === "CUSTOMER_NOT_FOUND") {
      return jsonError(400, "Заказчик не найден");
    }
    throw e;
  }
}
