import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { UpdateProjectContractorSchema } from "@/lib/projects/project-contractors";
import { updateProjectContractor, rosterErrorResponse } from "@/server/projects/project-contractors";
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; assignmentId: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const { id, assignmentId } = await ctx.params;
  const parsed = UpdateProjectContractorSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Проверьте поля подрядчика", parsed.error.flatten());
  try { return jsonOk(await updateProjectContractor(id, assignmentId, auth.user.id, parsed.data)); }
  catch (error) { return rosterErrorResponse(error); }
}
