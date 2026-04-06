"use client";

import React from "react";

type Slot = { id: string; sortOrder: number; intervalText: string; description: string };
type Day = { id: string; sortOrder: number; dateNote: string; slots: Slot[] };

const inputField =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200/50";
const btnPrimary =
  "rounded-lg border border-violet-300 bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50";
const btnPrimaryXs =
  "rounded-lg border border-violet-300 bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50";
const btnSecondaryXs =
  "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50";

function timeToMinutes(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  if (h < 0 || h > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

export function ProjectSchedulePanel({
  projectId,
  readOnly,
}: {
  projectId: string;
  readOnly: boolean;
}) {
  const [days, setDays] = React.useState<Day[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [newDayNote, setNewDayNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/schedule`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { days?: Day[]; error?: { message?: string } }) => {
        if (j.days) {
          setDays(j.days);
          setError(null);
        } else setError(j.error?.message ?? "Ошибка загрузки");
      })
      .catch(() => setError("Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [projectId]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function addDay(e: React.FormEvent) {
    e.preventDefault();
    if (!newDayNote.trim() || readOnly) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateNote: newDayNote.trim() }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        setNewDayNote("");
        load();
      } else window.alert(j?.error?.message ?? "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function patchDay(dayId: string, patch: object) {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/schedule/days/${dayId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) load();
      else window.alert(j?.error?.message ?? "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDay(dayId: string) {
    if (!window.confirm("Удалить день и все слоты?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/schedule/days/${dayId}`, { method: "DELETE" });
      const j = await res.json().catch(() => null);
      if (res.ok) load();
      else window.alert(j?.error?.message ?? "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function addSlot(dayId: string, intervalText: string, description: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/schedule/days/${dayId}/slots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalText, description }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) load();
      else window.alert(j?.error?.message ?? "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSlot(slotId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/schedule/slots/${slotId}`, {
        method: "DELETE",
      });
      const j = await res.json().catch(() => null);
      if (res.ok) load();
      else window.alert(j?.error?.message ?? "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  const exportHref = `/api/projects/${projectId}/schedule/export`;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-lg font-extrabold tracking-tight text-violet-900">Тайминг-сценарий</div>
        <a
          href={exportHref}
          className="rounded-lg border border-emerald-600/40 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
          target="_blank"
          rel="noreferrer"
        >
          Экспорт .docx
        </a>
      </div>
      <p className="text-xs text-zinc-500">
        Дни и слоты (интервал + описание). В Word — таблица «Интервал» и «Описание сценария» по каждому дню.
      </p>

      {loading ? (
        <p className="text-sm text-zinc-600">Загрузка…</p>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : (
        <>
          {!readOnly ? (
            <form onSubmit={addDay} className="flex flex-wrap items-end gap-2 border-b border-zinc-200 pb-3">
              <input
                value={newDayNote}
                onChange={(e) => setNewDayNote(e.target.value)}
                placeholder="День (дата или «День 1»)"
                className={`min-w-[12rem] flex-1 ${inputField}`}
                maxLength={500}
              />
              <button type="submit" disabled={busy} className={btnPrimary}>
                Добавить день
              </button>
            </form>
          ) : null}

          <div className="space-y-4">
            {days.length === 0 ? (
              <p className="text-sm text-zinc-600">Пока нет дней.</p>
            ) : (
              days.map((d) => (
                <DayBlock
                  key={d.id}
                  day={d}
                  readOnly={readOnly}
                  busy={busy}
                  onPatchDay={patchDay}
                  onDeleteDay={deleteDay}
                  onAddSlot={addSlot}
                  onDeleteSlot={deleteSlot}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DayBlock({
  day,
  readOnly,
  busy,
  onPatchDay,
  onDeleteDay,
  onAddSlot,
  onDeleteSlot,
}: {
  day: Day;
  readOnly: boolean;
  busy: boolean;
  onPatchDay: (id: string, p: object) => void;
  onDeleteDay: (id: string) => void;
  onAddSlot: (dayId: string, interval: string, desc: string) => void;
  onDeleteSlot: (slotId: string) => void;
}) {
  const [note, setNote] = React.useState(day.dateNote);
  const [from, setFrom] = React.useState("09:00");
  const [to, setTo] = React.useState("10:30");
  const [desc, setDesc] = React.useState("");
  const [slotError, setSlotError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setNote(day.dateNote);
  }, [day.dateNote]);

  return (
    <details className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm" open>
      <summary className="cursor-pointer font-medium text-zinc-900">{day.dateNote}</summary>
      <div className="mt-2 space-y-2">
        {!readOnly ? (
          <div className="flex flex-wrap items-end gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={`min-w-[10rem] flex-1 ${inputField}`}
            />
            <button
              type="button"
              disabled={busy || note.trim() === day.dateNote.trim()}
              className={btnSecondaryXs}
              onClick={() => void onPatchDay(day.id, { dateNote: note.trim() })}
            >
              Сохранить название
            </button>
            <button
              type="button"
              className="text-xs font-medium text-red-700 hover:text-red-800"
              disabled={busy}
              onClick={() => void onDeleteDay(day.id)}
            >
              Удалить день
            </button>
          </div>
        ) : null}

        <ul className="space-y-2">
          {day.slots.map((s) => (
            <li key={s.id} className="rounded-lg border border-zinc-100 bg-zinc-50 px-2 py-2 text-sm">
              <div className="font-medium text-zinc-900">{s.intervalText}</div>
              <div className="whitespace-pre-wrap text-zinc-700">{s.description}</div>
              {!readOnly ? (
                <button
                  type="button"
                  className="mt-1 text-xs text-red-700"
                  disabled={busy}
                  onClick={() => void onDeleteSlot(s.id)}
                >
                  Удалить слот
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        {!readOnly ? (
          <form
            className="flex flex-col gap-2 border-t border-dashed border-zinc-200 pt-3 md:flex-row md:flex-wrap"
            onSubmit={(e) => {
              e.preventDefault();
              const a = timeToMinutes(from);
              const b = timeToMinutes(to);
              if (a == null || b == null) {
                setSlotError("Укажи время в формате ЧЧ:ММ");
                return;
              }
              if (b <= a) {
                setSlotError("Интервал должен идти вперёд (например 09:00–10:30)");
                return;
              }
              if (!desc.trim()) {
                setSlotError("Добавь описание сценария");
                return;
              }
              setSlotError(null);
              void onAddSlot(day.id, `${from}–${to}`, desc.trim());
              setDesc("");
            }}
          >
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-semibold text-zinc-600">
                С
                <input
                  type="time"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className={`mt-0.5 block ${inputField}`}
                />
              </label>
              <label className="text-xs font-semibold text-zinc-600">
                До
                <input
                  type="time"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className={`mt-0.5 block ${inputField}`}
                />
              </label>
            </div>
            <input
              placeholder="Описание сценария"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className={`min-w-[8rem] flex-1 ${inputField}`}
            />
            <button type="submit" disabled={busy} className={btnPrimaryXs}>
              + слот
            </button>
            {slotError ? (
              <div className="text-xs font-medium text-red-700">{slotError}</div>
            ) : null}
          </form>
        ) : null}
      </div>
    </details>
  );
}
