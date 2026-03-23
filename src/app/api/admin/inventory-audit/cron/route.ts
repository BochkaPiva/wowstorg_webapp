import { jsonError, jsonOk } from "@/server/http";
import { prisma } from "@/server/db";
import { cleanupOldInventoryAuditRuns, getLatestInventoryAuditStatus, runInventoryAudit } from "@/server/inventory-audit";

export const dynamic = "force-dynamic";

function readCronToken(req: Request): string | null {
  return req.headers.get("x-cron-token")?.trim() ?? null;
}

function omskDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Omsk",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export async function POST(req: Request) {
  const expected = process.env.INVENTORY_AUDIT_CRON_TOKEN?.trim();
  const got = readCronToken(req);
  if (!expected) return jsonError(500, "INVENTORY_AUDIT_CRON_TOKEN not set");
  if (!got || got !== expected) return jsonError(403, "Forbidden");

  const lockRows = await prisma.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_lock(921480015331) AS locked
  `;
  const locked = lockRows[0]?.locked === true;
  if (!locked) {
    return jsonOk({ ok: true, skipped: true, reason: "Another inventory audit cron is already running" });
  }

  try {
    const latest = await getLatestInventoryAuditStatus();
    if (latest?.startedAt && omskDayKey(new Date(latest.startedAt)) === omskDayKey(new Date())) {
      const retentionDays = Math.max(1, Number.parseInt(process.env.INVENTORY_AUDIT_RETENTION_DAYS ?? "21", 10) || 21);
      const cleanup = await cleanupOldInventoryAuditRuns({ retentionDays });
      return jsonOk({
        ok: true,
        skipped: true,
        reason: "Daily run already exists for today",
        latest,
        cleanup,
      });
    }

    const result = await runInventoryAudit({ kind: "AUTO" });
    const retentionDays = Math.max(1, Number.parseInt(process.env.INVENTORY_AUDIT_RETENTION_DAYS ?? "21", 10) || 21);
    const cleanup = await cleanupOldInventoryAuditRuns({ retentionDays });
    return jsonOk({ ok: true, skipped: false, ...result, cleanup });
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(921480015331)`;
  }
}

