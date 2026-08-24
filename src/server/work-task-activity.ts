import type { Prisma, PrismaClient, WorkTaskActivityKind } from "@prisma/client";

type Db = Prisma.TransactionClient | PrismaClient;

export async function appendWorkTaskActivity(db: Db, args: {
  taskId: string;
  actorUserId: string;
  kind: WorkTaskActivityKind;
  message?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  return db.workTaskActivity.create({
    data: {
      taskId: args.taskId,
      actorUserId: args.actorUserId,
      kind: args.kind,
      message: args.message?.trim() || null,
      ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
    },
    select: {
      id: true,
      kind: true,
      message: true,
      metadata: true,
      createdAt: true,
      actor: { select: { id: true, displayName: true } },
    },
  });
}

export function serializeWorkTaskActivity<T extends { createdAt: Date }>(activity: T) {
  return { ...activity, createdAt: activity.createdAt.toISOString() };
}
