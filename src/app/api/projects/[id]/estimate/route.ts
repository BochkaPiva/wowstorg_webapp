import { Prisma, ProjectEstimateSectionKind } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { buildProjectEstimateReadModel } from "@/server/projects/estimate-read-model";
import { assertProjectEditable } from "@/server/projects/project-guard";

export const maxDuration = 60;

const DraftLineInternalExpenseSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    sortOrder: z.number().int().min(0).max(10000),
    title: z.string().trim().max(500).nullable().optional(),
    cost: z.number().finite().nullable().optional(),
    paymentMethod: z.string().trim().max(40).nullable().optional(),
    paymentStatus: z.string().trim().max(120).nullable().optional(),
    contractorNote: z.string().trim().max(5000).nullable().optional(),
    contractorRequisites: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

const DraftLineSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    position: z.number().int().min(0).max(10000),
    lineNumber: z.number().int().min(0).max(9999),
    name: z.string().trim().min(1).max(500),
    description: z.string().trim().max(5000).nullable().optional(),
    lineType: z.string().trim().max(80).optional(),
    costClient: z.number().finite().nullable().optional(),
    costInternal: z.number().finite().nullable().optional(),
    unit: z.string().trim().max(40).nullable().optional(),
    qty: z.number().finite().nullable().optional(),
    unitPriceClient: z.number().finite().nullable().optional(),
    paymentMethod: z.string().trim().max(40).nullable().optional(),
    paymentStatus: z.string().trim().max(120).nullable().optional(),
    contractorNote: z.string().trim().max(5000).nullable().optional(),
    contractorRequisites: z.string().trim().max(500).nullable().optional(),
    itemId: z.string().trim().min(1).nullable().optional(),
    internalExpenses: z.array(DraftLineInternalExpenseSchema).max(100).optional(),
  })
  .strict();

const PatchDraftSchema = z
  .object({
    versionNumber: z.number().int().positive(),
    allowDeleteAllLocalSections: z.boolean().optional(),
    commissionEnabled: z.boolean().optional(),
    clientTaxEnabled: z.boolean().optional(),
    clientChargeTaxEnabled: z.boolean().optional(),
    localSections: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).optional(),
            title: z.string().trim().min(1).max(200),
            sortOrder: z.number().int().min(-10000).max(10000),
            kind: z.enum(["LOCAL", "CONTRACTOR"]).optional(),
            lines: z.array(DraftLineSchema).max(1000),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId } = await ctx.params;
  if (!projectId?.trim()) return jsonError(400, "Invalid id");

  const versionParam = new URL(req.url).searchParams.get("version");
  const versionNumber = versionParam != null ? parseInt(versionParam, 10) : null;
  const model = await buildProjectEstimateReadModel({
    projectId,
    versionNumber: versionNumber != null && !Number.isNaN(versionNumber) ? versionNumber : null,
  });
  if (!model) return jsonError(404, "Проект не найден");
  return jsonOk(model);
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

  const parsed = PatchDraftSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  const {
    versionNumber,
    localSections,
    allowDeleteAllLocalSections,
    commissionEnabled,
    clientTaxEnabled,
    clientChargeTaxEnabled,
  } =
    parsed.data;

  const requestedItemIds = [
    ...new Set(
      localSections.flatMap((section) =>
        section.lines.flatMap((line) => (line.itemId ? [line.itemId] : [])),
      ),
    ),
  ];
  if (requestedItemIds.length > 0) {
    const existingItems = await prisma.item.findMany({
      where: { id: { in: requestedItemIds } },
      select: { id: true },
    });
    if (existingItems.length !== requestedItemIds.length) {
      return jsonError(400, "Одна из позиций каталога больше не существует");
    }
  }

  const version = await prisma.projectEstimateVersion.findFirst({
    where: { projectId, versionNumber },
    select: {
      id: true,
      sections: {
        where: {
          kind: { in: [ProjectEstimateSectionKind.LOCAL, ProjectEstimateSectionKind.CONTRACTOR] },
        },
        select: { id: true },
      },
    },
  });
  if (!version) return jsonError(404, "Версия сметы не найдена");

  if (
    version.sections.length > 0
    && localSections.length === 0
    && !allowDeleteAllLocalSections
  ) {
    return jsonError(400, "Подтвердите удаление всех локальных разделов перед сохранением");
  }

  const draftStats = {
    sections: localSections.length,
    lines: localSections.reduce((total, section) => total + section.lines.length, 0),
    internalExpenses: localSections.reduce(
      (total, section) =>
        total
        + section.lines.reduce(
          (lineTotal, line) => lineTotal + (line.internalExpenses?.length ?? 0),
          0,
        ),
      0,
    ),
  };

  try {
    await prisma.$transaction(async (tx) => {
      // LOCAL/CONTRACTOR sections are an editable draft without external references.
      // Replacing the draft in bulk avoids hundreds of sequential update/delete calls
      // that can exceed Prisma's interactive transaction timeout on large estimates.
      await tx.projectEstimateSection.deleteMany({
        where: {
          versionId: version.id,
          kind: { in: [ProjectEstimateSectionKind.LOCAL, ProjectEstimateSectionKind.CONTRACTOR] },
        },
      });

      for (const section of [...localSections].sort((a, b) => a.sortOrder - b.sortOrder)) {
        await tx.projectEstimateSection.create({
          data: {
            versionId: version.id,
            title: section.title.trim(),
            sortOrder: section.sortOrder,
            kind:
              section.kind === "LOCAL"
                ? ProjectEstimateSectionKind.LOCAL
                : ProjectEstimateSectionKind.CONTRACTOR,
            lines: {
              create: [...section.lines].sort((a, b) => a.position - b.position).map((line) => ({
                position: line.position,
                lineNumber: line.lineNumber,
                name: line.name.trim(),
                description: line.description?.trim() || null,
                lineType: line.lineType?.trim() || "OTHER",
                costClient: line.costClient == null ? null : new Prisma.Decimal(line.costClient),
                costInternal: line.costInternal == null ? null : new Prisma.Decimal(line.costInternal),
                unit: line.unit?.trim() || null,
                qty: line.qty == null ? null : new Prisma.Decimal(line.qty),
                unitPriceClient:
                  line.unitPriceClient == null ? null : new Prisma.Decimal(line.unitPriceClient),
                paymentMethod: line.paymentMethod?.trim() || null,
                paymentStatus: line.paymentStatus?.trim() || null,
                contractorNote: line.contractorNote?.trim() || null,
                contractorRequisites: line.contractorRequisites?.trim() || null,
                itemId: line.itemId ?? null,
                internalExpenses: {
                  create: [...(line.internalExpenses ?? [])]
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((expense) => ({
                      sortOrder: expense.sortOrder,
                      title: expense.title?.trim() || null,
                      cost: expense.cost == null ? null : new Prisma.Decimal(expense.cost),
                      paymentMethod: expense.paymentMethod?.trim() || null,
                      paymentStatus: expense.paymentStatus?.trim() || null,
                      contractorNote: expense.contractorNote?.trim() || null,
                      contractorRequisites: expense.contractorRequisites?.trim() || null,
                    })),
                },
              })),
            },
          },
        });
      }

      if (
        commissionEnabled !== undefined ||
        clientTaxEnabled !== undefined ||
        clientChargeTaxEnabled !== undefined
      ) {
        await tx.projectEstimateVersion.update({
          where: { id: version.id },
          data: {
            ...(commissionEnabled !== undefined ? { commissionEnabled } : {}),
            ...(clientTaxEnabled !== undefined ? { clientTaxEnabled } : {}),
            ...(clientChargeTaxEnabled !== undefined ? { clientChargeTaxEnabled } : {}),
          },
        });
      }
    }, { maxWait: 5_000, timeout: 45_000 });
  } catch (e) {
    console.error("Failed to save project estimate draft", {
      projectId,
      versionNumber,
      ...draftStats,
      error: e,
    });
    if (
      e instanceof Prisma.PrismaClientKnownRequestError
      && (e.code === "P2024" || e.code === "P2028")
    ) {
      return jsonError(
        503,
        "Смета слишком большая для быстрого сохранения. Повторите попытку — черновик остался в браузере.",
      );
    }
    return jsonError(500, "Не удалось сохранить смету. Черновик остался в браузере, повторите попытку.");
  }
  scheduleAfterResponse("notifyProjectEstimateDraftSaved", async () => {
    const { notifyProjectNoisyBlock } = await import("@/server/projects/project-notifications");
    await notifyProjectNoisyBlock({
      projectId,
      actorUserId: auth.user.id,
      block: "estimate",
      action: `Сохранён черновик локальных разделов сметы v${versionNumber}.`,
    });
  });

  return jsonOk({ ok: true });
}
