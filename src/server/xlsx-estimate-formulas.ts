import type ExcelJS from "exceljs";

export const XLSX_MONEY_NUMFMT = '#,##0.00 "₽"';

export type XlsxLineColumns = {
  number: number;
  name: number;
  qty: number;
  days: number;
  unitPrice: number;
  lineTotal: number;
  internal?: number;
  payment?: number;
};

export function xlsxColLetter(col: number): string {
  let n = col;
  let letter = "";
  while (n > 0) {
    const mod = (n - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

export function xlsxCellRef(row: number, col: number): string {
  return `${xlsxColLetter(col)}${row}`;
}

export function xlsxAbsCellRef(row: number, col: number): string {
  return `$${xlsxColLetter(col)}$${row}`;
}

export function xlsxFormulaCell(formula: string, result?: number): ExcelJS.CellFormulaValue {
  return result === undefined ? { formula } : { formula, result };
}

export function setXlsxFormula(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  formula: string,
  result?: number,
) {
  ws.getCell(row, col).value = xlsxFormulaCell(formula, result);
}

export function setXlsxMoneyFormat(ws: ExcelJS.Worksheet, row: number, cols: number[]) {
  for (const col of cols) {
    ws.getCell(row, col).numFmt = XLSX_MONEY_NUMFMT;
  }
}

/** Автонумерация внутри раздела: номер только если заполнено название позиции. */
export function lineNumberFormula(nameCol: number, sectionStartRow: number, row: number): string {
  const name = xlsxCellRef(row, nameCol);
  const sectionStart = xlsxAbsCellRef(sectionStartRow, nameCol);
  return `IF(${name}="","",COUNTA(${sectionStart}:${name}))`;
}

/** Итог строки: кол-во × дней (пустые дни = 1) × цена за ед. */
export function lineTotalFormula(cols: XlsxLineColumns, row: number): string {
  const qty = xlsxCellRef(row, cols.qty);
  const days = xlsxCellRef(row, cols.days);
  const unitPrice = xlsxCellRef(row, cols.unitPrice);
  const name = xlsxCellRef(row, cols.name);
  return `IF(${name}="","",IF(${unitPrice}="","",${qty}*IF(${days}="",1,${days})*${unitPrice}))`;
}

export function sumColumnFormula(col: number, firstRow: number, lastRow: number): string {
  if (lastRow < firstRow) return "0";
  return `SUM(${xlsxCellRef(firstRow, col)}:${xlsxCellRef(lastRow, col)})`;
}

export function roundMoneyFormula(amountRef: string, decimals = 2): string {
  return `ROUND(${amountRef},${decimals})`;
}

export function percentOfFormula(rate: number, amountRef: string, decimals = 2): string {
  return roundMoneyFormula(`${amountRef}*${rate}`, decimals);
}

export function addFormulaRefFormula(leftRef: string, rightRef: string): string {
  return `${leftRef}+${rightRef}`;
}

export function subtractFormulaRefs(minuendRef: string, subtrahendRef: string): string {
  return `${minuendRef}-${subtrahendRef}`;
}

export type XlsxDataRowRange = {
  firstRow: number;
  lastRow: number;
};

export function appendDataRowRange(ranges: XlsxDataRowRange[], row: number) {
  const last = ranges[ranges.length - 1];
  if (last && last.lastRow + 1 === row) {
    last.lastRow = row;
    return;
  }
  ranges.push({ firstRow: row, lastRow: row });
}

export function sumRangesFormula(col: number, ranges: XlsxDataRowRange[]): string {
  if (ranges.length === 0) return "0";
  return ranges
    .map(({ firstRow, lastRow }) => sumColumnFormula(col, firstRow, lastRow))
    .join("+");
}

export function applyLineFormulas(
  ws: ExcelJS.Worksheet,
  row: number,
  cols: XlsxLineColumns,
  sectionStartRow: number,
  lineTotalResult?: number,
) {
  setXlsxFormula(ws, row, cols.number, lineNumberFormula(cols.name, sectionStartRow, row));
  setXlsxFormula(ws, row, cols.lineTotal, lineTotalFormula(cols, row), lineTotalResult);
  setXlsxMoneyFormat(ws, row, [cols.unitPrice, cols.lineTotal]);
  if (cols.internal) setXlsxMoneyFormat(ws, row, [cols.internal]);
}

export function cashInternalTaxFormula(
  internalCol: number,
  paymentCol: number,
  firstRow: number,
  lastRow: number,
  rate = 0.035,
): string {
  if (lastRow < firstRow) return "0";
  const internalRange = `${xlsxCellRef(firstRow, internalCol)}:${xlsxCellRef(lastRow, internalCol)}`;
  const paymentRange = `${xlsxCellRef(firstRow, paymentCol)}:${xlsxCellRef(lastRow, paymentCol)}`;
  return roundMoneyFormula(
    `(SUMIF(${paymentRange},"Наличные",${internalRange})+SUMIF(${paymentRange},"Наличка",${internalRange})+SUMIF(${paymentRange},"CASH",${internalRange}))*${rate}`,
  );
}
