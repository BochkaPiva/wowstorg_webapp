import { describe, expect, it } from "vitest";
import { proposalBudget, proposalCount, proposalVariantSummary } from "../src/lib/proposal-summary";
import { proposalMoney, type ProposalItem } from "../src/lib/proposals";

const item = (patch: Partial<ProposalItem> = {}): ProposalItem => ({
  id: "i", offerId: null, selectionRole: "PRIMARY", qty: 2, clientUnitPrice: null,
  internalUnitCost: null, priceTypeSnapshot: "ON_REQUEST", unitLabel: "час",
  contractorNameSnapshot: "Ведущий", offerTitleSnapshot: "Ведение мероприятия",
  offerDescriptionSnapshot: null, clientNote: null, assetSnapshot: null, ...patch,
});

describe("proposal summary", () => {
  it("does not show a zero budget for missing prices or an empty selection", () => {
    expect(proposalBudget([item()]).label).toBe("Бюджет уточняется");
    expect(proposalBudget([]).label).toBe("Состав ещё не выбран");
    expect(proposalBudget([item()]).detail).toBe("1 услуга по запросу");
  });
  it("keeps an explicitly known zero and a partial known subtotal", () => {
    expect(proposalBudget([item({ clientUnitPrice: 0, priceTypeSnapshot: "FIXED" })]).label).toBe(proposalMoney(0));
    const budget = proposalBudget([item({ clientUnitPrice: 5000, priceTypeSnapshot: "FIXED" }), item()]);
    expect(budget.label).toBe(proposalMoney(10000));
    expect(budget.detail).toBe("1 услуга по запросу — не в сумме");
  });
  it("retains preliminary prices and excludes alternatives, options and excluded items", () => {
    const budget = proposalBudget([item({ clientUnitPrice: 5000, priceTypeSnapshot: "FROM" }), item({ selectionRole: "ALTERNATIVE" }), item({ selectionRole: "OPTIONAL" }), item({ selectionRole: "EXCLUDED" })]);
    expect(budget.label).toBe(`от ${proposalMoney(10000)}`);
    expect(budget.primaryCount).toBe(1);
    expect(budget.unresolved).toBe(0);
    expect(proposalBudget([item({ clientUnitPrice: 5000, priceTypeSnapshot: "RANGE" })]).label).toMatch(/^от /);
  });
  it("reports the selected services separately from candidates", () => {
    const summary = proposalVariantSummary({ id: "v", title: "Вариант", isRecommended: true, sections: [
      { id: "s", title: "Ведущие", category: null, items: [item(), item({ selectionRole: "ALTERNATIVE" }), item({ selectionRole: "OPTIONAL" })] },
      { id: "empty", title: "Техника", category: null, items: [item({ selectionRole: "EXCLUDED" })] },
    ] });
    expect(summary.sections[0].selected).toEqual(["Ведение мероприятия"]);
    expect(summary.sections[1].selected).toEqual([]);
    expect(summary.sections[1].hasCandidates).toBe(false);
    expect(summary.alternatives).toBe(1);
    expect(summary.options).toBe(1);
    expect(proposalVariantSummary(undefined).sections).toEqual([]);
  });
  it("uses correct Russian counts including teens", () => {
    const forms = ["раздел", "раздела", "разделов"] as const;
    expect([0, 1, 3, 5, 11, 14, 21, 22].map(n => proposalCount(n, forms))).toEqual(["0 разделов", "1 раздел", "3 раздела", "5 разделов", "11 разделов", "14 разделов", "21 раздел", "22 раздела"]);
  });
});
