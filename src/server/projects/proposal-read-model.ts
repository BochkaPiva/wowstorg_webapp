import { prisma } from "@/server/db";

export async function buildProjectProposalReadModel(projectId: string, proposalId?: string) {
  const proposal = await prisma.projectProposal.findFirst({
    where: { projectId, ...(proposalId ? { id: proposalId } : { isCurrent: true }) },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, title: true, status: true, revision: true, isCurrent: true,
      clientIntro: true, clientOutro: true, expiresAt: true, createdAt: true, updatedAt: true,
      variants: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: {
        id: true, title: true, description: true, sortOrder: true, isRecommended: true,
        sections: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: {
          id: true, title: true, description: true, sortOrder: true,
          category: { select: { id: true, name: true } },
          items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: {
            id: true, kind: true, selectionRole: true, sortOrder: true, qty: true,
            clientUnitPrice: true, internalUnitCost: true, unitLabel: true,
            clientNote: true, internalNote: true, contractorNameSnapshot: true,
            offerTitleSnapshot: true, offerDescriptionSnapshot: true, priceTypeSnapshot: true,
            currencyCodeSnapshot: true, sourcePriceConfirmedAt: true, sourceOfferRevision: true,
            contractorId: true, offerId: true, assetSnapshot: true,
          } },
        } },
      } },
    },
  });
  if (!proposal) return null;

  return {
    ...proposal,
    variants: proposal.variants.map((variant) => ({
      ...variant,
      sections: variant.sections.map((section) => ({
        ...section,
        items: section.items.map((item) => ({
          ...item,
          qty: item.qty.toNumber(),
          clientUnitPrice: item.clientUnitPrice?.toNumber() ?? null,
          internalUnitCost: item.internalUnitCost?.toNumber() ?? null,
        })),
      })),
    })),
  };
}

