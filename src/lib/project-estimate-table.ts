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

export function inferEstimateImportMapping(rows: string[][]): { mapping: number[]; header: boolean } {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const patterns = [/^(позиция|наименование|название|услуга)$/i, /^описание$/i, /^(ед\.?|единица|ед.*изм.*?)$/i, /^(кол.?во|количество|qty)$/i, /^(цена.*|тариф)$/i, /^(расход.*|себестоимость.*)$/i, /^(тип|способ) оплаты$/i, /^статус оплаты$/i, /^комментарий$/i, /^реквизиты.*$/i];
  const guessed = Array.from({length: width}, (_, col) => patterns.findIndex((pattern) => pattern.test(rows[0]?.[col]?.trim() ?? "")));
  const recognized = guessed.filter((target) => target >= 0);
  const header = recognized.length >= 2 && new Set(recognized).size === recognized.length;
  return {header, mapping: header ? guessed : Array.from({length: width}, (_, col) => col < PROJECT_ESTIMATE_TABLE_COLUMNS.length ? col : -1)};
}

export function validateEstimateImport(rows: string[][], mapping: number[], maxRows: number): string | null {
  if (rows.length === 0) return "Вставьте ячейки или откройте файл.";
  if (rows.length > maxRows) return `В этом разделе можно добавить ещё ${maxRows} строк.`;
  const assigned = mapping.filter((target) => target >= 0);
  if (new Set(assigned).size !== assigned.length) return "Каждый столбец сметы можно назначить только один раз.";
  if (!assigned.includes(0)) return "Выберите столбец с названиями позиций.";
  const limits = [500, 5000, 40, 0, 0, 0, 40, 120, 5000, 500];
  for (const row of rows) {
    if (!row[mapping.indexOf(0)]?.trim()) return "У каждой позиции должно быть название. Проверьте столбец «Позиция» и строку заголовков.";
    for (let col = 0; col < mapping.length; col++) {
      const target = mapping[col]!;
      const value = row[col]?.trim() ?? "";
      if ([3, 4, 5].includes(target) && value && !Number.isFinite(Number(normalizeEstimateNumber(value)))) return "В числовых столбцах есть текст. Проверьте назначение колонок.";
      if (target >= 0 && limits[target] && value.length > limits[target]!) return `Слишком длинное значение в строке ${rows.indexOf(row) + 1}, столбце ${col + 1}.`;
    }
  }
  return null;
}

function normalizeEstimateNumber(value: string): string {
  return value.replace(/[\s\u00a0\u202f₽]/g, "").replace(/руб\.?$/i, "").replace(",", ".");
}

function normalizeClipboardCell(value: string): string {
  return value.replace(/\r/g, "").trim();
}

/**
 * Parses a rectangular TSV/CSV-like clipboard fragment from Excel or Google Sheets.
 * Tabs are the only column delimiter: commas stay available for decimal values.
 */
export function parseProjectEstimateTableClipboard(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const source = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"' && (quoted || cell === "")) {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (char === "\t" || char === "\n")) {
      row.push(normalizeClipboardCell(cell)); cell = "";
      if (char === "\n") { rows.push(row); row = []; }
    } else cell += char;
  }
  row.push(normalizeClipboardCell(cell)); rows.push(row);

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
      const value = ["qty", "unitPriceClient", "costInternal"].includes(column)
        ? normalizeEstimateNumber(cell) : cell;
      patch[column] = value === "" ? null : value;
    });
    return { rowOffset, patch };
  });
}
