import { proposalMoney, proposalTotals, type ProposalItem, type ProposalVariant } from "./proposals";

export function proposalCount(count: number, forms: readonly [string, string, string]) {
  const last = count % 10, lastTwo = count % 100;
  return `${count} ${forms[lastTwo >= 11 && lastTwo <= 14 ? 2 : last === 1 ? 0 : last >= 2 && last <= 4 ? 1 : 2]}`;
}

/** Presentation only: preserve the authoritative PRIMARY-only financial calculation. */
export function proposalBudget(items: readonly ProposalItem[]) {
  const primary = items.filter(item => item.selectionRole === "PRIMARY");
  const totals = proposalTotals(primary);
  const known = primary.length - totals.unresolved;
  return {
    ...totals,
    primaryCount: primary.length,
    label: !primary.length ? "Состав ещё не выбран" : !known ? "Бюджет уточняется" : `${totals.preliminary ? "от " : ""}${proposalMoney(totals.client)}`,
    detail: totals.unresolved ? `${proposalCount(totals.unresolved, ["услуга", "услуги", "услуг"])} по запросу${known ? " — не в сумме" : ""}` : primary.length ? "Все цены основного состава указаны" : "Добавьте услуги в конструкторе",
  };
}

export function proposalVariantSummary(variant: ProposalVariant | undefined) {
  const sections = variant?.sections ?? [];
  const items = sections.flatMap(section => section.items);
  return {
    budget: proposalBudget(items),
    alternatives: items.filter(item => item.selectionRole === "ALTERNATIVE").length,
    options: items.filter(item => item.selectionRole === "OPTIONAL").length,
    sections: sections.map(section => ({
      id: section.id,
      title: section.title,
      selected: section.items.filter(item => item.selectionRole === "PRIMARY").map(item => item.offerTitleSnapshot),
      hasCandidates: section.items.some(item => item.selectionRole === "ALTERNATIVE" || item.selectionRole === "OPTIONAL"),
    })),
  };
}
