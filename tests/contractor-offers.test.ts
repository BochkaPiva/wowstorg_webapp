import { describe, expect, it } from "vitest";

import { priceFreshness, proposalLineTotal } from "@/lib/contractor-offers";
import { normalizeContractorName } from "@/server/contractors/identity";

describe("contractor catalog domain helpers", () => {
  it("normalizes spacing, punctuation and case for duplicate protection", () => {
    expect(normalizeContractorName("  ООО «Шоу-Тайм» ")).toBe("ооошоутайм");
    expect(normalizeContractorName("ТТК 11")).toBe(normalizeContractorName("ттк-11"));
  });

  it("calculates proposal totals without floating point noise", () => {
    expect(proposalLineTotal(333.33, 3)).toBe(999.99);
    expect(proposalLineTotal(null, 3)).toBeNull();
  });

  it("flags old prices before a proposal is sent", () => {
    const now = new Date("2026-09-08T00:00:00.000Z");
    expect(priceFreshness("2026-08-01T00:00:00.000Z", now)).toBe("FRESH");
    expect(priceFreshness("2026-04-01T00:00:00.000Z", now)).toBe("AGING");
    expect(priceFreshness("2025-12-01T00:00:00.000Z", now)).toBe("STALE");
    expect(priceFreshness(null, now)).toBe("UNKNOWN");
  });
});
