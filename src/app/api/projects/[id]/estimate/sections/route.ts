import { ProjectEstimateSectionKind } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { assertProjectEditable } from "@/server/projects/project-guard";

const PostSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    versionNumber: z.number().int().positive().optional(),
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

  const v =
    parsed.data.versionNumber != null
      ? await prisma.projectEstimateVersion.findFirst({
          where: { projectId, versionNumber: parsed.data.versionNumber },
        })
      : await prisma.projectEstimateVersion.findFirst({
          where: { projectId },
          orderBy: { versionNumber: "desc" },
        });

  if (!v) return jsonError(400, "Сначала создайте версию сметы");

  const maxSo = await prisma.projectEstimateSection.aggregate({
    where: { versionId: v.id },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSo._max.sortOrder ?? -1) + 1;

  const section = await prisma.projectEstimateSection.create({
    data: {
      versionId: v.id,
      sortOrder,
      title: parsed.data.title.trim(),
      kind: ProjectEstimateSectionKind.LOCAL,
    },
  });

  return jsonOk({ section: { id: section.id, sortOrder: section.sortOrder, title: section.title, kind: section.kind } });
}
