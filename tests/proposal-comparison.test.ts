import { describe, expect, it } from "vitest";
import { compareProposalVariants, comparisonDelta } from "@/lib/proposal-comparison";
import type { ProposalItem, ProposalVariant } from "@/lib/proposals";

const item = (overrides: Partial<ProposalItem> = {}): ProposalItem => ({
  id: "i", offerId: "offer", selectionRole: "PRIMARY", qty: 1, clientUnitPrice: 5000,
  internalUnitCost: 3177, priceTypeSnapshot: "FIXED", unitLabel: "час",
  contractorNameSnapshot: "Ведущий", offerTitleSnapshot: "Программа", offerDescriptionSnapshot: "Описание",
  clientNote: null, assetSnapshot: [{ url: "/photo" }], ...overrides,
});
const variant = (id: string, title = "Программа", items = [item()]): ProposalVariant => ({
  id, title: id, isRecommended: false, sections: [{ id: `section-${id}`, title, category: null, items }],
});
describe("proposal variant comparison", () => {
  it("aligns cloned sections with normalized names, not regenerated IDs", () => {
    const result = compareProposalVariants([variant("a"), variant("b", "  ПРОГРАММА ", [item({ id: "clone" })])], ["a", "b"]);
    expect(result.rows).toHaveLength(1); expect(result.differenceCount).toBe(0);
  });
  it("keeps repeated section names distinct and missing sections explicit", () => {
    const a = variant("a"); a.sections.push({ ...a.sections[0], id: "duplicate" });
    const result = compareProposalVariants([a, variant("b")], ["a", "b"]);
    expect(result.rows).toHaveLength(2); expect(result.rows[1].cells[1]).toBeNull(); expect(result.differenceCount).toBe(1);
  });
  it("preserves baseline order then appends sections unique to other variants", () => {
    const result = compareProposalVariants([variant("a", "Площадка"), variant("b", "Шоу")], ["b", "a", "b", "missing"]);
    expect(result.variants.map((v) => v.id)).toEqual(["b", "a"]); expect(result.rows.map((r) => r.title)).toEqual(["Шоу", "Площадка"]);
    expect(result.rows.every((r) => r.different)).toBe(true);
  });
  it.each([
    { qty: 2 }, { clientUnitPrice: 0 }, { selectionRole: "OPTIONAL" as const },
    { contractorNameSnapshot: "Другой ведущий" }, { clientNote: "Другая программа" },
    { offerDescriptionSnapshot: "Другой состав" }, { priceTypeSnapshot: "FROM" as const }, { unitLabel: "день" },
  ])("detects visible difference %j", (patch) => {
    const result = compareProposalVariants([variant("a"), variant("b", undefined, [item(patch)])], ["a", "b"]);
    expect(result.rows[0].changed).toEqual([false, true]);
  });
  it("does not mark private cost, excluded items or signed photo URL changes as differences", () => {
    const result = compareProposalVariants([variant("a"), variant("b", undefined, [
      item({ internalUnitCost: 8888, assetSnapshot: [{ url: "/photo?token=new" }] }), item({ selectionRole: "EXCLUDED" }),
    ])], ["a", "b"]);
    expect(result.differenceCount).toBe(0); expect(JSON.stringify(result)).not.toContain("internalUnitCost");
    expect(JSON.stringify(result)).not.toContain("8888"); expect(JSON.stringify(result)).not.toContain("offerId");
    expect(result.rows[0].cells[1]?.items).toHaveLength(1);
  });
  it("ignores arbitrary private properties, including nested asset metadata", () => {
    const source = item(); Object.assign(source, { privateNotes: "secret" }); Object.assign(source.assetSnapshot![0], { contact: "hidden" });
    const result = JSON.stringify(compareProposalVariants([variant("a", undefined, [source])], ["a"]));
    expect(result).not.toContain("secret"); expect(result).not.toContain("hidden"); expect(result).not.toContain("margin");
  });
  it("counts only primary prices, including real zero; does not invent unknown prices", () => {
    const result = compareProposalVariants([variant("a", undefined, [item({ clientUnitPrice: 0 }), item({ clientUnitPrice: null }),
      item({ selectionRole: "OPTIONAL", clientUnitPrice: 9000 }), item({ selectionRole: "ALTERNATIVE", clientUnitPrice: 3000 })])], ["a"]);
    expect(result.variants[0].budget).toEqual({ client: 0, unresolved: 1, preliminary: false });
  });
  it("uses per-item cent rounding and exposes lower-bound pricing", () => {
    const result = compareProposalVariants([variant("a", undefined, [item({ qty: 3, clientUnitPrice: 0.335, priceTypeSnapshot: "RANGE" })])], ["a"]);
    expect(result.variants[0].budget).toEqual({ client: 1.01, unresolved: 0, preliminary: true });
  });
  it("shows delta only between complete fixed budgets", () => {
    const a = { client: 10.2, unresolved: 0, preliminary: false };
    expect(comparisonDelta({ ...a, client: 10.3 }, a)).toBe(0.1);
    expect(comparisonDelta({ ...a, client: 0 }, a)).toBe(-10.2);
    expect(comparisonDelta({ ...a, unresolved: 1 }, a)).toBeNull();
    expect(comparisonDelta(a, { ...a, preliminary: true })).toBeNull();
  });
  it("handles empty variants without mutating inputs", () => {
    const source = [variant("a")]; const before = structuredClone(source);
    expect(compareProposalVariants(source, []).rows).toEqual([]);
    compareProposalVariants(source, ["a"]); expect(source).toEqual(before);
  });
});
