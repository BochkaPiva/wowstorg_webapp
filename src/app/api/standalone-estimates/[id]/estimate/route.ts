import { Prisma, ProjectEstimateSectionKind } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { buildStandaloneEstimateReadModel } from "@/server/standalone-estimates/read-model";

const InternalExpenseSchema = z.object({
  id: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().min(0).max(10000),
  title: z.string().trim().max(500).nullable().optional(),
  cost: z.number().finite().nullable().optional(),
  paymentMethod: z.string().trim().max(40).nullable().optional(),
  paymentStatus: z.string().trim().max(120).nullable().optional(),
  contractorNote: z.string().trim().max(5000).nullable().optional(),
  contractorRequisites: z.string().trim().max(500).nullable().optional(),
}).strict();

const LineSchema = z.object({
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
  internalExpenses: z.array(InternalExpenseSchema).max(100).optional(),
}).strict();

const PatchSchema = z.object({
  versionNumber: z.number().int().positive(),
  allowDeleteAllLocalSections: z.boolean().optional(),
  commissionEnabled: z.boolean().optional(),
  clientTaxEnabled: z.boolean().optional(),
  clientChargeTaxEnabled: z.boolean().optional(),
  localSections: z.array(z.object({
    id: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).max(200),
    sortOrder: z.number().int().min(-10000).max(10000),
    kind: z.enum(["LOCAL", "CONTRACTOR"]).optional(),
    lines: z.array(LineSchema).max(1000),
  }).strict()).max(200),
}).strict();

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const rawVersion = new URL(req.url).searchParams.get("version");
  const parsedVersion = rawVersion == null ? null : Number.parseInt(rawVersion, 10);
  const model = await buildStandaloneEstimateReadModel({
    estimateId: id,
    versionNumber: parsedVersion != null && Number.isFinite(parsedVersion) ? parsedVersion : null,
  });
  if (!model) return jsonError(404, "Смета не найдена");
  return jsonOk(model);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  const requestedItemIds = [
    ...new Set(
      parsed.data.localSections.flatMap((section) =>
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
    where: {
      standaloneEstimateId: id,
      versionNumber: parsed.data.versionNumber,
      standaloneEstimate: { convertedAt: null },
    },
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
  if (!version) return jsonError(404, "Смета не найдена или уже преобразована в проект");
  if (
    version.sections.length > 0
    && parsed.data.localSections.length === 0
    && !parsed.data.allowDeleteAllLocalSections
  ) {
    return jsonError(400, "Подтвердите удаление всех разделов перед сохранением");
  }

  await prisma.$transaction(async (tx) => {
    await tx.projectEstimateSection.deleteMany({
      where: {
        versionId: version.id,
        kind: { in: [ProjectEstimateSectionKind.LOCAL, ProjectEstimateSectionKind.CONTRACTOR] },
      },
    });

    for (const section of [...parsed.data.localSections].sort((a, b) => a.sortOrder - b.sortOrder)) {
      await tx.projectEstimateSection.create({
        data: {
          versionId: version.id,
          title: section.title.trim(),
          sortOrder: section.sortOrder,
          kind: section.kind === "LOCAL"
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
              unitPriceClient: line.unitPriceClient == null ? null : new Prisma.Decimal(line.unitPriceClient),
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

    await tx.projectEstimateVersion.update({
      where: { id: version.id },
      data: {
        ...(parsed.data.commissionEnabled !== undefined
          ? { commissionEnabled: parsed.data.commissionEnabled }
          : {}),
        ...(parsed.data.clientTaxEnabled !== undefined
          ? { clientTaxEnabled: parsed.data.clientTaxEnabled }
          : {}),
        ...(parsed.data.clientChargeTaxEnabled !== undefined
          ? { clientChargeTaxEnabled: parsed.data.clientChargeTaxEnabled }
          : {}),
      },
    });
  });

  return jsonOk({ ok: true });
}
