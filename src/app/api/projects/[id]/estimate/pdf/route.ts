import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError } from "@/server/http";
import { buildEstimatePdfBuffer, type EstimatePdfSection } from "@/server/projects/estimate-pdf";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId } = await ctx.params;
  if (!projectId?.trim()) return jsonError(400, "Invalid id");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true },
  });
  if (!project) return jsonError(404, "Проект не найден");

  const versionParam = new URL(req.url).searchParams.get("version");
  const versionNumber = versionParam != null ? parseInt(versionParam, 10) : null;

  const versionRow =
    versionNumber != null && !Number.isNaN(versionNumber)
      ? await prisma.projectEstimateVersion.findFirst({
          where: { projectId, versionNumber },
          include: {
            sections: {
              orderBy: { sortOrder: "asc" },
              include: { lines: { orderBy: { position: "asc" } } },
            },
          },
        })
      : await prisma.projectEstimateVersion.findFirst({
          where: { projectId },
          orderBy: { versionNumber: "desc" },
          include: {
            sections: {
              orderBy: { sortOrder: "asc" },
              include: { lines: { orderBy: { position: "asc" } } },
            },
          },
        });

  if (!versionRow) {
    return jsonError(404, "Нет версии сметы для экспорта");
  }

  const sections: EstimatePdfSection[] = versionRow.sections.map((s) => ({
    title: s.title,
    lines: s.lines.map((l) => ({
      num: l.lineNumber || l.position + 1,
      name: l.name,
      client: l.costClient != null ? Number(l.costClient) : null,
    })),
  }));

  const pdfBytes = await buildEstimatePdfBuffer({
    projectTitle: project.title,
    sections,
  });

  const safeTitle = project.title.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "estimate";
  return new Response(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="smeta_${safeTitle}_v${versionRow.versionNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
