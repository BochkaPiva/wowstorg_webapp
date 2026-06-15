import fs from "node:fs/promises";
import path from "node:path";

import ExcelJS from "exceljs";

import {
  calcProjectEstimateTotals,
  getNumericAmount,
  resolveProjectEstimateRates,
  roundMoney,
} from "@/lib/project-estimate-totals";
import { calcCashInternalCostTaxAmount, isCashPaymentMethod } from "@/lib/order-service-internal-costs";
import type { ProjectEstimateReadLine, ProjectEstimateReadSection } from "@/server/projects/estimate-read-model";
import {
  addFormulaRefFormula,
  applyLineFormulas,
  cashInternalTaxFormula,
  percentOfFormula,
  setXlsxFormula,
  setXlsxMoneyFormat,
  sumColumnFormula,
  sumRangesFormula,
  type XlsxDataRowRange,
  type XlsxLineColumns,
  xlsxCellRef,
  XLSX_MONEY_NUMFMT,
} from "@/server/xlsx-estimate-formulas";

const COLORS = {
  ink: "FF111827",
  muted: "FF6B7280",
  violet: "FF7C3AED",
  violetDark: "FF4C1D95",
  violetSoft: "FFF4F0FF",
  violetSoft2: "FFEDE9FE",
  yellow: "FFFFE500",
  yellowSoft: "FFFFF7D6",
  slateSoft: "FFF8FAFC",
  orangeSoft: "FFFFF7ED",
  greenSoft: "FFEFFDF5",
  white: "FFFFFFFF",
  border: "FFE5E7EB",
  borderStrong: "FFC4B5FD",
};

const FONT = "Aptos";
const LOGO_PATH = path.join(process.cwd(), "public", "brand", "wowstorg-estimate-logo.png");

type CellValue = string | number;

function baseBorder(color = COLORS.border): Partial<ExcelJS.Borders> {
  return {
    top: { style: "thin", color: { argb: color } },
    left: { style: "thin", color: { argb: color } },
    bottom: { style: "thin", color: { argb: color } },
    right: { style: "thin", color: { argb: color } },
  };
}

function styleCell(
  cell: ExcelJS.Cell,
  opts: {
    fill?: string;
    fontColor?: string;
    bold?: boolean;
    size?: number;
    horizontal?: "left" | "center" | "right";
    borderColor?: string;
  } = {},
) {
  cell.border = baseBorder(opts.borderColor);
  cell.alignment = {
    vertical: "middle",
    horizontal: opts.horizontal ?? "left",
    wrapText: true,
  };
  cell.font = {
    name: FONT,
    size: opts.size ?? 10,
    bold: opts.bold ?? false,
    color: { argb: opts.fontColor ?? COLORS.ink },
  };
  if (opts.fill) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
  }
}

function styleRange(
  ws: ExcelJS.Worksheet,
  rowFrom: number,
  rowTo: number,
  colFrom: number,
  colTo: number,
  opts: Parameters<typeof styleCell>[1] = {},
) {
  for (let row = rowFrom; row <= rowTo; row += 1) {
    for (let col = colFrom; col <= colTo; col += 1) {
      styleCell(ws.getCell(row, col), opts);
    }
  }
}

function lineClient(line: ProjectEstimateReadLine): number {
  return getNumericAmount(line.costClient);
}

function lineInternal(line: ProjectEstimateReadLine): number {
  return getNumericAmount(line.costInternal) +
    (line.internalExpenses ?? []).reduce((sum, expense) => sum + getNumericAmount(expense.cost), 0);
}

function lineCashInternalCostTax(line: ProjectEstimateReadLine): number {
  const primary = isCashPaymentMethod(line.paymentMethod)
    ? calcCashInternalCostTaxAmount(getNumericAmount(line.costInternal))
    : 0;
  const extra = (line.internalExpenses ?? []).reduce(
    (sum, expense) =>
      sum + (isCashPaymentMethod(expense.paymentMethod) ? calcCashInternalCostTaxAmount(getNumericAmount(expense.cost)) : 0),
    0,
  );
  return primary + extra;
}

function unitLabel(line: ProjectEstimateReadLine): string {
  const u = line.unit?.trim();
  return u && u.length > 0 ? u : "шт";
}

function qtyLabel(line: ProjectEstimateReadLine): string | number {
  if (line.qty != null && Number.isFinite(Number(line.qty))) return Number(line.qty);
  return "";
}

function plannedDaysLabel(line: ProjectEstimateReadLine): string | number {
  if (line.plannedDays != null && Number.isFinite(Number(line.plannedDays))) return Number(line.plannedDays);
  return "";
}

function unitPriceLabel(line: ProjectEstimateReadLine): number | string {
  if (line.unitPriceClient != null && Number.isFinite(line.unitPriceClient)) return line.unitPriceClient;
  const c = lineClient(line);
  const q = line.qty != null ? Number(line.qty) : 0;
  if (c > 0 && q > 0) return roundMoney(c / q);
  return "";
}

function sectionTitle(section: ProjectEstimateReadSection): string {
  if (section.kind === "REQUISITE") {
    return `${section.title}${section.linkedOrderStatus ? ` · ${section.linkedOrderStatus}` : ""}`;
  }
  return section.title;
}

function sectionBg(section: ProjectEstimateReadSection): string {
  if (section.kind === "REQUISITE") return COLORS.violetSoft;
  if (section.kind === "CONTRACTOR") return COLORS.orangeSoft;
  return COLORS.slateSoft;
}

function buildExportSections(sections: ProjectEstimateReadSection[]): ProjectEstimateReadSection[] {
  const sorted = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
  const unifiedRequisiteLines = sorted
    .filter((section) => section.kind === "REQUISITE" || section.kind === "DRAFT_REQUISITE")
    .flatMap((section) => section.lines)
    .map((line, index) => ({
      ...line,
      lineNumber: index + 1,
    }));
  const firstRequisiteSortOrder = sorted
    .filter((section) => section.kind === "REQUISITE" || section.kind === "DRAFT_REQUISITE")
    .reduce<number | null>((min, section) => (min == null ? section.sortOrder : Math.min(min, section.sortOrder)), null);

  const exportSections = sorted.filter(
    (section) => section.kind !== "REQUISITE" && section.kind !== "DRAFT_REQUISITE",
  );

  if (unifiedRequisiteLines.length > 0) {
    exportSections.push({
      id: "xlsx:requisite",
      sortOrder: firstRequisiteSortOrder ?? 0,
      title: "Реквизит",
      kind: "REQUISITE",
      linkedOrderId: null,
      linkedDraftOrderId: null,
      linkedOrderStatus: null,
      linkedOrderEditable: false,
      lineLocalExtras: null,
      lines: unifiedRequisiteLines,
    });
  }

  return exportSections.sort((a, b) => a.sortOrder - b.sortOrder);
}

function formatDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function formatDateRange(start: Date | string | null | undefined, end: Date | string | null | undefined): string | null {
  const s = formatDate(start);
  const e = formatDate(end);
  if (s && e && s !== e) return `${s} — ${e}`;
  return s ?? e;
}

function metaLine(label: string, value: string | null | undefined): string {
  const v = value?.trim();
  return v ? `${label}: ${v}` : `${label}: не указано`;
}

async function addLogo(ws: ExcelJS.Worksheet, wb: ExcelJS.Workbook) {
  try {
    const buffer = await fs.readFile(LOGO_PATH);
    const imageId = wb.addImage({ base64: buffer.toString("base64"), extension: "png" });
    ws.addImage(imageId, {
      tl: { col: 0.35, row: 0.35 },
      ext: { width: 180, height: 119 },
    });
  } catch {
    // The export must still work if the bundled brand asset is unavailable.
  }
}

function addHeader(
  ws: ExcelJS.Worksheet,
  args: {
    projectTitle: string;
    customerName?: string | null;
    versionNumber: number;
    variant: ProjectEstimateXlsxVariant;
    eventStartDate?: Date | string | null;
    eventEndDate?: Date | string | null;
    eventDateConfirmed?: boolean | null;
    colCount: number;
  },
) {
  for (let row = 1; row <= 7; row += 1) {
    ws.getRow(row).height = row <= 5 ? 23 : 10;
  }

  ws.mergeCells(1, 1, 5, 3);
  ws.mergeCells(1, 4, 1, args.colCount);
  ws.mergeCells(2, 4, 2, args.colCount);
  ws.mergeCells(3, 4, 3, args.colCount);
  ws.mergeCells(4, 4, 4, args.colCount);
  ws.mergeCells(5, 4, 5, args.colCount);
  styleRange(ws, 1, 5, 1, args.colCount, { fill: COLORS.white, borderColor: COLORS.white });

  const title = ws.getCell(1, 4);
  title.value = args.variant === "client" ? "Смета расходов" : "Внутренняя смета";
  styleCell(title, { bold: true, size: 22, fontColor: COLORS.violetDark, borderColor: COLORS.white });

  const project = ws.getCell(2, 4);
  project.value = args.projectTitle;
  styleCell(project, { bold: true, size: 15, borderColor: COLORS.white });

  const eventDates = formatDateRange(args.eventStartDate, args.eventEndDate);
  const metaRows = [
    metaLine("Заказчик", args.customerName),
    metaLine("Даты мероприятия", eventDates),
    "",
  ];
  for (let index = 0; index < metaRows.length; index += 1) {
    const cell = ws.getCell(3 + index, 4);
    cell.value = metaRows[index];
    styleCell(cell, { size: 10, fontColor: COLORS.muted, borderColor: COLORS.white });
  }

  styleRange(ws, 6, 6, 1, args.colCount, { fill: COLORS.violet, borderColor: COLORS.violet });
  ws.getRow(6).height = 5;
}

function styleHeaderRow(ws: ExcelJS.Worksheet, row: number, colCount: number) {
  ws.getRow(row).height = 28;
  for (let col = 1; col <= colCount; col += 1) {
    styleCell(ws.getCell(row, col), {
      fill: COLORS.violetDark,
      fontColor: COLORS.white,
      bold: true,
      horizontal: col === 1 || col >= 4 ? "center" : "left",
      borderColor: COLORS.violetDark,
    });
  }
}

function styleDataRow(ws: ExcelJS.Worksheet, row: number, colCount: number, isEven: boolean) {
  ws.getRow(row).height = 42;
  for (let col = 1; col <= colCount; col += 1) {
    styleCell(ws.getCell(row, col), {
      fill: isEven ? COLORS.slateSoft : COLORS.white,
      horizontal: col === 1 || col >= 4 ? "center" : "left",
    });
  }
}

function setMoneyFormats(ws: ExcelJS.Worksheet, row: number, cols: number[]) {
  setXlsxMoneyFormat(ws, row, cols);
}

function wrapFormulaExpr(formula: string): string {
  return formula === "0" || /^[A-Z]+\d+$/.test(formula) ? formula : `(${formula})`;
}

function addFormulaExpressions(parts: string[]): string {
  const cleaned = parts.filter((part) => part.trim().length > 0);
  if (cleaned.length === 0) return "0";
  return cleaned.map(wrapFormulaExpr).join("+");
}

function subtractFormulaExpressions(left: string, right: string): string {
  return `${wrapFormulaExpr(left)}-${wrapFormulaExpr(right)}`;
}

function percentOfExpression(rate: number, formula: string, decimals = 2): string {
  return `ROUND(${wrapFormulaExpr(formula)}*${rate},${decimals})`;
}

function addClientSectionTotal(
  ws: ExcelJS.Worksheet,
  colCount: number,
  label: string,
  formula: string,
  result: number,
) {
  ws.addRow(["", "", "", "", "", "", label, ""]);
  const row = ws.lastRow!.number;
  ws.mergeCells(row, 1, row, 6);
  ws.getRow(row).height = 26;
  for (let col = 1; col <= colCount; col += 1) {
    styleCell(ws.getCell(row, col), {
      fill: COLORS.violetSoft,
      fontColor: COLORS.violetDark,
      bold: col >= 7,
      horizontal: col >= 7 ? "right" : "left",
      borderColor: COLORS.borderStrong,
    });
  }
  setXlsxFormula(ws, row, colCount, formula, result);
  setMoneyFormats(ws, row, [colCount]);
  return row;
}

function addInternalFooterRow(
  ws: ExcelJS.Worksheet,
  colCount: number,
  label: string,
  formula: string,
  result: number,
  opts: { numFmt?: string } = {},
) {
  const cells: CellValue[] = [label, "", "", "", "", "", "", ""];
  while (cells.length < colCount) cells.push("");
  ws.addRow(cells);
  const row = ws.lastRow!.number;
  ws.mergeCells(row, 1, row, 7);
  ws.getRow(row).height = 24;
  for (let col = 1; col <= colCount; col += 1) {
    styleCell(ws.getCell(row, col), {
      fill: COLORS.slateSoft,
      fontColor: COLORS.violetDark,
      bold: true,
      horizontal: col === 8 ? "right" : "left",
    });
  }
  setXlsxFormula(ws, row, 8, formula, result);
  if (opts.numFmt) {
    ws.getCell(row, 8).numFmt = opts.numFmt;
  } else {
    setMoneyFormats(ws, row, [8]);
  }
  return row;
}

function addSummaryRow(
  ws: ExcelJS.Worksheet,
  colCount: number,
  row: number,
  label: string,
  formula: string,
  result: number,
  opts: { emphasis?: boolean; fill?: string; fontColor?: string } = {},
) {
  ws.mergeCells(row, colCount - 2, row, colCount - 1);
  ws.getCell(row, colCount - 2).value = label;
  setXlsxFormula(ws, row, colCount, formula, result);
  ws.getRow(row).height = opts.emphasis ? 30 : 25;
  for (let col = colCount - 2; col <= colCount; col += 1) {
    styleCell(ws.getCell(row, col), {
      fill: opts.fill ?? COLORS.violetSoft,
      fontColor: opts.fontColor ?? COLORS.violetDark,
      bold: true,
      size: opts.emphasis ? 12 : 10,
      horizontal: col === colCount ? "right" : "left",
      borderColor: COLORS.borderStrong,
    });
  }
  setMoneyFormats(ws, row, [colCount]);
}

function addClientSummary(
  ws: ExcelJS.Worksheet,
  colCount: number,
  totals: ReturnType<typeof calcProjectEstimateTotals>,
  subtotalFormula: string,
  subtotalResult: number,
  commissionRate: number,
  clientChargeTaxRate: number,
) {
  ws.addRow([]);
  const titleRow = ws.lastRow!.number + 1;
  ws.addRow([]);
  ws.mergeCells(titleRow, colCount - 2, titleRow, colCount);
  ws.getCell(titleRow, colCount - 2).value = "Итого по смете";
  ws.getRow(titleRow).height = 28;
  for (let col = colCount - 2; col <= colCount; col += 1) {
    styleCell(ws.getCell(titleRow, col), {
      fill: COLORS.violetDark,
      fontColor: COLORS.white,
      bold: true,
      size: 12,
      borderColor: COLORS.violetDark,
    });
  }

  addSummaryRow(ws, colCount, titleRow + 1, "Сумма по услугам", subtotalFormula, subtotalResult);
  const subtotalRef = xlsxCellRef(titleRow + 1, colCount);
  let nextRow = titleRow + 2;
  let clientTotalRef = subtotalRef;
  if (commissionRate > 0) {
    addSummaryRow(
      ws,
      colCount,
      nextRow,
      `Комиссия агентства ${roundMoney(commissionRate * 100)}%`,
      percentOfFormula(commissionRate, subtotalRef),
      totals.commission,
    );
    const commissionRef = xlsxCellRef(nextRow, colCount);
    nextRow += 1;
    const clientWithCommissionFormula = addFormulaRefFormula(subtotalRef, commissionRef);
    if (clientChargeTaxRate > 0) {
      addSummaryRow(
        ws,
        colCount,
        nextRow,
        "Итого до налога",
        clientWithCommissionFormula,
        roundMoney(totals.clientSubtotal + totals.commission),
      );
      clientTotalRef = xlsxCellRef(nextRow, colCount);
      nextRow += 1;
    } else {
      clientTotalRef = clientWithCommissionFormula;
    }
  }

  if (clientChargeTaxRate > 0) {
    addSummaryRow(
      ws,
      colCount,
      nextRow,
      `Налог ${roundMoney(clientChargeTaxRate * 100)}%`,
      percentOfFormula(clientChargeTaxRate, clientTotalRef),
      totals.clientChargeTax,
    );
    clientTotalRef = addFormulaRefFormula(clientTotalRef, xlsxCellRef(nextRow, colCount));
    nextRow += 1;
  }

  addSummaryRow(
    ws,
    colCount,
    nextRow,
    "Всего по смете",
    clientTotalRef,
    totals.revenueTotal,
    {
      emphasis: true,
      fill: COLORS.yellow,
      fontColor: COLORS.ink,
    },
  );
}

export type ProjectEstimateXlsxVariant = "internal" | "client";

export async function buildProjectEstimateXlsx(args: {
  projectTitle: string;
  versionNumber: number;
  sections: ProjectEstimateReadSection[];
  customerName?: string | null;
  eventStartDate?: Date | string | null;
  eventEndDate?: Date | string | null;
  eventDateConfirmed?: boolean | null;
  /** internal — все колонки и подытоги; client — только клиентские поля и итог для отправки клиенту. */
  variant?: ProjectEstimateXlsxVariant;
  commissionEnabled?: boolean;
  clientTaxEnabled?: boolean;
  clientChargeTaxEnabled?: boolean;
}) {
  const variant = args.variant ?? "internal";
  const isClient = variant === "client";
  const financeRates = resolveProjectEstimateRates({
    commissionEnabled: args.commissionEnabled,
    clientTaxEnabled: args.clientTaxEnabled,
    clientChargeTaxEnabled: args.clientChargeTaxEnabled,
  });
  const exportSections = buildExportSections(args.sections);

  const colCount = isClient ? 8 : 13;
  const widths = isClient
    ? [6, 30, 34, 10, 10, 10, 16, 17]
    : [6, 26, 30, 10, 10, 10, 14, 15, 13, 13, 15, 24, 20];

  const wb = new ExcelJS.Workbook();
  wb.creator = "Wowstorg";
  wb.created = new Date();
  wb.modified = new Date();

  const ws = wb.addWorksheet(isClient ? "Смета для клиента" : "Смета внутренняя", {
    views: [{ state: "frozen", ySplit: 8, showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.35,
        bottom: 0.35,
        header: 0.15,
        footer: 0.15,
      },
    },
  });
  ws.columns = widths.map((w) => ({ width: w }));
  ws.properties.defaultRowHeight = 22;
  ws.properties.outlineLevelRow = 1;

  addHeader(ws, {
    projectTitle: args.projectTitle,
    customerName: args.customerName,
    versionNumber: args.versionNumber,
    variant,
    eventStartDate: args.eventStartDate,
    eventEndDate: args.eventEndDate,
    eventDateConfirmed: args.eventDateConfirmed,
    colCount,
  });
  await addLogo(ws, wb);

  const headerCells = isClient
    ? ["№", "Услуга", "Описание", "Ед.", "Кол-во", "Дней", "Цена/ед.", "Итого"]
    : [
        "№",
        "Позиция",
        "Описание",
        "Ед.",
        "Кол-во",
        "Дней",
        "Цена/ед.",
        "Сумма",
        "Внутр.",
        "Оплата",
        "Статус оплаты",
        "Комментарий подрядчику",
        "Реквизиты",
      ];
  ws.addRow(headerCells);
  const headerRow = ws.lastRow!.number;
  styleHeaderRow(ws, headerRow, colCount);

  const lineCols: XlsxLineColumns = {
    number: 1,
    name: 2,
    qty: 5,
    days: 6,
    unitPrice: 7,
    lineTotal: 8,
    internal: 9,
    payment: 10,
  };

  let clientSubtotal = 0;
  let internalSubtotal = 0;
  let cashInternalCostTax = 0;
  let dataRowIndex = 0;
  const allClientDataRanges: XlsxDataRowRange[] = [];
  const allInternalDataRanges: XlsxDataRowRange[] = [];

  for (const section of exportSections) {
    const rowVals: CellValue[] = ["", sectionTitle(section)];
    while (rowVals.length < colCount) rowVals.push("");
    ws.addRow(rowVals);
    const sectionRow = ws.lastRow!.number;
    ws.mergeCells(sectionRow, 2, sectionRow, colCount);
    ws.getRow(sectionRow).height = 30;
    for (let col = 1; col <= colCount; col += 1) {
      styleCell(ws.getCell(sectionRow, col), {
        fill: sectionBg(section),
        fontColor: COLORS.violetDark,
        bold: true,
        size: 11,
        borderColor: COLORS.borderStrong,
      });
    }

    let sectionClient = 0;
    const sectionStartRow = ws.lastRow!.number + 1;
    let sectionFirstRow = 0;
    let sectionLastRow = 0;
    let sectionLineCount = 0;

    for (const line of section.lines) {
      if (isClient && line.lineType === "HIDDEN_EXPENSE") continue;
      const client = lineClient(line);
      const internal = lineInternal(line);
      const lineCashTax = lineCashInternalCostTax(line);
      sectionClient += client;
      clientSubtotal += client;
      internalSubtotal += internal;
      cashInternalCostTax += lineCashTax;
      dataRowIndex += 1;
      sectionLineCount += 1;

      if (isClient) {
        ws.addRow([
          "",
          line.name,
          line.description ?? "",
          unitLabel(line),
          qtyLabel(line),
          plannedDaysLabel(line),
          unitPriceLabel(line),
          "",
        ]);
      } else {
        const isContractor = section.kind === "CONTRACTOR";
        ws.addRow([
          "",
          line.name,
          line.description ?? "",
          unitLabel(line),
          qtyLabel(line),
          plannedDaysLabel(line),
          unitPriceLabel(line),
          "",
          internal || "",
          isContractor ? (line.paymentMethod ?? "") : "",
          isContractor ? (line.paymentStatus ?? "") : "",
          isContractor ? (line.contractorNote ?? "") : "",
          isContractor ? (line.contractorRequisites ?? "") : "",
        ]);
      }

      const row = ws.lastRow!.number;
      if (sectionLineCount === 1) sectionFirstRow = row;
      sectionLastRow = row;
      styleDataRow(ws, row, colCount, dataRowIndex % 2 === 0);
      ws.getCell(row, 2).font = { name: FONT, size: 10, bold: true, color: { argb: COLORS.ink } };
      applyLineFormulas(ws, row, lineCols, sectionStartRow, client);
      if (isClient) {
        setMoneyFormats(ws, row, [7, 8]);
      } else {
        setMoneyFormats(ws, row, [7, 8, 9]);
      }
    }

    if (sectionLineCount > 0) {
      const sectionRange = { firstRow: sectionFirstRow, lastRow: sectionLastRow };
      allClientDataRanges.push(sectionRange);
      allInternalDataRanges.push(sectionRange);
    }

    const sectionClientFormula =
      sectionLineCount > 0
        ? sumColumnFormula(lineCols.lineTotal, sectionFirstRow, sectionLastRow)
        : "0";
    if (isClient) {
      addClientSectionTotal(ws, colCount, "Итого по разделу", sectionClientFormula, roundMoney(sectionClient));
    } else {
      addInternalFooterRow(
        ws,
        colCount,
        "Сумма клиента, раздел",
        sectionClientFormula,
        roundMoney(sectionClient),
      );
    }

    ws.addRow([]);
  }

  const projectTotals = calcProjectEstimateTotals({
    clientSubtotal,
    internalSubtotal,
    cashInternalCostTax,
    commissionRate: financeRates.commissionRate,
    taxRate: financeRates.taxRate,
    clientChargeTaxRate: financeRates.clientChargeTaxRate,
  });

  const projectClientFormula = sumRangesFormula(lineCols.lineTotal, allClientDataRanges);
  const projectInternalFormula = sumRangesFormula(lineCols.internal!, allInternalDataRanges);

  if (isClient) {
    addClientSummary(
      ws,
      colCount,
      projectTotals,
      projectClientFormula,
      roundMoney(clientSubtotal),
      financeRates.commissionRate,
      financeRates.clientChargeTaxRate,
    );
  } else {
    ws.addRow([]);
    const titleRow = ws.lastRow!.number + 1;
    ws.addRow([]);
    ws.mergeCells(titleRow, 1, titleRow, 8);
    ws.getCell(titleRow, 1).value = "Итоги проекта";
    for (let col = 1; col <= 8; col += 1) {
      styleCell(ws.getCell(titleRow, col), {
        fill: COLORS.violetDark,
        fontColor: COLORS.white,
        bold: true,
        size: 12,
        borderColor: COLORS.violetDark,
      });
    }

    const internalRow = addInternalFooterRow(
      ws,
      colCount,
      "Расход по смете",
      projectInternalFormula,
      roundMoney(internalSubtotal),
    );
    const internalRef = xlsxCellRef(internalRow, 8);
    const revenueParts = [projectClientFormula];
    let taxableClientFormula = projectClientFormula;

    if (financeRates.commissionRate > 0) {
      const commissionRow = addInternalFooterRow(
        ws,
        colCount,
        `Комиссия агентства ${roundMoney(financeRates.commissionRate * 100)}%`,
        percentOfExpression(financeRates.commissionRate, projectClientFormula),
        projectTotals.commission,
      );
      const commissionRef = xlsxCellRef(commissionRow, 8);
      revenueParts.push(commissionRef);
      taxableClientFormula = addFormulaExpressions([projectClientFormula, commissionRef]);
    }

    if (financeRates.clientChargeTaxRate > 0) {
      const clientChargeTaxRow = addInternalFooterRow(
        ws,
        colCount,
        `Налог клиенту ${roundMoney(financeRates.clientChargeTaxRate * 100)}%`,
        percentOfExpression(financeRates.clientChargeTaxRate, taxableClientFormula),
        projectTotals.clientChargeTax,
      );
      revenueParts.push(xlsxCellRef(clientChargeTaxRow, 8));
    }

    const expenseParts = [internalRef];
    if (financeRates.taxRate > 0) {
      const nonCashTaxRow = addInternalFooterRow(
        ws,
        colCount,
        `Налог безнал ${roundMoney(financeRates.taxRate * 100)}%`,
        percentOfExpression(financeRates.taxRate, taxableClientFormula),
        projectTotals.tax,
      );
      expenseParts.push(xlsxCellRef(nonCashTaxRow, 8));
    }

    if (cashInternalCostTax > 0) {
      const cashTaxParts = allInternalDataRanges
        .map(({ firstRow, lastRow }) =>
          cashInternalTaxFormula(lineCols.internal!, lineCols.payment!, firstRow, lastRow),
        )
        .join("+");
      const cashTaxRow = addInternalFooterRow(
        ws,
        colCount,
        "Налог нал 3.5%",
        cashTaxParts || "0",
        roundMoney(cashInternalCostTax),
      );
      expenseParts.push(xlsxCellRef(cashTaxRow, 8));
    }

    const totalExpensesFormula = addFormulaExpressions(expenseParts);
    const totalExpenses = roundMoney(
      projectTotals.internalSubtotal + projectTotals.cashInternalCostTax + projectTotals.tax,
    );
    const totalExpensesRow = addInternalFooterRow(
      ws,
      colCount,
      "Итого расходов",
      totalExpensesFormula,
      totalExpenses,
    );
    const totalExpensesRef = xlsxCellRef(totalExpensesRow, 8);
    const revenueTotalFormula = addFormulaExpressions(revenueParts);
    const profitRow = addInternalFooterRow(
      ws,
      colCount,
      "Заработок",
      subtractFormulaExpressions(revenueTotalFormula, totalExpensesRef),
      projectTotals.marginAfterTax,
    );
    addInternalFooterRow(
      ws,
      colCount,
      "Рентабельность",
      `IFERROR(${xlsxCellRef(profitRow, 8)}/${wrapFormulaExpr(revenueTotalFormula)},0)`,
      projectTotals.marginAfterTaxPct / 100,
      { numFmt: "0.00%" },
    );
  }

  ws.eachRow((row) => {
    row.eachCell((cell) => {
      cell.protection = { locked: false };
    });
  });

  return Buffer.from(await wb.xlsx.writeBuffer()) as unknown as Buffer;
}
