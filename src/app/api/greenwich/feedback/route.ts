import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("SUBMIT"),
    orderId: z.string().min(1),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(2000).optional().default(""),
  }),
  z.object({
    action: z.literal("SKIP"),
    orderId: z.string().min(1),
  }),
]);

const eligibleOrderWhere = (userId: string, orderId?: string) => ({
  ...(orderId ? { id: orderId } : {}),
  greenwichUserId: userId,
  source: "GREENWICH_INTERNAL" as const,
  status: "CLOSED" as const,
  parentOrderId: null,
});

export async function GET() {
  const auth = await requireRole("GREENWICH");
  if (!auth.ok) return auth.response;

  const order = await prisma.order.findFirst({
    where: {
      ...eligibleOrderWhere(auth.user.id),
      serviceFeedback: { is: null },
      serviceFeedbackPromptDismissedAt: null,
    },
    orderBy: [{ closedAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      eventName: true,
      closedAt: true,
      endDate: true,
      customer: { select: { name: true } },
    },
  });

  return jsonOk({ pending: order });
}

export async function POST(req: Request) {
  const auth = await requireRole("GREENWICH");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Некорректный JSON");
  }
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Некорректные данные оценки", parsed.error.flatten());

  if (parsed.data.action === "SKIP") {
    const skipped = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: {
          ...eligibleOrderWhere(auth.user.id, parsed.data.orderId),
          serviceFeedback: { is: null },
        },
        select: { id: true, closedAt: true, updatedAt: true },
      });
      if (!order) return false;
      const now = new Date();
      await tx.order.update({ where: { id: order.id }, data: { serviceFeedbackPromptDismissedAt: now } });
      await tx.order.updateMany({
        where: {
          ...eligibleOrderWhere(auth.user.id),
          id: { not: order.id },
          closedAt: { lte: order.closedAt ?? order.updatedAt },
          serviceFeedback: { is: null },
          serviceFeedbackPromptDismissedAt: null,
        },
        data: { serviceFeedbackPromptDismissedAt: now },
      });
      return true;
    });
    if (!skipped) return jsonError(404, "Закрытая заявка для оценки не найдена");
    return jsonOk({ skipped: true });
  }

  const input = parsed.data;
  if (input.rating <= 3 && input.comment.trim().length < 3) {
    return jsonError(400, "Для оценки от 1 до 3 звёзд расскажите, что можно улучшить");
  }

  const feedback = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: eligibleOrderWhere(auth.user.id, input.orderId),
      select: { id: true, closedAt: true, updatedAt: true },
    });
    if (!order) return null;

    const saved = await tx.orderServiceFeedback.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        authorId: auth.user.id,
        rating: input.rating,
        comment: input.comment.trim() || null,
      },
      update: {
        authorId: auth.user.id,
        rating: input.rating,
        comment: input.comment.trim() || null,
      },
      select: { id: true, orderId: true, rating: true, comment: true, updatedAt: true },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { serviceFeedbackPromptDismissedAt: null },
    });
    await tx.order.updateMany({
      where: {
        ...eligibleOrderWhere(auth.user.id),
        id: { not: order.id },
        closedAt: { lte: order.closedAt ?? order.updatedAt },
        serviceFeedback: { is: null },
        serviceFeedbackPromptDismissedAt: null,
      },
      data: { serviceFeedbackPromptDismissedAt: new Date() },
    });
    return saved;
  });

  if (!feedback) return jsonError(404, "Оценить можно только свою основную закрытую заявку");
  return jsonOk({ feedback });
}
