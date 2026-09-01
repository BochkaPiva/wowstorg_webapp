export const PROJECT_ESTIMATE_TABLE_COLUMNS = [
  "name",
  "description",
  "unit",
  "qty",
  "unitPriceClient",
  "costInternal",
  "paymentMethod",
  "paymentStatus",
  "contractorNote",
  "contractorRequisites",
] as const;

export type ProjectEstimateTableColumn = (typeof PROJECT_ESTIMATE_TABLE_COLUMNS)[number];

export type ProjectEstimateTablePasteOperation = {
  rowOffset: number;
  patch: Partial<Record<ProjectEstimateTableColumn, string | null>>;
};

function normalizeClipboardCell(value: string): string {
  return value.replace(/\r/g, "").trim();
}

/**
 * Parses a rectangular TSV/CSV-like clipboard fragment from Excel or Google Sheets.
 * Tabs are the only column delimiter: commas stay available for decimal values.
 */
export function parseProjectEstimateTableClipboard(text: string): string[][] {
  const rows = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((row) => row.split("\t").map(normalizeClipboardCell));

  while (rows.length > 0 && rows[rows.length - 1]?.every((cell) => cell === "")) {
    rows.pop();
  }

  return rows;
}

export function buildProjectEstimateTablePasteOperations(args: {
  text: string;
  startColumn: ProjectEstimateTableColumn;
}): ProjectEstimateTablePasteOperation[] {
  const rows = parseProjectEstimateTableClipboard(args.text);
  const startColumnIndex = PROJECT_ESTIMATE_TABLE_COLUMNS.indexOf(args.startColumn);
  if (startColumnIndex < 0) return [];

  return rows.map((cells, rowOffset) => {
    const patch: ProjectEstimateTablePasteOperation["patch"] = {};
    cells.forEach((cell, cellOffset) => {
      const column = PROJECT_ESTIMATE_TABLE_COLUMNS[startColumnIndex + cellOffset];
      if (!column) return;
      patch[column] = cell === "" ? null : cell;
    });
    return { rowOffset, patch };
  });
}
