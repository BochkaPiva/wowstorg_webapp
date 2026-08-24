import { prisma } from "@/server/db";

export type SaveServiceFeedbackResult =
  | { ok: true; feedback: Awaited<ReturnType<typeof saveFeedbackRecord>> }
  | { ok: false; code: "NOT_FOUND" | "COMMENT_REQUIRED"; message: string };

const eligibleOrderWhere = (userId: string, orderId: string) => ({
  id: orderId,
  greenwichUserId: userId,
  source: "GREENWICH_INTERNAL" as const,
  status: "CLOSED" as const,
  parentOrderId: null,
});

async function saveFeedbackRecord(args: {
  orderId: string;
  greenwichUserId: string;
  rating: number;
  comment: string;
}) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: eligibleOrderWhere(args.greenwichUserId, args.orderId),
      select: { id: true, closedAt: true, updatedAt: true },
    });
    if (!order) return null;

    const feedback = await tx.orderServiceFeedback.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        authorId: args.greenwichUserId,
        rating: args.rating,
        comment: args.comment || null,
      },
      update: {
        authorId: args.greenwichUserId,
        rating: args.rating,
        comment: args.comment || null,
      },
      select: { id: true, orderId: true, rating: true, comment: true, updatedAt: true },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { serviceFeedbackPromptDismissedAt: null },
    });
    await tx.order.updateMany({
      where: {
        greenwichUserId: args.greenwichUserId,
        source: "GREENWICH_INTERNAL",
        status: "CLOSED",
        parentOrderId: null,
        id: { not: order.id },
        closedAt: { lte: order.closedAt ?? order.updatedAt },
        serviceFeedback: { is: null },
        serviceFeedbackPromptDismissedAt: null,
      },
      data: { serviceFeedbackPromptDismissedAt: new Date() },
    });
    return feedback;
  });
}

export async function saveGreenwichServiceFeedback(args: {
  orderId: string;
  greenwichUserId: string;
  rating: number;
  comment?: string;
}): Promise<SaveServiceFeedbackResult> {
  const comment = args.comment?.trim() ?? "";
  if (!Number.isInteger(args.rating) || args.rating < 1 || args.rating > 5) {
    return { ok: false, code: "NOT_FOUND", message: "Некорректная оценка" };
  }
  if (args.rating <= 3 && comment.length < 3) {
    return {
      ok: false,
      code: "COMMENT_REQUIRED",
      message: "Для 1–3 звёзд добавьте короткий комментарий на сайте — так мы поймём, что исправить",
    };
  }
  const feedback = await saveFeedbackRecord({ ...args, comment });
  if (!feedback) {
    return { ok: false, code: "NOT_FOUND", message: "Оценить можно только свою закрытую заявку" };
  }
  return { ok: true, feedback };
}
