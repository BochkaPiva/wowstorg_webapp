"use client";

import type { RentalPartOfDay } from "@/lib/rental-days";
import styles from "./schedule.module.css";

/** Both choices stay visible; a single click commits without opening another surface. */
export function CatalogDayPartSwitch({ label, value, onChange }: {
  label: string; value: RentalPartOfDay; onChange: (part: RentalPartOfDay) => void;
}) {
  return <div className={styles.partSwitch} role="group" aria-label={label} data-evening={value === "EVENING"}>
    {(["MORNING", "EVENING"] as const).map(part => <button key={part} type="button" aria-pressed={part === value}
      onClick={() => onChange(part)} onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "ArrowLeft" || event.key === "Home" ? "MORNING" : "EVENING";
        onChange(next);
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next === "MORNING" ? 0 : 1]?.focus();
      }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">{part === "MORNING" ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" /></> : <path d="M20.5 13.5A8.5 8.5 0 0 1 10.5 3.5a8.5 8.5 0 1 0 10 10Z" />}</svg>{part === "MORNING" ? "Утром" : "Вечером"}</button>)}
  </div>;
}
