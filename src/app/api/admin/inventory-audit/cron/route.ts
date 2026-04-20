import { jsonError, jsonOk } from "@/server/http";
import { prisma } from "@/server/db";
import { cleanupOldInventoryAuditRuns, getLatestInventoryAuditStatus, runInventoryAudit } from "@/server/inventory-audit";

export const dynamic = "force-dynamic";

function readLegacyCronToken(req: Request): string | null {
  return req.headers.get("x-cron-token")?.trim() ?? null;
}

function readBearerToken(req: Request): string | null {
  const raw = req.headers.get("authorization")?.trim();
  if (!raw) return null;
  const prefix = "Bearer ";
  if (!raw.startsWith(prefix)) return null;
  return raw.slice(prefix.length).trim() || null;
}

function isCronAuthorized(req: Request): { ok: true } | { ok: false; message: string; status: number } {
  const legacyExpected = process.env.INVENTORY_AUDIT_CRON_TOKEN?.trim() || null;
  const vercelExpected = process.env.CRON_SECRET?.trim() || null;
  const legacyGot = readLegacyCronToken(req);
  const bearerGot = readBearerToken(req);

  if (!legacyExpected && !vercelExpected) {
    return { ok: false, status: 500, message: "INVENTORY_AUDIT_CRON_TOKEN or CRON_SECRET not set" };
  }

  if (vercelExpected && bearerGot === vercelExpected) return { ok: true };
  if (legacyExpected && legacyGot === legacyExpected) return { ok: true };

  return { ok: false, status: 403, message: "Forbidden" };
}

function omskDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Omsk",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

async function handleCron(req: Request) {
  const auth = isCronAuthorized(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);

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

export async function GET(req: Request) {
  return handleCron(req);
}

export async function POST(req: Request) {
  return handleCron(req);
}

