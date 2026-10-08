import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { captureProposalExport } from "@/server/projects/proposal-export-snapshot";

export const runtime = "nodejs";
export const maxDuration = 60;
const Schema = z.object({ expectedRevision: z.number().int().min(0), variantId: z.string().min(1).max(100), exportId: z.uuid() }).strict();
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const input = Schema.safeParse(await req.json().catch(() => null));
  if (!input.success) return jsonError(400, "Проверьте вариант КП для скачивания", input.error.flatten());
  try {
    const { id } = await ctx.params;
    const snapshot = await captureProposalExport({ proposalId: id, userId: auth.user.id, ...input.data });
    return jsonOk({ snapshotId: snapshot.id, version: snapshot.versionNumber });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    if (message === "NOT_FOUND" || message === "VARIANT_NOT_FOUND") return jsonError(404, "КП или вариант не найден");
    if (message === "EXPORT_TOO_LARGE" || message === "PHOTO_TOO_LARGE") return jsonError(413, "КП слишком большое для одного файла. Разделите его на варианты или уменьшите фотографии.");
    if (["REVISION_CONFLICT", "EXPORT_ID_CONFLICT"].includes(message) || cause instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(cause.code)) return jsonError(409, "КП изменилось или идёт параллельное сохранение. Обновите КП и повторите скачивание.");
    console.error("Proposal export snapshot failed", cause instanceof Error ? cause.name : "unknown");
    return jsonError(503, "Не удалось подготовить фотографии КП. Повторите скачивание — редактор продолжает работать.");
  }
}
