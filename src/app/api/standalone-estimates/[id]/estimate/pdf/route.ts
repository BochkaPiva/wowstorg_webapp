import {
  buildProjectDocumentBaseName,
  buildUtf8AttachmentDisposition,
} from "@/lib/project-export-filename";
import { requireRole } from "@/server/auth/require";
import { jsonError } from "@/server/http";
import { buildProjectEstimateXlsx } from "@/server/projects/estimate-xlsx";
import { buildStandaloneEstimateReadModel } from "@/server/standalone-estimates/read-model";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const rawVersion = url.searchParams.get("version");
  const versionNumber = rawVersion == null ? null : Number.parseInt(rawVersion, 10);
  const variant = url.searchParams.get("variant") === "client" ? "client" : "internal";
  const model = await buildStandaloneEstimateReadModel({
    estimateId: id,
    versionNumber: versionNumber != null && Number.isFinite(versionNumber) ? versionNumber : null,
  });
  if (!model) return jsonError(404, "Смета не найдена");
  if (!model.current) return jsonError(404, "В смете пока нет данных для экспорта");

  const bytes = await buildProjectEstimateXlsx({
    projectTitle: model.projectTitle,
    customerName: model.customerName,
    eventStartDate: null,
    eventEndDate: null,
    eventDateConfirmed: false,
    versionNumber: model.current.versionNumber,
    sections: model.current.sections,
    variant,
    commissionEnabled: model.current.commissionEnabled,
    clientTaxEnabled: model.current.clientTaxEnabled,
    clientChargeTaxEnabled: model.current.clientChargeTaxEnabled,
  });
  const baseName = buildProjectDocumentBaseName({
    eventTitle: model.projectTitle,
    customerName: model.customerName,
    eventDateConfirmed: false,
    eventStartDate: null,
    eventEndDate: null,
  });
  const suffix = variant === "client" ? "_client" : "_vnutr";
  const filename = `Смета ${baseName}${suffix}.xlsx`;

  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": buildUtf8AttachmentDisposition(filename),
      "Cache-Control": "private, no-store",
    },
  });
}
