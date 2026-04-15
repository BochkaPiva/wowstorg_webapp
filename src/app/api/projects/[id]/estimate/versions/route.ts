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

  let version: { id: string; versionNumber: number; note: string | null; createdAt: Date };
  try {
    version = await prisma.$transaction(async (tx) => {
    const agg = await tx.projectEstimateVersion.aggregate({
      where: { projectId },
      _max: { versionNumber: true },
    });
    const nextNum = (agg._max.versionNumber ?? 0) + 1;

    const v = await tx.projectEstimateVersion.create({
      data: {
        projectId,
        versionNumber: nextNum,
        note: parsed.data.note ?? undefined,
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
      if (!src) {
        throw new Error("SOURCE_VERSION_NOT_FOUND");
      }
      for (const sec of src.sections) {
        const newSec = await tx.projectEstimateSection.create({
          data: {
            versionId: v.id,
            sortOrder: sec.sortOrder,
            title: sec.title,
            kind: sec.kind,
            linkedOrderId: sec.linkedOrderId,
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
        versionId: v.id,
      } as Prisma.InputJsonValue,
    });

      return v;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "SOURCE_VERSION_NOT_FOUND") {
      return jsonError(400, "Исходная версия не найдена");
    }
    throw e;
  }

  scheduleAfterResponse("notifyProjectEstimateVersionCreated", async () => {
    const { notifyProjectNoisyBlock } = await import("@/server/projects/project-notifications");
    await notifyProjectNoisyBlock({
      projectId,
      actorUserId: auth.user.id,
      block: "estimate",
      action: `Создана версия сметы v${version.versionNumber}.`,
    });
  });

  return jsonOk({
    version: {
      id: version.id,
      versionNumber: version.versionNumber,
      note: version.note,
      createdAt: version.createdAt.toISOString(),
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

  const { versionNumber, isPrimary, importOrderIds } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const version = await tx.projectEstimateVersion.findFirst({
        where: { projectId, versionNumber },
        select: { id: true, versionNumber: true, isPrimary: true },
      });
      if (!version) throw new Error("VERSION_NOT_FOUND");

      let importedCount = 0;

      if (isPrimary) {
        await tx.projectEstimateVersion.updateMany({
          where: { projectId, isPrimary: true },
          data: { isPrimary: false },
        });
        await tx.projectEstimateVersion.update({
          where: { id: version.id },
          data: { isPrimary: true },
        });
      }

      if (importOrderIds?.length) {
        const uniqueIds = [...new Set(importOrderIds.map((id) => id.trim()).filter(Boolean))];
        const orders = await tx.order.findMany({
          where: { id: { in: uniqueIds }, projectId },
          select: { id: true },
        });
        if (orders.length !== uniqueIds.length) throw new Error("ORDER_NOT_FOUND");

        for (const orderId of uniqueIds) {
          const existing = await tx.projectEstimateSection.findFirst({
            where: { versionId: version.id, linkedOrderId: orderId },
            select: { id: true },
          });
          if (existing) continue;

          const maxSo = await tx.projectEstimateSection.aggregate({
            where: { versionId: version.id },
            _max: { sortOrder: true },
          });
          const sortOrder = (maxSo._max.sortOrder ?? -1) + 1;
          await seedProjectEstimateFromOrder(tx, {
            projectId,
            orderId,
            actorUserId: auth.user.id,
            targetVersionId: version.id,
            sortOrder,
          });
          importedCount++;
        }
      }

      return { versionNumber: version.versionNumber, importedCount };
    });

    scheduleAfterResponse("notifyProjectEstimatePatched", async () => {
      const { notifyProjectNoisyBlock } = await import("@/server/projects/project-notifications");
      await notifyProjectNoisyBlock({
        projectId,
        actorUserId: auth.user.id,
        block: "estimate",
        action: importOrderIds?.length
          ? `В версию v${result.versionNumber} подтянуты позиции из заявок проекта.`
          : `Обновлена версия сметы v${result.versionNumber}.`,
      });
    });
    return jsonOk(result);
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "VERSION_NOT_FOUND") return jsonError(404, "Версия сметы не найдена");
      if (e.message === "ORDER_NOT_FOUND") return jsonError(400, "Одна или несколько заявок не найдены в проекте");
    }
    return jsonError(
      500,
      importOrderIds?.length ? "Не удалось подтянуть позиции из выбранных заявок" : "Не удалось обновить версию сметы",
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
      const versions = await tx.projectEstimateVersion.findMany({
        where: { projectId },
        orderBy: { versionNumber: "asc" },
        select: { id: true, versionNumber: true, isPrimary: true },
      });
      const target = versions.find((v) => v.versionNumber === parsed.data.versionNumber);
      if (!target) throw new Error("VERSION_NOT_FOUND");
      if (versions.length <= 1) throw new Error("LAST_VERSION");

      await tx.projectEstimateVersion.delete({ where: { id: target.id } });

      if (target.isPrimary) {
        const fallback = [...versions]
          .filter((v) => v.id !== target.id)
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
        action: `Удалена версия сметы v${result.deletedVersionNumber}.`,
      });
    });
    return jsonOk(result);
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "VERSION_NOT_FOUND") return jsonError(404, "Версия сметы не найдена");
      if (e.message === "LAST_VERSION") return jsonError(400, "Нельзя удалить последнюю версию сметы");
    }
    throw e;
  }
}
