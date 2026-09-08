import { Prisma, ProjectActivityKind } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { appendProjectActivityLog } from "@/server/projects/activity-log";
import { assertProjectEditable } from "@/server/projects/project-guard";
import { buildProjectProposalReadModel } from "@/server/projects/proposal-read-model";

const CreateSchema = z.object({
  title: z.string().trim().min(2).max(200).default("Концепция мероприятия"),
}).strict();

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const { id: projectId } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return jsonError(404, "Проект не найден");
  return jsonOk({ proposal: await buildProjectProposalReadModel(projectId) });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const { id: projectId } = await ctx.params;
  const guard = await assertProjectEditable(projectId);
  if (!guard.ok) return jsonError(guard.status, guard.message);
  const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(400, "Проверьте название", parsed.error.flatten());

  try {
    const proposalId = await prisma.$transaction(async (tx) => {
      const existing = await tx.projectProposal.findFirst({ where: { projectId, isCurrent: true }, select: { id: true } });
      if (existing) throw new Error("ALREADY_EXISTS");
      const proposal = await tx.projectProposal.create({
        data: {
          projectId, title: parsed.data.title, createdById: auth.user.id, updatedById: auth.user.id,
          variants: { create: { title: "Основной вариант", sortOrder: 0, isRecommended: true } },
        },
        select: { id: true },
      });
      await appendProjectActivityLog(tx, {
        projectId, actorUserId: auth.user.id, kind: ProjectActivityKind.PROJECT_PROPOSAL_CREATED,
        payload: { proposalId: proposal.id, title: parsed.data.title } as Prisma.InputJsonValue,
      });
      return proposal.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return jsonOk({ proposal: await buildProjectProposalReadModel(projectId, proposalId) });
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_EXISTS") {
      return jsonError(409, "В проекте уже есть текущая концепция");
    }
    throw error;
  }
}

