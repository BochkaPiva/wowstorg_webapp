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

const OMSK_TZ = "Asia/Omsk";

type ReminderType = "WAREHOUSE_PREP" | "GREENWICH_RETURN";

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
  greenwichReturnSent: number;
  warehouseReturnSent: number;
}> {
  if (!isTelegramConfigured()) {
    return { warehousePrepSent: 0, greenwichReturnSent: 0, warehouseReturnSent: 0 };
  }

  const warehouseChatId = getWarehouseChatId();
  if (!warehouseChatId) {
    return { warehousePrepSent: 0, greenwichReturnSent: 0, warehouseReturnSent: 0 };
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

  // 2) Возврат: в день endDate, только ISSUED.
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

  return { warehousePrepSent, greenwichReturnSent, warehouseReturnSent };
}
