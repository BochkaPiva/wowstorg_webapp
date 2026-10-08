import type { ContractorPriceType } from "./contractor-offers";

export type ProposalItem = {
  id: string; offerId: string | null;
  selectionRole: "PRIMARY" | "ALTERNATIVE" | "OPTIONAL" | "EXCLUDED";
  qty: number; clientUnitPrice: number | null; internalUnitCost: number | null;
  priceTypeSnapshot: ContractorPriceType; unitLabel: string | null;
  contractorNameSnapshot: string; offerTitleSnapshot: string;
  offerDescriptionSnapshot: string | null;
  clientNote: string | null;
  assetSnapshot: Array<{ url: string }> | null;
};
export type ProposalSection = {
  id: string; title: string; category: { id: string; name: string } | null; items: ProposalItem[];
};
export type ProposalVariant = {
  id: string; title: string; isRecommended: boolean; sections: ProposalSection[];
};
export type Proposal = {
  id: string; title: string; status: string; revision: number;
  clientIntro: string | null; clientOutro: string | null;
  owner: { type: "PROJECT"; projectId: string; title: string; archivedAt: string | null }
    | { type: "STANDALONE"; customer: { id: string; name: string } | null; leadCustomerName: string | null; convertedAt: string | null }
    | null;
  variants: ProposalVariant[];
};

type PricedItem = Pick<ProposalItem, "selectionRole" | "qty" | "clientUnitPrice" | "priceTypeSnapshot"> & { internalUnitCost?: number | null };

/** Alternatives and options are shown separately, never silently added to the base budget. */
export function proposalTotals(items: readonly PricedItem[]) {
  let client = 0, cost = 0, unresolved = 0, unconfirmedCost = 0, preliminary = false;
  for (const item of items) {
    if (item.selectionRole !== "PRIMARY") continue;
    if (item.clientUnitPrice == null) unresolved++;
    else client += Math.round(item.qty * item.clientUnitPrice * 100);
    if (item.internalUnitCost == null) unconfirmedCost++;
    else cost += Math.round(item.qty * item.internalUnitCost * 100);
    if (item.priceTypeSnapshot === "FROM" || item.priceTypeSnapshot === "RANGE") preliminary = true;
  }
  client /= 100; cost /= 100;
  return { client, cost, margin: client - cost, unresolved, unconfirmedCost, preliminary };
}

export function proposalMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(value);
}

export const PROPOSAL_STATUS: Record<string, string> = {
  DRAFT: "Черновик", READY: "Готово", SENT: "Отправлено", APPROVED: "Согласовано", ARCHIVED: "Архив",
};
