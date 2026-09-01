import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { serializeProjectFreeBoardItem } from "@/server/projects/free-board";

function formatDate(value: Date | null) {
  return value?.toLocaleDateString("ru-RU", { timeZone: "Asia/Omsk" }) ?? "Без срока";
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!id?.trim()) return jsonError(400, "Invalid id");

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      archivedAt: true,
      widgets: {
        where: { type: "FREE_BOARD" },
        take: 1,
        select: { id: true, isVisible: true, revision: true },
      },
    },
  });
  if (!project) return jsonError(404, "Проект не найден");

  const widget = project.widgets[0];
  if (!widget) return jsonError(404, "Свободная доска не подключена к проекту");

  const [storedItems, tasks, orders, files, estimateSections] = await Promise.all([
    prisma.projectWorkspaceItem.findMany({
      where: { projectId: id, widgetId: widget.id, deletedAt: null },
      orderBy: [{ zIndex: "asc" }, { createdAt: "asc" }],
    }),
    prisma.workTask.findMany({
      where: { projectId: id, archivedAt: null },
      orderBy: [{ completedAt: "asc" }, { dueDate: "asc" }, { updatedAt: "desc" }],
      take: 200,
      select: { id: true, title: true, dueDate: true, completedAt: true, column: { select: { title: true } } },
    }),
    prisma.order.findMany({
      where: { projectId: id },
      orderBy: [{ readyByDate: "asc" }, { updatedAt: "desc" }],
      take: 200,
      select: { id: true, eventName: true, readyByDate: true, status: true, customer: { select: { name: true } } },
    }),
    prisma.projectFile.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
    }),
    prisma.projectEstimateSection.findMany({
      where: { version: { projectId: id } },
      orderBy: [{ version: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      take: 200,
      select: {
        id: true,
        title: true,
        kind: true,
        version: { select: { versionNumber: true, title: true } },
      },
    }),
  ]);

  const invalidItemIds: string[] = [];
  const items = storedItems.flatMap((item) => {
    const serialized = serializeProjectFreeBoardItem(item);
    if (!serialized) {
      invalidItemIds.push(item.id);
      return [];
    }
    return [serialized];
  });

  return jsonOk({
    board: {
      widgetId: widget.id,
      widgetRevision: widget.revision,
      readOnly: Boolean(project.archivedAt),
      items,
      invalidItemIds,
      linkables: {
        tasks: tasks.map((task) => ({
          id: task.id,
          label: task.title,
          meta: `${task.completedAt ? "Выполнено" : task.column.title} · ${formatDate(task.dueDate)}`,
          href: `/tasks?projectId=${encodeURIComponent(id)}`,
        })),
        orders: orders.map((order) => ({
          id: order.id,
          label: order.eventName?.trim() || order.customer.name,
          meta: `${order.customer.name} · готовность ${formatDate(order.readyByDate)}`,
          href: `/orders/${encodeURIComponent(order.id)}?from=project`,
        })),
        files: files.map((file) => ({
          id: file.id,
          label: file.originalName,
          meta: `${file.mimeType || "Файл"} · ${Math.max(1, Math.round(file.sizeBytes / 1024))} КБ`,
          href: `/projects/${encodeURIComponent(id)}#project-module-files`,
        })),
        estimateSections: estimateSections.map((section) => ({
          id: section.id,
          label: section.title,
          meta: `${section.version.title?.trim() || `Смета ${section.version.versionNumber}`} · ${section.kind}`,
          href: `/projects/${encodeURIComponent(id)}#project-module-estimate`,
        })),
      },
    },
  });
}
