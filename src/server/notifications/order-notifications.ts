/**
 * Уведомления о заявках в Telegram.
 * Все функции best-effort: не бросают ошибки, только логируют.
 */

import { appendFileSync } from "fs";
import { join } from "path";

import {
  sendTelegramMessage,
  sendTelegramDocument,
  escapeTelegramHtml,
  getWarehouseChatId,
  getWarehouseTopicId,
} from "@/server/telegram";
import { isTelegramConfigured } from "@/server/telegram";
import { prisma } from "@/server/db";
import { calcOrderPricing } from "@/server/orders/order-pricing";

/** Пишет строку в notification-debug.log в корне проекта (можно открыть файл и посмотреть после теста). */
function notifyDebugLog(msg: string): void {
  try {
    appendFileSync(join(process.cwd(), "notification-debug.log"), `${new Date().toISOString()} ${msg}\n`);
  } catch {
    // ignore
  }
}

const SITE_LINK = process.env.NEXT_PUBLIC_APP_URL || "https://wowstorg.example.com";

function link(path: string, label: string): string {
  return `<a href="${SITE_LINK}${path}">${escapeTelegramHtml(label)}</a>`;
}

function fmtNum(n: number): string {
  return n.toLocaleString("ru-RU");
}

type OrderForNotify = {
  id: string;
  status: string;
  source: string;
  eventName: string | null;
  readyByDate: Date;
  startDate: Date;
  endDate: Date;
  comment: string | null;
  deliveryEnabled: boolean;
  deliveryComment: string | null;
  deliveryPrice: unknown;
  montageEnabled: boolean;
  montageComment: string | null;
  montagePrice: unknown;
  demontageEnabled: boolean;
  demontageComment: string | null;
  demontagePrice: unknown;
  payMultiplier: unknown;
  rentalDiscountType?: string | null;
  rentalDiscountPercent?: unknown;
  rentalDiscountAmount?: unknown;
  greenwichRequestedDiscountType?: string | null;
  greenwichRequestedDiscountPercent?: unknown;
  greenwichRequestedDiscountAmount?: unknown;
  greenwichDiscountRequestComment?: string | null;
  customer: { name: string };
  createdBy?: { displayName: string };
  greenwichUser?: { displayName: string } | null;
  lines: Array<{
    requestedQty: number;
    pricePerDaySnapshot: unknown;
    item?: { name: string };
    warehouseComment?: string | null;
    greenwichComment?: string | null;
  }>;
};

function shouldNotifyGreenwich(order: OrderForNotify): boolean {
  return order.source === "GREENWICH_INTERNAL" && Boolean(order.greenwichUser);
}

function numericOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeDiscountFields(prefix: "rental" | "greenwichRequested", order: OrderForNotify) {
  if (prefix === "rental") {
    const type = order.rentalDiscountType === "PERCENT" || order.rentalDiscountType === "AMOUNT" ? order.rentalDiscountType : "NONE";
    return {
      type,
      percent: type === "PERCENT" ? numericOrNull(order.rentalDiscountPercent) : null,
      amount: type === "AMOUNT" ? numericOrNull(order.rentalDiscountAmount) : null,
    };
  }
  const type =
    order.greenwichRequestedDiscountType === "PERCENT" || order.greenwichRequestedDiscountType === "AMOUNT"
      ? order.greenwichRequestedDiscountType
      : "NONE";
  return {
    type,
    percent: type === "PERCENT" ? numericOrNull(order.greenwichRequestedDiscountPercent) : null,
    amount: type === "AMOUNT" ? numericOrNull(order.greenwichRequestedDiscountAmount) : null,
  };
}

function discountFieldsEqual(a: ReturnType<typeof normalizeDiscountFields>, b: ReturnType<typeof normalizeDiscountFields>): boolean {
  return a.type === b.type && a.percent === b.percent && a.amount === b.amount;
}

function formatDiscountFields(discount: ReturnType<typeof normalizeDiscountFields>): string {
  if (discount.type === "PERCENT" && discount.percent != null) return `${discount.percent}%`;
  if (discount.type === "AMOUNT" && discount.amount != null) return `${fmtNum(Math.round(discount.amount))} ₽`;
  return "без скидки";
}

function orderHeader(o: OrderForNotify): string {
  const customer = escapeTelegramHtml(o.customer.name);
  const greenwich = o.greenwichUser ? ` · ${escapeTelegramHtml(o.greenwichUser.displayName)}` : "";
  const event = o.eventName ? `\n📌 ${escapeTelegramHtml(o.eventName)}` : "";
  const ready = o.readyByDate.toLocaleDateString("ru-RU");
  const start = o.startDate.toLocaleDateString("ru-RU");
  const end = o.endDate.toLocaleDateString("ru-RU");
  return `👤 ${customer}${greenwich}${event}\n📅 Готовность: ${ready} · Период: ${start} — ${end}`;
}

function buildLinesBlock(o: OrderForNotify): string {
  if (!o.lines?.length) return "";
  const lines = o.lines.map((l) => {
    const name = escapeTelegramHtml(l.item?.name ?? "Позиция");
    return `  • ${name} — ${l.requestedQty} шт.`;
  });
  return `📦 Позиции:\n${lines.join("\n")}`;
}

function buildLinesWithCommentsBlock(lines: OrderForNotify["lines"], commentKey: "greenwichComment" | "warehouseComment"): string {
  if (!lines?.length) return "";
  const rows = lines.map((l) => {
    const name = escapeTelegramHtml(l.item?.name ?? "Позиция");
    const comment = (l as Record<string, unknown>)[commentKey];
    const c = typeof comment === "string" ? comment.trim() : "";
    const short = c ? escapeTelegramHtml(c.length > 120 ? c.slice(0, 117) + "…" : c) : "";
    return `  • ${name} — ${l.requestedQty} шт.${short ? ` (💬 ${short})` : ""}`;
  });
  return `📦 Позиции:\n${rows.join("\n")}`;
}

type GreenwichLineDiff =
  | { kind: "added"; name: string; qty: number; comment?: string | null }
  | { kind: "removed"; name: string; qty: number; comment?: string | null }
  | { kind: "changed"; name: string; fromQty: number; toQty: number; fromComment?: string | null; toComment?: string | null };

function buildGreenwichDiff(before: OrderForNotify, after: OrderForNotify): { lines: GreenwichLineDiff[]; orderNote?: string } {
  const byName = (ls: OrderForNotify["lines"]) =>
    new Map(ls.map((l) => [l.item?.name ?? "Позиция", l]));
  const a = byName(before.lines ?? []);
  const b = byName(after.lines ?? []);
  const out: GreenwichLineDiff[] = [];
  const names = new Set<string>([...a.keys(), ...b.keys()]);
  for (const name of [...names].sort((x, y) => x.localeCompare(y, "ru"))) {
    const left = a.get(name);
    const right = b.get(name);
    if (!left && right) {
      out.push({ kind: "added", name, qty: right.requestedQty, comment: right.greenwichComment ?? null });
      continue;
    }
    if (left && !right) {
      out.push({ kind: "removed", name, qty: left.requestedQty, comment: left.greenwichComment ?? null });
      continue;
    }
    if (!left || !right) continue;
    const lc = (left.greenwichComment ?? "").trim();
    const rc = (right.greenwichComment ?? "").trim();
    if (left.requestedQty !== right.requestedQty || lc !== rc) {
      out.push({
        kind: "changed",
        name,
        fromQty: left.requestedQty,
        toQty: right.requestedQty,
        fromComment: lc || null,
        toComment: rc || null,
      });
    }
  }

  const notes: string[] = [];
  if ((before.comment ?? "").trim() !== (after.comment ?? "").trim()) {
    notes.push("Общий комментарий обновлён");
  }
  if (before.deliveryEnabled !== after.deliveryEnabled) notes.push(`Доставка: ${after.deliveryEnabled ? "включена" : "выключена"}`);
  if ((before.deliveryComment ?? "").trim() !== (after.deliveryComment ?? "").trim() && after.deliveryEnabled) notes.push("Комментарий к доставке обновлён");
  if (before.montageEnabled !== after.montageEnabled) notes.push(`Монтаж: ${after.montageEnabled ? "включен" : "выключен"}`);
  if ((before.montageComment ?? "").trim() !== (after.montageComment ?? "").trim() && after.montageEnabled) notes.push("Комментарий к монтажу обновлён");
  if (before.demontageEnabled !== after.demontageEnabled) notes.push(`Демонтаж: ${after.demontageEnabled ? "включен" : "выключен"}`);
  if ((before.demontageComment ?? "").trim() !== (after.demontageComment ?? "").trim() && after.demontageEnabled) notes.push("Комментарий к демонтажу обновлён");
  const beforeRequest = normalizeDiscountFields("greenwichRequested", before);
  const afterRequest = normalizeDiscountFields("greenwichRequested", after);
  if (!discountFieldsEqual(beforeRequest, afterRequest)) {
    notes.push(`Запрос скидки: ${formatDiscountFields(afterRequest)}`);
  }
  if ((before.greenwichDiscountRequestComment ?? "").trim() !== (after.greenwichDiscountRequestComment ?? "").trim()) {
    notes.push("Комментарий к запросу скидки обновлён");
  }

  return { lines: out, orderNote: notes.length ? notes.join(" · ") : undefined };
}

export async function notifyGreenwichEdited(args: {
  before: OrderForNotify;
  after: OrderForNotify;
  requiresResendEstimate: boolean;
}): Promise<boolean> {
  try {
    const { before, after, requiresResendEstimate } = args;
    notifyDebugLog(`[notifyGreenwichEdited] called for order ${after?.id}`);
    if (!after?.customer) {
      notifyDebugLog(`[notifyGreenwichEdited] skip: no customer order=${after?.id}`);
      console.warn("[notifyGreenwichEdited] skip: order has no customer", after?.id);
      return false;
    }
    const chatId = getWarehouseChatId();
    if (!chatId) {
      notifyDebugLog("[notifyGreenwichEdited] skip: chatId empty");
      console.warn("[notifyGreenwichEdited] skip: chatId empty");
      return false;
    }
    if (!isTelegramConfigured()) {
      notifyDebugLog("[notifyGreenwichEdited] skip: Telegram not configured");
      console.warn("[notifyGreenwichEdited] Telegram is not configured");
      return false;
    }
    const topicId = getWarehouseTopicId();

    const diff = buildGreenwichDiff(before, after);
    const discountRequest = normalizeDiscountFields("greenwichRequested", after);
    const discountRequestChanged =
      !discountFieldsEqual(normalizeDiscountFields("greenwichRequested", before), discountRequest) ||
      (before.greenwichDiscountRequestComment ?? "").trim() !== (after.greenwichDiscountRequestComment ?? "").trim();
    const discountRequestBlock =
      discountRequestChanged && discountRequest.type !== "NONE"
        ? [
            `💸 <b>Запрос скидки от Grinvich</b>`,
            `Размер: ${escapeTelegramHtml(formatDiscountFields(discountRequest))}`,
            after.greenwichDiscountRequestComment?.trim()
              ? `Комментарий: ${escapeTelegramHtml(after.greenwichDiscountRequestComment.trim())}`
              : "",
          ].filter(Boolean).join("\n")
        : discountRequestChanged
          ? "💸 <b>Запрос скидки от Grinvich</b>\nКлиент убрал запрос скидки."
          : "";

    const diffLines =
      diff.lines.length
        ? `🧾 Что изменилось:\n${diff.lines
            .map((d) => {
              const name = escapeTelegramHtml(d.name);
              if (d.kind === "added") return `  ➕ ${name} — ${d.qty} шт.${d.comment ? ` (💬 ${escapeTelegramHtml(String(d.comment).slice(0, 80))})` : ""}`;
              if (d.kind === "removed") return `  ➖ ${name} — убрано`;
              const fromC = d.fromComment ? ` (💬 было: ${escapeTelegramHtml(String(d.fromComment).slice(0, 60))})` : "";
              const toC = d.toComment ? ` (💬 стало: ${escapeTelegramHtml(String(d.toComment).slice(0, 60))})` : "";
              return `  ✏️ ${name}: ${d.fromQty} → ${d.toQty} шт.${fromC}${toC}`;
            })
            .join("\n")}`
        : "";

    const blocks = [
      orderHeader(after),
      requiresResendEstimate ? "⚠️ После правок нужно проверить и отправить смету заново." : "",
      discountRequestBlock,
      diff.orderNote ? `📝 По заявке: ${escapeTelegramHtml(diff.orderNote)}` : "",
      diffLines,
      `📌 Было:\n${buildLinesWithCommentsBlock(before.lines, "greenwichComment")}`,
      `📌 Стало:\n${buildLinesWithCommentsBlock(after.lines, "greenwichComment")}`,
      buildServicesBlock(after),
      buildCommentBlock(after),
      link(`/orders/${after.id}`, "Открыть заявку"),
    ].filter(Boolean);

    const text = `📝 <b>Правки от Grinvich</b>\n\n${blocks.join("\n\n")}`;
    const ok = await sendTelegramMessage(chatId, text, {
      messageThreadId: topicId ? parseInt(topicId, 10) : undefined,
    });
    if (ok) {
      notifyDebugLog(`[notifyGreenwichEdited] sent ok for order ${after.id}`);
    } else {
      notifyDebugLog(`[notifyGreenwichEdited] Telegram send FAILED chatId=${chatId} topicId=${topicId ?? "—"} len=${text.length}`);
      console.warn("[notifyGreenwichEdited] Telegram send failed (chatId=%s, topicId=%s, len=%d)", chatId, topicId ?? "—", text.length);
    }
    return ok;
  } catch (e) {
    notifyDebugLog(`[notifyGreenwichEdited] error: ${e instanceof Error ? e.message : String(e)}`);
    console.error("[notifyGreenwichEdited] unexpected error:", e);
    return false;
  }
}

export async function notifyRentalDiscountApplied(order: OrderForNotify): Promise<void> {
  try {
    notifyDebugLog(`[notifyRentalDiscountApplied] called for order ${order?.id}`);
    if (!shouldNotifyGreenwich(order)) return;
    if (!isTelegramConfigured()) {
      notifyDebugLog("[notifyRentalDiscountApplied] skip: Telegram not configured");
      return;
    }
    const row = await prisma.order.findUnique({
      where: { id: order.id },
      select: {
        greenwichUser: { select: { telegramChatId: true } },
      },
    });
    const chatId = row?.greenwichUser?.telegramChatId?.trim();
    if (!chatId) {
      notifyDebugLog(`[notifyRentalDiscountApplied] skip: no Greenwich telegramChatId order=${order.id}`);
      return;
    }
    const pricing = calcOrderPricing({
      startDate: order.startDate,
      endDate: order.endDate,
      payMultiplier: order.payMultiplier,
      deliveryPrice: order.deliveryEnabled ? order.deliveryPrice : 0,
      montagePrice: order.montageEnabled ? order.montagePrice : 0,
      demontagePrice: order.demontageEnabled ? order.demontagePrice : 0,
      lines: order.lines,
      discount: order,
    });
    const discount = normalizeDiscountFields("rental", order);
    const blocks = [
      orderHeader(order),
      `Склад применил скидку на реквизит: <b>${escapeTelegramHtml(formatDiscountFields(discount))}</b>.`,
      pricing.discountAmount > 0
        ? `Сумма скидки: −${fmtNum(Math.round(pricing.discountAmount))} ₽\nНовая сумма заявки: ${fmtNum(pricing.grandTotal)} ₽`
        : `Скидка снята. Сумма заявки: ${fmtNum(pricing.grandTotal)} ₽`,
      link(`/orders/${order.id}`, "Открыть заявку"),
    ].filter(Boolean);
    await sendTelegramMessage(chatId, `💸 <b>Скидка по заявке обновлена</b>\n\n${blocks.join("\n\n")}`);
  } catch (e) {
    notifyDebugLog(`[notifyRentalDiscountApplied] error: ${e instanceof Error ? e.message : String(e)}`);
    console.error("[notifyRentalDiscountApplied] unexpected error:", e);
  }
}

function buildServicesBlock(o: OrderForNotify): string {
  const rows: string[] = [];
  if (o.deliveryEnabled) {
    rows.push(`  • Доставка${o.deliveryComment ? ` — ${escapeTelegramHtml(o.deliveryComment)}` : ""}`);
  }
  if (o.montageEnabled) {
    rows.push(`  • Монтаж${o.montageComment ? ` — ${escapeTelegramHtml(o.montageComment)}` : ""}`);
  }
  if (o.demontageEnabled) {
    rows.push(`  • Демонтаж${o.demontageComment ? ` — ${escapeTelegramHtml(o.demontageComment)}` : ""}`);
  }
  return rows.length ? `🚚 Доп. услуги:\n${rows.join("\n")}` : "";
}

function buildCommentBlock(o: OrderForNotify): string {
  const c = o.comment?.trim();
  if (!c) return "";
  return `💬 Комментарий:\n${escapeTelegramHtml(c)}`;
}

function buildEstimateBody(o: OrderForNotify): string {
  const pricing = calcOrderPricing({
    startDate: o.startDate,
    endDate: o.endDate,
    payMultiplier: o.payMultiplier,
    deliveryPrice: o.deliveryEnabled ? o.deliveryPrice : 0,
    montagePrice: o.montageEnabled ? o.montagePrice : 0,
    demontagePrice: o.demontageEnabled ? o.demontagePrice : 0,
    lines: o.lines,
    discount: o,
  });
  const days = pricing.days;
  const mult = pricing.payMultiplier;
  const lines: string[] = [];
  for (const [idx, l] of o.lines.entries()) {
    const price = l.pricePerDaySnapshot != null ? Number(l.pricePerDaySnapshot) : 0;
    const sum = pricing.lineAllocations[idx]?.rentalAfterDiscount ?? price * l.requestedQty * days * mult;
    const name = l.item?.name ?? "Позиция";
    lines.push(`  • ${escapeTelegramHtml(name)} — ${l.requestedQty} × ${fmtNum(price)} ₽/сут × ${days} дн. = ${fmtNum(Math.round(sum))} ₽`);
  }
  let block = `📦 Аренда:\n${lines.join("\n")}\n  Итого аренда: ${fmtNum(Math.round(pricing.rentalSubtotalAfterDiscount))} ₽`;
  if (pricing.discountAmount > 0) {
    block += `\n  Скидка на реквизит: −${fmtNum(Math.round(pricing.discountAmount))} ₽`;
  }
  let services = 0;
  const serv: string[] = [];
  if (o.deliveryEnabled) {
    const p = o.deliveryPrice != null ? Number(o.deliveryPrice) : 0;
    services += p;
    serv.push(`  • Доставка: ${fmtNum(p)} ₽`);
  }
  if (o.montageEnabled) {
    const p = o.montagePrice != null ? Number(o.montagePrice) : 0;
    services += p;
    serv.push(`  • Монтаж: ${fmtNum(p)} ₽`);
  }
  if (o.demontageEnabled) {
    const p = o.demontagePrice != null ? Number(o.demontagePrice) : 0;
    services += p;
    serv.push(`  • Демонтаж: ${fmtNum(p)} ₽`);
  }
  if (serv.length) {
    block += `\n\n🚚 Доп. услуги:\n${serv.join("\n")}\n  Итого услуги: ${fmtNum(services)} ₽`;
  }
  block += `\n\n💰 Сумма заявки: ${fmtNum(pricing.grandTotal)} ₽`;
  return block;
}

/** Сколько личных сообщений реально ушло в Telegram (текстовая часть). */
async function sendToGreenwichUsers(
  text: string,
  estimateFile?: { buffer: Buffer; fileName: string },
): Promise<number> {
  // Личные сообщения всем активным GREENWICH пользователям. Сначала всегда текст (информация + «проверьте смету»), затем файл.
  try {
    const rows = await prisma.user.findMany({
      where: {
        role: "GREENWICH",
        isActive: true,
        telegramChatId: { not: null },
      },
      select: { telegramChatId: true },
    });
    const ids = Array.from(
      new Set(
        (rows ?? [])
          .map((r) => (r.telegramChatId ?? "").trim())
          .filter(Boolean),
      ),
    );
    notifyDebugLog(`[sendToGreenwichUsers] recipients: ${ids.length}`);
    if (ids.length === 0) {
      notifyDebugLog("[sendToGreenwichUsers] 0 получателей — укажите Telegram ID сотрудникам Grinvich в админке (Пользователи)");
      return 0;
    }
    let textOk = 0;
    // Сначала гарантированно отправляем текстовое сообщение каждому, затем файл.
    for (const chatId of ids) {
      const ok = await sendTelegramMessage(chatId, text);
      if (ok) textOk += 1;
      else notifyDebugLog(`[sendToGreenwichUsers] text not sent to ${chatId}`);
    }
    if (estimateFile?.buffer?.length) {
      for (const chatId of ids) {
        await sendTelegramDocument(chatId, estimateFile.buffer, estimateFile.fileName, {
          caption: "Файл сметы во вложении",
        });
      }
    }
    return textOk;
  } catch (e) {
    notifyDebugLog(`[sendToGreenwichUsers] error: ${e instanceof Error ? e.message : String(e)}`);
    console.error("[notify] sendToGreenwichUsers failed:", e);
    return 0;
  }
}

/** Для ответа API: почему в Telegram тишина (без секретов). */
export type OrderCreatedNotifyResult = {
  sent: boolean;
  message: string;
  /** Уведомление ушло в фон (`after`), фактический результат только в логах */
  queued?: boolean;
  code?: "no_customer" | "no_bot_token" | "no_warehouse_chat" | "telegram_failed" | "exception";
};

export type OrderCancelledNotifyResult = {
  sent: boolean;
  warehouseSent: boolean;
  greenwichDmSent: number;
  message: string;
  queued?: boolean;
};

/** Текст в JSON, когда отправка Telegram отложена (не ждём в запросе). */
export const TELEGRAM_QUEUED_MESSAGE =
  "Уведомление в Telegram отправляется в фоне после ответа сервера.";

export function makeQueuedOrderCreatedResult(): OrderCreatedNotifyResult {
  return {
    queued: true,
    sent: false,
    message: TELEGRAM_QUEUED_MESSAGE,
  };
}

export function makeQueuedOrderCancelledResult(): OrderCancelledNotifyResult {
  return {
    queued: true,
    sent: false,
    warehouseSent: false,
    greenwichDmSent: 0,
    message: TELEGRAM_QUEUED_MESSAGE,
  };
}

/** Новая заявка создана (Greenwich или склад) → уведомить склад */
export async function notifyOrderCreated(order: OrderForNotify): Promise<OrderCreatedNotifyResult> {
  try {
    notifyDebugLog(`[notifyOrderCreated] order=${order?.id ?? "?"}`);
    const hasToken = isTelegramConfigured();
    const warehouseId = getWarehouseChatId();
    console.info(
      "[notifyOrderCreated] диагностика:",
      JSON.stringify({
        orderId: order?.id,
        hasBotToken: hasToken,
        hasWarehouseChatId: Boolean(warehouseId),
      }),
    );
    if (!order?.customer) {
      notifyDebugLog(`[notifyOrderCreated] skip: no customer order=${order?.id}`);
      console.warn("[notifyOrderCreated] skip: order has no customer", order?.id);
      return {
        sent: false,
        message: "Внутренняя ошибка: у заявки нет заказчика.",
        code: "no_customer",
      };
    }
    const chatId = warehouseId;
    if (!chatId) {
      notifyDebugLog("[notifyOrderCreated] skip: TELEGRAM_NOTIFICATION_CHAT_ID empty");
      console.warn(
        "[notifyOrderCreated] ПРОПУСК: нет ID чата склада. В .env задайте TELEGRAM_NOTIFICATION_CHAT_ID или TELEGRAM_WAREHOUSE_CHAT_ID (см. docs/telegram-notifications.md).",
      );
      return {
        sent: false,
        message:
          "Уведомление не отправлено: в .env не задан TELEGRAM_NOTIFICATION_CHAT_ID (или TELEGRAM_WAREHOUSE_CHAT_ID) — ID чата/группы склада.",
        code: "no_warehouse_chat",
      };
    }
    if (!hasToken) {
      notifyDebugLog("[notifyOrderCreated] skip: TELEGRAM_BOT_TOKEN missing");
      console.warn(
        "[notifyOrderCreated] ПРОПУСК: нет TELEGRAM_BOT_TOKEN в .env — бот не может отправить сообщение.",
      );
      return {
        sent: false,
        message: "Уведомление не отправлено: в .env не задан TELEGRAM_BOT_TOKEN.",
        code: "no_bot_token",
      };
    }
    const topicId = getWarehouseTopicId();
    const blocks = [
      orderHeader(order),
      buildLinesBlock(order),
      buildServicesBlock(order),
      buildCommentBlock(order),
      `Создал: ${escapeTelegramHtml(order.createdBy?.displayName ?? "—")}`,
      link(`/orders/${order.id}`, "Открыть заявку"),
    ].filter(Boolean);
    const text =
      `📩 <b>Новая заявка</b>\n\n` + blocks.join("\n\n");
    const ok = await sendTelegramMessage(chatId, text, {
      messageThreadId: topicId ? parseInt(topicId, 10) : undefined,
    });
    if (!ok) {
      notifyDebugLog(
        `[notifyOrderCreated] Telegram send FAILED order=${order.id} chatId=${chatId} topicId=${topicId ?? "—"} len=${text.length}`,
      );
      console.warn("[notifyOrderCreated] Telegram send failed (chatId=%s, topicId=%s, len=%d)", chatId, topicId ?? "—", text.length);
      return {
        sent: false,
        message:
          "Telegram не принял сообщение: проверьте токен бота, ID чата, TELEGRAM_NOTIFICATION_TOPIC_ID (если форум) и что бот добавлен в группу.",
        code: "telegram_failed",
      };
    }
    notifyDebugLog(`[notifyOrderCreated] ok order=${order.id}`);
    return { sent: true, message: "Уведомление о новой заявке отправлено в чат склада." };
  } catch (e) {
    notifyDebugLog(`[notifyOrderCreated] error: ${e instanceof Error ? e.message : String(e)}`);
    console.error("[notifyOrderCreated] unexpected error:", e);
    return {
      sent: false,
      message: e instanceof Error ? e.message : "Ошибка при формировании уведомления.",
      code: "exception",
    };
  }
}

/** Смета отправлена → Grinvich (в личку) + чат склада. Для Grinvich добавляем напоминание проверить позиции. При передаче estimateFile — прикрепляем файл сметы. */
export async function notifyEstimateSent(
  order: OrderForNotify,
  estimateFile?: { buffer: Buffer; fileName: string },
): Promise<void> {
  try {
    notifyDebugLog(`[notifyEstimateSent] called for order ${order?.id}`);
    if (!order?.customer) {
      notifyDebugLog("[notifyEstimateSent] skip: no customer");
      return;
    }
    if (!Array.isArray(order.lines)) {
      notifyDebugLog("[notifyEstimateSent] skip: no lines");
      return;
    }
    const estimateBlock = buildEstimateBody(order);
    const bodyWarehouse =
      `📤 <b>Смета отправлена</b>\n\n` +
      `${orderHeader(order)}\n\n` +
      `${estimateBlock}\n\n` +
      `${link(`/orders/${order.id}`, "Открыть заявку")}`;

    const bodyGrinvich =
      bodyWarehouse +
      `\n\n⚠️ Проверьте все позиции — склад мог внести правки. Согласуйте смету или запросите изменения.`;

    const warehouseChatId = getWarehouseChatId();
    const topicId = getWarehouseTopicId();
    const threadOpt = { messageThreadId: topicId ? parseInt(topicId, 10) : undefined };

    const estimateCaption =
      order.eventName?.trim() || order.customer?.name
        ? `Смета: ${escapeTelegramHtml((order.eventName?.trim() || order.customer?.name) ?? "")}`
        : "Файл сметы";

    if (warehouseChatId) {
      await sendTelegramMessage(warehouseChatId, bodyWarehouse, threadOpt);
      if (estimateFile?.buffer?.length) {
        await sendTelegramDocument(warehouseChatId, estimateFile.buffer, estimateFile.fileName, {
          caption: estimateCaption,
          ...threadOpt,
        });
      }
    }

    if (shouldNotifyGreenwich(order)) {
      await sendToGreenwichUsers(bodyGrinvich, estimateFile);
      notifyDebugLog(`[notifyEstimateSent] sent to warehouse and Grinvich for order ${order.id}`);
    } else {
      notifyDebugLog(`[notifyEstimateSent] external order: warehouse-only for order ${order.id}`);
    }
  } catch (e) {
    notifyDebugLog(`[notifyEstimateSent] error: ${e instanceof Error ? e.message : String(e)}`);
    console.error("[notifyEstimateSent] unexpected error:", e);
  }
}

/** Grinvich запросил правки → склад */
export async function notifyChangesRequested(order: OrderForNotify): Promise<void> {
  try {
    const chatId = getWarehouseChatId();
    if (!chatId) return;
    const topicId = getWarehouseTopicId();
    const blocks = [
      orderHeader(order),
      buildLinesBlock(order),
      buildServicesBlock(order),
      buildCommentBlock(order),
      `Grinvich внёс правки. Нужно проверить состав и отправить смету заново.`,
      link(`/orders/${order.id}`, "Открыть заявку"),
    ].filter(Boolean);
    const text =
      `✏️ <b>Запрошены изменения</b>\n\n` + blocks.join("\n\n");
    await sendTelegramMessage(chatId, text, {
      messageThreadId: topicId ? parseInt(topicId, 10) : undefined,
    });
  } catch (e) {
    console.error("[notifyChangesRequested] unexpected error:", e);
  }
}

/** Grinvich согласовал смету → склад */
export async function notifyEstimateApproved(order: OrderForNotify): Promise<void> {
  try {
    const chatId = getWarehouseChatId();
    if (!chatId) return;
    const topicId = getWarehouseTopicId();
    const blocks = [
      orderHeader(order),
      buildLinesBlock(order),
      buildServicesBlock(order),
      `Можно начинать сборку.`,
      link(`/orders/${order.id}`, "Открыть заявку"),
    ].filter(Boolean);
    const text =
      `✅ <b>Смета согласована</b>\n\n` + blocks.join("\n\n");
    await sendTelegramMessage(chatId, text, {
      messageThreadId: topicId ? parseInt(topicId, 10) : undefined,
    });
  } catch (e) {
    console.error("[notifyEstimateApproved] unexpected error:", e);
  }
}

type LineDiff = {
  name: string;
  oldQty?: number;
  newQty?: number;
  added?: boolean;
  removed?: boolean;
  comment?: string | null;
};

/** Склад начал сборку → Grinvich */
export async function notifyStartPicking(order: OrderForNotify): Promise<void> {
  try {
    if (!shouldNotifyGreenwich(order)) return;
    const text =
      `📦 <b>Начата сборка</b>\n\n` +
      `${orderHeader(order)}\n\n` +
      `${buildLinesBlock(order)}\n\n` +
      `${link(`/orders/${order.id}`, "Открыть заявку")}`;
    await sendToGreenwichUsers(text);
  } catch (e) {
    console.error("[notifyStartPicking] unexpected error:", e);
  }
}

/** Склад выдал заказ → Grinvich */
export async function notifyIssued(order: OrderForNotify): Promise<void> {
  try {
    if (!shouldNotifyGreenwich(order)) return;
    const text =
      `✅ <b>Заказ выдан</b>\n\n` +
      `${orderHeader(order)}\n\n` +
      `${buildLinesBlock(order)}\n\n` +
      `Можно отправить на приёмку после возврата.\n\n` +
      `${link(`/orders/${order.id}`, "Открыть заявку")}`;
    await sendToGreenwichUsers(text);
  } catch (e) {
    console.error("[notifyIssued] unexpected error:", e);
  }
}

/** Grinvich отправил на приёмку → склад */
export async function notifyReturnDeclared(order: OrderForNotify): Promise<void> {
  try {
    const chatId = getWarehouseChatId();
    if (!chatId) return;
    const topicId = getWarehouseTopicId();
    const blocks = [
      orderHeader(order),
      buildLinesBlock(order),
      buildServicesBlock(order),
      buildCommentBlock(order),
      `Grinvich отправил заявку на приёмку. Проведите приёмку по позициям.`,
      link(`/orders/${order.id}`, "Открыть заявку"),
    ].filter(Boolean);
    const text =
      `📥 <b>Ожидает приёмки</b>\n\n` + blocks.join("\n\n");
    await sendTelegramMessage(chatId, text, {
      messageThreadId: topicId ? parseInt(topicId, 10) : undefined,
    });
  } catch (e) {
    console.error("[notifyReturnDeclared] unexpected error:", e);
  }
}

const CONDITION_LABEL: Record<string, string> = {
  OK: "В норме",
  NEEDS_REPAIR: "Ремонт",
  BROKEN: "Сломано",
  MISSING: "Потеряно",
};

type ReturnSplitForNotify = {
  orderLineId: string;
  condition: string;
  qty: number;
  orderLine?: { item?: { name?: string } };
};

/** Склад закрыл приёмку → Grinvich (сводка по статусам позиций) */
export async function notifyCheckInClosed(
  order: OrderForNotify & {
    returnSplits?: ReturnSplitForNotify[];
  },
): Promise<void> {
  try {
    if (!shouldNotifyGreenwich(order)) return;
    let statusBlock = "";
    const splits = order.returnSplits ?? [];
    if (splits.length > 0) {
      const byLine = new Map<string, Array<{ condition: string; qty: number }>>();
      const lineNames = new Map<string, string>();
      for (const s of splits) {
        const lineId = s.orderLineId ?? "";
        const name = s.orderLine?.item?.name ?? "Позиция";
        lineNames.set(lineId, name);
        if (!byLine.has(lineId)) byLine.set(lineId, []);
        byLine.get(lineId)!.push({ condition: s.condition, qty: s.qty });
      }
      const lines: string[] = [];
      for (const [lineId, parts] of byLine) {
        const name = escapeTelegramHtml(lineNames.get(lineId) ?? "Позиция");
        const sumParts = parts
          .filter((p) => p.qty > 0)
          .map((p) => `${CONDITION_LABEL[p.condition] ?? p.condition}: ${p.qty}`)
          .join(", ");
        if (sumParts) lines.push(`  • ${name} — ${sumParts}`);
      }
      if (lines.length) {
        statusBlock = `\n\n📋 <b>По позициям:</b>\n${lines.join("\n")}`;
      }
    }

    const text =
      `🔒 <b>Приёмка завершена</b>\n\n` +
      `${orderHeader(order)}\n\n` +
      `${buildLinesBlock(order)}` +
      statusBlock +
      `\n\nЗаявка закрыта.\n\n` +
      `${link(`/orders/${order.id}`, "Открыть заявку")}`;
    await sendToGreenwichUsers(text);
  } catch (e) {
    console.error("[notifyCheckInClosed] unexpected error:", e);
  }
}

/** Заявка отменена → склад (и Grinvich в личку при наличии telegramChatId у пользователей) */
export async function notifyOrderCancelled(order: OrderForNotify): Promise<OrderCancelledNotifyResult> {
  try {
    if (!order?.customer) {
      return {
        sent: false,
        warehouseSent: false,
        greenwichDmSent: 0,
        message: "Уведомление не отправлено: нет данных заказчика.",
      };
    }
    const bodyBlocks = [
      orderHeader(order),
      buildLinesBlock(order),
      buildServicesBlock(order),
      buildCommentBlock(order),
      link(`/orders/${order.id}`, "Открыть заявку"),
    ].filter(Boolean);
    const body = `❌ <b>Заявка отменена</b>\n\n` + bodyBlocks.join("\n\n");

    if (!isTelegramConfigured()) {
      console.warn("[notifyOrderCancelled] ПРОПУСК: нет TELEGRAM_BOT_TOKEN");
      return {
        sent: false,
        warehouseSent: false,
        greenwichDmSent: 0,
        message: "Уведомление не отправлено: в .env не задан TELEGRAM_BOT_TOKEN.",
      };
    }

    const warehouseChatId = getWarehouseChatId();
    const topicId = getWarehouseTopicId();
    let warehouseSent = false;
    if (warehouseChatId) {
      warehouseSent = Boolean(
        await sendTelegramMessage(warehouseChatId, body, {
          messageThreadId: topicId ? parseInt(topicId, 10) : undefined,
        }),
      );
    }
    const greenwichDmSent = shouldNotifyGreenwich(order) ? await sendToGreenwichUsers(body) : 0;
    const sent = warehouseSent || greenwichDmSent > 0;

    if (!sent) {
      const msg =
        !warehouseChatId && greenwichDmSent === 0
          ? "Уведомление не отправлено: не задан TELEGRAM_NOTIFICATION_CHAT_ID и ни у одного сотрудника Grinvich в админке не указан Telegram ID."
          : "Telegram не доставил сообщение (проверьте чат склада, топик и личные ID Grinvich).";
      console.warn("[notifyOrderCancelled]", msg);
      return {
        sent: false,
        warehouseSent,
        greenwichDmSent,
        message: msg,
      };
    }

    const parts: string[] = [];
    if (warehouseSent) parts.push("чат склада");
    if (greenwichDmSent > 0) parts.push(`личные сообщения Grinvich (${greenwichDmSent})`);
    return {
      sent: true,
      warehouseSent,
      greenwichDmSent,
      message: `Отправлено: ${parts.join(", ")}.`,
    };
  } catch (e) {
    console.error("[notifyOrderCancelled] unexpected error:", e);
    return {
      sent: false,
      warehouseSent: false,
      greenwichDmSent: 0,
      message: e instanceof Error ? e.message : "Ошибка при отправке уведомления об отмене.",
    };
  }
}
