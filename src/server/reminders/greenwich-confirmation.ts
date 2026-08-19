import type { GreenwichReminderCheckpoint } from "@prisma/client";
import { z } from "zod";

import { formatRentalPeriodRangeFromUtcDatesRu } from "@/lib/rental-days";
import type { TelegramInlineKeyboardMarkup } from "@/server/telegram";
import { escapeTelegramHtml } from "@/server/telegram";

export const GREENWICH_CONFIRMATION_CHECKPOINTS = [
  { checkpoint: "DAYS_30", daysBefore: 30, callbackValue: "30" },
  { checkpoint: "DAYS_7", daysBefore: 7, callbackValue: "7" },
  { checkpoint: "DAYS_3", daysBefore: 3, callbackValue: "3" },
] as const satisfies ReadonlyArray<{
  checkpoint: GreenwichReminderCheckpoint;
  daysBefore: number;
  callbackValue: string;
}>;

const CallbackActionSchema = z.enum(["ok", "chg", "cancel", "cancel_yes", "back"]);
export type GreenwichConfirmationAction = z.infer<typeof CallbackActionSchema>;

const CallbackDataSchema = z.string().transform((value, ctx) => {
  const parts = value.split(":");
  if (parts.length !== 4 || parts[0] !== "gcf") {
    ctx.addIssue({ code: "custom", message: "Unsupported callback" });
    return z.NEVER;
  }
  const checkpoint = GREENWICH_CONFIRMATION_CHECKPOINTS.find(
    (entry) => entry.callbackValue === parts[1],
  );
  const action = CallbackActionSchema.safeParse(parts[2]);
  const orderId = parts[3]?.trim();
  if (!checkpoint || !action.success || !orderId) {
    ctx.addIssue({ code: "custom", message: "Invalid callback" });
    return z.NEVER;
  }
  return {
    checkpoint: checkpoint.checkpoint,
    daysBefore: checkpoint.daysBefore,
    action: action.data,
    orderId,
  };
});

export function parseGreenwichConfirmationCallback(value: string) {
  const parsed = CallbackDataSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function callbackData(
  checkpoint: GreenwichReminderCheckpoint,
  action: GreenwichConfirmationAction,
  orderId: string,
): string {
  const value = GREENWICH_CONFIRMATION_CHECKPOINTS.find(
    (entry) => entry.checkpoint === checkpoint,
  )?.callbackValue;
  if (!value) throw new Error(`Unknown Greenwich reminder checkpoint: ${checkpoint}`);
  return `gcf:${value}:${action}:${orderId}`;
}

export function greenwichConfirmationKeyboard(args: {
  orderId: string;
  checkpoint: GreenwichReminderCheckpoint;
}): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "✅ Всё актуально",
          callback_data: callbackData(args.checkpoint, "ok", args.orderId),
        },
      ],
      [
        {
          text: "✏️ Есть изменения",
          callback_data: callbackData(args.checkpoint, "chg", args.orderId),
        },
        {
          text: "❌ Отменить заявку",
          callback_data: callbackData(args.checkpoint, "cancel", args.orderId),
        },
      ],
    ],
  };
}

export function greenwichCancellationKeyboard(args: {
  orderId: string;
  checkpoint: GreenwichReminderCheckpoint;
}): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "Да, отменить заявку",
          callback_data: callbackData(args.checkpoint, "cancel_yes", args.orderId),
        },
        {
          text: "Назад",
          callback_data: callbackData(args.checkpoint, "back", args.orderId),
        },
      ],
    ],
  };
}

function checkpointLeadText(daysBefore: number): string {
  if (daysBefore === 30) return "примерно через месяц";
  if (daysBefore === 7) return "через неделю";
  return "через три дня";
}

export function greenwichConfirmationMessage(args: {
  eventName: string | null;
  customerName: string;
  startDate: Date;
  endDate: Date;
  rentalStartPartOfDay?: "MORNING" | "EVENING" | null;
  rentalEndPartOfDay?: "MORNING" | "EVENING" | null;
  daysBefore: number;
  orderUrl: string;
}): string {
  const title = args.eventName?.trim() || args.customerName;
  const period = formatRentalPeriodRangeFromUtcDatesRu({
    startDate: args.startDate,
    endDate: args.endDate,
    rentalStartPartOfDay: args.rentalStartPartOfDay,
    rentalEndPartOfDay: args.rentalEndPartOfDay,
  });
  return [
    "🦖 <b>Проверим актуальность заявки</b>",
    "",
    `Событие «<b>${escapeTelegramHtml(title)}</b>» начинается ${checkpointLeadText(args.daysBefore)}.`,
    `Заказчик: ${escapeTelegramHtml(args.customerName)}`,
    `Период: ${escapeTelegramHtml(period)}`,
    "",
    "Всё остаётся в силе или появились изменения?",
    "",
    `<a href="${args.orderUrl}">Открыть заявку</a>`,
  ].join("\n");
}
