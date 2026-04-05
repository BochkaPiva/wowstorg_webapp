import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { assertProjectEditable } from "@/server/projects/project-guard";

const PatchSchema = z
  .object({
    name: z.string().trim().min(1).max(500).optional(),
    description: z.string().trim().max(5000).optional().nullable(),
    lineType: z.string().trim().max(80).optional(),
    lineNumber: z.number().int().min(0).max(9999).optional(),
    costClient: z.number().finite().optional().nullable(),
    costInternal: z.number().finite().optional().nullable(),
    position: z.number().int().min(0).max(10000).optional(),
  })
  .strict();

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; lineId: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId, lineId } = await ctx.params;
  if (!projectId?.trim() || !lineId?.trim()) return jsonError(400, "Invalid id");

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

  const line = await prisma.projectEstimateLine.findFirst({
    where: {
      id: lineId,
      section: { version: { projectId } },
    },
    select: { id: true },
  });
  if (!line) return jsonError(404, "Строка не найдена");

  const data: {
    name?: string;
    description?: string | null;
    lineType?: string;
    lineNumber?: number;
    position?: number;
    costClient?: Prisma.Decimal | null;
    costInternal?: Prisma.Decimal | null;
  } = {};

  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.lineType !== undefined) data.lineType = parsed.data.lineType;
  if (parsed.data.lineNumber !== undefined) data.lineNumber = parsed.data.lineNumber;
  if (parsed.data.position !== undefined) data.position = parsed.data.position;
  if (parsed.data.costClient !== undefined) {
    data.costClient =
      parsed.data.costClient == null ? null : new Prisma.Decimal(parsed.data.costClient);
  }
  if (parsed.data.costInternal !== undefined) {
    data.costInternal =
      parsed.data.costInternal == null ? null : new Prisma.Decimal(parsed.data.costInternal);
  }

  if (Object.keys(data).length === 0) {
    return jsonError(400, "Нет полей для обновления");
  }

  const updated = await prisma.projectEstimateLine.update({
    where: { id: lineId },
    data,
  });

  return jsonOk({
    line: {
      ...updated,
      costClient: updated.costClient?.toString() ?? null,
      costInternal: updated.costInternal?.toString() ?? null,
    },
  });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; lineId: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId, lineId } = await ctx.params;
  if (!projectId?.trim() || !lineId?.trim()) return jsonError(400, "Invalid id");

  const guard = await assertProjectEditable(projectId);
  if (!guard.ok) return jsonError(guard.status, guard.message);

  const line = await prisma.projectEstimateLine.findFirst({
    where: {
      id: lineId,
      section: { version: { projectId } },
    },
    select: { id: true, orderLineId: true },
  });
  if (!line) return jsonError(404, "Строка не найдена");
  if (line.orderLineId) {
    return jsonError(400, "Строку, скопированную из заявки, нельзя удалить (только править суммы и текст)");
  }

  await prisma.projectEstimateLine.delete({ where: { id: lineId } });
  return jsonOk({ ok: true });
}
