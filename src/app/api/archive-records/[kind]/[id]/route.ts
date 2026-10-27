import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { putProjectFile, deleteProjectFile } from "@/server/file-storage";
import { isAllowedProjectFileMime, sanitizeOriginalFileName } from "@/server/projects/project-files";
import { archiveTargetExists, archiveWhere, parseArchiveKind } from "@/server/archive/records";

type Context = { params: Promise<{ kind: string; id: string }> };
const MarkSchema = z.object({ recorded: z.boolean() }).strict();
async function target(ctx: Context) {
  const params = await ctx.params;
  const kind = parseArchiveKind(params.kind);
  return kind && await archiveTargetExists(kind, params.id) ? { kind, id: params.id } : null;
}
export async function GET(_req: Request, ctx: Context) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const t = await target(ctx);
  if (!t) return jsonError(404, "Архивная запись не найдена");
  const [mark, files] = await Promise.all([
    prisma.archiveRegisterMark.findUnique({ where: { id: `${t.kind}:${t.id}` }, select: { recorded: true } }),
    prisma.archiveDocument.findMany({ where: archiveWhere(t.kind, t.id), select: { id: true, originalName: true, sizeBytes: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
  ]);
  return jsonOk({ recorded: mark?.recorded ?? false, files });
}
export async function PATCH(req: Request, ctx: Context) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const t = await target(ctx);
  if (!t) return jsonError(404, "Архивная запись не найдена");
  const parsed = MarkSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Некорректная отметка");
  const mark = await prisma.archiveRegisterMark.upsert({
    where: { id: `${t.kind}:${t.id}` },
    create: { id: `${t.kind}:${t.id}`, ...archiveWhere(t.kind, t.id), recorded: parsed.data.recorded, updatedById: auth.user.id },
    update: { recorded: parsed.data.recorded, updatedById: auth.user.id },
    select: { recorded: true },
  });
  return jsonOk(mark);
}
export async function POST(req: Request, ctx: Context) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const t = await target(ctx);
  if (!t) return jsonError(404, "Архивная запись не найдена");
  const contentLength = Number(req.headers.get("content-length"));
  if (contentLength > 4.5 * 1024 * 1024) return jsonError(413, "Размер файла не должен превышать 4 МБ");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size <= 0) return jsonError(400, "Выберите непустой файл");
  if (file.size > 4 * 1024 * 1024) return jsonError(400, "Размер файла не должен превышать 4 МБ");
  const mime = (file.type || "application/octet-stream").trim();
  if (!isAllowedProjectFileMime(mime)) return jsonError(400, "Этот тип файла не поддерживается");
  const id = randomUUID();
  const storageKey = `archive/${t.kind}/${t.id}/${id}`;
  try {
    await putProjectFile(storageKey, Buffer.from(await file.arrayBuffer()), mime);
    const row = await prisma.archiveDocument.create({ data: { id, ...archiveWhere(t.kind, t.id), storageKey, originalName: sanitizeOriginalFileName(file.name), mimeType: mime, sizeBytes: file.size, uploadedById: auth.user.id }, select: { id: true, originalName: true, sizeBytes: true, createdAt: true } });
    return jsonOk({ file: row });
  } catch (error) {
    await deleteProjectFile(storageKey).catch(() => undefined);
    console.error("[archive-document] upload failed", error);
    return jsonError(500, "Не удалось сохранить документ");
  }
}
