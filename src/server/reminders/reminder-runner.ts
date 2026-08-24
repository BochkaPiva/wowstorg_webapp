import type { OrderStatus, Prisma } from "@prisma/client";

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
import { returnDeclarationKeyboard } from "@/server/telegram-order-actions";
import {
  sendWorkTaskCustomReminder,
  sendWorkTaskDeadlineReminder,
} from "@/server/work-task-notifications";
import {
  addGreenwichRatingEvent,
  ensureGreenwichRatingPolicy,
} from "@/server/ratings/greenwich-rating";
import { maybeAwardPreviousMonthBonus } from "@/server/ratings/greenwich-bonuses";
import {
  createInAppNotification,
  notifyWarehouseOrderInApp,
} from "@/server/notifications/in-app";

const OMSK_TZ = "Asia/Omsk";

type ReminderType =
  | "WAREHOUSE_PREP"
  | "WAREHOUSE_STAGE_PICKING"
  | "WAREHOUSE_STAGE_ISSUE"
  | "WAREHOUSE_STAGE_RETURN"
  | "WAREHOUSE_STAGE_CHECKIN"
  | "GREENWICH_RETURN"
  | "GREENWICH_CONFIRMATION_FALLBACK"
  | "WORK_TASK_DUE_24H"
  | "WORK_TASK_CUSTOM"
  | "WORK_SUBTASK_CUSTOM";

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

async function runApprovalStageReminders(args: {
  now: Date;
  warehouseChatId: string;
  warehouseOptions?: { messageThreadId: number };
}): Promise<{ warningSent: number; penaltyApplied: number }> {
  const policy = await prisma.$transaction((tx) => ensureGreenwichRatingPolicy(tx));
  if (getOmskHour(args.now) < policy.reminderHourOmsk) {
    return { warningSent: 0, penaltyApplied: 0 };
  }

  const todayYmd = getOmskYmd(args.now);
  const warningLimitYmd = addDaysToYmd(todayYmd, policy.approvalWarningDays);
  const candidates = await prisma.order.findMany({
    where: {
      source: "GREENWICH_INTERNAL",
      parentOrderId: null,
      status: { in: UNAPPROVED_STATUSES },
      readyByDate: {
        gte: parseDateOnlyToUtcMidnight(todayYmd),
        lte: parseDateOnlyToUtcMidnight(warningLimitYmd),
      },
      greenwichUserId: { not: null },
    },
    select: {
      id: true,
      eventName: true,
      createdAt: true,
      readyByDate: true,
      greenwichUserId: true,
      customer: { select: { name: true } },
      greenwichUser: { select: { displayName: true, telegramChatId: true, isActive: true } },
    },
  });

  let warningSent = 0;
  for (const order of candidates) {
    const readyYmd = order.readyByDate.toISOString().slice(0, 10);
    const createdYmd = getOmskYmd(order.createdAt);
    const leadDays = Math.round(
      (parseDateOnlyToUtcMidnight(readyYmd).getTime() - parseDateOnlyToUtcMidnight(createdYmd).getTime()) /
        86_400_000,
    );
    if (leadDays < policy.approvalLeadDays || !order.greenwichUserId) continue;

    const sourceKey = `approval-warning:${order.id}`;
    const existing = await prisma.orderStageReminder.findUnique({ where: { sourceKey } });
    if (existing?.status === "SENT" || existing?.status === "RESOLVED") continue;
    if (existing?.lastAttemptAt && getOmskYmd(existing.lastAttemptAt) === todayYmd) continue;

    const scheduledFor = omskWorkdayUtc(todayYmd, policy.reminderHourOmsk);
    const dueAt = omskWorkdayUtc(addDaysToYmd(todayYmd, 1), policy.reminderHourOmsk);
    const reminder = await prisma.orderStageReminder.upsert({
      where: { sourceKey },
      update: { scheduledFor, dueAt, status: "PENDING", lastError: null },
      create: {
        sourceKey,
        orderId: order.id,
        recipientId: order.greenwichUserId,
        audience: "GREENWICH",
        kind: "APPROVAL_DUE",
        scheduledFor,
        dueAt,
      },
    });
    const title = order.eventName?.trim() || order.customer.name;
    const message = [
      "⏳ <b>Заявку пора согласовать</b>",
      "",
      `Событие: <b>${escapeTelegramHtml(title)}</b>`,
      `Выдача: <b>${escapeTelegramHtml(formatDateRu(order.readyByDate))}</b>`,
      "",
      "Проверь смету и согласуй заявку до следующего рабочего напоминания. Срочные заявки исключены из штрафов.",
      link(`/orders/${order.id}`, "Открыть заявку"),
    ].join("\n");
    const chatId = order.greenwichUser?.isActive
      ? order.greenwichUser.telegramChatId?.trim()
      : undefined;
    const sent = chatId ? await sendTelegramMessage(chatId, message) : false;

    await createInAppNotification({
      userId: order.greenwichUserId,
      type: "ORDER_UPDATED",
      title: "Заявку пора согласовать",
      body: `${title}: выдача ${formatDateRu(order.readyByDate)}. Проверьте смету до следующего рабочего дня.`,
      payloadJson: { kind: "APPROVAL_DUE", orderId: order.id, href: `/orders/${order.id}` },
    });
    await notifyWarehouseOrderInApp({
      orderId: order.id,
      title: "Greenwich получил напоминание о согласовании",
      body: `${order.greenwichUser?.displayName ?? "Сотрудник"}: ${title}`,
    });
    await sendTelegramMessage(args.warehouseChatId, [
      "👀 <b>Контроль согласования Greenwich</b>",
      `${escapeTelegramHtml(order.greenwichUser?.displayName ?? "Сотрудник")}: ${escapeTelegramHtml(title)}`,
      `Выдача ${escapeTelegramHtml(formatDateRu(order.readyByDate))}`,
      link(`/orders/${order.id}`, "Открыть заявку"),
    ].join("\n"), args.warehouseOptions);

    await prisma.orderStageReminder.update({
      where: { id: reminder.id },
      data: sent
        ? { status: "SENT", sentAt: args.now, attemptCount: { increment: 1 }, lastAttemptAt: args.now }
        : {
            status: "FAILED",
            attemptCount: { increment: 1 },
            lastAttemptAt: args.now,
            lastError: chatId ? "Telegram не подтвердил отправку" : "У сотрудника не привязан Telegram",
          },
    });
    if (sent) warningSent += 1;
  }

  const due = await prisma.orderStageReminder.findMany({
    where: { kind: "APPROVAL_DUE", status: "SENT", dueAt: { lte: args.now } },
    include: {
      order: {
        select: {
          status: true,
          greenwichUserId: true,
          eventName: true,
          customer: { select: { name: true } },
        },
      },
    },
  });
  let penaltyApplied = 0;
  for (const reminder of due) {
    if (!UNAPPROVED_STATUSES.includes(reminder.order.status)) {
      await prisma.orderStageReminder.update({
        where: { id: reminder.id },
        data: { status: "RESOLVED", resolvedAt: args.now },
      });
      continue;
    }
    if (!reminder.sentAt || !reminder.order.greenwichUserId) continue;
    const added = await prisma.$transaction(async (tx) => {
      const created = await addGreenwichRatingEvent(tx, {
        userId: reminder.order.greenwichUserId!,
        type: "APPROVAL_WARNING_MISSED",
        delta: policy.approvalMissedPenalty,
        reason: `Заявка «${reminder.order.eventName?.trim() || reminder.order.customer.name}» не согласована после предупреждения`,
        sourceKey: `approval-warning:${reminder.orderId}:penalty`,
        orderId: reminder.orderId,
        stageReminderId: reminder.id,
        recoverable: true,
        now: args.now,
      });
      await tx.orderStageReminder.update({
        where: { id: reminder.id },
        data: { status: "RESOLVED", resolvedAt: args.now },
      });
      return created;
    });
    if (added) penaltyApplied += 1;
  }
  return { warningSent, penaltyApplied };
}

export async function runDailyReminders(now = new Date()): Promise<{
  greenwichMonthlyBonusAwarded: number;
  warehousePrepSent: number;
  warehouseStageSent: number;
  greenwichConfirmationSent: number;
  greenwichConfirmationRepeatSent: number;
  greenwichConfirmationFallbackSent: number;
  greenwichReturnSent: number;
  warehouseReturnSent: number;
  workTaskDeadlineSent: number;
  workTaskCustomReminderSent: number;
  approvalWarningSent: number;
  approvalPenaltyApplied: number;
}> {
  // Начисление не зависит от Telegram: лидер должен получить бонус даже при
  // временно отключённом боте или отсутствующем складском чате.
  const monthlyBonus = await maybeAwardPreviousMonthBonus(now);
  const greenwichMonthlyBonusAwarded = monthlyBonus.created ? 1 : 0;

  if (!isTelegramConfigured()) {
    return {
      greenwichMonthlyBonusAwarded,
      warehousePrepSent: 0,
      warehouseStageSent: 0,
      greenwichConfirmationSent: 0,
      greenwichConfirmationRepeatSent: 0,
      greenwichConfirmationFallbackSent: 0,
      greenwichReturnSent: 0,
      warehouseReturnSent: 0,
      workTaskDeadlineSent: 0,
      workTaskCustomReminderSent: 0,
      approvalWarningSent: 0,
      approvalPenaltyApplied: 0,
    };
  }

  const warehouseChatId = getWarehouseChatId();
  if (!warehouseChatId) {
    return {
      greenwichMonthlyBonusAwarded,
      warehousePrepSent: 0,
      warehouseStageSent: 0,
      greenwichConfirmationSent: 0,
      greenwichConfirmationRepeatSent: 0,
      greenwichConfirmationFallbackSent: 0,
      greenwichReturnSent: 0,
      warehouseReturnSent: 0,
      workTaskDeadlineSent: 0,
      workTaskCustomReminderSent: 0,
      approvalWarningSent: 0,
      approvalPenaltyApplied: 0,
    };
  }
  const topicId = getWarehouseTopicId();
  const warehouseOpts = warehouseTopicOptions(topicId);
  const approval = await runApprovalStageReminders({
    now,
    warehouseChatId,
    warehouseOptions: warehouseOpts,
  });

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

  // 1.1) Склад: контроль фактического прохождения этапов.
  // Один сигнал на заявку и этап в календарный день: почасовой runner не спамит,
  // но на следующий день незакрытый этап снова останется видимым.
  const stageCandidates: Array<{
    type: ReminderType;
    status: OrderStatus;
    title: string;
    action: string;
    where: Prisma.OrderWhereInput;
  }> = [
    {
      type: "WAREHOUSE_STAGE_PICKING",
      status: "APPROVED_BY_GREENWICH",
      title: "Пора начать сборку",
      action: "Заявка уже должна быть в подготовке. Проверьте состав и отметьте начало сборки.",
      where: { readyByDate: { lt: tomorrowStartForReturnUtc } },
    },
    {
      type: "WAREHOUSE_STAGE_ISSUE",
      status: "PICKING",
      title: "Проверьте выдачу",
      action: "Период аренды уже начался. Если реквизит передан, отметьте заявку как выданную.",
      where: { startDate: { lt: tomorrowStartForReturnUtc } },
    },
    {
      type: "WAREHOUSE_STAGE_RETURN",
      status: "ISSUED",
      title: "Ожидается возврат",
      action: "Период аренды завершился. Проверьте возврат и переведите заявку на приёмку.",
      where: { endDate: { lt: todayStartUtc } },
    },
    {
      type: "WAREHOUSE_STAGE_CHECKIN",
      status: "RETURN_DECLARED",
      title: "Завершите приёмку",
      action: "Greenwich уже заявил возврат. Проверьте состояние и завершите складскую приёмку.",
      where: { updatedAt: { lte: new Date(now.getTime() - 4 * 3_600_000) } },
    },
  ];

  let warehouseStageSent = 0;
  for (const candidate of stageCandidates) {
    const orders = await prisma.order.findMany({
      where: {
        status: candidate.status,
        ...candidate.where,
      },
      select: {
        id: true,
        parentOrderId: true,
        eventName: true,
        customer: { select: { name: true } },
      },
      orderBy: [{ updatedAt: "asc" }],
    });

    for (const order of orders) {
      const receiverKey = `warehouse:stage:${candidate.status}`;
      if (await alreadySent({
        type: candidate.type,
        orderId: order.id,
        ymd: omskTodayYmd,
        receiverKey,
      })) continue;

      const label = order.eventName?.trim() || order.customer.name;
      const message =
        `🟡 <b>${escapeTelegramHtml(candidate.title)}</b>\n\n` +
        quickSupplementBlock(order.parentOrderId) +
        `<b>${escapeTelegramHtml(label)}</b> · ${escapeTelegramHtml(order.customer.name)}\n` +
        `${escapeTelegramHtml(candidate.action)}\n\n` +
        link(`/orders/${order.id}`, "Открыть и выполнить");
      const sent = await sendTelegramMessage(warehouseChatId, message, warehouseOpts);
      if (!sent) continue;

      await markSent({
        type: candidate.type,
        orderId: order.id,
        ymd: omskTodayYmd,
        receiverKey,
        receiverChatId: warehouseChatId,
      });
      await notifyWarehouseOrderInApp({
        orderId: order.id,
        title: candidate.title,
        body: `${label}: ${candidate.action}`,
      });
      warehouseStageSent += 1;
    }
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
  const ratingPolicy = await prisma.$transaction((tx) => ensureGreenwichRatingPolicy(tx));
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

        const ok = await sendTelegramMessage(personalChatId, msg, {
          replyMarkup: returnDeclarationKeyboard({
            orderId: o.id,
            orderUrl: `${SITE_LINK()}/orders/${o.id}`,
          }),
        });
        if (!ok) continue;

        await markSent({
          type: "GREENWICH_RETURN",
          orderId: o.id,
          ymd,
          receiverKey,
          receiverChatId: personalChatId,
        });
        await createInAppNotification({
          userId: receiverKey,
          type: "ORDER_UPDATED",
          title: "Сегодня нужно вернуть реквизит",
          body: `${o.customer.name}: отправьте заявку на приёмку после возврата.`,
          payloadJson: { kind: "RETURN_DUE", orderId: o.id, href: `/orders/${o.id}` },
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

  const reminderWindowStart = new Date(now.getTime() - 48 * 3_600_000);
  const [customTaskReminders, customSubtaskReminders] = await Promise.all([
    prisma.workTask.findMany({
      where: {
        completedAt: null,
        archivedAt: null,
        reminderAt: { gt: reminderWindowStart, lte: now },
      },
      select: { id: true, reminderAt: true },
      orderBy: { reminderAt: "asc" },
    }),
    prisma.workTaskChecklistItem.findMany({
      where: {
        isDone: false,
        reminderAt: { gt: reminderWindowStart, lte: now },
        task: { is: { completedAt: null, archivedAt: null } },
      },
      select: { id: true, taskId: true, reminderAt: true },
      orderBy: { reminderAt: "asc" },
    }),
  ]);
  let workTaskCustomReminderSent = 0;
  for (const reminder of customTaskReminders) {
    if (!reminder.reminderAt) continue;
    const receiverKey = `tasks-topic:${reminder.reminderAt.toISOString()}`;
    if (await alreadySent({ type: "WORK_TASK_CUSTOM", orderId: reminder.id, ymd: omskTodayYmd, receiverKey })) continue;
    if (!await sendWorkTaskCustomReminder({ taskId: reminder.id })) continue;
    await markSent({
      type: "WORK_TASK_CUSTOM",
      orderId: reminder.id,
      ymd: omskTodayYmd,
      receiverKey,
      receiverChatId: warehouseChatId,
    });
    workTaskCustomReminderSent += 1;
  }
  for (const reminder of customSubtaskReminders) {
    if (!reminder.reminderAt) continue;
    const receiverKey = `tasks-topic:${reminder.reminderAt.toISOString()}`;
    if (await alreadySent({ type: "WORK_SUBTASK_CUSTOM", orderId: reminder.id, ymd: omskTodayYmd, receiverKey })) continue;
    if (!await sendWorkTaskCustomReminder({ taskId: reminder.taskId, checklistItemId: reminder.id })) continue;
    await markSent({
      type: "WORK_SUBTASK_CUSTOM",
      orderId: reminder.id,
      ymd: omskTodayYmd,
      receiverKey,
      receiverChatId: warehouseChatId,
    });
    workTaskCustomReminderSent += 1;
  }

  return {
    greenwichMonthlyBonusAwarded,
    warehousePrepSent,
    warehouseStageSent,
    greenwichConfirmationSent,
    greenwichConfirmationFallbackSent,
    greenwichConfirmationRepeatSent,
    greenwichReturnSent,
    warehouseReturnSent,
    workTaskDeadlineSent,
    workTaskCustomReminderSent,
    approvalWarningSent: approval.warningSent,
    approvalPenaltyApplied: approval.penaltyApplied,
  };
}

function getOmskHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: OMSK_TZ,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now));
}

function omskWorkdayUtc(ymd: string, hour: number): Date {
  return new Date(`${ymd}T${String(hour).padStart(2, "0")}:00:00+06:00`);
}

const UNAPPROVED_STATUSES: OrderStatus[] = ["SUBMITTED", "ESTIMATE_SENT", "CHANGES_REQUESTED"];
