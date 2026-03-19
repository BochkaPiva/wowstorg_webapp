import { prisma } from "@/server/db";
import {
  escapeTelegramHtml,
  getWarehouseChatId,
  getWarehouseTopicId,
  isTelegramConfigured,
  sendTelegramMessage,
} from "@/server/telegram";
import { parseDateOnlyToUtcMidnight } from "@/server/dates";

const OMSK_TZ = "Asia/Omsk";

type ReminderType = "WAREHOUSE_PREP" | "GREENWICH_RETURN";

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
  // Telegram HTML mode: we store only safe path; label is escaped.
  const safeLabel = escapeTelegramHtml(label);
  return `<a href="${SITE_LINK()}${path}">${safeLabel}</a>`;
}

export async function runDailyReminders(now = new Date()): Promise<{
  warehouseSent: number;
  greenwichSent: number;
}> {
  if (!isTelegramConfigured()) {
    return { warehouseSent: 0, greenwichSent: 0 };
  }

  const warehouseChatId = getWarehouseChatId();
  if (!warehouseChatId) {
    return { warehouseSent: 0, greenwichSent: 0 };
  }
  const topicId = getWarehouseTopicId();

  const activeStatuses: Array<
    "SUBMITTED" | "ESTIMATE_SENT" | "CHANGES_REQUESTED" | "APPROVED_BY_GREENWICH" | "PICKING" | "ISSUED" | "RETURN_DECLARED"
  > = [
    "SUBMITTED",
    "ESTIMATE_SENT",
    "CHANGES_REQUESTED",
    "APPROVED_BY_GREENWICH",
    "PICKING",
    "ISSUED",
    "RETURN_DECLARED",
  ];

  const omskTodayYmd = getOmskYmd(now);
  const omskTomorrowYmd = addDaysToYmd(omskTodayYmd, 1);
  const omskDayAfterTomorrowYmd = addDaysToYmd(omskTodayYmd, 2);

  const tomorrowStartUtc = parseDateOnlyToUtcMidnight(omskTomorrowYmd);
  const dayAfterTomorrowStartUtc = parseDateOnlyToUtcMidnight(omskDayAfterTomorrowYmd);

  const todayStartUtc = parseDateOnlyToUtcMidnight(omskTodayYmd);
  const tomorrowStartForReturnUtc = parseDateOnlyToUtcMidnight(omskTomorrowYmd);

  // 1) Склад: отправлять напоминание за 1 день до readyByDate (т.е. "сегодня" для готовности "завтра").
  const warehouseOrders = await prisma.order.findMany({
    where: {
      status: { in: activeStatuses },
      readyByDate: { gte: tomorrowStartUtc, lt: dayAfterTomorrowStartUtc },
    },
    select: {
      id: true,
      readyByDate: true,
      customer: { select: { name: true } },
    },
    orderBy: [{ readyByDate: "asc" }, { createdAt: "desc" }],
  });

  let warehouseSent = 0;
  for (const o of warehouseOrders) {
    const receiverKey = "warehouse";
    const ymd = omskTodayYmd;
    const already = await alreadySent({
      type: "WAREHOUSE_PREP",
      orderId: o.id,
      ymd,
      receiverKey,
    });
    if (already) continue;

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
      `${intro}\n` +
      `Завтра (${escapeTelegramHtml(formatDateRu(o.readyByDate))}) нужно подготовить реквизит.\n` +
      `Клиент: <b>${escapeTelegramHtml(o.customer.name)}</b>\n\n` +
      `${tone}\n` +
      `${link(`/orders/${o.id}`, "Открыть заявку")}`;

    const ok = await sendTelegramMessage(warehouseChatId, msg, {
      messageThreadId: topicId ? parseInt(topicId, 10) : undefined,
    });
    if (!ok) continue;

    await markSent({
      type: "WAREHOUSE_PREP",
      orderId: o.id,
      ymd,
      receiverKey,
      receiverChatId: warehouseChatId,
    });
    warehouseSent += 1;
  }

  // 2) Greenwich (и/или склад для внешних заявок): в день endDate.
  const returnOrders = await prisma.order.findMany({
    where: {
      status: { in: activeStatuses },
      endDate: { gte: todayStartUtc, lt: tomorrowStartForReturnUtc },
    },
    select: {
      id: true,
      endDate: true,
      customer: { select: { name: true } },
      greenwichUserId: true,
      greenwichUser: { select: { telegramChatId: true, isActive: true, displayName: true } },
    },
    orderBy: [{ endDate: "asc" }, { createdAt: "desc" }],
  });

  let greenwichSent = 0;
  for (const o of returnOrders) {
    const receiverIsGreenwich = Boolean(o.greenwichUserId);
    const receiverKey = receiverIsGreenwich ? (o.greenwichUserId as string) : "warehouse";

    let receiverChatId: string | undefined;
    if (receiverIsGreenwich) {
      receiverChatId =
        o.greenwichUser?.isActive && o.greenwichUser.telegramChatId
          ? o.greenwichUser.telegramChatId
          : undefined;
    } else {
      receiverChatId = warehouseChatId;
    }

    if (!receiverChatId) continue;

    const ymd = omskTodayYmd;
    const already = await alreadySent({
      type: "GREENWICH_RETURN",
      orderId: o.id,
      ymd,
      receiverKey,
    });
    if (already) continue;

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
      `Сегодня нужно вернуть реквизит по заявке.\n` +
      `Клиент: <b>${escapeTelegramHtml(o.customer.name)}</b>\n` +
      `Ориентир: <b>${escapeTelegramHtml(formatDateRu(o.endDate))}</b>\n\n` +
      `${friendlyWarning}\n` +
      `${link(`/orders/${o.id}`, "Открыть заявку")}`;

    const ok = await sendTelegramMessage(receiverChatId, msg);
    if (!ok) continue;

    await markSent({
      type: "GREENWICH_RETURN",
      orderId: o.id,
      ymd,
      receiverKey,
      receiverChatId,
    });
    greenwichSent += 1;
  }

  return { warehouseSent, greenwichSent };
}

