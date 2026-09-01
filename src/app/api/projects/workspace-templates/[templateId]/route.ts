import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";

export async function DELETE(_req: Request, ctx: { params: Promise<{ templateId: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const { templateId } = await ctx.params;

  const result = await prisma.projectWorkspaceTemplate.deleteMany({
    where: { id: templateId, ownerUserId: auth.user.id },
  });
  if (result.count === 0) return jsonError(404, "Шаблон не найден");
  return jsonOk({ deleted: true });
}
