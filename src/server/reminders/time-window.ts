const OMSK_TZ = "Asia/Omsk";

export const DEFAULT_CALENDAR_REMINDER_HOUR_OMSK = 11;
export const EVENING_RETURN_REMINDER_HOUR_OMSK = 18;
export const CALENDAR_REMINDER_END_HOUR_OMSK = 22;

export function getOmskHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: OMSK_TZ,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now));
}

/**
 * Календарные сообщения приходят в рабочее время. Нижняя граница настраивается
 * политикой рейтинга, верхняя защищает команду от ночных догоняющих запусков.
 * Точечные напоминания с явно выбранным временем эту проверку не используют.
 */
export function isCalendarReminderWindowOpen(
  now: Date,
  startHourOmsk = DEFAULT_CALENDAR_REMINDER_HOUR_OMSK,
): boolean {
  const hour = getOmskHour(now);
  return hour >= startHourOmsk && hour < CALENDAR_REMINDER_END_HOUR_OMSK;
}

export function isReturnReminderDue(args: {
  now: Date;
  todayYmd: string;
  endYmd: string;
  rentalEndPartOfDay: "MORNING" | "EVENING";
  morningHourOmsk?: number;
}): boolean {
  const morningHour = args.morningHourOmsk ?? DEFAULT_CALENDAR_REMINDER_HOUR_OMSK;
  if (args.endYmd > args.todayYmd) return false;

  // Если нужное окно вчера было полностью недоступно, незавершённая заявка
  // получает страховочное напоминание со следующего рабочего утра.
  if (args.endYmd < args.todayYmd) {
    return isCalendarReminderWindowOpen(args.now, morningHour);
  }

  const dueHour = args.rentalEndPartOfDay === "EVENING"
    ? EVENING_RETURN_REMINDER_HOUR_OMSK
    : morningHour;
  return isCalendarReminderWindowOpen(args.now, dueHour);
}
