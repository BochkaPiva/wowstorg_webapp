import type { Prisma, PrismaClient, InventoryAuditRunKind, InventoryAuditSeverity } from "@prisma/client";

import { prisma } from "@/server/db";
import { getReservedQtyByItemId } from "@/server/orders/reserve";
import { parseDateOnlyToUtcMidnight } from "@/server/dates";

type DbClient = PrismaClient | Prisma.TransactionClient;

const OMSK_TZ = "Asia/Omsk";

function getOmskTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: OMSK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type ItemAuditComputed = {
  itemId: string;
  itemName: string;
  severity: InventoryAuditSeverity;
  expected: Record<string, number>;
  actual: Record<string, number>;
  delta: Record<string, number>;
  explanation: string[];
};

function severityRank(sev: InventoryAuditSeverity): number {
  if (sev === "CRITICAL") return 3;
  if (sev === "WARNING") return 2;
  if (sev === "FAILED") return 4;
  return 1;
}

function aggregateSeverity(rows: ItemAuditComputed[]): InventoryAuditSeverity {
  let top: InventoryAuditSeverity = "OK";
  for (const r of rows) {
    if (severityRank(r.severity) > severityRank(top)) top = r.severity;
  }
  return top;
}

async function computeItemsAudit(db: DbClient): Promise<ItemAuditComputed[]> {
  const items = await db.item.findMany({
    where: { isActive: true, internalOnly: false },
    select: { id: true, name: true, total: true, inRepair: true, broken: true, missing: true },
    orderBy: { name: "asc" },
  });

  const openIncidents = await db.incident.findMany({
    where: { status: "OPEN" },
    select: { orderLine: { select: { itemId: true } }, qty: true, repairedQty: true, utilizedQty: true, condition: true },
  });

  const openLosses = await db.lossRecord.findMany({
    where: { status: "OPEN" },
    select: { itemId: true, qty: true, foundQty: true, writtenOffQty: true },
  });

  const byItemOpenRepair = new Map<string, number>();
  const byItemOpenBroken = new Map<string, number>();
  for (const i of openIncidents) {
    const left = Math.max(0, i.qty - i.repairedQty - i.utilizedQty);
    if (left <= 0) continue;
    const itemId = i.orderLine.itemId;
    if (i.condition === "NEEDS_REPAIR") {
      byItemOpenRepair.set(itemId, (byItemOpenRepair.get(itemId) ?? 0) + left);
    } else if (i.condition === "BROKEN") {
      byItemOpenBroken.set(itemId, (byItemOpenBroken.get(itemId) ?? 0) + left);
    }
  }

  const byItemOpenMissing = new Map<string, number>();
  for (const l of openLosses) {
    const left = Math.max(0, l.qty - l.foundQty - l.writtenOffQty);
    if (left <= 0) continue;
    byItemOpenMissing.set(l.itemId, (byItemOpenMissing.get(l.itemId) ?? 0) + left);
  }

  const today = parseDateOnlyToUtcMidnight(getOmskTodayYmd());
  const reservedNow = await getReservedQtyByItemId({
    db,
    startDate: today,
    endDate: today,
  });

  return items.map((it) => {
    const actualTotal = it.total;
    const actualInRepair = it.inRepair;
    const actualBroken = it.broken;
    const actualMissing = it.missing;
    const actualBaseAvailable = Math.max(0, actualTotal - actualInRepair - actualBroken - actualMissing);
    const actualReservedNow = reservedNow.get(it.id) ?? 0;
    const actualAvailableNow = Math.max(0, actualBaseAvailable - actualReservedNow);

    const expectedInRepairMin = byItemOpenRepair.get(it.id) ?? 0;
    const expectedBrokenMin = byItemOpenBroken.get(it.id) ?? 0;
    const expectedMissingMin = byItemOpenMissing.get(it.id) ?? 0;

    const expected = {
      inRepairMin: expectedInRepairMin,
      brokenMin: expectedBrokenMin,
      missingMin: expectedMissingMin,
      reservedNow: actualReservedNow,
      baseAvailableFormula: Math.max(0, actualTotal - actualInRepair - actualBroken - actualMissing),
    };
    const actual = {
      total: actualTotal,
      inRepair: actualInRepair,
      broken: actualBroken,
      missing: actualMissing,
      baseAvailable: actualBaseAvailable,
      availableNow: actualAvailableNow,
    };
    const delta = {
      inRepairVsOpen: actualInRepair - expectedInRepairMin,
      brokenVsOpen: actualBroken - expectedBrokenMin,
      missingVsOpen: actualMissing - expectedMissingMin,
      totalVsBuckets: actualTotal - (actualInRepair + actualBroken + actualMissing),
    };

    const explanation: string[] = [];
    let severity: InventoryAuditSeverity = "OK";

    if (actualTotal < 0 || actualInRepair < 0 || actualBroken < 0 || actualMissing < 0) {
      severity = "CRITICAL";
      explanation.push("Есть отрицательные остатки в buckets.");
    }
    if (actualInRepair + actualBroken + actualMissing > actualTotal) {
      severity = "CRITICAL";
      explanation.push("Сумма inRepair+broken+missing превышает total.");
    }

    if (severity !== "CRITICAL") {
      if (actualInRepair < expectedInRepairMin) {
        severity = "WARNING";
        explanation.push("inRepair меньше, чем требует сумма открытых ремонтов.");
      }
      if (actualBroken < expectedBrokenMin) {
        severity = "WARNING";
        explanation.push("broken меньше, чем требует сумма открытых broken-инцидентов.");
      }
      if (actualMissing < expectedMissingMin) {
        severity = "WARNING";
        explanation.push("missing меньше, чем требует сумма открытых потерь.");
      }
    }

    return {
      itemId: it.id,
      itemName: it.name,
      severity,
      expected,
      actual,
      delta,
      explanation,
    };
  });
}

export async function runInventoryAudit(args: {
  kind: InventoryAuditRunKind;
  createdByUserId?: string | null;
  db?: DbClient;
}) {
  const db = args.db ?? prisma;
  const startedAt = new Date();

  try {
    const items = await computeItemsAudit(db);
    const severity = aggregateSeverity(items);
    const finishedAt = new Date();
    const summary = {
      totalItems: items.length,
      okCount: items.filter((x) => x.severity === "OK").length,
      warningCount: items.filter((x) => x.severity === "WARNING").length,
      criticalCount: items.filter((x) => x.severity === "CRITICAL").length,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    };

    const run = await db.inventoryAuditRun.create({
      data: {
        kind: args.kind,
        severity,
        startedAt,
        finishedAt,
        createdByUserId: args.createdByUserId ?? null,
        summaryJson: summary,
      },
      select: { id: true, severity: true, startedAt: true, finishedAt: true, summaryJson: true },
    });

    if (items.length > 0) {
      await db.inventoryAuditItemResult.createMany({
        data: items.map((x) => ({
          runId: run.id,
          itemId: x.itemId,
          severity: x.severity,
          expectedJson: x.expected,
          actualJson: x.actual,
          deltaJson: x.delta,
          explanationJson: { messages: x.explanation, itemName: x.itemName },
        })),
      });
    }

    return { runId: run.id, severity: run.severity, summary };
  } catch (e) {
    const finishedAt = new Date();
    const errText = e instanceof Error ? e.message : String(e);
    const failed = await db.inventoryAuditRun.create({
      data: {
        kind: args.kind,
        severity: "FAILED",
        startedAt,
        finishedAt,
        createdByUserId: args.createdByUserId ?? null,
        errorText: errText,
        summaryJson: { totalItems: 0, okCount: 0, warningCount: 0, criticalCount: 0 },
      },
      select: { id: true, severity: true, summaryJson: true },
    });
    return { runId: failed.id, severity: failed.severity, summary: failed.summaryJson };
  }
}

export async function getLatestInventoryAuditStatus(db: DbClient = prisma) {
  const row = await db.inventoryAuditRun.findFirst({
    orderBy: [{ startedAt: "desc" }],
    select: {
      id: true,
      severity: true,
      kind: true,
      startedAt: true,
      finishedAt: true,
      summaryJson: true,
      errorText: true,
    },
  });
  return row;
}

export async function cleanupOldInventoryAuditRuns(args?: {
  retentionDays?: number;
  db?: DbClient;
}) {
  const db = args?.db ?? prisma;
  const retentionDays = Math.max(1, args?.retentionDays ?? 21);
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await db.inventoryAuditRun.deleteMany({
    where: {
      startedAt: { lt: cutoff },
    },
  });
  return { deletedRuns: result.count, retentionDays };
}

