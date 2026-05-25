import ExcelJS from "exceljs";

import type { AdminAnalyticsData, ProjectAnalyticsRow } from "@/server/admin-analytics";

export type AdminAnalyticsExportSection = "global" | "requisites" | "projects" | "customers";

type RowValue = string | number | null;
type SheetTheme = "violet" | "emerald" | "amber" | "slate";

const COLORS = {
  violet: "FF6D28D9",
  violetDark: "FF2E1065",
  violetSoft: "FFF3E8FF",
  yellow: "FFFFE600",
  ink: "FF111827",
  muted: "FF6B7280",
  border: "FFE5E7EB",
  grid: "FFF3F4F6",
  white: "FFFFFFFF",
  emerald: "FF059669",
  emeraldSoft: "FFECFDF5",
  amber: "FFD97706",
  amberSoft: "FFFFFBEB",
  red: "FFB91C1C",
  redSoft: "FFFEF2F2",
  slate: "FF475569",
  slateSoft: "FFF8FAFC",
};

function argb(hex: string) {
  return { argb: hex };
}

function money(value: number) {
  return Math.round(value);
}

function setCols(ws: ExcelJS.Worksheet, widths: number[]) {
  ws.columns = widths.map((width) => ({ width }));
}

function setWorkbookMeta(wb: ExcelJS.Workbook) {
  wb.creator = "Wowstorg Analytics";
  wb.created = new Date();
  wb.modified = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
}

function baseCell(cell: ExcelJS.Cell) {
  cell.font = { name: "Calibri", size: 11, color: argb(COLORS.ink) };
  cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  cell.border = {
    top: { style: "thin", color: argb(COLORS.border) },
    left: { style: "thin", color: argb(COLORS.border) },
    bottom: { style: "thin", color: argb(COLORS.border) },
    right: { style: "thin", color: argb(COLORS.border) },
  };
}

function styleSheet(ws: ExcelJS.Worksheet) {
  ws.properties.defaultRowHeight = 22;
  ws.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];
}

function periodLabel(data: AdminAnalyticsData) {
  return `Период отчета: ${data.period.from ?? "начало"} - ${data.period.to ?? "сегодня"}`;
}

function addReportHeader(ws: ExcelJS.Worksheet, title: string, data: AdminAnalyticsData, colSpan: number) {
  ws.mergeCells(1, 1, 1, colSpan);
  ws.mergeCells(2, 1, 2, colSpan);
  ws.mergeCells(3, 1, 3, colSpan);

  ws.getCell(1, 1).value = "WOWSTORG";
  ws.getCell(1, 1).font = { name: "Calibri", size: 14, bold: true, color: argb(COLORS.violetDark) };
  ws.getCell(1, 1).alignment = { vertical: "middle", horizontal: "left" };

  ws.getCell(2, 1).value = title;
  ws.getCell(2, 1).font = { name: "Calibri", size: 24, bold: true, color: argb(COLORS.ink) };
  ws.getCell(2, 1).alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(2).height = 34;

  ws.getCell(3, 1).value = periodLabel(data);
  ws.getCell(3, 1).font = { name: "Calibri", size: 11, color: argb(COLORS.muted) };
  ws.getCell(3, 1).alignment = { vertical: "middle", horizontal: "left" };

  ws.getRow(4).height = 8;
  for (let col = 1; col <= colSpan; col++) {
    const cell = ws.getCell(4, col);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: argb(col <= Math.ceil(colSpan / 2) ? COLORS.violet : COLORS.yellow) };
  }
}

function themeColors(theme: SheetTheme) {
  if (theme === "emerald") return { bg: COLORS.emeraldSoft, accent: COLORS.emerald };
  if (theme === "amber") return { bg: COLORS.amberSoft, accent: COLORS.amber };
  if (theme === "slate") return { bg: COLORS.slateSoft, accent: COLORS.slate };
  return { bg: COLORS.violetSoft, accent: COLORS.violet };
}

function addKpiCard(ws: ExcelJS.Worksheet, row: number, col: number, title: string, value: RowValue, note: string, theme: SheetTheme) {
  const { bg, accent } = themeColors(theme);
  ws.mergeCells(row, col, row, col + 2);
  ws.mergeCells(row + 1, col, row + 1, col + 2);
  ws.mergeCells(row + 2, col, row + 2, col + 2);

  for (let r = row; r <= row + 2; r++) {
    for (let c = col; c <= col + 2; c++) {
      const cell = ws.getCell(r, c);
      baseCell(cell);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: argb(bg) };
    }
  }

  const titleCell = ws.getCell(row, col);
  titleCell.value = title.toUpperCase();
  titleCell.font = { name: "Calibri", size: 10, bold: true, color: argb(accent) };

  const valueCell = ws.getCell(row + 1, col);
  valueCell.value = value;
  valueCell.font = { name: "Calibri", size: 22, bold: true, color: argb(COLORS.ink) };
  valueCell.numFmt = typeof value === "number" ? "#,##0 ₽" : "@";

  const noteCell = ws.getCell(row + 2, col);
  noteCell.value = note;
  noteCell.font = { name: "Calibri", size: 10, color: argb(COLORS.muted) };

  ws.getRow(row).height = 18;
  ws.getRow(row + 1).height = 30;
  ws.getRow(row + 2).height = 22;
}

function addSectionTitle(ws: ExcelJS.Worksheet, row: number, title: string, colSpan: number) {
  ws.mergeCells(row, 1, row, colSpan);
  const cell = ws.getCell(row, 1);
  cell.value = title;
  cell.font = { name: "Calibri", size: 16, bold: true, color: argb(COLORS.violetDark) };
  cell.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(row).height = 28;
}

function addTable(
  ws: ExcelJS.Worksheet,
  startRow: number,
  headers: string[],
  rows: RowValue[][],
  options?: { currencyColumns?: number[]; percentColumns?: number[]; negativeGoodColumns?: number[] },
) {
  const headerRow = ws.getRow(startRow);
  headerRow.values = headers;
  headerRow.height = 24;
  headers.forEach((_, idx) => {
    const cell = ws.getCell(startRow, idx + 1);
    baseCell(cell);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: argb(COLORS.violetDark) };
    cell.font = { name: "Calibri", size: 11, bold: true, color: argb(COLORS.white) };
    cell.alignment = { vertical: "middle", horizontal: idx === 0 ? "left" : "center", wrapText: true };
  });

  rows.forEach((values, rIdx) => {
    const row = ws.getRow(startRow + 1 + rIdx);
    row.values = values;
    row.height = 23;
    values.forEach((value, cIdx) => {
      const cell = ws.getCell(startRow + 1 + rIdx, cIdx + 1);
      baseCell(cell);
      cell.alignment = { vertical: "middle", horizontal: cIdx === 0 ? "left" : "right", wrapText: true };
      if (rIdx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: argb(COLORS.slateSoft) };
      if (typeof value === "number") {
        cell.numFmt = options?.currencyColumns?.includes(cIdx) ? "#,##0 ₽" : "#,##0";
        if (options?.percentColumns?.includes(cIdx)) cell.numFmt = "0.0%";
        const badNegative = value < 0 && !options?.negativeGoodColumns?.includes(cIdx);
        if (badNegative) cell.font = { name: "Calibri", size: 11, bold: true, color: argb(COLORS.red) };
      }
    });
  });

  return startRow + rows.length + 2;
}

function addOverviewSheet(wb: ExcelJS.Workbook, data: AdminAnalyticsData) {
  const ws = wb.addWorksheet("Обзор");
  styleSheet(ws);
  setCols(ws, [22, 16, 16, 4, 22, 16, 16, 4, 22, 16, 16]);
  addReportHeader(ws, "Финансовый отчет", data, 11);

  addKpiCard(ws, 6, 1, "Факт прибыль", data.overview.finance.fact.profitTotal, `Выручка ${money(data.overview.finance.fact.revenueTotal).toLocaleString("ru-RU")} ₽`, "emerald");
  addKpiCard(ws, 6, 5, "Прогноз прибыль", data.overview.finance.forecast.profitTotal, `Выручка ${money(data.overview.finance.forecast.revenueTotal).toLocaleString("ru-RU")} ₽`, "violet");
  addKpiCard(ws, 6, 9, "Бонусы 15%", data.overview.finance.bonuses.factPool, `${money(data.overview.finance.bonuses.factPerPerson).toLocaleString("ru-RU")} ₽ на человека`, "amber");

  addSectionTitle(ws, 11, "Структура результата", 11);
  addTable(
    ws,
    12,
    ["Блок", "Факт прибыль", "Факт выручка", "Прогноз прибыль", "Прогноз выручка", "Комментарий"],
    [
      [
        "Самостоятельные заявки",
        data.overview.finance.fact.standaloneOrdersProfit,
        data.overview.finance.fact.standaloneOrdersRevenue,
        data.overview.finance.forecast.standaloneOrdersProfit,
        data.overview.finance.forecast.standaloneOrdersRevenue,
        `${data.overview.finance.forecast.standaloneOrdersTotal} активных заявок в прогнозе`,
      ],
      [
        "Проекты",
        data.overview.finance.fact.completedProjectsProfit,
        data.overview.finance.fact.completedProjectsRevenue,
        data.overview.finance.forecast.activeProjectsProfit,
        data.overview.finance.forecast.activeProjectsRevenue,
        `${data.overview.kpi.activeProjects} активных проектов в прогнозе`,
      ],
      [
        "Итого",
        data.overview.finance.fact.profitTotal,
        data.overview.finance.fact.revenueTotal,
        data.overview.finance.forecast.profitTotal,
        data.overview.finance.forecast.revenueTotal,
        "Заявки в проектах не дублируются в самостоятельных заявках",
      ],
    ],
    { currencyColumns: [1, 2, 3, 4] },
  );

  addSectionTitle(ws, 19, "Контроль двойного учета", 11);
  addTable(
    ws,
    20,
    ["Метрика", "Значение", "Смысл"],
    [
      ["Заявки в проектах", data.overview.finance.ownership.linkedOrdersExcluded, "Не входят в самостоятельные заявки"],
      ["Закрытые заявки в проектах", data.overview.finance.ownership.linkedClosedOrdersExcluded, "Финансы учитываются на стороне проекта"],
      ["Закрытые самостоятельные заявки", data.overview.kpi.ordersClosed, "Факт заявок без projectId"],
    ],
  );
}

function addFactForecastSheet(wb: ExcelJS.Workbook, data: AdminAnalyticsData) {
  const ws = wb.addWorksheet("Факт и прогноз");
  styleSheet(ws);
  setCols(ws, [28, 18, 18, 18, 18, 18]);
  addReportHeader(ws, "Факт и прогноз", data, 6);
  addTable(
    ws,
    6,
    ["Направление", "Факт выручка", "Факт прибыль", "Прогноз выручка", "Прогноз прибыль", "Количество"],
    [
      [
        "Самостоятельные заявки",
        data.overview.finance.fact.standaloneOrdersRevenue,
        data.overview.finance.fact.standaloneOrdersProfit,
        data.overview.finance.forecast.standaloneOrdersRevenue,
        data.overview.finance.forecast.standaloneOrdersProfit,
        data.overview.finance.forecast.standaloneOrdersTotal,
      ],
      [
        "Проекты",
        data.overview.finance.fact.completedProjectsRevenue,
        data.overview.finance.fact.completedProjectsProfit,
        data.overview.finance.forecast.activeProjectsRevenue,
        data.overview.finance.forecast.activeProjectsProfit,
        data.overview.kpi.activeProjects,
      ],
      [
        "Итого",
        data.overview.finance.fact.revenueTotal,
        data.overview.finance.fact.profitTotal,
        data.overview.finance.forecast.revenueTotal,
        data.overview.finance.forecast.profitTotal,
        null,
      ],
    ],
    { currencyColumns: [1, 2, 3, 4] },
  );
}

function projectEventMonth(project: ProjectAnalyticsRow) {
  return (project.eventStartDate ?? project.eventEndDate ?? project.createdAt).slice(0, 7);
}

function addDynamicsSheet(wb: ExcelJS.Workbook, data: AdminAnalyticsData) {
  const ws = wb.addWorksheet("Динамика");
  styleSheet(ws);
  setCols(ws, [14, 18, 18, 18, 18, 16, 16, 18]);
  addReportHeader(ws, "Динамика по месяцам", data, 8);

  const monthMap = new Map<string, { orderRevenue: number; orderCount: number; projectRevenue: number; projectProfit: number; projectCount: number }>();
  for (const row of data.requisites.breakdowns.revenueByMonth) {
    monthMap.set(row.month, {
      ...(monthMap.get(row.month) ?? { orderRevenue: 0, orderCount: 0, projectRevenue: 0, projectProfit: 0, projectCount: 0 }),
      orderRevenue: row.revenue,
      orderCount: row.orders,
    });
  }
  for (const project of data.projects.rows.filter((p) => p.status === "COMPLETED")) {
    const month = projectEventMonth(project);
    const prev = monthMap.get(month) ?? { orderRevenue: 0, orderCount: 0, projectRevenue: 0, projectProfit: 0, projectCount: 0 };
    prev.projectRevenue += project.financials.revenueTotal;
    prev.projectProfit += project.financials.marginAfterTax;
    prev.projectCount += 1;
    monthMap.set(month, prev);
  }

  const rows = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value], idx, all) => {
      const totalRevenue = value.orderRevenue + value.projectRevenue;
      const prevTotal = idx > 0 ? all[idx - 1][1].orderRevenue + all[idx - 1][1].projectRevenue : 0;
      const delta = prevTotal > 0 ? totalRevenue - prevTotal : 0;
      const deltaPct = prevTotal > 0 ? delta / prevTotal : 0;
      return [month, totalRevenue, delta, deltaPct, value.orderRevenue, value.projectRevenue, value.projectProfit, value.orderCount + value.projectCount];
    });

  addTable(ws, 6, ["Месяц", "Выручка факт", "К прошлому", "%", "Заявки", "Проекты", "Прибыль проектов", "Сделок"], rows, {
    currencyColumns: [1, 2, 4, 5, 6],
    percentColumns: [3],
  });
  if (rows.length > 0) {
    const firstDataRow = 7;
    const lastDataRow = firstDataRow + rows.length - 1;
    ws.addConditionalFormatting({
      ref: `B${firstDataRow}:B${lastDataRow}`,
      rules: [{ type: "dataBar", priority: 1, showValue: true, cfvo: [{ type: "min" }, { type: "max" }] }],
    });
    ws.addConditionalFormatting({
      ref: `G${firstDataRow}:G${lastDataRow}`,
      rules: [{ type: "dataBar", priority: 2, showValue: true, cfvo: [{ type: "min" }, { type: "max" }] }],
    });
  }
  ws.getCell(5, 1).value = rows.length > 1 ? "Сравнение строится к предыдущему месяцу внутри выбранного периода." : "Для сравнения с предыдущим месяцем выберите период от двух месяцев.";
  ws.getCell(5, 1).font = { name: "Calibri", size: 10, color: argb(COLORS.muted) };
}

function addRequisitesSheet(wb: ExcelJS.Workbook, data: AdminAnalyticsData) {
  const ws = wb.addWorksheet("Заявки");
  styleSheet(ws);
  setCols(ws, [30, 18, 18, 18, 18]);
  addReportHeader(ws, "Финансы заявок", data, 5);
  addTable(
    ws,
    6,
    ["Метрика", "Факт", "Прогноз", "Комментарий", "Период"],
    [
      ["Выручка", data.requisites.kpi.totalRevenue, data.requisites.forecast.totalRevenue, "Только самостоятельные заявки", periodLabel(data)],
      ["Прибыль", data.requisites.kpi.profitEstimate, data.requisites.forecast.profitEstimate, "После клиентского налога и внутренних расходов", periodLabel(data)],
      ["Количество", data.requisites.kpi.ordersClosed, data.requisites.forecast.ordersTotal, "Факт = CLOSED, прогноз = не CLOSED/CANCELLED", periodLabel(data)],
      ["Исключено заявок в проектах", data.requisites.kpi.linkedClosedOrdersExcluded, data.requisites.kpi.linkedOrdersExcluded, "Чтобы не было двойного счета", periodLabel(data)],
    ],
    { currencyColumns: [1, 2] },
  );
  addSectionTitle(ws, 13, "Услуги", 5);
  addTable(
    ws,
    14,
    ["Услуга", "Факт выручка", "Заявок", "Комментарий"],
    [
      ["Доставка", data.requisites.services.deliveryRevenue, data.requisites.services.deliveryOrders, ""],
      ["Монтаж", data.requisites.services.montageRevenue, data.requisites.services.montageOrders, ""],
      ["Демонтаж", data.requisites.services.demontageRevenue, data.requisites.services.demontageOrders, ""],
    ],
    { currencyColumns: [1] },
  );
}

function addProjectsSheet(wb: ExcelJS.Workbook, data: AdminAnalyticsData) {
  const ws = wb.addWorksheet("Проекты");
  styleSheet(ws);
  setCols(ws, [30, 24, 18, 15, 15, 15, 15, 12, 16, 16]);
  addReportHeader(ws, "Финансы проектов", data, 10);
  addTable(
    ws,
    6,
    ["Проект", "Заказчик", "Статус", "Выручка", "Внутр.", "Комиссия", "Налог", "Прибыль", "Маржа %", "Дата"],
    data.projects.rows
      .filter((p) => p.status !== "CANCELLED")
      .sort((a, b) => b.financials.revenueTotal - a.financials.revenueTotal)
      .map((p) => [
        p.title,
        p.customerName,
        p.status,
        p.financials.revenueTotal,
        p.financials.internalSubtotal,
        p.financials.commission,
        p.financials.tax,
        p.financials.marginAfterTax,
        p.financials.marginAfterTaxPct / 100,
        p.eventStartDate ?? p.eventEndDate ?? "",
      ]),
    { currencyColumns: [3, 4, 5, 6, 7], percentColumns: [8] },
  );
}

function addCustomersSheet(wb: ExcelJS.Workbook, data: AdminAnalyticsData) {
  const ws = wb.addWorksheet("Заказчики");
  styleSheet(ws);
  setCols(ws, [30, 12, 14, 18, 18, 18, 16, 12]);
  addReportHeader(ws, "Заказчики", data, 8);
  addTable(
    ws,
    6,
    ["Заказчик", "Проектов", "Активные", "Прогноз выручка", "Прогноз прибыль", "Факт заявок", "LTV", "Отмены %"],
    data.customers.rows.map((r) => [
      r.customerName,
      r.projectsCount,
      r.activeProjects,
      r.forecastRevenue,
      r.forecastMarginAfterTax,
      r.closedOrdersFactRevenue,
      r.ltvMixed,
      r.cancelRatePercent / 100,
    ]),
    { currencyColumns: [3, 4, 5, 6], percentColumns: [7] },
  );
}

function addInventoryProfitabilitySheet(wb: ExcelJS.Workbook, data: AdminAnalyticsData) {
  const ws = wb.addWorksheet("Реквизит");
  styleSheet(ws);
  setCols(ws, [34, 12, 16, 16, 16, 16, 14, 14]);
  addReportHeader(ws, "Рентабельность реквизита", data, 8);
  addTable(
    ws,
    6,
    ["Позиция", "Кол-во", "Закуп/шт", "Закуп всего", "Выручка", "Валовая прибыль", "Окупаемость", "ROI %"],
    data.requisites.profitability.rows.map((r) => [
      r.itemName,
      r.totalQty,
      r.unitPurchasePrice,
      r.purchaseCost,
      r.revenue,
      r.grossProfit,
      r.paybackRatio ?? null,
      r.roiPercent == null ? null : r.roiPercent / 100,
    ]),
    { currencyColumns: [2, 3, 4, 5], percentColumns: [7] },
  );
}

function addMethodologySheet(wb: ExcelJS.Workbook, data: AdminAnalyticsData) {
  const ws = wb.addWorksheet("Методология");
  styleSheet(ws);
  setCols(ws, [24, 100]);
  addReportHeader(ws, "Методология расчета", data, 2);
  addTable(
    ws,
    6,
    ["Раздел", "Правило"],
    [
      ...data.methodology.map((row) => [row.section, row.rule] as RowValue[]),
      ["Факт", "Закрытые самостоятельные заявки + завершенные проекты в выбранном периоде."],
      ["Прогноз", "Незакрытые самостоятельные заявки + активные проекты в выбранном периоде."],
      ["Двойной счет", "Если заявка привязана к проекту, ее финансы не входят в самостоятельные заявки."],
    ],
  );
}

export async function buildAdminAnalyticsXlsx(
  data: AdminAnalyticsData,
  section: AdminAnalyticsExportSection,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  setWorkbookMeta(wb);

  if (section === "global") {
    addOverviewSheet(wb, data);
    addFactForecastSheet(wb, data);
    addDynamicsSheet(wb, data);
    addRequisitesSheet(wb, data);
    addProjectsSheet(wb, data);
    addCustomersSheet(wb, data);
    addMethodologySheet(wb, data);
  } else if (section === "requisites") {
    addRequisitesSheet(wb, data);
    addInventoryProfitabilitySheet(wb, data);
    addMethodologySheet(wb, data);
  } else if (section === "projects") {
    addProjectsSheet(wb, data);
    addMethodologySheet(wb, data);
  } else if (section === "customers") {
    addCustomersSheet(wb, data);
    addMethodologySheet(wb, data);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
