import { ProjectEstimateSectionKind } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";

const PatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  sortOrder: z.number().int().min(-10000).max(10000).optional(),
}).strict();

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; sectionId: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id, sectionId } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  const section = await prisma.projectEstimateSection.findFirst({
    where: {
      id: sectionId,
      kind: { in: [ProjectEstimateSectionKind.LOCAL, ProjectEstimateSectionKind.CONTRACTOR] },
      version: {
        standaloneEstimateId: id,
        standaloneEstimate: { convertedAt: null },
      },
    },
    select: { id: true },
  });
  if (!section) return jsonError(404, "Раздел не найден");

  const updated = await prisma.projectEstimateSection.update({
    where: { id: sectionId },
    data: parsed.data,
  });
  return jsonOk({ section: updated });
}

