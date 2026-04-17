import { type Prisma, type PrismaClient, type ProjectActivityKind } from "@prisma/client";

type Db = Prisma.TransactionClient | PrismaClient;

export async function appendProjectActivityLog(
  db: Db,
  args: {
    projectId: string;
    actorUserId: string;
    kind: ProjectActivityKind;
    payload?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await db.projectActivityLog.create({
    data: {
      projectId: args.projectId,
      actorUserId: args.actorUserId,
      kind: args.kind,
      ...(args.payload !== undefined ? { payload: args.payload } : {}),
    },
  });
}
