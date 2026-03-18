/**
 * Генерация XLSX-файла сметы по заказу.
 * Читаемый шаблон без технического ID, с выровненными итогами.
 */

import * as XLSX from "xlsx";

type OrderForEstimate = {
  id: string;
  eventName: string | null;
  startDate: Date;
  endDate: Date;
  payMultiplier: unknown;
  deliveryEnabled: boolean;
  deliveryPrice: unknown;
  deliveryComment: string | null;
  montageEnabled: boolean;
  montagePrice: unknown;
  montageComment: string | null;
  demontageEnabled: boolean;
  demontagePrice: unknown;
  demontageComment: string | null;
  customer: { name: string };
  lines: Array<{
    requestedQty: number;
    pricePerDaySnapshot: unknown;
    item?: { name: string };
  }>;
};

function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  const days = Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
  return days === 0 ? 1 : days;
}

function fillRow(cols: (string | number)[], totalCols: number = 6): (string | number)[] {
  const row: (string | number)[] = [...cols];
  while (row.length < totalCols) row.push("");
  return row.slice(0, totalCols);
}

export function buildEstimateXlsx(order: OrderForEstimate): Buffer {
  const wb = XLSX.utils.book_new();
  const days = daysBetween(order.startDate, order.endDate);
  const mult = order.payMultiplier != null ? Number(order.payMultiplier) : 1;

  const sheetData: (string | number)[][] = [];

  // Заголовок — без технического ID
  sheetData.push(fillRow(["Смета"]));
  sheetData.push(fillRow(["Клиент", order.customer.name]));
  sheetData.push(fillRow(["Мероприятие", order.eventName || "—"]));
  sheetData.push(
    fillRow([
      "Период",
      `${order.startDate.toLocaleDateString("ru-RU")} — ${order.endDate.toLocaleDateString("ru-RU")}`,
    ]),
  );
  sheetData.push(fillRow(["Дней", days]));
  sheetData.push(fillRow([]));

  // Таблица аренды
  sheetData.push(
    fillRow(["Позиция", "Кол-во", "Цена/сут (₽)", "Дней", "Коэфф.", "Сумма (₽)"]),
  );

  let rentalTotal = 0;
  for (const l of order.lines) {
    const price = l.pricePerDaySnapshot != null ? Number(l.pricePerDaySnapshot) : 0;
    const sum = Math.round(price * l.requestedQty * days * mult);
    rentalTotal += sum;
    sheetData.push(
      fillRow([
        l.item?.name ?? "Позиция",
        l.requestedQty,
        price,
        days,
        mult,
        sum,
      ]),
    );
  }

  sheetData.push(fillRow([]));
  sheetData.push(
    fillRow(["Итого аренда (₽)", "", "", "", "", rentalTotal]),
  );

  const servicesTotal =
    (order.deliveryEnabled ? Number(order.deliveryPrice ?? 0) : 0) +
    (order.montageEnabled ? Number(order.montagePrice ?? 0) : 0) +
    (order.demontageEnabled ? Number(order.demontagePrice ?? 0) : 0);

  // Доп. услуги — отдельный блок: услуга, цена, комментарий
  if (order.deliveryEnabled || order.montageEnabled || order.demontageEnabled) {
    sheetData.push(fillRow([]));
    sheetData.push(fillRow(["Доп. услуги", "Цена (₽)", "Комментарий"]));

    if (order.deliveryEnabled) {
      const p = order.deliveryPrice != null ? Number(order.deliveryPrice) : 0;
      const comment = (order.deliveryComment ?? "").trim();
      sheetData.push(fillRow(["Доставка", p, comment], 6));
    }
    if (order.montageEnabled) {
      const p = order.montagePrice != null ? Number(order.montagePrice) : 0;
      const comment = (order.montageComment ?? "").trim();
      sheetData.push(fillRow(["Монтаж", p, comment], 6));
    }
    if (order.demontageEnabled) {
      const p = order.demontagePrice != null ? Number(order.demontagePrice) : 0;
      const comment = (order.demontageComment ?? "").trim();
      sheetData.push(fillRow(["Демонтаж", p, comment], 6));
    }

    sheetData.push(fillRow([]));
    sheetData.push(
      fillRow(["Итого доп. услуги (₽)", "", "", "", "", servicesTotal]),
    );
  }

  const grandTotal = rentalTotal + servicesTotal;

  sheetData.push(fillRow([]));
  sheetData.push(
    fillRow(["Сумма заявки (₽)", "", "", "", "", grandTotal]),
  );

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Ширины колонок: название, кол-во, цена/сут, дни, коэфф., сумма
  ws["!cols"] = [
    { wch: 28 },
    { wch: 8 },
    { wch: 12 },
    { wch: 6 },
    { wch: 8 },
    { wch: 14 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Смета");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}
