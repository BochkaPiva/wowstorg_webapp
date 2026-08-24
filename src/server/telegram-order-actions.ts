import type { TelegramInlineKeyboardMarkup } from "@/server/telegram";

const ORDER_ACTION_PREFIX = "goa:";

export type GreenwichOrderAction =
  | { action: "approve-estimate"; orderId: string }
  | { action: "declare-return-ok"; orderId: string }
  | { action: "rate-service"; orderId: string; rating: number };

export function parseGreenwichOrderActionCallback(value: string): GreenwichOrderAction | null {
  if (!value.startsWith(ORDER_ACTION_PREFIX)) return null;
  const [action, orderId, valueArg, extra] = value.slice(ORDER_ACTION_PREFIX.length).split(":");
  if (extra || !orderId) return null;
  if (action === "approve" && !valueArg) return { action: "approve-estimate", orderId };
  if (action === "return" && !valueArg) return { action: "declare-return-ok", orderId };
  if (action === "rate" && valueArg && /^[1-5]$/.test(valueArg)) {
    return { action: "rate-service", orderId, rating: Number(valueArg) };
  }
  return null;
}

export function returnDeclarationKeyboard(args: {
  orderId: string;
  orderUrl: string;
}): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "✅ Всё в порядке — на приёмку", callback_data: `${ORDER_ACTION_PREFIX}return:${args.orderId}` }],
      [{ text: "⚠️ Есть грязное, поломка или потеря", url: args.orderUrl }],
    ],
  };
}

export function serviceRatingKeyboard(args: {
  orderId: string;
  orderUrl: string;
}): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [1, 2, 3, 4, 5].map((rating) => ({
        text: `${rating}★`,
        callback_data: `${ORDER_ACTION_PREFIX}rate:${args.orderId}:${rating}`,
      })),
      [{ text: "💬 Оставить комментарий", url: args.orderUrl }],
    ],
  };
}

export function estimateApprovalKeyboard(args: {
  orderId: string;
  orderUrl: string;
}): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "✅ Согласовать смету", callback_data: `${ORDER_ACTION_PREFIX}approve:${args.orderId}` }],
      [{ text: "✏️ Нужны изменения", url: args.orderUrl }],
    ],
  };
}
