import { z } from "zod";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { readDirectorSettings } from "@/server/telegram-director";
import { DIRECTOR_APPOINTMENT_TEXT, DIRECTOR_KEYBOARD } from "@/server/telegram-director-ui";
import { isTelegramConfigured, sendTelegramMessageDetailed } from "@/server/telegram";

const Input = z.object({ expectedRevision: z.number().int().nonnegative(), directorUserId: z.string().min(1).max(64) }).strict();
export async function POST(req: Request) {
  const auth = await requireRole("WOWSTORG"); if (!auth.ok) return auth.response;
  let body: unknown; try { body = await req.json(); } catch { return jsonError(400, "Не удалось прочитать запрос. Попробуйте ещё раз."); }
  const input = Input.safeParse(body); if (!input.success) return jsonError(400, "Сначала сохраните назначение директора.");
  if (!isTelegramConfigured()) return jsonError(400, "Бот пока не подключён.");
  const { settings, users, boards } = await readDirectorSettings();
  if (settings.revision !== input.data.expectedRevision || settings.directorUserId !== input.data.directorUserId) return jsonError(409, "Назначение изменилось. Обновите страницу перед отправкой.");
  const director = users.find(user => user.id === settings.directorUserId);
  if (!director || !settings.telegramChatId || director.telegramChatId !== settings.telegramChatId || !boards.find(board => board.id === settings.boardId)?.columns.some(column => column.id === settings.columnId)) return jsonError(400, "Проверьте назначение директора, его личный чат и выбранную доску.");
  const result = await sendTelegramMessageDetailed(settings.telegramChatId, DIRECTOR_APPOINTMENT_TEXT, { replyMarkup: DIRECTOR_KEYBOARD });
  if (!result.ok) return jsonError(502, "Сообщение не удалось отправить. Попросите директора открыть бота и нажать «Старт», затем повторите отправку.");
  return jsonOk({ ok: true });
}
