import {
  ContractorOfferPriceType,
  Prisma,
  ProjectProposalItemKind,
  ProjectProposalSelectionRole,
} from "@prisma/client";
import { z } from "zod";
import { proposalTotals } from "@/lib/proposals";

import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { buildProposalReadModel } from "@/server/projects/proposal-read-model";

const CreateSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    customerId: z.string().trim().min(1).optional(),
    customerName: z.string().trim().min(2).max(200).optional(),
    seedOfferId: z.string().trim().min(1).optional(),
  })
  .strict();

const ScopeSchema = z.enum(["all", "standalone", "project"]);

export async function GET(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsedScope = ScopeSchema.safeParse(url.searchParams.get("scope") ?? "all");
  if (!parsedScope.success) return jsonError(400, "Неизвестный тип КП");
  const scope = parsedScope.data;

  const proposals = await prisma.projectProposal.findMany({
    where: {
      status: { not: "ARCHIVED" },
      ...(scope === "standalone"
        ? { standaloneProposal: { convertedAt: null } }
        : scope === "project"
          ? { projectId: { not: null } }
          : {
              OR: [
                { projectId: { not: null } },
                { standaloneProposal: { convertedAt: null } },
              ],
            }),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      title: true,
      status: true,
      revision: true,
      updatedAt: true,
      createdAt: true,
      project: { select: { id: true, title: true, archivedAt: true } },
      standaloneProposal: {
        select: {
          id: true,
          leadCustomerName: true,
          convertedAt: true,
          customer: { select: { id: true, name: true } },
          owner: { select: { id: true, displayName: true } },
        },
      },
      variants: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          isRecommended: true,
          sections: {
            select: {
              id: true,
              items: {
                select: {
                  selectionRole: true,
                  qty: true,
                  clientUnitPrice: true,
                  internalUnitCost: true,
                  priceTypeSnapshot: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const items = proposals.map((proposal) => {
    const variant = proposal.variants.find((entry) => entry.isRecommended) ?? proposal.variants[0];
    const entries = variant?.sections.flatMap((section) => section.items) ?? [];
    const totals = proposalTotals(entries.map((item) => ({ ...item,
      qty: item.qty.toNumber(), clientUnitPrice: item.clientUnitPrice?.toNumber() ?? null,
      internalUnitCost: item.internalUnitCost?.toNumber() ?? null,
    })));
    const knownTotal = totals.client;
    const unresolvedCount = totals.unresolved;
    const sectionCount = variant?.sections.length ?? 0;
    const itemCount = entries.length;
    return {
      id: proposal.id,
      title: proposal.title,
      status: proposal.status,
      revision: proposal.revision,
      createdAt: proposal.createdAt.toISOString(),
      updatedAt: proposal.updatedAt.toISOString(),
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
              customer: proposal.standaloneProposal.customer,
              leadCustomerName: proposal.standaloneProposal.leadCustomerName,
              owner: proposal.standaloneProposal.owner,
            }
          : null,
      summary: { knownTotal, unresolvedCount, sectionCount, itemCount, preliminary: totals.preliminary, variantCount: proposal.variants.length },
    };
  });

  return jsonOk({ proposals: items });
}

export async function POST(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Проверьте данные КП", parsed.error.flatten());

  try {
    const proposalId = await prisma.$transaction(
      async (tx) => {
        const customerId = parsed.data.customerId?.trim() || null;
        if (customerId) {
          const customer = await tx.customer.findFirst({
            where: { id: customerId, mergedIntoId: null },
            select: { id: true },
          });
          if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
        }

        const seedOffer = parsed.data.seedOfferId
          ? await tx.contractorOffer.findFirst({
              where: {
                id: parsed.data.seedOfferId,
                isActive: true,
                contractor: { isActive: true },
              },
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
                category: { select: { id: true, name: true } },
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
            })
          : null;
        if (parsed.data.seedOfferId && !seedOffer) throw new Error("OFFER_NOT_FOUND");

        const standalone = await tx.standaloneProposal.create({
          data: {
            title: parsed.data.title,
            customerId,
            leadCustomerName: customerId ? null : parsed.data.customerName?.trim() || null,
            ownerUserId: auth.user.id,
          },
          select: { id: true },
        });
        const proposal = await tx.projectProposal.create({
          data: {
            standaloneProposalId: standalone.id,
            title: parsed.data.title,
            createdById: auth.user.id,
            updatedById: auth.user.id,
            variants: {
              create: { title: "Основной вариант", sortOrder: 0, isRecommended: true },
            },
          },
          select: { id: true, variants: { select: { id: true }, take: 1 } },
        });

        if (seedOffer) {
          const section = await tx.projectProposalSection.create({
            data: {
              variantId: proposal.variants[0].id,
              categoryId: seedOffer.category.id,
              categoryNameSnapshot: seedOffer.category.name,
              title: seedOffer.category.name,
              sortOrder: 0,
            },
            select: { id: true },
          });
          await tx.projectProposalItem.create({
            data: {
              sectionId: section.id,
              contractorId: seedOffer.contractor.id,
              offerId: seedOffer.id,
              kind: ProjectProposalItemKind.CATALOG,
              selectionRole: ProjectProposalSelectionRole.PRIMARY,
              sortOrder: 0,
              qty: new Prisma.Decimal(1),
              clientUnitPrice: seedOffer.clientPrice,
              internalUnitCost: seedOffer.internalCost,
              unitLabel: seedOffer.unitLabel,
              contractorNameSnapshot: seedOffer.contractor.name,
              offerTitleSnapshot: seedOffer.title,
              offerDescriptionSnapshot: seedOffer.description,
              priceTypeSnapshot: seedOffer.priceType,
              currencyCodeSnapshot: seedOffer.currencyCode,
              sourcePriceConfirmedAt: seedOffer.priceConfirmedAt,
              sourceOfferRevision: seedOffer.revision,
              assetSnapshot: seedOffer.contractor.assets.length
                ? (seedOffer.contractor.assets.map((asset) => ({
                    id: asset.id,
                    url: `/api/contractors/${seedOffer.contractor.id}/assets/${asset.id}`,
                    caption: asset.caption,
                    focalX: asset.focalX?.toString() ?? null,
                    focalY: asset.focalY?.toString() ?? null,
                  })) as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            },
          });
        }
        return proposal.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 15_000 },
    );

    return jsonOk({ proposal: await buildProposalReadModel(proposalId) });
  } catch (error) {
    if (error instanceof Error && error.message === "CUSTOMER_NOT_FOUND") {
      return jsonError(400, "Заказчик не найден");
    }
    if (error instanceof Error && error.message === "OFFER_NOT_FOUND") {
      return jsonError(400, "Предложение подрядчика больше недоступно");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return jsonError(409, "Данные изменились во время создания КП. Повторите действие");
    }
    throw error;
  }
}
