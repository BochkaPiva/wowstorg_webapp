/**
 * Отправка сообщений в Telegram через Bot API.
 * Переменные окружения:
 * - TELEGRAM_BOT_TOKEN — токен бота
 * - TELEGRAM_NOTIFICATION_CHAT_ID — ID чата склада (обязателен для уведомлений склада)
 * - TELEGRAM_NOTIFICATION_TOPIC_ID — ID топика в чате склада (опционально, для супергрупп с темами)
 *
 * Backward compatibility:
 * - TELEGRAM_WAREHOUSE_CHAT_ID / TELEGRAM_WAREHOUSE_TOPIC_ID (старые имена)
 * - TELEGRAM_GREENWICH_CHAT_ID (устарело: раньше был общий чат/канал Greenwich)
 */

// Читаем env при каждом вызове, а не при загрузке модуля — иначе в Next.js
// кэшированный модуль может получить пустой process.env до загрузки .env
function getBotToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined;
}

export function isTelegramConfigured(): boolean {
  return Boolean(getBotToken());
}

export function getWarehouseChatId(): string | undefined {
  const id =
    process.env.TELEGRAM_NOTIFICATION_CHAT_ID?.trim() ||
    process.env.TELEGRAM_WAREHOUSE_CHAT_ID?.trim() ||
    undefined;
  return id || undefined;
}

export function getWarehouseTopicId(): string | undefined {
  const raw =
    process.env.TELEGRAM_NOTIFICATION_TOPIC_ID ?? process.env.TELEGRAM_WAREHOUSE_TOPIC_ID;
  return raw ? String(raw).trim() : undefined;
}

export function getGreenwichChatId(): string | undefined {
  return process.env.TELEGRAM_GREENWICH_CHAT_ID?.trim() || undefined;
}

const SEND_TIMEOUT_MS = Number(process.env.TELEGRAM_SEND_TIMEOUT_MS) || 8_000;

/**
 * Отправляет текст в чат. Не бросает ошибки — логирует и выходит (best-effort).
 * Использует таймаут, чтобы не блокировать ответ API при медленном/недоступном Telegram.
 */
const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options?: { messageThreadId?: number | string },
): Promise<boolean> {
  const token = getBotToken();
  if (!token || !chatId) return false;
  const truncated =
    text.length > TELEGRAM_MAX_MESSAGE_LENGTH
      ? text.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH - 20) + "\n\n… (обрезано)"
      : text;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body: { chat_id: string; text: string; parse_mode?: string; message_thread_id?: number } = {
    chat_id: chatId,
    text: truncated,
    parse_mode: "HTML",
  };
  if (options?.messageThreadId != null) {
    body.message_thread_id =
      typeof options.messageThreadId === "string"
        ? parseInt(options.messageThreadId, 10)
        : options.messageThreadId;
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const err = await res.text();
      console.error("[Telegram] sendMessage failed:", res.status, err);
      return false;
    }
    return true;
  } catch (e) {
    clearTimeout(timeoutId);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("abort")) {
      console.warn("[Telegram] sendMessage timeout after", SEND_TIMEOUT_MS, "ms");
    } else {
      console.error("[Telegram] sendMessage error:", e);
    }
    return false;
  }
}

const TELEGRAM_CAPTION_MAX_LENGTH = 1024;

/**
 * Отправляет документ в чат. Не бросает ошибки — логирует и выходит (best-effort).
 */
export async function sendTelegramDocument(
  chatId: string,
  documentBuffer: Buffer,
  fileName: string,
  options?: {
    caption?: string;
    messageThreadId?: number | string;
  },
): Promise<boolean> {
  const token = getBotToken();
  if (!token || !chatId) return false;
  const url = `https://api.telegram.org/bot${token}/sendDocument`;
  const caption = options?.caption
    ? (options.caption.length > TELEGRAM_CAPTION_MAX_LENGTH
        ? options.caption.slice(0, TELEGRAM_CAPTION_MAX_LENGTH - 3) + "…"
        : options.caption)
    : undefined;
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("document", new Blob([documentBuffer]), fileName);
  if (caption) form.append("caption", caption);
  if (options?.messageThreadId != null) {
    form.append(
      "message_thread_id",
      typeof options.messageThreadId === "string"
        ? options.messageThreadId
        : String(options.messageThreadId),
    );
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const err = await res.text();
      console.error("[Telegram] sendDocument failed:", res.status, err);
      return false;
    }
    return true;
  } catch (e) {
    clearTimeout(timeoutId);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("abort")) {
      console.warn("[Telegram] sendDocument timeout after", SEND_TIMEOUT_MS, "ms");
    } else {
      console.error("[Telegram] sendDocument error:", e);
    }
    return false;
  }
}

/** Экранирование для HTML-режима Telegram (в сообщениях не используем < > & для пользовательского ввода). */
export function escapeTelegramHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
