"use client";

import React from "react";
import { createPortal } from "react-dom";

import type { RentalPartOfDay } from "@/lib/rental-days";

type DateDraft = {
  readyByDate: string;
  startDate: string;
  endDate: string;
  rentalStartPartOfDay: RentalPartOfDay;
  rentalEndPartOfDay: RentalPartOfDay;
};

type Conflict = {
  itemId: string;
  name: string;
  photo1Key: string | null;
  requestedQty: number;
  availableQty: number;
  shortageQty: number;
};

type Props = {
  open: boolean;
  orderId: string;
  initialValue: DateDraft;
  onClose: () => void;
  onApplied: () => Promise<void> | void;
};

type Phase = "editing" | "checking" | "available" | "conflicts" | "applying";

function dateRu(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function PartChoice({
  value,
  onChange,
  label,
}: {
  value: RentalPartOfDay;
  onChange: (value: RentalPartOfDay) => void;
  label: string;
}) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className="grid grid-cols-2 border border-zinc-300 bg-zinc-100 p-1">
        {(["MORNING", "EVENING"] as const).map((part) => (
          <button
            key={part}
            type="button"
            onClick={() => onChange(part)}
            className={[
              "min-h-10 px-3 text-sm font-bold transition-colors duration-150",
              value === part ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-white hover:text-zinc-950",
            ].join(" ")}
          >
            {part === "MORNING" ? "Утро" : "Вечер"}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProgressCheck() {
  return (
    <div className="border border-violet-200 bg-violet-50 px-4 py-4" role="status">
      <div className="flex items-center gap-3">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center" aria-hidden="true">
          <span className="absolute inset-0 animate-ping rounded-full bg-violet-300/60 motion-reduce:animate-none" />
          <span className="relative h-3 w-3 rounded-full bg-violet-700" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-violet-950">Сверяем остатки и пересечения</div>
          <div className="mt-1 text-sm text-violet-700">Проверяем каждую позицию на выбранный период.</div>
        </div>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden bg-violet-100">
        <div className="h-full w-2/3 animate-pulse bg-violet-700 motion-reduce:animate-none" />
      </div>
    </div>
  );
}

export function OrderDateChangeDialog({ open, orderId, initialValue, onClose, onApplied }: Props) {
  const [draft, setDraft] = React.useState<DateDraft>(initialValue);
  const [phase, setPhase] = React.useState<Phase>("editing");
  const [conflicts, setConflicts] = React.useState<Conflict[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setDraft(initialValue);
    setPhase("editing");
    setConflicts([]);
    setError(null);
  }, [initialValue, open]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && phase !== "applying") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open, phase]);

  function update<K extends keyof DateDraft>(key: K, value: DateDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setPhase("editing");
    setConflicts([]);
    setError(null);
  }

  async function request(method: "POST" | "PATCH", conflictResolution?: "REJECT" | "REMOVE_UNAVAILABLE") {
    setError(null);
    const response = await fetch(`/api/orders/${orderId}/dates`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, ...(conflictResolution ? { conflictResolution } : {}) }),
    });
    const payload = (await response.json().catch(() => null)) as
      | {
          available?: boolean;
          conflicts?: Conflict[];
          error?: { message?: string; details?: { conflicts?: Conflict[] } };
        }
      | null;
    if (!response.ok) {
      const nextConflicts = payload?.error?.details?.conflicts ?? [];
      if (nextConflicts.length) {
        setConflicts(nextConflicts);
        setPhase("conflicts");
      } else {
        setPhase("editing");
      }
      throw new Error(payload?.error?.message ?? "Не удалось выполнить проверку");
    }
    return payload;
  }

  async function check() {
    setPhase("checking");
    try {
      const payload = await request("POST");
      const next = payload?.conflicts ?? [];
      setConflicts(next);
      setPhase(next.length ? "conflicts" : "available");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось выполнить проверку");
    }
  }

  async function apply(conflictResolution: "REJECT" | "REMOVE_UNAVAILABLE") {
    setPhase("applying");
    try {
      await request("PATCH", conflictResolution);
      await onApplied();
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось изменить даты");
    }
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-zinc-950/55 p-3 backdrop-blur-[2px] sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && phase !== "applying") onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-date-dialog-title"
        className="max-h-[92vh] w-full max-w-5xl overflow-hidden border border-zinc-300 bg-[#f7f6f2] shadow-[0_36px_120px_rgba(0,0,0,0.32)]"
      >
        <header className="grid gap-5 border-b border-zinc-300 bg-white px-5 py-5 sm:grid-cols-[1fr_auto] sm:px-8 sm:py-7">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-700">Проверка склада в реальном времени</div>
            <h2 id="order-date-dialog-title" className="mt-2 text-3xl font-black tracking-[-0.045em] text-zinc-950 sm:text-5xl">
              Изменить даты заявки
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
              Сначала проверим весь состав. Ничего не изменится, пока вы не подтвердите результат.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={phase === "applying"}
            className="flex h-11 w-11 items-center justify-center border border-zinc-300 bg-white text-2xl text-zinc-700 transition-colors hover:bg-zinc-950 hover:text-white disabled:opacity-50"
            aria-label="Закрыть"
          >
            ×
          </button>
        </header>

        <div className="max-h-[calc(92vh-190px)] overflow-y-auto">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_330px]">
            <div className="space-y-6 p-5 sm:p-8">
              <div className="grid gap-4 border border-zinc-300 bg-white p-4 sm:grid-cols-3 sm:p-5">
                {([
                  ["readyByDate", "Готовность"],
                  ["startDate", "Начало аренды"],
                  ["endDate", "Окончание аренды"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500">{label}</span>
                    <input
                      type="date"
                      value={draft[key]}
                      onChange={(event) => update(key, event.target.value)}
                      className="h-12 w-full border border-zinc-300 bg-white px-3 text-base font-bold text-zinc-950 outline-none transition-colors focus:border-violet-700 focus:ring-2 focus:ring-violet-100"
                    />
                  </label>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <PartChoice
                  label="Начать"
                  value={draft.rentalStartPartOfDay}
                  onChange={(value) => update("rentalStartPartOfDay", value)}
                />
                <PartChoice
                  label="Завершить"
                  value={draft.rentalEndPartOfDay}
                  onChange={(value) => update("rentalEndPartOfDay", value)}
                />
              </div>

              {phase === "checking" || phase === "applying" ? <ProgressCheck /> : null}

              {phase === "available" ? (
                <div className="border border-emerald-300 bg-emerald-50 p-5 text-emerald-950">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-lg font-black text-white">✓</span>
                    <div>
                      <div className="text-lg font-black">Весь реквизит свободен</div>
                      <div className="mt-1 text-sm text-emerald-800">Можно безопасно перенести заявку на выбранные даты.</div>
                    </div>
                  </div>
                </div>
              ) : null}

              {phase === "conflicts" ? (
                <div className="border border-rose-300 bg-white">
                  <div className="border-b border-rose-200 bg-rose-50 px-5 py-4">
                    <div className="font-black text-rose-950">Часть состава недоступна</div>
                    <p className="mt-1 text-sm text-rose-800">Можно изменить период или удалить только эти позиции при переносе.</p>
                  </div>
                  <div className="divide-y divide-zinc-200">
                    {conflicts.map((conflict) => (
                      <div key={conflict.itemId} className="grid grid-cols-[52px_minmax(0,1fr)] gap-3 px-4 py-4 sm:grid-cols-[52px_minmax(0,1fr)_auto] sm:items-center">
                        {conflict.photo1Key ? (
                          <img
                            src={`/api/inventory/positions/${conflict.itemId}/photo?w=120`}
                            alt=""
                            className="h-[52px] w-[52px] bg-zinc-100 object-cover"
                          />
                        ) : (
                          <div className="flex h-[52px] w-[52px] items-center justify-center bg-violet-50 text-xs font-black text-violet-700">WOW</div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate font-bold text-zinc-950">{conflict.name}</div>
                          <div className="mt-1 text-sm text-zinc-600">Нужно {conflict.requestedQty}, свободно {conflict.availableQty}</div>
                        </div>
                        <div className="col-start-2 text-sm font-black text-rose-700 sm:col-start-auto">Не хватает {conflict.shortageQty}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {error ? <div className="border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">{error}</div> : null}
            </div>

            <aside className="border-t border-zinc-300 bg-zinc-950 p-5 text-white lg:border-l lg:border-t-0 sm:p-7">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-yellow-300">Новый период</div>
              <dl className="mt-5 space-y-5">
                <div>
                  <dt className="text-xs text-zinc-400">Готовность</dt>
                  <dd className="mt-1 text-xl font-black">{dateRu(draft.readyByDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-400">Аренда</dt>
                  <dd className="mt-1 text-lg font-bold leading-7">
                    {dateRu(draft.startDate)} · {draft.rentalStartPartOfDay === "MORNING" ? "утро" : "вечер"}
                    <br />
                    {dateRu(draft.endDate)} · {draft.rentalEndPartOfDay === "MORNING" ? "утро" : "вечер"}
                  </dd>
                </div>
              </dl>
              <div className="mt-8 space-y-3">
                {phase === "available" ? (
                  <button
                    type="button"
                    onClick={() => void apply("REJECT")}
                    className="min-h-12 w-full bg-yellow-400 px-4 font-black text-zinc-950 transition-colors hover:bg-yellow-300"
                  >
                    Применить новые даты
                  </button>
                ) : phase === "conflicts" ? (
                  <button
                    type="button"
                    onClick={() => void apply("REMOVE_UNAVAILABLE")}
                    className="min-h-12 w-full bg-yellow-400 px-4 font-black text-zinc-950 transition-colors hover:bg-yellow-300"
                  >
                    Перенести и удалить недоступное
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={phase === "checking" || phase === "applying"}
                    onClick={() => void check()}
                    className="min-h-12 w-full bg-yellow-400 px-4 font-black text-zinc-950 transition-colors hover:bg-yellow-300 disabled:cursor-wait disabled:bg-zinc-700 disabled:text-zinc-400"
                  >
                    {phase === "checking" ? "Проверяем…" : phase === "applying" ? "Сохраняем…" : "Проверить доступность"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  disabled={phase === "applying"}
                  className="min-h-11 w-full border border-zinc-700 px-4 text-sm font-bold text-zinc-300 transition-colors hover:border-white hover:text-white disabled:opacity-50"
                >
                  Оставить даты как есть
                </button>
              </div>
              <p className="mt-6 text-xs leading-5 text-zinc-500">Проверка учитывает ремонт, поломки, утерянные единицы и пересекающиеся активные заявки.</p>
            </aside>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
