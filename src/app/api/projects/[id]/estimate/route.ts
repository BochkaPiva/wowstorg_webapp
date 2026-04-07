import { Prisma, ProjectEstimateSectionKind } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { buildProjectEstimateReadModel } from "@/server/projects/estimate-read-model";
import { assertProjectEditable } from "@/server/projects/project-guard";

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
  })
  .strict();

const PatchDraftSchema = z
  .object({
    versionNumber: z.number().int().positive(),
    localSections: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).optional(),
            title: z.string().trim().min(1).max(200),
            sortOrder: z.number().int().min(0).max(10000),
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

  const { versionNumber, localSections } = parsed.data;

  const version = await prisma.projectEstimateVersion.findFirst({
    where: { projectId, versionNumber },
    select: { id: true },
  });
  if (!version) return jsonError(404, "Версия сметы не найдена");

  await prisma.$transaction(async (tx) => {
    const existingSections = await tx.projectEstimateSection.findMany({
      where: {
        versionId: version.id,
        kind: ProjectEstimateSectionKind.LOCAL,
      },
      include: {
        lines: {
          orderBy: { position: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    const existingSectionMap = new Map(existingSections.map((section) => [section.id, section]));
    const keptSectionIds = new Set(
      localSections
        .map((section) => section.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        .filter((id) => existingSectionMap.has(id)),
    );

    for (const section of existingSections) {
      if (!keptSectionIds.has(section.id)) {
        await tx.projectEstimateSection.delete({ where: { id: section.id } });
      }
    }

    for (const sectionDraft of localSections.sort((a, b) => a.sortOrder - b.sortOrder)) {
      const existingSection =
        sectionDraft.id && existingSectionMap.has(sectionDraft.id)
          ? existingSectionMap.get(sectionDraft.id)!
          : null;

      const savedSection = existingSection
        ? await tx.projectEstimateSection.update({
            where: { id: existingSection.id },
            data: {
              title: sectionDraft.title.trim(),
              sortOrder: sectionDraft.sortOrder,
            },
          })
        : await tx.projectEstimateSection.create({
            data: {
              versionId: version.id,
              title: sectionDraft.title.trim(),
              sortOrder: sectionDraft.sortOrder,
              kind: ProjectEstimateSectionKind.LOCAL,
            },
          });

      const existingLineMap = new Map((existingSection?.lines ?? []).map((line) => [line.id, line]));
      const keptLineIds = new Set(
        sectionDraft.lines
          .map((line) => line.id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
          .filter((id) => existingLineMap.has(id)),
      );

      for (const line of existingSection?.lines ?? []) {
        if (!keptLineIds.has(line.id)) {
          await tx.projectEstimateLine.delete({ where: { id: line.id } });
        }
      }

      for (const lineDraft of sectionDraft.lines.sort((a, b) => a.position - b.position)) {
        const data = {
          sectionId: savedSection.id,
          position: lineDraft.position,
          lineNumber: lineDraft.lineNumber,
          name: lineDraft.name.trim(),
          description: lineDraft.description?.trim() || null,
          lineType: lineDraft.lineType?.trim() || "OTHER",
          costClient:
            lineDraft.costClient == null ? null : new Prisma.Decimal(lineDraft.costClient),
          costInternal:
            lineDraft.costInternal == null ? null : new Prisma.Decimal(lineDraft.costInternal),
        };

        if (lineDraft.id && existingLineMap.has(lineDraft.id)) {
          await tx.projectEstimateLine.update({
            where: { id: lineDraft.id },
            data,
          });
        } else {
          await tx.projectEstimateLine.create({ data });
        }
      }
    }
  });

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
