import {
  Prisma,
  ProjectActivityKind,
  ProjectBall,
  ProjectMode,
  ProjectStatus,
} from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { appendProjectActivityLog } from "@/server/projects/activity-log";
import { buildInitialProjectWidgets } from "@/lib/projects/project-widget-registry";
import { ensureDefaultProjectFolders } from "@/server/projects/project-files";

const ConvertSchema = z.object({
  customerId: z.string().trim().min(1).optional(),
  customerName: z.string().trim().min(2).max(200).optional(),
}).strict().refine((value) => Boolean(value.customerId || value.customerName), {
  message: "Укажите заказчика",
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const parsed = ConvertSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  try {
    const project = await prisma.$transaction(async (tx) => {
      const estimate = await tx.standaloneEstimate.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          leadCustomerName: true,
          ownerUserId: true,
          convertedAt: true,
          convertedProjectId: true,
        },
      });
      if (!estimate) throw new Error("NOT_FOUND");
      if (estimate.convertedAt || estimate.convertedProjectId) throw new Error("ALREADY_CONVERTED");

      let customerId = parsed.data.customerId?.trim() || "";
      if (customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: customerId },
          select: { id: true },
        });
        if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
      } else {
        const name = parsed.data.customerName!.trim();
        const existing = await tx.customer.findFirst({
          where: { name: { equals: name, mode: "insensitive" } },
          select: { id: true },
        });
        customerId = existing?.id ?? (
          await tx.customer.create({
            data: { name },
            select: { id: true },
          })
        ).id;
      }

      const created = await tx.project.create({
        data: {
          title: estimate.title,
          customerId,
          ownerUserId: estimate.ownerUserId,
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
          userId: estimate.ownerUserId,
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

      await tx.projectEstimateVersion.updateMany({
        where: { standaloneEstimateId: estimate.id },
        data: {
          standaloneEstimateId: null,
          projectId: created.id,
          includeInProjectTotals: true,
        },
      });
      await tx.standaloneEstimate.update({
        where: { id: estimate.id },
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
          source: "STANDALONE_ESTIMATE",
          sourceEstimateId: estimate.id,
        } as Prisma.InputJsonValue,
      });
      await appendProjectActivityLog(tx, {
        projectId: created.id,
        actorUserId: auth.user.id,
        kind: ProjectActivityKind.PROJECT_CONVERTED,
        payload: {
          from: "STANDALONE_ESTIMATE",
          sourceEstimateId: estimate.id,
          leadCustomerName: estimate.leadCustomerName,
          customerId,
        } as Prisma.InputJsonValue,
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return jsonOk({ project });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return jsonError(404, "Смета не найдена");
    }
    if (error instanceof Error && error.message === "ALREADY_CONVERTED") {
      return jsonError(409, "Смета уже преобразована в проект");
    }
    if (error instanceof Error && error.message === "CUSTOMER_NOT_FOUND") {
      return jsonError(400, "Заказчик не найден");
    }
    throw error;
  }
}
