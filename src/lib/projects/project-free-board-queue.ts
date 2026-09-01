import {
  ProjectFreeBoardBatchSchema,
  ProjectFreeBoardItemInputSchema,
  type ProjectFreeBoardBatchInput,
  type ProjectFreeBoardItemDto,
  type ProjectFreeBoardItemInput,
} from "@/lib/projects/project-free-board";

export type ProjectFreeBoardOperation = ProjectFreeBoardBatchInput["operations"][number];

export type ProjectFreeBoardMutationEnvelope = {
  mutationId: string;
  operations: ProjectFreeBoardOperation[];
};

function operationItemId(operation: ProjectFreeBoardOperation) {
  return operation.op === "UPSERT" ? operation.item.id : operation.itemId;
}

/**
 * Reduces unsent edits to the latest user intent for each item while preserving
 * the first-seen item order. An in-flight envelope is never coalesced so its
 * mutation id can be retried byte-for-byte.
 */
export function coalesceProjectFreeBoardOperations(
  operations: readonly ProjectFreeBoardOperation[],
): ProjectFreeBoardOperation[] {
  const byItem = new Map<string, ProjectFreeBoardOperation>();
  for (const operation of operations) byItem.set(operationItemId(operation), operation);
  return Array.from(byItem.values());
}

export function withExpectedRevision(
  operation: ProjectFreeBoardOperation,
  revisionByItemId: ReadonlyMap<string, number>,
): ProjectFreeBoardOperation {
  const itemId = operationItemId(operation);
  const revision = revisionByItemId.get(itemId);
  if (revision == null) return operation;
  if (operation.op === "DELETE") return { ...operation, expectedRevision: revision };
  return { ...operation, item: { ...operation.item, expectedRevision: revision } };
}

export function itemDtoToInput(item: ProjectFreeBoardItemDto): ProjectFreeBoardItemInput {
  const input: Partial<ProjectFreeBoardItemDto> = { ...item };
  const revision = input.revision;
  delete input.revision;
  delete input.createdAt;
  delete input.updatedAt;
  return ProjectFreeBoardItemInputSchema.parse({ ...input, expectedRevision: revision });
}

export function applyOptimisticOperations(
  items: readonly ProjectFreeBoardItemInput[],
  operations: readonly ProjectFreeBoardOperation[],
): ProjectFreeBoardItemInput[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const operation of operations) {
    if (operation.op === "DELETE") byId.delete(operation.itemId);
    else byId.set(operation.item.id, operation.item);
  }
  return Array.from(byId.values());
}

export function parseStoredProjectFreeBoardEnvelope(
  raw: string | null,
): ProjectFreeBoardMutationEnvelope | null {
  if (!raw) return null;
  try {
    const parsed = ProjectFreeBoardBatchSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return { mutationId: parsed.data.mutationId, operations: [...parsed.data.operations] };
  } catch {
    return null;
  }
}
