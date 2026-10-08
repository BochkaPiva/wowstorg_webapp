import { Prisma } from "@prisma/client";

type RecordState = Record<string, Prisma.JsonValue> & { id: string };
export type ProposalState = {
  metadata: RecordState;
  variants: RecordState[];
  sections: RecordState[];
  items: RecordState[];
};
type Change = { before: RecordState | null; after: RecordState | null };
export type ProposalDelta = {
  version: 1;
  metadata: Change | null;
  variants: Change[];
  sections: Change[];
  items: Change[];
};

function stored(record: object): RecordState {
  const data = JSON.parse(JSON.stringify(record)) as RecordState;
  // Timestamps are not editable content and must not create spurious conflicts.
  delete data.updatedAt;
  return data;
}

export async function captureProposalState(tx: Prisma.TransactionClient, proposalId: string): Promise<ProposalState> {
  const proposal = await tx.projectProposal.findUniqueOrThrow({
    where: { id: proposalId },
    include: {
      variants: { include: {
        sections: { include: {
          items: { include: { estimateLinks: { select: { id: true } } } },
        } },
      } },
    },
  });
  const variants: RecordState[] = [], sections: RecordState[] = [], items: RecordState[] = [];
  for (const { sections: children, ...variant } of proposal.variants) {
    variants.push(stored(variant));
    for (const { items: services, ...section } of children) {
      sections.push(stored(section));
      for (const { estimateLinks, ...item } of services) {
        items.push(stored({ ...item, estimateLinkIds: estimateLinks.map((link) => link.id).sort() }));
      }
    }
  }
  return { metadata: stored({ id: proposal.id, title: proposal.title, status: proposal.status,
    clientIntro: proposal.clientIntro, clientOutro: proposal.clientOutro }), variants, sections, items };
}

function comparable(value: RecordState | null) {
  if (!value) return "null";
  // A transfer can add a link without editing the CP. Undo never edits the estimate.
  return JSON.stringify(Object.entries(value).filter(([key]) => key !== "estimateLinkIds").sort(([a], [b]) => a.localeCompare(b)));
}

function diff(before: RecordState[], after: RecordState[]): Change[] {
  const previous = new Map(before.map((row) => [row.id, row]));
  const next = new Map(after.map((row) => [row.id, row]));
  return [...new Set([...previous.keys(), ...next.keys()])].flatMap((id) => {
    const from = previous.get(id) ?? null, to = next.get(id) ?? null;
    return comparable(from) === comparable(to) ? [] : [{ before: from ? stored(from) : null, after: to ? stored(to) : null }];
  });
}

export function proposalDelta(before: ProposalState, after: ProposalState): ProposalDelta {
  return { version: 1,
    metadata: comparable(before.metadata) === comparable(after.metadata) ? null : { before: stored(before.metadata), after: stored(after.metadata) },
    variants: diff(before.variants, after.variants), sections: diff(before.sections, after.sections), items: diff(before.items, after.items),
  };
}

export function assertReversible(delta: ProposalDelta, current: ProposalState) {
  if (delta.version !== 1) throw new Error("HISTORY_CONFLICT");
  if (delta.metadata && comparable(delta.metadata.after) !== comparable(current.metadata)) throw new Error("HISTORY_CONFLICT");
  for (const kind of ["variants", "sections", "items"] as const) {
    const records = new Map(current[kind].map((row) => [row.id, row]));
    for (const change of delta[kind]) {
      const id = (change.after ?? change.before)!.id;
      if (comparable(change.after) !== comparable(records.get(id) ?? null)) throw new Error("HISTORY_CONFLICT");
    }
  }
  // A parent cannot be deleted by undo if somebody added children not belonging to this command.
  const touchedItems = new Set(delta.items.map((change) => change.after?.id));
  const touchedSections = new Set(delta.sections.map((change) => change.after?.id));
  for (const change of delta.sections) if (!change.before && change.after) {
    if (current.items.some((row) => row.sectionId === change.after!.id && !touchedItems.has(row.id))) throw new Error("HISTORY_CONFLICT");
  }
  for (const change of delta.variants) if (!change.before && change.after) {
    if (current.sections.some((row) => row.variantId === change.after!.id && !touchedSections.has(row.id))) throw new Error("HISTORY_CONFLICT");
  }
}

export async function reverseProposalDelta(tx: Prisma.TransactionClient, proposalId: string, delta: ProposalDelta, current: ProposalState) {
  assertReversible(delta, current);
  // Delete leaf-first, recreate parent-first. Unchanged entities retain their IDs and links.
  for (const change of delta.items) if (!change.before) await tx.projectProposalItem.delete({ where: { id: change.after!.id } });
  for (const change of delta.sections) if (!change.before) await tx.projectProposalSection.delete({ where: { id: change.after!.id } });
  for (const change of delta.variants) if (!change.before) await tx.projectProposalVariant.delete({ where: { id: change.after!.id } });
  for (const change of delta.variants) if (change.before) {
    const data = change.before as unknown as Prisma.ProjectProposalVariantUncheckedCreateInput;
    await tx.projectProposalVariant.upsert({ where: { id: data.id }, create: data, update: data });
  }
  for (const change of delta.sections) if (change.before) {
    const data = change.before as unknown as Prisma.ProjectProposalSectionUncheckedCreateInput;
    await tx.projectProposalSection.upsert({ where: { id: data.id }, create: data, update: data });
  }
  for (const change of delta.items) if (change.before) {
    const { estimateLinkIds, ...record } = change.before;
    const data = { ...record, assetSnapshot: record.assetSnapshot === null ? Prisma.JsonNull : record.assetSnapshot } as unknown as Prisma.ProjectProposalItemUncheckedCreateInput;
    await tx.projectProposalItem.upsert({ where: { id: data.id }, create: data, update: data });
    // Deletion only nulls the FK; reconnect surviving receipts without touching estimate lines.
    if (Array.isArray(estimateLinkIds) && estimateLinkIds.length) await tx.projectProposalEstimateLink.updateMany({
      where: { id: { in: estimateLinkIds as string[] }, proposalItemId: null }, data: { proposalItemId: record.id },
    });
  }
  if (delta.metadata?.before) {
    const data: Record<string, Prisma.JsonValue> = { ...delta.metadata.before }; delete data.id;
    await tx.projectProposal.update({ where: { id: proposalId }, data: data as Prisma.ProjectProposalUpdateInput });
    const proposal = await tx.projectProposal.findUniqueOrThrow({ where: { id: proposalId }, select: { standaloneProposalId: true } });
    if (proposal.standaloneProposalId) await tx.standaloneProposal.update({
      where: { id: proposal.standaloneProposalId }, data: { title: String(data.title) },
    });
  }
}
