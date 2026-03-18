import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import {
  getWarehouseChatId,
  getWarehouseTopicId,
  isTelegramConfigured,
  sendTelegramMessage,
} from "@/server/telegram";

export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const warehouseChatId = getWarehouseChatId() ?? null;
  const warehouseTopicId = getWarehouseTopicId() ?? null;

  const totalGreenwich = await prisma.user.count({
    where: { role: "GREENWICH", isActive: true },
  });
  const greenwichWithTelegram = await prisma.user.count({
    where: { role: "GREENWICH", isActive: true, telegramChatId: { not: null } },
  });

  return jsonOk({
    telegram: {
      hasBotToken: isTelegramConfigured(),
      warehouseChatId,
      warehouseTopicId,
    },
    greenwich: {
      activeUsers: totalGreenwich,
      withTelegramChatId: greenwichWithTelegram,
    },
  });
}

const PostSchema = z.object({
  kind: z.enum(["warehouse", "dm"]),
  text: z.string().trim().min(1).max(4000).optional(),
  chatId: z.string().trim().min(1).max(64).optional(), // only for dm
});

export async function POST(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  if (!isTelegramConfigured()) {
    return jsonError(400, "TELEGRAM_BOT_TOKEN is missing");
  }

  const text =
    parsed.data.text ??
    `🧪 <b>Тест уведомлений</b>\n\nВремя: ${new Date().toLocaleString("ru-RU")}`;

  if (parsed.data.kind === "warehouse") {
    const chatId = getWarehouseChatId();
    if (!chatId) return jsonError(400, "Warehouse chat id is missing (TELEGRAM_NOTIFICATION_CHAT_ID)");
    const topicId = getWarehouseTopicId();
    const ok = await sendTelegramMessage(chatId, text, {
      messageThreadId: topicId ? parseInt(topicId, 10) : undefined,
    });
    if (!ok) return jsonError(400, "Telegram send failed (check bot permissions/chatId/topicId)");
    return jsonOk({ ok: true });
  }

  const dmChatId = parsed.data.chatId;
  if (!dmChatId) return jsonError(400, "chatId is required for dm");
  const ok = await sendTelegramMessage(dmChatId, text);
  if (!ok) return jsonError(400, "Telegram send failed (user might not have started the bot yet)");
  return jsonOk({ ok: true });
}

