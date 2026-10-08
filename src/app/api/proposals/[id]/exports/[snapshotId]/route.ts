import { createHash } from "node:crypto";
import { z } from "zod";
import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError } from "@/server/http";
import { exportChecksum, ExportDocumentSchema } from "@/server/projects/proposal-export-document";
import { renderProposalPdf, renderProposalPptx } from "@/server/projects/proposal-export-render";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: Request, ctx: { params: Promise<{ id: string; snapshotId: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const format = z.enum(["pdf", "pptx"]).safeParse(new URL(req.url).searchParams.get("format"));
  if (!format.success) return jsonError(400, "Выберите PDF или PowerPoint");
  const { id, snapshotId } = await ctx.params;
  const snapshot = await prisma.projectProposalSnapshot.findFirst({ where: { id: snapshotId, proposalId: id, reason: "EXPORT" }, select: { clientData: true, versionNumber: true, checksum: true } });
  if (!snapshot) return jsonError(404, "Версия КП не найдена");
  const parsed = ExportDocumentSchema.safeParse(snapshot.clientData);
  if (!parsed.success) return jsonError(409, "Эта версия КП использует неподдерживаемый макет");
  if (exportChecksum(parsed.data) !== snapshot.checksum) return jsonError(409, "Не удалось проверить целостность версии КП");
  try {
    const file = format.data === "pdf" ? await renderProposalPdf(parsed.data) : await renderProposalPptx(parsed.data);
    return new Response(new Uint8Array(file), { headers: {
      "Content-Type": format.data === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="proposal-v${snapshot.versionNumber}.${format.data}"; filename*=UTF-8''${encodeURIComponent(parsed.data.title.replace(/[<>:"/\\|?*\r\n]/g, "-").slice(0, 100))}-v${snapshot.versionNumber}.${format.data}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "ETag": `"${createHash("sha256").update(file).digest("hex")}"`,
    } });
  } catch (cause) {
    console.error("Proposal file render failed", cause instanceof Error ? cause.message : "unknown");
    return jsonError(422, "Не удалось разместить содержимое в макете. Файл не скачан, данные КП сохранены.");
  }
}
