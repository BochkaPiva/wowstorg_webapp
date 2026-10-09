import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { ProjectContractorPostSchema } from "@/lib/projects/project-contractors";
import { readProjectContractors, addProjectContractors, rosterErrorResponse } from "@/server/projects/project-contractors";
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  try { return jsonOk(await readProjectContractors(id), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return rosterErrorResponse(error); }
}
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const parsed = ProjectContractorPostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Проверьте поля подрядчика", parsed.error.flatten());
  try { return jsonOk(await addProjectContractors(id, auth.user.id, parsed.data)); }
  catch (error) { return rosterErrorResponse(error); }
}
