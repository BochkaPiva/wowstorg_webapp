"use client";

import type { RentalPartOfDay } from "@/lib/rental-days";

/** Переключатель «утро / вечер» (checkbox + slider + иконки). */
export function RentalPartOfDayToggle({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: RentalPartOfDay;
  onChange: (next: RentalPartOfDay) => void;
  disabled?: boolean;
}) {
  const evening = value === "EVENING";
  return (
    <div className="mk-partDay">
      <span className="mk-partDay-caption" id={`${id}-caption`}>
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
          aria-labelledby={`${id}-caption`}
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
