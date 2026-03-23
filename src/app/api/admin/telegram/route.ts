import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import {
  getSendTimeoutMs,
  getTelegramProxyLabel,
  getWarehouseChatId,
  getWarehouseTopicId,
  isTelegramConfigured,
  isTelegramProxyConfigured,
  sendTelegramMessageDetailed,
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
      sendTimeoutMs: getSendTimeoutMs(),
      proxyEnabled: isTelegramProxyConfigured(),
      proxyLabel: getTelegramProxyLabel(),
    },
    greenwich: {
      activeUsers: totalGreenwich,
      withTelegramChatId: greenwichWithTelegram,
    },
  });
}

const PostSchema = z.object({
  kind: z.enum(["warehouse", "dm", "greenwich-broadcast"]),
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

  if (parsed.data.kind === "greenwich-broadcast") {
    const users = await prisma.user.findMany({
      where: {
        role: "GREENWICH",
        isActive: true,
        telegramChatId: { not: null },
      },
      select: { telegramChatId: true },
    });
    const chatIds = Array.from(
      new Set(
        users
          .map((u) => (u.telegramChatId ?? "").trim())
          .filter(Boolean),
      ),
    );
    if (chatIds.length === 0) {
      return jsonError(400, "Нет активных пользователей Grinvich с Telegram Chat ID");
    }

    let sent = 0;
    const failed: string[] = [];
    for (const chatId of chatIds) {
      const result = await sendTelegramMessageDetailed(chatId, text);
      if (result.ok) sent += 1;
      else failed.push(chatId);
    }
    return jsonOk({
      ok: failed.length === 0,
      sent,
      total: chatIds.length,
      failed,
    });
  }

  if (parsed.data.kind === "warehouse") {
    const chatId = getWarehouseChatId();
    if (!chatId) return jsonError(400, "Warehouse chat id is missing (TELEGRAM_NOTIFICATION_CHAT_ID)");
    const topicId = getWarehouseTopicId();
    const result = await sendTelegramMessageDetailed(chatId, text, {
      messageThreadId: topicId ? parseInt(topicId, 10) : undefined,
    });
    if (!result.ok) {
      return jsonError(400, result.error, { hint: "warehouse_group" });
    }
    return jsonOk({ ok: true });
  }

  const dmChatId = parsed.data.chatId;
  if (!dmChatId) return jsonError(400, "chatId is required for dm");
  const dmResult = await sendTelegramMessageDetailed(dmChatId, text);
  if (!dmResult.ok) {
    return jsonError(400, dmResult.error, { hint: "dm" });
  }
  return jsonOk({ ok: true });
}

