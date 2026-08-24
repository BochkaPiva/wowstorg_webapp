import { Prisma } from "@prisma/client";

import { dateOnlyOrNull } from "@/server/work-tasks";

export const workTaskCardSelect = Prisma.validator<Prisma.WorkTaskSelect>()({
  id: true,
  title: true,
  description: true,
  priority: true,
  color: true,
  sortOrder: true,
  dueDate: true,
  reminderAt: true,
  completedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  assignee: { select: { id: true, displayName: true } },
  project: { select: { id: true, title: true } },
  order: { select: { id: true, eventName: true, customer: { select: { name: true } } } },
  checklistItems: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      title: true,
      description: true,
      isDone: true,
      sortOrder: true,
      priority: true,
      color: true,
      dueDate: true,
      reminderAt: true,
      completedAt: true,
      updatedAt: true,
      assignee: { select: { id: true, displayName: true } },
    },
  },
  _count: { select: { activities: { where: { kind: "COMMENT" } } } },
  activities: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { kind: true, createdAt: true },
  },
});

export type WorkTaskCardRecord = Prisma.WorkTaskGetPayload<{ select: typeof workTaskCardSelect }>;

function isoOrNull(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null;
}

export function serializeWorkTaskCard(task: WorkTaskCardRecord) {
  return {
    ...task,
    dueDate: dateOnlyOrNull(task.dueDate),
    reminderAt: isoOrNull(task.reminderAt),
    completedAt: isoOrNull(task.completedAt),
    archivedAt: isoOrNull(task.archivedAt),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    checklistItems: task.checklistItems.map((item) => ({
      ...item,
      dueDate: dateOnlyOrNull(item.dueDate),
      reminderAt: isoOrNull(item.reminderAt),
      completedAt: isoOrNull(item.completedAt),
      updatedAt: item.updatedAt.toISOString(),
    })),
    checklistDone: task.checklistItems.filter((item) => item.isDone).length,
    checklistTotal: task.checklistItems.length,
    commentCount: task._count.activities,
    lastActivityAt: task.activities[0]?.createdAt.toISOString() ?? null,
    lastActivityKind: task.activities[0]?.kind ?? null,
    _count: undefined,
    activities: undefined,
  };
}
