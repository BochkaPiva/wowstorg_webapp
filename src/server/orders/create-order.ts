import { Prisma, ProjectActivityKind, type OrderSource, type Role } from "@prisma/client";

import { PAY_MULTIPLIER_GREENWICH } from "@/lib/constants";
import { utcTodayDateOnlyString } from "@/server/dates";
import { makeEstimateArtifactsForOrder } from "@/server/orders/estimate-artifacts";
import { getReservedQtyByItemId } from "@/server/orders/reserve";
import { appendProjectActivityLog } from "@/server/projects/activity-log";
import { seedProjectEstimateFromOrder } from "@/server/projects/seed-estimate-from-order";

type InputLine = {
  itemId: string;
  qty: number;
  comment?: string | null;
  sourceKitId?: string | null;
};

export type CreateOrderInput = {
  actorUserId: string;
  actorRole: Role;
  customerId?: string | null;
  customerName?: string | null;
  readyByDate: string;
  startDate: string;
  endDate: string;
  eventName?: string | null;
  comment?: string | null;
  deliveryEnabled?: boolean;
  deliveryComment?: string | null;
  deliveryPrice?: number;
  montageEnabled?: boolean;
  montageComment?: string | null;
  montagePrice?: number;
  demontageEnabled?: boolean;
  demontageComment?: string | null;
  demontagePrice?: number;
  source?: OrderSource;
  greenwichUserId?: string | null;
  projectId?: string | null;
  lines: InputLine[];
};

export type CreateOrderResult = {
  id: string;
  projectId: string | null;
};

export class CreateOrderError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(code: string, message?: string, details?: Record<string, unknown>) {
    super(message ?? code);
    this.code = code;
    this.details = details;
  }
}

function normalizeComment(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeNullableComment(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseDateOnlyToUtcMidnight(value: string): Date {
  const [y, m, d] = value.split("-").map((v) => Number(v));
  const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  if (Number.isNaN(dt.getTime())) throw new CreateOrderError("INVALID_DATE");
  return dt;
}

function groupLines(lines: InputLine[]): Array<InputLine & { qty: number }> {
  const grouped = new Map<string, InputLine & { qty: number }>();
  for (const line of lines) {
    const itemId = line.itemId.trim();
    const sourceKitId = line.sourceKitId?.trim() || undefined;
    const key = `${itemId}::${sourceKitId ?? ""}`;
    const prev = grouped.get(key);
    if (prev) {
      prev.qty += line.qty;
      const nextComment = normalizeComment(line.comment ?? null);
      if (nextComment) {
        prev.comment = prev.comment ? `${prev.comment}\n${nextComment}` : nextComment;
      }
    } else {
      grouped.set(key, {
        itemId,
        qty: line.qty,
        comment: normalizeComment(line.comment ?? null),
        sourceKitId,
      });
    }
  }
  return [...grouped.values()];
}

export async function createOrderInTransaction(
  tx: Prisma.TransactionClient,
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const isWarehouse = input.actorRole === "WOWSTORG";
  if (!isWarehouse && input.actorRole !== "GREENWICH") {
    throw new CreateOrderError("FORBIDDEN");
  }

  const hasProjectId = Boolean(input.projectId?.trim());
  if (hasProjectId && !isWarehouse) {
    throw new CreateOrderError("PROJECT_FORBIDDEN");
  }

  const hasCustomerId = Boolean(input.customerId?.trim());
  const hasCustomerName = Boolean(input.customerName?.trim());
  if (!hasProjectId && !hasCustomerId && !hasCustomerName) {
    throw new CreateOrderError("CUSTOMER_REQUIRED");
  }

  const readyByDate = parseDateOnlyToUtcMidnight(input.readyByDate);
  const startDate = parseDateOnlyToUtcMidnight(input.startDate);
  const endDate = parseDateOnlyToUtcMidnight(input.endDate);
  const minCalendarDay = utcTodayDateOnlyString();
  if (
    input.readyByDate < minCalendarDay ||
    input.startDate < minCalendarDay ||
    input.endDate < minCalendarDay
  ) {
    throw new CreateOrderError("DATE_IN_PAST");
  }
  if (!(readyByDate.getTime() <= startDate.getTime())) {
    throw new CreateOrderError("READY_AFTER_START");
  }
  if (!(startDate.getTime() <= endDate.getTime())) {
    throw new CreateOrderError("END_BEFORE_START");
  }

  const lines = groupLines(input.lines);
  if (lines.length === 0) {
    throw new CreateOrderError("LINES_REQUIRED");
  }

  let source: OrderSource;
  let greenwichUserId: string | null;
  let payMultiplier: string;

  if (isWarehouse) {
    source = input.source ?? "WOWSTORG_EXTERNAL";
    if (source === "GREENWICH_INTERNAL") {
      if (!input.greenwichUserId?.trim()) {
        throw new CreateOrderError("GREENWICH_USER_REQUIRED");
      }
      greenwichUserId = input.greenwichUserId.trim();
      payMultiplier = String(PAY_MULTIPLIER_GREENWICH);
    } else {
      greenwichUserId = null;
      payMultiplier = "1";
    }
  } else {
    source = "GREENWICH_INTERNAL";
    greenwichUserId = input.actorUserId;
    payMultiplier = String(PAY_MULTIPLIER_GREENWICH);
  }

  if (hasProjectId) {
    source = "WOWSTORG_EXTERNAL";
    greenwichUserId = null;
    payMultiplier = "1";
  }

  let customerIdToUse: string;
  let orderProjectId: string | null = null;

  if (input.projectId?.trim()) {
    const project = await tx.project.findFirst({
      where: { id: input.projectId.trim(), archivedAt: null },
      select: { id: true, customerId: true },
    });
    if (!project) throw new CreateOrderError("PROJECT_NOT_FOUND");
    if (hasCustomerName) throw new CreateOrderError("PROJECT_CUSTOMER_CONFLICT");
    if (hasCustomerId && input.customerId!.trim() !== project.customerId) {
      throw new CreateOrderError("PROJECT_CUSTOMER_MISMATCH");
    }
    customerIdToUse = project.customerId;
    orderProjectId = project.id;
  } else if (hasCustomerName) {
    const name = input.customerName!.trim();
    const existing = await tx.customer.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      customerIdToUse = existing.id;
    } else {
      const created = await tx.customer.create({
        data: { name },
        select: { id: true },
      });
      customerIdToUse = created.id;
    }
  } else {
    const customer = await tx.customer.findFirst({
      where: { id: input.customerId!.trim(), isActive: true },
      select: { id: true },
    });
    if (!customer) throw new CreateOrderError("CUSTOMER_NOT_FOUND");
    customerIdToUse = customer.id;
  }

  const itemIds = [...new Set(lines.map((line) => line.itemId))];
  const items = await tx.item.findMany({
    where: { id: { in: itemIds }, isActive: true, internalOnly: isWarehouse ? undefined : false },
    select: {
      id: true,
      pricePerDay: true,
      total: true,
      inRepair: true,
      broken: true,
      missing: true,
      internalOnly: true,
    },
  });
  if (items.length !== itemIds.length) {
    throw new CreateOrderError("ITEM_NOT_FOUND");
  }
  if (!isWarehouse && items.some((item) => item.internalOnly)) {
    throw new CreateOrderError("ITEM_NOT_FOUND");
  }
  const itemById = new Map(items.map((item) => [item.id, item]));

  const reserved = await getReservedQtyByItemId({ db: tx, startDate, endDate });
  for (const line of lines) {
    const item = itemById.get(line.itemId)!;
    const availableTotal = Math.max(0, item.total - item.inRepair - item.broken - item.missing);
    const reservedQty = reserved.get(line.itemId) ?? 0;
    const availableForDates = Math.max(0, availableTotal - reservedQty);
    if (line.qty > availableForDates) {
      throw new CreateOrderError("EXCEEDS_AVAILABILITY", undefined, {
        itemId: line.itemId,
        availableForDates,
      });
    }
  }

  const order = await tx.order.create({
    data: {
      source,
      status: "SUBMITTED",
      createdById: input.actorUserId,
      greenwichUserId,
      customerId: customerIdToUse,
      projectId: orderProjectId ?? undefined,
      eventName: normalizeComment(input.eventName ?? null),
      comment: normalizeComment(input.comment ?? null),
      readyByDate,
      startDate,
      endDate,
      deliveryEnabled: input.deliveryEnabled ?? false,
      deliveryComment: normalizeNullableComment(input.deliveryComment),
      deliveryPrice: input.deliveryPrice != null ? input.deliveryPrice : undefined,
      montageEnabled: input.montageEnabled ?? false,
      montageComment: normalizeNullableComment(input.montageComment),
      montagePrice: input.montagePrice != null ? input.montagePrice : undefined,
      demontageEnabled: input.demontageEnabled ?? false,
      demontageComment: normalizeNullableComment(input.demontageComment),
      demontagePrice: input.demontagePrice != null ? input.demontagePrice : undefined,
      payMultiplier,
      lines: {
        create: lines.map((line, index) => ({
          itemId: line.itemId,
          sourceKitId: line.sourceKitId ?? undefined,
          requestedQty: line.qty,
          pricePerDaySnapshot: itemById.get(line.itemId)!.pricePerDay,
          greenwichComment: normalizeComment(line.comment ?? null),
          position: index,
        })),
      },
    },
    select: { id: true },
  });

  if (source === "WOWSTORG_EXTERNAL") {
    const artifacts = await makeEstimateArtifactsForOrder(tx, order.id);
    const now = new Date();
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "APPROVED_BY_GREENWICH",
        estimateSentAt: now,
        estimateSentSnapshot: artifacts.estimateSentSnapshot as unknown as object,
        estimateFileKey: artifacts.estimateFileKey,
        greenwichConfirmedAt: now,
        greenwichConfirmedSnapshot: artifacts.estimateSentSnapshot as unknown as object,
      },
    });
  }

  if (orderProjectId) {
    await seedProjectEstimateFromOrder(tx, {
      projectId: orderProjectId,
      orderId: order.id,
      actorUserId: input.actorUserId,
    });
    await appendProjectActivityLog(tx, {
      projectId: orderProjectId,
      actorUserId: input.actorUserId,
      kind: ProjectActivityKind.ORDER_LINKED,
      payload: { orderId: order.id },
    });
  }

  return { id: order.id, projectId: orderProjectId };
}
