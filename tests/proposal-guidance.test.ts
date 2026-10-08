import { describe, expect, it } from "vitest";
import { proposalNextStep } from "@/lib/proposal-guidance";
import type { ProposalItem, ProposalVariant } from "@/lib/proposals";

const item = (selectionRole: ProposalItem["selectionRole"], price: number | null) => ({ id: "i", selectionRole, clientUnitPrice: price, offerTitleSnapshot: "Service" } as ProposalItem);
const variant = (items: ProposalItem[]) => ({ id: "v", title: "Main", isRecommended: true, sections: [{ id: "s", title: "Venue", category: null, items }] } satisfies ProposalVariant);
describe("explainable proposal guidance", () => {
  it("starts with structure and names the empty section", () => { expect(proposalNextStep(undefined, null).kind).toBe("SECTION"); expect(proposalNextStep(variant([]), null)).toMatchObject({ kind: "CATALOG", sectionId: "s" }); });
  it("prioritizes missing primary prices, but does not mistake zero for missing", () => { expect(proposalNextStep(variant([item("PRIMARY", null)]), null)).toMatchObject({ kind: "ITEM", itemId: "i" }); expect(proposalNextStep(variant([item("PRIMARY", 0)]), null).kind).toBe("DOCUMENT"); });
  it("does not claim an alternative contributes to the base budget", () => { expect(proposalNextStep(variant([item("ALTERNATIVE", 100)]), "Intro").title).toBe("Выберите основной состав"); });
  it("excluded-only sections are empty to clients", () => { expect(proposalNextStep(variant([item("EXCLUDED", 100)]), "Intro").kind).toBe("CATALOG"); });
  it("suggests preview without declaring contractor availability or mutating the proposal", () => { const source = variant([item("PRIMARY", 100)]); const original = structuredClone(source); expect(proposalNextStep(source, "Intro").kind).toBe("PREVIEW"); expect(source).toEqual(original); });
});
