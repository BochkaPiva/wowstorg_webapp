import { type Prisma, ProjectActivityKind, ProjectEstimateSectionKind } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { appendProjectActivityLog } from "@/server/projects/activity-log";
import { assertProjectEditable } from "@/server/projects/project-guard";

const PostSchema = z
  .object({
    note: z.string().trim().max(500).optional().nullable(),
    duplicateFromVersionNumber: z.number().int().positive().optional(),
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
              itemId: ln.itemId ?? undefined,
            },
          });
        }
      }
    } else {
      await tx.projectEstimateSection.create({
        data: {
          versionId: v.id,
          sortOrder: 0,
          title: "Новый раздел",
          kind: ProjectEstimateSectionKind.LOCAL,
        },
      });
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

  return jsonOk({
    version: {
      id: version.id,
      versionNumber: version.versionNumber,
      note: version.note,
      createdAt: version.createdAt.toISOString(),
    },
  });
}
