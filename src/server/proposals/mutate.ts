import {
  ContractorOfferPriceType,
  Prisma,
  ProjectActivityKind,
  ProjectProposalItemKind,
  ProjectProposalSelectionRole,
  ProjectProposalStatus,
} from "@prisma/client";
import { z } from "zod";
import { createHash } from "node:crypto";

import { prisma } from "@/server/db";
import { appendProjectActivityLog } from "@/server/projects/activity-log";
import { buildProposalReadModel } from "@/server/projects/proposal-read-model";
import { captureProposalState, proposalDelta, reverseProposalDelta, type ProposalDelta } from "./history";
import { proposalOrder } from "@/lib/proposal-order";

const Base = z.object({ expectedRevision: z.number().int().min(0), mutationId: z.string().uuid().optional() });
const SelectionRole = z.nativeEnum(ProjectProposalSelectionRole);

export const proposalMutationSchema = z.discriminatedUnion("action", [
  Base.extend({ action: z.literal("MOVE_SECTION"), sectionId: z.string().trim().min(1), beforeId: z.string().trim().min(1).nullable() }).strict(),
  Base.extend({ action: z.literal("MOVE_ITEM"), itemId: z.string().trim().min(1), sectionId: z.string().trim().min(1), beforeId: z.string().trim().min(1).nullable() }).strict(),
  Base.extend({ action: z.literal("RESTORE_CHANGE"), mutationId: z.string().uuid(), changeId: z.string().uuid() }).strict(),
  Base.extend({
    action: z.literal("UPDATE_PROPOSAL"),
    title: z.string().trim().min(2).max(200).optional(),
    status: z.nativeEnum(ProjectProposalStatus).optional(),
    clientIntro: z.string().trim().max(4000).nullable().optional(),
    clientOutro: z.string().trim().max(4000).nullable().optional(),
  }).strict(),
  Base.extend({
    action: z.literal("ADD_VARIANT"),
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().max(1000).nullable().optional(),
    sourceVariantId: z.string().trim().min(1).optional(),
  }).strict(),
  Base.extend({
    action: z.literal("ADD_SECTION"),
    variantId: z.string().trim().min(1),
    categoryId: z.string().trim().min(1).nullable().optional(),
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().max(1000).nullable().optional(),
  }).strict(),
  Base.extend({
    action: z.literal("UPDATE_SECTION"),
    sectionId: z.string().trim().min(1),
    title: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
  }).strict(),
  Base.extend({ action: z.literal("REMOVE_SECTION"), sectionId: z.string().trim().min(1) }).strict(),
  Base.extend({
    action: z.literal("ADD_CATALOG_ITEM"),
    sectionId: z.string().trim().min(1),
    offerId: z.string().trim().min(1),
    selectionRole: SelectionRole.default(ProjectProposalSelectionRole.PRIMARY),
  }).strict(),
  Base.extend({
    action: z.literal("ADD_MANUAL_ITEM"),
    sectionId: z.string().trim().min(1),
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    clientUnitPrice: z.number().finite().nonnegative().nullable().optional(),
    internalUnitCost: z.number().finite().nonnegative().nullable().optional(),
    unitLabel: z.string().trim().max(80).nullable().optional(),
  }).strict(),
  Base.extend({
    action: z.literal("UPDATE_ITEM"),
    itemId: z.string().trim().min(1),
    qty: z.number().finite().positive().max(100000).optional(),
    clientUnitPrice: z.number().finite().nonnegative().nullable().optional(),
    internalUnitCost: z.number().finite().nonnegative().nullable().optional(),
    selectionRole: SelectionRole.optional(),
    clientNote: z.string().trim().max(2000).nullable().optional(),
  }).strict(),
  Base.extend({ action: z.literal("REMOVE_ITEM"), itemId: z.string().trim().min(1) }).strict(),
]);

export type ProposalMutation = z.infer<typeof proposalMutationSchema>;

export async function applyProposalMutation(args: {
  proposalId: string;
  actorUserId: string;
  operation: ProposalMutation;
  expectedProjectId?: string;
}) {
  const { proposalId, actorUserId, operation, expectedProjectId } = args;
  const requestHash = createHash("sha256").update(JSON.stringify(operation)).digest("hex");

  await prisma.$transaction(
    async (tx) => {
      const proposal = await tx.projectProposal.findUnique({
        where: { id: proposalId },
        select: {
          projectId: true,
          standaloneProposalId: true,
          revision: true,
          project: { select: { archivedAt: true } },
          standaloneProposal: { select: { convertedAt: true } },
        },
      });
      if (!proposal || (expectedProjectId && proposal.projectId !== expectedProjectId)) {
        throw new Error("NOT_FOUND");
      }
      if (operation.mutationId) {
        const receipt = await tx.proposalMutationReceipt.findUnique({ where: {
          proposalId_actorUserId_mutationId: { proposalId, actorUserId, mutationId: operation.mutationId },
        } });
        if (receipt) {
          if (receipt.requestHash !== requestHash) throw new Error("MUTATION_ID_REUSED");
          return; // A committed request is never applied twice, even at a later revision.
        }
      }
      if (proposal.project?.archivedAt || proposal.standaloneProposal?.convertedAt) {
        throw new Error("READ_ONLY");
      }
      if (proposal.revision !== operation.expectedRevision) throw new Error("REVISION_CONFLICT");
      const before = operation.mutationId ? await captureProposalState(tx, proposalId) : null;

      if (operation.action === "RESTORE_CHANGE") {
        const change = await tx.proposalMutationReceipt.findUnique({ where: {
          proposalId_actorUserId_mutationId: { proposalId, actorUserId, mutationId: operation.changeId },
        } });
        if (!change || change.reversedByMutationId) throw new Error("HISTORY_CONFLICT");
        await reverseProposalDelta(tx, proposalId, change.delta as unknown as ProposalDelta, before!);
        await tx.proposalMutationReceipt.update({ where: { id: change.id }, data: { reversedByMutationId: operation.mutationId } });
      } else if (operation.action === "UPDATE_PROPOSAL") {
        await tx.projectProposal.update({
          where: { id: proposalId },
          data: {
            title: operation.title,
            status: operation.status,
            clientIntro: operation.clientIntro,
            clientOutro: operation.clientOutro,
          },
        });
        if (operation.title && proposal.standaloneProposalId) {
          await tx.standaloneProposal.update({
            where: { id: proposal.standaloneProposalId },
            data: { title: operation.title },
          });
        }
      } else if (operation.action === "ADD_VARIANT") {
        const max = await tx.projectProposalVariant.aggregate({
          where: { proposalId },
          _max: { sortOrder: true },
        });
        const created = await tx.projectProposalVariant.create({
          data: {
            proposalId,
            title: operation.title,
            description: operation.description || null,
            sortOrder: (max._max.sortOrder ?? -1) + 1,
          },
          select: { id: true },
        });
        if (operation.sourceVariantId) {
          const source = await tx.projectProposalVariant.findFirst({
            where: { id: operation.sourceVariantId, proposalId },
            select: {
              sections: {
                orderBy: { sortOrder: "asc" },
                select: {
                  categoryId: true,
                  categoryNameSnapshot: true,
                  title: true,
                  description: true,
                  sortOrder: true,
                  items: { orderBy: { sortOrder: "asc" } },
                },
              },
            },
          });
          if (!source) throw new Error("INVALID_TARGET");
          for (const section of source.sections) {
            await tx.projectProposalSection.create({
              data: {
                variantId: created.id,
                categoryId: section.categoryId,
                categoryNameSnapshot: section.categoryNameSnapshot,
                title: section.title,
                description: section.description,
                sortOrder: section.sortOrder,
                items: {
                  create: section.items.map(
                    (item): Prisma.ProjectProposalItemUncheckedCreateWithoutSectionInput => ({
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
                      assetSnapshot:
                        item.assetSnapshot === null
                          ? Prisma.JsonNull
                          : (item.assetSnapshot as Prisma.InputJsonValue),
                    }),
                  ),
                },
              },
            });
          }
        }
      } else if (operation.action === "ADD_SECTION") {
        const variant = await tx.projectProposalVariant.findFirst({
          where: { id: operation.variantId, proposalId },
          select: { id: true },
        });
        if (!variant) throw new Error("INVALID_TARGET");
        const category = operation.categoryId
          ? await tx.contractorCategory.findUnique({
              where: { id: operation.categoryId },
              select: { id: true, name: true },
            })
          : null;
        if (operation.categoryId && !category) throw new Error("INVALID_TARGET");
        const max = await tx.projectProposalSection.aggregate({
          where: { variantId: variant.id },
          _max: { sortOrder: true },
        });
        await tx.projectProposalSection.create({
          data: {
            variantId: variant.id,
            categoryId: category?.id,
            categoryNameSnapshot: category?.name,
            title: operation.title,
            description: operation.description || null,
            sortOrder: (max._max.sortOrder ?? -1) + 1,
          },
        });
      } else if (operation.action === "MOVE_SECTION") {
        const section = await tx.projectProposalSection.findFirst({ where: { id: operation.sectionId, variant: { proposalId } }, select: { id: true, variantId: true } });
        if (!section) throw new Error("INVALID_TARGET");
        const siblings = await tx.projectProposalSection.findMany({ where: { variantId: section.variantId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }], select: { id: true, sortOrder: true } });
        const ordered = proposalOrder(siblings.map((entry) => entry.id), section.id, operation.beforeId);
        const previousOrder = new Map(siblings.map((entry) => [entry.id, entry.sortOrder]));
        for (const [sortOrder, id] of ordered.entries()) {
          if (previousOrder.get(id) !== sortOrder) await tx.projectProposalSection.update({ where: { id }, data: { sortOrder } });
        }
      } else if (operation.action === "MOVE_ITEM") {
        const item = await tx.projectProposalItem.findFirst({ where: { id: operation.itemId, section: { variant: { proposalId } } }, select: { id: true, sectionId: true, section: { select: { variantId: true } } } });
        const target = await tx.projectProposalSection.findFirst({ where: { id: operation.sectionId, variant: { proposalId } }, select: { id: true, variantId: true } });
        // Moving between client variants would change their independent composition.
        if (!item || !target || item.section.variantId !== target.variantId) throw new Error("INVALID_TARGET");
        const siblings = await tx.projectProposalItem.findMany({ where: { sectionId: { in: [...new Set([item.sectionId, target.id])] } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }], select: { id: true, sectionId: true, sortOrder: true } });
        const destination = siblings.filter((entry) => entry.sectionId === target.id).map((entry) => entry.id);
        if (item.sectionId !== target.id) destination.push(item.id);
        const ordered = proposalOrder(destination, item.id, operation.beforeId);
        if (item.sectionId !== target.id) {
          const source = siblings.filter((entry) => entry.sectionId === item.sectionId && entry.id !== item.id);
          for (const [sortOrder, entry] of source.entries()) {
            if (entry.sortOrder !== sortOrder) await tx.projectProposalItem.update({ where: { id: entry.id }, data: { sortOrder } });
          }
        }
        const previousItems = new Map(siblings.map((entry) => [entry.id, entry]));
        for (const [sortOrder, id] of ordered.entries()) {
          const previous = previousItems.get(id);
          if (previous?.sortOrder !== sortOrder || previous?.sectionId !== target.id) await tx.projectProposalItem.update({ where: { id }, data: { sortOrder, sectionId: target.id } });
        }
      } else if (operation.action === "UPDATE_SECTION" || operation.action === "REMOVE_SECTION") {
        const section = await tx.projectProposalSection.findFirst({
          where: { id: operation.sectionId, variant: { proposalId } },
          select: { id: true },
        });
        if (!section) throw new Error("INVALID_TARGET");
        if (operation.action === "REMOVE_SECTION") {
          await tx.projectProposalSection.delete({ where: { id: section.id } });
        } else {
          await tx.projectProposalSection.update({
            where: { id: section.id },
            data: { title: operation.title, description: operation.description },
          });
        }
      } else if (operation.action === "ADD_CATALOG_ITEM") {
        const section = await tx.projectProposalSection.findFirst({
          where: { id: operation.sectionId, variant: { proposalId } },
          select: { id: true },
        });
        const offer = await tx.contractorOffer.findFirst({
          where: { id: operation.offerId, isActive: true, contractor: { isActive: true } },
          select: {
            id: true,
            revision: true,
            title: true,
            description: true,
            priceType: true,
            clientPrice: true,
            internalCost: true,
            currencyCode: true,
            unitLabel: true,
            priceConfirmedAt: true,
            contractor: {
              select: {
                id: true,
                name: true,
                assets: {
                  where: { kind: "PHOTO" },
                  orderBy: { sortOrder: "asc" },
                  take: 4,
                  select: { id: true, caption: true, focalX: true, focalY: true },
                },
              },
            },
          },
        });
        if (!section || !offer) throw new Error("INVALID_TARGET");
        const max = await tx.projectProposalItem.aggregate({
          where: { sectionId: section.id },
          _max: { sortOrder: true },
        });
        await tx.projectProposalItem.create({
          data: {
            sectionId: section.id,
            contractorId: offer.contractor.id,
            offerId: offer.id,
            kind: ProjectProposalItemKind.CATALOG,
            selectionRole: operation.selectionRole,
            sortOrder: (max._max.sortOrder ?? -1) + 1,
            qty: new Prisma.Decimal(1),
            clientUnitPrice: offer.clientPrice,
            internalUnitCost: offer.internalCost,
            unitLabel: offer.unitLabel,
            contractorNameSnapshot: offer.contractor.name,
            offerTitleSnapshot: offer.title,
            offerDescriptionSnapshot: offer.description,
            priceTypeSnapshot: offer.priceType,
            currencyCodeSnapshot: offer.currencyCode,
            sourcePriceConfirmedAt: offer.priceConfirmedAt,
            sourceOfferRevision: offer.revision,
            assetSnapshot: offer.contractor.assets.length
              ? (offer.contractor.assets.map((asset) => ({
                  id: asset.id,
                  url: `/api/contractors/${offer.contractor.id}/assets/${asset.id}`,
                  caption: asset.caption,
                  focalX: asset.focalX?.toString() ?? null,
                  focalY: asset.focalY?.toString() ?? null,
                })) as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          },
        });
      } else if (operation.action === "ADD_MANUAL_ITEM") {
        const section = await tx.projectProposalSection.findFirst({
          where: { id: operation.sectionId, variant: { proposalId } },
          select: { id: true },
        });
        if (!section) throw new Error("INVALID_TARGET");
        const max = await tx.projectProposalItem.aggregate({
          where: { sectionId: section.id },
          _max: { sortOrder: true },
        });
        await tx.projectProposalItem.create({
          data: {
            sectionId: section.id,
            kind: ProjectProposalItemKind.MANUAL,
            sortOrder: (max._max.sortOrder ?? -1) + 1,
            contractorNameSnapshot: "Свой вариант",
            offerTitleSnapshot: operation.title,
            offerDescriptionSnapshot: operation.description || null,
            priceTypeSnapshot: ContractorOfferPriceType.FIXED,
            clientUnitPrice:
              operation.clientUnitPrice == null
                ? null
                : new Prisma.Decimal(operation.clientUnitPrice),
            internalUnitCost:
              operation.internalUnitCost == null
                ? null
                : new Prisma.Decimal(operation.internalUnitCost),
            unitLabel: operation.unitLabel || null,
          },
        });
      } else {
        const item = await tx.projectProposalItem.findFirst({
          where: { id: operation.itemId, section: { variant: { proposalId } } },
          select: { id: true },
        });
        if (!item) throw new Error("INVALID_TARGET");
        if (operation.action === "REMOVE_ITEM") {
          await tx.projectProposalItem.delete({ where: { id: item.id } });
        } else {
          await tx.projectProposalItem.update({
            where: { id: item.id },
            data: {
              qty: operation.qty === undefined ? undefined : new Prisma.Decimal(operation.qty),
              clientUnitPrice:
                operation.clientUnitPrice === undefined
                  ? undefined
                  : operation.clientUnitPrice == null
                    ? null
                    : new Prisma.Decimal(operation.clientUnitPrice),
              internalUnitCost:
                operation.internalUnitCost === undefined
                  ? undefined
                  : operation.internalUnitCost == null
                    ? null
                    : new Prisma.Decimal(operation.internalUnitCost),
              selectionRole: operation.selectionRole,
              clientNote: operation.clientNote,
            },
          });
        }
      }

      const updated = await tx.projectProposal.updateMany({
        where: { id: proposalId, revision: operation.expectedRevision },
        data: { revision: { increment: 1 }, updatedById: actorUserId },
      });
      if (updated.count !== 1) throw new Error("REVISION_CONFLICT");
      if (operation.mutationId && before) {
        const after = await captureProposalState(tx, proposalId);
        await tx.proposalMutationReceipt.create({ data: { proposalId, actorUserId, mutationId: operation.mutationId,
          requestHash, action: operation.action, delta: proposalDelta(before, after) as unknown as Prisma.InputJsonValue,
          resultRevision: operation.expectedRevision + 1,
        } });
      }

      if (proposal.projectId) {
        await appendProjectActivityLog(tx, {
          projectId: proposal.projectId,
          actorUserId,
          kind: ProjectActivityKind.PROJECT_PROPOSAL_UPDATED,
          payload: { proposalId, action: operation.action } as Prisma.InputJsonValue,
        });
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 15_000 },
  );

  return buildProposalReadModel(proposalId);
}
