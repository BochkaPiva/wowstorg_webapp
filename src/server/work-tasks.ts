import type { Prisma, PrismaClient } from "@prisma/client";

type Db = Prisma.TransactionClient | PrismaClient;

const DEFAULT_COLUMNS = [
  { title: "Задачи", color: "#94a3b8", isDone: false },
  { title: "В работе", color: "#c084fc", isDone: false },
  { title: "На согласовании", color: "#facc15", isDone: false },
  { title: "Готово", color: "#5eead4", isDone: true },
] as const;

export function dateOnlyOrNull(date: Date | null | undefined): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})$/u.exec(value);
  if (!match) throw new Error("Invalid time");
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error("Invalid time");
  return hours * 60 + minutes;
}

export function timeMinutesOrNull(value: number | null | undefined): string | null {
  if (value == null) return null;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export async function ensureDefaultTaskBoard(db: Db, actorUserId: string) {
  const existing = await db.workTaskBoard.findFirst({
    where: { isDefault: true, archivedAt: null },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  return db.workTaskBoard.create({
    data: {
      title: "Рабочая доска",
      description: "Общие задачи команды Wowstorg",
      isDefault: true,
      createdById: actorUserId,
      columns: {
        create: DEFAULT_COLUMNS.map((column, index) => ({
          title: column.title,
          color: column.color,
          isDone: column.isDone,
          sortOrder: index * 1000,
          createdById: actorUserId,
        })),
      },
    },
    select: { id: true },
  });
}

export async function nextColumnSortOrder(db: Db, boardId: string): Promise<number> {
  const last = await db.workTaskColumn.findFirst({
    where: { boardId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? 0) + 1000;
}

export async function nextTaskSortOrder(db: Db, columnId: string): Promise<number> {
  const last = await db.workTask.findFirst({
    where: { columnId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? 0) + 1000;
}

export async function nextChecklistSortOrder(
  db: Db,
  taskId: string,
  parentId: string | null = null,
): Promise<number> {
  const last = await db.workTaskChecklistItem.findFirst({
    where: { taskId, parentId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? 0) + 1000;
}
