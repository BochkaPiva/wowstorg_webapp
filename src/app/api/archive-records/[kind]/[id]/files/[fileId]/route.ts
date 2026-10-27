import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { getProjectFile, deleteProjectFile } from "@/server/file-storage";
import { archiveTargetExists, archiveWhere, parseArchiveKind } from "@/server/archive/records";

type Context = { params: Promise<{ kind: string; id: string; fileId: string }> };
async function find(ctx: Context) {
  const { kind: raw, id, fileId } = await ctx.params;
  const kind = parseArchiveKind(raw);
  if (!kind || !await archiveTargetExists(kind, id)) return null;
  return prisma.archiveDocument.findFirst({ where: { id: fileId, ...archiveWhere(kind, id) } });
}
export async function GET(_req: Request, ctx: Context) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const file = await find(ctx);
  if (!file) return jsonError(404, "Документ не найден");
  const data = await getProjectFile(file.storageKey);
  if (!data) return jsonError(404, "Файл не найден в хранилище");
  const fallback = file.originalName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "document";
  const name = encodeURIComponent(file.originalName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(new Uint8Array(data), { headers: { "Content-Type": file.mimeType, "Content-Disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${name}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
export async function DELETE(_req: Request, ctx: Context) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const file = await find(ctx);
  if (!file) return jsonError(404, "Документ не найден");
  await prisma.archiveDocument.delete({ where: { id: file.id } });
  await deleteProjectFile(file.storageKey);
  return jsonOk({ ok: true });
}
