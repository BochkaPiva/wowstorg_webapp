import { createHash } from "node:crypto";

import { Prisma, ProjectActivityKind, ProjectEstimateSectionKind, ProjectProposalSnapshotReason } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { appendProjectActivityLog } from "@/server/projects/activity-log";

const TransferSchema = z.object({
  mutationId: z.string().trim().min(8).max(120),
  expectedProposalRevision: z.number().int().min(0),
  variantId: z.string().trim().min(1),
  itemIds: z.array(z.string().trim().min(1)).max(500).optional(),
}).strict();

export async function POST(req: Request, ctx: { params: Promise<{ id: string; proposalId: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const { id: projectId, proposalId } = await ctx.params;
  const parsed = TransferSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Проверьте параметры переноса", parsed.error.flatten());

  try {
    const result = await prisma.$transaction(async (tx) => {
      const receipt = await tx.projectMutationReceipt.findUnique({
        where: { projectId_actorUserId_mutationId: { projectId, actorUserId: auth.user.id, mutationId: parsed.data.mutationId } },
        select: { result: true },
      });
      if (receipt?.result) return receipt.result;

      const project = await tx.project.findUnique({ where: { id: projectId }, select: { archivedAt: true } });
      if (!project) throw new Error("NOT_FOUND");
      if (project.archivedAt) throw new Error("ARCHIVED");
      const proposal = await tx.projectProposal.findFirst({ where: { id: proposalId, projectId }, select: {
        revision: true, title: true,
        variants: { where: { id: parsed.data.variantId }, select: {
          id: true, title: true, sections: { orderBy: { sortOrder: "asc" }, select: {
            id: true, title: true, items: { orderBy: { sortOrder: "asc" }, select: {
              id: true, selectionRole: true, qty: true, clientUnitPrice: true, internalUnitCost: true, unitLabel: true,
              contractorNameSnapshot: true, offerTitleSnapshot: true, offerDescriptionSnapshot: true,
            } },
          } },
        } },
      } });
      if (!proposal || proposal.variants.length !== 1) throw new Error("NOT_FOUND");
      if (proposal.revision !== parsed.data.expectedProposalRevision) throw new Error("REVISION_CONFLICT");

      const estimate = await tx.projectEstimateVersion.findFirst({
        where: { projectId }, orderBy: [{ isPrimary: "desc" }, { versionNumber: "desc" }],
        select: { id: true, revision: true },
      });
      if (!estimate) throw new Error("NO_ESTIMATE");
      const requestedIds = parsed.data.itemIds ? new Set(parsed.data.itemIds) : null;
      const candidates = proposal.variants[0].sections.flatMap((section) => section.items.map((item) => ({ section, item }))).filter(({ item }) =>
        requestedIds ? requestedIds.has(item.id) : item.selectionRole === "PRIMARY" || item.selectionRole === "OPTIONAL",
      );
      if (requestedIds && candidates.length !== requestedIds.size) throw new Error("INVALID_ITEMS");
      if (candidates.length === 0) throw new Error("NO_ITEMS");

      const existingLinks = await tx.projectProposalEstimateLink.findMany({
        where: { estimateVersionId: estimate.id, proposalItemId: { in: candidates.map(({ item }) => item.id) } },
        select: { proposalItemId: true },
      });
      const linked = new Set(existingLinks.flatMap((entry) => entry.proposalItemId ? [entry.proposalItemId] : []));
      const pending = candidates.filter(({ item }) => !linked.has(item.id));
      let nextSectionOrder = (await tx.projectEstimateSection.aggregate({ where: { versionId: estimate.id }, _max: { sortOrder: true } }))._max.sortOrder ?? -1;
      let transferred = 0;

      for (const proposalSection of proposal.variants[0].sections) {
        const sectionItems = pending.filter(({ section }) => section.id === proposalSection.id).map(({ item }) => item);
        if (sectionItems.length === 0) continue;
        const estimateSectionTitle = `КП · ${proposalSection.title}`;
        let estimateSection = await tx.projectEstimateSection.findFirst({
          where: { versionId: estimate.id, kind: ProjectEstimateSectionKind.CONTRACTOR, title: estimateSectionTitle },
          select: { id: true },
        });
        if (!estimateSection) estimateSection = await tx.projectEstimateSection.create({
          data: { versionId: estimate.id, kind: ProjectEstimateSectionKind.CONTRACTOR, title: estimateSectionTitle, sortOrder: ++nextSectionOrder },
          select: { id: true },
        });
        let nextPosition = (await tx.projectEstimateLine.aggregate({ where: { sectionId: estimateSection.id }, _max: { position: true } }))._max.position ?? -1;
        for (const item of sectionItems) {
          const qty = item.qty;
          const unitPrice = item.clientUnitPrice;
          const line = await tx.projectEstimateLine.create({ data: {
            sectionId: estimateSection.id, position: ++nextPosition, lineNumber: nextPosition + 1,
            name: item.offerTitleSnapshot,
            description: [item.contractorNameSnapshot, item.offerDescriptionSnapshot].filter(Boolean).join(" · ") || null,
            lineType: "CONTRACTOR", qty, unit: item.unitLabel || "усл.", unitPriceClient: unitPrice,
            costClient: unitPrice ? unitPrice.mul(qty) : null,
            costInternal: item.internalUnitCost ? item.internalUnitCost.mul(qty) : null,
          }, select: { id: true } });
          await tx.projectProposalEstimateLink.create({ data: {
            proposalItemId: item.id, estimateVersionId: estimate.id, estimateLineId: line.id,
            sourceProposalRevision: proposal.revision, transferredById: auth.user.id,
            sourceSnapshot: {
              proposalTitle: proposal.title, variantTitle: proposal.variants[0].title, sectionTitle: proposalSection.title,
              itemTitle: item.offerTitleSnapshot, contractor: item.contractorNameSnapshot,
              qty: qty.toString(), clientUnitPrice: unitPrice?.toString() ?? null,
            } as Prisma.InputJsonValue,
          } });
          transferred += 1;
        }
      }

      if (transferred > 0) await tx.projectEstimateVersion.update({ where: { id: estimate.id }, data: { revision: { increment: 1 } } });
      const snapshotData = { proposalId, revision: proposal.revision, variant: proposal.variants[0] };
      const versionNumber = (await tx.projectProposalSnapshot.aggregate({ where: { proposalId }, _max: { versionNumber: true } }))._max.versionNumber ?? 0;
      await tx.projectProposalSnapshot.create({ data: {
        proposalId, versionNumber: versionNumber + 1, reason: ProjectProposalSnapshotReason.MANUAL,
        clientData: snapshotData as unknown as Prisma.InputJsonValue,
        internalSummary: { estimateVersionId: estimate.id, transferred, skipped: candidates.length - transferred } as Prisma.InputJsonValue,
        checksum: createHash("sha256").update(JSON.stringify(snapshotData)).digest("hex"), createdById: auth.user.id,
      } });
      await appendProjectActivityLog(tx, {
        projectId, actorUserId: auth.user.id, kind: ProjectActivityKind.PROJECT_PROPOSAL_TRANSFERRED,
        payload: { proposalId, variantId: parsed.data.variantId, transferred, skipped: candidates.length - transferred } as Prisma.InputJsonValue,
      });
      const mutationResult = { estimateVersionId: estimate.id, estimateRevision: estimate.revision + (transferred > 0 ? 1 : 0), transferred, skipped: candidates.length - transferred };
      await tx.projectMutationReceipt.create({ data: {
        projectId, actorUserId: auth.user.id, mutationId: parsed.data.mutationId,
        kind: "PROJECT_PROPOSAL_TRANSFER", result: mutationResult,
      } });
      return mutationResult;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 20_000 });
    return jsonOk({ result });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return jsonError(404, "Проект или вариант не найден");
    if (error instanceof Error && error.message === "ARCHIVED") return jsonError(400, "Архивный проект только для просмотра");
    if (error instanceof Error && error.message === "NO_ESTIMATE") return jsonError(400, "Сначала создайте смету проекта");
    if (error instanceof Error && error.message === "INVALID_ITEMS") return jsonError(400, "Часть выбранных позиций больше недоступна");
    if (error instanceof Error && error.message === "NO_ITEMS") return jsonError(400, "В варианте нет выбранных позиций");
    if ((error instanceof Error && error.message === "REVISION_CONFLICT") || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")) {
      return jsonError(409, "Концепция изменилась у коллеги. Обновите её перед переносом.");
    }
    throw error;
  }
}

