import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

function dec(v: { toString(): string } | null | undefined): string | null {
  if (v == null) return null;
  return v.toString();
}

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
    select: {
      id: true,
      title: true,
      orders: {
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          status: true,
          eventName: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  });
  if (!project) return jsonError(404, "Проект не найден");

  const versionParam = new URL(req.url).searchParams.get("version");
  const versionNumber = versionParam != null ? parseInt(versionParam, 10) : null;

  const versions = await prisma.projectEstimateVersion.findMany({
    where: { projectId },
    orderBy: { versionNumber: "desc" },
    select: {
      id: true,
      versionNumber: true,
      note: true,
      isPrimary: true,
      createdAt: true,
      createdBy: { select: { displayName: true } },
    },
  });

  const targetNum =
    versionNumber != null && !Number.isNaN(versionNumber)
      ? versionNumber
      : versions.find((v) => v.isPrimary)?.versionNumber ?? versions[0]?.versionNumber ?? null;

  const versionRow =
    targetNum != null
      ? await prisma.projectEstimateVersion.findFirst({
          where: { projectId, versionNumber: targetNum },
          include: {
            sections: {
              orderBy: { sortOrder: "asc" },
              include: {
                lines: {
                  orderBy: { position: "asc" },
                },
              },
            },
          },
        })
      : null;

  return jsonOk({
    projectTitle: project.title,
    projectOrders: project.orders.map((o) => ({
      id: o.id,
      status: o.status,
      eventName: o.eventName,
      startDate: o.startDate.toISOString().slice(0, 10),
      endDate: o.endDate.toISOString().slice(0, 10),
    })),
    versions: versions.map((v) => ({
      ...v,
      createdAt: v.createdAt.toISOString(),
    })),
    current:
      versionRow == null
        ? null
        : {
            id: versionRow.id,
            versionNumber: versionRow.versionNumber,
            note: versionRow.note,
            createdAt: versionRow.createdAt.toISOString(),
            sections: versionRow.sections.map((s) => ({
              id: s.id,
              sortOrder: s.sortOrder,
              title: s.title,
              kind: s.kind,
              linkedOrderId: s.linkedOrderId,
              lines: s.lines.map((l) => ({
                id: l.id,
                position: l.position,
                lineNumber: l.lineNumber,
                name: l.name,
                description: l.description,
                lineType: l.lineType,
                costClient: dec(l.costClient),
                costInternal: dec(l.costInternal),
                orderLineId: l.orderLineId,
                itemId: l.itemId,
              })),
            })),
          },
  });
}
