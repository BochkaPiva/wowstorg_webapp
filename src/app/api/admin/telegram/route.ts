import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import {
  getSendTimeoutMs,
  getTelegramProxyLabel,
  getTelegramWebhookSecret,
  getTelegramWebhookUrl,
  getWarehouseChatId,
  getWarehouseTopicId,
  isTelegramConfigured,
  isTelegramProxyConfigured,
  sendTelegramMessageDetailed,
} from "@/server/telegram";
import {
  GREENWICH_CONFIRMATION_CHECKPOINTS,
  greenwichConfirmationKeyboard,
  greenwichConfirmationMessage,
} from "@/server/reminders/greenwich-confirmation";
import {
  buildTelegramTestScenario,
  TELEGRAM_TEST_SCENARIO_IDS,
  TELEGRAM_TEST_SCENARIOS,
} from "@/server/telegram-test-scenarios";
import { ensureGreenwichRatingPolicy } from "@/server/ratings/greenwich-rating";

function serializeRatingPolicy<
  T extends { tiers: Array<{ discountPercent: unknown }> },
>(policy: T) {
  return {
    ...policy,
    tiers: policy.tiers.map((tier) => ({
      ...tier,
      discountPercent: Number(tier.discountPercent),
    })),
  };
}

export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const warehouseChatId = getWarehouseChatId() ?? null;
  const warehouseTopicId = getWarehouseTopicId() ?? null;

  const [
    totalGreenwich,
    greenwichWithTelegram,
    greenwichUsers,
    liveOrders,
    recentConfirmations,
    ratingPolicy,
  ] =
    await Promise.all([
      prisma.user.count({ where: { role: "GREENWICH", isActive: true } }),
      prisma.user.count({
        where: { role: "GREENWICH", isActive: true, telegramChatId: { not: null } },
      }),
      prisma.user.findMany({
        where: { role: "GREENWICH", isActive: true },
        orderBy: [{ displayName: "asc" }, { login: "asc" }],
        select: {
          id: true,
          displayName: true,
          login: true,
          telegramChatId: true,
        },
      }),
      prisma.order.findMany({
        where: {
          source: "GREENWICH_INTERNAL",
          parentOrderId: null,
          status: { notIn: ["CANCELLED", "CLOSED"] },
          greenwichUserId: { not: null },
          greenwichUser: { is: { isActive: true } },
        },
        orderBy: [{ startDate: "asc" }, { updatedAt: "desc" }],
        take: 250,
        select: {
          id: true,
          eventName: true,
          status: true,
          startDate: true,
          endDate: true,
          readyByDate: true,
          greenwichUserId: true,
          customer: { select: { name: true } },
          greenwichUser: {
            select: { id: true, displayName: true, telegramChatId: true },
          },
        },
      }),
      prisma.greenwichOrderReminder.findMany({
        where: { order: { is: { source: "GREENWICH_INTERNAL" } } },
        orderBy: [{ updatedAt: "desc" }],
        take: 24,
        select: {
          id: true,
          checkpoint: true,
          scheduledFor: true,
          sentAt: true,
          lastSentAt: true,
          sendCount: true,
          response: true,
          respondedAt: true,
          telegramChatId: true,
          order: {
            select: {
              id: true,
              eventName: true,
              status: true,
              customer: { select: { name: true } },
              greenwichUser: { select: { id: true, displayName: true } },
            },
          },
        },
      }),
      prisma.$transaction((tx) => ensureGreenwichRatingPolicy(tx)),
    ]);

  return jsonOk({
    telegram: {
      hasBotToken: isTelegramConfigured(),
      warehouseChatId,
      warehouseTopicId,
      webhookUrl: getTelegramWebhookUrl(),
      webhookSecretConfigured: Boolean(getTelegramWebhookSecret()),
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
    liveConfirmation: {
      checkpoints: GREENWICH_CONFIRMATION_CHECKPOINTS.map((entry) => ({
        id: entry.checkpoint,
        daysBefore: entry.daysBefore,
        label: `За ${entry.daysBefore} дн.`,
      })),
      orders: liveOrders.map((order) => ({
        id: order.id,
        eventName: order.eventName,
        customerName: order.customer.name,
        status: order.status,
        startDate: order.startDate,
        endDate: order.endDate,
        readyByDate: order.readyByDate,
        greenwichUserId: order.greenwichUserId,
        greenwichUser: order.greenwichUser
          ? {
              id: order.greenwichUser.id,
              displayName: order.greenwichUser.displayName,
              hasTelegramChatId: Boolean(order.greenwichUser.telegramChatId?.trim()),
            }
          : null,
      })),
      recent: recentConfirmations.map((entry) => ({
        id: entry.id,
        checkpoint: entry.checkpoint,
        scheduledFor: entry.scheduledFor,
        sentAt: entry.sentAt,
        lastSentAt: entry.lastSentAt,
        sendCount: entry.sendCount,
        response: entry.response,
        respondedAt: entry.respondedAt,
        telegramChatId: entry.telegramChatId,
        order: {
          id: entry.order.id,
          eventName: entry.order.eventName,
          customerName: entry.order.customer.name,
          status: entry.order.status,
          greenwichUser: entry.order.greenwichUser,
        },
      })),
    },
    ratingPolicy: serializeRatingPolicy(ratingPolicy),
    scenarios: TELEGRAM_TEST_SCENARIOS.map((scenario) => ({
      ...scenario,
      preview: buildTelegramTestScenario(scenario.id).text,
    })),
  });
}

const RatingPolicySchema = z.object({
  confirmationResponseReward: z.number().int().min(0).max(10),
  repeatMissedPenalty: z.number().int().min(-20).max(0),
  finalMissedPenalty: z.number().int().min(-20).max(0),
  overduePenaltyPerDay: z.number().int().min(-20).max(0),
  overduePenaltyCap: z.number().int().min(-100).max(0),
  perfectReturnReward: z.number().int().min(0).max(20),
  dirtyPenaltyPerUnit: z.number().int().min(-20).max(0),
  repairPenaltyPerUnit: z.number().int().min(-20).max(0),
  brokenPenaltyPerUnit: z.number().int().min(-50).max(0),
  lostPenaltyPerUnit: z.number().int().min(-20).max(0),
  incidentPenaltyCap: z.number().int().min(-100).max(0),
  recoveryGraceDays: z.number().int().min(0).max(365),
  recoveryDurationDays: z.number().int().min(1).max(730),
  tiers: z.array(z.object({
    name: z.string().trim().min(1).max(40),
    minScore: z.number().int().min(0).max(100),
    discountPercent: z.number().min(0).max(60),
    sortOrder: z.number().int().min(0).max(20),
  })).min(2).max(8),
}).superRefine((value, ctx) => {
  const thresholds = value.tiers.map((tier) => tier.minScore);
  if (!thresholds.includes(0)) {
    ctx.addIssue({ code: "custom", path: ["tiers"], message: "Нужен базовый уровень с рейтингом 0" });
  }
  if (new Set(thresholds).size !== thresholds.length) {
    ctx.addIssue({ code: "custom", path: ["tiers"], message: "Порог рейтинга не должен повторяться" });
  }
});

export async function PATCH(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const parsed = RatingPolicySchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  const { tiers, ...policyData } = parsed.data;
  const ratingPolicy = await prisma.$transaction(async (tx) => {
    const current = await ensureGreenwichRatingPolicy(tx);
    await tx.greenwichRatingPolicy.update({
      where: { id: current.id },
      data: policyData,
    });
    await tx.greenwichRatingTier.deleteMany({ where: { policyId: current.id } });
    await tx.greenwichRatingTier.createMany({
      data: [...tiers]
        .sort((a, b) => a.minScore - b.minScore)
        .map((tier, index) => ({ ...tier, sortOrder: index, policyId: current.id })),
    });
    return tx.greenwichRatingPolicy.findUniqueOrThrow({
      where: { id: current.id },
      include: { tiers: { orderBy: [{ minScore: "asc" }] } },
    });
  });
  return jsonOk({ ratingPolicy: serializeRatingPolicy(ratingPolicy) });
}

const PostSchema = z.object({
  kind: z.enum([
    "warehouse",
    "dm",
    "greenwich-broadcast",
    "greenwich-user",
    "greenwich-live-confirmation",
  ]),
  text: z.string().trim().min(1).max(4000).optional(),
  chatId: z.string().trim().min(1).max(64).optional(), // only for dm
  userId: z.string().trim().min(1).max(64).optional(), // only for greenwich-user
  orderId: z.string().trim().min(1).max(64).optional(),
  checkpoint: z.enum(["DAYS_30", "DAYS_7", "DAYS_3"]).optional(),
  scenarioId: z.enum(TELEGRAM_TEST_SCENARIO_IDS).default("connection"),
});

function publicAppUrl(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ||
    "https://wowstorg.example.com";
  return `${base}${path}`;
}

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

  if (parsed.data.kind === "greenwich-live-confirmation") {
    if (!getTelegramWebhookSecret()) {
      return jsonError(
        400,
        "TELEGRAM_WEBHOOK_SECRET is missing: live buttons cannot be processed",
      );
    }
    const { userId, orderId, checkpoint } = parsed.data;
    if (!userId || !orderId || !checkpoint) {
      return jsonError(400, "userId, orderId and checkpoint are required for live confirmation");
    }

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        source: "GREENWICH_INTERNAL",
        parentOrderId: null,
        status: { notIn: ["CANCELLED", "CLOSED"] },
        greenwichUserId: userId,
        greenwichUser: { is: { role: "GREENWICH", isActive: true } },
      },
      select: {
        id: true,
        eventName: true,
        startDate: true,
        endDate: true,
        rentalStartPartOfDay: true,
        rentalEndPartOfDay: true,
        customer: { select: { name: true } },
        greenwichUser: {
          select: { id: true, displayName: true, login: true, telegramChatId: true },
        },
      },
    });
    if (!order?.greenwichUser) {
      return jsonError(404, "Активная заявка не найдена или назначена другому сотруднику Greenwich");
    }
    const chatId = order.greenwichUser.telegramChatId?.trim();
    if (!chatId) {
      return jsonError(
        400,
        `У сотрудника ${order.greenwichUser.displayName} не заполнен Telegram Chat ID`,
      );
    }

    const checkpointConfig = GREENWICH_CONFIRMATION_CHECKPOINTS.find(
      (entry) => entry.checkpoint === checkpoint,
    );
    if (!checkpointConfig) return jsonError(400, "Unsupported confirmation checkpoint");

    const previous = await prisma.greenwichOrderReminder.findUnique({
      where: { orderId_checkpoint: { orderId: order.id, checkpoint } },
      select: {
        id: true,
        scheduledFor: true,
        sentAt: true,
        lastSentAt: true,
        sendCount: true,
        telegramChatId: true,
        response: true,
        respondedAt: true,
        respondedByTelegramId: true,
      },
    });
    const armedAt = new Date();
    const journal = await prisma.greenwichOrderReminder.upsert({
      where: { orderId_checkpoint: { orderId: order.id, checkpoint } },
      create: {
        orderId: order.id,
        checkpoint,
        scheduledFor: armedAt,
        telegramChatId: chatId,
      },
      update: {
        scheduledFor: armedAt,
        sentAt: null,
        lastSentAt: null,
        sendCount: 0,
        telegramChatId: chatId,
        response: null,
        respondedAt: null,
        respondedByTelegramId: null,
      },
    });

    const message = greenwichConfirmationMessage({
      eventName: order.eventName,
      customerName: order.customer.name,
      startDate: order.startDate,
      endDate: order.endDate,
      rentalStartPartOfDay: order.rentalStartPartOfDay,
      rentalEndPartOfDay: order.rentalEndPartOfDay,
      daysBefore: checkpointConfig.daysBefore,
      orderUrl: publicAppUrl(`/orders/${order.id}`),
    });
    const result = await sendTelegramMessageDetailed(chatId, message, {
      replyMarkup: greenwichConfirmationKeyboard({ orderId: order.id, checkpoint }),
    });
    if (!result.ok) {
      if (previous) {
        await prisma.greenwichOrderReminder.updateMany({
          where: { id: journal.id, response: null, sentAt: null },
          data: {
            scheduledFor: previous.scheduledFor,
            sentAt: previous.sentAt,
            lastSentAt: previous.lastSentAt,
            sendCount: previous.sendCount,
            telegramChatId: previous.telegramChatId,
            response: previous.response,
            respondedAt: previous.respondedAt,
            respondedByTelegramId: previous.respondedByTelegramId,
          },
        });
      } else {
        await prisma.greenwichOrderReminder.deleteMany({
          where: { id: journal.id, response: null, sentAt: null },
        });
      }
      return jsonError(400, result.error, { hint: "greenwich_live_confirmation" });
    }

    const sentAt = new Date();
    await prisma.greenwichOrderReminder.update({
      where: { id: journal.id },
      data: { sentAt, lastSentAt: sentAt, sendCount: 1 },
    });
    return jsonOk({
      ok: true,
      liveConfirmation: {
        reminderId: journal.id,
        orderId: order.id,
        checkpoint,
        sentAt,
        recipient: {
          id: order.greenwichUser.id,
          displayName: order.greenwichUser.displayName,
          login: order.greenwichUser.login,
          telegramChatId: chatId,
        },
      },
    });
  }

  const baseScenario = buildTelegramTestScenario(parsed.data.scenarioId);
  const text = parsed.data.text ?? baseScenario.text;

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
      const personalizedScenario = buildTelegramTestScenario(
        parsed.data.scenarioId,
        user.displayName,
      );
      const personalizedText = parsed.data.text ?? personalizedScenario.text;
      const result = await sendTelegramMessageDetailed(user.telegramChatId, personalizedText, {
        replyMarkup: personalizedScenario.replyMarkup,
      });
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
      replyMarkup: baseScenario.replyMarkup,
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
    const personalizedScenario = buildTelegramTestScenario(
      parsed.data.scenarioId,
      user.displayName,
    );
    const result = await sendTelegramMessageDetailed(
      chatId,
      parsed.data.text ?? personalizedScenario.text,
      { replyMarkup: personalizedScenario.replyMarkup },
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
  const dmResult = await sendTelegramMessageDetailed(dmChatId, text, {
    replyMarkup: baseScenario.replyMarkup,
  });
  if (!dmResult.ok) {
    return jsonError(400, dmResult.error, { hint: "dm" });
  }
  return jsonOk({ ok: true });
}

