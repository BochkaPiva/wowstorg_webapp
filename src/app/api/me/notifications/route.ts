import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

const QuerySchema = z.object({
  view: z.enum(["active", "history", "all"]).default("active"),
  limit: z
    .string()
    .regex(/^\d+$/)
    .optional(),
  after: z.string().datetime().optional(),
  afterId: z.string().optional(),
});

const MarkReadSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100).optional(),
  markAll: z.boolean().optional(),
});

const DeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100).optional(),
  deleteAll: z.boolean().optional(),
});

export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    view: url.searchParams.get("view") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    after: url.searchParams.get("after") ?? undefined,
    afterId: url.searchParams.get("afterId") ?? undefined,
  });
  if (!parsed.success) return jsonError(400, "Invalid query", parsed.error.flatten());

  const limit = parsed.data.limit ? Math.min(100, Number(parsed.data.limit)) : 30;
  const afterDate = parsed.data.after ? new Date(parsed.data.after) : null;
  const visibilityWhere: Prisma.InAppNotificationWhereInput =
    parsed.data.view === "active"
      ? { isRead: false }
      : parsed.data.view === "history"
        ? { isRead: true }
        : {};
  const cursorWhere: Prisma.InAppNotificationWhereInput = afterDate
    ? {
        OR: [
          { createdAt: { gt: afterDate } },
          ...(parsed.data.afterId
            ? [{ createdAt: afterDate, id: { gt: parsed.data.afterId } } satisfies Prisma.InAppNotificationWhereInput]
            : []),
        ],
      }
    : {};

  const [rows, unreadCount, latest] = await Promise.all([
    prisma.inAppNotification.findMany({
      where: {
        userId: auth.user.id,
        ...visibilityWhere,
        ...cursorWhere,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        payloadJson: true,
        isRead: true,
        createdAt: true,
      },
    }),
    prisma.inAppNotification.count({
      where: { userId: auth.user.id, isRead: false },
    }),
    prisma.inAppNotification.findFirst({
      where: { userId: auth.user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, createdAt: true },
    }),
  ]);

  return jsonOk({
    rows,
    unreadCount,
    cursor: latest
      ? { id: latest.id, createdAt: latest.createdAt.toISOString() }
      : { id: "", createdAt: new Date().toISOString() },
  });
}

export async function PATCH(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const parsed = MarkReadSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  if (!parsed.data.markAll && (!parsed.data.ids || parsed.data.ids.length === 0)) {
    return jsonError(400, "Provide ids or markAll=true");
  }

  const where = parsed.data.markAll
    ? { userId: auth.user.id, isRead: false }
    : { userId: auth.user.id, id: { in: parsed.data.ids! } };

  const result = await prisma.inAppNotification.updateMany({
    where,
    data: { isRead: true },
  });

  return jsonOk({ ok: true, updated: result.count });
}

export async function DELETE(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = { deleteAll: true };
  }

  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  if (!parsed.data.deleteAll && (!parsed.data.ids || parsed.data.ids.length === 0)) {
    return jsonError(400, "Provide ids or deleteAll=true");
  }

  const where = parsed.data.deleteAll
    ? { userId: auth.user.id }
    : { userId: auth.user.id, id: { in: parsed.data.ids! } };

  const result = await prisma.inAppNotification.deleteMany({ where });
  return jsonOk({ ok: true, deleted: result.count });
}
