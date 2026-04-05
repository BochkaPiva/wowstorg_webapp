import { ProjectEstimateSectionKind } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { assertProjectEditable } from "@/server/projects/project-guard";

const PatchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
  })
  .strict();

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; sectionId: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId, sectionId } = await ctx.params;
  if (!projectId?.trim() || !sectionId?.trim()) return jsonError(400, "Invalid id");

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

  const section = await prisma.projectEstimateSection.findFirst({
    where: { id: sectionId, version: { projectId } },
    select: { id: true },
  });
  if (!section) return jsonError(404, "Раздел не найден");

  const updated = await prisma.projectEstimateSection.update({
    where: { id: sectionId },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
    },
  });

  return jsonOk({ section: updated });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; sectionId: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId, sectionId } = await ctx.params;
  if (!projectId?.trim() || !sectionId?.trim()) return jsonError(400, "Invalid id");

  const guard = await assertProjectEditable(projectId);
  if (!guard.ok) return jsonError(guard.status, guard.message);

  const section = await prisma.projectEstimateSection.findFirst({
    where: { id: sectionId, version: { projectId } },
    select: { id: true, kind: true },
  });
  if (!section) return jsonError(404, "Раздел не найден");
  if (section.kind !== ProjectEstimateSectionKind.LOCAL) {
    return jsonError(400, "Удалять можно только локальные разделы (не блок реквизита)");
  }

  await prisma.projectEstimateSection.delete({ where: { id: sectionId } });
  return jsonOk({ ok: true });
}
