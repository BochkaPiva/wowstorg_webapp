import { requireRole } from "@/server/auth/require";
import { jsonError } from "@/server/http";
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

  const versionParam = new URL(req.url).searchParams.get("version");
  const versionNumber = versionParam != null ? parseInt(versionParam, 10) : null;
  const model = await buildProjectEstimateReadModel({
    projectId,
    versionNumber: versionNumber != null && !Number.isNaN(versionNumber) ? versionNumber : null,
  });
  if (!model) return jsonError(404, "Проект не найден");
  if (!model.current) {
    return jsonError(404, "Нет версии сметы для экспорта");
  }

  const xlsxBytes = await buildProjectEstimateXlsx({
    projectTitle: model.projectTitle,
    versionNumber: model.current.versionNumber,
    sections: model.current.sections,
  });

  const safeTitle = model.projectTitle.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "estimate";
  return new Response(Buffer.from(xlsxBytes), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="smeta_${safeTitle}_v${model.current.versionNumber}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
