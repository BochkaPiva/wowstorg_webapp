"use client";

import Link from "next/link";
import React from "react";

type EstLine = {
  id: string;
  position: number;
  lineNumber: number;
  name: string;
  description: string | null;
  lineType: string;
  costClient: string | null;
  costInternal: string | null;
  orderLineId: string | null;
  itemId: string | null;
};

type EstSection = {
  id: string;
  sortOrder: number;
  title: string;
  kind: "LOCAL" | "REQUISITE";
  linkedOrderId: string | null;
  lines: EstLine[];
};

type VersionMeta = {
  id: string;
  versionNumber: number;
  note: string | null;
  isPrimary: boolean;
  createdAt: string;
  createdBy: { displayName: string };
};

type EstimatePayload = {
  projectTitle: string;
  projectOrders?: Array<{
    id: string;
    status: string;
    eventName: string | null;
    startDate: string;
    endDate: string;
  }>;
  versions: VersionMeta[];
  current: {
    id: string;
    versionNumber: number;
    note: string | null;
    createdAt: string;
    sections: EstSection[];
  } | null;
};

/** Единый стиль с ProjectSchedulePanel и остальными блоками проекта */
const inputField =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200/50";
const btnPrimary =
  "rounded-lg border border-violet-300 bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50";
const btnSecondary =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50";
const btnSecondaryXs =
  "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50";
const inputFieldCompact =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200/50";

export function ProjectEstimatePanel({
  projectId,
  readOnly,
}: {
  projectId: string;
  readOnly: boolean;
}) {
  const [data, setData] = React.useState<EstimatePayload | null>(null);
  /** null = основная версия с сервера; число = явный выбор */
  const [selectedVersion, setSelectedVersion] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [newSectionTitle, setNewSectionTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [selectedImportOrderIds, setSelectedImportOrderIds] = React.useState<string[]>([]);

  const load = React.useCallback(
    (v: number | null) => {
      setLoading(true);
      const q = v != null ? `?version=${v}` : "";
      fetch(`/api/projects/${projectId}/estimate${q}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j: EstimatePayload & { error?: { message?: string } }) => {
          if (j.error?.message) {
            setError(j.error.message);
            setData(null);
          } else {
            setData(j);
            setError(null);
          }
        })
        .catch(() => {
          setError("Не удалось загрузить смету");
          setData(null);
        })
        .finally(() => setLoading(false));
    },
    [projectId],
  );

  React.useEffect(() => {
    load(selectedVersion);
  }, [load, selectedVersion]);

  function refreshActivity() {
    window.dispatchEvent(new CustomEvent("project-activity-refresh"));
  }

  async function createVersion(duplicate: boolean) {
    if (readOnly) return;
    const note = window.prompt("Комментарий к версии (необязательно)") ?? "";
    const vNum = data?.current?.versionNumber;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estimate/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: note.trim() || null,
          ...(duplicate && vNum != null ? { duplicateFromVersionNumber: vNum } : {}),
        }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.version) {
        setSelectedVersion(j.version.versionNumber);
        refreshActivity();
      } else {
        window.alert(j?.error?.message ?? "Ошибка");
      }
    } finally {
      setBusy(false);
    }
  }

  async function setPrimaryVersion(versionNumber: number) {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estimate/versions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionNumber, isPrimary: true }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        setSelectedVersion(versionNumber);
        load(versionNumber);
      } else {
        window.alert(j?.error?.message ?? "Ошибка");
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteVersion(versionNumber: number) {
    if (!window.confirm(`Удалить версию v${versionNumber}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estimate/versions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionNumber }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        setSelectedVersion(null);
        load(null);
        refreshActivity();
      } else {
        window.alert(j?.error?.message ?? "Ошибка");
      }
    } finally {
      setBusy(false);
    }
  }

  async function importFromOrders() {
    if (selectedImportOrderIds.length === 0 || !data?.current) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estimate/versions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionNumber: data.current.versionNumber,
          importOrderIds: selectedImportOrderIds,
        }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        setImportOpen(false);
        setSelectedImportOrderIds([]);
        load(selectedVersion);
      } else {
        window.alert(j?.error?.message ?? "Ошибка");
      }
    } finally {
      setBusy(false);
    }
  }

  async function addSection(e: React.FormEvent) {
    e.preventDefault();
    if (!newSectionTitle.trim() || readOnly) return;
    const vn = selectedVersion ?? data?.current?.versionNumber ?? undefined;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estimate/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newSectionTitle.trim(), versionNumber: vn }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        setNewSectionTitle("");
        load(selectedVersion);
      } else window.alert(j?.error?.message ?? "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSection(id: string) {
    if (!window.confirm("Удалить раздел и все его строки?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estimate/sections/${id}`, {
        method: "DELETE",
      });
      const j = await res.json().catch(() => null);
      if (res.ok) load(selectedVersion);
      else window.alert(j?.error?.message ?? "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function patchSection(sectionId: string, patch: { title?: string }) {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estimate/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) load(selectedVersion);
      else window.alert(j?.error?.message ?? "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function saveLine(lineId: string, patch: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estimate/lines/${lineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) load(selectedVersion);
      else window.alert(j?.error?.message ?? "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function deleteLine(lineId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estimate/lines/${lineId}`, {
        method: "DELETE",
      });
      const j = await res.json().catch(() => null);
      if (res.ok) load(selectedVersion);
      else window.alert(j?.error?.message ?? "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  const vn = selectedVersion ?? data?.current?.versionNumber ?? null;
  const currentVersionMeta = data?.versions.find((v) => v.versionNumber === vn) ?? null;
  const pdfHref =
    vn != null
      ? `/api/projects/${projectId}/estimate/pdf?version=${encodeURIComponent(String(vn))}`
      : `/api/projects/${projectId}/estimate/pdf`;
  const availableImportOrders = React.useMemo(() => {
    if (!data?.projectOrders || !data.current) return [];
    const imported = new Set(
      data.current.sections
        .filter((s) => s.kind === "REQUISITE" && s.linkedOrderId)
        .map((s) => s.linkedOrderId as string),
    );
    return data.projectOrders.filter((o) => !imported.has(o.id));
  }, [data]);

  const totals = React.useMemo(() => {
    const COMMISSION_RATE = 0.15;
    const sections = data?.current?.sections ?? [];
    let clientSubtotal = 0;
    let internalSubtotal = 0;
    for (const s of sections) {
      for (const l of s.lines) {
        const c = l.costClient != null ? Number(l.costClient) : 0;
        const i = l.costInternal != null ? Number(l.costInternal) : 0;
        if (Number.isFinite(c)) clientSubtotal += c;
        if (Number.isFinite(i)) internalSubtotal += i;
      }
    }
    const commission = clientSubtotal * COMMISSION_RATE;
    const clientTotal = clientSubtotal + commission;
    const profit = clientSubtotal - internalSubtotal + commission;
    const profitPct = clientTotal > 0 ? (profit / clientTotal) * 100 : 0;
    return {
      clientSubtotal,
      commission,
      clientTotal,
      internalSubtotal,
      profit,
      profitPct,
    };
  }, [data?.current?.sections]);

  function money(n: number) {
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-lg font-extrabold tracking-tight text-violet-900">Смета проекта</div>
        {vn != null ? (
          <a
            href={pdfHref}
            className="rounded-lg border border-emerald-600/40 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
            target="_blank"
            rel="noreferrer"
          >
            Скачать PDF (клиент)
          </a>
        ) : null}
      </div>
      {data?.current ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
            <div className="text-[11px] font-semibold text-zinc-600">Сумма (клиент)</div>
            <div className="mt-1 text-base font-bold tabular-nums text-zinc-900">{money(totals.clientSubtotal)} ₽</div>
          </div>
          <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
            <div className="text-[11px] font-semibold text-violet-800">Комиссия 15%</div>
            <div className="mt-1 text-base font-bold tabular-nums text-violet-900">{money(totals.commission)} ₽</div>
          </div>
          <div className="rounded-xl border border-violet-300 bg-violet-100/70 px-3 py-2">
            <div className="text-[11px] font-semibold text-violet-900">Итого клиент</div>
            <div className="mt-1 text-base font-extrabold tabular-nums text-violet-950">{money(totals.clientTotal)} ₽</div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="text-[11px] font-semibold text-amber-900">Себестоимость</div>
            <div className="mt-1 text-base font-bold tabular-nums text-amber-950">{money(totals.internalSubtotal)} ₽</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div className="text-[11px] font-semibold text-emerald-900">Прибыль</div>
            <div className="mt-1 text-base font-bold tabular-nums text-emerald-950">{money(totals.profit)} ₽</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2">
            <div className="text-[11px] font-semibold text-emerald-900">Маржа</div>
            <div className="mt-1 text-base font-bold tabular-nums text-emerald-950">
              {Number.isFinite(totals.profitPct) ? `${totals.profitPct.toFixed(0)}%` : "—"}
            </div>
          </div>
        </div>
      ) : null}
      <p className="text-xs text-zinc-500">
        Версии сметы независимы от Excel-сметы заявки. Блок «Реквизит» появляется при создании заявки из
        проекта (копия позиций на тот момент). Комиссия 15% в PDF считается от суммы цен клиента по строкам.
      </p>

      {loading ? (
        <p className="text-sm text-zinc-600">Загрузка…</p>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : !data ? (
        <p className="text-sm text-zinc-600">Нет данных сметы.</p>
      ) : !data.current && data.versions.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-zinc-600">Версий сметы ещё нет.</p>
          {!readOnly ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void createVersion(false)}
              className={btnPrimary}
            >
              Создать первую версию
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="text-xs font-semibold text-zinc-600 sm:min-w-[12rem]">
              Версия
              <select
                className={`mt-1 w-full sm:ml-1 sm:w-auto ${inputField}`}
                value={vn != null ? String(vn) : ""}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setSelectedVersion(Number.isNaN(v) ? null : v);
                }}
              >
                {data.versions.map((v) => (
                  <option key={v.id} value={v.versionNumber}>
                    v{v.versionNumber}
                    {v.isPrimary ? " · основная" : ""}
                    {v.note ? ` — ${v.note}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {currentVersionMeta ? (
              <div className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800">
                {currentVersionMeta.isPrimary ? "Основная версия" : "Черновая версия"}
              </div>
            ) : null}
            {!readOnly ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void createVersion(false)}
                  className="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50 sm:text-xs"
                >
                  Новая версия
                </button>
                <button
                  type="button"
                  disabled={busy || !data.current}
                  onClick={() => void createVersion(true)}
                  className="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50 sm:text-xs"
                >
                  Дублировать текущую
                </button>
                {data.current ? (
                  <button
                    type="button"
                    disabled={busy || currentVersionMeta?.isPrimary === true}
                    onClick={() => void setPrimaryVersion(data.current!.versionNumber)}
                    className="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50 sm:text-xs"
                  >
                    Сделать основной
                  </button>
                ) : null}
                {data.current ? (
                  <button
                    type="button"
                    disabled={busy || data.versions.length <= 1}
                    onClick={() => void deleteVersion(data.current!.versionNumber)}
                    className="min-h-11 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 shadow-sm hover:bg-red-100 disabled:opacity-50 sm:text-xs"
                  >
                    Удалить версию
                  </button>
                ) : null}
              </>
            ) : null}
          </div>

          {!data.current ? (
            <p className="text-sm text-zinc-600">Выберите версию.</p>
          ) : (
            <>
              {!readOnly ? (
                <div className="space-y-2 border-b border-zinc-200 pb-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || availableImportOrders.length === 0}
                      onClick={() => setImportOpen((v) => !v)}
                      className={btnSecondary}
                    >
                      Подтянуть из заявок
                    </button>
                  </div>
                  {importOpen ? (
                    <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/40 p-3 space-y-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Выбери заявки проекта для импорта в текущую версию
                      </div>
                      {availableImportOrders.length === 0 ? (
                        <div className="text-sm text-zinc-600">Все заявки проекта уже добавлены в эту версию.</div>
                      ) : (
                        <div className="space-y-2">
                          {availableImportOrders.map((order) => (
                            <label
                              key={order.id}
                              className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                            >
                              <input
                                type="checkbox"
                                checked={selectedImportOrderIds.includes(order.id)}
                                onChange={(e) =>
                                  setSelectedImportOrderIds((prev) =>
                                    e.target.checked ? [...prev, order.id] : prev.filter((id) => id !== order.id),
                                  )
                                }
                                className="mt-0.5"
                              />
                              <span className="min-w-0">
                                <span className="block font-medium text-zinc-900">
                                  {order.eventName?.trim() ? order.eventName : `Заявка ${order.id.slice(0, 8)}…`}
                                </span>
                                <span className="block text-xs text-zinc-500">
                                  {order.startDate} — {order.endDate} · {order.status}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy || selectedImportOrderIds.length === 0}
                          onClick={() => void importFromOrders()}
                          className={btnPrimary}
                        >
                          Импортировать выбранные
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setImportOpen(false);
                            setSelectedImportOrderIds([]);
                          }}
                          className={btnSecondary}
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <form
                    onSubmit={addSection}
                    className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <input
                      value={newSectionTitle}
                      onChange={(e) => setNewSectionTitle(e.target.value)}
                      placeholder="Новый локальный раздел"
                      className={`min-w-[12rem] flex-1 ${inputField}`}
                      maxLength={200}
                    />
                    <button type="submit" disabled={busy} className={btnPrimary}>
                      Добавить раздел
                    </button>
                  </form>
                </div>
              ) : null}

              <div className="space-y-4">
                {data.current.sections.map((sec) => (
                  <EstimateSectionBlock
                    key={sec.id}
                    sec={sec}
                    readOnly={readOnly}
                    busy={busy}
                    onPatchSection={patchSection}
                    onDeleteSection={deleteSection}
                  >
                    {sec.lines.map((ln) => (
                      <LineEditor
                        key={ln.id}
                        line={ln}
                        readOnly={readOnly}
                        busy={busy}
                        onSave={saveLine}
                        onDelete={deleteLine}
                      />
                    ))}

                    {!readOnly ? (
                      <AddLineForm
                        projectId={projectId}
                        sectionId={sec.id}
                        busy={busy}
                        onDone={() => load(selectedVersion)}
                      />
                    ) : null}
                  </EstimateSectionBlock>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function EstimateSectionBlock({
  sec,
  readOnly,
  busy,
  onPatchSection,
  onDeleteSection,
  children,
}: {
  sec: EstSection;
  readOnly: boolean;
  busy: boolean;
  onPatchSection: (id: string, patch: { title?: string }) => void | Promise<void>;
  onDeleteSection: (id: string) => void | Promise<void>;
  children: React.ReactNode;
}) {
  const [titleDraft, setTitleDraft] = React.useState(sec.title);

  React.useEffect(() => {
    setTitleDraft(sec.title);
  }, [sec.id, sec.title]);

  function saveTitle() {
    const t = titleDraft.trim();
    if (!t || t === sec.title) return;
    void onPatchSection(sec.id, { title: t });
  }

  return (
    <details className="rounded-xl border border-zinc-200 bg-white p-2.5 shadow-sm sm:p-3" open>
      <summary className="cursor-pointer font-medium text-zinc-900">
        {sec.title}{" "}
        <span className="font-normal text-zinc-500">
          ({sec.kind === "REQUISITE" ? "реквизит" : "локально"})
        </span>
        {sec.linkedOrderId ? (
          <>
            {" "}
            <Link
              href={`/orders/${sec.linkedOrderId}`}
              className="text-violet-700 hover:text-violet-900"
              onClick={(e) => e.stopPropagation()}
            >
              заявка
            </Link>
          </>
        ) : null}
      </summary>
      <div className="mt-2 space-y-2">
        {!readOnly ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              placeholder="Название раздела"
              className="min-w-[10rem] flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200/50"
              maxLength={200}
            />
            <button
              type="button"
              disabled={busy || titleDraft.trim() === sec.title.trim() || !titleDraft.trim()}
              className="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
              onClick={() => void saveTitle()}
            >
              Сохранить название
            </button>
            {sec.kind === "LOCAL" ? (
              <button
                type="button"
                className="min-h-11 px-1 text-sm font-medium text-red-700 hover:text-red-800 sm:text-xs"
                onClick={() => void onDeleteSection(sec.id)}
                disabled={busy}
              >
                Удалить раздел
              </button>
            ) : null}
          </div>
        ) : null}

        {children}
      </div>
    </details>
  );
}

function LineEditor({
  line,
  readOnly,
  busy,
  onSave,
  onDelete,
}: {
  line: EstLine;
  readOnly: boolean;
  busy: boolean;
  onSave: (id: string, p: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = React.useState(line.name);
  const [cc, setCc] = React.useState(line.costClient ?? "");
  const [ci, setCi] = React.useState(line.costInternal ?? "");
  const [desc, setDesc] = React.useState(line.description ?? "");

  React.useEffect(() => {
    setName(line.name);
    setCc(line.costClient ?? "");
    setCi(line.costInternal ?? "");
    setDesc(line.description ?? "");
  }, [line]);

  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-2.5 text-sm shadow-sm">
      <div className="mb-2 text-[11px] font-medium text-zinc-500">
        №{line.lineNumber}
        {line.orderLineId ? " · из заявки" : ""}
      </div>
      {readOnly ? (
        <div className="mt-1 space-y-0.5">
          <div className="font-medium">{line.name}</div>
          {line.description ? <div className="text-xs text-zinc-600">{line.description}</div> : null}
          <div className="text-xs">
            Клиент: {line.costClient ?? "—"} · Внутр.: {line.costInternal ?? "—"}
          </div>
        </div>
      ) : (
        <div className="grid gap-2 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1.7fr)_132px_132px_auto]">
          <label className="block text-[11px] font-semibold text-zinc-500">
            Название
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`mt-1 w-full ${inputFieldCompact}`}
            />
          </label>
          <label className="block text-[11px] font-semibold text-zinc-500">
            Описание
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className={`mt-1 w-full ${inputFieldCompact}`}
            />
          </label>
          <label className="block text-[11px] font-semibold text-zinc-500">
            Клиент
            <input
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className={`mt-1 w-full ${inputFieldCompact}`}
              inputMode="decimal"
            />
          </label>
          <label className="block text-[11px] font-semibold text-zinc-500">
            Внутр.
            <input
              value={ci}
              onChange={(e) => setCi(e.target.value)}
              className={`mt-1 w-full ${inputFieldCompact}`}
              inputMode="decimal"
            />
          </label>
          <div className="flex flex-wrap items-end gap-2 xl:justify-end">
            <button
              type="button"
              disabled={busy}
              className="min-h-11 rounded-lg border border-violet-300 bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 xl:text-xs"
              onClick={() =>
                void onSave(line.id, {
                  name: name.trim(),
                  description: desc.trim() || null,
                  costClient: cc === "" ? null : parseFloat(cc.replace(",", ".")),
                  costInternal: ci === "" ? null : parseFloat(ci.replace(",", ".")),
                })
              }
            >
              Сохранить строку
            </button>
            {!line.orderLineId ? (
              <button
                type="button"
                disabled={busy}
                className="min-h-11 px-1 text-sm font-medium text-red-700 hover:text-red-800 xl:text-xs"
                onClick={() => void onDelete(line.id)}
              >
                Удалить
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function AddLineForm({
  projectId,
  sectionId,
  busy,
  onDone,
}: {
  projectId: string;
  sectionId: string;
  busy: boolean;
  onDone: () => void;
}) {
  const [name, setName] = React.useState("");
  const [cc, setCc] = React.useState("");
  const [ci, setCi] = React.useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await fetch(`/api/projects/${projectId}/estimate/sections/${sectionId}/lines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        costClient: cc === "" ? null : parseFloat(cc.replace(",", ".")),
        costInternal: ci === "" ? null : parseFloat(ci.replace(",", ".")),
      }),
    });
    const j = await res.json().catch(() => null);
    if (res.ok) {
      setName("");
      setCc("");
      setCi("");
      onDone();
    } else window.alert(j?.error?.message ?? "Ошибка");
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-2 border-t border-dashed border-zinc-200 pt-3 md:grid-cols-[minmax(0,1.8fr)_116px_116px_auto]"
    >
      <input
        placeholder="Новая строка"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={`min-w-[8rem] ${inputFieldCompact}`}
      />
      <input
        placeholder="Клиент"
        value={cc}
        onChange={(e) => setCc(e.target.value)}
        className={inputFieldCompact}
      />
      <input
        placeholder="Внутр."
        value={ci}
        onChange={(e) => setCi(e.target.value)}
        className={inputFieldCompact}
      />
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="min-h-11 rounded-lg border border-violet-300 bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
      >
        + строка
      </button>
    </form>
  );
}
