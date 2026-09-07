import { ProjectStatus, type Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/server/db";
import { storageDeleteBestEffort } from "@/server/projects/project-files";

type DbClient = PrismaClient | Prisma.TransactionClient;

export const PROJECT_CLEANUP_SORT_VALUES = ["updated_desc", "updated_asc", "created_desc", "title_asc"] as const;
type ProjectCleanupSort = (typeof PROJECT_CLEANUP_SORT_VALUES)[number];

export type ProjectCleanupListRow = {
  id: string;
  title: string;
  customerName: string | null;
  ownerName: string;
  updatedAt: string;
  createdAt: string;
  archivedAt: string | null;
  ordersCount: number;
  filesCount: number;
  tasksCount: number;
};

export type ProjectCleanupPreview = {
  selectedProjectIds: string[];
  missingProjectIds: string[];
  nonCompletedProjects: Array<{ id: string; title: string; status: string }>;
  projectsCount: number;
  ordersToDetachCount: number;
  tasksToDetachCount: number;
  filesCount: number;
  filesSizeBytes: number;
  estimateVersionsCount: number;
  estimateSectionsCount: number;
  contactsCount: number;
  activityLogsCount: number;
  scheduleDaysCount: number;
  workspaceItemsCount: number;
};

export class ProjectCleanupError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function projectOrderBy(sort: ProjectCleanupSort): Prisma.ProjectOrderByWithRelationInput[] {
  switch (sort) {
    case "updated_asc": return [{ updatedAt: "asc" }, { title: "asc" }];
    case "created_desc": return [{ createdAt: "desc" }, { title: "asc" }];
    case "title_asc": return [{ title: "asc" }];
    case "updated_desc":
    default: return [{ updatedAt: "desc" }, { title: "asc" }];
  }
}

export async function listProjectsForCleanup(
  db: DbClient,
  filters: { q?: string; sort?: ProjectCleanupSort },
): Promise<ProjectCleanupListRow[]> {
  const q = filters.q?.trim();
  const projects = await db.project.findMany({
    where: {
      status: ProjectStatus.COMPLETED,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { leadCustomerName: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
              { owner: { displayName: { contains: q, mode: "insensitive" } } },
              { id: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: projectOrderBy(filters.sort ?? "updated_desc"),
    take: 500,
    select: {
      id: true,
      title: true,
      customer: { select: { name: true } },
      leadCustomerName: true,
      owner: { select: { displayName: true } },
      updatedAt: true,
      createdAt: true,
      archivedAt: true,
      _count: { select: { orders: true, projectFiles: true, tasks: true } },
    },
  });

  return projects.map((project) => ({
    id: project.id,
    title: project.title,
    customerName: project.customer?.name ?? project.leadCustomerName ?? null,
    ownerName: project.owner.displayName,
    updatedAt: project.updatedAt.toISOString(),
    createdAt: project.createdAt.toISOString(),
    archivedAt: project.archivedAt?.toISOString() ?? null,
    ordersCount: project._count.orders,
    filesCount: project._count.projectFiles,
    tasksCount: project._count.tasks,
  }));
}

async function prepareProjectCleanup(db: DbClient, rawProjectIds: string[]) {
  const requestedIds = uniqueIds(rawProjectIds);
  const projects = requestedIds.length
    ? await db.project.findMany({
        where: { id: { in: requestedIds } },
        select: { id: true, title: true, status: true },
      })
    : [];
  const existing = new Set(projects.map((project) => project.id));
  const completedProjectIds = projects
    .filter((project) => project.status === ProjectStatus.COMPLETED)
    .map((project) => project.id);
  const nonCompletedProjects = projects
    .filter((project) => project.status !== ProjectStatus.COMPLETED)
    .map((project) => ({ id: project.id, title: project.title, status: project.status }));
  const missingProjectIds = requestedIds.filter((id) => !existing.has(id));

  const [ordersToDetachCount, tasksToDetachCount, files, estimateVersionsCount, estimateSectionsCount, contactsCount, activityLogsCount, scheduleDaysCount, workspaceItemsCount] =
    await Promise.all([
      db.order.count({ where: { projectId: { in: completedProjectIds } } }),
      db.workTask.count({ where: { projectId: { in: completedProjectIds } } }),
      db.projectFile.findMany({ where: { projectId: { in: completedProjectIds } }, select: { sizeBytes: true } }),
      db.projectEstimateVersion.count({ where: { projectId: { in: completedProjectIds } } }),
      db.projectEstimateSection.count({ where: { version: { projectId: { in: completedProjectIds } } } }),
      db.projectContact.count({ where: { projectId: { in: completedProjectIds } } }),
      db.projectActivityLog.count({ where: { projectId: { in: completedProjectIds } } }),
      db.projectScheduleDay.count({ where: { projectId: { in: completedProjectIds } } }),
      db.projectWorkspaceItem.count({ where: { projectId: { in: completedProjectIds } } }),
    ]);

  return {
    requestedIds,
    completedProjectIds,
    missingProjectIds,
    nonCompletedProjects,
    preview: {
      selectedProjectIds: completedProjectIds,
      missingProjectIds,
      nonCompletedProjects,
      projectsCount: completedProjectIds.length,
      ordersToDetachCount,
      tasksToDetachCount,
      filesCount: files.length,
      filesSizeBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0),
      estimateVersionsCount,
      estimateSectionsCount,
      contactsCount,
      activityLogsCount,
      scheduleDaysCount,
      workspaceItemsCount,
    } satisfies ProjectCleanupPreview,
  };
}

export async function previewProjectCleanupSelection(db: DbClient, projectIds: string[]) {
  return (await prepareProjectCleanup(db, projectIds)).preview;
}

export async function deleteProjectsForCleanup(rawProjectIds: string[]) {
  const prepared = await prepareProjectCleanup(prisma, rawProjectIds);
  if (prepared.requestedIds.length === 0) throw new ProjectCleanupError(400, "Не выбраны проекты для удаления");
  if (prepared.completedProjectIds.length === 0 && prepared.missingProjectIds.length > 0) {
    throw new ProjectCleanupError(404, "Выбранные проекты не найдены", { missingProjectIds: prepared.missingProjectIds });
  }
  if (prepared.nonCompletedProjects.length > 0) {
    throw new ProjectCleanupError(409, "Удалять можно только завершённые проекты", { projects: prepared.nonCompletedProjects });
  }

  const storageKeys = await prisma.$transaction(async (tx) => {
    const stillCompleted = await tx.project.count({
      where: { id: { in: prepared.completedProjectIds }, status: ProjectStatus.COMPLETED },
    });
    if (stillCompleted !== prepared.completedProjectIds.length) {
      throw new ProjectCleanupError(409, "Статус одного из проектов изменился. Обновите список и повторите удаление.");
    }

    const projectFiles = await tx.projectFile.findMany({
      where: { projectId: { in: prepared.completedProjectIds } },
      select: { storageKey: true },
    });

    await tx.order.updateMany({ where: { projectId: { in: prepared.completedProjectIds } }, data: { projectId: null } });
    await tx.workTask.updateMany({ where: { projectId: { in: prepared.completedProjectIds } }, data: { projectId: null } });
    await tx.standaloneEstimate.updateMany({
      where: { convertedProjectId: { in: prepared.completedProjectIds } },
      data: { convertedProjectId: null },
    });
    // Файлы ссылаются на папки через Restrict: удаляем метаданные явно до дерева папок.
    await tx.projectFile.deleteMany({
      where: { projectId: { in: prepared.completedProjectIds } },
    });
    // Самоссылка папок тоже использует Restrict, поэтому сначала разрываем дерево.
    await tx.projectFolder.updateMany({
      where: { projectId: { in: prepared.completedProjectIds } },
      data: { parentFolderId: null },
    });
    await tx.projectFolder.deleteMany({
      where: { projectId: { in: prepared.completedProjectIds } },
    });
    await tx.project.deleteMany({
      where: { id: { in: prepared.completedProjectIds }, status: ProjectStatus.COMPLETED },
    });
    return projectFiles.map((file) => file.storageKey);
  });

  await Promise.all(storageKeys.map((key) => storageDeleteBestEffort(key)));

  return {
    deletedProjectCount: prepared.completedProjectIds.length,
    detachedOrdersCount: prepared.preview.ordersToDetachCount,
    detachedTasksCount: prepared.preview.tasksToDetachCount,
    deletedProjectFilesCount: storageKeys.length,
    missingProjectIds: prepared.missingProjectIds,
  };
}
