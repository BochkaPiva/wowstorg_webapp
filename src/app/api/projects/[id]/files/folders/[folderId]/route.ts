import { type Prisma, ProjectActivityKind } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { appendProjectActivityLog } from "@/server/projects/activity-log";
import { assertProjectEditable } from "@/server/projects/project-guard";

const PatchFolderSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
  })
  .strict();

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; folderId: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId, folderId } = await ctx.params;
  if (!projectId?.trim() || !folderId?.trim()) return jsonError(400, "Invalid id");

  const guard = await assertProjectEditable(projectId);
  if (!guard.ok) return jsonError(guard.status, guard.message);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const parsed = PatchFolderSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  let folder: {
    id: string;
    parentFolderId: string | null;
    name: string;
    sortOrder: number;
    isSystem: boolean;
    createdAt: Date;
    updatedAt: Date;
  };

  try {
    folder = await prisma.$transaction(async (tx) => {
      const before = await tx.projectFolder.findFirst({
        where: { id: folderId, projectId },
        select: { id: true, name: true },
      });
      if (!before) {
        throw new Error("NOT_FOUND");
      }
      const nextName = parsed.data.name.trim();
      const selectOut = {
        id: true,
        parentFolderId: true,
        name: true,
        sortOrder: true,
        isSystem: true,
        createdAt: true,
        updatedAt: true,
      } as const;
      if (before.name === nextName) {
        const same = await tx.projectFolder.findFirst({
          where: { id: folderId },
          select: selectOut,
        });
        if (!same) throw new Error("NOT_FOUND");
        return same;
      }
      const row = await tx.projectFolder.update({
        where: { id: folderId },
        data: { name: nextName },
        select: selectOut,
      });
      await appendProjectActivityLog(tx, {
        projectId,
        actorUserId: auth.user.id,
        kind: ProjectActivityKind.PROJECT_FOLDER_RENAMED,
        payload: {
          folderId: row.id,
          from: before.name,
          to: row.name,
        } as Prisma.InputJsonValue,
      });
      return row;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return jsonError(404, "Папка не найдена");
    }
    throw e;
  }

  scheduleAfterResponse("notifyProjectFolderRenamed", async () => {
    const { notifyProjectNoisyBlock } = await import("@/server/projects/project-notifications");
    await notifyProjectNoisyBlock({
      projectId,
      actorUserId: auth.user.id,
      block: "files",
      action: `Переименована папка в «${folder.name}».`,
    });
  });

  return jsonOk({
    folder: {
      ...folder,
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; folderId: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId, folderId } = await ctx.params;
  if (!projectId?.trim() || !folderId?.trim()) return jsonError(400, "Invalid id");

  const guard = await assertProjectEditable(projectId);
  if (!guard.ok) return jsonError(guard.status, guard.message);

  try {
    await prisma.$transaction(async (tx) => {
      const row = await tx.projectFolder.findFirst({
        where: { id: folderId, projectId },
        select: { id: true, name: true, isSystem: true },
      });
      if (!row) {
        throw new Error("NOT_FOUND");
      }
      if (row.isSystem) {
        throw new Error("SYSTEM");
      }
      const childCount = await tx.projectFolder.count({
        where: { parentFolderId: folderId, projectId },
      });
      if (childCount > 0) {
        throw new Error("NOT_EMPTY_CHILDREN");
      }
      const fileCount = await tx.projectFile.count({ where: { folderId } });
      if (fileCount > 0) {
        throw new Error("NOT_EMPTY_FILES");
      }
      await tx.projectFolder.delete({ where: { id: folderId } });
      await appendProjectActivityLog(tx, {
        projectId,
        actorUserId: auth.user.id,
        kind: ProjectActivityKind.PROJECT_FOLDER_DELETED,
        payload: {
          folderId: row.id,
          name: row.name,
        } as Prisma.InputJsonValue,
      });
    });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "NOT_FOUND") return jsonError(404, "Папка не найдена");
      if (e.message === "SYSTEM") {
        return jsonError(400, "Системную папку нельзя удалить");
      }
      if (e.message === "NOT_EMPTY_CHILDREN") {
        return jsonError(400, "Сначала удалите вложенные папки");
      }
      if (e.message === "NOT_EMPTY_FILES") {
        return jsonError(400, "Сначала удалите файлы в папке");
      }
    }
    throw e;
  }

  scheduleAfterResponse("notifyProjectFolderDeleted", async () => {
    const { notifyProjectNoisyBlock } = await import("@/server/projects/project-notifications");
    await notifyProjectNoisyBlock({
      projectId,
      actorUserId: auth.user.id,
      block: "files",
      action: "Удалена папка проекта.",
    });
  });

  return jsonOk({ ok: true });
}
