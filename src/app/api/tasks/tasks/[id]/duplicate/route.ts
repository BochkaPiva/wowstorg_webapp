import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { appendWorkTaskActivity } from "@/server/work-task-activity";
import { serializeWorkTaskCard, workTaskCardSelect } from "@/server/work-task-data";
import { nextTaskSortOrder } from "@/server/work-tasks";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const source = await prisma.workTask.findUnique({
    where: { id },
    select: {
      boardId: true,
      columnId: true,
      title: true,
      description: true,
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
      assigneeUserId: true,
      projectId: true,
      orderId: true,
      checklistItems: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          parentId: true,
          title: true,
          description: true,
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
          assigneeUserId: true,
          sortOrder: true,
        },
      },
    },
  });
  if (!source) return jsonError(404, "Задача не найдена");

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.workTask.create({
      data: {
        boardId: source.boardId,
        columnId: source.columnId,
        title: `${source.title} — копия`,
        description: source.description,
        priority: source.priority,
        color: source.color,
        startDate: source.startDate,
        dueDate: source.dueDate,
        dueTimeMinutes: source.dueTimeMinutes,
        reminderAt: source.reminderAt,
        reminderText: source.reminderText,
        priorityStickerEnabled: source.priorityStickerEnabled,
        priorityStickerConfigured: source.priorityStickerConfigured,
        deadlineStickerEnabled: source.deadlineStickerEnabled,
        reminderStickerEnabled: source.reminderStickerEnabled,
        assigneeStickerEnabled: source.assigneeStickerEnabled,
        assigneeUserId: source.assigneeUserId,
        projectId: source.projectId,
        orderId: source.orderId,
        sortOrder: await nextTaskSortOrder(tx, source.columnId),
        createdById: auth.user.id,
      },
      select: { id: true },
    });
    const copiedIds = new Map<string, string>();
    const pending = [...source.checklistItems];
    while (pending.length > 0) {
      const index = pending.findIndex((item) => !item.parentId || copiedIds.has(item.parentId));
      if (index < 0) throw new Error("Некорректное дерево подзадач");
      const [item] = pending.splice(index, 1);
      const copied = await tx.workTaskChecklistItem.create({
        data: {
          taskId: created.id,
          parentId: item.parentId ? copiedIds.get(item.parentId) ?? null : null,
          title: item.title,
          description: item.description,
          priority: item.priority,
          color: item.color,
          startDate: item.startDate,
          dueDate: item.dueDate,
          dueTimeMinutes: item.dueTimeMinutes,
          reminderAt: item.reminderAt,
          reminderText: item.reminderText,
          priorityStickerEnabled: item.priorityStickerEnabled,
          priorityStickerConfigured: item.priorityStickerConfigured,
          deadlineStickerEnabled: item.deadlineStickerEnabled,
          reminderStickerEnabled: item.reminderStickerEnabled,
          assigneeStickerEnabled: item.assigneeStickerEnabled,
          assigneeUserId: item.assigneeUserId,
          sortOrder: item.sortOrder,
          createdById: auth.user.id,
        },
        select: { id: true },
      });
      copiedIds.set(item.id, copied.id);
    }
    await appendWorkTaskActivity(tx, {
      taskId: created.id,
      actorUserId: auth.user.id,
      kind: "CREATED",
      message: `Создана копия задачи «${source.title}»`,
      metadata: { sourceTaskId: id },
    });
    return tx.workTask.findUniqueOrThrow({ where: { id: created.id }, select: workTaskCardSelect });
  });
  return jsonOk({ task: serializeWorkTaskCard(task) });
}
