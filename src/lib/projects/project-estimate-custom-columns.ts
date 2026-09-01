import { z } from "zod";

export const PROJECT_ESTIMATE_CUSTOM_COLUMN_TYPES = [
  "TEXT",
  "NUMBER",
  "DATE",
  "CHECKBOX",
  "FORMULA",
] as const;

export type ProjectEstimateCustomColumnType = (typeof PROJECT_ESTIMATE_CUSTOM_COLUMN_TYPES)[number];

export const PROJECT_ESTIMATE_CUSTOM_COLUMN_LIMIT = 12;

export const ProjectEstimateCustomColumnSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    key: z.string().trim().regex(/^c_[a-z0-9_]{6,72}$/),
    label: z.string().trim().min(1).max(80),
    type: z.enum(PROJECT_ESTIMATE_CUSTOM_COLUMN_TYPES),
    formula: z.string().trim().max(500).nullable().optional(),
    sortOrder: z.number().int().min(0).max(PROJECT_ESTIMATE_CUSTOM_COLUMN_LIMIT - 1),
    width: z.number().int().min(120).max(360),
  })
  .strict()
  .superRefine((column, ctx) => {
    if (column.type === "FORMULA") {
      if (!column.formula) {
        ctx.addIssue({ code: "custom", path: ["formula"], message: "Укажите формулу" });
        return;
      }
      const parsed = validateProjectEstimateFormula(column.formula);
      if (!parsed.ok) {
        ctx.addIssue({ code: "custom", path: ["formula"], message: parsed.error });
      }
    } else if (column.formula) {
      ctx.addIssue({ code: "custom", path: ["formula"], message: "Формула разрешена только для типа FORMULA" });
    }
  });

export type ProjectEstimateCustomColumn = z.infer<typeof ProjectEstimateCustomColumnSchema>;

export const ProjectEstimateCustomColumnsSchema = z
  .array(ProjectEstimateCustomColumnSchema)
  .max(PROJECT_ESTIMATE_CUSTOM_COLUMN_LIMIT)
  .superRefine((columns, ctx) => {
    const ids = new Set<string>();
    const keys = new Set<string>();
    for (const [index, column] of columns.entries()) {
      if (ids.has(column.id)) ctx.addIssue({ code: "custom", path: [index, "id"], message: "Повторяющийся id" });
      if (keys.has(column.key)) ctx.addIssue({ code: "custom", path: [index, "key"], message: "Повторяющийся key" });
      ids.add(column.id);
      keys.add(column.key);
    }
  });

export const ProjectEstimateCustomValuesSchema = z.record(
  z.string().trim().min(1).max(128),
  z.string().max(5000).nullable(),
);

export const PROJECT_ESTIMATE_FORMULA_FIELDS = {
  line_number: "Номер строки",
  qty: "Количество",
  unit_price: "Цена за единицу",
  client_total: "Сумма клиенту",
  internal_total: "Внутренний расход",
  margin: "Маржа строки",
} as const;

type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: "+" | "-" | "*" | "/" | "%" }
  | { type: "left" | "right" | "comma" };

class FormulaError extends Error {}

function tokenize(expression: string): Token[] {
  if (expression.length > 500) throw new FormulaError("Формула слишком длинная");
  const tokens: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index]!;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      const match = expression.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
      if (!match) throw new FormulaError("Некорректное число");
      const value = Number(match[0]);
      if (!Number.isFinite(value)) throw new FormulaError("Некорректное число");
      tokens.push({ type: "number", value });
      index += match[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const match = expression.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/)!;
      tokens.push({ type: "identifier", value: match[0].toLowerCase() });
      index += match[0].length;
      continue;
    }
    if (char === "+" || char === "-" || char === "*" || char === "/" || char === "%") {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }
    if (char === "(") tokens.push({ type: "left" });
    else if (char === ")") tokens.push({ type: "right" });
    else if (char === ",") tokens.push({ type: "comma" });
    else throw new FormulaError(`Недопустимый символ «${char}»`);
    index += 1;
  }
  if (tokens.length > 160) throw new FormulaError("Формула слишком сложная");
  return tokens;
}

class FormulaParser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly variables: Record<string, number> | null,
  ) {}

  parse(): number {
    const value = this.parseAdditive();
    if (this.index !== this.tokens.length) throw new FormulaError("Проверьте скобки и операторы");
    if (!Number.isFinite(value)) throw new FormulaError("Результат не является числом");
    return value;
  }

  private parseAdditive(): number {
    let value = this.parseMultiplicative();
    while (this.peekOperator("+") || this.peekOperator("-")) {
      const operator = (this.tokens[this.index++] as Extract<Token, { type: "operator" }>).value;
      const right = this.parseMultiplicative();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  private parseMultiplicative(): number {
    let value = this.parseUnary();
    while (this.peekOperator("*") || this.peekOperator("/") || this.peekOperator("%")) {
      const operator = (this.tokens[this.index++] as Extract<Token, { type: "operator" }>).value;
      const right = this.parseUnary();
      if ((operator === "/" || operator === "%") && right === 0) throw new FormulaError("Деление на ноль");
      value = operator === "*" ? value * right : operator === "/" ? value / right : value % right;
    }
    return value;
  }

  private parseUnary(): number {
    if (this.peekOperator("+")) {
      this.index += 1;
      return this.parseUnary();
    }
    if (this.peekOperator("-")) {
      this.index += 1;
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const token = this.tokens[this.index++];
    if (!token) throw new FormulaError("Формула не закончена");
    if (token.type === "number") return token.value;
    if (token.type === "left") {
      const value = this.parseAdditive();
      if (this.tokens[this.index]?.type !== "right") throw new FormulaError("Не закрыта скобка");
      this.index += 1;
      return value;
    }
    if (token.type !== "identifier") throw new FormulaError("Ожидалось число или поле");
    if (this.tokens[this.index]?.type === "left") return this.parseFunction(token.value);
    if (this.variables == null) return 0;
    if (!Object.prototype.hasOwnProperty.call(this.variables, token.value)) {
      throw new FormulaError(`Неизвестное поле «${token.value}»`);
    }
    return this.variables[token.value] ?? 0;
  }

  private parseFunction(name: string): number {
    if (!["round", "min", "max", "abs"].includes(name)) throw new FormulaError(`Функция «${name}» не разрешена`);
    this.index += 1;
    const args: number[] = [];
    if (this.tokens[this.index]?.type !== "right") {
      while (true) {
        args.push(this.parseAdditive());
        if (this.tokens[this.index]?.type !== "comma") break;
        this.index += 1;
      }
    }
    if (this.tokens[this.index]?.type !== "right") throw new FormulaError("Не закрыта скобка функции");
    this.index += 1;
    if (name === "abs" && args.length === 1) return Math.abs(args[0]!);
    if (name === "round" && (args.length === 1 || args.length === 2)) {
      const precision = Math.max(0, Math.min(4, Math.trunc(args[1] ?? 0)));
      const factor = 10 ** precision;
      return Math.round(args[0]! * factor) / factor;
    }
    if (name === "min" && args.length >= 1) return Math.min(...args);
    if (name === "max" && args.length >= 1) return Math.max(...args);
    throw new FormulaError(`Неверное число аргументов функции «${name}»`);
  }

  private peekOperator(value: Extract<Token, { type: "operator" }>["value"]): boolean {
    const token = this.tokens[this.index];
    return token?.type === "operator" && token.value === value;
  }
}

export function validateProjectEstimateFormula(expression: string): { ok: true } | { ok: false; error: string } {
  try {
    new FormulaParser(tokenize(expression), null).parse();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Некорректная формула" };
  }
}

export function evaluateProjectEstimateFormula(
  expression: string,
  variables: Record<string, number>,
): { value: number | null; error: string | null } {
  try {
    const value = new FormulaParser(tokenize(expression), variables).parse();
    return { value: Math.round(value * 10_000) / 10_000, error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : "Ошибка формулы" };
  }
}

export type ProjectEstimateFormulaResult = {
  value: number | null;
  error: string | null;
};

/**
 * Resolves formula columns by their stable keys. Raw/custom values never feed the
 * canonical financial totals; this helper is display-only for the estimate grid.
 */
export function evaluateProjectEstimateCustomColumns(args: {
  columns: ProjectEstimateCustomColumn[];
  rawValues?: Record<string, string> | null;
  canonicalValues: Record<keyof typeof PROJECT_ESTIMATE_FORMULA_FIELDS, number>;
}): Record<string, ProjectEstimateFormulaResult> {
  const orderedColumns = [...args.columns].sort((a, b) => a.sortOrder - b.sortOrder);
  const columnByKey = new Map(orderedColumns.map((column) => [column.key, column]));
  const results: Record<string, ProjectEstimateFormulaResult> = {};
  const visiting = new Set<string>();

  const resolveColumn = (column: ProjectEstimateCustomColumn): ProjectEstimateFormulaResult => {
    const cached = results[column.id];
    if (cached) return cached;
    if (visiting.has(column.id)) {
      const cycle = { value: null, error: "Циклическая ссылка в формуле" };
      results[column.id] = cycle;
      return cycle;
    }
    if (column.type !== "FORMULA") {
      const raw = args.rawValues?.[column.id]?.trim() ?? "";
      const numeric = column.type === "CHECKBOX" ? (raw === "true" ? 1 : 0) : Number(raw.replace(",", "."));
      const value = raw && Number.isFinite(numeric) ? numeric : 0;
      const resolved = { value, error: null };
      results[column.id] = resolved;
      return resolved;
    }

    visiting.add(column.id);
    const variables: Record<string, number> = { ...args.canonicalValues };
    const referencedKeys = new Set(
      tokenize(column.formula ?? "")
        .filter((token): token is Extract<Token, { type: "identifier" }> => token.type === "identifier")
        .map((token) => token.value)
        .filter((key) => !["round", "min", "max", "abs"].includes(key)),
    );
    for (const key of referencedKeys) {
      const dependency = columnByKey.get(key);
      if (!dependency) continue;
      const dependencyResult = resolveColumn(dependency);
      if (dependencyResult.error) {
        visiting.delete(column.id);
        const invalidDependency = { value: null, error: dependencyResult.error };
        results[column.id] = invalidDependency;
        return invalidDependency;
      }
      variables[key] = dependencyResult.value ?? 0;
    }
    const resolved = evaluateProjectEstimateFormula(column.formula ?? "", variables);
    visiting.delete(column.id);
    results[column.id] = resolved;
    return resolved;
  };

  for (const column of orderedColumns) resolveColumn(column);
  return results;
}

export function normalizeProjectEstimateCustomCellValue(
  type: ProjectEstimateCustomColumnType,
  raw: string | null | undefined,
): string | null {
  if (type === "FORMULA") return null;
  const value = raw?.trim() ?? "";
  if (!value) return null;
  if (type === "NUMBER") {
    const number = Number(value.replace(",", "."));
    return Number.isFinite(number) ? String(number) : null;
  }
  if (type === "CHECKBOX") return value === "true" ? "true" : "false";
  if (type === "DATE") return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  return value.slice(0, 5000);
}
