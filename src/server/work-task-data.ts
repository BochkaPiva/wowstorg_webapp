import { Prisma } from "@prisma/client";

import { dateOnlyOrNull, timeMinutesOrNull } from "@/server/work-tasks";

export const workTaskCardSelect = Prisma.validator<Prisma.WorkTaskSelect>()({
  id: true,
  title: true,
  description: true,
  priority: true,
  color: true,
  sortOrder: true,
  startDate: true,
  dueDate: true,
  dueTimeMinutes: true,
  reminderAt: true,
  reminderText: true,
  priorityStickerEnabled: true,
  priorityStickerConfigured: true,
  deadlineStickerEnabled: true,
  reminderStickerEnabled: true,
  assigneeStickerEnabled: true,
  completedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  assignee: { select: { id: true, displayName: true } },
  assignees: {
    orderBy: { assignedAt: "asc" },
    select: { user: { select: { id: true, displayName: true } } },
  },
  project: { select: { id: true, title: true } },
  order: { select: { id: true, eventName: true, customer: { select: { name: true } } } },
  checklistItems: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      parentId: true,
      title: true,
      description: true,
      isDone: true,
      sortOrder: true,
      priority: true,
      color: true,
      startDate: true,
      dueDate: true,
      dueTimeMinutes: true,
      reminderAt: true,
      reminderText: true,
      priorityStickerEnabled: true,
      priorityStickerConfigured: true,
      deadlineStickerEnabled: true,
      reminderStickerEnabled: true,
      assigneeStickerEnabled: true,
      completedAt: true,
      updatedAt: true,
      assignee: { select: { id: true, displayName: true } },
      assignees: {
        orderBy: { assignedAt: "asc" },
        select: { user: { select: { id: true, displayName: true } } },
      },
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
  const taskAssignees = task.assignees.map((assignment) => assignment.user);
  return {
    ...task,
    assignees: taskAssignees.length > 0 ? taskAssignees : task.assignee ? [task.assignee] : [],
    startDate: dateOnlyOrNull(task.startDate),
    dueDate: dateOnlyOrNull(task.dueDate),
    dueTime: timeMinutesOrNull(task.dueTimeMinutes),
    dueTimeMinutes: undefined,
    reminderAt: isoOrNull(task.reminderAt),
    completedAt: isoOrNull(task.completedAt),
    archivedAt: isoOrNull(task.archivedAt),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    checklistItems: task.checklistItems.map((item) => {
      const itemAssignees = item.assignees.map((assignment) => assignment.user);
      return {
        ...item,
        assignees: itemAssignees.length > 0 ? itemAssignees : item.assignee ? [item.assignee] : [],
        startDate: dateOnlyOrNull(item.startDate),
        dueDate: dateOnlyOrNull(item.dueDate),
        dueTime: timeMinutesOrNull(item.dueTimeMinutes),
        dueTimeMinutes: undefined,
        reminderAt: isoOrNull(item.reminderAt),
        completedAt: isoOrNull(item.completedAt),
        updatedAt: item.updatedAt.toISOString(),
      };
    }),
    checklistDone: task.checklistItems.filter((item) => item.isDone).length,
    checklistTotal: task.checklistItems.length,
    commentCount: task._count.activities,
    lastActivityAt: task.activities[0]?.createdAt.toISOString() ?? null,
    lastActivityKind: task.activities[0]?.kind ?? null,
    _count: undefined,
    activities: undefined,
  };
}
