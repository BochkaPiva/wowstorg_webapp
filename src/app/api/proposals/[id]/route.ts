import { Prisma, ProjectActivityKind, ProjectProposalStatus } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { buildProposalReadModel } from "@/server/projects/proposal-read-model";
import { appendProjectActivityLog } from "@/server/projects/activity-log";

const PatchSchema = z
  .object({
    expectedRevision: z.number().int().min(0),
    title: z.string().trim().min(2).max(200).optional(),
    status: z.nativeEnum(ProjectProposalStatus).optional(),
    clientIntro: z.string().trim().max(4000).nullable().optional(),
    clientOutro: z.string().trim().max(4000).nullable().optional(),
    customerId: z.string().trim().min(1).nullable().optional(),
    customerName: z.string().trim().min(2).max(200).nullable().optional(),
  })
  .strict();

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const proposal = await buildProposalReadModel(id);
  if (!proposal) return jsonError(404, "КП не найдено");
  return jsonOk({ proposal });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Проверьте изменение КП", parsed.error.flatten());

  try {
    await prisma.$transaction(
      async (tx) => {
        const current = await tx.projectProposal.findUnique({
          where: { id },
          select: {
            revision: true,
            projectId: true,
            project: { select: { archivedAt: true } },
            standaloneProposal: {
              select: { id: true, convertedAt: true, customerId: true },
            },
          },
        });
        if (!current) throw new Error("NOT_FOUND");
        if (current.project?.archivedAt) throw new Error("READ_ONLY");
        if (current.standaloneProposal?.convertedAt) throw new Error("READ_ONLY");
        if (current.revision !== parsed.data.expectedRevision) throw new Error("REVISION_CONFLICT");

        let customerId: string | null | undefined;
        if (parsed.data.customerId !== undefined) {
          customerId = parsed.data.customerId?.trim() || null;
          if (customerId) {
            const customer = await tx.customer.findFirst({
              where: { id: customerId, mergedIntoId: null },
              select: { id: true },
            });
            if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
          }
        }

        if (
          !current.standaloneProposal &&
          (parsed.data.customerId !== undefined || parsed.data.customerName !== undefined)
        ) {
          throw new Error("CUSTOMER_ONLY_STANDALONE");
        }

        const updated = await tx.projectProposal.updateMany({
          where: { id, revision: parsed.data.expectedRevision },
          data: {
            title: parsed.data.title,
            status: parsed.data.status,
            clientIntro: parsed.data.clientIntro,
            clientOutro: parsed.data.clientOutro,
            updatedById: auth.user.id,
            revision: { increment: 1 },
          },
        });
        if (updated.count !== 1) throw new Error("REVISION_CONFLICT");

        if (current.standaloneProposal) {
          await tx.standaloneProposal.update({
            where: { id: current.standaloneProposal.id },
            data: {
              title: parsed.data.title,
              ...(customerId !== undefined
                ? {
                    customerId,
                    leadCustomerName: customerId
                      ? null
                      : parsed.data.customerName?.trim() || null,
                  }
                : parsed.data.customerName !== undefined
                  ? { leadCustomerName: parsed.data.customerName?.trim() || null }
                  : {}),
            },
          });
        }
        if (current.projectId) {
          await appendProjectActivityLog(tx, {
            projectId: current.projectId,
            actorUserId: auth.user.id,
            kind: ProjectActivityKind.PROJECT_PROPOSAL_UPDATED,
            payload: { proposalId: id, action: "UPDATE_METADATA" },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 15_000 },
    );

    return jsonOk({ proposal: await buildProposalReadModel(id) });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return jsonError(404, "КП не найдено");
    }
    if (error instanceof Error && error.message === "READ_ONLY") {
      return jsonError(409, "Это КП уже преобразовано или находится в архивном проекте");
    }
    if (error instanceof Error && error.message === "CUSTOMER_NOT_FOUND") {
      return jsonError(400, "Заказчик не найден");
    }
    if (error instanceof Error && error.message === "CUSTOMER_ONLY_STANDALONE") {
      return jsonError(400, "Заказчик проектного КП изменяется в карточке проекта");
    }
    if (
      (error instanceof Error && error.message === "REVISION_CONFLICT") ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
    ) {
      return jsonError(409, "КП уже изменилось у коллеги. Обновите данные — его работа не будет перезаписана");
    }
    throw error;
  }
}
