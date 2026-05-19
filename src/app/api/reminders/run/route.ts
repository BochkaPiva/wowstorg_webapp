import { runDailyReminders } from "@/server/reminders/reminder-runner";
import { jsonError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

function readCronToken(req: Request): string | null {
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
  const remindersExpected = process.env.REMINDERS_CRON_TOKEN?.trim() || null;
  const vercelExpected = process.env.CRON_SECRET?.trim() || null;
  const tokenGot = readCronToken(req);
  const bearerGot = readBearerToken(req);

  if (!remindersExpected && !vercelExpected) {
    return { ok: false, status: 500, message: "REMINDERS_CRON_TOKEN or CRON_SECRET not set" };
  }

  if (remindersExpected && tokenGot === remindersExpected) return { ok: true };
  if (vercelExpected && bearerGot === vercelExpected) return { ok: true };

  return { ok: false, status: 403, message: "Forbidden" };
}

async function handleRun() {
  try {
    const result = await runDailyReminders(new Date());
    return jsonOk({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка выполнения напоминаний";
    return jsonError(500, message);
  }
}

/** Ручной/внешний cron: POST + x-cron-token */
export async function POST(req: Request) {
  const auth = isCronAuthorized(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);
  return handleRun();
}

/** Vercel Cron: GET + Authorization: Bearer CRON_SECRET */
export async function GET(req: Request) {
  const auth = isCronAuthorized(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);
  return handleRun();
}
