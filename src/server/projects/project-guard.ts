import { prisma } from "@/server/db";

export async function assertProjectEditable(projectId: string): Promise<
  { ok: true } | { ok: false; status: 404 | 400; message: string }
> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { archivedAt: true },
  });
  if (!p) return { ok: false, status: 404, message: "Проект не найден" };
  if (p.archivedAt != null) {
    return { ok: false, status: 400, message: "Архивный проект только для просмотра" };
  }
  return { ok: true };
}
