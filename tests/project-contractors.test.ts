import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddProjectContractorSchema, ProjectContractorPostSchema, UpdateProjectContractorSchema, groupProposalContractors, groupProjectContractors, type ProjectContractorRow } from "@/lib/projects/project-contractors";
const tx = vi.hoisted(() => ({
  project: { findUnique: vi.fn() }, projectScheduleSlot: { findFirst: vi.fn() },
  projectContractor: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  contractor: { findUnique: vi.fn() }, projectProposalVariant: { findFirst: vi.fn() }, projectActivityLog: { create: vi.fn() },
}));
const transaction = vi.hoisted(() => vi.fn());
vi.mock("@/server/db", () => ({ prisma: { $transaction: transaction } }));
import { addProjectContractors, updateProjectContractor } from "@/server/projects/project-contractors";
const fields = { name: "Ведущий", responsibility: "Ведение программы", contactName: "Анна", phone: "+79000000000", email: null, status: "PENDING" as const, scheduleSlotId: null, arrivalNote: null, internalNotes: "Договориться о приезде" };
const add = { ...fields, action: "ADD" as const, id: "321dc31d-fb0d-41d0-bb0d-16cbe3dfabfa", contractorId: "catalog-1" };
beforeEach(() => {
  vi.resetAllMocks(); transaction.mockImplementation(async (callback) => callback(tx));
  tx.project.findUnique.mockResolvedValue({ archivedAt: null }); tx.contractor.findUnique.mockResolvedValue({ isActive: true, contacts: [{ personName: "Анна", phone: "+79000000000", email: null }] });
  tx.projectContractor.findUnique.mockResolvedValue(null); tx.projectContractor.create.mockResolvedValue({}); tx.projectContractor.updateMany.mockResolvedValue({ count: 1 });
});
describe("roster contract", () => {
  it("groups a person once by primary category, leaves cancelled people out and keeps an uncategorized fallback", () => {
    const row = (id: string, categoryNames: string[], status = "PENDING") => ({ ...fields, id, categoryNames, status }) as ProjectContractorRow;
    const groups = groupProjectContractors([row("1", ["Оборудование", "Локации"]), row("2", ["Ведущие"]), row("3", []), row("4", ["Ведущие"], "CANCELLED")]);
    expect(groups.map(([name]) => name)).toEqual(["Ведущие", "Оборудование", "Без категории"]);
    expect(groups.flatMap(([, rows]) => rows.map((item) => item.id))).toEqual(["2", "1", "3"]);
  });
  it("normalizes category names and rejects excessive/unbounded categories", () => {
    expect(AddProjectContractorSchema.parse({ ...add, categoryNames: [" Звук ", "Звук"] }).categoryNames).toEqual(["Звук"]);
    expect(AddProjectContractorSchema.safeParse({ ...add, categoryNames: [""] }).success).toBe(false);
    expect(AddProjectContractorSchema.safeParse({ ...add, categoryNames: Array(13).fill("Звук") }).success).toBe(false);
    expect(UpdateProjectContractorSchema.parse({ ...fields, expectedRevision: 2 }).categoryNames).toBeUndefined();
  });
  it("validates status, email, UUID and rejects unknown fields", () => {
    expect(AddProjectContractorSchema.safeParse(add).success).toBe(true);
    for (const bad of [{ status: "BOOKED" }, { email: "wrong" }, { id: "x" }, { clientPrice: 123 }, { responsibility: " " }]) expect(AddProjectContractorSchema.safeParse({ ...add, ...bad }).success).toBe(false);
    expect(ProjectContractorPostSchema.safeParse({ action: "IMPORT_PROPOSAL", variantId: "v", expectedProposalRevision: 0 }).success).toBe(true);
    expect(UpdateProjectContractorSchema.parse({ ...fields, phone: "", expectedRevision: 0 }).phone).toBe(null);
  });
  it("groups primary services once per contractor and ignores candidates / manual services", () => {
    const base = { contractorId: "c", contractorNameSnapshot: "Команда", offerTitleSnapshot: "Свет", selectionRole: "PRIMARY", sectionTitle: "Техника" };
    expect(groupProposalContractors([base, base, { ...base, offerTitleSnapshot: "Звук" }, { ...base, contractorId: null }, { ...base, contractorId: "other", selectionRole: "ALTERNATIVE" }])).toEqual([{ contractorId: "c", name: "Команда", responsibility: "Техника: Свет\nТехника: Звук" }]);
  });
});
describe("project roster writes", () => {
  it("uses the selected offer's real category, not a misplaced proposal section", async () => {
    tx.projectProposalVariant.findFirst.mockResolvedValue({ title: "КП", proposal: { revision: 0 }, sections: [{ title: "Ведущие", categoryNameSnapshot: "Ведущие", items: [{ contractorId: "c", contractorNameSnapshot: "Техник", offerTitleSnapshot: "Спецэффекты", selectionRole: "PRIMARY", offer: { category: { name: "Оборудование" } } }] }] });
    await addProjectContractors("p", "a", { action: "IMPORT_PROPOSAL", variantId: "v", expectedProposalRevision: 0 });
    expect(tx.projectContractor.create.mock.calls[0][0].data.categoryNames).toEqual(["Оборудование"]);
  });
  it("creates in Serializable and logs the action without financial mutations", async () => {
    expect(await addProjectContractors("p", "actor", add)).toEqual({ added: 1, skipped: 0 });
    expect(transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
    expect(tx.projectContractor.create.mock.calls[0][0].data).toMatchObject({ projectId: "p", createdById: "actor", status: "PENDING" });
    expect(tx.projectActivityLog.create).toHaveBeenCalledOnce();
  });
  it("replays only the exact creation, without creating twice", async () => {
    await addProjectContractors("p", "actor", add);
    const saved = tx.projectContractor.create.mock.calls[0][0].data;
    tx.projectContractor.findUnique.mockResolvedValue(saved);
    expect(await addProjectContractors("p", "actor", add)).toEqual({ added: 0, skipped: 1 });
    expect(tx.projectContractor.create).toHaveBeenCalledOnce();
    await expect(addProjectContractors("other", "actor", add)).rejects.toThrow("Идентификатор");
  });
  it("blocks archived projects inside the transaction", async () => {
    tx.project.findUnique.mockResolvedValue({ archivedAt: new Date() });
    await expect(addProjectContractors("p", "a", add)).rejects.toThrow("Архивный");
    expect(tx.projectContractor.create).not.toHaveBeenCalled();
  });
  it("rejects duplicate catalog people instead of resetting their agreement", async () => {
    tx.projectContractor.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ status: "CONFIRMED" });
    await expect(addProjectContractors("p", "a", add)).rejects.toThrow("уже есть");
    expect(tx.projectContractor.create).not.toHaveBeenCalled();
  });
  it("rejects a timing slot from another project", async () => {
    tx.projectScheduleSlot.findFirst.mockResolvedValue(null);
    await expect(addProjectContractors("p", "a", { ...add, scheduleSlotId: "foreign" })).rejects.toThrow("этого проекта");
    expect(tx.projectScheduleSlot.findFirst).toHaveBeenCalledWith({ where: { id: "foreign", day: { projectId: "p" } }, select: { id: true } });
  });
  it("uses revision and project in CAS, keeps history on cancellation", async () => {
    await updateProjectContractor("p", "row", "actor", { ...fields, status: "CANCELLED", expectedRevision: 3 });
    expect(tx.projectContractor.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "row", projectId: "p", revision: 3 }, data: { status: "CANCELLED", revision: { increment: 1 } } });
    tx.projectContractor.updateMany.mockResolvedValue({ count: 0 });
    await expect(updateProjectContractor("p", "row", "actor", { ...fields, expectedRevision: 3 })).rejects.toThrow("коллегой");
  });
  it("imports current primary contacts once and never reactivates cancelled people", async () => {
    tx.projectProposalVariant.findFirst.mockResolvedValue({ title: "Основной", proposal: { revision: 4 }, sections: [{ title: "Звук", items: [
      { contractorId: "c1", contractorNameSnapshot: "Техник", offerTitleSnapshot: "Звук", selectionRole: "PRIMARY" },
      { contractorId: "c2", contractorNameSnapshot: "Другой", offerTitleSnapshot: "Свет", selectionRole: "PRIMARY" },
      { contractorId: "c3", contractorNameSnapshot: "Кандидат", offerTitleSnapshot: "Свет", selectionRole: "ALTERNATIVE" },
    ] }] });
    tx.projectContractor.findUnique.mockResolvedValueOnce({ status: "CANCELLED" }).mockResolvedValueOnce(null);
    expect(await addProjectContractors("p", "a", { action: "IMPORT_PROPOSAL", variantId: "v", expectedProposalRevision: 4 })).toEqual({ added: 1, skipped: 1 });
    expect(tx.projectContractor.create.mock.calls[0][0].data).toMatchObject({ contractorId: "c2", status: "PENDING", phone: "+79000000000" });
    expect(tx.projectContractor.updateMany).not.toHaveBeenCalled();
    await expect(addProjectContractors("p", "a", { action: "IMPORT_PROPOSAL", variantId: "v", expectedProposalRevision: 3 })).rejects.toThrow("КП изменилось");
    expect(tx.projectProposalVariant.findFirst.mock.calls[0][0].where).toMatchObject({ proposal: { projectId: "p", isCurrent: true } });
  });
});
