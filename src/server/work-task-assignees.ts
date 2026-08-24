import type { Prisma } from "@prisma/client";

export function normalizeAssigneeUserIds(input: {
  assigneeUserIds?: string[];
  assigneeUserId?: string | null;
}): string[] | undefined {
  if (input.assigneeUserIds === undefined && input.assigneeUserId === undefined) return undefined;
  const source = input.assigneeUserIds ?? (input.assigneeUserId ? [input.assigneeUserId] : []);
  return [...new Set(source.map((id) => id.trim()).filter(Boolean))];
}

export async function syncTaskAssignees(
  tx: Prisma.TransactionClient,
  taskId: string,
  userIds: string[],
): Promise<void> {
  await tx.workTaskAssignee.deleteMany({ where: { taskId } });
  if (userIds.length > 0) {
    await tx.workTaskAssignee.createMany({
      data: userIds.map((userId) => ({ taskId, userId })),
      skipDuplicates: true,
    });
  }
}

export async function syncChecklistAssignees(
  tx: Prisma.TransactionClient,
  checklistItemId: string,
  userIds: string[],
): Promise<void> {
  await tx.workTaskChecklistAssignee.deleteMany({ where: { checklistItemId } });
  if (userIds.length > 0) {
    await tx.workTaskChecklistAssignee.createMany({
      data: userIds.map((userId) => ({ checklistItemId, userId })),
      skipDuplicates: true,
    });
  }
}
