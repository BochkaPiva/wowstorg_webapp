import { z } from "zod";

export const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected YYYY-MM-DD");

export function parseDateOnlyToUtcMidnight(value: string) {
  const [y, m, d] = value.split("-").map((v) => Number(v));
  const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  if (Number.isNaN(dt.getTime())) throw new Error("Invalid date");
  return dt;
}

/** Сегодняшняя дата по UTC в формате YYYY-MM-DD (согласовано с хранением date-only в БД). */
export function utcTodayDateOnlyString(): string {
  const n = new Date();
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-${String(n.getUTCDate()).padStart(2, "0")}`;
}

