import { type Prisma, ProjectActivityKind } from "@prisma/client";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { deleteProjectFile, getProjectFile } from "@/server/file-storage";
import { jsonError, jsonOk } from "@/server/http";
import { appendProjectActivityLog } from "@/server/projects/activity-log";
import { assertProjectEditable } from "@/server/projects/project-guard";
import { removeProjectFileFromDbAndStorage } from "@/server/projects/project-files";

function asciiFallbackFilename(name: string) {
  const t = name.replace(/[^\x20-\x7E]/g, "_").slice(0, 180);
  return t.length > 0 ? t : "download";
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; fileId: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId, fileId } = await ctx.params;
  if (!projectId?.trim() || !fileId?.trim()) return jsonError(400, "Invalid id");

  const row = await prisma.projectFile.findFirst({
    where: { id: fileId, projectId },
    select: { storageKey: true, originalName: true, mimeType: true },
  });
  if (!row) return new Response(null, { status: 404 });

  const buf = await getProjectFile(row.storageKey);
  if (!buf) return new Response(null, { status: 404 });

  const safe = asciiFallbackFilename(row.originalName);
  const utf8 = encodeURIComponent(row.originalName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": row.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safe}"; filename*=UTF-8''${utf8}`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; fileId: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId, fileId } = await ctx.params;
  if (!projectId?.trim() || !fileId?.trim()) return jsonError(400, "Invalid id");

  const guard = await assertProjectEditable(projectId);
  if (!guard.ok) return jsonError(guard.status, guard.message);

  const removed = await prisma.$transaction(async (tx) => {
    const r = await removeProjectFileFromDbAndStorage(tx, { fileId, projectId });
    if (r) {
      await appendProjectActivityLog(tx, {
        projectId,
        actorUserId: auth.user.id,
        kind: ProjectActivityKind.PROJECT_FILE_DELETED,
        payload: {
          fileId,
          originalName: r.originalName,
        } as Prisma.InputJsonValue,
      });
    }
    return r;
  });

  if (!removed) return jsonError(404, "Файл не найден");

  try {
    await deleteProjectFile(removed.storageKey);
  } catch {
    // best-effort; запись в БД уже удалена
  }

  return jsonOk({ ok: true });
}
