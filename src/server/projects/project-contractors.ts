import { createHash, randomUUID } from "node:crypto";
import { Prisma, ProjectActivityKind } from "@prisma/client";
import { prisma } from "@/server/db";
import { jsonError } from "@/server/http";
import { appendProjectActivityLog } from "./activity-log";
import { groupProposalContractors, ProjectContractorPostSchema, UpdateProjectContractorSchema, ContractorEntrySchema } from "@/lib/projects/project-contractors";
import type { z } from "zod";

class RosterError extends Error { constructor(readonly status: number, message: string) { super(message); } }
export function rosterErrorResponse(error: unknown) {
  if (error instanceof RosterError) return jsonError(error.status, error.message);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021" || error.code === "P2022") return jsonError(503, "Блок подрядчиков ещё не подключён к базе. Проверьте миграции состава и журнала общения.");
    if (["P2034", "P2002"].includes(error.code)) return jsonError(409, "Состав изменился в другом окне. Обновите список; ваши поля сохранены в форме.");
    if (error.code === "P2003") return jsonError(409, "Связанный контакт или пункт тайминга изменился. Обновите список.");
  }
  console.error("project-contractors", error);
  return jsonError(500, "Не удалось обработать состав подрядчиков. Попробуйте ещё раз.");
}
async function editable(tx: Prisma.TransactionClient, projectId: string) {
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { archivedAt: true } });
  if (!project) throw new RosterError(404, "Проект не найден");
  if (project.archivedAt) throw new RosterError(400, "Архивный проект только для просмотра");
}
async function validateSlot(tx: Prisma.TransactionClient, projectId: string, slotId: string | null) {
  if (!slotId) return;
  const slot = await tx.projectScheduleSlot.findFirst({ where: { id: slotId, day: { projectId } }, select: { id: true } });
  if (!slot) throw new RosterError(400, "Выберите пункт тайминга этого проекта");
}
const variantInclude = { sections: { orderBy: { sortOrder: "asc" as const }, include: { items: { orderBy: { sortOrder: "asc" as const }, include: { offer: { select: { category: { select: { name: true } } } } } } } } };
const entrySelect = { id: true, body: true, status: true, createdAt: true, author: { select: { id: true, displayName: true } } } as const;
const entryOrder = [{ createdAt: "desc" as const }, { id: "desc" as const }];
export async function readProjectContractors(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new RosterError(404, "Проект не найден");
  const [rows, days, proposal] = await Promise.all([
    prisma.projectContractor.findMany({ where: { projectId }, orderBy: { createdAt: "asc" }, include: {
      contractor: { select: { assets: { where: { kind: "PHOTO" }, orderBy: { sortOrder: "asc" }, take: 1, select: { id: true } } } },
      scheduleSlot: { include: { day: true } },
      entries: { take: 1, orderBy: entryOrder, select: entrySelect },
    } }),
    prisma.projectScheduleDay.findMany({ where: { projectId }, orderBy: { sortOrder: "asc" }, include: { slots: { orderBy: { sortOrder: "asc" } } } }),
    prisma.projectProposal.findFirst({ where: { projectId, isCurrent: true }, include: { variants: { orderBy: { sortOrder: "asc" }, include: variantInclude } } }),
  ]);
  return {
    assignments: rows.map(({ contractor, scheduleSlot, entries, createdById: _created, updatedById: _updated, creationHash: _hash, projectId: _project, createdAt: _date, ...row }) => ({
      ...row, updatedAt: row.updatedAt.toISOString(),
      latestEntry: entries[0] ? { ...entries[0], createdAt: entries[0].createdAt.toISOString() } : null,
      photoUrl: contractor?.assets[0] ? `/api/contractors/${row.contractorId}/assets/${contractor.assets[0].id}` : null,
      scheduleLabel: scheduleSlot ? `${scheduleSlot.day.dateNote} · ${scheduleSlot.intervalText} · ${scheduleSlot.description}` : null,
    })),
    scheduleSlots: days.flatMap((day) => day.slots.map((slot) => ({ id: slot.id, label: `${day.dateNote} · ${slot.intervalText} · ${slot.description}` }))),
    proposal: proposal ? { revision: proposal.revision, variants: proposal.variants.map((variant) => ({
      id: variant.id, title: variant.title, isRecommended: variant.isRecommended,
      contractorCount: groupProposalContractors(variant.sections.flatMap((section) => section.items.map((item) => ({ ...item, sectionTitle: section.title })))).length,
    })) } : null,
  };
}
export async function addProjectContractors(projectId: string, actorId: string, input: z.infer<typeof ProjectContractorPostSchema>) {
  return prisma.$transaction(async (tx) => {
    await editable(tx, projectId);
    if (input.action === "ADD") {
      const { action: _action, id, contractorId, ...fields } = input;
      const creationHash = createHash("sha256").update(JSON.stringify({ projectId, actorId, input })).digest("hex");
      const replay = await tx.projectContractor.findUnique({ where: { id } });
      if (replay) {
        if (replay.projectId !== projectId || replay.creationHash !== creationHash) throw new RosterError(409, "Идентификатор уже использован другим действием");
        return { added: 0, skipped: 1 };
      }
      if (contractorId) {
        const contractor = await tx.contractor.findUnique({ where: { id: contractorId }, select: { isActive: true } });
        if (!contractor?.isActive) throw new RosterError(400, "Подрядчик больше не доступен в каталоге");
        const existing = await tx.projectContractor.findUnique({ where: { projectId_contractorId: { projectId, contractorId } } });
        if (existing) throw new RosterError(409, "Подрядчик уже есть в составе проекта. Измените существующую запись.");
      }
      await validateSlot(tx, projectId, fields.scheduleSlotId);
      await tx.projectContractor.create({ data: { ...fields, id, contractorId, projectId, creationHash, createdById: actorId, updatedById: actorId } });
      await appendProjectActivityLog(tx, { projectId, actorUserId: actorId, kind: ProjectActivityKind.PROJECT_UPDATED, payload: { contractorAction: "added", contractorName: fields.name } });
      return { added: 1, skipped: 0 };
    }
    const variant = await tx.projectProposalVariant.findFirst({ where: { id: input.variantId, proposal: { projectId, isCurrent: true } }, include: { ...variantInclude, proposal: { select: { revision: true } } } });
    if (!variant) throw new RosterError(404, "Вариант КП этого проекта не найден");
    if (variant.proposal.revision !== input.expectedProposalRevision) throw new RosterError(409, "КП изменилось. Обновите состав перед переносом.");
    const groups = groupProposalContractors(variant.sections.flatMap((section) => section.items.map((item) => ({ ...item, sectionTitle: section.title }))));
    if (groups.some((group) => group.name.length > 200 || group.responsibility.length > 3000)) throw new RosterError(400, "Описание из КП слишком длинное. Добавьте подрядчика вручную с краткой зоной ответственности.");
    let added = 0;
    for (const group of groups) {
      const existing = await tx.projectContractor.findUnique({ where: { projectId_contractorId: { projectId, contractorId: group.contractorId } } });
      if (existing) continue; // Never overwrite agreements or reactivate cancelled people.
      const contractor = await tx.contractor.findUnique({ where: { id: group.contractorId }, select: { contacts: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1 } } });
      if (!contractor) continue;
      const contact = contractor.contacts[0];
      const categoryNames = [...new Set(variant.sections.flatMap((section) => section.items.filter((item) => item.contractorId === group.contractorId && item.selectionRole === "PRIMARY").map((item) => item.offer?.category.name || section.categoryNameSnapshot || section.title)))];
      await tx.projectContractor.create({ data: { ...group, categoryNames, contactName: contact?.personName ?? null, phone: contact?.phone ?? null, email: contact?.email ?? null, id: randomUUID(), projectId, status: "PENDING", creationHash: `proposal:${input.variantId}:${input.expectedProposalRevision}`, createdById: actorId, updatedById: actorId } });
      added++;
    }
    if (added) await appendProjectActivityLog(tx, { projectId, actorUserId: actorId, kind: ProjectActivityKind.PROJECT_UPDATED, payload: { contractorAction: "imported", variantTitle: variant.title, count: added } });
    return { added, skipped: groups.length - added };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
export async function updateProjectContractor(projectId: string, id: string, actorId: string, input: z.infer<typeof UpdateProjectContractorSchema>) {
  return prisma.$transaction(async (tx) => {
    await editable(tx, projectId);
    await validateSlot(tx, projectId, input.scheduleSlotId);
    const { expectedRevision, ...fields } = input;
    const result = await tx.projectContractor.updateMany({ where: { id, projectId, revision: expectedRevision }, data: { ...fields, updatedById: actorId, revision: { increment: 1 } } });
    if (!result.count) throw new RosterError(409, "Запись изменена коллегой. Обновите список и сверьте поля перед сохранением.");
    await appendProjectActivityLog(tx, { projectId, actorUserId: actorId, kind: ProjectActivityKind.PROJECT_UPDATED, payload: { contractorAction: "updated", contractorName: fields.name, status: fields.status } });
    return { ok: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function readContractorEntries(projectId: string, assignmentId: string, cursor: string | null) {
  const assignment = await prisma.projectContractor.findFirst({ where: { id: assignmentId, projectId }, select: { id: true } });
  if (!assignment) throw new RosterError(404, "Подрядчик этого проекта не найден");
  if (cursor && !await prisma.projectContractorEntry.findFirst({ where: { id: cursor, assignmentId }, select: { id: true } })) {
    throw new RosterError(400, "Обновите журнал: страница истории больше недоступна");
  }
  const entries = await prisma.projectContractorEntry.findMany({
    where: { assignmentId }, orderBy: entryOrder, take: 31,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: entrySelect,
  });
  const page = entries.slice(0, 30);
  return { entries: page.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })), nextCursor: entries.length > 30 ? page.at(-1)!.id : null };
}

export async function addContractorEntry(projectId: string, assignmentId: string, actorId: string, input: z.infer<typeof ContractorEntrySchema>) {
  return prisma.$transaction(async (tx) => {
    await editable(tx, projectId);
    const creationHash = createHash("sha256").update(JSON.stringify({ projectId, assignmentId, actorId, body: input.body, status: input.status })).digest("hex");
    const replay = await tx.projectContractorEntry.findUnique({ where: { id: input.id } });
    if (replay) {
      if (replay.assignmentId !== assignmentId || replay.creationHash !== creationHash) throw new RosterError(409, "Этот идентификатор уже использован. Обновите журнал.");
      return { ok: true, replay: true };
    }
    const assignment = await tx.projectContractor.findFirst({ where: { id: assignmentId, projectId }, select: { name: true, status: true } });
    if (!assignment) throw new RosterError(404, "Подрядчик этого проекта не найден");
    if (assignment.status === "CANCELLED") throw new RosterError(400, "Верните подрядчика в состав, чтобы продолжить общение");
    const changed = await tx.projectContractor.updateMany({ where: { id: assignmentId, projectId, revision: input.expectedRevision }, data: { revision: { increment: 1 }, updatedById: actorId } });
    if (!changed.count) throw new RosterError(409, "Коллега изменил подрядчика. Обновите список, сверьте договорённости и сохраните запись ещё раз.");
    await tx.projectContractorEntry.create({ data: { id: input.id, assignmentId, authorId: actorId, body: input.body, status: input.status, creationHash } });
    await appendProjectActivityLog(tx, { projectId, actorUserId: actorId, kind: ProjectActivityKind.PROJECT_UPDATED, payload: { contractorAction: "communication", contractorName: assignment.name, communicationStatus: input.status } });
    return { ok: true, replay: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
