import { Prisma, ProjectActivityKind } from "@prisma/client";
import { z } from "zod";

import { usableStockUnits } from "@/lib/inventory-stock";
import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { appendProjectActivityLog } from "@/server/projects/activity-log";
import { assertProjectEditable } from "@/server/projects/project-guard";
import { serializeDraftOrder } from "@/server/projects/draft-order";

const DraftLineSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    itemId: z.string().trim().min(1),
    itemName: z.string().trim().min(1).max(300),
    qty: z.number().int().positive(),
    plannedDays: z.number().int().positive().max(3650).optional(),
    comment: z.string().trim().max(2000).nullable().optional(),
    periodGroup: z.string().trim().max(120).nullable().optional(),
    pricePerDaySnapshot: z.number().finite().nullable().optional(),
    sortOrder: z.number().int().min(0).max(10000),
  })
  .strict();

const PatchSchema = z
  .object({
    estimateVersionId: z.string().trim().min(1).nullable().optional(),
    title: z.string().trim().max(300).nullable().optional(),
    comment: z.string().trim().max(5000).nullable().optional(),
    lines: z.array(DraftLineSchema).max(1000),
  })
  .strict();

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId } = await ctx.params;
  if (!projectId?.trim()) return jsonError(400, "Invalid id");

  const draft = await prisma.projectDraftOrder.findUnique({
    where: { projectId },
    include: {
      lines: {
        orderBy: { sortOrder: "asc" },
        include: {
          item: {
            select: {
              id: true,
              name: true,
              total: true,
              inRepair: true,
              broken: true,
              missing: true,
            },
          },
        },
      },
    },
  });

  return jsonOk({ draftOrder: serializeDraftOrder(draft) });
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

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  const payload = parsed.data;

  let draftOrder;
  try {
    draftOrder = await prisma.$transaction(async (tx) => {
    const existing = await tx.projectDraftOrder.findUnique({
      where: { projectId },
      include: {
        lines: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    const project = await tx.project.findFirst({
      where: { id: projectId, archivedAt: null },
      select: { id: true },
    });
    if (!project) {
      throw new Error("PROJECT_NOT_FOUND");
    }

    const upserted =
      existing ??
      (await tx.projectDraftOrder.create({
        data: {
          projectId,
          createdById: auth.user.id,
          updatedById: auth.user.id,
        },
        include: {
          lines: {
            orderBy: { sortOrder: "asc" },
          },
        },
      }));

    await tx.projectDraftOrder.update({
      where: { id: upserted.id },
      data: {
        ...(payload.estimateVersionId !== undefined
          ? { estimateVersionId: payload.estimateVersionId?.trim() || null }
          : {}),
        ...(payload.title !== undefined ? { title: payload.title?.trim() || null } : {}),
        ...(payload.comment !== undefined ? { comment: payload.comment?.trim() || null } : {}),
        updatedById: auth.user.id,
      },
    });

    const existingLineMap = new Map((existing?.lines ?? []).map((line) => [line.id, line]));
    const keptLineIds = new Set(
      payload.lines
        .map((line) => line.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        .filter((id) => existingLineMap.has(id)),
    );

    for (const line of existing?.lines ?? []) {
      if (!keptLineIds.has(line.id)) {
        await tx.projectDraftOrderLine.delete({ where: { id: line.id } });
      }
    }

    const itemIds = [...new Set(payload.lines.map((line) => line.itemId))];
    if (itemIds.length > 0) {
      const items = await tx.item.findMany({
        where: { id: { in: itemIds }, isActive: true },
        select: {
          id: true,
          name: true,
          pricePerDay: true,
          total: true,
          inRepair: true,
          broken: true,
          missing: true,
        },
      });
      if (items.length !== itemIds.length) {
        throw new Error("ITEM_NOT_FOUND");
      }
      const itemById = new Map(items.map((item) => [item.id, item]));

      const qtySumByItemId = new Map<string, number>();
      for (const line of payload.lines) {
        qtySumByItemId.set(line.itemId, (qtySumByItemId.get(line.itemId) ?? 0) + line.qty);
      }
      for (const [itemId, sumQty] of qtySumByItemId) {
        const item = itemById.get(itemId)!;
        const cap = usableStockUnits(item);
        if (sumQty > cap) {
          throw new Error(
            `QTY_EXCEEDS_PHYSICAL_STOCK:${JSON.stringify({ itemName: item.name, cap, sumQty })}`,
          );
        }
      }

      for (const line of payload.lines.sort((a, b) => a.sortOrder - b.sortOrder)) {
        const item = itemById.get(line.itemId)!;
        const data = {
          draftOrderId: upserted.id,
          sortOrder: line.sortOrder,
          itemId: line.itemId,
          itemNameSnapshot: line.itemName.trim() || item.name,
          qty: line.qty,
          plannedDays: Math.max(1, line.plannedDays ?? 1),
          comment: line.comment?.trim() || null,
          periodGroup: line.periodGroup?.trim() || null,
          pricePerDaySnapshot:
            line.pricePerDaySnapshot == null
              ? item.pricePerDay
              : new Prisma.Decimal(line.pricePerDaySnapshot),
          lastAvailableQty: null,
          lastAvailabilityNote: null,
        };

        if (line.id && existingLineMap.has(line.id)) {
          await tx.projectDraftOrderLine.update({
            where: { id: line.id },
            data,
          });
        } else {
          await tx.projectDraftOrderLine.create({ data });
        }
      }
    } else {
      await tx.projectDraftOrderLine.deleteMany({
        where: { draftOrderId: upserted.id },
      });
    }

    await appendProjectActivityLog(tx, {
      projectId,
      actorUserId: auth.user.id,
      kind: ProjectActivityKind.PROJECT_DRAFT_ORDER_UPDATED,
      payload: {
        lineCount: payload.lines.length,
      } as Prisma.InputJsonValue,
    });

    return tx.projectDraftOrder.findUnique({
      where: { id: upserted.id },
      include: {
        lines: {
          orderBy: { sortOrder: "asc" },
          include: {
            item: {
              select: {
                id: true,
                name: true,
                total: true,
                inRepair: true,
                broken: true,
                missing: true,
              },
            },
          },
        },
      },
    });
  });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "PROJECT_NOT_FOUND") return jsonError(404, "Проект не найден");
    if (msg === "ITEM_NOT_FOUND") return jsonError(400, "Позиция не найдена или неактивна");
    if (msg.startsWith("QTY_EXCEEDS_PHYSICAL_STOCK:")) {
      try {
        const detail = JSON.parse(msg.slice("QTY_EXCEEDS_PHYSICAL_STOCK:".length)) as {
          itemName: string;
          cap: number;
          sumQty: number;
        };
        return jsonError(
          400,
          `По позиции «${detail.itemName}» в demo-наборе запрошено ${detail.sumQty} шт., на складе годных единиц: ${detail.cap} (без учёта резерва по датам). Уменьшите количество или учтите остаток по строкам.`,
        );
      } catch {
        return jsonError(400, "Превышен физический остаток по позиции в demo-наборе");
      }
    }
    throw e;
  }

  if (!draftOrder) return jsonError(500, "Не удалось сохранить черновик");

  scheduleAfterResponse("notifyProjectDraftOrderUpdated", async () => {
    const { notifyProjectNoisyBlock } = await import("@/server/projects/project-notifications");
    await notifyProjectNoisyBlock({
      projectId,
      actorUserId: auth.user.id,
      block: "estimate",
      action: "Обновлён demo-черновик реквизита проекта.",
    });
  });

  return jsonOk({ draftOrder: serializeDraftOrder(draftOrder) });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId } = await ctx.params;
  if (!projectId?.trim()) return jsonError(400, "Invalid id");

  const guard = await assertProjectEditable(projectId);
  if (!guard.ok) return jsonError(guard.status, guard.message);

  const deleted = await prisma.$transaction(async (tx) => {
    const existing = await tx.projectDraftOrder.findUnique({
      where: { projectId },
      select: { id: true, _count: { select: { lines: true } } },
    });
    if (!existing) return null;

    await tx.projectDraftOrderLine.deleteMany({
      where: { draftOrderId: existing.id },
    });
    await tx.projectDraftOrder.delete({
      where: { id: existing.id },
    });

    await appendProjectActivityLog(tx, {
      projectId,
      actorUserId: auth.user.id,
      kind: ProjectActivityKind.PROJECT_DRAFT_ORDER_UPDATED,
      payload: {
        deleted: true,
        previousLineCount: existing._count.lines,
        lineCount: 0,
      } as Prisma.InputJsonValue,
    });

    return existing;
  });

  scheduleAfterResponse("notifyProjectDraftOrderDeleted", async () => {
    const { notifyProjectNoisyBlock } = await import("@/server/projects/project-notifications");
    await notifyProjectNoisyBlock({
      projectId,
      actorUserId: auth.user.id,
      block: "estimate",
      action: "Удалён demo-черновик реквизита проекта.",
    });
  });

  return jsonOk({ ok: true, deleted: deleted != null });
}
