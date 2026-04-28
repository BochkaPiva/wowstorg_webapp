import { z } from "zod";

import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

const QuerySchema = z.object({
  unreadOnly: z
    .union([z.literal("true"), z.literal("false")])
    .optional(),
  limit: z
    .string()
    .regex(/^\d+$/)
    .optional(),
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
    unreadOnly: url.searchParams.get("unreadOnly") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return jsonError(400, "Invalid query", parsed.error.flatten());

  const unreadOnly = parsed.data.unreadOnly === "true";
  const limit = parsed.data.limit ? Math.min(100, Number(parsed.data.limit)) : 30;

  const rows = await prisma.inAppNotification.findMany({
    where: {
      userId: auth.user.id,
      ...(unreadOnly ? { isRead: false } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
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
  });

  const unreadCount = await prisma.inAppNotification.count({
    where: { userId: auth.user.id, isRead: false },
  });

  return jsonOk({ rows, unreadCount });
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
