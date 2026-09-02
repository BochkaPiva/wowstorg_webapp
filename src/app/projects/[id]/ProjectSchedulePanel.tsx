"use client";

import React from "react";

import { ProjectModuleContentSkeleton } from "./ProjectModuleBoundary";

type Slot = { id: string; sortOrder: number; intervalText: string; description: string };
type Day = { id: string; sortOrder: number; dateNote: string; slots: Slot[] };

const inputField =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200/50";
const btnPrimary =
  "rounded-lg border border-violet-300 bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50";

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 18v2h14v-2" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}

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

function parseInterval(intervalText: string): { start: number; end: number } | null {
  const match = intervalText.match(/(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})/);
  if (!match) return null;
  const start = timeToMinutes(match[1]);
  const end = timeToMinutes(match[2]);
  if (start == null || end == null || end <= start) return null;
  return { start, end };
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
  const [viewMode, setViewMode] = React.useState<"timeline" | "table">("timeline");
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const storageKey = React.useMemo(() => draftScheduleStorageKey(projectId), [projectId]);

  React.useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const load = React.useCallback((showSkeleton = true) => {
    if (showSkeleton) setLoading(true);
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
      .finally(() => {
        if (showSkeleton) setLoading(false);
      });
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
    setComposerOpen(false);
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

  const saveDraft = React.useCallback(async () => {
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
        load(false);
      } else {
        window.alert(j?.error?.message ?? "Ошибка");
      }
    } finally {
      setBusy(false);
    }
  }, [draftDays, load, projectId, readOnly, storageKey]);

  React.useEffect(() => {
    if (!draftDirty || readOnly || busy) return;
    const timer = window.setTimeout(() => void saveDraft(), 900);
    return () => window.clearTimeout(timer);
  }, [busy, draftDays, draftDirty, readOnly, saveDraft]);

  function discardDraft() {
    if (!window.confirm("Сбросить несохранённые изменения тайминга?")) return;
    window.localStorage.removeItem(storageKey);
    setDraftDays(cloneDays(serverDays));
    setDraftDirty(false);
  }

  const exportHref = `/api/projects/${projectId}/schedule/export`;

  return (
    <div className="project-schedule-panel">
      <div className="project-schedule-panel__toolbar">
        <div className="project-schedule-panel__views" role="group" aria-label="Вид тайминг-плана">
          <button type="button" onClick={() => setViewMode("timeline")} aria-pressed={viewMode === "timeline"}>Лента</button>
          <button type="button" onClick={() => setViewMode("table")} aria-pressed={viewMode === "table"}>Таблица</button>
        </div>
        <div className="project-schedule-panel__controls">
          {!readOnly && viewMode === "table" ? (
            <button type="button" className="project-schedule-panel__quiet-action" onClick={() => setComposerOpen((current) => !current)}>
              <span aria-hidden>＋</span> День
            </button>
          ) : null}
          {!readOnly ? (
            <span className="project-schedule-panel__save-state" data-state={busy ? "saving" : draftDirty ? "dirty" : "saved"} aria-live="polite">
              {busy ? "Сохраняю…" : draftDirty ? "Есть изменения" : "Сохранено"}
            </span>
          ) : null}
          <a
            href={exportHref}
            target="_blank"
            rel="noreferrer"
            className="project-workspace-action-button"
            aria-label="Скачать тайминг-план DOCX"
            title="Скачать DOCX"
          >
            <DownloadIcon />
          </a>
          {!readOnly && draftDirty ? (
            <div ref={menuRef} className="project-schedule-panel__menu">
              <button
                type="button"
                className="project-workspace-action-button"
                aria-label="Действия тайминг-плана"
                title="Действия"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((current) => !current)}
              >
                <MoreIcon />
              </button>
              {menuOpen ? (
                <div>
                  <button type="button" disabled={busy} onClick={() => { setMenuOpen(false); discardDraft(); }}>Сбросить черновик</button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {loading ? (
        <ProjectModuleContentSkeleton rows={3} />
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : (
        <>
          {!readOnly && viewMode === "table" && composerOpen ? (
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

          {viewMode === "timeline" ? (
            <ScheduleTimeline days={draftDays} />
          ) : <div className="project-schedule-panel__days">
            {draftDays.length === 0 ? (
              <div className="project-schedule-panel__empty">Добавьте первый день и его события.</div>
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
          </div>}
        </>
      )}
    </div>
  );
}

function ScheduleTimeline({ days }: { days: Day[] }) {
  const slots = days.flatMap((day) => day.slots.map((slot) => ({ day, slot, interval: parseInterval(slot.intervalText) })))
    .filter((item): item is { day: Day; slot: Slot; interval: { start: number; end: number } } => Boolean(item.interval));
  if (!days.length) return <div className="project-schedule-panel__empty">Пока нет событий. Переключитесь в таблицу, чтобы собрать тайминг.</div>;

  const start = slots.length ? Math.max(0, Math.floor(Math.min(...slots.map((item) => item.interval.start)) / 60) * 60) : 8 * 60;
  const end = slots.length ? Math.min(24 * 60, Math.ceil(Math.max(...slots.map((item) => item.interval.end)) / 60) * 60) : 20 * 60;
  const safeEnd = Math.max(start + 60, end);
  const span = safeEnd - start;
  const tickCount = Math.min(9, Math.floor(span / 60) + 1);
  const ticks = Array.from({ length: tickCount }, (_, index) => {
    const minute = start + Math.round((span * index) / Math.max(1, tickCount - 1));
    return minutesToTime(minute);
  });

  return (
    <div className="project-schedule-timeline">
      <div className="project-schedule-timeline__axis" aria-hidden>
        <span />
        <div>{ticks.map((tick) => <span key={tick}>{tick}</span>)}</div>
      </div>
      {days.map((day) => (
        <section key={day.id} className="project-schedule-timeline__day">
          <h3>{day.dateNote}</h3>
          <div className="project-schedule-timeline__tracks">
            {day.slots.length ? day.slots.map((slot) => {
              const interval = parseInterval(slot.intervalText);
              const left = interval ? Math.max(0, ((interval.start - start) / span) * 100) : 0;
              const width = interval ? Math.max(3, ((interval.end - interval.start) / span) * 100) : 100;
              return (
                <div key={slot.id} className="project-schedule-timeline__row">
                  <span className="project-schedule-timeline__time">{slot.intervalText}</span>
                  <div className="project-schedule-timeline__track">
                    <span className="project-schedule-timeline__bar" style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }} title={`${slot.intervalText} — ${slot.description}`}>
                      <strong>{slot.description}</strong>
                    </span>
                  </div>
                </div>
              );
            }) : <div className="project-schedule-timeline__day-empty">Событий пока нет</div>}
          </div>
        </section>
      ))}
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
  const [editingName, setEditingName] = React.useState(false);

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
    <details className="project-schedule-day" open>
      <summary className="project-schedule-day__summary">
        {editingName && !readOnly ? (
          <input
            value={note}
            disabled={busy}
            onChange={(event) => setNote(event.target.value)}
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
            onBlur={() => {
              const nextNote = note.trim();
              setEditingName(false);
              if (!nextNote) setNote(day.dateNote);
              else if (nextNote !== day.dateNote) onPatchDay(day.id, { dateNote: nextNote });
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setNote(day.dateNote);
                setEditingName(false);
              }
            }}
            className="project-schedule-day__title-input"
            aria-label="Название дня"
            maxLength={500}
            autoFocus
          />
        ) : !readOnly ? (
          <button
            type="button"
            className="project-schedule-day__title"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setEditingName(true);
            }}
            title="Нажмите, чтобы переименовать"
          >
            {day.dateNote}
          </button>
        ) : <strong>{day.dateNote}</strong>}
        {!readOnly ? (
          <button
            type="button"
            className="project-schedule-day__delete"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDeleteDay(day.id);
            }}
            aria-label={`Удалить ${day.dateNote}`}
            title="Удалить день"
          >
            <svg viewBox="0 0 20 20" aria-hidden><path d="M7 3h6l.7 1.5H17V6H3V4.5h3.3L7 3zm-2 4h10l-.6 10H5.6L5 7zm3 2v6h1.5V9H8zm3 0v6h1.5V9H11z" /></svg>
          </button>
        ) : null}
      </summary>
      <div className="mt-2 space-y-2">
        <ul className="project-schedule-day__slots">
          {day.slots.map((s) => (
            <li
              key={s.id}
              className="project-schedule-slot"
            >
              <div className="project-schedule-slot__time">
                {s.intervalText}
              </div>
              <div className="project-schedule-slot__description">{s.description}</div>
              {!readOnly ? (
                <button
                  type="button"
                  className="project-schedule-slot__delete"
                  disabled={busy}
                  onClick={() => void onDeleteSlot(s.id)}
                  aria-label={`Удалить слот ${s.intervalText}`}
                  title="Удалить слот"
                >
                  ×
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
                  disabled={busy}
                  onChange={(e) => setFrom(e.target.value)}
                  className={`mt-0.5 block ${inputField}`}
                />
              </label>
              <label className="text-xs font-semibold text-zinc-600">
                До
                <input
                  type="time"
                  value={to}
                  disabled={busy}
                  onChange={(e) => setTo(e.target.value)}
                  className={`mt-0.5 block ${inputField}`}
                />
              </label>
            </div>
            <input
              placeholder="Описание сценария"
              value={desc}
              disabled={busy}
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
