import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { loadProjectFileTree } from "@/server/projects/project-files";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId } = await ctx.params;
  if (!projectId?.trim()) return jsonError(400, "Invalid id");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) return jsonError(404, "Проект не найден");

  const tree = await loadProjectFileTree(projectId);
  return jsonOk(tree);
}
