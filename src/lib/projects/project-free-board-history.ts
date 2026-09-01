import type { ProjectFreeBoardItemInput } from "@/lib/projects/project-free-board";
import type { ProjectFreeBoardOperation } from "@/lib/projects/project-free-board-queue";

function comparableItem(item: ProjectFreeBoardItemInput) {
  const value = { ...item };
  delete value.expectedRevision;
  return value;
}

export function cloneProjectFreeBoardItems(
  items: readonly ProjectFreeBoardItemInput[],
): ProjectFreeBoardItemInput[] {
  return items.map((item) => structuredClone(item));
}

export function projectFreeBoardItemsEqual(
  left: ProjectFreeBoardItemInput,
  right: ProjectFreeBoardItemInput,
) {
  return JSON.stringify(comparableItem(left)) === JSON.stringify(comparableItem(right));
}

/**
 * Builds the smallest final-state mutation set needed to restore a session
 * snapshot. Current/tombstone revisions stay authoritative so undo can safely
 * restore an item after its soft delete reached the server.
 */
export function projectFreeBoardOperationsForSnapshot(
  current: readonly ProjectFreeBoardItemInput[],
  target: readonly ProjectFreeBoardItemInput[],
  deletedRevisionById: ReadonlyMap<string, number> = new Map(),
): ProjectFreeBoardOperation[] {
  const currentById = new Map(current.map((item) => [item.id, item]));
  const targetById = new Map(target.map((item) => [item.id, item]));
  const operations: ProjectFreeBoardOperation[] = [];

  for (const item of current) {
    if (!targetById.has(item.id)) {
      operations.push({
        op: "DELETE",
        itemId: item.id,
        expectedRevision: item.expectedRevision ?? null,
      });
    }
  }

  for (const targetItem of target) {
    const currentItem = currentById.get(targetItem.id);
    if (currentItem && projectFreeBoardItemsEqual(currentItem, targetItem)) continue;
    operations.push({
      op: "UPSERT",
      item: {
        ...structuredClone(targetItem),
        expectedRevision:
          currentItem?.expectedRevision
          ?? deletedRevisionById.get(targetItem.id)
          ?? targetItem.expectedRevision
          ?? null,
      },
    });
  }

  return operations;
}
