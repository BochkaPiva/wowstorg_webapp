import { type Prisma, ProjectActivityKind } from "@prisma/client";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { putProjectFile } from "@/server/file-storage";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { appendProjectActivityLog } from "@/server/projects/activity-log";
import { assertProjectEditable } from "@/server/projects/project-guard";
import {
  PROJECT_FILE_MAX_COUNT,
  PROJECT_FILE_MAX_SINGLE_BYTES,
  PROJECT_FILE_MAX_TOTAL_BYTES,
  assertFolderInProject,
  ensureDefaultProjectFolders,
  isAllowedProjectFileMime,
  newProjectFileIdAndKey,
  sanitizeOriginalFileName,
  storageDeleteBestEffort,
} from "@/server/projects/project-files";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId } = await ctx.params;
  if (!projectId?.trim()) return jsonError(400, "Invalid id");

  const guard = await assertProjectEditable(projectId);
  if (!guard.ok) return jsonError(guard.status, guard.message);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(400, "Некорректные данные формы");
  }

  const folderIdRaw = form.get("folderId");
  const folderId = typeof folderIdRaw === "string" ? folderIdRaw.trim() : "";
  if (!folderId) return jsonError(400, "Укажите папку (folderId)");

  const file = form.get("file");
  if (!(file instanceof File)) return jsonError(400, "Добавьте файл");

  const mime = (file.type || "application/octet-stream").trim();
  if (!isAllowedProjectFileMime(mime)) {
    return jsonError(400, "Тип файла не разрешён (изображения, PDF, офисные, zip, текст/CSV)");
  }
  if (file.size > PROJECT_FILE_MAX_SINGLE_BYTES) {
    return jsonError(400, `Файл слишком большой (макс. ${Math.round(PROJECT_FILE_MAX_SINGLE_BYTES / (1024 * 1024))} МБ)`);
  }
  if (file.size <= 0) return jsonError(400, "Пустой файл");

  await ensureDefaultProjectFolders(prisma, projectId);

  const folderCheck = await assertFolderInProject(prisma, projectId, folderId);
  if (!folderCheck.ok) return jsonError(folderCheck.status, folderCheck.message);

  const [countAgg, sumAgg] = await Promise.all([
    prisma.projectFile.aggregate({
      where: { projectId },
      _count: { _all: true },
    }),
    prisma.projectFile.aggregate({
      where: { projectId },
      _sum: { sizeBytes: true },
    }),
  ]);

  if (countAgg._count._all >= PROJECT_FILE_MAX_COUNT) {
    return jsonError(400, `На проект не более ${PROJECT_FILE_MAX_COUNT} файлов`);
  }

  const used = sumAgg._sum.sizeBytes ?? 0;
  if (used + file.size > PROJECT_FILE_MAX_TOTAL_BYTES) {
    return jsonError(
      400,
      `Превышен лимит ${Math.round(PROJECT_FILE_MAX_TOTAL_BYTES / (1024 * 1024))} МБ на проект`,
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const originalName = sanitizeOriginalFileName(file.name || "file");
  const { fileId, storageKey } = newProjectFileIdAndKey(projectId);

  try {
    await putProjectFile(storageKey, buf, mime);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ошибка хранилища";
    console.error("[project-file] upload failed:", msg);
    return jsonError(500, `Не удалось сохранить файл: ${msg}`);
  }

  try {
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.projectFile.create({
        data: {
          id: fileId,
          projectId,
          folderId,
          storageKey,
          originalName,
          mimeType: mime,
          sizeBytes: file.size,
          uploadedById: auth.user.id,
        },
        select: {
          id: true,
          folderId: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
          uploadedBy: { select: { displayName: true } },
        },
      });
      await appendProjectActivityLog(tx, {
        projectId,
        actorUserId: auth.user.id,
        kind: ProjectActivityKind.PROJECT_FILE_UPLOADED,
        payload: {
          fileId: created.id,
          originalName: created.originalName,
          sizeBytes: created.sizeBytes,
          folderId: created.folderId,
        } as Prisma.InputJsonValue,
      });
      return created;
    });

    scheduleAfterResponse("notifyProjectFileUploaded", async () => {
      const { notifyProjectNoisyBlock } = await import("@/server/projects/project-notifications");
      await notifyProjectNoisyBlock({
        projectId,
        actorUserId: auth.user.id,
        block: "files",
        action: `Загружен файл «${row.originalName}».`,
      });
    });

    return jsonOk({
      file: {
        ...row,
        createdAt: row.createdAt.toISOString(),
      },
    });
  } catch (e) {
    await storageDeleteBestEffort(storageKey);
    throw e;
  }
}
