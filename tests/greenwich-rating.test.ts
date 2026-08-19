import { describe, expect, it } from "vitest";

import { effectiveRatingEventDelta } from "@/server/ratings/greenwich-rating";

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
