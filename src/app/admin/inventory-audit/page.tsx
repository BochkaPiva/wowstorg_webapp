"use client";

import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type AuditSeverity = "OK" | "WARNING" | "CRITICAL" | "FAILED";

type AuditRun = {
  id: string;
  kind: "AUTO" | "MANUAL";
  severity: AuditSeverity;
  startedAt: string;
  finishedAt: string | null;
  summaryJson: null | {
    totalItems?: number;
    okCount?: number;
    warningCount?: number;
    criticalCount?: number;
  };
  errorText: string | null;
};

type AuditItemResult = {
  id: string;
  itemId: string;
  severity: AuditSeverity;
  expectedJson: Record<string, unknown>;
  actualJson: Record<string, unknown>;
  deltaJson: Record<string, unknown>;
  explanationJson: { messages?: string[]; itemName?: string } | null;
  item: { name: string };
};

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Omsk",
  }).format(d);
}

function severityPillClass(severity: AuditSeverity) {
  if (severity === "OK") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (severity === "WARNING") return "border-amber-200 bg-amber-50 text-amber-900";
  if (severity === "CRITICAL") return "border-red-200 bg-red-50 text-red-900";
  return "border-zinc-300 bg-zinc-100 text-zinc-800";
}

export default function InventoryAuditAdminPage() {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";
  const [loading, setLoading] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [rows, setRows] = React.useState<AuditRun[]>([]);
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null);
  const [selectedItems, setSelectedItems] = React.useState<AuditItemResult[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const loadRuns = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/inventory-audit/runs?limit=25", { cache: "no-store" });
      const j = (await r.json()) as { rows?: AuditRun[]; error?: string };
      if (!r.ok) throw new Error(j.error ?? "Не удалось загрузить аудиты");
      setRows(j.rows ?? []);
      if (!selectedRunId && (j.rows?.length ?? 0) > 0) {
        setSelectedRunId(j.rows![0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [selectedRunId]);

  React.useEffect(() => {
    if (forbidden) return;
    void loadRuns();
  }, [forbidden, loadRuns]);

  React.useEffect(() => {
    if (!selectedRunId) {
      setSelectedItems([]);
      return;
    }
    let cancelled = false;
    void fetch(`/api/admin/inventory-audit/runs/${selectedRunId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { run?: { itemResults?: AuditItemResult[] } }) => {
        if (!cancelled) setSelectedItems(j.run?.itemResults ?? []);
      })
      .catch(() => {
        if (!cancelled) setSelectedItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRunId]);

  async function runManualAudit() {
    setRunning(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/inventory-audit/run", { method: "POST" });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Не удалось запустить аудит");
      await loadRuns();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка запуска");
    } finally {
      setRunning(false);
    }
  }

  return (
    <AppShell title="Аудит инвентаря">
      {forbidden ? (
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg.</div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Проверка расхождений</div>
                <div className="mt-1 text-xs text-zinc-600">
                  Автопроверка: ежедневно (cron). Время запуска задается расписанием cron; ручной запуск: кнопка ниже.
                </div>
              </div>
              <button
                type="button"
                onClick={runManualAudit}
                disabled={running}
                className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-60"
              >
                {running ? "Запуск…" : "Запустить проверку"}
              </button>
            </div>
            {error ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-4 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
              <div className="mb-2 text-sm font-semibold text-zinc-900">История запусков</div>
              {loading ? <div className="text-sm text-zinc-600">Загрузка…</div> : null}
              <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
                {rows.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRunId(r.id)}
                    className={[
                      "w-full rounded-xl border px-3 py-2 text-left transition",
                      selectedRunId === r.id
                        ? "border-violet-300 bg-violet-50"
                        : "border-zinc-200 bg-white hover:bg-zinc-50",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-zinc-600">{r.kind === "AUTO" ? "AUTO" : "MANUAL"}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${severityPillClass(r.severity)}`}>
                        {r.severity}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-600">{fmtDateTime(r.startedAt)}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-8 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
              <div className="mb-2 text-sm font-semibold text-zinc-900">Детализация по позициям</div>
              <div className="max-h-[65vh] overflow-auto rounded-xl border border-zinc-200">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead className="sticky top-0 bg-zinc-50 text-zinc-700">
                    <tr>
                      <th className="border-b border-zinc-200 px-2 py-2 text-left font-semibold">Позиция</th>
                      <th className="border-b border-zinc-200 px-2 py-2 text-left font-semibold">Severity</th>
                      <th className="border-b border-zinc-200 px-2 py-2 text-left font-semibold">actual</th>
                      <th className="border-b border-zinc-200 px-2 py-2 text-left font-semibold">expected</th>
                      <th className="border-b border-zinc-200 px-2 py-2 text-left font-semibold">delta</th>
                      <th className="border-b border-zinc-200 px-2 py-2 text-left font-semibold">Комментарий</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItems.map((it) => (
                      <tr key={it.id} className="align-top">
                        <td className="border-b border-zinc-100 px-2 py-2">{it.item.name}</td>
                        <td className="border-b border-zinc-100 px-2 py-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${severityPillClass(it.severity)}`}>
                            {it.severity}
                          </span>
                        </td>
                        <td className="border-b border-zinc-100 px-2 py-2 text-xs text-zinc-700">{JSON.stringify(it.actualJson)}</td>
                        <td className="border-b border-zinc-100 px-2 py-2 text-xs text-zinc-700">{JSON.stringify(it.expectedJson)}</td>
                        <td className="border-b border-zinc-100 px-2 py-2 text-xs text-zinc-700">{JSON.stringify(it.deltaJson)}</td>
                        <td className="border-b border-zinc-100 px-2 py-2 text-xs text-zinc-700">
                          {(it.explanationJson?.messages ?? []).join("; ") || "—"}
                        </td>
                      </tr>
                    ))}
                    {selectedItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-2 py-6 text-center text-sm text-zinc-500">
                          Выбери запуск слева, чтобы увидеть результаты.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

