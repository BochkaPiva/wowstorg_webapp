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
  const greenwichUsers = await prisma.user.findMany({
    where: { role: "GREENWICH", isActive: true },
    orderBy: [{ displayName: "asc" }, { login: "asc" }],
    select: {
      id: true,
      displayName: true,
      login: true,
      telegramChatId: true,
    },
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
      users: greenwichUsers.map((user) => ({
        id: user.id,
        displayName: user.displayName,
        login: user.login,
        telegramChatId: user.telegramChatId?.trim() || null,
        hasTelegramChatId: Boolean(user.telegramChatId?.trim()),
      })),
    },
  });
}

const PostSchema = z.object({
  kind: z.enum(["warehouse", "dm", "greenwich-broadcast", "greenwich-user"]),
  text: z.string().trim().min(1).max(4000).optional(),
  chatId: z.string().trim().min(1).max(64).optional(), // only for dm
  userId: z.string().trim().min(1).max(64).optional(), // only for greenwich-user
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
      select: {
        id: true,
        displayName: true,
        login: true,
        telegramChatId: true,
      },
    });
    const recipients = users
      .map((user) => ({
        ...user,
        telegramChatId: user.telegramChatId?.trim() || "",
      }))
      .filter((user) => user.telegramChatId);

    if (recipients.length === 0) {
      return jsonError(400, "Нет активных пользователей Grinvich с Telegram Chat ID");
    }

    let sent = 0;
    const failed: Array<{ id: string; displayName: string; login: string; telegramChatId: string }> = [];
    for (const user of recipients) {
      const personalizedText =
        parsed.data.text ??
        `🧪 <b>Тест уведомлений Grinvich</b>\n\nПолучатель: ${user.displayName}\nЛогин: ${user.login}\nTelegram ID: ${user.telegramChatId}\nВремя: ${new Date().toLocaleString("ru-RU")}`;
      const result = await sendTelegramMessageDetailed(user.telegramChatId, personalizedText);
      if (result.ok) sent += 1;
      else {
        failed.push({
          id: user.id,
          displayName: user.displayName,
          login: user.login,
          telegramChatId: user.telegramChatId,
        });
      }
    }
    return jsonOk({
      ok: failed.length === 0,
      sent,
      total: recipients.length,
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

  if (parsed.data.kind === "greenwich-user") {
    const userId = parsed.data.userId;
    if (!userId) return jsonError(400, "userId is required for Greenwich user test");
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        role: "GREENWICH",
        isActive: true,
      },
      select: {
        id: true,
        displayName: true,
        login: true,
        telegramChatId: true,
      },
    });
    if (!user) return jsonError(404, "Пользователь Greenwich не найден или не активен");
    const chatId = user.telegramChatId?.trim();
    if (!chatId) {
      return jsonError(400, `У сотрудника ${user.displayName} не заполнен Telegram Chat ID`);
    }
    const result = await sendTelegramMessageDetailed(
      chatId,
      parsed.data.text ??
        `🧪 <b>Индивидуальный тест уведомлений</b>\n\nПолучатель: ${user.displayName}\nЛогин: ${user.login}\nВремя: ${new Date().toLocaleString("ru-RU")}`,
    );
    if (!result.ok) {
      return jsonError(400, result.error, { hint: "greenwich_user", userId: user.id });
    }
    return jsonOk({
      ok: true,
      recipient: {
        id: user.id,
        displayName: user.displayName,
        login: user.login,
        telegramChatId: chatId,
      },
    });
  }

  const dmChatId = parsed.data.chatId;
  if (!dmChatId) return jsonError(400, "chatId is required for dm");
  const dmResult = await sendTelegramMessageDetailed(dmChatId, text);
  if (!dmResult.ok) {
    return jsonError(400, dmResult.error, { hint: "dm" });
  }
  return jsonOk({ ok: true });
}

