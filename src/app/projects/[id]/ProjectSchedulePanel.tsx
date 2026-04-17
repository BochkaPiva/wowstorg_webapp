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

function minutesToTime(total: number): string {
  const safe = Math.max(0, Math.min(total, 23 * 60 + 59));
  const h = String(Math.floor(safe / 60)).padStart(2, "0");
  const m = String(safe % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function parseIntervalEnd(intervalText: string): string | null {
  const match = intervalText.match(/(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})/);
  return match?.[2] ?? null;
}

function draftScheduleStorageKey(projectId: string) {
  return `project-schedule-draft:${projectId}`;
}

function makeTempId(prefix: string) {
  return `draft-${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneDays(days: Day[]): Day[] {
  return days.map((day) => ({
    ...day,
    slots: day.slots.map((slot) => ({ ...slot })),
  }));
}

export function ProjectSchedulePanel({
  projectId,
  readOnly,
}: {
  projectId: string;
  readOnly: boolean;
}) {
  const [serverDays, setServerDays] = React.useState<Day[]>([]);
  const [draftDays, setDraftDays] = React.useState<Day[]>([]);
  const [draftDirty, setDraftDirty] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [newDayNote, setNewDayNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const storageKey = React.useMemo(() => draftScheduleStorageKey(projectId), [projectId]);

  const load = React.useCallback(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/schedule`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { days?: Day[]; error?: { message?: string } }) => {
        if (j.days) {
          setServerDays(j.days);
          const raw = window.localStorage.getItem(storageKey);
          if (raw) {
            try {
              const parsed = JSON.parse(raw) as { days?: Day[] };
              if (Array.isArray(parsed.days)) {
                setDraftDays(parsed.days);
                setDraftDirty(true);
              } else {
                setDraftDays(cloneDays(j.days));
                setDraftDirty(false);
              }
            } catch {
              setDraftDays(cloneDays(j.days));
              setDraftDirty(false);
            }
          } else {
            setDraftDays(cloneDays(j.days));
            setDraftDirty(false);
          }
          setError(null);
        } else setError(j.error?.message ?? "Ошибка загрузки");
      })
      .catch(() => setError("Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [projectId, storageKey]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (!draftDirty) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify({ days: draftDays }));
  }, [draftDays, draftDirty, storageKey]);

  function mutateDays(mutator: (prev: Day[]) => Day[]) {
    setDraftDays((prev) => mutator(prev));
    setDraftDirty(true);
  }

  function addDay(e: React.FormEvent) {
    e.preventDefault();
    if (!newDayNote.trim() || readOnly) return;
    mutateDays((prev) => [
      ...prev,
      {
        id: makeTempId("day"),
        sortOrder: prev.length,
        dateNote: newDayNote.trim(),
        slots: [],
      },
    ]);
    setNewDayNote("");
  }

  function patchDay(dayId: string, patch: { dateNote?: string }) {
    mutateDays((prev) =>
      prev.map((day) => (day.id === dayId ? { ...day, ...(patch.dateNote != null ? { dateNote: patch.dateNote } : {}) } : day)),
    );
  }

  function deleteDay(dayId: string) {
    if (!window.confirm("Удалить день и все слоты?")) return;
    mutateDays((prev) =>
      prev
        .filter((day) => day.id !== dayId)
        .map((day, index) => ({ ...day, sortOrder: index })),
    );
  }

  function addSlot(dayId: string, intervalText: string, description: string) {
    mutateDays((prev) =>
      prev.map((day) => {
        if (day.id !== dayId) return day;
        return {
          ...day,
          slots: [
            ...day.slots,
            {
              id: makeTempId("slot"),
              sortOrder: day.slots.length,
              intervalText,
              description,
            },
          ],
        };
      }),
    );
  }

  function deleteSlot(slotId: string) {
    mutateDays((prev) =>
      prev.map((day) => ({
        ...day,
        slots: day.slots
          .filter((slot) => slot.id !== slotId)
          .map((slot, index) => ({ ...slot, sortOrder: index })),
      })),
    );
  }

  async function saveDraft() {
    if (readOnly) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days: draftDays.map((day, dayIndex) => ({
            id: day.id.startsWith("draft-") ? undefined : day.id,
            sortOrder: dayIndex,
            dateNote: day.dateNote.trim(),
            slots: day.slots.map((slot, slotIndex) => ({
              id: slot.id.startsWith("draft-") ? undefined : slot.id,
              sortOrder: slotIndex,
              intervalText: slot.intervalText.trim(),
              description: slot.description.trim(),
            })),
          })),
        }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        setDraftDirty(false);
        window.localStorage.removeItem(storageKey);
        load();
      } else {
        window.alert(j?.error?.message ?? "Ошибка");
      }
    } finally {
      setBusy(false);
    }
  }

  function discardDraft() {
    if (!window.confirm("Сбросить несохранённые изменения тайминга?")) return;
    window.localStorage.removeItem(storageKey);
    setDraftDays(cloneDays(serverDays));
    setDraftDirty(false);
  }

  const exportHref = `/api/projects/${projectId}/schedule/export`;

  return (
    <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-lg font-extrabold tracking-tight text-violet-900">Тайминг-сценарий</div>
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly ? (
            <>
              <button
                type="button"
                disabled={busy || !draftDirty}
                onClick={() => void saveDraft()}
                className={btnPrimary}
              >
                Сохранить тайминг
              </button>
              <button
                type="button"
                disabled={busy || !draftDirty}
                onClick={discardDraft}
                className={btnSecondaryXs}
              >
                Сбросить
              </button>
            </>
          ) : null}
          <a
            href={exportHref}
            className="rounded-lg border border-emerald-600/40 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
            target="_blank"
            rel="noreferrer"
          >
            Экспорт .docx
          </a>
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        Дни и слоты теперь можно собирать как черновик без перезагрузки блока. В БД тайминг уходит только после явного сохранения.
      </p>
      {!readOnly && draftDirty ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          Есть несохранённые изменения в тайминге.
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-600">Загрузка…</p>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : (
        <>
          {!readOnly ? (
            <form
              onSubmit={addDay}
              className="grid gap-2 border-b border-zinc-200 pb-3 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <input
                value={newDayNote}
                onChange={(e) => setNewDayNote(e.target.value)}
                placeholder="День (дата или «День 1»)"
                className={`min-w-[12rem] flex-1 ${inputField}`}
                maxLength={500}
              />
              <button type="submit" disabled={busy} className={`${btnPrimary} min-h-11 w-full sm:w-auto`}>
                Добавить день
              </button>
            </form>
          ) : null}

          <div className="space-y-4">
            {draftDays.length === 0 ? (
              <p className="text-sm text-zinc-600">Пока нет дней.</p>
            ) : (
              draftDays.map((d) => (
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

  React.useEffect(() => {
    const lastSlot = day.slots[day.slots.length - 1];
    if (!lastSlot) {
      setFrom("09:00");
      setTo("10:30");
      return;
    }
    const end = parseIntervalEnd(lastSlot.intervalText);
    const endMinutes = end ? timeToMinutes(end) : null;
    if (endMinutes == null) return;
    setFrom(minutesToTime(endMinutes));
    setTo(minutesToTime(endMinutes + 15));
  }, [day.slots]);

  return (
    <details className="rounded-xl border border-zinc-200 bg-white p-2.5 shadow-sm sm:p-3" open>
      <summary className="cursor-pointer font-medium text-zinc-900">{day.dateNote}</summary>
      <div className="mt-2 space-y-2">
        {!readOnly ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={`min-w-[10rem] flex-1 ${inputField}`}
            />
            <button
              type="button"
              disabled={busy || note.trim() === day.dateNote.trim()}
              className="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50 sm:text-xs"
              onClick={() => void onPatchDay(day.id, { dateNote: note.trim() })}
            >
              Сохранить название
            </button>
            <button
              type="button"
              className="min-h-11 px-1 text-sm font-medium text-red-700 hover:text-red-800 sm:text-xs"
              disabled={busy}
              onClick={() => void onDeleteDay(day.id)}
            >
              Удалить день
            </button>
          </div>
        ) : null}

        <ul className="space-y-2">
          {day.slots.map((s) => (
            <li
              key={s.id}
              className="grid gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm md:grid-cols-[160px_minmax(0,1fr)_auto]"
            >
              <div className="font-semibold text-zinc-900 md:pr-3 md:border-r md:border-zinc-200/80">
                {s.intervalText}
              </div>
              <div className="whitespace-pre-wrap text-zinc-700">{s.description}</div>
              {!readOnly ? (
                <button
                  type="button"
                  className="min-h-10 text-sm text-red-700 md:justify-self-end sm:text-xs"
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
            className="grid gap-2 border-t border-dashed border-zinc-200 pt-3 md:grid-cols-[auto_auto_minmax(0,1fr)_auto]"
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
            <div className="flex flex-wrap items-end gap-2 md:contents">
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
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 rounded-lg border border-violet-300 bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 sm:text-xs"
            >
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
