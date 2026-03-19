import { runDailyReminders } from "@/server/reminders/reminder-runner";
import { jsonError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

function readCronToken(req: Request): string | null {
  return req.headers.get("x-cron-token")?.trim() ?? null;
}

export async function POST(req: Request) {
  const expected = process.env.REMINDERS_CRON_TOKEN?.trim();
  const got = readCronToken(req);

  // Если токен не задан — в бою это небезопасно.
  // В дев-режиме можно указать ENV или вызывать вручную после настройки токена.
  if (!expected) {
    return jsonError(500, "REMINDERS_CRON_TOKEN not set");
  }
  if (!got || got !== expected) {
    return jsonError(403, "Forbidden");
  }

  try {
    const result = await runDailyReminders(new Date());
    return jsonOk({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка выполнения напоминаний";
    return jsonError(500, message);
  }
}

