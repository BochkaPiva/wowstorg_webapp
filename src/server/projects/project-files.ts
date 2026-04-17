import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/server/db";
import { deleteProjectFile } from "@/server/file-storage";

type Db = Prisma.TransactionClient | PrismaClient;

export const PROJECT_FILE_MAX_COUNT = 15;
export const PROJECT_FILE_MAX_TOTAL_BYTES = 200 * 1024 * 1024;
export const PROJECT_FILE_MAX_SINGLE_BYTES = 50 * 1024 * 1024;
export const PROJECT_FOLDER_MAX_DEPTH = 5;

export const DEFAULT_PROJECT_FOLDERS: { name: string; sortOrder: number }[] = [
  { name: "Сметы", sortOrder: 0 },
  { name: "Дизайн", sortOrder: 1 },
  { name: "Документация", sortOrder: 2 },
];

export function sanitizeOriginalFileName(name: string): string {
  const base = name.replace(/^.*[/\\]/, "").trim() || "file";
  return base.replace(/[^\p{L}\d.\s\-_()]+/gu, "_").replace(/\s+/g, " ").slice(0, 200);
}

export function isAllowedProjectFileMime(mime: string): boolean {
  const m = mime.toLowerCase().trim();
  if (!m || m.length > 120) return false;
  if (m.startsWith("image/")) return true;
  if (m === "application/pdf") return true;
  if (m === "text/plain" || m === "text/csv" || m === "application/csv") return true;
  if (m.startsWith("application/vnd.openxmlformats-officedocument.")) return true;
  if (m === "application/msword") return true;
  if (m === "application/vnd.ms-excel") return true;
  if (m === "application/vnd.ms-powerpoint") return true;
  if (m === "application/zip" || m === "application/x-zip-compressed") return true;
  if (m.includes("javascript") || m.includes("ecmascript")) return false;
  if (m === "text/html" || m.startsWith("text/html")) return false;
  return false;
}

export async function ensureDefaultProjectFolders(db: Db, projectId: string): Promise<void> {
  const existing = await db.projectFolder.findMany({
    where: { projectId, parentFolderId: null, isSystem: true },
    select: { name: true },
  });
  const have = new Set(existing.map((e) => e.name));
  for (const d of DEFAULT_PROJECT_FOLDERS) {
    if (have.has(d.name)) continue;
    await db.projectFolder.create({
      data: {
        projectId,
        parentFolderId: null,
        name: d.name,
        sortOrder: d.sortOrder,
        isSystem: true,
      },
    });
    have.add(d.name);
  }
}

/** Глубина папки: 0 — у корня (parentFolderId null), дочерняя — на 1 больше родителя. */
export async function getFolderDepth(db: Db, folderId: string): Promise<number> {
  let depth = 0;
  let cur: string | null = folderId;
  let guard = 0;
  while (cur && guard < 32) {
    guard += 1;
    const fol: { parentFolderId: string | null } | null = await db.projectFolder.findUnique({
      where: { id: cur },
      select: { parentFolderId: true },
    });
    if (!fol) break;
    if (fol.parentFolderId == null) break;
    depth += 1;
    cur = fol.parentFolderId;
  }
  return depth;
}

export async function assertFolderInProject(
  db: Db,
  projectId: string,
  folderId: string,
): Promise<{ ok: true; folder: { id: string; isSystem: boolean; name: string } } | { ok: false; status: 404; message: string }> {
  const folder = await db.projectFolder.findFirst({
    where: { id: folderId, projectId },
    select: { id: true, isSystem: true, name: true },
  });
  if (!folder) return { ok: false, status: 404, message: "Папка не найдена" };
  return { ok: true, folder };
}

export async function canCreateChildFolder(
  db: Db,
  projectId: string,
  parentFolderId: string | null,
): Promise<{ ok: true } | { ok: false; status: 400; message: string }> {
  if (parentFolderId == null) return { ok: true };
  const p = await db.projectFolder.findFirst({
    where: { id: parentFolderId, projectId },
    select: { id: true },
  });
  if (!p) return { ok: false, status: 400, message: "Родительская папка не найдена" };
  const parentDepth = await getFolderDepth(db, parentFolderId);
  if (parentDepth + 1 > PROJECT_FOLDER_MAX_DEPTH) {
    return {
      ok: false,
      status: 400,
      message: `Максимальная вложенность папок: ${PROJECT_FOLDER_MAX_DEPTH} уровней от корня`,
    };
  }
  return { ok: true };
}

export type ProjectFileTreeFile = {
  id: string;
  folderId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedBy: { displayName: string };
};

export type ProjectFileTreeFolder = {
  id: string;
  parentFolderId: string | null;
  name: string;
  sortOrder: number;
  isSystem: boolean;
  children: ProjectFileTreeFolder[];
  files: ProjectFileTreeFile[];
};

export async function loadProjectFileTree(projectId: string): Promise<{
  folders: ProjectFileTreeFolder[];
  totalBytes: number;
  fileCount: number;
}> {
  await ensureDefaultProjectFolders(prisma, projectId);

  const [folders, files, agg] = await Promise.all([
    prisma.projectFolder.findMany({
      where: { projectId },
      select: {
        id: true,
        parentFolderId: true,
        name: true,
        sortOrder: true,
        isSystem: true,
      },
    }),
    prisma.projectFile.findMany({
      where: { projectId },
      select: {
        id: true,
        folderId: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
        uploadedBy: { select: { displayName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.projectFile.aggregate({
      where: { projectId },
      _sum: { sizeBytes: true },
      _count: { _all: true },
    }),
  ]);

  const byParent = new Map<string | null, typeof folders>();
  for (const f of folders) {
    const k = f.parentFolderId ?? null;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(f);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru"));
  }

  const filesByFolder = new Map<string, ProjectFileTreeFile[]>();
  for (const f of files) {
    const row: ProjectFileTreeFile = {
      id: f.id,
      folderId: f.folderId,
      originalName: f.originalName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      createdAt: f.createdAt.toISOString(),
      uploadedBy: { displayName: f.uploadedBy.displayName },
    };
    if (!filesByFolder.has(f.folderId)) filesByFolder.set(f.folderId, []);
    filesByFolder.get(f.folderId)!.push(row);
  }

  function walk(parentId: string | null): ProjectFileTreeFolder[] {
    const list = byParent.get(parentId) ?? [];
    return list.map((fol) => ({
      id: fol.id,
      parentFolderId: fol.parentFolderId,
      name: fol.name,
      sortOrder: fol.sortOrder,
      isSystem: fol.isSystem,
      children: walk(fol.id),
      files: filesByFolder.get(fol.id) ?? [],
    }));
  }

  return {
    folders: walk(null),
    totalBytes: agg._sum.sizeBytes ?? 0,
    fileCount: agg._count._all,
  };
}

export function buildStorageKey(projectId: string, fileId: string): string {
  return `projects/${projectId}/${fileId}`;
}

export async function removeProjectFileFromDbAndStorage(
  tx: Prisma.TransactionClient,
  args: { fileId: string; projectId: string },
): Promise<{ storageKey: string; originalName: string } | null> {
  const row = await tx.projectFile.findFirst({
    where: { id: args.fileId, projectId: args.projectId },
    select: { storageKey: true, originalName: true },
  });
  if (!row) return null;
  await tx.projectFile.delete({ where: { id: args.fileId } });
  return { storageKey: row.storageKey, originalName: row.originalName };
}

/** Генерирует id файла и ключ Storage до записи в БД. */
export function newProjectFileIdAndKey(projectId: string): { fileId: string; storageKey: string } {
  const fileId = randomUUID().replace(/-/g, "");
  return { fileId, storageKey: buildStorageKey(projectId, fileId) };
}

export async function storageDeleteBestEffort(storageKey: string): Promise<void> {
  try {
    await deleteProjectFile(storageKey);
  } catch {
    // ignore
  }
}
