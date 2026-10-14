import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { configureTelegramDirectorMenu, isTelegramConfigured } from "@/server/telegram";
import { DirectorConfigurationError, DirectorSettingsSchema, readDirectorSettings, saveDirectorSettings } from "@/server/telegram-director";

export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  return jsonOk(await readDirectorSettings());
}

export async function PATCH(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  let body: unknown;
  try { body = await req.json(); } catch { return jsonError(400, "Invalid JSON"); }
  const input = DirectorSettingsSchema.safeParse(body);
  if (!input.success) return jsonError(400, "Проверьте настройки директора", input.error.flatten());
  try {
    const result = await saveDirectorSettings(input.data);
    scheduleAfterResponse("syncTelegramDirectorMenu", async () => {
      if (result.oldChatId && result.oldChatId !== result.saved.telegramChatId) await configureTelegramDirectorMenu(result.oldChatId, false);
      if (result.saved.telegramChatId) {
        const menu = await configureTelegramDirectorMenu(result.saved.telegramChatId);
        if (!menu.ok) console.warn("[telegram-director] menu setup failed", menu.error);
      }
    });
    return jsonOk({ revision: result.saved.revision });
  } catch (cause) {
    if (cause instanceof DirectorConfigurationError) return jsonError(409, cause.message);
    throw cause;
  }
}

/** Explicit retry of menu provisioning; does not create a task or send a DM. */
export async function POST() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  if (!isTelegramConfigured()) return jsonError(400, "Токен Telegram-бота не настроен");
  const { settings, users } = await readDirectorSettings();
  const director = users.find(user => user.id === settings.directorUserId);
  if (!director || !settings.telegramChatId || director.telegramChatId !== settings.telegramChatId) return jsonError(400, "Сначала назначьте директора и его Telegram ID");
  const result = await configureTelegramDirectorMenu(settings.telegramChatId);
  return result.ok ? jsonOk({ ok: true }) : jsonError(502, result.error);
}
