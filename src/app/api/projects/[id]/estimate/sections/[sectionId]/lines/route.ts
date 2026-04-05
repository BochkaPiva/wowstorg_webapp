import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { assertProjectEditable } from "@/server/projects/project-guard";

const PostSchema = z
  .object({
    name: z.string().trim().min(1).max(500),
    description: z.string().trim().max(5000).optional().nullable(),
    lineType: z.string().trim().max(80).optional(),
    lineNumber: z.number().int().min(0).max(9999).optional(),
    costClient: z.number().finite().optional().nullable(),
    costInternal: z.number().finite().optional().nullable(),
  })
  .strict();

export async function POST(
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

  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  const section = await prisma.projectEstimateSection.findFirst({
    where: { id: sectionId, version: { projectId } },
    select: { id: true },
  });
  if (!section) return jsonError(404, "Раздел не найден");

  const maxP = await prisma.projectEstimateLine.aggregate({
    where: { sectionId },
    _max: { position: true },
  });
  const position = (maxP._max.position ?? -1) + 1;
  const lineNumber = parsed.data.lineNumber ?? position + 1;

  const line = await prisma.projectEstimateLine.create({
    data: {
      sectionId,
      position,
      lineNumber,
      name: parsed.data.name.trim(),
      description: parsed.data.description ?? undefined,
      lineType: parsed.data.lineType?.trim() || "OTHER",
      costClient:
        parsed.data.costClient != null ? new Prisma.Decimal(parsed.data.costClient) : undefined,
      costInternal:
        parsed.data.costInternal != null ? new Prisma.Decimal(parsed.data.costInternal) : undefined,
    },
  });

  return jsonOk({
    line: {
      id: line.id,
      position: line.position,
      lineNumber: line.lineNumber,
      name: line.name,
      description: line.description,
      lineType: line.lineType,
      costClient: line.costClient?.toString() ?? null,
      costInternal: line.costInternal?.toString() ?? null,
      orderLineId: line.orderLineId,
      itemId: line.itemId,
    },
  });
}
