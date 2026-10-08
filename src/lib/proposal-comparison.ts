import { proposalTotals, type ProposalItem, type ProposalVariant } from "./proposals";

/** Explicit allowlist for this internal comparison view, not a public/export API. */
export type ComparisonItem = Pick<ProposalItem,
  "selectionRole" | "qty" | "clientUnitPrice" | "priceTypeSnapshot" | "unitLabel" |
  "contractorNameSnapshot" | "offerTitleSnapshot" | "offerDescriptionSnapshot" | "clientNote" | "assetSnapshot"
>;
export type ComparisonBudget = { client: number; unresolved: number; preliminary: boolean };
export type ComparisonSection = { title: string; items: ComparisonItem[]; budget: ComparisonBudget };
export type ComparisonVariant = { id: string; title: string; budget: ComparisonBudget };
export type ComparisonRow = { key: string; title: string; cells: (ComparisonSection | null)[]; changed: boolean[]; different: boolean };

function clientItem(item: ProposalItem): ComparisonItem {
  return {
    selectionRole: item.selectionRole, qty: item.qty, clientUnitPrice: item.clientUnitPrice,
    priceTypeSnapshot: item.priceTypeSnapshot, unitLabel: item.unitLabel,
    contractorNameSnapshot: item.contractorNameSnapshot, offerTitleSnapshot: item.offerTitleSnapshot,
    offerDescriptionSnapshot: item.offerDescriptionSnapshot, clientNote: item.clientNote,
    assetSnapshot: item.assetSnapshot?.map(({ url }) => ({ url })) ?? null,
  };
}
function budget(items: readonly ComparisonItem[]): ComparisonBudget {
  const { client, unresolved, preliminary } = proposalTotals(items);
  return { client, unresolved, preliminary };
}
function signature(section: ComparisonSection | null) {
  if (!section) return null;
  // ID/category, private costs and expiring photo URLs aren't composition differences.
  return JSON.stringify(section.items.map((item) => [item.selectionRole, item.offerTitleSnapshot,
    item.contractorNameSnapshot, item.qty, item.unitLabel ?? "шт.", item.clientUnitPrice,
    item.priceTypeSnapshot, item.offerDescriptionSnapshot ?? "", item.clientNote ?? ""]));
}

/** First selected variant is the baseline. Duplicate section titles keep separate occurrences.
 * No fuzzy matching or catalogue reads: compare saved client-visible composition only.
 */
export function compareProposalVariants(source: readonly ProposalVariant[], selectedIds: readonly string[]) {
  const selected = [...new Set(selectedIds)].flatMap((id) => {
    const entry = source.find((variant) => variant.id === id);
    return entry ? [entry] : [];
  });
  const rows = new Map<string, ComparisonRow>();
  const variants: ComparisonVariant[] = [];
  selected.forEach((variant, index) => {
    const occurrences = new Map<string, number>();
    const all: ComparisonItem[] = [];
    for (const section of variant.sections) {
      const normalized = section.title.normalize("NFC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("ru-RU");
      const occurrence = (occurrences.get(normalized) ?? 0) + 1;
      occurrences.set(normalized, occurrence);
      const key = JSON.stringify([normalized, occurrence]);
      if (!rows.has(key)) rows.set(key, { key, title: section.title, cells: selected.map(() => null), changed: [], different: false });
      const items = section.items.filter((item) => item.selectionRole !== "EXCLUDED").map(clientItem);
      rows.get(key)!.cells[index] = { title: section.title, items, budget: budget(items) };
      all.push(...items);
    }
    variants.push({ id: variant.id, title: variant.title, budget: budget(all) });
  });
  for (const row of rows.values()) {
    const baseline = signature(row.cells[0]);
    row.changed = row.cells.map((cell, index) => index > 0 && signature(cell) !== baseline);
    row.different = row.changed.some(Boolean);
  }
  return { variants, rows: [...rows.values()], differenceCount: [...rows.values()].filter((row) => row.different).length };
}

/** Unknown and lower-bound budgets must never imply a guaranteed saving. */
export function comparisonDelta(value: ComparisonBudget, baseline: ComparisonBudget): number | null {
  if (value.unresolved || baseline.unresolved || value.preliminary || baseline.preliminary) return null;
  return (Math.round(value.client * 100) - Math.round(baseline.client * 100)) / 100;
}
