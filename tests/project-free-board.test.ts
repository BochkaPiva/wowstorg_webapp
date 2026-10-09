import { describe, expect, it } from "vitest";

import {
  ProjectFreeBoardItemInputSchema,
  createProjectFreeBoardConnector,
  createProjectFreeBoardGroup,
  createProjectFreeBoardItem,
  duplicateProjectFreeBoardItem,
  createProjectFreeBoardLinkedItem,
  projectBoardLinkedId,
} from "@/lib/projects/project-free-board";
import { projectFreeBoardOperationsForSnapshot } from "@/lib/projects/project-free-board-history";
import {
  applyOptimisticOperations,
  coalesceProjectFreeBoardOperations,
  parseStoredProjectFreeBoardEnvelope,
} from "@/lib/projects/project-free-board-queue";

describe("project free board", () => {
  it.each(["CONTRACTOR", "CONTACT", "SCHEDULE_SLOT", "PROPOSAL"] as const)("persists a typed %s reference through recovery/history without copying data", (type) => {
    const item = createProjectFreeBoardLinkedItem(type, { id: "entity-1", label: "Сущность", meta: "Статус", href: "/projects/p" }, { x: 0, y: 0 });
    expect(ProjectFreeBoardItemInputSchema.parse(item)).toEqual(item);
    expect(projectBoardLinkedId(item)).toBe("entity-1");
    expect("entityId" in item.payload && item.payload.entityId).toBe("entity-1");
    expect(ProjectFreeBoardItemInputSchema.safeParse({ ...item, payload: { ...item.payload, internalNotes: "Must not be copied" } }).success).toBe(false);
    const envelope = parseStoredProjectFreeBoardEnvelope(JSON.stringify({ mutationId: crypto.randomUUID(), operations: [{ op: "UPSERT", item }] }));
    expect(envelope?.operations[0]).toEqual({ op: "UPSERT", item });
  });
  it("coalesces rapid edits to the latest intent", () => {
    const item = createProjectFreeBoardItem("NOTE", { x: 0, y: 0 });
    if (item.type !== "NOTE") throw new Error("Expected note");
    const edited = { ...item, payload: { ...item.payload, text: "Последний текст" } };
    expect(
      coalesceProjectFreeBoardOperations([
        { op: "UPSERT", item },
        { op: "UPSERT", item: edited },
      ]),
    ).toEqual([{ op: "UPSERT", item: edited }]);
  });

  it("keeps a delete as the final action", () => {
    const item = createProjectFreeBoardItem("STICKER", { x: 0, y: 0 });
    const operations = coalesceProjectFreeBoardOperations([
      { op: "UPSERT", item },
      { op: "DELETE", itemId: item.id, expectedRevision: null },
    ]);
    expect(operations).toEqual([{ op: "DELETE", itemId: item.id, expectedRevision: null }]);
    expect(applyOptimisticOperations([item], operations)).toEqual([]);
  });

  it("allows an empty draft link but rejects unsafe protocols", () => {
    const link = createProjectFreeBoardItem("LINK", { x: 0, y: 0 });
    expect(ProjectFreeBoardItemInputSchema.safeParse(link).success).toBe(true);
    expect(
      ProjectFreeBoardItemInputSchema.safeParse({
        ...link,
        payload: { ...link.payload, url: "javascript:alert(1)" },
      }).success,
    ).toBe(false);
  });

  it("accepts the expanded 48-column canvas and rejects items beyond its edge", () => {
    const item = createProjectFreeBoardItem("CHECKLIST", { x: 40, y: 0 });
    expect(ProjectFreeBoardItemInputSchema.safeParse(item).success).toBe(true);
    expect(ProjectFreeBoardItemInputSchema.safeParse({ ...item, x: 41 }).success).toBe(false);
  });

  it("ignores corrupted locally stored mutations", () => {
    expect(parseStoredProjectFreeBoardEnvelope("not json")).toBeNull();
    expect(parseStoredProjectFreeBoardEnvelope(JSON.stringify({ mutationId: "bad" }))).toBeNull();
  });

  it("regenerates nested checklist identifiers when duplicating a block", () => {
    const created = createProjectFreeBoardItem("CHECKLIST", { x: 0, y: 0 });
    const item = created.type === "CHECKLIST"
      ? {
          ...created,
          payload: {
            ...created.payload,
            items: [{ id: crypto.randomUUID(), text: "Проверить площадку", isDone: false }],
          },
        }
      : created;
    if (item.type !== "CHECKLIST") throw new Error("Expected checklist");
    const copy = duplicateProjectFreeBoardItem(item, { x: 2, y: 3 });
    if (copy.type !== "CHECKLIST") throw new Error("Expected checklist copy");

    expect(copy.id).not.toBe(item.id);
    expect(copy.payload.items.map((entry) => entry.id)).not.toEqual(
      item.payload.items.map((entry) => entry.id),
    );
  });

  it("uses the latest tombstone revision when undo restores a deleted item", () => {
    const item = { ...createProjectFreeBoardItem("NOTE", { x: 0, y: 0 }), expectedRevision: 2 };
    const operations = projectFreeBoardOperationsForSnapshot([], [item], new Map([[item.id, 3]]));

    expect(operations).toEqual([
      { op: "UPSERT", item: { ...item, expectedRevision: 3 } },
    ]);
  });

  it("creates only the mutations required to restore a previous snapshot", () => {
    const kept = { ...createProjectFreeBoardItem("NOTE", { x: 0, y: 0 }), expectedRevision: 1 };
    const removed = { ...createProjectFreeBoardItem("STICKER", { x: 4, y: 0 }), expectedRevision: 4 };
    const operations = projectFreeBoardOperationsForSnapshot([kept, removed], [kept]);

    expect(operations).toEqual([
      { op: "DELETE", itemId: removed.id, expectedRevision: 4 },
    ]);
  });

  it("creates a persisted group with unique member identifiers", () => {
    const first = createProjectFreeBoardItem("NOTE", { x: 0, y: 0 });
    const second = createProjectFreeBoardItem("STICKER", { x: 6, y: 0 });
    const group = createProjectFreeBoardGroup([first, second, first], { x: 0, y: 5 });

    expect(group.type).toBe("GROUP");
    if (group.type !== "GROUP") throw new Error("Expected group");
    expect(group.payload.itemIds).toEqual([first.id, second.id]);
    expect(ProjectFreeBoardItemInputSchema.safeParse(group).success).toBe(true);
  });

  it("does not create a group from a single block", () => {
    const item = createProjectFreeBoardItem("NOTE", { x: 0, y: 0 });
    expect(() => createProjectFreeBoardGroup([item], { x: 0, y: 5 })).toThrow(
      "минимум два блока",
    );
  });

  it("creates a directional connector between two different blocks", () => {
    const first = createProjectFreeBoardItem("NOTE", { x: 0, y: 0 });
    const second = createProjectFreeBoardItem("STICKER", { x: 6, y: 0 });
    const connector = createProjectFreeBoardConnector(first.id, second.id);

    expect(connector.type).toBe("CONNECTOR");
    if (connector.type !== "CONNECTOR") throw new Error("Expected connector");
    expect(connector.payload).toMatchObject({ sourceId: first.id, targetId: second.id });
    expect(ProjectFreeBoardItemInputSchema.safeParse(connector).success).toBe(true);
    expect(() => createProjectFreeBoardConnector(first.id, first.id)).toThrow();
  });
});
