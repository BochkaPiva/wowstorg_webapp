import {
  ContractorOfferPriceType,
  Prisma,
  ProjectActivityKind,
  ProjectProposalItemKind,
  ProjectProposalSelectionRole,
  ProjectProposalStatus,
} from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { appendProjectActivityLog } from "@/server/projects/activity-log";
import { buildProjectProposalReadModel } from "@/server/projects/proposal-read-model";

const Base = z.object({ expectedRevision: z.number().int().min(0) });
const SelectionRole = z.nativeEnum(ProjectProposalSelectionRole);
const OperationSchema = z.discriminatedUnion("action", [
  Base.extend({ action: z.literal("UPDATE_PROPOSAL"), title: z.string().trim().min(2).max(200).optional(), status: z.nativeEnum(ProjectProposalStatus).optional(), clientIntro: z.string().trim().max(4000).nullable().optional(), clientOutro: z.string().trim().max(4000).nullable().optional() }).strict(),
  Base.extend({ action: z.literal("ADD_VARIANT"), title: z.string().trim().min(2).max(160), description: z.string().trim().max(1000).nullable().optional(), sourceVariantId: z.string().trim().min(1).optional() }).strict(),
  Base.extend({ action: z.literal("ADD_SECTION"), variantId: z.string().trim().min(1), categoryId: z.string().trim().min(1).nullable().optional(), title: z.string().trim().min(2).max(160), description: z.string().trim().max(1000).nullable().optional() }).strict(),
  Base.extend({ action: z.literal("UPDATE_SECTION"), sectionId: z.string().trim().min(1), title: z.string().trim().min(2).max(160).optional(), description: z.string().trim().max(1000).nullable().optional() }).strict(),
  Base.extend({ action: z.literal("REMOVE_SECTION"), sectionId: z.string().trim().min(1) }).strict(),
  Base.extend({ action: z.literal("ADD_CATALOG_ITEM"), sectionId: z.string().trim().min(1), offerId: z.string().trim().min(1), selectionRole: SelectionRole.default(ProjectProposalSelectionRole.PRIMARY) }).strict(),
  Base.extend({ action: z.literal("ADD_MANUAL_ITEM"), sectionId: z.string().trim().min(1), title: z.string().trim().min(2).max(200), description: z.string().trim().max(2000).nullable().optional(), clientUnitPrice: z.number().finite().nonnegative().nullable().optional(), internalUnitCost: z.number().finite().nonnegative().nullable().optional(), unitLabel: z.string().trim().max(80).nullable().optional() }).strict(),
  Base.extend({ action: z.literal("UPDATE_ITEM"), itemId: z.string().trim().min(1), qty: z.number().finite().positive().max(100000).optional(), clientUnitPrice: z.number().finite().nonnegative().nullable().optional(), internalUnitCost: z.number().finite().nonnegative().nullable().optional(), selectionRole: SelectionRole.optional(), clientNote: z.string().trim().max(2000).nullable().optional() }).strict(),
  Base.extend({ action: z.literal("REMOVE_ITEM"), itemId: z.string().trim().min(1) }).strict(),
]);

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; proposalId: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const { id: projectId, proposalId } = await ctx.params;
  const parsed = OperationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Проверьте изменение", parsed.error.flatten());
  const operation = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const proposal = await tx.projectProposal.findFirst({
        where: { id: proposalId, projectId }, select: { revision: true, project: { select: { archivedAt: true } } },
      });
      if (!proposal) throw new Error("NOT_FOUND");
      if (proposal.project.archivedAt) throw new Error("ARCHIVED");
      if (proposal.revision !== operation.expectedRevision) throw new Error("REVISION_CONFLICT");

      if (operation.action === "UPDATE_PROPOSAL") {
        await tx.projectProposal.update({ where: { id: proposalId }, data: {
          title: operation.title, status: operation.status, clientIntro: operation.clientIntro, clientOutro: operation.clientOutro,
        } });
      } else if (operation.action === "ADD_VARIANT") {
        const max = await tx.projectProposalVariant.aggregate({ where: { proposalId }, _max: { sortOrder: true } });
        const created = await tx.projectProposalVariant.create({ data: { proposalId, title: operation.title, description: operation.description || null, sortOrder: (max._max.sortOrder ?? -1) + 1 }, select: { id: true } });
        if (operation.sourceVariantId) {
          const source = await tx.projectProposalVariant.findFirst({ where: { id: operation.sourceVariantId, proposalId }, select: {
            sections: { orderBy: { sortOrder: "asc" }, select: { categoryId: true, categoryNameSnapshot: true, title: true, description: true, sortOrder: true, items: { orderBy: { sortOrder: "asc" } } } },
          } });
          if (!source) throw new Error("INVALID_TARGET");
          for (const section of source.sections) {
            await tx.projectProposalSection.create({ data: {
              variantId: created.id, categoryId: section.categoryId, categoryNameSnapshot: section.categoryNameSnapshot,
              title: section.title, description: section.description, sortOrder: section.sortOrder,
              items: { create: section.items.map((item): Prisma.ProjectProposalItemUncheckedCreateWithoutSectionInput => ({
                contractorId: item.contractorId,
                offerId: item.offerId,
                kind: item.kind,
                selectionRole: item.selectionRole,
                sortOrder: item.sortOrder,
                qty: item.qty,
                clientUnitPrice: item.clientUnitPrice,
                internalUnitCost: item.internalUnitCost,
                unitLabel: item.unitLabel,
                clientNote: item.clientNote,
                internalNote: item.internalNote,
                contractorNameSnapshot: item.contractorNameSnapshot,
                offerTitleSnapshot: item.offerTitleSnapshot,
                offerDescriptionSnapshot: item.offerDescriptionSnapshot,
                priceTypeSnapshot: item.priceTypeSnapshot,
                currencyCodeSnapshot: item.currencyCodeSnapshot,
                sourcePriceConfirmedAt: item.sourcePriceConfirmedAt,
                sourceOfferRevision: item.sourceOfferRevision,
                assetSnapshot: item.assetSnapshot === null ? Prisma.JsonNull : item.assetSnapshot as Prisma.InputJsonValue,
              })) },
            } });
          }
        }
      } else if (operation.action === "ADD_SECTION") {
        const variant = await tx.projectProposalVariant.findFirst({ where: { id: operation.variantId, proposalId }, select: { id: true } });
        if (!variant) throw new Error("INVALID_TARGET");
        const category = operation.categoryId ? await tx.contractorCategory.findUnique({ where: { id: operation.categoryId }, select: { id: true, name: true } }) : null;
        if (operation.categoryId && !category) throw new Error("INVALID_TARGET");
        const max = await tx.projectProposalSection.aggregate({ where: { variantId: variant.id }, _max: { sortOrder: true } });
        await tx.projectProposalSection.create({ data: { variantId: variant.id, categoryId: category?.id, categoryNameSnapshot: category?.name, title: operation.title, description: operation.description || null, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
      } else if (operation.action === "UPDATE_SECTION" || operation.action === "REMOVE_SECTION") {
        const section = await tx.projectProposalSection.findFirst({ where: { id: operation.sectionId, variant: { proposalId } }, select: { id: true } });
        if (!section) throw new Error("INVALID_TARGET");
        if (operation.action === "REMOVE_SECTION") await tx.projectProposalSection.delete({ where: { id: section.id } });
        else await tx.projectProposalSection.update({ where: { id: section.id }, data: { title: operation.title, description: operation.description } });
      } else if (operation.action === "ADD_CATALOG_ITEM") {
        const section = await tx.projectProposalSection.findFirst({ where: { id: operation.sectionId, variant: { proposalId } }, select: { id: true } });
        const offer = await tx.contractorOffer.findFirst({ where: { id: operation.offerId, isActive: true, contractor: { isActive: true } }, select: {
          id: true, revision: true, title: true, description: true, priceType: true, clientPrice: true, internalCost: true,
          currencyCode: true, unitLabel: true, priceConfirmedAt: true, contractor: { select: {
            id: true, name: true, assets: { where: { kind: "PHOTO" }, orderBy: { sortOrder: "asc" }, take: 4, select: { id: true, caption: true, focalX: true, focalY: true } },
          } },
        } });
        if (!section || !offer) throw new Error("INVALID_TARGET");
        const max = await tx.projectProposalItem.aggregate({ where: { sectionId: section.id }, _max: { sortOrder: true } });
        await tx.projectProposalItem.create({ data: {
          sectionId: section.id, contractorId: offer.contractor.id, offerId: offer.id, kind: ProjectProposalItemKind.CATALOG,
          selectionRole: operation.selectionRole, sortOrder: (max._max.sortOrder ?? -1) + 1, qty: new Prisma.Decimal(1),
          clientUnitPrice: offer.clientPrice, internalUnitCost: offer.internalCost, unitLabel: offer.unitLabel,
          contractorNameSnapshot: offer.contractor.name, offerTitleSnapshot: offer.title,
          offerDescriptionSnapshot: offer.description, priceTypeSnapshot: offer.priceType,
          currencyCodeSnapshot: offer.currencyCode, sourcePriceConfirmedAt: offer.priceConfirmedAt, sourceOfferRevision: offer.revision,
          assetSnapshot: offer.contractor.assets.length ? offer.contractor.assets.map((asset) => ({
            id: asset.id,
            url: `/api/contractors/${offer.contractor.id}/assets/${asset.id}`,
            caption: asset.caption,
            focalX: asset.focalX?.toString() ?? null,
            focalY: asset.focalY?.toString() ?? null,
          })) as Prisma.InputJsonValue : Prisma.JsonNull,
        } });
      } else if (operation.action === "ADD_MANUAL_ITEM") {
        const section = await tx.projectProposalSection.findFirst({ where: { id: operation.sectionId, variant: { proposalId } }, select: { id: true } });
        if (!section) throw new Error("INVALID_TARGET");
        const max = await tx.projectProposalItem.aggregate({ where: { sectionId: section.id }, _max: { sortOrder: true } });
        await tx.projectProposalItem.create({ data: {
          sectionId: section.id, kind: ProjectProposalItemKind.MANUAL, sortOrder: (max._max.sortOrder ?? -1) + 1,
          contractorNameSnapshot: "Свой вариант", offerTitleSnapshot: operation.title,
          offerDescriptionSnapshot: operation.description || null, priceTypeSnapshot: ContractorOfferPriceType.FIXED,
          clientUnitPrice: operation.clientUnitPrice == null ? null : new Prisma.Decimal(operation.clientUnitPrice),
          internalUnitCost: operation.internalUnitCost == null ? null : new Prisma.Decimal(operation.internalUnitCost), unitLabel: operation.unitLabel || null,
        } });
      } else {
        const item = await tx.projectProposalItem.findFirst({ where: { id: operation.itemId, section: { variant: { proposalId } } }, select: { id: true } });
        if (!item) throw new Error("INVALID_TARGET");
        if (operation.action === "REMOVE_ITEM") await tx.projectProposalItem.delete({ where: { id: item.id } });
        else await tx.projectProposalItem.update({ where: { id: item.id }, data: {
          qty: operation.qty === undefined ? undefined : new Prisma.Decimal(operation.qty),
          clientUnitPrice: operation.clientUnitPrice === undefined ? undefined : operation.clientUnitPrice == null ? null : new Prisma.Decimal(operation.clientUnitPrice),
          internalUnitCost: operation.internalUnitCost === undefined ? undefined : operation.internalUnitCost == null ? null : new Prisma.Decimal(operation.internalUnitCost),
          selectionRole: operation.selectionRole, clientNote: operation.clientNote,
        } });
      }

      const updated = await tx.projectProposal.updateMany({
        where: { id: proposalId, revision: operation.expectedRevision },
        data: { revision: { increment: 1 }, updatedById: auth.user.id },
      });
      if (updated.count !== 1) throw new Error("REVISION_CONFLICT");
      await appendProjectActivityLog(tx, {
        projectId, actorUserId: auth.user.id, kind: ProjectActivityKind.PROJECT_PROPOSAL_UPDATED,
        payload: { proposalId, action: operation.action } as Prisma.InputJsonValue,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 15_000 });

    return jsonOk({ proposal: await buildProjectProposalReadModel(projectId, proposalId) });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return jsonError(404, "Концепция не найдена");
    if (error instanceof Error && error.message === "ARCHIVED") return jsonError(400, "Архивный проект только для просмотра");
    if (error instanceof Error && error.message === "INVALID_TARGET") return jsonError(400, "Выбранный раздел или предложение больше недоступны");
    if ((error instanceof Error && error.message === "REVISION_CONFLICT") || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")) {
      return jsonError(409, "Концепция уже изменилась у коллеги. Обновите данные — его работа не будет перезаписана.");
    }
    throw error;
  }
}
