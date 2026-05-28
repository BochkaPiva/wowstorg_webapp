import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonOk } from "@/server/http";
import { dateOnlyOrNull } from "@/server/work-tasks";

export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const tasks = await prisma.workTask.findMany({
    where: {
      assigneeUserId: auth.user.id,
      completedAt: null,
      archivedAt: null,
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    take: 30,
    select: {
      id: true,
      title: true,
      priority: true,
      dueDate: true,
      column: { select: { title: true, color: true } },
      board: { select: { id: true, title: true } },
      project: { select: { id: true, title: true } },
      checklistItems: { select: { isDone: true } },
    },
  });

  return jsonOk({
    tasks: tasks.map((task) => ({
      ...task,
      dueDate: dateOnlyOrNull(task.dueDate),
      checklistDone: task.checklistItems.filter((item) => item.isDone).length,
      checklistTotal: task.checklistItems.length,
      checklistItems: undefined,
    })),
  });
}
