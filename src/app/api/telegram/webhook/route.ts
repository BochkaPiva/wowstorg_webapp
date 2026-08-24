import { ProjectActivityKind } from "@prisma/client";
import { z } from "zod";

import { recomputeGreenwichAchievements } from "@/server/achievements/service";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { notifyWarehouseOrderInApp } from "@/server/notifications/in-app";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { appendProjectActivityLog } from "@/server/projects/activity-log";
import {
  addGreenwichRatingEvent,
  ensureGreenwichRatingPolicy,
} from "@/server/ratings/greenwich-rating";
import { restoreGreenwichMonthlyBonusForCancelledOrder } from "@/server/ratings/greenwich-bonuses";
import { approveGreenwichEstimate } from "@/server/orders/approve-estimate";
import { declareOrderReturn } from "@/server/orders/declare-return";
import { saveGreenwichServiceFeedback } from "@/server/orders/service-feedback";
import {
  greenwichCancellationKeyboard,
  greenwichConfirmationKeyboard,
  parseGreenwichConfirmationCallback,
} from "@/server/reminders/greenwich-confirmation";
import {
  answerTelegramCallbackQuery,
  editTelegramMessageReplyMarkup,
  escapeTelegramHtml,
  getWarehouseChatId,
  getWarehouseTopicId,
  getTelegramWebhookSecret,
  sendTelegramMessage,
  sendTelegramMessageDetailed,
} from "@/server/telegram";
import { TELEGRAM_TEST_CALLBACK_PREFIX } from "@/server/telegram-test-scenarios";
import {
  parseGreenwichOrderActionCallback,
  type GreenwichOrderAction,
} from "@/server/telegram-order-actions";

const UpdateSchema = z.object({
  message: z
    .object({
      text: z.string().optional(),
      message_thread_id: z.number().optional(),
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
  callback_query: z
    .object({
      id: z.string(),
      data: z.string().optional(),
      from: z.object({
        id: z.union([z.string(), z.number()]),
      }),
      message: z
        .object({
          message_id: z.number(),
          chat: z.object({
            id: z.union([z.string(), z.number()]),
          }),
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

function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") || "https://wowstorg.example.com";
  return `${base}${path}`;
}

function warehouseTelegramOptions() {
  const topicId = getWarehouseTopicId();
  if (!topicId) return undefined;
  const parsed = Number.parseInt(topicId, 10);
  return Number.isFinite(parsed) ? { messageThreadId: parsed } : undefined;
}

async function acknowledgeCallback(args: {
  callbackQueryId: string;
  text: string;
  showAlert?: boolean;
}): Promise<void> {
  await answerTelegramCallbackQuery(args);
}

async function handleGreenwichOrderActionCallback(
  callback: NonNullable<z.infer<typeof UpdateSchema>["callback_query"]>,
  action: GreenwichOrderAction,
) {
  const message = callback.message;
  if (!message) return jsonOk({ ok: true, ignored: "callback_without_message" });
  const chatId = chatIdToString(message.chat.id);
  const telegramUserId = chatIdToString(callback.from.id);
  const linkedUser = await prisma.user.findFirst({
    where: {
      role: "GREENWICH",
      isActive: true,
      telegramChatId: chatId,
    },
    select: { id: true },
  });
  if (!linkedUser || telegramUserId !== chatId) {
    await acknowledgeCallback({
      callbackQueryId: callback.id,
      text: "Эта заявка привязана к другому аккаунту",
      showAlert: true,
    });
    return jsonOk({ ok: true, ignored: "callback_owner_mismatch" });
  }

  if (action.action === "approve-estimate") {
    const result = await approveGreenwichEstimate({
      orderId: action.orderId,
      greenwichUserId: linkedUser.id,
    });
    if (!result.ok) {
      if (result.code === "INVALID_STATUS" || result.code === "CONFLICT") {
        await editTelegramMessageReplyMarkup({ chatId, messageId: message.message_id });
      }
      await acknowledgeCallback({
        callbackQueryId: callback.id,
        text: result.message,
        showAlert: result.code !== "INVALID_STATUS",
      });
      return jsonOk({ ok: true, approved: false, reason: result.code });
    }

    await editTelegramMessageReplyMarkup({ chatId, messageId: message.message_id });
    await acknowledgeCallback({ callbackQueryId: callback.id, text: "Смета согласована" });
    const fullOrder = result.order;
    type NotifyApproved = typeof import("@/server/notifications/order-notifications").notifyEstimateApproved;
    const payload = fullOrder as Parameters<NotifyApproved>[0];
    scheduleAfterResponse("notifyEstimateApprovedFromTelegram", async () => {
      const { notifyEstimateApproved } = await import("@/server/notifications/order-notifications");
      await notifyEstimateApproved(payload);
      await notifyWarehouseOrderInApp({
        orderId: fullOrder.id,
        title: "Смета согласована в Telegram",
        body: `Заказчик: ${fullOrder.customer.name}`,
      });
    });
    return jsonOk({ ok: true, approved: true });
  }

  if (action.action === "declare-return-ok") {
    const result = await declareOrderReturn({
      orderId: action.orderId,
      actor: { userId: linkedUser.id, role: "GREENWICH" },
    });
    if (!result.ok) {
      if (result.code === "INVALID_STATUS" || result.code === "CONFLICT") {
        await editTelegramMessageReplyMarkup({ chatId, messageId: message.message_id });
      }
      await acknowledgeCallback({
        callbackQueryId: callback.id,
        text: result.message,
        showAlert: result.code !== "INVALID_STATUS" && result.code !== "CONFLICT",
      });
      return jsonOk({ ok: true, returnDeclared: false, reason: result.code });
    }

    await editTelegramMessageReplyMarkup({ chatId, messageId: message.message_id });
    await acknowledgeCallback({ callbackQueryId: callback.id, text: "Возврат отправлен на приёмку" });
    const fullOrder = result.order;
    type NotifyReturn = typeof import("@/server/notifications/order-notifications").notifyReturnDeclared;
    const payload = fullOrder as Parameters<NotifyReturn>[0];
    scheduleAfterResponse("notifyReturnDeclaredFromTelegram", async () => {
      const { notifyReturnDeclared } = await import("@/server/notifications/order-notifications");
      await notifyReturnDeclared(payload);
      await notifyWarehouseOrderInApp({
        orderId: fullOrder.id,
        title: "Возврат отправлен из Telegram",
        body: `${fullOrder.customer.name}: все позиции отмечены «В норме»`,
      });
    });
    return jsonOk({ ok: true, returnDeclared: true });
  }

  if (action.action === "rate-service") {
    const result = await saveGreenwichServiceFeedback({
      orderId: action.orderId,
      greenwichUserId: linkedUser.id,
      rating: action.rating,
    });
    if (!result.ok) {
      if (result.code === "NOT_FOUND") {
        await editTelegramMessageReplyMarkup({ chatId, messageId: message.message_id });
      }
      await acknowledgeCallback({
        callbackQueryId: callback.id,
        text: result.message,
        showAlert: true,
      });
      return jsonOk({ ok: true, rated: false, reason: result.code });
    }

    await editTelegramMessageReplyMarkup({ chatId, messageId: message.message_id });
    await acknowledgeCallback({ callbackQueryId: callback.id, text: `Спасибо! Оценка ${action.rating}★ сохранена` });
    scheduleAfterResponse("notifyServiceFeedbackFromTelegram", async () => {
      await notifyWarehouseOrderInApp({
        orderId: action.orderId,
        title: `Новая оценка заявки: ${action.rating} из 5`,
        body: "Оценка оставлена сотрудником Grinvich в Telegram",
      });
    });
    return jsonOk({ ok: true, rated: true });
  }

  return jsonOk({ ok: true, ignored: "unsupported_order_action" });
}

async function notifyWarehouseAboutUpcomingChanges(args: {
  orderId: string;
  eventName: string | null;
  customerName: string;
  greenwichName: string;
}): Promise<void> {
  const title = args.eventName?.trim() || args.customerName;
  const warehouseChatId = getWarehouseChatId();
  if (warehouseChatId) {
    await sendTelegramMessage(
      warehouseChatId,
      [
        "✏️ <b>Greenwich предупредил о будущих правках</b>",
        "",
        `${escapeTelegramHtml(args.greenwichName)} сообщил, что по заявке появятся изменения.`,
        `Заявка: <b>${escapeTelegramHtml(title)}</b>`,
        `Заказчик: ${escapeTelegramHtml(args.customerName)}`,
        "",
        "Пока состав заявки не изменён — это ранний сигнал, чтобы не потерять правки.",
        `<a href="${appUrl(`/orders/${args.orderId}`)}">Открыть заявку</a>`,
      ].join("\n"),
      warehouseTelegramOptions(),
    );
  }
  await notifyWarehouseOrderInApp({
    orderId: args.orderId,
    title: "Greenwich сообщил о будущих правках",
    body: `${args.greenwichName}: ${title}. Состав заявки пока не изменён.`,
  });
}

async function notifyWarehouseAboutGreenwichConfirmation(args: {
  orderId: string;
  eventName: string | null;
  customerName: string;
  greenwichName: string;
}): Promise<void> {
  const title = args.eventName?.trim() || args.customerName;
  const warehouseChatId = getWarehouseChatId();
  if (warehouseChatId) {
    await sendTelegramMessage(
      warehouseChatId,
      [
        "✅ <b>Greenwich подтвердил заявку</b>",
        "",
        `${escapeTelegramHtml(args.greenwichName)} подтвердил, что всё остаётся в силе.`,
        `Заявка: <b>${escapeTelegramHtml(title)}</b>`,
        `Заказчик: ${escapeTelegramHtml(args.customerName)}`,
        "",
        `<a href="${appUrl(`/orders/${args.orderId}`)}">Открыть заявку</a>`,
      ].join("\n"),
      warehouseTelegramOptions(),
    );
  }
  await notifyWarehouseOrderInApp({
    orderId: args.orderId,
    title: "Greenwich подтвердил актуальность",
    body: `${args.greenwichName}: ${title}. Всё остаётся в силе.`,
  });
}

async function handleGreenwichConfirmationCallback(
  callback: NonNullable<z.infer<typeof UpdateSchema>["callback_query"]>,
) {
  const parsedCallback = callback.data
    ? parseGreenwichConfirmationCallback(callback.data)
    : null;
  const message = callback.message;
  if (!parsedCallback || !message) {
    await acknowledgeCallback({
      callbackQueryId: callback.id,
      text: "Эта кнопка больше не поддерживается",
      showAlert: true,
    });
    return jsonOk({ ok: true, ignored: "unsupported_callback" });
  }

  const chatId = chatIdToString(message.chat.id);
  const telegramUserId = chatIdToString(callback.from.id);
  const reminder = await prisma.greenwichOrderReminder.findUnique({
    where: {
      orderId_checkpoint: {
        orderId: parsedCallback.orderId,
        checkpoint: parsedCallback.checkpoint,
      },
    },
    select: {
      id: true,
      response: true,
      telegramChatId: true,
      order: {
        select: {
          id: true,
          status: true,
          source: true,
          greenwichUserId: true,
          projectId: true,
          eventName: true,
          customer: { select: { name: true } },
          greenwichUser: {
            select: { displayName: true, telegramChatId: true },
          },
        },
      },
    },
  });

  const assignedChatId = reminder?.order.greenwichUser?.telegramChatId?.trim();
  const isValidOwner =
    reminder?.order.source === "GREENWICH_INTERNAL" &&
    reminder.telegramChatId === chatId &&
    assignedChatId === chatId &&
    telegramUserId === chatId;
  if (!reminder || !isValidOwner) {
    await acknowledgeCallback({
      callbackQueryId: callback.id,
      text: "Эта заявка привязана к другому аккаунту",
      showAlert: true,
    });
    return jsonOk({ ok: true, ignored: "callback_owner_mismatch" });
  }

  if (reminder.response) {
    await editTelegramMessageReplyMarkup({
      chatId,
      messageId: message.message_id,
    });
    await acknowledgeCallback({
      callbackQueryId: callback.id,
      text: "Ответ уже сохранён",
    });
    return jsonOk({ ok: true, repeated: true });
  }

  if (parsedCallback.action === "cancel") {
    await editTelegramMessageReplyMarkup({
      chatId,
      messageId: message.message_id,
      replyMarkup: greenwichCancellationKeyboard({
        orderId: parsedCallback.orderId,
        checkpoint: parsedCallback.checkpoint,
      }),
    });
    await acknowledgeCallback({
      callbackQueryId: callback.id,
      text: "Подтвердите отмену",
    });
    return jsonOk({ ok: true, confirmationRequired: true });
  }

  if (parsedCallback.action === "back") {
    await editTelegramMessageReplyMarkup({
      chatId,
      messageId: message.message_id,
      replyMarkup: greenwichConfirmationKeyboard({
        orderId: parsedCallback.orderId,
        checkpoint: parsedCallback.checkpoint,
      }),
    });
    await acknowledgeCallback({
      callbackQueryId: callback.id,
      text: "Отмена не выполнена",
    });
    return jsonOk({ ok: true, cancelledConfirmation: true });
  }

  if (parsedCallback.action === "ok" || parsedCallback.action === "chg") {
    const response = parsedCallback.action === "ok" ? "CONFIRMED" : "CHANGES_PENDING";
    const respondedAt = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.greenwichOrderReminder.updateMany({
        where: { id: reminder.id, response: null },
        data: {
          response,
          respondedAt,
          respondedByTelegramId: telegramUserId,
        },
      });
      if (result.count > 0 && reminder.order.greenwichUserId) {
        const policy = await ensureGreenwichRatingPolicy(tx);
        await addGreenwichRatingEvent(tx, {
          userId: reminder.order.greenwichUserId,
          type: "CONFIRMATION_RESPONDED",
          delta: policy.confirmationResponseReward,
          reason:
            parsedCallback.action === "ok"
              ? `Вовремя подтверждена заявка «${reminder.order.eventName?.trim() || reminder.order.customer.name}»`
              : `Вовремя заявлены будущие изменения по заявке «${reminder.order.eventName?.trim() || reminder.order.customer.name}»`,
          sourceKey: `greenwich-confirmation:${reminder.id}:responded`,
          orderId: reminder.order.id,
          reminderId: reminder.id,
          recoverable: false,
          now: respondedAt,
        });
      }
      return result;
    });
    if (updated.count === 0) {
      await acknowledgeCallback({ callbackQueryId: callback.id, text: "Ответ уже сохранён" });
      return jsonOk({ ok: true, repeated: true });
    }

    await editTelegramMessageReplyMarkup({ chatId, messageId: message.message_id });
    await acknowledgeCallback({
      callbackQueryId: callback.id,
      text: parsedCallback.action === "ok" ? "Спасибо, заявка подтверждена" : "Спасибо, склад предупреждён",
    });
    if (parsedCallback.action === "ok") {
      scheduleAfterResponse("notifyWarehouseAboutGreenwichConfirmation", async () => {
        await notifyWarehouseAboutGreenwichConfirmation({
          orderId: reminder.order.id,
          eventName: reminder.order.eventName,
          customerName: reminder.order.customer.name,
          greenwichName: reminder.order.greenwichUser?.displayName ?? "Greenwich",
        });
      });
    } else {
      scheduleAfterResponse("notifyWarehouseAboutUpcomingGreenwichChanges", async () => {
        await notifyWarehouseAboutUpcomingChanges({
          orderId: reminder.order.id,
          eventName: reminder.order.eventName,
          customerName: reminder.order.customer.name,
          greenwichName: reminder.order.greenwichUser?.displayName ?? "Greenwich",
        });
      });
    }
    return jsonOk({ ok: true, response });
  }

  const cancellation = await prisma.$transaction(async (tx) => {
    const freshOrder = await tx.order.findUnique({
      where: { id: reminder.order.id },
      select: {
        id: true,
        status: true,
        projectId: true,
        greenwichUserId: true,
      },
    });
    if (!freshOrder || freshOrder.status === "CLOSED") {
      return { cancelled: false as const, reason: freshOrder ? "closed" : "missing" };
    }

    const affectedOrders = await tx.order.findMany({
      where: {
        OR: [{ id: freshOrder.id }, { parentOrderId: freshOrder.id }],
        status: { notIn: ["CANCELLED", "CLOSED"] },
      },
      select: {
        id: true,
        status: true,
        greenwichUserId: true,
        greenwichMonthlyBonusId: true,
      },
    });

    await tx.order.updateMany({
      where: {
        OR: [{ id: freshOrder.id }, { parentOrderId: freshOrder.id }],
        status: { notIn: ["CANCELLED", "CLOSED"] },
      },
      data: { status: "CANCELLED" },
    });
    for (const affectedOrder of affectedOrders) {
      await restoreGreenwichMonthlyBonusForCancelledOrder(tx, {
        orderId: affectedOrder.id,
        orderStatus: affectedOrder.status,
        userId: affectedOrder.greenwichUserId,
        bonusId: affectedOrder.greenwichMonthlyBonusId,
      });
    }
    const reminderUpdate = await tx.greenwichOrderReminder.updateMany({
      where: { id: reminder.id, response: null },
      data: {
        response: "CANCELLED",
        respondedAt: new Date(),
        respondedByTelegramId: telegramUserId,
      },
    });
    if (reminderUpdate.count > 0 && freshOrder.greenwichUserId) {
      const policy = await ensureGreenwichRatingPolicy(tx);
      await addGreenwichRatingEvent(tx, {
        userId: freshOrder.greenwichUserId,
        type: "CONFIRMATION_RESPONDED",
        delta: policy.confirmationResponseReward,
        reason: `Вовремя отменена неактуальная заявка «${reminder.order.eventName?.trim() || reminder.order.customer.name}»`,
        sourceKey: `greenwich-confirmation:${reminder.id}:responded`,
        orderId: freshOrder.id,
        reminderId: reminder.id,
        recoverable: false,
      });
    }
    if (freshOrder.projectId && freshOrder.greenwichUserId) {
      await appendProjectActivityLog(tx, {
        projectId: freshOrder.projectId,
        actorUserId: freshOrder.greenwichUserId,
        kind: ProjectActivityKind.ORDER_CANCELLED,
        payload: { orderId: freshOrder.id, source: "TELEGRAM_CONFIRMATION" },
      });
    }
    return {
      cancelled: true as const,
      greenwichUserId: freshOrder.greenwichUserId,
    };
  });

  if (!cancellation.cancelled) {
    await acknowledgeCallback({
      callbackQueryId: callback.id,
      text: cancellation.reason === "closed" ? "Закрытую заявку отменить нельзя" : "Заявка не найдена",
      showAlert: true,
    });
    return jsonOk({ ok: true, cancelled: false, reason: cancellation.reason });
  }

  await editTelegramMessageReplyMarkup({ chatId, messageId: message.message_id });
  await acknowledgeCallback({ callbackQueryId: callback.id, text: "Заявка отменена" });

  const fullOrder = await prisma.order.findUnique({
    where: { id: reminder.order.id },
    include: {
      customer: { select: { name: true } },
      greenwichUser: { select: { displayName: true } },
      lines: {
        orderBy: [{ position: "asc" }],
        include: { item: { select: { name: true } } },
      },
    },
  });
  if (fullOrder) {
    type NotifyCancelled = typeof import("@/server/notifications/order-notifications").notifyOrderCancelled;
    const payload = fullOrder as Parameters<NotifyCancelled>[0];
    scheduleAfterResponse("notifyOrderCancelledFromGreenwichReminder", async () => {
      const { notifyOrderCancelled } = await import("@/server/notifications/order-notifications");
      await notifyOrderCancelled(payload);
      await notifyWarehouseOrderInApp({
        orderId: fullOrder.id,
        title: "Greenwich отменил заявку",
        body: `${fullOrder.greenwichUser?.displayName ?? "Greenwich"}: ${fullOrder.eventName?.trim() || fullOrder.customer.name}`,
      });
    });
  }
  if (cancellation.greenwichUserId) {
    scheduleAfterResponse("recomputeGreenwichAchievementsFromReminderCancel", async () => {
      await prisma.$transaction(async (tx) => {
        await recomputeGreenwichAchievements(tx, cancellation.greenwichUserId!);
      });
    });
  }

  return jsonOk({ ok: true, cancelled: true });
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
  if (update.callback_query) {
    const testCallback = update.callback_query.data;
    if (testCallback?.startsWith(TELEGRAM_TEST_CALLBACK_PREFIX)) {
      const action = testCallback.slice(TELEGRAM_TEST_CALLBACK_PREFIX.length).split(":")[0];
      const responseText =
        action === "ok"
          ? "Тест пройден: подтверждение работает"
          : action === "changes"
            ? "Тест пройден: запрос изменений работает"
            : "Тест пройден: отмена распознана";
      await acknowledgeCallback({
        callbackQueryId: update.callback_query.id,
        text: `${responseText}. Данные не изменены.`,
        showAlert: true,
      });
      return jsonOk({ ok: true, testCallback: action });
    }
    const orderAction = update.callback_query.data
      ? parseGreenwichOrderActionCallback(update.callback_query.data)
      : null;
    if (orderAction) return handleGreenwichOrderActionCallback(update.callback_query, orderAction);
    return handleGreenwichConfirmationCallback(update.callback_query);
  }
  const text = update.message?.text?.trim() ?? "";
  const chatId = update.message?.chat?.id != null ? chatIdToString(update.message.chat.id) : "";
  if (!chatId) {
    return jsonOk({ ok: true, ignored: "no_chat_id" });
  }

  if (text.startsWith("/topic")) {
    const topicId = update.message?.message_thread_id;
    const message = [
      "<b>Telegram topic ID</b>",
      "",
      `Chat ID: <code>${escapeTelegramHtml(chatId)}</code>`,
      `Topic ID: <code>${topicId != null ? String(topicId) : "нет message_thread_id"}</code>`,
      "",
      "Для задач на Vercel добавьте:",
      `TELEGRAM_NOTIFICATION_CHAT_ID=${escapeTelegramHtml(chatId)}`,
      `TELEGRAM_TASKS_TOPIC_ID=${topicId != null ? String(topicId) : ""}`,
    ].join("\n");
    const result = await sendTelegramMessageDetailed(chatId, message, {
      messageThreadId: topicId,
    });
    return jsonOk({ ok: result.ok, chatId, topicId: topicId ?? null, error: result.ok ? undefined : result.error });
  }

  if (!text.startsWith("/start")) {
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
