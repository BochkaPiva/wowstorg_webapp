import { buildProjectDocumentBaseName, buildUtf8AttachmentDisposition } from "@/lib/project-export-filename";
import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError } from "@/server/http";
import { buildProjectEstimateReadModel } from "@/server/projects/estimate-read-model";
import { buildWarehouseChecklistDocx } from "@/server/warehouse-checklist-docx";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId } = await ctx.params;
  if (!projectId?.trim()) return jsonError(400, "Invalid id");

  const versionRaw = new URL(req.url).searchParams.get("version");
  const versionNumber = versionRaw == null ? null : Number.parseInt(versionRaw, 10);
  const [model, project] = await Promise.all([
    buildProjectEstimateReadModel({
      projectId,
      versionNumber: versionNumber != null && Number.isFinite(versionNumber) ? versionNumber : null,
    }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        title: true,
        customer: { select: { name: true } },
        eventStartDate: true,
        eventEndDate: true,
        eventDateConfirmed: true,
      },
    }),
  ]);
  if (!model || !project) return jsonError(404, "Проект не найден");
  if (!model.current) return jsonError(404, "В проекте ещё нет сметы");

  let number = 0;
  const sections = model.current.sections
    .map((section) => ({
      title: section.title,
      lines: section.lines
        .filter((line) => line.itemId != null && Number(line.qty ?? 0) > 0)
        .map((line) => ({
          number: ++number,
          name: line.name,
          quantity: Number(line.qty),
          days: line.plannedDays ?? null,
          comment: line.description,
        })),
    }))
    .filter((section) => section.lines.length > 0);

  const buffer = await buildWarehouseChecklistDocx({
    title: project.title,
    customerName: project.customer?.name ?? null,
    readyByDate: project.eventDateConfirmed ? project.eventStartDate : null,
    startDate: project.eventStartDate,
    endDate: project.eventEndDate,
    sections,
  });

  const dateOnly = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
  const baseName = buildProjectDocumentBaseName({
    eventTitle: project.title,
    customerName: project.customer?.name ?? null,
    eventDateConfirmed: project.eventDateConfirmed,
    eventStartDate: dateOnly(project.eventStartDate),
    eventEndDate: dateOnly(project.eventEndDate),
  });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": buildUtf8AttachmentDisposition(`Чек-лист ${baseName} v${model.current.versionNumber}.docx`),
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, no-store",
    },
  });
}
