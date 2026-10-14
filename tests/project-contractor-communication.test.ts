import { beforeEach, expect, it, vi } from "vitest";
import { ContractorEntrySchema } from "@/lib/projects/project-contractors";
const tx = vi.hoisted(() => ({
  project: { findUnique: vi.fn() }, projectContractor: { findFirst: vi.fn(), updateMany: vi.fn() },
  projectContractorEntry: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  projectActivityLog: { create: vi.fn() },
}));
const transaction = vi.hoisted(() => vi.fn());
vi.mock("@/server/db", () => ({ prisma: { ...tx, $transaction: transaction } }));
import { addContractorEntry, readContractorEntries } from "@/server/projects/project-contractors";
const input = { id: "9d2d6fb9-3870-4206-af9c-83c8183c68a4", expectedRevision: 2, body: "Звук согласован, ждём райдер", status: "WAITING" as const };
beforeEach(() => {
  vi.resetAllMocks(); transaction.mockImplementation(async (callback) => callback(tx));
  tx.project.findUnique.mockResolvedValue({ archivedAt: null });
  tx.projectContractor.findFirst.mockResolvedValue({ id: "r", name: "Звук", status: "PENDING" });
  tx.projectContractor.updateMany.mockResolvedValue({ count: 1 });
  tx.projectContractorEntry.findUnique.mockResolvedValue(null);
  tx.projectContractorEntry.findMany.mockResolvedValue([]);
});
it("validates bounded notes, exact statuses, UUID and mandatory revision", () => {
  expect(ContractorEntrySchema.parse({ ...input, body: "  Итог  " }).body).toBe("Итог");
  for (const patch of [{ body: " " }, { body: "x".repeat(5001) }, { status: "CONFIRMED" }, { id: "x" }, { expectedRevision: -1 }, { price: 1 }]) expect(ContractorEntrySchema.safeParse({ ...input, ...patch }).success).toBe(false);
});
it("appends an immutable entry with scoped CAS and activity in Serializable", async () => {
  await addContractorEntry("p", "r", "actor", input);
  expect(transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
  expect(tx.projectContractor.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "r", projectId: "p", revision: 2 } });
  expect(tx.projectContractorEntry.create.mock.calls[0][0].data).toMatchObject({ id: input.id, assignmentId: "r", authorId: "actor", body: input.body, status: "WAITING" });
  expect(tx.projectActivityLog.create).toHaveBeenCalledOnce();
});
it("replays a lost response without appending twice, including after revision changed", async () => {
  await addContractorEntry("p", "r", "actor", input);
  tx.projectContractorEntry.findUnique.mockResolvedValue(tx.projectContractorEntry.create.mock.calls[0][0].data);
  expect(await addContractorEntry("p", "r", "actor", { ...input, expectedRevision: 20 })).toEqual({ ok: true, replay: true });
  expect(tx.projectContractorEntry.create).toHaveBeenCalledOnce();
  await expect(addContractorEntry("p", "r", "other", input)).rejects.toThrow("идентификатор");
  await expect(addContractorEntry("p2", "r", "actor", input)).rejects.toThrow("идентификатор");
});
it("rejects foreign assignments, cancellation, archives and stale revision before inserting", async () => {
  tx.projectContractor.findFirst.mockResolvedValueOnce(null);
  await expect(addContractorEntry("foreign", "r", "a", input)).rejects.toThrow("не найден");
  tx.projectContractor.findFirst.mockResolvedValueOnce({ name: "Звук", status: "CANCELLED" });
  await expect(addContractorEntry("p", "r", "a", input)).rejects.toThrow("Верните");
  tx.projectContractor.updateMany.mockResolvedValueOnce({ count: 0 });
  await expect(addContractorEntry("p", "r", "a", input)).rejects.toThrow("Коллега");
  tx.project.findUnique.mockResolvedValueOnce({ archivedAt: new Date() });
  await expect(addContractorEntry("p", "r", "a", input)).rejects.toThrow("Архивный");
  expect(tx.projectContractorEntry.create).not.toHaveBeenCalled();
});
it("scopes history and its cursor, paginates 30 rows with stable tie-breaking", async () => {
  tx.projectContractorEntry.findFirst.mockResolvedValueOnce(null);
  await expect(readContractorEntries("p", "r", "foreign-cursor")).rejects.toThrow("Обновите журнал");
  expect(tx.projectContractorEntry.findMany).not.toHaveBeenCalled();
  const entries = Array.from({ length: 31 }, (_, index) => ({ id: String(index), createdAt: new Date("2026-10-14"), body: "QA", status: "WAITING", author: { id: "a", displayName: "QA" } }));
  tx.projectContractorEntry.findMany.mockResolvedValueOnce(entries);
  const result = await readContractorEntries("p", "r", null);
  expect(result.entries).toHaveLength(30); expect(result.nextCursor).toBe("29");
  expect(tx.projectContractorEntry.findMany.mock.calls[0][0]).toMatchObject({ where: { assignmentId: "r" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 31 });
});
