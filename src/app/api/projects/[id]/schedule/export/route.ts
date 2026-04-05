import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError } from "@/server/http";
import { buildScheduleDocxBuffer } from "@/server/projects/schedule-docx";

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
    select: { id: true, title: true },
  });
  if (!project) return jsonError(404, "Проект не найден");

  const days = await prisma.projectScheduleDay.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
    include: { slots: { orderBy: { sortOrder: "asc" } } },
  });

  const buf = await buildScheduleDocxBuffer({
    projectTitle: project.title,
    days: days.map((d) => ({
      dateNote: d.dateNote,
      slots: d.slots.map((s) => ({
        intervalText: s.intervalText,
        description: s.description,
      })),
    })),
  });

  const safe = project.title.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "timing";
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="timing_${safe}.docx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
