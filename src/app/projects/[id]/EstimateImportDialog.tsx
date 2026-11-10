"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PROJECT_ESTIMATE_TABLE_COLUMNS, parseProjectEstimateTableClipboard, validateEstimateImport, inferEstimateImportMapping } from "@/lib/project-estimate-table";

const labels = ["Позиция", "Описание", "Ед.", "Количество", "Цена за единицу", "Расход", "Тип оплаты", "Статус оплаты", "Комментарий", "Реквизиты"];
export function EstimateImportDialog({ onImport, onClose, maxRows = 1000 }: { onImport: (text: string) => void; onClose: () => void; maxRows?: number }) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, []);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<number[]>([]);
  const [header, setHeader] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sheets, setSheets] = useState<Record<string, string[][]>>({});
  function selectRows(next: string[][]) {
    const inferred = inferEstimateImportMapping(next);
    if (inferred.mapping.length > 60) { setRows([]); setMapping([]); setError("В таблице больше 60 столбцов. Скопируйте только нужный диапазон."); return; }
    setError(""); setRows(next); setMapping(inferred.mapping); setHeader(inferred.header);
  }
  async function fileSelected(file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError("Файл должен быть меньше 10 МБ"); return; }
    setLoading(true); setError("");
    try {
      const xlsx = await import("xlsx");
      const book = xlsx.read(await file.arrayBuffer(), { type: "array", sheetRows: 1002 });
      const result: Record<string, string[][]> = {};
      for (const name of book.SheetNames) result[name] = xlsx.utils.sheet_to_json<unknown[]>(book.Sheets[name]!, { header: 1, raw: false, defval: "", blankrows: false }).map((row) => row.map((cell) => String(cell ?? "")));
      setText(""); setSheets(result); selectRows(result[book.SheetNames[0]!] ?? []);
    } catch { setError("Не удалось прочитать таблицу. Попробуйте скопировать ячейки из Excel."); }
    finally { setLoading(false); }
  }
  const data = header ? rows.slice(1) : rows;
  const validationError = validateEstimateImport(data, mapping, maxRows);
  const valid = !validationError;
  function commit() {
    if (!valid) return;
    const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const tsv = data.map((row) => PROJECT_ESTIMATE_TABLE_COLUMNS.map((_, target) => quote(row[mapping.indexOf(target)] ?? "")).join("\t")).join("\n");
    onImport(tsv); onClose();
  }
  return createPortal(<div className="estimate-import-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="estimate-import-title" className="estimate-import" onKeyDown={(event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const fields = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)') ?? []);
        const next = fields.indexOf(document.activeElement as HTMLElement) + (event.shiftKey ? -1 : 1);
        if (next < 0 || next >= fields.length) { event.preventDefault(); fields[event.shiftKey ? fields.length - 1 : 0]?.focus(); }
      }
    }}>
      <header><h2 id="estimate-import-title">Перенести из Excel</h2><button type="button" onClick={onClose} aria-label="Закрыть импорт">×</button></header>
      <div className="estimate-import__source"><label>Открыть файл<input type="file" accept=".xlsx,.xls,.csv,.tsv" disabled={loading} onChange={(event) => void fileSelected(event.target.files?.[0])} /></label><span>или вставьте скопированные ячейки</span></div>
      <textarea aria-label="Ячейки из Excel" placeholder="Ctrl+V — вставить таблицу" disabled={loading} value={text} onChange={(event) => { setSheets({}); setText(event.target.value); selectRows(parseProjectEstimateTableClipboard(event.target.value)); }} rows={3} />
      {Object.keys(sheets).length > 1 ? <label>Лист <select onChange={(event) => selectRows(sheets[event.target.value] ?? [])}>{Object.keys(sheets).map((name) => <option key={name}>{name}</option>)}</select></label> : null}
      {rows.length ? <><label className="estimate-import__header"><input type="checkbox" checked={header} onChange={(event) => setHeader(event.target.checked)} /> Первая строка — заголовки</label>
        <div className="estimate-import__preview"><table><thead><tr>{mapping.map((target, index) => <th key={index}><select value={target} aria-label={`Назначение столбца ${index + 1}`} onChange={(event) => setMapping((prev) => prev.map((value, i) => i === index ? Number(event.target.value) : value))}><option value={-1}>Пропустить</option>{labels.map((label, i) => <option key={label} value={i}>{label}</option>)}</select></th>)}</tr></thead><tbody>{data.slice(0, 5).map((row, i) => <tr key={i}>{mapping.map((_, j) => <td key={j}>{row[j]}</td>)}</tr>)}</tbody></table></div>
      </> : null}
      {error ? <p role="alert">{error}</p> : null}
      {rows.length > 0 && validationError ? <p role="alert">{validationError}</p> : null}
      <footer><span>{loading ? "Читаем файл…" : `${data.length} поз. · добавятся в конец раздела`}</span><button type="button" onClick={commit} disabled={!valid || loading}>Добавить позиции</button></footer>
    </section>
  </div>, document.body);
}
