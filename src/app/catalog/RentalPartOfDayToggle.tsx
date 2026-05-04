"use client";

import type { RentalPartOfDay } from "@/lib/rental-days";

/** Переключатель «утро / вечер» (checkbox + slider + иконки). */
export function RentalPartOfDayToggle({
  id,
  value,
  onChange,
  disabled,
  compact,
  edge,
}: {
  id: string;
  value: RentalPartOfDay;
  onChange: (next: RentalPartOfDay) => void;
  disabled?: boolean;
  /** Компактный режим: без подписи сбоку, узкая дорожка — для строки с полем даты. */
  compact?: boolean;
  /** Для доступности компактного режима: край периода. */
  edge?: "start" | "end";
}) {
  const evening = value === "EVENING";
  const compactAria =
    compact && edge
      ? edge === "start"
        ? "Начало периода: утро или вечер"
        : "Окончание периода: утро или вечер"
      : undefined;
  return (
    <div className={["mk-partDay", compact ? "mk-partDay--compact" : ""].filter(Boolean).join(" ")}>
      <span
        className={["mk-partDay-caption", compact ? "mk-partDay-caption--visuallyHidden" : ""]
          .filter(Boolean)
          .join(" ")}
        id={`${id}-caption`}
      >
        {evening ? "Вечер" : "Утро"}
      </span>
      <label className="mk-partDay-switch">
        <input
          type="checkbox"
          id={id}
          name={id}
          checked={evening}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? "EVENING" : "MORNING")}
          aria-labelledby={compact ? undefined : `${id}-caption`}
          aria-label={compactAria}
        />
        <span className="mk-partDay-slider" aria-hidden />
        <span className="mk-partDay-icon mk-partDay-sun" aria-hidden title="Утро">
          ☀
        </span>
        <span className="mk-partDay-icon mk-partDay-moon" aria-hidden title="Вечер">
          ☾
        </span>
      </label>
    </div>
  );
}
