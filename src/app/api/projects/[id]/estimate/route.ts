import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { buildProjectEstimateReadModel } from "@/server/projects/estimate-read-model";

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
  return jsonOk(model);
}
