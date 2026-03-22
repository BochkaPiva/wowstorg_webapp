import { after } from "next/server";

/**
 * Выполняет задачу **после** отправки HTTP-ответа клиенту (`next/server` `after`).
 * Используется для Telegram: кнопки не ждут сеть до `api.telegram.org`.
 */
export function scheduleAfterResponse(taskName: string, fn: () => Promise<void>): void {
  after(async () => {
    try {
      await fn();
    } catch (e) {
      console.error(`[${taskName}] deferred task failed:`, e);
    }
  });
}
