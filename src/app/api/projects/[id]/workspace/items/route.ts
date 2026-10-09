import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { serializeProjectFreeBoardItem } from "@/server/projects/free-board";
import { PROJECT_CONTRACTOR_STATUS_LABEL, type ProjectContractorStatus } from "@/lib/projects/project-contractors";

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

  const [storedItems, tasks, orders, files, estimateSections, contractors, contacts, scheduleSlots, proposals] = await Promise.all([
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
    prisma.projectContractor.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, categoryNames: true, status: true, responsibility: true, phone: true, email: true, contractorId: true, contractor: { select: { assets: { where: { kind: "PHOTO" }, take: 1, orderBy: { sortOrder: "asc" }, select: { id: true } } } } } }),
    prisma.projectContact.findMany({ where: { projectId: id }, orderBy: { sortOrder: "asc" }, select: { id: true, fullName: true, roleNote: true, phone: true, email: true, isActive: true } }),
    prisma.projectScheduleSlot.findMany({ where: { day: { projectId: id } }, orderBy: [{ day: { sortOrder: "asc" } }, { sortOrder: "asc" }], select: { id: true, description: true, intervalText: true, day: { select: { dateNote: true } }, contractorAssignments: { where: { status: { not: "CANCELLED" } }, select: { name: true } } } }),
    prisma.projectProposal.findMany({ where: { projectId: id }, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, status: true, isCurrent: true, _count: { select: { variants: true } } } }),
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
          href: `/projects/${encodeURIComponent(id)}#project-widget-files`,
        })),
        estimateSections: estimateSections.map((section) => ({
          id: section.id,
          label: section.title,
          meta: `${section.version.title?.trim() || `Смета ${section.version.versionNumber}`} · ${section.kind}`,
          href: `/projects/${encodeURIComponent(id)}#project-widget-estimate`,
        })),
        contractors: contractors.map((row) => ({ id: row.id, label: row.name, meta: [row.categoryNames.join(" · "), PROJECT_CONTRACTOR_STATUS_LABEL[row.status as ProjectContractorStatus]].filter(Boolean).join(" · "), description: row.responsibility, phone: row.phone, email: row.email, inactive: row.status === "CANCELLED", photoUrl: row.contractor?.assets[0] ? `/api/contractors/${row.contractorId}/assets/${row.contractor.assets[0].id}` : null, href: `/projects/${encodeURIComponent(id)}#project-widget-contractors` })),
        contacts: contacts.map((row) => ({ id: row.id, label: row.fullName, meta: row.roleNote || "Контакт проекта", phone: row.phone, email: row.email, inactive: !row.isActive, href: `/projects/${encodeURIComponent(id)}#project-widget-contacts` })),
        scheduleSlots: scheduleSlots.map((row) => ({ id: row.id, label: row.description, meta: `${row.day.dateNote} · ${row.intervalText}`, description: row.contractorAssignments.map((person) => person.name).join(" · "), href: `/projects/${encodeURIComponent(id)}#project-widget-schedule` })),
        proposals: proposals.map((row) => ({ id: row.id, label: row.title, meta: `${row.isCurrent ? "Текущее КП" : "Предыдущее КП"} · ${row._count.variants} вариантов`, inactive: !row.isCurrent, href: `/projects/${encodeURIComponent(id)}#project-widget-event-builder` })),
      },
    },
  });
}
