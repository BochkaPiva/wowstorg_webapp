import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireUser } from "@/server/auth/require";
import { DateOnlySchema, parseDateOnlyToUtcMidnight, utcTodayDateOnlyString } from "@/server/dates";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { validateRentalPartCombo } from "@/lib/rental-days";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { makeEstimateArtifactsForOrder } from "@/server/orders/estimate-artifacts";
import { getReservedQtyByItemId } from "@/server/orders/reserve";

const RentalPartSchema = z.enum(["MORNING", "EVENING"]);
const DateSelectionSchema = z.object({
  readyByDate: DateOnlySchema,
  startDate: DateOnlySchema,
  endDate: DateOnlySchema,
  rentalStartPartOfDay: RentalPartSchema,
  rentalEndPartOfDay: RentalPartSchema,
});
const ApplySchema = DateSelectionSchema.extend({
  conflictResolution: z.enum(["REJECT", "REMOVE_UNAVAILABLE"]).default("REJECT"),
});

const GREENWICH_EDITABLE_STATUSES = [
  "SUBMITTED",
  "ESTIMATE_SENT",
  "CHANGES_REQUESTED",
  "APPROVED_BY_GREENWICH",
] as const;
const WAREHOUSE_EDITABLE_STATUSES = [
  ...GREENWICH_EDITABLE_STATUSES,
  "PICKING",
] as const;

type DateSelection = z.infer<typeof DateSelectionSchema>;
type Tx = Prisma.TransactionClient;

type AvailabilityConflict = {
  itemId: string;
  name: string;
  photo1Key: string | null;
  requestedQty: number;
  availableQty: number;
  shortageQty: number;
  orderLineIds: string[];
};

function dateSelectionError(data: DateSelection): string | null {
  const today = utcTodayDateOnlyString();
  if (data.readyByDate < today || data.startDate < today || data.endDate < today) {
    return "Новые даты не могут быть в прошлом";
  }
  if (data.readyByDate > data.startDate) return "Дата готовности не может быть позже начала аренды";
  const parts = validateRentalPartCombo(data);
  if (!parts.ok) return parts.message;
  return null;
}

function canChangeDates(args: {
  role: string;
  userId: string;
  status: string;
  greenwichUserId: string | null;
}) {
  if (args.role === "WOWSTORG") {
    return WAREHOUSE_EDITABLE_STATUSES.includes(
      args.status as (typeof WAREHOUSE_EDITABLE_STATUSES)[number],
    );
  }
  return (
    args.role === "GREENWICH" &&
    args.greenwichUserId === args.userId &&
    GREENWICH_EDITABLE_STATUSES.includes(
      args.status as (typeof GREENWICH_EDITABLE_STATUSES)[number],
    )
  );
}

async function inspectAvailability(tx: Tx, orderId: string, data: DateSelection) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      customer: { select: { name: true } },
      createdBy: { select: { displayName: true } },
      greenwichUser: { select: { displayName: true } },
      lines: {
        orderBy: [{ position: "asc" }],
        include: {
          item: {
            select: {
              id: true,
              name: true,
              photo1Key: true,
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
  if (!order) throw new Error("NOT_FOUND");

  const reserved = await getReservedQtyByItemId({
    db: tx,
    startDate: parseDateOnlyToUtcMidnight(data.startDate),
    endDate: parseDateOnlyToUtcMidnight(data.endDate),
    rentalStartPartOfDay: data.rentalStartPartOfDay,
    rentalEndPartOfDay: data.rentalEndPartOfDay,
    excludeOrderId: orderId,
  });

  const grouped = new Map<
    string,
    {
      name: string;
      photo1Key: string | null;
      requestedQty: number;
      usableQty: number;
      lineIds: string[];
    }
  >();
  for (const line of order.lines) {
    // После согласования реальная потребность определяется согласованным
    // количеством. На этапах выдачи не занижаем её до нуля, если issuedQty
    // ещё не заполнен, но учитываем фактически выданный излишек.
    const requestedQty = Math.max(
      line.approvedQty ?? line.requestedQty,
      line.issuedQty ?? 0,
    );
    const current = grouped.get(line.itemId);
    if (current) {
      current.requestedQty += requestedQty;
      current.lineIds.push(line.id);
    } else {
      grouped.set(line.itemId, {
        name: line.item.name,
        photo1Key: line.item.photo1Key,
        requestedQty,
        usableQty: Math.max(
          0,
          line.item.total - line.item.inRepair - line.item.broken - line.item.missing,
        ),
        lineIds: [line.id],
      });
    }
  }

  const conflicts: AvailabilityConflict[] = [];
  for (const [itemId, item] of grouped) {
    const availableQty = Math.max(0, item.usableQty - (reserved.get(itemId) ?? 0));
    if (item.requestedQty > availableQty) {
      conflicts.push({
        itemId,
        name: item.name,
        photo1Key: item.photo1Key,
        requestedQty: item.requestedQty,
        availableQty,
        shortageQty: item.requestedQty - availableQty,
        orderLineIds: item.lineIds,
      });
    }
  }

  return { order, conflicts };
}

async function readDateBody(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { ok: false as const, response: jsonError(400, "Некорректный JSON") };
  }
  const parsed = DateSelectionSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false as const,
      response: jsonError(400, "Проверьте выбранные даты", parsed.error.flatten()),
    };
  }
  const error = dateSelectionError(parsed.data);
  if (error) return { ok: false as const, response: jsonError(400, error) };
  return { ok: true as const, data: parsed.data };
}

async function readApplyBody(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { ok: false as const, response: jsonError(400, "Некорректный JSON") };
  }
  const parsed = ApplySchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false as const,
      response: jsonError(400, "Проверьте выбранные даты", parsed.error.flatten()),
    };
  }
  const error = dateSelectionError(parsed.data);
  if (error) return { ok: false as const, response: jsonError(400, error) };
  return { ok: true as const, data: parsed.data };
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const parsed = await readDateBody(req);
  if (!parsed.ok) return parsed.response;
  const { id } = await ctx.params;

  const orderAccess = await prisma.order.findUnique({
    where: { id },
    select: { status: true, greenwichUserId: true },
  });
  if (!orderAccess) return jsonError(404, "Заявка не найдена");
  if (!canChangeDates({
    role: auth.user.role,
    userId: auth.user.id,
    status: orderAccess.status,
    greenwichUserId: orderAccess.greenwichUserId,
  })) {
    return jsonError(403, "На текущем этапе даты заявки менять нельзя");
  }

  try {
    const result = await prisma.$transaction(
      (tx) => inspectAvailability(tx, id, parsed.data),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 15_000,
      },
    );
    return jsonOk({
      available: result.conflicts.length === 0,
      conflicts: result.conflicts.map(({ orderLineIds: _lineIds, ...conflict }) => conflict),
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return jsonError(409, "Данные склада изменились. Запустите проверку ещё раз.");
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return jsonError(404, "Заявка не найдена");
    }
    console.error("[order-dates-check]", error);
    return jsonError(500, "Не удалось проверить доступность");
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const parsed = await readApplyBody(req);
  if (!parsed.ok) return parsed.response;
  const { id } = await ctx.params;
  const data = parsed.data;
  let beforeForNotify: Awaited<ReturnType<typeof inspectAvailability>>["order"] | null = null;
  let removedNames: string[] = [];

  try {
    await prisma.$transaction(
      async (tx) => {
        const inspected = await inspectAvailability(tx, id, data);
        const { order, conflicts } = inspected;
        beforeForNotify = order;
        if (!canChangeDates({
          role: auth.user.role,
          userId: auth.user.id,
          status: order.status,
          greenwichUserId: order.greenwichUserId,
        })) {
          throw new Error("FORBIDDEN_STATUS");
        }
        if (conflicts.length && data.conflictResolution === "REJECT") {
          throw new Error(`CONFLICTS:${JSON.stringify(conflicts.map(({ orderLineIds: _ids, ...row }) => row))}`);
        }

        const removeIds = conflicts.flatMap((conflict) => conflict.orderLineIds);
        if (removeIds.length && removeIds.length >= order.lines.length) {
          throw new Error("ALL_LINES_CONFLICT");
        }
        if (removeIds.length) {
          removedNames = conflicts.map((conflict) => conflict.name);
          await tx.orderLine.deleteMany({ where: { id: { in: removeIds }, orderId: id } });
        }

        const cycleNeedsReview = ["ESTIMATE_SENT", "APPROVED_BY_GREENWICH"].includes(order.status);
        const nextStatus =
          order.source === "WOWSTORG_EXTERNAL"
            ? "APPROVED_BY_GREENWICH"
            : cycleNeedsReview
              ? auth.user.role === "GREENWICH" ? "CHANGES_REQUESTED" : "SUBMITTED"
              : order.status;

        await tx.order.update({
          where: { id },
          data: {
            readyByDate: parseDateOnlyToUtcMidnight(data.readyByDate),
            startDate: parseDateOnlyToUtcMidnight(data.startDate),
            endDate: parseDateOnlyToUtcMidnight(data.endDate),
            rentalStartPartOfDay: data.rentalStartPartOfDay,
            rentalEndPartOfDay: data.rentalEndPartOfDay,
            status: nextStatus,
            ...(order.source !== "WOWSTORG_EXTERNAL" && cycleNeedsReview
              ? {
                  estimateFileKey: null,
                  estimateSentAt: null,
                  estimateSentSnapshot: Prisma.JsonNull,
                  greenwichConfirmedAt: null,
                  greenwichConfirmedSnapshot: Prisma.JsonNull,
                }
              : {}),
          },
        });

        if (order.source === "WOWSTORG_EXTERNAL") {
          const artifacts = await makeEstimateArtifactsForOrder(tx, id);
          const now = new Date();
          await tx.order.update({
            where: { id },
            data: {
              estimateFileKey: artifacts.estimateFileKey,
              estimateSentAt: now,
              estimateSentSnapshot: artifacts.estimateSentSnapshot as unknown as object,
              greenwichConfirmedAt: now,
              greenwichConfirmedSnapshot: artifacts.estimateSentSnapshot as unknown as object,
            },
          });
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 20_000,
      },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return jsonError(409, "Данные склада изменились. Запустите проверку ещё раз.");
    }
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") return jsonError(404, "Заявка не найдена");
      if (error.message === "FORBIDDEN_STATUS") return jsonError(403, "На текущем этапе даты заявки менять нельзя");
      if (error.message === "ALL_LINES_CONFLICT") {
        return jsonError(409, "На новые даты недоступен весь состав заявки. Выберите другой период.");
      }
      if (error.message.startsWith("CONFLICTS:")) {
        return jsonError(409, "Часть реквизита недоступна", {
          conflicts: JSON.parse(error.message.slice("CONFLICTS:".length)) as AvailabilityConflict[],
        });
      }
    }
    console.error("[order-dates-apply]", error);
    return jsonError(500, "Не удалось изменить даты");
  }

  const after = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true } },
      createdBy: { select: { displayName: true } },
      greenwichUser: { select: { displayName: true } },
      lines: { orderBy: [{ position: "asc" }], include: { item: { select: { name: true } } } },
    },
  });
  if (beforeForNotify && after) {
    type NotifyArgs = Parameters<typeof import("@/server/notifications/order-notifications").notifyGreenwichEdited>[0];
    const payload: NotifyArgs = {
      before: beforeForNotify as NotifyArgs["before"],
      after: after as NotifyArgs["after"],
      requiresResendEstimate: after.status === "SUBMITTED" || after.status === "CHANGES_REQUESTED",
    };
    scheduleAfterResponse("notifyOrderDatesChanged", async () => {
      const { notifyGreenwichEdited } = await import("@/server/notifications/order-notifications");
      const { notifyWarehouseOrderInApp } = await import("@/server/notifications/in-app");
      await notifyGreenwichEdited(payload);
      await notifyWarehouseOrderInApp({
        orderId: id,
        title: "Даты заявки изменены",
        body: removedNames.length
          ? `Удалены недоступные позиции: ${removedNames.join(", ")}`
          : "Новый период проверен по остаткам склада",
        type: "ORDER_UPDATED",
      });
    });
  }

  return jsonOk({ ok: true, removedItems: removedNames });
}
