import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError } from "@/server/http";
import {
  buildProjectDocumentBaseName,
  buildUtf8AttachmentDisposition,
} from "@/lib/project-export-filename";
import { buildProjectEstimateReadModel } from "@/server/projects/estimate-read-model";
import { buildProjectEstimateXlsx } from "@/server/projects/estimate-xlsx";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId } = await ctx.params;
  if (!projectId?.trim()) return jsonError(400, "Invalid id");

  const url = new URL(req.url);
  const versionParam = url.searchParams.get("version");
  const versionNumber = versionParam != null ? parseInt(versionParam, 10) : null;
  const variantRaw = url.searchParams.get("variant");
  const variant =
    variantRaw === "client" ? "client" : ("internal" as const);
  const model = await buildProjectEstimateReadModel({
    projectId,
    versionNumber: versionNumber != null && !Number.isNaN(versionNumber) ? versionNumber : null,
  });
  if (!model) return jsonError(404, "Проект не найден");
  if (!model.current) {
    return jsonError(404, "Нет версии сметы для экспорта");
  }

  const projectMeta = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      title: true,
      customer: { select: { name: true } },
      eventDateConfirmed: true,
      eventStartDate: true,
      eventEndDate: true,
    },
  });

  const xlsxBytes = await buildProjectEstimateXlsx({
    projectTitle: model.projectTitle,
    versionNumber: model.current.versionNumber,
    sections: model.current.sections,
    variant,
  });

  const dateOnly = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : null);
  const baseName = buildProjectDocumentBaseName({
    eventTitle: projectMeta?.title ?? model.projectTitle,
    customerName: projectMeta?.customer.name ?? null,
    eventDateConfirmed: projectMeta?.eventDateConfirmed ?? false,
    eventStartDate: dateOnly(projectMeta?.eventStartDate),
    eventEndDate: dateOnly(projectMeta?.eventEndDate),
  });
  const suffix = variant === "client" ? "_client" : "_vnutr";
  const filename = `Смета ${baseName} v${model.current.versionNumber}${suffix}.xlsx`;
  return new Response(Buffer.from(xlsxBytes), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": buildUtf8AttachmentDisposition(filename),
      "Cache-Control": "private, no-store",
    },
  });
}
