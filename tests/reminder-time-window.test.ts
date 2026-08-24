import { describe, expect, it } from "vitest";

import {
  CALENDAR_REMINDER_END_HOUR_OMSK,
  getOmskHour,
  isCalendarReminderWindowOpen,
  isReturnReminderDue,
} from "../src/server/reminders/time-window";

describe("calendar reminder window in Omsk", () => {
  it.each([
    ["2026-08-24T18:53:00.000Z", 0, false],
    ["2026-08-25T04:59:00.000Z", 10, false],
    ["2026-08-25T05:00:00.000Z", 11, true],
    ["2026-08-25T05:59:00.000Z", 11, true],
    ["2026-08-25T15:59:00.000Z", 21, true],
    ["2026-08-25T16:00:00.000Z", CALENDAR_REMINDER_END_HOUR_OMSK, false],
  ])("maps %s to Omsk hour %i and window=%s", (iso, hour, expected) => {
    const now = new Date(iso);
    expect(getOmskHour(now)).toBe(hour);
    expect(isCalendarReminderWindowOpen(now, 11)).toBe(expected);
  });

  it("respects a configured start hour", () => {
    const noonOmsk = new Date("2026-08-25T06:00:00.000Z");
    expect(isCalendarReminderWindowOpen(noonOmsk, 13)).toBe(false);
    expect(isCalendarReminderWindowOpen(noonOmsk, 12)).toBe(true);
  });
});

describe("return reminder timing", () => {
  const todayYmd = "2026-08-25";

  it.each([
    ["MORNING", "2026-08-25T04:59:00.000Z", false],
    ["MORNING", "2026-08-25T05:00:00.000Z", true],
    ["EVENING", "2026-08-25T11:59:00.000Z", false],
    ["EVENING", "2026-08-25T12:00:00.000Z", true],
  ] as const)("dispatches %s returns at their own Omsk hour", (part, iso, expected) => {
    expect(isReturnReminderDue({
      now: new Date(iso),
      todayYmd,
      endYmd: todayYmd,
      rentalEndPartOfDay: part,
    })).toBe(expected);
  });

  it("recovers a missed previous-day reminder on the next workday morning", () => {
    expect(isReturnReminderDue({
      now: new Date("2026-08-25T05:00:00.000Z"),
      todayYmd,
      endYmd: "2026-08-24",
      rentalEndPartOfDay: "EVENING",
    })).toBe(true);
  });

  it("does not dispatch future or nighttime return reminders", () => {
    expect(isReturnReminderDue({
      now: new Date("2026-08-25T12:00:00.000Z"),
      todayYmd,
      endYmd: "2026-08-26",
      rentalEndPartOfDay: "MORNING",
    })).toBe(false);
    expect(isReturnReminderDue({
      now: new Date("2026-08-25T16:00:00.000Z"),
      todayYmd,
      endYmd: todayYmd,
      rentalEndPartOfDay: "EVENING",
    })).toBe(false);
  });
});
