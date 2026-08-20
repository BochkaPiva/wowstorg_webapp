import { describe, expect, it } from "vitest";

import {
  computeGreenwichIncidentsDelta,
  computeGreenwichOverdueDelta,
  effectiveRatingEventDelta,
  getOmskMonthUtcRange,
} from "@/server/ratings/greenwich-rating";

describe("recoverable Greenwich rating events", () => {
  const recoveryStartsAt = new Date("2026-09-01T00:00:00.000Z");
  const recoveryEndsAt = new Date("2026-09-11T00:00:00.000Z");

  it("keeps the full penalty during the grace period", () => {
    expect(
      effectiveRatingEventDelta(
        { delta: -4, recoveryStartsAt, recoveryEndsAt },
        new Date("2026-08-31T23:59:59.000Z"),
      ),
    ).toBe(-4);
  });

  it("returns the penalty gradually during recovery", () => {
    expect(
      effectiveRatingEventDelta(
        { delta: -4, recoveryStartsAt, recoveryEndsAt },
        new Date("2026-09-06T00:00:00.000Z"),
      ),
    ).toBe(-2);
  });

  it("fully restores the penalty after recovery", () => {
    expect(
      effectiveRatingEventDelta(
        { delta: -4, recoveryStartsAt, recoveryEndsAt },
        recoveryEndsAt,
      ),
    ).toBe(0);
  });

  it("does not recover permanent admin corrections", () => {
    expect(
      effectiveRatingEventDelta(
        { delta: -7, recoveryStartsAt: null, recoveryEndsAt: null },
        new Date("2030-01-01T00:00:00.000Z"),
      ),
    ).toBe(-7);
  });
});

describe("Greenwich rating policy limits", () => {
  it("caps a long return delay instead of destroying the score", () => {
    expect(
      computeGreenwichOverdueDelta(
        new Date("2026-08-01T00:00:00.000Z"),
        new Date("2026-08-20T06:00:00.000Z"),
        { overduePenaltyPerDay: -5, overduePenaltyCap: -25 },
      ),
    ).toBe(-25);
  });

  it("rewards a clean return and ignores consumables", () => {
    expect(
      computeGreenwichIncidentsDelta([
        { condition: "OK", qty: 2, itemType: "ASSET" },
        { condition: "MISSING", qty: 20, itemType: "CONSUMABLE" },
      ]),
    ).toBe(5);
  });

  it("weights missing items stronger but applies an incident cap", () => {
    expect(
      computeGreenwichIncidentsDelta(
        [
          { condition: "NEEDS_REPAIR", qty: 8, itemType: "ASSET" },
          { condition: "MISSING", qty: 8, itemType: "ASSET" },
        ],
        {
          repairPenaltyPerUnit: -1,
          lostPenaltyPerUnit: -3,
          incidentPenaltyCap: -20,
        },
      ),
    ).toBe(-20);
  });
});

describe("Greenwich monthly activity window", () => {
  it("uses calendar month boundaries at UTC+6", () => {
    expect(getOmskMonthUtcRange(new Date("2026-08-20T06:00:00.000Z"))).toEqual({
      start: new Date("2026-07-31T18:00:00.000Z"),
      end: new Date("2026-08-31T18:00:00.000Z"),
    });
  });
});
