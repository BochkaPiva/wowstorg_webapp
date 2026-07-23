import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { buildProjectEstimateReadModel } from "@/server/projects/estimate-read-model";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!id?.trim()) return jsonError(400, "Некорректный id проекта");

  const [project, estimate] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      select: {
        id: true,
        archivedAt: true,
        status: true,
        contacts: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          take: 6,
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            category: true,
            roleNote: true,
          },
        },
        tasks: {
          where: { archivedAt: null },
          orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
          take: 8,
          select: {
            id: true,
            title: true,
            priority: true,
            dueDate: true,
            completedAt: true,
            assignee: { select: { displayName: true } },
            column: { select: { title: true, isDone: true } },
          },
        },
        _count: {
          select: {
            contacts: { where: { isActive: true } },
            tasks: { where: { archivedAt: null } },
            orders: true,
          },
        },
      },
    }),
    buildProjectEstimateReadModel({ projectId: id }),
  ]);

  if (!project) return jsonError(404, "Проект не найден");

  const currentVersion = estimate?.current
    ? estimate.versions.find((version) => version.id === estimate.current?.id) ?? null
    : null;

  return jsonOk({
    project: {
      id: project.id,
      status: project.status,
      archived: project.archivedAt != null,
      counts: project._count,
      contacts: project.contacts,
      tasks: project.tasks.map((task) => ({
        ...task,
        dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null,
      })),
      estimate: currentVersion
        ? {
            id: currentVersion.id,
            versionNumber: currentVersion.versionNumber,
            title: currentVersion.title,
            financials: currentVersion.financials,
          }
        : null,
    },
  });
}
