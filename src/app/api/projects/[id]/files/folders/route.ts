import { type Prisma, ProjectActivityKind } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { appendProjectActivityLog } from "@/server/projects/activity-log";
import { assertProjectEditable } from "@/server/projects/project-guard";
import { canCreateChildFolder } from "@/server/projects/project-files";

const CreateFolderSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    parentFolderId: z.union([z.string().trim().min(1), z.null()]).optional(),
  })
  .strict();

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const parsed = CreateFolderSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  const parentFolderId = parsed.data.parentFolderId ?? null;

  const depthOk = await canCreateChildFolder(prisma, projectId, parentFolderId);
  if (!depthOk.ok) return jsonError(depthOk.status, depthOk.message);

  if (parentFolderId) {
    const parent = await prisma.projectFolder.findFirst({
      where: { id: parentFolderId, projectId },
      select: { id: true },
    });
    if (!parent) return jsonError(400, "Родительская папка не найдена");
  }

  const folder = await prisma.$transaction(async (tx) => {
    const row = await tx.projectFolder.create({
      data: {
        projectId,
        parentFolderId,
        name: parsed.data.name.trim(),
        sortOrder: 0,
        isSystem: false,
      },
      select: {
        id: true,
        parentFolderId: true,
        name: true,
        sortOrder: true,
        isSystem: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    await appendProjectActivityLog(tx, {
      projectId,
      actorUserId: auth.user.id,
      kind: ProjectActivityKind.PROJECT_FOLDER_CREATED,
      payload: {
        folderId: row.id,
        name: row.name,
        parentFolderId: row.parentFolderId,
      } as Prisma.InputJsonValue,
    });
    return row;
  });

  scheduleAfterResponse("notifyProjectFolderCreated", async () => {
    const { notifyProjectNoisyBlock } = await import("@/server/projects/project-notifications");
    await notifyProjectNoisyBlock({
      projectId,
      actorUserId: auth.user.id,
      block: "files",
      action: `Создана папка «${folder.name}».`,
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
