import { type Prisma, ProjectActivityKind } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { appendProjectActivityLog } from "@/server/projects/activity-log";
import { assertProjectEditable } from "@/server/projects/project-guard";
import { seedProjectEstimateFromOrder } from "@/server/projects/seed-estimate-from-order";

const PostSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    note: z.string().trim().max(500).optional().nullable(),
    duplicateFromVersionNumber: z.number().int().positive().optional(),
  })
  .strict();

const DeleteSchema = z
  .object({
    versionNumber: z.number().int().positive(),
  })
  .strict();

const PatchSchema = z
  .object({
    versionNumber: z.number().int().positive(),
    isPrimary: z.literal(true).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    includeInProjectTotals: z.boolean().optional(),
    importOrderIds: z.array(z.string().trim().min(1)).max(50).optional(),
  })
  .strict();

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId } = await ctx.params;
  if (!projectId?.trim()) return jsonError(400, "Invalid id");

  const guard = await assertProjectEditable(projectId);
  if (!guard.ok) return jsonError(guard.status, guard.message);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  let estimate: { id: string; versionNumber: number; title: string | null; note: string | null; createdAt: Date };
  try {
    estimate = await prisma.$transaction(async (tx) => {
      const agg = await tx.projectEstimateVersion.aggregate({
        where: { projectId },
        _max: { versionNumber: true, sortOrder: true },
      });
      const nextNum = (agg._max.versionNumber ?? 0) + 1;
      const title = parsed.data.title?.trim() || parsed.data.note?.trim() || `Смета ${nextNum}`;

      const created = await tx.projectEstimateVersion.create({
        data: {
          projectId,
          versionNumber: nextNum,
          title,
          note: parsed.data.note ?? null,
          sortOrder: (agg._max.sortOrder ?? -1) + 1,
          createdById: auth.user.id,
          isPrimary: agg._max.versionNumber == null,
        },
      });

      if (parsed.data.duplicateFromVersionNumber != null) {
        const src = await tx.projectEstimateVersion.findFirst({
          where: { projectId, versionNumber: parsed.data.duplicateFromVersionNumber },
          include: {
            sections: {
              orderBy: { sortOrder: "asc" },
              include: { lines: { orderBy: { position: "asc" } } },
            },
          },
        });
        if (!src) throw new Error("SOURCE_ESTIMATE_NOT_FOUND");

        await tx.projectEstimateVersion.update({
          where: { id: created.id },
          data: {
            commissionEnabled: src.commissionEnabled,
            clientTaxEnabled: src.clientTaxEnabled,
          },
        });

        for (const sec of src.sections) {
          if (sec.kind !== "CONTRACTOR" && sec.kind !== "LOCAL") continue;
          const newSec = await tx.projectEstimateSection.create({
            data: {
              versionId: created.id,
              sortOrder: sec.sortOrder,
              title: sec.title,
              kind: sec.kind,
              lineLocalExtras: sec.lineLocalExtras ?? undefined,
            },
          });
          for (const ln of sec.lines) {
            await tx.projectEstimateLine.create({
              data: {
                sectionId: newSec.id,
                position: ln.position,
                lineNumber: ln.lineNumber,
                name: ln.name,
                description: ln.description,
                lineType: ln.lineType,
                costClient: ln.costClient ?? undefined,
                costInternal: ln.costInternal ?? undefined,
                unit: ln.unit ?? undefined,
                qty: ln.qty ?? undefined,
                unitPriceClient: ln.unitPriceClient ?? undefined,
                paymentMethod: ln.paymentMethod ?? undefined,
                paymentStatus: ln.paymentStatus ?? undefined,
                contractorNote: ln.contractorNote ?? undefined,
                contractorRequisites: ln.contractorRequisites ?? undefined,
                orderLineId: ln.orderLineId ?? undefined,
                itemId: ln.itemId ?? undefined,
              },
            });
          }
        }
      }

      await appendProjectActivityLog(tx, {
        projectId,
        actorUserId: auth.user.id,
        kind: ProjectActivityKind.PROJECT_ESTIMATE_VERSION_CREATED,
        payload: {
          versionNumber: nextNum,
          versionId: created.id,
          title,
        } as Prisma.InputJsonValue,
      });

      return created;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "SOURCE_ESTIMATE_NOT_FOUND") {
      return jsonError(400, "Исходная смета не найдена");
    }
    throw e;
  }

  scheduleAfterResponse("notifyProjectEstimateCreated", async () => {
    const { notifyProjectNoisyBlock } = await import("@/server/projects/project-notifications");
    await notifyProjectNoisyBlock({
      projectId,
      actorUserId: auth.user.id,
      block: "estimate",
      action: `Создана смета «${estimate.title?.trim() || `Смета ${estimate.versionNumber}`}».`,
    });
  });

  return jsonOk({
    version: {
      id: estimate.id,
      versionNumber: estimate.versionNumber,
      title: estimate.title,
      note: estimate.note,
      createdAt: estimate.createdAt.toISOString(),
    },
  });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId } = await ctx.params;
  if (!projectId?.trim()) return jsonError(400, "Invalid id");

  const guard = await assertProjectEditable(projectId);
  if (!guard.ok) return jsonError(guard.status, guard.message);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  const { versionNumber, isPrimary, title, includeInProjectTotals, importOrderIds } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const estimate = await tx.projectEstimateVersion.findFirst({
        where: { projectId, versionNumber },
        select: { id: true, versionNumber: true, isPrimary: true },
      });
      if (!estimate) throw new Error("ESTIMATE_NOT_FOUND");

      let importedCount = 0;

      if (isPrimary) {
        await tx.projectEstimateVersion.updateMany({
          where: { projectId, isPrimary: true },
          data: { isPrimary: false },
        });
        await tx.projectEstimateVersion.update({
          where: { id: estimate.id },
          data: { isPrimary: true },
        });
      }

      if (title !== undefined || includeInProjectTotals !== undefined) {
        await tx.projectEstimateVersion.update({
          where: { id: estimate.id },
          data: {
            ...(title !== undefined ? { title: title.trim() } : {}),
            ...(includeInProjectTotals !== undefined ? { includeInProjectTotals } : {}),
          },
        });
      }

      if (importOrderIds?.length) {
        const uniqueIds = [...new Set(importOrderIds.map((id) => id.trim()).filter(Boolean))];
        const orders = await tx.order.findMany({
          where: { id: { in: uniqueIds }, projectId },
          select: { id: true, status: true },
        });
        if (orders.length !== uniqueIds.length) throw new Error("ORDER_NOT_FOUND");
        if (orders.some((order) => order.status === "CANCELLED")) throw new Error("CANCELLED_ORDER");

        for (const orderId of uniqueIds) {
          const existing = await tx.projectEstimateSection.findFirst({
            where: { linkedOrderId: orderId, version: { projectId } },
            select: { id: true, versionId: true },
          });
          if (existing) {
            if (existing.versionId === estimate.id) continue;
            throw new Error("ORDER_ALREADY_IN_ESTIMATE");
          }

          const maxSo = await tx.projectEstimateSection.aggregate({
            where: { versionId: estimate.id },
            _max: { sortOrder: true },
          });
          await seedProjectEstimateFromOrder(tx, {
            projectId,
            orderId,
            actorUserId: auth.user.id,
            targetVersionId: estimate.id,
            sortOrder: (maxSo._max.sortOrder ?? -1) + 1,
          });
          importedCount++;
        }
      }

      return { versionNumber: estimate.versionNumber, importedCount };
    });

    scheduleAfterResponse("notifyProjectEstimatePatched", async () => {
      const { notifyProjectNoisyBlock } = await import("@/server/projects/project-notifications");
      await notifyProjectNoisyBlock({
        projectId,
        actorUserId: auth.user.id,
        block: "estimate",
        action: importOrderIds?.length
          ? `В смету добавлены заявки проекта.`
          : `Обновлена смета проекта.`,
      });
    });
    return jsonOk(result);
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "ESTIMATE_NOT_FOUND") return jsonError(404, "Смета не найдена");
      if (e.message === "ORDER_NOT_FOUND") return jsonError(400, "Одна или несколько заявок не найдены в проекте");
      if (e.message === "ORDER_ALREADY_IN_ESTIMATE") return jsonError(400, "Одна из заявок уже добавлена в другую смету проекта");
      if (e.message === "CANCELLED_ORDER") return jsonError(400, "Отменённые заявки нельзя добавлять в смету");
    }
    return jsonError(
      500,
      importOrderIds?.length ? "Не удалось добавить выбранные заявки в смету" : "Не удалось обновить смету",
    );
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId } = await ctx.params;
  if (!projectId?.trim()) return jsonError(400, "Invalid id");

  const guard = await assertProjectEditable(projectId);
  if (!guard.ok) return jsonError(guard.status, guard.message);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const estimates = await tx.projectEstimateVersion.findMany({
        where: { projectId },
        orderBy: { versionNumber: "asc" },
        select: {
          id: true,
          versionNumber: true,
          isPrimary: true,
          sections: { select: { id: true, linkedOrderId: true, kind: true } },
        },
      });
      const target = estimates.find((v) => v.versionNumber === parsed.data.versionNumber);
      if (!target) throw new Error("ESTIMATE_NOT_FOUND");
      if (estimates.length <= 1) throw new Error("LAST_ESTIMATE");
      if (target.sections.some((section) => section.linkedOrderId || section.kind === "REQUISITE")) {
        throw new Error("ESTIMATE_HAS_ORDERS");
      }

      await tx.projectEstimateVersion.delete({ where: { id: target.id } });

      if (target.isPrimary) {
        const fallback = [...estimates]
          .filter((estimate) => estimate.id !== target.id)
          .sort((a, b) => b.versionNumber - a.versionNumber)[0];
        if (fallback) {
          await tx.projectEstimateVersion.update({
            where: { id: fallback.id },
            data: { isPrimary: true },
          });
        }
      }

      return { deletedVersionNumber: target.versionNumber };
    });

    scheduleAfterResponse("notifyProjectEstimateDeleted", async () => {
      const { notifyProjectNoisyBlock } = await import("@/server/projects/project-notifications");
      await notifyProjectNoisyBlock({
        projectId,
        actorUserId: auth.user.id,
        block: "estimate",
        action: `Удалена смета проекта.`,
      });
    });
    return jsonOk(result);
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "ESTIMATE_NOT_FOUND") return jsonError(404, "Смета не найдена");
      if (e.message === "LAST_ESTIMATE") return jsonError(400, "Нельзя удалить последнюю смету проекта");
      if (e.message === "ESTIMATE_HAS_ORDERS") return jsonError(400, "Сначала уберите заявки из этой сметы");
    }
    throw e;
  }
}
