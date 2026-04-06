import { Prisma, ProjectEstimateSectionKind } from "@prisma/client";

import { daysBetween } from "@/server/orders/order-total";

/**
 * Однократное добавление блока «Реквизит» в текущую (последнюю по номеру) версию сметы проекта
 * и копия строк заказа (без дальнейшего автосинка).
 */
export async function seedProjectEstimateFromOrder(
  tx: Prisma.TransactionClient,
  args: { projectId: string; orderId: string; actorUserId: string },
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: args.orderId },
    include: {
      lines: {
        orderBy: { position: "asc" },
        include: { item: { select: { id: true, name: true } } },
      },
    },
  });
  if (!order?.projectId || order.projectId !== args.projectId) return;
  if (order.lines.length === 0) return;

  let latest = await tx.projectEstimateVersion.findFirst({
    where: { projectId: args.projectId },
    orderBy: { versionNumber: "desc" },
  });
  if (!latest) {
    latest = await tx.projectEstimateVersion.create({
      data: {
        projectId: args.projectId,
        versionNumber: 1,
        createdById: args.actorUserId,
      },
    });
  }

  const maxSo = await tx.projectEstimateSection.aggregate({
    where: { versionId: latest.id },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSo._max.sortOrder ?? -1) + 1;
  // Важно: количество дней должно совпадать с расчётом суммы заявки (см. src/server/orders/order-total.ts).
  const days = daysBetween(order.startDate, order.endDate);
  const title = `Реквизит · ${order.startDate.toISOString().slice(0, 10)} — ${order.endDate.toISOString().slice(0, 10)} · ${order.id.slice(0, 8)}…`;

  const section = await tx.projectEstimateSection.create({
    data: {
      versionId: latest.id,
      sortOrder,
      title,
      kind: ProjectEstimateSectionKind.REQUISITE,
      linkedOrderId: order.id,
    },
  });

  for (let i = 0; i < order.lines.length; i++) {
    const ol = order.lines[i]!;
    const price = ol.pricePerDaySnapshot;
    const qty = ol.requestedQty;
    const total = new Prisma.Decimal(price.toString()).mul(qty).mul(days);
    const descParts = [ol.greenwichComment, ol.warehouseComment].filter(Boolean);
    await tx.projectEstimateLine.create({
      data: {
        sectionId: section.id,
        position: i,
        lineNumber: i + 1,
        name: ol.item.name,
        description: descParts.length > 0 ? descParts.join("\n") : null,
        lineType: "RENTAL",
        costClient: total,
        costInternal: total,
        orderLineId: ol.id,
        itemId: ol.itemId,
      },
    });
  }

  // Доп. услуги из заявки (фиксированные суммы за заказ, без умножения на дни).
  const services: Array<{ label: string; enabled: boolean; price: Prisma.Decimal | null }> = [
    { label: "Доставка", enabled: order.deliveryEnabled, price: order.deliveryPrice },
    { label: "Монтаж", enabled: order.montageEnabled, price: order.montagePrice },
    { label: "Демонтаж", enabled: order.demontageEnabled, price: order.demontagePrice },
  ];
  const basePos = order.lines.length;
  let serviceIndex = 0;
  for (const s of services) {
    const p = s.price != null ? new Prisma.Decimal(s.price.toString()) : null;
    if (!s.enabled) continue;
    if (!p || p.lte(0)) continue;
    await tx.projectEstimateLine.create({
      data: {
        sectionId: section.id,
        position: basePos + serviceIndex,
        lineNumber: basePos + serviceIndex + 1,
        name: s.label,
        description: null,
        lineType: "SERVICE",
        costClient: p,
        costInternal: new Prisma.Decimal(0),
        orderLineId: null,
        itemId: null,
      },
    });
    serviceIndex++;
  }
}
