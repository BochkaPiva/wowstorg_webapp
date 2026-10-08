import type { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";

const proposalSelect = {
  id: true,
  projectId: true,
  standaloneProposalId: true,
  title: true,
  status: true,
  revision: true,
  isCurrent: true,
  clientIntro: true,
  clientOutro: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  project: {
    select: { id: true, title: true, archivedAt: true },
  },
  standaloneProposal: {
    select: {
      id: true,
      title: true,
      leadCustomerName: true,
      convertedAt: true,
      convertedProjectId: true,
      customer: { select: { id: true, name: true } },
      owner: { select: { id: true, displayName: true } },
    },
  },
  variants: {
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      description: true,
      sortOrder: true,
      isRecommended: true,
      sections: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          title: true,
          description: true,
          sortOrder: true,
          category: { select: { id: true, name: true } },
          items: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              kind: true,
              selectionRole: true,
              sortOrder: true,
              qty: true,
              clientUnitPrice: true,
              internalUnitCost: true,
              unitLabel: true,
              clientNote: true,
              internalNote: true,
              contractorNameSnapshot: true,
              offerTitleSnapshot: true,
              offerDescriptionSnapshot: true,
              priceTypeSnapshot: true,
              currencyCodeSnapshot: true,
              sourcePriceConfirmedAt: true,
              sourceOfferRevision: true,
              contractorId: true,
              offerId: true,
              assetSnapshot: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ProjectProposalSelect;

async function loadProposal(where: Prisma.ProjectProposalWhereInput) {
  const proposal = await prisma.projectProposal.findFirst({
    where,
    orderBy: { updatedAt: "desc" },
    select: proposalSelect,
  });
  if (!proposal) return null;

  return {
    ...proposal,
    owner: proposal.project
      ? {
          type: "PROJECT" as const,
          projectId: proposal.project.id,
          title: proposal.project.title,
          archivedAt: proposal.project.archivedAt?.toISOString() ?? null,
        }
      : proposal.standaloneProposal
        ? {
            type: "STANDALONE" as const,
            standaloneProposalId: proposal.standaloneProposal.id,
            title: proposal.standaloneProposal.title,
            leadCustomerName: proposal.standaloneProposal.leadCustomerName,
            convertedAt: proposal.standaloneProposal.convertedAt?.toISOString() ?? null,
            convertedProjectId: proposal.standaloneProposal.convertedProjectId,
            customer: proposal.standaloneProposal.customer,
            owner: proposal.standaloneProposal.owner,
          }
        : null,
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

export async function buildProposalReadModel(proposalId: string) {
  return loadProposal({ id: proposalId });
}

export async function buildProjectProposalReadModel(projectId: string, proposalId?: string) {
  return loadProposal({
    projectId,
    ...(proposalId ? { id: proposalId } : { isCurrent: true }),
  });
}

export async function buildStandaloneProposalReadModel(standaloneProposalId: string) {
  return loadProposal({ standaloneProposalId });
}
