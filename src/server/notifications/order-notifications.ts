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

function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  const days = Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
  return days === 0 ? 1 : days;
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
  const days = daysBetween(o.startDate, o.endDate);
  const mult = o.payMultiplier != null ? Number(o.payMultiplier) : 1;
  let rental = 0;
  const lines: string[] = [];
  for (const l of o.lines) {
    const price = l.pricePerDaySnapshot != null ? Number(l.pricePerDaySnapshot) : 0;
    const sum = price * l.requestedQty * days * mult;
    rental += sum;
    const name = l.item?.name ?? "Позиция";
    lines.push(`  • ${escapeTelegramHtml(name)} — ${l.requestedQty} × ${fmtNum(price)} ₽/сут × ${days} дн. = ${fmtNum(Math.round(sum))} ₽`);
  }
  let block = `📦 Аренда:\n${lines.join("\n")}\n  Итого аренда: ${fmtNum(Math.round(rental))} ₽`;
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
  block += `\n\n💰 Сумма заявки: ${fmtNum(Math.round(rental + services))} ₽`;
  return block;
}

async function sendToGreenwichUsers(
  text: string,
  estimateFile?: { buffer: Buffer; fileName: string },
): Promise<void> {
  // Личные сообщения всем активным GREENWICH пользователям с указанным telegramChatId.
  try {
    const rows = await prisma.$queryRaw<
      Array<{ telegramChatId: string | null }>
    >`SELECT "telegramChatId" FROM "User" WHERE "role" = 'GREENWICH' AND "isActive" = true AND "telegramChatId" IS NOT NULL`;
    const ids = Array.from(
      new Set((rows ?? []).map((r) => (r.telegramChatId ?? "").trim()).filter(Boolean)),
    );
    notifyDebugLog(`[sendToGreenwichUsers] recipients: ${ids.length}`);
    if (ids.length === 0) {
      notifyDebugLog("[sendToGreenwichUsers] 0 получателей — укажите Telegram ID сотрудникам Grinvich в админке (Пользователи)");
      return;
    }
    const results = await Promise.all(ids.map((id) => sendTelegramMessage(id, text)));
    const failed = results.filter((ok) => !ok).length;
    if (failed > 0) {
      notifyDebugLog(`[sendToGreenwichUsers] не доставлено: ${failed} из ${ids.length}`);
    }
    if (estimateFile?.buffer?.length) {
      await Promise.all(
        ids.map((id) =>
          sendTelegramDocument(id, estimateFile.buffer, estimateFile.fileName, {
            caption: "Файл сметы во вложении",
          }),
        ),
      );
    }
  } catch (e) {
    notifyDebugLog(`[sendToGreenwichUsers] error: ${e instanceof Error ? e.message : String(e)}`);
    console.error("[notify] sendToGreenwichUsers failed:", e);
  }
}

/** Новая заявка создана (Greenwich или склад) → уведомить склад */
export async function notifyOrderCreated(order: OrderForNotify): Promise<void> {
  try {
    if (!order?.customer) {
      console.warn("[notifyOrderCreated] skip: order has no customer", order?.id);
      return;
    }
    const chatId = getWarehouseChatId();
    if (!chatId) {
      console.warn("[notifyOrderCreated] skip: chatId empty (check TELEGRAM_NOTIFICATION_CHAT_ID)");
      return;
    }
    if (!isTelegramConfigured()) {
      console.warn("[notifyOrderCreated] Telegram is not configured: TELEGRAM_BOT_TOKEN is missing");
      return;
    }
    if (!chatId) {
      console.warn(
        "[notifyOrderCreated] Warehouse chat id is missing (set TELEGRAM_NOTIFICATION_CHAT_ID or TELEGRAM_WAREHOUSE_CHAT_ID)",
      );
      return;
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
      console.warn("[notifyOrderCreated] Telegram send failed (chatId=%s, topicId=%s, len=%d)", chatId, topicId ?? "—", text.length);
    }
  } catch (e) {
    console.error("[notifyOrderCreated] unexpected error:", e);
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

    if (warehouseChatId) {
      await sendTelegramMessage(warehouseChatId, bodyWarehouse, threadOpt);
      if (estimateFile?.buffer?.length) {
        await sendTelegramDocument(warehouseChatId, estimateFile.buffer, estimateFile.fileName, {
          caption: `Смета по заявке ${order.id}`,
          ...threadOpt,
        });
      }
    }

    await sendToGreenwichUsers(bodyGrinvich, estimateFile);
    notifyDebugLog(`[notifyEstimateSent] sent to warehouse and Grinvich for order ${order.id}`);
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

/** Склад закрыл приёмку → Grinvich */
export async function notifyCheckInClosed(order: OrderForNotify): Promise<void> {
  try {
    const text =
      `🔒 <b>Приёмка завершена</b>\n\n` +
      `${orderHeader(order)}\n\n` +
      `${buildLinesBlock(order)}\n\n` +
      `Заявка закрыта.\n\n` +
      `${link(`/orders/${order.id}`, "Открыть заявку")}`;
    await sendToGreenwichUsers(text);
  } catch (e) {
    console.error("[notifyCheckInClosed] unexpected error:", e);
  }
}

/** Заявка отменена → склад (и Grinvich при наличии чата) */
export async function notifyOrderCancelled(order: OrderForNotify): Promise<void> {
  try {
    const bodyBlocks = [
      orderHeader(order),
      buildLinesBlock(order),
      buildServicesBlock(order),
      buildCommentBlock(order),
      link(`/orders/${order.id}`, "Открыть заявку"),
    ].filter(Boolean);
    const body = `❌ <b>Заявка отменена</b>\n\n` + bodyBlocks.join("\n\n");

    const warehouseChatId = getWarehouseChatId();
    if (warehouseChatId) {
      const topicId = getWarehouseTopicId();
      await sendTelegramMessage(warehouseChatId, body, {
        messageThreadId: topicId ? parseInt(topicId, 10) : undefined,
      });
    }
    await sendToGreenwichUsers(body);
  } catch (e) {
    console.error("[notifyOrderCancelled] unexpected error:", e);
  }
}
