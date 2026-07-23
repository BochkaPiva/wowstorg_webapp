import { FinancialReconciliationMatchStatus } from "@prisma/client";
import * as XLSX from "xlsx";

import { prisma } from "../db";

export type ReconciliationParsedRow = {
  rowNumber: number;
  externalNumber: string | null;
  projectName: string;
  revenue: number;
  expenses: number;
  profit: number;
  marginPercent: number;
  bonusPool: number;
  bonusFirst: number;
  bonusSecond: number;
  sourceLink: string | null;
  matchStatus: FinancialReconciliationMatchStatus;
  matchedEntityType: "PROJECT" | "ORDER" | null;
  matchedEntityId: string | null;
  matchNote: string | null;
  originalData: Record<string, string | number | null>;
};

type RawRow = Omit<
  ReconciliationParsedRow,
  "matchStatus" | "matchedEntityType" | "matchedEntityId" | "matchNote"
>;

const HEADER_ALIASES = {
  externalNumber: ["№", "номер"],
  projectName: ["проект", "название проекта"],
  revenue: ["сумма по смете", "выручка"],
  expenses: ["наши расходы", "расходы"],
  profit: ["заработок", "прибыль"],
  marginPercent: ["рентабельность", "маржа"],
  bonusPool: ["бонусы", "бонусный пул"],
  bonusFirst: ["бонусы александр", "бонус александр"],
  bonusSecond: ["бонусы михаил", "бонус михаил"],
  sourceLink: ["смета ваусторг", "смета баусторг", "ссылка", "смета"],
} as const;

function normalizedHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("ru")
    .replace(/\s+/g, " ");
}

function normalizedName(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("ru")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\b\d{1,2}[._-]\d{1,2}(?:[._-]\d{2,4})?\b/g, "")
    .replace(/[_–—-]+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numberValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let raw = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, "")
    .replace(/(?:руб\.?|р\.?)/giu, "")
    .replace(/%/g, "")
    .replace(/[^\d.,+-]/g, "");
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    if (dot > comma) raw = raw.replace(/,/g, "");
    else raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (comma >= 0) {
    const decimals = raw.length - comma - 1;
    raw = decimals > 0 && decimals <= 2 ? raw.replace(",", ".") : raw.replace(/,/g, "");
  } else if (dot >= 0) {
    const decimals = raw.length - dot - 1;
    if (decimals === 3) raw = raw.replace(/\./g, "");
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasCellValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function findColumn(headers: unknown[], aliases: readonly string[]): number {
  const normalized = headers.map(normalizedHeader);
  return normalized.findIndex((value) => aliases.includes(value));
}

function extractLinkId(link: string | null) {
  if (!link) return null;
  const project = link.match(/\/projects\/([a-z0-9_-]+)/i);
  if (project) return { type: "PROJECT" as const, id: project[1] };
  const order = link.match(/\/orders\/([a-z0-9_-]+)/i);
  if (order) return { type: "ORDER" as const, id: order[1] };
  return null;
}

function excelCellLink(sheet: XLSX.WorkSheet, rowIndex: number, columnIndex: number): string | null {
  if (columnIndex < 0) return null;
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
  const cell = sheet[address] as XLSX.CellObject & { l?: { Target?: string } };
  const target = cell?.l?.Target?.trim();
  if (target) return target;
  const value = String(cell?.v ?? "").trim();
  return /^https?:\/\//i.test(value) ? value : null;
}

export function parseFinancialWorkbook(buffer: ArrayBuffer): {
  sheetName: string;
  rows: RawRow[];
  totals: {
    revenue: number;
    expenses: number;
    profit: number;
    bonusPool: number;
    bonusFirst: number;
    bonusSecond: number;
  };
} {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("В книге нет листов");
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
  });

  const headerIndex = matrix.findIndex((row) => {
    const headers = row.map(normalizedHeader);
    return headers.includes("проект") && headers.some((value) => value === "сумма по смете");
  });
  if (headerIndex < 0) {
    throw new Error("Не найдена строка заголовков с колонками «Проект» и «Сумма по смете»");
  }

  const headers = matrix[headerIndex];
  const columns = {
    externalNumber: findColumn(headers, HEADER_ALIASES.externalNumber),
    projectName: findColumn(headers, HEADER_ALIASES.projectName),
    revenue: findColumn(headers, HEADER_ALIASES.revenue),
    expenses: findColumn(headers, HEADER_ALIASES.expenses),
    profit: findColumn(headers, HEADER_ALIASES.profit),
    marginPercent: findColumn(headers, HEADER_ALIASES.marginPercent),
    bonusPool: findColumn(headers, HEADER_ALIASES.bonusPool),
    bonusFirst: findColumn(headers, HEADER_ALIASES.bonusFirst),
    bonusSecond: findColumn(headers, HEADER_ALIASES.bonusSecond),
    sourceLink: findColumn(headers, HEADER_ALIASES.sourceLink),
  };

  if (columns.projectName < 0 || columns.revenue < 0 || columns.expenses < 0) {
    throw new Error("В книге не хватает обязательных финансовых колонок");
  }

  const rows: RawRow[] = [];
  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const row = matrix[index];
    const projectName = String(row[columns.projectName] ?? "").trim();
    if (!projectName) continue;
    const revenue = numberValue(row[columns.revenue]);
    const expenses = numberValue(row[columns.expenses]);
    const profitValue = columns.profit >= 0 ? row[columns.profit] : null;
    const profit = hasCellValue(profitValue) ? numberValue(profitValue) : revenue - expenses;
    const marginValue = columns.marginPercent >= 0 ? row[columns.marginPercent] : null;
    const marginPercent = hasCellValue(marginValue)
      ? numberValue(marginValue) * (typeof marginValue === "number" && Math.abs(marginValue) <= 1 ? 100 : 1)
      : (revenue > 0 ? (profit / revenue) * 100 : 0);
    const bonusPoolValue = columns.bonusPool >= 0 ? row[columns.bonusPool] : null;
    const bonusPool = hasCellValue(bonusPoolValue) ? numberValue(bonusPoolValue) : profit * 0.15;
    const bonusFirstValue = columns.bonusFirst >= 0 ? row[columns.bonusFirst] : null;
    const bonusSecondValue = columns.bonusSecond >= 0 ? row[columns.bonusSecond] : null;
    const sourceLink =
      excelCellLink(sheet, index, columns.sourceLink)
      ?? (columns.sourceLink >= 0 ? String(row[columns.sourceLink] ?? "").trim() || null : null);

    rows.push({
      rowNumber: index + 1,
      externalNumber:
        columns.externalNumber >= 0 ? String(row[columns.externalNumber] ?? "").trim() || null : null,
      projectName,
      revenue,
      expenses,
      profit,
      marginPercent,
      bonusPool,
      bonusFirst: hasCellValue(bonusFirstValue) ? numberValue(bonusFirstValue) : bonusPool / 2,
      bonusSecond: hasCellValue(bonusSecondValue) ? numberValue(bonusSecondValue) : bonusPool / 2,
      sourceLink,
      originalData: Object.fromEntries(
        headers.map((header, columnIndex) => [
          String(header || `Колонка ${columnIndex + 1}`),
          row[columnIndex] == null ? null : String(row[columnIndex]),
        ]),
      ),
    });
  }

  return {
    sheetName,
    rows,
    totals: {
      revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
      expenses: rows.reduce((sum, row) => sum + row.expenses, 0),
      profit: rows.reduce((sum, row) => sum + row.profit, 0),
      bonusPool: rows.reduce((sum, row) => sum + row.bonusPool, 0),
      bonusFirst: rows.reduce((sum, row) => sum + row.bonusFirst, 0),
      bonusSecond: rows.reduce((sum, row) => sum + row.bonusSecond, 0),
    },
  };
}

export async function matchFinancialRows(rows: RawRow[]): Promise<ReconciliationParsedRow[]> {
  const [projects, orders] = await Promise.all([
    prisma.project.findMany({
      take: 1000,
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true },
    }),
    prisma.order.findMany({
      take: 1000,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        eventName: true,
        customer: { select: { name: true } },
      },
    }),
  ]);

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const byName = new Map<string, Array<{ type: "PROJECT" | "ORDER"; id: string; title: string }>>();

  for (const project of projects) {
    const key = normalizedName(project.title);
    if (!key) continue;
    byName.set(key, [...(byName.get(key) ?? []), { type: "PROJECT", id: project.id, title: project.title }]);
  }
  for (const order of orders) {
    const title = order.eventName?.trim() || order.customer.name;
    const key = normalizedName(title);
    if (!key) continue;
    byName.set(key, [...(byName.get(key) ?? []), { type: "ORDER", id: order.id, title }]);
  }

  return rows.map((row) => {
    const linked = extractLinkId(row.sourceLink);
    if (linked) {
      const entity = linked.type === "PROJECT" ? projectById.get(linked.id) : orderById.get(linked.id);
      if (!entity) {
        return {
          ...row,
          matchStatus: FinancialReconciliationMatchStatus.CONFLICT,
          matchedEntityType: linked.type,
          matchedEntityId: linked.id,
          matchNote: "Ссылка содержит id, которого нет в текущей базе",
        };
      }
      const entityTitle =
        linked.type === "PROJECT"
          ? (entity as { title: string }).title
          : ((entity as { eventName: string | null; customer: { name: string } }).eventName?.trim()
            || (entity as { customer: { name: string } }).customer.name);
      const nameDiffers = normalizedName(entityTitle) !== normalizedName(row.projectName);
      return {
        ...row,
        matchStatus: nameDiffers
          ? FinancialReconciliationMatchStatus.CONFLICT
          : FinancialReconciliationMatchStatus.MATCHED,
        matchedEntityType: linked.type,
        matchedEntityId: linked.id,
        matchNote: nameDiffers
          ? `Ссылка ведёт на «${entityTitle}», а в таблице указано «${row.projectName}»`
          : "Точное совпадение по ссылке",
      };
    }

    const candidates = byName.get(normalizedName(row.projectName)) ?? [];
    if (candidates.length === 1) {
      return {
        ...row,
        matchStatus: FinancialReconciliationMatchStatus.MATCHED,
        matchedEntityType: candidates[0].type,
        matchedEntityId: candidates[0].id,
        matchNote: "Единственное точное совпадение по названию",
      };
    }
    if (candidates.length > 1) {
      return {
        ...row,
        matchStatus: FinancialReconciliationMatchStatus.CONFLICT,
        matchedEntityType: null,
        matchedEntityId: null,
        matchNote: `Найдено несколько совпадений по названию: ${candidates.length}`,
      };
    }
    return {
      ...row,
      matchStatus: FinancialReconciliationMatchStatus.UNMATCHED,
      matchedEntityType: null,
      matchedEntityId: null,
      matchNote: "Совпадений в текущей базе не найдено",
    };
  });
}
