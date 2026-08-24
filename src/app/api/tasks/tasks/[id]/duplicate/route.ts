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
      dueDate: true,
      reminderAt: true,
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
          dueDate: true,
          reminderAt: true,
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
        dueDate: source.dueDate,
        reminderAt: source.reminderAt,
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
          dueDate: item.dueDate,
          reminderAt: item.reminderAt,
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
