import { billableRentalDays } from "@/lib/rental-days";
import { buildProjectDocumentBaseName, buildUtf8AttachmentDisposition } from "@/lib/project-export-filename";
import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError } from "@/server/http";
import { buildWarehouseChecklistDocx } from "@/server/warehouse-checklist-docx";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!id?.trim()) return jsonError(400, "Invalid id");

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      eventName: true,
      readyByDate: true,
      startDate: true,
      endDate: true,
      rentalStartPartOfDay: true,
      rentalEndPartOfDay: true,
      createdBy: { select: { displayName: true } },
      customer: { select: { name: true } },
      lines: {
        orderBy: { position: "asc" },
        select: {
          requestedQty: true,
          approvedQty: true,
          issuedQty: true,
          greenwichComment: true,
          warehouseComment: true,
          item: { select: { name: true } },
        },
      },
    },
  });
  if (!order) return jsonError(404, "Заявка не найдена");

  const days = billableRentalDays({
    startDate: order.startDate,
    endDate: order.endDate,
    rentalStartPartOfDay: order.rentalStartPartOfDay,
    rentalEndPartOfDay: order.rentalEndPartOfDay,
  });
  const buffer = await buildWarehouseChecklistDocx({
    title: order.eventName?.trim() || order.customer.name,
    customerName: order.customer.name,
    createdByName: order.createdBy.displayName,
    readyByDate: order.readyByDate,
    startDate: order.startDate,
    endDate: order.endDate,
    sections: [{
      title: "Состав заявки",
      lines: order.lines.map((line, index) => ({
        number: index + 1,
        name: line.item.name,
        quantity: line.issuedQty ?? line.approvedQty ?? line.requestedQty,
        days,
        comment: [line.greenwichComment, line.warehouseComment].filter(Boolean).join(" · ") || null,
      })),
    }],
  });

  const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
  const baseName = buildProjectDocumentBaseName({
    eventTitle: order.eventName,
    customerName: order.customer.name,
    eventDateConfirmed: true,
    eventStartDate: dateOnly(order.startDate),
    eventEndDate: dateOnly(order.endDate),
  });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": buildUtf8AttachmentDisposition(`Чек-лист ${baseName}.docx`),
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, no-store",
    },
  });
}
