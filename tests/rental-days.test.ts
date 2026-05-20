import { describe, expect, it } from "vitest";

import {
  billableRentalDaysFromDateOnly,
  rentalHalfIntervalsOverlap,
  rentalOccupiedHalfInterval,
  validateRentalPartCombo,
} from "@/lib/rental-days";

function utcDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

describe("rental day halves", () => {
  it("allows only morning to evening for a one-day rental", () => {
    expect(
      validateRentalPartCombo({
        startDate: "2026-05-20",
        endDate: "2026-05-20",
        rentalStartPartOfDay: "MORNING",
        rentalEndPartOfDay: "EVENING",
      }),
    ).toEqual({ ok: true });

    expect(
      validateRentalPartCombo({
        startDate: "2026-05-20",
        endDate: "2026-05-20",
        rentalStartPartOfDay: "EVENING",
        rentalEndPartOfDay: "EVENING",
      }),
    ).toEqual({
      ok: false,
      message: "За один календарный день возможна только аренда с утра до вечера",
    });
  });

  it("calculates billable days from boundary halves", () => {
    expect(
      billableRentalDaysFromDateOnly({
        startDate: "2026-05-20",
        endDate: "2026-05-20",
        rentalStartPartOfDay: "MORNING",
        rentalEndPartOfDay: "EVENING",
      }),
    ).toBe(1);

    expect(
      billableRentalDaysFromDateOnly({
        startDate: "2026-05-20",
        endDate: "2026-05-21",
        rentalStartPartOfDay: "EVENING",
        rentalEndPartOfDay: "MORNING",
      }),
    ).toBe(1);

    expect(
      billableRentalDaysFromDateOnly({
        startDate: "2026-05-20",
        endDate: "2026-05-22",
        rentalStartPartOfDay: "MORNING",
        rentalEndPartOfDay: "EVENING",
      }),
    ).toBe(3);
  });

  it("treats touching half-day intervals as available, not overlapping", () => {
    const morningOnly = rentalOccupiedHalfInterval({
      startDate: utcDate("2026-05-20"),
      endDate: utcDate("2026-05-20"),
      rentalStartPartOfDay: "MORNING",
      rentalEndPartOfDay: "MORNING",
    });
    const eveningOnly = rentalOccupiedHalfInterval({
      startDate: utcDate("2026-05-20"),
      endDate: utcDate("2026-05-20"),
      rentalStartPartOfDay: "EVENING",
      rentalEndPartOfDay: "EVENING",
    });

    expect(rentalHalfIntervalsOverlap(morningOnly, eveningOnly)).toBe(false);
  });
});
