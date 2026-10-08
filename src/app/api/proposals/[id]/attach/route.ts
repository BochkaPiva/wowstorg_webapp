import { Prisma, ProjectActivityKind } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { appendProjectActivityLog } from "@/server/projects/activity-log";

const AttachSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    projectId: z.string().trim().min(1),
  })
  .strict();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: proposalId } = await ctx.params;
  const parsed = AttachSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Выберите проект", parsed.error.flatten());

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const [proposal, project] = await Promise.all([
          tx.projectProposal.findUnique({
            where: { id: proposalId },
            select: {
              id: true,
              title: true,
              revision: true,
              projectId: true,
              standaloneProposal: {
                select: { id: true, convertedAt: true, convertedProjectId: true },
              },
            },
          }),
          tx.project.findUnique({
            where: { id: parsed.data.projectId },
            select: { id: true, title: true, archivedAt: true, customerId: true },
          }),
        ]);
        if (!proposal) throw new Error("NOT_FOUND");
        if (proposal.revision !== parsed.data.expectedRevision) throw new Error("REVISION_CONFLICT");
        if (!project) throw new Error("PROJECT_NOT_FOUND");
        if (project.archivedAt) throw new Error("PROJECT_ARCHIVED");
        if (proposal.projectId || !proposal.standaloneProposal) throw new Error("NOT_STANDALONE");
        if (proposal.standaloneProposal.convertedAt || proposal.standaloneProposal.convertedProjectId) {
          throw new Error("ALREADY_CONVERTED");
        }

        const currentProposal = await tx.projectProposal.findFirst({
          where: { projectId: project.id, isCurrent: true },
          select: { id: true },
        });
        if (currentProposal) throw new Error("PROJECT_HAS_PROPOSAL");

        const moved = await tx.projectProposal.updateMany({
          where: {
            id: proposal.id,
            revision: parsed.data.expectedRevision,
            projectId: null,
            standaloneProposalId: proposal.standaloneProposal.id,
          },
          data: {
            projectId: project.id,
            standaloneProposalId: null,
            updatedById: auth.user.id,
            revision: { increment: 1 },
          },
        });
        if (moved.count !== 1) throw new Error("ALREADY_CONVERTED");
        await tx.standaloneProposal.update({
          where: { id: proposal.standaloneProposal.id },
          data: {
            convertedAt: new Date(),
            convertedProjectId: project.id,
            ...(project.customerId ? { customerId: project.customerId, leadCustomerName: null } : {}),
          },
        });
        await appendProjectActivityLog(tx, {
          projectId: project.id,
          actorUserId: auth.user.id,
          kind: ProjectActivityKind.PROJECT_PROPOSAL_CREATED,
          payload: {
            proposalId: proposal.id,
            source: "STANDALONE_PROPOSAL_ATTACH",
            sourceStandaloneProposalId: proposal.standaloneProposal.id,
          } as Prisma.InputJsonValue,
        });
        return { projectId: project.id, projectTitle: project.title, proposalId: proposal.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 15_000 },
    );

    return jsonOk({ result });
  } catch (error) {
    if (error instanceof Error && error.message === "REVISION_CONFLICT") {
      return jsonError(409, "КП изменилось у коллеги. Загрузите актуальные данные перед привязкой");
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return jsonError(404, "КП не найдено");
    }
    if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
      return jsonError(404, "Проект не найден");
    }
    if (error instanceof Error && error.message === "PROJECT_ARCHIVED") {
      return jsonError(409, "Архивный проект только для просмотра");
    }
    if (error instanceof Error && error.message === "NOT_STANDALONE") {
      return jsonError(409, "Это КП уже принадлежит проекту");
    }
    if (error instanceof Error && error.message === "ALREADY_CONVERTED") {
      return jsonError(409, "КП уже преобразовано или прикреплено к проекту");
    }
    if (error instanceof Error && error.message === "PROJECT_HAS_PROPOSAL") {
      return jsonError(409, "В проекте уже есть активное КП. Выберите другой проект — существующее КП не будет заменено");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return jsonError(409, "Проект или КП изменились во время привязки. Повторите действие");
    }
    throw error;
  }
}
