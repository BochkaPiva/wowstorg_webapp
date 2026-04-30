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
 * - TELEGRAM_SEND_TIMEOUT_MS — таймаут HTTP к api.telegram.org (мс), по умолчанию 25000
 * - TELEGRAM_HTTPS_PROXY — HTTP-прокси для исходящих запросов к api.telegram.org (например http://127.0.0.1:7890 при VPN)
 *   Альтернативы: TELEGRAM_PROXY или HTTPS_PROXY (если не задан TELEGRAM_HTTPS_PROXY)
 */

import { Agent, FormData as UndiciFormData, ProxyAgent, fetch as undiciFetch } from "undici";

// Читаем env при каждом вызове, а не при загрузке модуля — иначе в Next.js
// кэшированный модуль может получить пустой process.env до загрузки .env
function getBotToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined;
}

export function isTelegramConfigured(): boolean {
  return Boolean(getBotToken());
}

export function getTelegramWebhookSecret(): string | undefined {
  return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || undefined;
}

export function getTelegramWebhookUrl(): string | null {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  return baseUrl ? `${baseUrl}/api/telegram/webhook` : null;
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

const DEFAULT_SEND_TIMEOUT_MS = 25_000;
const MAX_SEND_TIMEOUT_MS = 120_000;

/** Для GET /api/admin/telegram и отладки: фактический таймаут (мс). */
export function getSendTimeoutMs(): number {
  const raw = process.env.TELEGRAM_SEND_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_SEND_TIMEOUT_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SEND_TIMEOUT_MS;
  return Math.min(Math.floor(n), MAX_SEND_TIMEOUT_MS);
}

/** URL HTTP(S)-прокси для Telegram (приоритет: TELEGRAM_HTTPS_PROXY → TELEGRAM_PROXY → HTTPS_PROXY). */
function getTelegramProxyUrl(): string | undefined {
  const u =
    process.env.TELEGRAM_HTTPS_PROXY?.trim() ||
    process.env.TELEGRAM_PROXY?.trim() ||
    process.env.HTTPS_PROXY?.trim();
  return u || undefined;
}

/** Используется ли прокси для запросов к Bot API (для админки). */
export function isTelegramProxyConfigured(): boolean {
  return Boolean(getTelegramProxyUrl());
}

/** Показать хост прокси без учётных данных (для логов/админки). */
export function getTelegramProxyLabel(): string | null {
  const raw = getTelegramProxyUrl();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    return `${u.protocol}//${u.hostname}:${port}`;
  } catch {
    return "настроен";
  }
}

let dispatcherCache: { key: string; dispatcher: Agent | ProxyAgent } | undefined;

/**
 * Undici: общий таймаут на connect+TLS к api.telegram.org (по умолчанию 10 s у глобального fetch).
 * Плюс опциональный прокси (VPN с локальным HTTP-портом).
 */
function getTelegramDispatcher(): Agent | ProxyAgent {
  const ms = getSendTimeoutMs();
  const proxy = getTelegramProxyUrl();
  const key = `${proxy ?? "direct"}:${ms}`;
  if (dispatcherCache?.key === key) {
    return dispatcherCache.dispatcher;
  }
  const opts = {
    connectTimeout: ms,
    headersTimeout: Math.max(ms, 60_000),
    bodyTimeout: Math.max(ms, 60_000),
  };
  const dispatcher = proxy
    ? new ProxyAgent({ uri: proxy, ...opts })
    : new Agent(opts);
  dispatcherCache = { key, dispatcher };
  return dispatcher;
}

type UndiciFetchInit = NonNullable<Parameters<typeof undiciFetch>[1]>;

function telegramFetch(input: string | URL, init?: UndiciFetchInit) {
  return undiciFetch(input, {
    ...init,
    dispatcher: getTelegramDispatcher(),
  });
}

/** Текст ошибки из ответа Bot API (поле description), иначе обрезанное тело. */
function telegramErrorDescription(httpBody: string): string {
  try {
    const j = JSON.parse(httpBody) as { description?: string };
    if (j?.description && typeof j.description === "string") return j.description;
  } catch {
    /* ignore */
  }
  return httpBody.length > 400 ? httpBody.slice(0, 400) + "…" : httpBody;
}

/**
 * Telegram почти всегда отдаёт HTTP 200 и результат в JSON: { ok: true|false, description?, ... }.
 * Проверять только res.ok (HTTP) нельзя — при ok:false сообщение не отправлено.
 */
function parseTelegramApiBody(bodyText: string): { ok: boolean; description?: string } {
  try {
    const j = JSON.parse(bodyText) as { ok?: boolean; description?: string };
    return { ok: j.ok === true, description: j.description };
  } catch {
    return { ok: false, description: bodyText.slice(0, 300) };
  }
}

/**
 * Node/undici часто отдаёт только "fetch failed"; реальная причина в error.cause (DNS, TLS, reset).
 */
function describeNetworkError(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  for (let depth = 0; depth < 8 && cur != null; depth++) {
    if (cur instanceof Error) {
      if (cur.message) parts.push(cur.message);
      const ne = cur as NodeJS.ErrnoException;
      if (ne.code && typeof ne.code === "string") parts.push(`errno ${ne.code}`);
      if (ne.syscall && typeof ne.syscall === "string") parts.push(ne.syscall);
      cur = cur.cause;
    } else if (typeof cur === "object") {
      const o = cur as { code?: string; message?: string };
      if (o.message) parts.push(String(o.message));
      if (o.code) parts.push(String(o.code));
      break;
    } else {
      parts.push(String(cur));
      break;
    }
  }
  const joined = [...new Set(parts.filter(Boolean))].join(" → ");
  if (!joined) return "Неизвестная ошибка сети";
  const lower = joined.toLowerCase();
  if (lower.includes("connect timeout") || lower.includes("und_err_connect_timeout")) {
    return `${joined}. Прямое подключение к api.telegram.org не проходит. Варианты: VPN с системным туннелем; либо в .env задать локальный прокси VPN, например TELEGRAM_HTTPS_PROXY=http://127.0.0.1:7890 (порт из Clash/v2ray и т.п.), затем перезапуск сервера.`;
  }
  if (lower.includes("fetch failed") || lower.includes("network error")) {
    return `${joined}. Частые причины: нет интернета, блокировка api.telegram.org, фаервол, неверный DNS, нужен VPN. Проверка: curl https://api.telegram.org`;
  }
  return joined;
}

/**
 * Отправляет текст в чат. Не бросает ошибки — логирует и выходит (best-effort).
 * Использует таймаут, чтобы не блокировать ответ API при медленном/недоступном Telegram.
 */
const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

export type TelegramSendMessageResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Как {@link sendTelegramMessage}, но возвращает текст ошибки от Bot API (поле description) или сеть/таймаут.
 */
export async function sendTelegramMessageDetailed(
  chatId: string,
  text: string,
  options?: { messageThreadId?: number | string },
): Promise<TelegramSendMessageResult> {
  const token = getBotToken();
  if (!token) return { ok: false, error: "Нет TELEGRAM_BOT_TOKEN" };
  if (!chatId?.trim()) return { ok: false, error: "Пустой chat_id" };
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
    const parsed =
      typeof options.messageThreadId === "string"
        ? parseInt(options.messageThreadId, 10)
        : options.messageThreadId;
    if (Number.isFinite(parsed)) body.message_thread_id = parsed;
  }
  const sendTimeoutMs = getSendTimeoutMs();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), sendTimeoutMs);
  try {
    const res = await telegramFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const bodyText = await res.text();
    let parsed = parseTelegramApiBody(bodyText);

    // Fallback: HTML parse failed — повтор без parse_mode (новый fetch + таймер)
    if (
      !parsed.ok &&
      body.parse_mode === "HTML" &&
      (parsed.description ?? "").toLowerCase().includes("can't parse entities")
    ) {
      clearTimeout(timeoutId);
      const plainBody = { ...body };
      delete plainBody.parse_mode;
      const c2 = new AbortController();
      const t2 = setTimeout(() => c2.abort(), sendTimeoutMs);
      try {
        const res2 = await telegramFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(plainBody),
          signal: c2.signal,
        });
        const text2 = await res2.text();
        parsed = parseTelegramApiBody(text2);
        clearTimeout(t2);
        if (parsed.ok) return { ok: true };
        const errPlain = parsed.description ?? telegramErrorDescription(text2);
        console.error("[Telegram] sendMessage API ok=false (plain)", res2.status, errPlain);
        return { ok: false, error: errPlain };
      } catch (e2) {
        clearTimeout(t2);
        throw e2;
      }
    }

    clearTimeout(timeoutId);
    if (!res.ok) {
      const desc = telegramErrorDescription(bodyText);
      console.error("[Telegram] sendMessage HTTP", res.status, desc);
      return { ok: false, error: `HTTP ${res.status}: ${desc}` };
    }
    if (!parsed.ok) {
      const desc = parsed.description ?? telegramErrorDescription(bodyText);
      console.error("[Telegram] sendMessage API ok=false", desc);
      return { ok: false, error: desc };
    }
    return { ok: true };
  } catch (e) {
    clearTimeout(timeoutId);
    const msg = e instanceof Error ? e.message : String(e);
    const aborted =
      (e instanceof Error && e.name === "AbortError") ||
      /aborted|abort/i.test(msg);
    if (aborted) {
      console.warn("[Telegram] sendMessage timeout after", sendTimeoutMs, "ms");
      return {
        ok: false,
        error: `Таймаут ${sendTimeoutMs} мс до ответа api.telegram.org. Увеличьте TELEGRAM_SEND_TIMEOUT_MS в .env (например 45000) и перезапустите сервер. Если снова таймаут — проверьте доступ к API с этой машины (VPN/прокси, фаервол, блокировки провайдера), тест: curl https://api.telegram.org/bot<TOKEN>/getMe`,
      };
    }
    console.error("[Telegram] sendMessage error:", e);
    return { ok: false, error: describeNetworkError(e) };
  }
}

/** @returns true если сообщение доставлено (как раньше). */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options?: { messageThreadId?: number | string },
): Promise<boolean> {
  const r = await sendTelegramMessageDetailed(chatId, text, options);
  return r.ok;
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
  const form = new UndiciFormData();
  form.append("chat_id", chatId);
  form.append(
    "document",
    new Blob([new Uint8Array(documentBuffer as ArrayBuffer | ArrayLike<number>)]),
    fileName,
  );
  if (caption) form.append("caption", caption);
  if (options?.messageThreadId != null) {
    const parsed =
      typeof options.messageThreadId === "string"
        ? parseInt(options.messageThreadId, 10)
        : options.messageThreadId;
    if (Number.isFinite(parsed)) {
      form.append("message_thread_id", String(parsed));
    }
  }
  const docTimeoutMs = getSendTimeoutMs();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), docTimeoutMs);
  try {
    const res = await telegramFetch(url, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    const bodyText = await res.text();
    clearTimeout(timeoutId);
    const parsed = parseTelegramApiBody(bodyText);
    if (!res.ok) {
      console.error("[Telegram] sendDocument HTTP", res.status, telegramErrorDescription(bodyText));
      return false;
    }
    if (!parsed.ok) {
      console.error("[Telegram] sendDocument API ok=false", parsed.description ?? bodyText);
      return false;
    }
    return true;
  } catch (e) {
    clearTimeout(timeoutId);
    const msg = e instanceof Error ? e.message : String(e);
    const aborted =
      (e instanceof Error && e.name === "AbortError") ||
      /aborted|abort/i.test(msg);
    if (aborted) {
      console.warn("[Telegram] sendDocument timeout after", docTimeoutMs, "ms");
    } else {
      console.error("[Telegram] sendDocument error:", describeNetworkError(e), e);
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
