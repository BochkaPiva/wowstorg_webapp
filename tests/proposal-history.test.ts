import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { assertReversible, proposalDelta, reverseProposalDelta, type ProposalState } from "@/server/proposals/history";
import { proposalMutationSchema } from "@/server/proposals/mutate";
import { readProposalRecovery } from "@/lib/proposal-recovery";

const state = (): ProposalState => ({ metadata: { id: "cp", title: "КП", status: "DRAFT", clientIntro: null, clientOutro: null },
  variants: [{ id: "v", proposalId: "cp", title: "Основной" }],
  sections: [{ id: "s", variantId: "v", title: "Шоу" }],
  items: [{ id: "i", sectionId: "s", qty: "1", internalNote: "PRIVATE", internalUnitCost: "123.45", sourceOfferRevision: 7, assetSnapshot: [{ url: "/api/photo" }], estimateLinkIds: ["link"] }] });

describe("server-owned proposal compensating commands", () => {
  it("stores only changed records and preserves hidden snapshot fields", () => {
    const before = state(), after = state(); after.items = [];
    const delta = proposalDelta(before, after);
    expect(delta.sections).toEqual([]); expect(delta.variants).toEqual([]);
    expect(delta.items[0].before).toEqual(before.items[0]);
  });
  it("rejects changes made after the saved command", () => {
    const before = state(), after = state(); after.items[0].qty = "2";
    const delta = proposalDelta(before, after); after.items[0].qty = "3";
    expect(() => assertReversible(delta, after)).toThrow("HISTORY_CONFLICT");
  });
  it("refuses to undo an added section with new unrelated services", () => {
    const before = state(); before.sections = []; before.items = [];
    const after = state(); after.items = [];
    const delta = proposalDelta(before, after); after.items = state().items;
    expect(() => assertReversible(delta, after)).toThrow("HISTORY_CONFLICT");
  });
  it("refuses to undo a variant with new unrelated sections", () => {
    const before = state(); before.variants = []; before.sections = []; before.items = [];
    const after = state(); after.sections = []; after.items = [];
    const delta = proposalDelta(before, after); after.sections = state().sections;
    expect(() => assertReversible(delta, after)).toThrow("HISTORY_CONFLICT");
  });
  it("does not confuse new estimate links with editing CP content", () => {
    const before = state(), after = state(); after.items[0].qty = "2";
    const delta = proposalDelta(before, after); after.items[0].estimateLinkIds = ["link", "another"];
    expect(() => assertReversible(delta, after)).not.toThrow();
  });
  it("restores parent before child with original IDs and surviving estimate receipt", async () => {
    const before = state(), after = state(); after.sections = []; after.items = [];
    const order: string[] = [];
    const tx = { projectProposalSection: { upsert: vi.fn(async () => order.push("section")) },
      projectProposalItem: { upsert: vi.fn(async () => order.push("item")) },
      projectProposalEstimateLink: { updateMany: vi.fn(async () => order.push("link")) } };
    await reverseProposalDelta(tx as unknown as Prisma.TransactionClient, "cp", proposalDelta(before, after), after);
    expect(order).toEqual(["section", "item", "link"]);
    expect(tx.projectProposalItem.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "i" }, create: expect.objectContaining({ internalNote: "PRIVATE", sourceOfferRevision: 7 }) }));
    expect(tx.projectProposalEstimateLink.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["link"] }, proposalItemId: null }, data: { proposalItemId: "i" } });
  });
  it("deletes child before parent when undoing a clone", async () => {
    const before = state(); before.variants = []; before.sections = []; before.items = [];
    const after = state(); const order: string[] = [];
    const tx = { projectProposalVariant: { delete: vi.fn(async () => order.push("variant")) }, projectProposalSection: { delete: vi.fn(async () => order.push("section")) }, projectProposalItem: { delete: vi.fn(async () => order.push("item")) } };
    await reverseProposalDelta(tx as unknown as Prisma.TransactionClient, "cp", proposalDelta(before, after), after);
    expect(order).toEqual(["item", "section", "variant"]);
  });
  it("requires valid UUIDs for inverse commands and rejects client snapshots", () => {
    expect(proposalMutationSchema.safeParse({ action: "RESTORE_CHANGE", expectedRevision: 4, mutationId: "bad", changeId: "bad", snapshot: state() }).success).toBe(false);
  });
});

describe("bounded local recovery format", () => {
  it("tolerates corrupted and obsolete browser data", () => {
    expect(readProposalRecovery("oops")).toBeNull(); expect(readProposalRecovery('{"version":0}')).toBeNull();
  });
  it("rejects oversized fields instead of consuming unbounded browser storage", () => {
    expect(readProposalRecovery(JSON.stringify({ version: 1, revision: 1, savedAt: "2026", variantId: "v", sectionId: "s", drawer: { kind: "document", fields: { intro: "a".repeat(4001) } }, sectionFields: null, pending: null, undo: [], redo: [] }))).toBeNull();
  });
});
