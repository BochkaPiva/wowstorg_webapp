import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { getAdminAnalyticsData } from "@/server/admin-analytics";
import {
  matchFinancialRows,
  parseFinancialWorkbook,
} from "@/server/analytics/reconciliation";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";

const PeriodSchema = z.object({
  title: z.string().trim().min(1).max(200),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(["preview", "commit"]),
});

function dateOnlyStart(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function serializeBatch(batch: {
  id: string;
  title: string;
  sourceFileName: string;
  sheetName: string;
  periodStart: Date;
  periodEnd: Date;
  createdAt: Date;
  _count: { rows: number };
}) {
  return {
    ...batch,
    periodStart: batch.periodStart.toISOString().slice(0, 10),
    periodEnd: batch.periodEnd.toISOString().slice(0, 10),
    createdAt: batch.createdAt.toISOString(),
  };
}

export async function GET(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const selectedId = new URL(req.url).searchParams.get("id")?.trim() || null;
  const batches = await prisma.financialReconciliationBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      title: true,
      sourceFileName: true,
      sheetName: true,
      periodStart: true,
      periodEnd: true,
      createdAt: true,
      _count: { select: { rows: true } },
    },
  });

  if (!selectedId) {
    return jsonOk({ batches: batches.map(serializeBatch), selected: null });
  }

  const batch = await prisma.financialReconciliationBatch.findUnique({
    where: { id: selectedId },
    select: {
      id: true,
      title: true,
      sourceFileName: true,
      sheetName: true,
      periodStart: true,
      periodEnd: true,
      createdAt: true,
      _count: { select: { rows: true } },
      rows: {
        orderBy: { rowNumber: "asc" },
        select: {
          id: true,
          rowNumber: true,
          externalNumber: true,
          projectName: true,
          revenue: true,
          expenses: true,
          profit: true,
          marginPercent: true,
          bonusPool: true,
          bonusFirst: true,
          bonusSecond: true,
          sourceLink: true,
          matchStatus: true,
          matchedEntityType: true,
          matchedEntityId: true,
          matchNote: true,
        },
      },
    },
  });
  if (!batch) return jsonError(404, "Сверка не найдена");

  const from = batch.periodStart.toISOString().slice(0, 10);
  const to = batch.periodEnd.toISOString().slice(0, 10);
  const analytics = await getAdminAnalyticsData({ from, to });
  const external = batch.rows.reduce(
    (totals, row) => ({
      revenue: totals.revenue + Number(row.revenue),
      expenses: totals.expenses + Number(row.expenses),
      profit: totals.profit + Number(row.profit),
      bonusPool: totals.bonusPool + Number(row.bonusPool),
    }),
    { revenue: 0, expenses: 0, profit: 0, bonusPool: 0 },
  );
  const site = {
    revenue: analytics.overview.finance.fact.revenueTotal,
    profit: analytics.overview.finance.fact.profitTotal,
    expenses:
      analytics.overview.finance.fact.revenueTotal
      - analytics.overview.finance.fact.profitTotal,
    bonusPool: analytics.overview.finance.bonuses.factPool,
  };

  return jsonOk({
    batches: batches.map(serializeBatch),
    selected: {
      ...serializeBatch(batch),
      rows: batch.rows.map((row) => ({
        ...row,
        revenue: Number(row.revenue),
        expenses: Number(row.expenses),
        profit: Number(row.profit),
        marginPercent: Number(row.marginPercent),
        bonusPool: Number(row.bonusPool),
        bonusFirst: Number(row.bonusFirst),
        bonusSecond: Number(row.bonusSecond),
      })),
      summary: {
        external,
        site,
        delta: {
          revenue: external.revenue - site.revenue,
          expenses: external.expenses - site.expenses,
          profit: external.profit - site.profit,
          bonusPool: external.bonusPool - site.bonusPool,
        },
        matched: batch.rows.filter((row) => row.matchStatus === "MATCHED").length,
        conflicts: batch.rows.filter((row) => row.matchStatus === "CONFLICT").length,
        unmatched: batch.rows.filter((row) => row.matchStatus === "UNMATCHED").length,
      },
    },
  });
}

export async function POST(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const form = await req.formData().catch(() => null);
  if (!form) return jsonError(400, "Ожидалась форма с Excel-файлом");
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError(400, "Выберите Excel-файл");
  if (file.size > 12 * 1024 * 1024) return jsonError(400, "Файл больше 12 МБ");
  if (!/\.(xlsx|xls)$/i.test(file.name)) return jsonError(400, "Поддерживаются файлы XLSX и XLS");

  const parsedPeriod = PeriodSchema.safeParse({
    title: form.get("title"),
    from: form.get("from"),
    to: form.get("to"),
    mode: form.get("mode"),
  });
  if (!parsedPeriod.success) {
    return jsonError(400, "Проверьте название, период и режим импорта", parsedPeriod.error.flatten());
  }
  if (parsedPeriod.data.to < parsedPeriod.data.from) {
    return jsonError(400, "Дата окончания не может быть раньше даты начала");
  }

  let parsedWorkbook;
  try {
    parsedWorkbook = parseFinancialWorkbook(await file.arrayBuffer());
  } catch (error) {
    return jsonError(
      400,
      error instanceof Error ? error.message : "Не удалось прочитать Excel-файл",
    );
  }
  if (parsedWorkbook.rows.length === 0) return jsonError(400, "В таблице нет строк проектов");

  const rows = await matchFinancialRows(parsedWorkbook.rows);
  const preview = {
    fileName: file.name,
    sheetName: parsedWorkbook.sheetName,
    rows,
    totals: parsedWorkbook.totals,
    matched: rows.filter((row) => row.matchStatus === "MATCHED").length,
    conflicts: rows.filter((row) => row.matchStatus === "CONFLICT").length,
    unmatched: rows.filter((row) => row.matchStatus === "UNMATCHED").length,
  };

  if (parsedPeriod.data.mode === "preview") {
    return jsonOk({ preview });
  }

  const batch = await prisma.$transaction(async (tx) => {
    return tx.financialReconciliationBatch.create({
      data: {
        title: parsedPeriod.data.title,
        sourceFileName: file.name,
        sheetName: parsedWorkbook.sheetName,
        periodStart: dateOnlyStart(parsedPeriod.data.from),
        periodEnd: dateOnlyStart(parsedPeriod.data.to),
        importedById: auth.user.id,
        rows: {
          create: rows.map((row) => ({
            rowNumber: row.rowNumber,
            externalNumber: row.externalNumber,
            projectName: row.projectName,
            revenue: new Prisma.Decimal(row.revenue),
            expenses: new Prisma.Decimal(row.expenses),
            profit: new Prisma.Decimal(row.profit),
            marginPercent: new Prisma.Decimal(row.marginPercent),
            bonusPool: new Prisma.Decimal(row.bonusPool),
            bonusFirst: new Prisma.Decimal(row.bonusFirst),
            bonusSecond: new Prisma.Decimal(row.bonusSecond),
            sourceLink: row.sourceLink,
            matchStatus: row.matchStatus,
            matchedEntityType: row.matchedEntityType,
            matchedEntityId: row.matchedEntityId,
            matchNote: row.matchNote,
            originalData: row.originalData as Prisma.InputJsonValue,
          })),
        },
      },
      select: { id: true },
    });
  });

  return jsonOk({ batchId: batch.id, preview });
}
