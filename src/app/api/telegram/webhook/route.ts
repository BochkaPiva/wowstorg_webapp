import { z } from "zod";

import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import {
  escapeTelegramHtml,
  getTelegramWebhookSecret,
  sendTelegramMessageDetailed,
} from "@/server/telegram";

const UpdateSchema = z.object({
  message: z
    .object({
      text: z.string().optional(),
      chat: z.object({
        id: z.union([z.string(), z.number()]),
        type: z.string().optional(),
      }),
      from: z
        .object({
          first_name: z.string().optional(),
          last_name: z.string().optional(),
          username: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

function chatIdToString(value: string | number): string {
  return typeof value === "number" ? String(value) : value.trim();
}

function incomingName(update: z.infer<typeof UpdateSchema>): string {
  const from = update.message?.from;
  const fullName = [from?.first_name, from?.last_name].filter(Boolean).join(" ").trim();
  return fullName || from?.username || "сотрудник";
}

function startTextForMatchedGreenwich(displayName: string): string {
  return [
    `👋 <b>Здравствуйте, ${escapeTelegramHtml(displayName)}!</b>`,
    "",
    "Бот Wowstorg подключён к вашему аккаунту Grinvich.",
    "",
    "Теперь сюда будут приходить личные уведомления по вашим заявкам:",
    "• смета отправлена на проверку;",
    "• склад применил скидку или внёс изменения;",
    "• началась сборка;",
    "• заказ выдан;",
    "• приёмка завершена или заявка отменена.",
    "",
    "Если уведомление пришло сюда, значит маршрут настроен правильно.",
  ].join("\n");
}

function startTextForUnknown(chatId: string, name: string): string {
  return [
    `👋 <b>Здравствуйте, ${escapeTelegramHtml(name)}!</b>`,
    "",
    "Я бот уведомлений Wowstorg.",
    "",
    "Пока этот Telegram не привязан к аккаунту Grinvich на сайте.",
    "Передайте администратору ваш Telegram ID:",
    "",
    `<code>${escapeTelegramHtml(chatId)}</code>`,
    "",
    "После привязки в админке вы сможете получать личные уведомления по своим заявкам.",
  ].join("\n");
}

export async function POST(req: Request) {
  const secret = getTelegramWebhookSecret();
  if (!secret) {
    return jsonError(500, "TELEGRAM_WEBHOOK_SECRET is not configured");
  }

  const incomingSecret = req.headers.get("x-telegram-bot-api-secret-token")?.trim();
  if (incomingSecret !== secret) {
    return jsonError(401, "Invalid Telegram webhook secret");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return jsonOk({ ok: true, ignored: "unsupported_update" });

  const update = parsed.data;
  const text = update.message?.text?.trim() ?? "";
  const chatId = update.message?.chat?.id != null ? chatIdToString(update.message.chat.id) : "";
  if (!chatId || !text.startsWith("/start")) {
    return jsonOk({ ok: true, ignored: "not_start" });
  }

  const linkedUser = await prisma.user.findFirst({
    where: {
      role: "GREENWICH",
      isActive: true,
      telegramChatId: chatId,
    },
    select: {
      id: true,
      displayName: true,
      login: true,
    },
  });

  const message = linkedUser
    ? startTextForMatchedGreenwich(linkedUser.displayName)
    : startTextForUnknown(chatId, incomingName(update));
  const result = await sendTelegramMessageDetailed(chatId, message);

  return jsonOk({
    ok: result.ok,
    matched: linkedUser
      ? {
          id: linkedUser.id,
          displayName: linkedUser.displayName,
          login: linkedUser.login,
        }
      : null,
    error: result.ok ? undefined : result.error,
  });
}
