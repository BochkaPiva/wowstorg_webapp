import type { ProposalCommand } from "./proposal-recovery";
import type { Proposal, ProposalItem } from "./proposals";
import { proposalOrder } from "./proposal-order";

export const isQueuedId = (id: string) => id.startsWith("queued:");

/** Local projection only. The server still creates snapshots, checks CAS, and owns IDs. */
export function projectProposalCommands(server: Proposal, commands: readonly ProposalCommand[], previews: ReadonlyMap<string, ProposalItem> = new Map()): Proposal {
  if (!commands.length) return server;
  const next = structuredClone(server);
  for (const { operation: op } of commands) {
    const sections = next.variants.flatMap(variant => variant.sections);
    const section = sections.find(row => row.id === op.sectionId);
    const source = sections.find(row => row.items.some(item => item.id === op.itemId));
    const item = source?.items.find(row => row.id === op.itemId);
    if (op.action === "UPDATE_PROPOSAL") {
      for (const key of ["title", "clientIntro", "clientOutro"] as const) if (key in op) Object.assign(next, { [key]: op[key] });
    }
    if (op.action === "UPDATE_ITEM" && item) {
      for (const key of ["qty", "clientUnitPrice", "internalUnitCost", "selectionRole", "clientNote"] as const) if (key in op) Object.assign(item, { [key]: op[key] });
    }
    if (op.action === "REMOVE_ITEM" && source) source.items = source.items.filter(row => row.id !== op.itemId);
    if (op.action === "REMOVE_SECTION") for (const variant of next.variants) variant.sections = variant.sections.filter(row => row.id !== op.sectionId);
    if (op.action === "MOVE_SECTION" && section) {
      const variant = next.variants.find(row => row.sections.some(child => child.id === section.id));
      if (variant) { const order = proposalOrder(variant.sections.map(row => row.id), section.id, op.beforeId as string | null); variant.sections.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); }
    }
    if (op.action === "MOVE_ITEM" && source && item && section) {
      source.items = source.items.filter(row => row.id !== item.id);
      const index = section.items.findIndex(row => row.id === op.beforeId);
      section.items.splice(index < 0 ? section.items.length : index, 0, item);
    }
    if (op.action === "ADD_CATALOG_ITEM" && section) {
      const preview = previews.get(op.mutationId);
      if (preview) section.items.push({ ...preview, id: `queued:${op.mutationId}` });
    }
    if (op.action === "ADD_MANUAL_ITEM" && section) section.items.push({
      id: `queued:${op.mutationId}`, offerId: null, selectionRole: "PRIMARY", qty: 1,
      clientUnitPrice: op.clientUnitPrice as number | null ?? null, internalUnitCost: op.internalUnitCost as number | null ?? null,
      priceTypeSnapshot: "FIXED", unitLabel: op.unitLabel as string | null ?? null,
      contractorNameSnapshot: "Свой вариант", offerTitleSnapshot: String(op.title), offerDescriptionSnapshot: op.description as string | null ?? null,
      clientNote: null, assetSnapshot: null,
    });
  }
  return next;
}

/** Bind revision only immediately before first dispatch; retries reuse the exact request. */
export function dispatchProposalCommand(command: ProposalCommand, revision: number): ProposalCommand {
  return { ...command, operation: { ...command.operation, expectedRevision: revision } };
}
