import { describe, expect, it } from "vitest";

import { validateRentalPartCombo } from "@/lib/rental-days";
import { resolveMaterializeRentalParts } from "@/server/projects/draft-order";

describe("draft order materialize rental parts", () => {
  it("uses morning-to-evening for a single calendar day", () => {
    expect(resolveMaterializeRentalParts("2026-05-27", "2026-05-27")).toEqual({
      rentalStartPartOfDay: "MORNING",
      rentalEndPartOfDay: "EVENING",
    });
    expect(
      validateRentalPartCombo({
        startDate: "2026-05-27",
        endDate: "2026-05-27",
        rentalStartPartOfDay: "MORNING",
        rentalEndPartOfDay: "EVENING",
      }).ok,
    ).toBe(true);
  });

  it("rejects the old create-order default for a single calendar day", () => {
    expect(
      validateRentalPartCombo({
        startDate: "2026-05-27",
        endDate: "2026-05-27",
        rentalStartPartOfDay: "MORNING",
        rentalEndPartOfDay: "MORNING",
      }).ok,
    ).toBe(false);
  });

  it("keeps morning-to-evening for multi-day periods", () => {
    expect(resolveMaterializeRentalParts("2026-05-27", "2026-05-29")).toEqual({
      rentalStartPartOfDay: "MORNING",
      rentalEndPartOfDay: "EVENING",
    });
  });
});
