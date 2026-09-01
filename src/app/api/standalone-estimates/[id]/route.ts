import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { getProjectWorkspaceFeatures } from "@/server/projects/workspace-rollout";

const PatchSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    customerId: z.string().trim().min(1).nullable().optional(),
    customerName: z.string().trim().min(2).max(200).nullable().optional(),
  })
  .strict();

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const estimate = await prisma.standaloneEstimate.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      leadCustomerName: true,
      convertedAt: true,
      convertedProjectId: true,
      createdAt: true,
      updatedAt: true,
      customer: {
        select: {
          id: true,
          name: true,
          logoKey: true,
          logoUpdatedAt: true,
        },
      },
      owner: { select: { id: true, displayName: true } },
    },
  });
  if (!estimate) return jsonError(404, "Смета не найдена");

  return jsonOk({
    features: {
      projectEstimateGridV2: getProjectWorkspaceFeatures().projectEstimateGridV2,
    },
    estimate: {
      ...estimate,
      convertedAt: estimate.convertedAt?.toISOString() ?? null,
      createdAt: estimate.createdAt.toISOString(),
      updatedAt: estimate.updatedAt.toISOString(),
      customer: estimate.customer
        ? {
            id: estimate.customer.id,
            name: estimate.customer.name,
            logoUrl: estimate.customer.logoKey
              ? `/api/customers/${estimate.customer.id}/logo?v=${estimate.customer.logoUpdatedAt?.getTime() ?? 0}`
              : null,
          }
        : null,
    },
  });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
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

  const existing = await prisma.standaloneEstimate.findUnique({
    where: { id },
    select: { convertedAt: true },
  });
  if (!existing) return jsonError(404, "Смета не найдена");
  if (existing.convertedAt) return jsonError(409, "Смета уже преобразована в проект");

  const customerId =
    parsed.data.customerId === undefined
      ? undefined
      : parsed.data.customerId?.trim() || null;
  if (customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) return jsonError(400, "Заказчик не найден");
  }

  const estimate = await prisma.standaloneEstimate.update({
    where: { id },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title.trim() } : {}),
      ...(customerId !== undefined
        ? {
            customerId,
            leadCustomerName: customerId ? null : parsed.data.customerName?.trim() || null,
          }
        : parsed.data.customerName !== undefined
          ? { leadCustomerName: parsed.data.customerName?.trim() || null }
          : {}),
    },
    select: {
      id: true,
      title: true,
      customerId: true,
      leadCustomerName: true,
      updatedAt: true,
    },
  });

  return jsonOk({ estimate });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const existing = await prisma.standaloneEstimate.findUnique({
    where: { id },
    select: { convertedAt: true },
  });
  if (!existing) return jsonError(404, "Смета не найдена");
  if (existing.convertedAt) {
    return jsonError(409, "Преобразованную в проект смету удалить нельзя");
  }

  const deleted = await prisma.standaloneEstimate.deleteMany({
    where: {
      id,
      convertedAt: null,
    },
  });
  if (deleted.count === 0) {
    const current = await prisma.standaloneEstimate.findUnique({
      where: { id },
      select: { convertedAt: true },
    });
    if (!current) return jsonError(404, "Смета уже удалена");
    return jsonError(409, "Смета уже преобразована в проект");
  }

  return jsonOk({ ok: true });
}
