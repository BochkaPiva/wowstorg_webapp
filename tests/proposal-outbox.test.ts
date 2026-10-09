import { afterEach, describe, expect, it, vi } from "vitest";
import { acknowledgedCatalogItem, dispatchProposalCommand, isQueuedId, projectProposalCommands, resolveCreatedProposalItem } from "@/lib/proposal-outbox";
import { readProposalRecovery, type ProposalCommand } from "@/lib/proposal-recovery";
import type { Proposal, ProposalItem } from "@/lib/proposals";
import { ProposalApiError, proposalCommandRequest } from "@/app/proposals/api";

const item: ProposalItem = { id: "i", offerId: "offer", selectionRole: "PRIMARY", qty: 1, clientUnitPrice: null, internalUnitCost: 1000, priceTypeSnapshot: "ON_REQUEST", unitLabel: "час", contractorNameSnapshot: "Демо", offerTitleSnapshot: "Ведущий", offerDescriptionSnapshot: null, clientNote: null, assetSnapshot: [{ url: "/photo" }] };
const model = (): Proposal => ({ id: "cp", title: "Демо КП", status: "DRAFT", revision: 4, owner: null, clientIntro: null, clientOutro: null, variants: [{ id: "v", title: "Основной", isRecommended: true, sections: [{ id: "s", title: "Программа", category: null, items: [structuredClone(item)] }, { id: "s2", title: "Техника", category: null, items: [] }] }] });
const command = (action: ProposalCommand["operation"]["action"], fields: Record<string, unknown> = {}): ProposalCommand => ({ label: "Правка", operation: { action, mutationId: "3e942ab2-2e73-4d91-8991-cbb01bcc58f6", expectedRevision: 4, ...fields } });

describe("proposal local outbox projection", () => {
  it("resolves a removal after lost-response reload without changing the dispatched add", () => {
    const add = command("ADD_CATALOG_ITEM", { sectionId: "s2", offerId: "offer" });
    const committed = model(); committed.revision++;
    committed.variants[0].sections[1].items.push({ ...item, id: "actual" });
    const created = acknowledgedCatalogItem(committed, committed, add, true);
    expect(created?.id).toBe("actual");
    expect(acknowledgedCatalogItem(committed, committed, add, false)).toBeUndefined();
    const remove = command("REMOVE_ITEM", { itemId: `queued:${add.operation.mutationId}` });
    const resolved = resolveCreatedProposalItem([remove], String(remove.operation.itemId), created!.id);
    expect(projectProposalCommands(committed, resolved).variants[0].sections[1].items).toHaveLength(0);
    expect(add.operation.expectedRevision).toBe(4);
  });
  it("unchecks a pending addition locally and resolves its unsent removal after acknowledgement", () => {
    const add = command("ADD_CATALOG_ITEM", { sectionId: "s2", offerId: "offer" });
    const queuedId = `queued:${add.operation.mutationId}`;
    const remove = command("REMOVE_ITEM", { itemId: queuedId, mutationId: "baceac28-0901-4dbe-900a-e325b7407785" });
    expect(projectProposalCommands(model(), [add, remove], new Map([[add.operation.mutationId, item]])).variants[0].sections[1].items).toHaveLength(0);
    const server = model(); server.variants[0].sections[1].items.push({ ...item, id: "actual" });
    const resolved = resolveCreatedProposalItem([remove], queuedId, "actual");
    expect(projectProposalCommands(server, resolved).variants[0].sections[1].items).toHaveLength(0);
    expect(remove.operation.itemId).toBe(queuedId);
    expect(resolved[0].operation.mutationId).toBe(remove.operation.mutationId);
    expect(add.operation.expectedRevision).toBe(4);
  });
  it("projects queued edits in order without mutating the server model or original command", () => {
    const server = model();
    const edits = [command("UPDATE_ITEM", { itemId: "i", clientUnitPrice: 3000 }), command("UPDATE_ITEM", { itemId: "i", qty: 2 })];
    const next = projectProposalCommands(server, edits);
    expect(next.variants[0].sections[0].items[0]).toMatchObject({ qty: 2, clientUnitPrice: 3000, priceTypeSnapshot: "ON_REQUEST" });
    expect(server.variants[0].sections[0].items[0]).toEqual(item);
    expect(server.revision).toBe(4);
    expect(edits[0].operation.expectedRevision).toBe(4);
  });
  it("projects item moves and removes in sequence", () => {
    const next = projectProposalCommands(model(), [command("MOVE_ITEM", { itemId: "i", sectionId: "s2", beforeId: null }), command("REMOVE_SECTION", { sectionId: "s" })]);
    expect(next.variants[0].sections.map(row => row.id)).toEqual(["s2"]);
    expect(next.variants[0].sections[0].items[0].id).toBe("i");
  });
  it("projects catalogue previews under local IDs, never sends those snapshots", () => {
    const add = command("ADD_CATALOG_ITEM", { sectionId: "s2", offerId: "offer" });
    const next = projectProposalCommands(model(), [add], new Map([[add.operation.mutationId, item]]));
    expect(isQueuedId(next.variants[0].sections[1].items[0].id)).toBe(true);
    expect(next.variants[0].sections[1].items[0].assetSnapshot).toEqual(item.assetSnapshot);
    expect(add.operation).not.toHaveProperty("assetSnapshot");
  });
  it("projects manual items with unknown prices, not invented zeroes", () => {
    const next = projectProposalCommands(model(), [command("ADD_MANUAL_ITEM", { sectionId: "s2", title: "Шоу", clientUnitPrice: null })]);
    expect(next.variants[0].sections[1].items[0]).toMatchObject({ clientUnitPrice: null, internalUnitCost: null, offerTitleSnapshot: "Шоу" });
  });
  it("waits for server IDs for newly created sections", () => {
    expect(projectProposalCommands(model(), [command("ADD_SECTION", { variantId: "v", title: "Новое" })]).variants[0].sections).toHaveLength(2);
  });
  it("binds current CAS revision only at first dispatch and preserves command identity", () => {
    const queued = command("REMOVE_ITEM", { itemId: "i" });
    const sent = dispatchProposalCommand(queued, 7);
    expect(sent.operation.expectedRevision).toBe(7);
    expect(sent.operation.mutationId).toBe(queued.operation.mutationId);
    expect(queued.operation.expectedRevision).toBe(4);
  });
  it("accepts old journals and bounds the new persisted queue", () => {
    const old = { version: 1, revision: 4, savedAt: "2026-10-08", variantId: "v", sectionId: "s", drawer: null, sectionFields: null, pending: null, undo: [], redo: [] };
    expect(readProposalRecovery(JSON.stringify(old))?.queued).toEqual([]);
    expect(readProposalRecovery(JSON.stringify({ ...old, queued: [command("REMOVE_ITEM")] }))?.queued).toHaveLength(1);
    expect(readProposalRecovery(JSON.stringify({ ...old, queued: Array(51).fill(command("REMOVE_ITEM")) }))).toBeNull();
  });
});

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("bounded immutable mutation retries", () => {
  it("retries a lost response with identical payload and UUID", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(new Response(JSON.stringify({ proposal: model() })));
    vi.stubGlobal("fetch", fetch);
    const result = proposalCommandRequest("/mutations", command("REMOVE_ITEM").operation);
    await vi.runAllTimersAsync(); await result;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
  });
  it("never retries a definitive revision conflict", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "Конфликт" } }), { status: 409 }));
    vi.stubGlobal("fetch", fetch);
    await expect(proposalCommandRequest("/mutations", command("REMOVE_ITEM").operation)).rejects.toBeInstanceOf(ProposalApiError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("stops after three failed requests so local recovery can take over", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "Unavailable" } }), { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    // Attach rejection handling immediately, before advancing retry timers.
    const result = expect(proposalCommandRequest("/mutations", command("REMOVE_ITEM").operation)).rejects.toThrow();
    await vi.runAllTimersAsync(); await result;
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
