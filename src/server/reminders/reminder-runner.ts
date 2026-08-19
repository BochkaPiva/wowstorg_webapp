import type { OrderStatus } from "@prisma/client";

import { parseDateOnlyToUtcMidnight } from "@/server/dates";
import { prisma } from "@/server/db";
import {
  escapeTelegramHtml,
  getWarehouseChatId,
  getWarehouseTopicId,
  isTelegramConfigured,
  sendTelegramMessage,
} from "@/server/telegram";
import {
  GREENWICH_CONFIRMATION_CHECKPOINTS,
  greenwichConfirmationKeyboard,
  greenwichConfirmationMessage,
} from "@/server/reminders/greenwich-confirmation";
import { sendWorkTaskDeadlineReminder } from "@/server/work-task-notifications";
import {
  addGreenwichRatingEvent,
} from "@/server/ratings/greenwich-rating";

const OMSK_TZ = "Asia/Omsk";

type ReminderType =
  | "WAREHOUSE_PREP"
  | "GREENWICH_RETURN"
  | "GREENWICH_CONFIRMATION_FALLBACK"
  | "WORK_TASK_DUE_24H";

/** Подготовка: всё, кроме отмены и закрытых (страховка от «застряла в смете»). */
const WAREHOUSE_PREP_EXCLUDED_STATUSES: OrderStatus[] = ["CANCELLED", "CLOSED"];

/** Возврат / приёмка: только выданная заявка. */
const RETURN_REMINDER_STATUS: OrderStatus = "ISSUED";

function getOmskYmd(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: OMSK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function addDaysToYmd(ymd: string, days: number): string {
  const startUtc = parseDateOnlyToUtcMidnight(ymd);
  const dt = new Date(startUtc.getTime() + days * 86_400_000);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function alreadySent(args: {
  type: ReminderType;
  orderId: string;
  ymd: string;
  receiverKey: string;
}): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ id: bigint }>>`
    SELECT "id"
    FROM "ReminderSent"
    WHERE "type" = ${args.type}
      AND "orderId" = ${args.orderId}
      AND "ymd" = ${args.ymd}
      AND "receiverKey" = ${args.receiverKey}
    LIMIT 1
  `;
  return (rows?.length ?? 0) > 0;
}

async function markSent(args: {
  type: ReminderType;
  orderId: string;
  ymd: string;
  receiverKey: string;
  receiverChatId: string;
}): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "ReminderSent" ("type", "orderId", "ymd", "receiverKey", "receiverChatId")
    VALUES (${args.type}, ${args.orderId}, ${args.ymd}, ${args.receiverKey}, ${args.receiverChatId})
    ON CONFLICT ("type", "orderId", "ymd", "receiverKey") DO NOTHING
  `;
}

function formatDateRu(date: Date): string {
  return date.toLocaleDateString("ru-RU");
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function SITE_LINK() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://wowstorg.example.com";
}

function link(path: string, label: string): string {
  const safeLabel = escapeTelegramHtml(label);
  return `<a href="${SITE_LINK()}${path}">${safeLabel}</a>`;
}

function quickSupplementBlock(parentOrderId: string | null): string {
  if (!parentOrderId) return "";
  return `📎 <b>Доп. заявка</b> · ${link(`/orders/${parentOrderId}`, "основная заявка")}\n\n`;
}

function warehouseTopicOptions(topicId: string | undefined) {
  return topicId ? { messageThreadId: parseInt(topicId, 10) } : undefined;
}

export async function runDailyReminders(now = new Date()): Promise<{
  warehousePrepSent: number;
  greenwichConfirmationSent: number;
  greenwichConfirmationRepeatSent: number;
  greenwichConfirmationFallbackSent: number;
  greenwichReturnSent: number;
  warehouseReturnSent: number;
  workTaskDeadlineSent: number;
}> {
  if (!isTelegramConfigured()) {
    return {
      warehousePrepSent: 0,
      greenwichConfirmationSent: 0,
      greenwichConfirmationRepeatSent: 0,
      greenwichConfirmationFallbackSent: 0,
      greenwichReturnSent: 0,
      warehouseReturnSent: 0,
      workTaskDeadlineSent: 0,
    };
  }

  const warehouseChatId = getWarehouseChatId();
  if (!warehouseChatId) {
    return {
      warehousePrepSent: 0,
      greenwichConfirmationSent: 0,
      greenwichConfirmationRepeatSent: 0,
      greenwichConfirmationFallbackSent: 0,
      greenwichReturnSent: 0,
      warehouseReturnSent: 0,
      workTaskDeadlineSent: 0,
    };
  }
  const topicId = getWarehouseTopicId();
  const warehouseOpts = warehouseTopicOptions(topicId);

  const omskTodayYmd = getOmskYmd(now);
  const omskTomorrowYmd = addDaysToYmd(omskTodayYmd, 1);
  const omskDayAfterTomorrowYmd = addDaysToYmd(omskTodayYmd, 2);

  const tomorrowStartUtc = parseDateOnlyToUtcMidnight(omskTomorrowYmd);
  const dayAfterTomorrowStartUtc = parseDateOnlyToUtcMidnight(omskDayAfterTomorrowYmd);

  const todayStartUtc = parseDateOnlyToUtcMidnight(omskTodayYmd);
  const tomorrowStartForReturnUtc = parseDateOnlyToUtcMidnight(omskTomorrowYmd);

  // 1) Склад: за 1 календарный день до readyByDate (cron в 11:00 Омск → «завтра» по Омску).
  const warehouseOrders = await prisma.order.findMany({
    where: {
      status: { notIn: WAREHOUSE_PREP_EXCLUDED_STATUSES },
      readyByDate: { gte: tomorrowStartUtc, lt: dayAfterTomorrowStartUtc },
    },
    select: {
      id: true,
      readyByDate: true,
      parentOrderId: true,
      customer: { select: { name: true } },
    },
    orderBy: [{ readyByDate: "asc" }, { createdAt: "desc" }],
  });

  let warehousePrepSent = 0;
  for (const o of warehouseOrders) {
    const receiverKey = "warehouse";
    const ymd = omskTodayYmd;
    if (
      await alreadySent({
        type: "WAREHOUSE_PREP",
        orderId: o.id,
        ymd,
        receiverKey,
      })
    ) {
      continue;
    }

    const intro = pickRandom([
      "⏳ Давайте соберём реквизит заранее!",
      "🧩 Склад, завтра важный день — давай подготовим всё как надо.",
      "🦺 Подсказка от системы: завтра пора к выдаче!",
    ]);
    const tone = pickRandom([
      "Завтра будет легко, если сегодня всё разложить по полочкам.",
      "Чуть-чуть дисциплины — и завтра без суеты.",
      "Мы болеем за спокойный день на выдаче.",
    ]);

    const msg =
      `⏰ <b>Напоминание складу</b>\n\n` +
      quickSupplementBlock(o.parentOrderId) +
      `${intro}\n` +
      `Завтра (${escapeTelegramHtml(formatDateRu(o.readyByDate))}) нужно подготовить реквизит.\n` +
      `Клиент: <b>${escapeTelegramHtml(o.customer.name)}</b>\n\n` +
      `${tone}\n` +
      `${link(`/orders/${o.id}`, "Открыть заявку")}`;

    const ok = await sendTelegramMessage(warehouseChatId, msg, warehouseOpts);
    if (!ok) continue;

    await markSent({
      type: "WAREHOUSE_PREP",
      orderId: o.id,
      ymd,
      receiverKey,
      receiverChatId: warehouseChatId,
    });
    warehousePrepSent += 1;
  }

  // 2) Greenwich: подтверждение актуальности за 30 / 7 / 3 дня до начала аренды.
  // Запись создаём до отправки: если Telegram временно недоступен, незавершённая
  // попытка останется в outbox и будет повторена следующим ежедневным запуском.
  let greenwichConfirmationSent = 0;
  let greenwichConfirmationFallbackSent = 0;
  for (const checkpoint of GREENWICH_CONFIRMATION_CHECKPOINTS) {
    const targetYmd = addDaysToYmd(omskTodayYmd, checkpoint.daysBefore);
    const targetNextYmd = addDaysToYmd(targetYmd, 1);
    const targetStart = parseDateOnlyToUtcMidnight(targetYmd);
    const targetEnd = parseDateOnlyToUtcMidnight(targetNextYmd);

    const exactOrders = await prisma.order.findMany({
      where: {
        source: "GREENWICH_INTERNAL",
        parentOrderId: null,
        status: { notIn: ["CANCELLED", "CLOSED"] },
        startDate: { gte: targetStart, lt: targetEnd },
        greenwichUserId: { not: null },
        greenwichUser: { is: { isActive: true } },
      },
      select: {
        id: true,
        eventName: true,
        startDate: true,
        endDate: true,
        rentalStartPartOfDay: true,
        rentalEndPartOfDay: true,
        greenwichUserId: true,
        customer: { select: { name: true } },
        greenwichUser: {
          select: { displayName: true, telegramChatId: true, isActive: true },
        },
      },
    });

    const pendingRows = await prisma.greenwichOrderReminder.findMany({
      where: {
        checkpoint: checkpoint.checkpoint,
        sentAt: null,
        scheduledFor: { lt: tomorrowStartForReturnUtc },
        order: {
          is: {
            source: "GREENWICH_INTERNAL",
            parentOrderId: null,
            status: { notIn: ["CANCELLED", "CLOSED"] },
            greenwichUser: { is: { isActive: true } },
          },
        },
      },
      select: {
        order: {
          select: {
            id: true,
            eventName: true,
            startDate: true,
            endDate: true,
            rentalStartPartOfDay: true,
            rentalEndPartOfDay: true,
            greenwichUserId: true,
            customer: { select: { name: true } },
            greenwichUser: {
              select: { displayName: true, telegramChatId: true, isActive: true },
            },
          },
        },
      },
    });

    const candidates = new Map(exactOrders.map((order) => [order.id, order]));
    pendingRows.forEach(({ order }) => candidates.set(order.id, order));

    for (const order of candidates.values()) {
      if (!order.greenwichUserId || !order.greenwichUser?.isActive) continue;
      const personalChatId = order.greenwichUser.telegramChatId?.trim() || "";
      const journal = await prisma.greenwichOrderReminder.upsert({
        where: {
          orderId_checkpoint: {
            orderId: order.id,
            checkpoint: checkpoint.checkpoint,
          },
        },
        update: {},
        create: {
          orderId: order.id,
          checkpoint: checkpoint.checkpoint,
          scheduledFor: todayStartUtc,
          telegramChatId: personalChatId,
        },
      });
      if (journal.sentAt) continue;

      if (!personalChatId) {
        const scheduledYmd = journal.scheduledFor.toISOString().slice(0, 10);
        const receiverKey = `warehouse:greenwich-confirmation-missing-tg:${order.greenwichUserId}:${checkpoint.checkpoint}`;
        if (
          await alreadySent({
            type: "GREENWICH_CONFIRMATION_FALLBACK",
            orderId: order.id,
            ymd: scheduledYmd,
            receiverKey,
          })
        ) {
          continue;
        }
        const title = order.eventName?.trim() || order.customer.name;
        const fallbackText = [
          "⚠️ <b>Не удалось запросить актуальность заявки</b>",
          "",
          `У ${escapeTelegramHtml(order.greenwichUser.displayName)} не привязан Telegram.`,
          `Заявка: <b>${escapeTelegramHtml(title)}</b>`,
          `До начала: ${checkpoint.daysBefore} дн.`,
          "",
          "Привяжите Telegram ID в админке или уточните актуальность вручную.",
          link(`/orders/${order.id}`, "Открыть заявку"),
        ].join("\n");
        const fallbackOk = await sendTelegramMessage(
          warehouseChatId,
          fallbackText,
          warehouseOpts,
        );
        if (!fallbackOk) continue;
        await markSent({
          type: "GREENWICH_CONFIRMATION_FALLBACK",
          orderId: order.id,
          ymd: scheduledYmd,
          receiverKey,
          receiverChatId: warehouseChatId,
        });
        greenwichConfirmationFallbackSent += 1;
        continue;
      }

      const message = greenwichConfirmationMessage({
        eventName: order.eventName,
        customerName: order.customer.name,
        startDate: order.startDate,
        endDate: order.endDate,
        rentalStartPartOfDay: order.rentalStartPartOfDay,
        rentalEndPartOfDay: order.rentalEndPartOfDay,
        daysBefore: checkpoint.daysBefore,
        orderUrl: `${SITE_LINK()}/orders/${order.id}`,
      });
      const sent = await sendTelegramMessage(personalChatId, message, {
        replyMarkup: greenwichConfirmationKeyboard({
          orderId: order.id,
          checkpoint: checkpoint.checkpoint,
        }),
      });
      if (!sent) continue;

      const sentAt = new Date();
      await prisma.greenwichOrderReminder.updateMany({
        where: { id: journal.id, sentAt: null },
        data: { sentAt, lastSentAt: sentAt, sendCount: 1, telegramChatId: personalChatId },
      });
      greenwichConfirmationSent += 1;
    }
  }

  // 2.1) Неотвеченные подтверждения: один повтор через 3 часа и финальный через час.
  // Состояние хранится в БД, поэтому почасовой cron безопасен и никогда не зацикливается.
  let greenwichConfirmationRepeatSent = 0;
  const repeatDue = await prisma.greenwichOrderReminder.findMany({
    where: {
      response: null,
      sendCount: { in: [1, 2] },
      lastSentAt: { not: null },
      order: {
        is: {
          source: "GREENWICH_INTERNAL",
          parentOrderId: null,
          status: { notIn: ["CANCELLED", "CLOSED"] },
          greenwichUserId: { not: null },
          greenwichUser: { is: { isActive: true } },
        },
      },
    },
    select: {
      id: true,
      checkpoint: true,
      sendCount: true,
      lastSentAt: true,
      telegramChatId: true,
      order: {
        select: {
          id: true,
          eventName: true,
          startDate: true,
          endDate: true,
          rentalStartPartOfDay: true,
          rentalEndPartOfDay: true,
          greenwichUserId: true,
          customer: { select: { name: true } },
          greenwichUser: { select: { displayName: true, telegramChatId: true } },
        },
      },
    },
  });
  const ratingPolicy = await prisma.greenwichRatingPolicy.upsert({
    where: { id: "default" }, update: {}, create: { id: "default" },
  });
  for (const reminder of repeatDue) {
    if (!reminder.lastSentAt || !reminder.order.greenwichUserId) continue;
    const waitMs = reminder.sendCount === 1 ? 3 * 3_600_000 : 3_600_000;
    if (now.getTime() - reminder.lastSentAt.getTime() < waitMs) continue;
    const chatId = reminder.order.greenwichUser?.telegramChatId?.trim() || reminder.telegramChatId;
    if (!chatId) continue;
    const checkpoint = GREENWICH_CONFIRMATION_CHECKPOINTS.find(
      (entry) => entry.checkpoint === reminder.checkpoint,
    );
    if (!checkpoint) continue;
    const attempt = (reminder.sendCount + 1) as 2 | 3;
    const reservedAt = new Date();
    const reservation = await prisma.greenwichOrderReminder.updateMany({
      where: {
        id: reminder.id,
        response: null,
        sendCount: reminder.sendCount,
        lastSentAt: reminder.lastSentAt,
      },
      data: { sendCount: attempt, lastSentAt: reservedAt, telegramChatId: chatId },
    });
    if (reservation.count === 0) continue;

    const message = greenwichConfirmationMessage({
      eventName: reminder.order.eventName,
      customerName: reminder.order.customer.name,
      startDate: reminder.order.startDate,
      endDate: reminder.order.endDate,
      rentalStartPartOfDay: reminder.order.rentalStartPartOfDay,
      rentalEndPartOfDay: reminder.order.rentalEndPartOfDay,
      daysBefore: checkpoint.daysBefore,
      orderUrl: `${SITE_LINK()}/orders/${reminder.order.id}`,
      attempt,
    });
    const sent = await sendTelegramMessage(chatId, message, {
      replyMarkup: greenwichConfirmationKeyboard({
        orderId: reminder.order.id,
        checkpoint: reminder.checkpoint,
      }),
    });
    if (!sent) {
      await prisma.greenwichOrderReminder.updateMany({
        where: { id: reminder.id, response: null, sendCount: attempt, lastSentAt: reservedAt },
        data: {
          sendCount: reminder.sendCount,
          lastSentAt: reminder.lastSentAt,
          telegramChatId: reminder.telegramChatId,
        },
      });
      continue;
    }
    const sentAt = new Date();
    await prisma.$transaction(async (tx) => {
      const updated = await tx.greenwichOrderReminder.updateMany({
        where: { id: reminder.id, response: null, sendCount: attempt, lastSentAt: reservedAt },
        data: { lastSentAt: sentAt },
      });
      if (updated.count === 0) return;
      const final = attempt === 3;
      await addGreenwichRatingEvent(tx, {
        userId: reminder.order.greenwichUserId!,
        type: final ? "CONFIRMATION_FINAL_MISSED" : "CONFIRMATION_REPEAT_MISSED",
        delta: final ? ratingPolicy.finalMissedPenalty : ratingPolicy.repeatMissedPenalty,
        reason: final
          ? `Не отвечено на повторное подтверждение заявки «${reminder.order.eventName?.trim() || reminder.order.customer.name}»`
          : `Не отвечено на подтверждение заявки «${reminder.order.eventName?.trim() || reminder.order.customer.name}» в течение 3 часов`,
        sourceKey: `greenwich-confirmation:${reminder.id}:attempt:${attempt}`,
        orderId: reminder.order.id,
        reminderId: reminder.id,
        recoverable: true,
        now: sentAt,
      });
    });
    greenwichConfirmationRepeatSent += 1;
  }

  // 3) Возврат: в день endDate, только ISSUED.
  const returnOrders = await prisma.order.findMany({
    where: {
      status: RETURN_REMINDER_STATUS,
      endDate: { gte: todayStartUtc, lt: tomorrowStartForReturnUtc },
    },
    select: {
      id: true,
      endDate: true,
      parentOrderId: true,
      customer: { select: { name: true } },
      greenwichUserId: true,
      greenwichUser: { select: { telegramChatId: true, isActive: true, displayName: true } },
    },
    orderBy: [{ endDate: "asc" }, { createdAt: "desc" }],
  });

  let greenwichReturnSent = 0;
  let warehouseReturnSent = 0;

  for (const o of returnOrders) {
    const ymd = omskTodayYmd;
    const supplementBlock = quickSupplementBlock(o.parentOrderId);
    const customerLine = `Клиент: <b>${escapeTelegramHtml(o.customer.name)}</b>\n`;
    const dateLine = `Ориентир: <b>${escapeTelegramHtml(formatDateRu(o.endDate))}</b>\n\n`;
    const orderLink = link(`/orders/${o.id}`, "Открыть заявку");

    const receiverIsGreenwich = Boolean(o.greenwichUserId);

    if (receiverIsGreenwich) {
      const displayName = o.greenwichUser?.displayName?.trim() || "сотрудник Greenwich";
      const personalChatId =
        o.greenwichUser?.isActive && o.greenwichUser.telegramChatId
          ? o.greenwichUser.telegramChatId
          : undefined;

      if (personalChatId) {
        const receiverKey = o.greenwichUserId as string;
        if (
          await alreadySent({
            type: "GREENWICH_RETURN",
            orderId: o.id,
            ymd,
            receiverKey,
          })
        ) {
          continue;
        }

        const dinoWord = pickRandom(["динозаврик", "дракончик", "диня", "динозаврик-тренер"]);
        const header = pickRandom([
          "🦖 <b>День возврата!</b>",
          "⚡ <b>Сегодня дедлайн</b>",
          "🌟 <b>Возврат по заявке</b>",
        ]);
        const friendlyWarning = pickRandom([
          `Если опоздаешь — ${escapeTelegramHtml(dinoWord)} пересчитает рейтинг в сторону минуса.`,
          `Почти всё решает “вовремя”: если задержаться, ${escapeTelegramHtml(dinoWord)} будет строгим.`,
          `Вовремя = плюс к рейтингу, а задержки обычно дают минус — пусть ${escapeTelegramHtml(dinoWord)} порадуется.`,
        ]);

        const msg =
          `${header}\n\n` +
          supplementBlock +
          `Сегодня нужно вернуть реквизит по заявке.\n` +
          customerLine +
          dateLine +
          `${friendlyWarning}\n` +
          orderLink;

        const ok = await sendTelegramMessage(personalChatId, msg);
        if (!ok) continue;

        await markSent({
          type: "GREENWICH_RETURN",
          orderId: o.id,
          ymd,
          receiverKey,
          receiverChatId: personalChatId,
        });
        greenwichReturnSent += 1;
        continue;
      }

      // Greenwich назначен, но Telegram не привязан — дублируем складу.
      const fallbackKey = `warehouse:greenwich-missing-tg:${o.greenwichUserId}`;
      if (
        await alreadySent({
          type: "GREENWICH_RETURN",
          orderId: o.id,
          ymd,
          receiverKey: fallbackKey,
        })
      ) {
        continue;
      }

      const msg =
        `⚠️ <b>Напоминание складу (fallback)</b>\n\n` +
        `У ${escapeTelegramHtml(displayName)} не привязан Telegram — напоминание о возврате ушло сюда.\n\n` +
        supplementBlock +
        `Сегодня последний день аренды, нужен возврат на приёмку.\n` +
        customerLine +
        dateLine +
        `Свяжитесь с ${escapeTelegramHtml(displayName)} и проверьте заявку.\n` +
        orderLink;

      const ok = await sendTelegramMessage(warehouseChatId, msg, warehouseOpts);
      if (!ok) continue;

      await markSent({
        type: "GREENWICH_RETURN",
        orderId: o.id,
        ymd,
        receiverKey: fallbackKey,
        receiverChatId: warehouseChatId,
      });
      warehouseReturnSent += 1;
      continue;
    }

    // Внешняя заявка (без Greenwich) — в рабочий чат склада.
    const receiverKey = "warehouse:external-return";
    if (
      await alreadySent({
        type: "GREENWICH_RETURN",
        orderId: o.id,
        ymd,
        receiverKey,
      })
    ) {
      continue;
    }

    const msg =
      `📦 <b>Напоминание складу: возврат</b>\n\n` +
      supplementBlock +
      `Сегодня последний день аренды по <b>внешней заявке</b> — ожидается возврат на приёмку.\n` +
      customerLine +
      dateLine +
      orderLink;

    const ok = await sendTelegramMessage(warehouseChatId, msg, warehouseOpts);
    if (!ok) continue;

    await markSent({
      type: "GREENWICH_RETURN",
      orderId: o.id,
      ymd,
      receiverKey,
      receiverChatId: warehouseChatId,
    });
    warehouseReturnSent += 1;
  }

  const workTasksDueTomorrow = await prisma.workTask.findMany({
    where: {
      completedAt: null,
      archivedAt: null,
      dueDate: { gte: tomorrowStartUtc, lt: dayAfterTomorrowStartUtc },
    },
    select: { id: true, dueDate: true },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });

  let workTaskDeadlineSent = 0;
  for (const task of workTasksDueTomorrow) {
    const ymd = omskTodayYmd;
    const receiverKey = "tasks-topic";
    if (
      await alreadySent({
        type: "WORK_TASK_DUE_24H",
        orderId: task.id,
        ymd,
        receiverKey,
      })
    ) {
      continue;
    }

    const ok = await sendWorkTaskDeadlineReminder(task.id);
    if (!ok) continue;

    await markSent({
      type: "WORK_TASK_DUE_24H",
      orderId: task.id,
      ymd,
      receiverKey,
      receiverChatId: warehouseChatId,
    });
    workTaskDeadlineSent += 1;
  }

  return {
    warehousePrepSent,
    greenwichConfirmationSent,
    greenwichConfirmationFallbackSent,
    greenwichConfirmationRepeatSent,
    greenwichReturnSent,
    warehouseReturnSent,
    workTaskDeadlineSent,
  };
}
