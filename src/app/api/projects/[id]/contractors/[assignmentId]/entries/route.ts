import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { ContractorEntrySchema } from "@/lib/projects/project-contractors";
import { addContractorEntry, readContractorEntries, rosterErrorResponse } from "@/server/projects/project-contractors";

type Context = { params: Promise<{ id: string; assignmentId: string }> };
export async function GET(req: Request, ctx: Context) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const { id, assignmentId } = await ctx.params;
  const cursor = new URL(req.url).searchParams.get("cursor");
  if (cursor && cursor.length > 100) return jsonError(400, "Некорректная страница журнала");
  try { return jsonOk(await readContractorEntries(id, assignmentId, cursor), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return rosterErrorResponse(error); }
}
export async function POST(req: Request, ctx: Context) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const { id, assignmentId } = await ctx.params;
  const parsed = ContractorEntrySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Укажите итог разговора и статус общения", parsed.error.flatten());
  try { return jsonOk(await addContractorEntry(id, assignmentId, auth.user.id, parsed.data)); }
  catch (error) { return rosterErrorResponse(error); }
}
