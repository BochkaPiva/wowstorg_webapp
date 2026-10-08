import {
  Prisma,
  ProjectActivityKind,
  ProjectBall,
  ProjectMode,
  ProjectStatus,
} from "@prisma/client";
import { z } from "zod";

import { buildInitialProjectWidgets } from "@/lib/projects/project-widget-registry";
import { requireRole } from "@/server/auth/require";
import { findOrCreateCustomerByIdentity } from "@/server/customers/identity";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { appendProjectActivityLog } from "@/server/projects/activity-log";
import { ensureDefaultProjectFolders } from "@/server/projects/project-files";

const ConvertSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    customerId: z.string().trim().min(1).optional(),
    customerName: z.string().trim().min(2).max(200).optional(),
    projectTitle: z.string().trim().min(2).max(300).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.customerId || value.customerName), {
    message: "Укажите заказчика",
  });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: proposalId } = await ctx.params;
  const parsed = ConvertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Проверьте параметры проекта", parsed.error.flatten());

  try {
    const project = await prisma.$transaction(
      async (tx) => {
        const proposal = await tx.projectProposal.findUnique({
          where: { id: proposalId },
          select: {
            id: true,
            title: true,
            revision: true,
            projectId: true,
            standaloneProposal: {
              select: {
                id: true,
                title: true,
                ownerUserId: true,
                leadCustomerName: true,
                convertedAt: true,
                convertedProjectId: true,
              },
            },
          },
        });
        if (!proposal) throw new Error("NOT_FOUND");
        if (proposal.revision !== parsed.data.expectedRevision) throw new Error("REVISION_CONFLICT");
        if (proposal.projectId || !proposal.standaloneProposal) throw new Error("NOT_STANDALONE");
        const standalone = proposal.standaloneProposal;
        if (standalone.convertedAt || standalone.convertedProjectId) throw new Error("ALREADY_CONVERTED");

        let customerId = parsed.data.customerId?.trim() || "";
        if (customerId) {
          const customer = await tx.customer.findFirst({
            where: { id: customerId, mergedIntoId: null },
            select: { id: true },
          });
          if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
        } else {
          customerId = (await findOrCreateCustomerByIdentity(tx, parsed.data.customerName!.trim())).id;
        }

        const created = await tx.project.create({
          data: {
            title: parsed.data.projectTitle?.trim() || standalone.title || proposal.title,
            customerId,
            ownerUserId: standalone.ownerUserId,
            createdByUserId: auth.user.id,
            mode: ProjectMode.FULL,
            status: ProjectStatus.LEAD,
            ball: ProjectBall.CLIENT,
          },
          select: {
            id: true,
            title: true,
            status: true,
            ball: true,
            customer: { select: { id: true, name: true } },
          },
        });
        await tx.projectMember.create({
          data: {
            projectId: created.id,
            userId: standalone.ownerUserId,
            role: "OWNER",
            addedById: auth.user.id,
          },
        });
        await tx.projectWidget.createMany({
          data: buildInitialProjectWidgets().map((widget) => ({
            ...widget,
            projectId: created.id,
            createdById: auth.user.id,
            updatedById: auth.user.id,
          })),
        });

        const moved = await tx.projectProposal.updateMany({
          where: {
            id: proposal.id,
            revision: parsed.data.expectedRevision,
            projectId: null,
            standaloneProposalId: standalone.id,
          },
          data: {
            projectId: created.id,
            standaloneProposalId: null,
            updatedById: auth.user.id,
            revision: { increment: 1 },
          },
        });
        if (moved.count !== 1) throw new Error("ALREADY_CONVERTED");

        await tx.standaloneProposal.update({
          where: { id: standalone.id },
          data: {
            convertedAt: new Date(),
            convertedProjectId: created.id,
            customerId,
            leadCustomerName: null,
          },
        });
        await ensureDefaultProjectFolders(tx, created.id);
        await appendProjectActivityLog(tx, {
          projectId: created.id,
          actorUserId: auth.user.id,
          kind: ProjectActivityKind.PROJECT_CREATED,
          payload: {
            title: created.title,
            source: "STANDALONE_PROPOSAL",
            sourceStandaloneProposalId: standalone.id,
          } as Prisma.InputJsonValue,
        });
        await appendProjectActivityLog(tx, {
          projectId: created.id,
          actorUserId: auth.user.id,
          kind: ProjectActivityKind.PROJECT_PROPOSAL_CREATED,
          payload: {
            proposalId: proposal.id,
            source: "STANDALONE_PROPOSAL",
            sourceStandaloneProposalId: standalone.id,
          } as Prisma.InputJsonValue,
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 15_000 },
    );

    return jsonOk({ project });
  } catch (error) {
    if (error instanceof Error && error.message === "REVISION_CONFLICT") {
      return jsonError(409, "КП изменилось у коллеги. Загрузите актуальные данные перед созданием проекта");
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return jsonError(404, "КП не найдено");
    }
    if (error instanceof Error && error.message === "NOT_STANDALONE") {
      return jsonError(409, "Это КП уже принадлежит проекту");
    }
    if (error instanceof Error && error.message === "ALREADY_CONVERTED") {
      return jsonError(409, "КП уже преобразовано или прикреплено к проекту");
    }
    if (error instanceof Error && error.message === "CUSTOMER_NOT_FOUND") {
      return jsonError(400, "Заказчик не найден");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return jsonError(409, "КП изменилось во время создания проекта. Повторите действие");
    }
    throw error;
  }
}
