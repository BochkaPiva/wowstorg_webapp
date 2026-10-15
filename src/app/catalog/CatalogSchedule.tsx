"use client";

import React from "react";
import { CatalogDateField } from "./CatalogDateField";
import { CatalogDayPartSwitch } from "./CatalogDayPartSwitch";
import { useCatalogTimeline } from "./use-catalog-timeline";
import { TIMELINE_DAYS, LAST_TIMELINE_DAY, rentalDayWord, timelineDate, timelineDay, timelineControlLayout, type DateMarker, type ScheduleDates } from "./timeline-dates";
import { billableRentalDaysFromDateOnly } from "@/lib/rental-days";
import styles from "./schedule.module.css";

const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" });
const month = new Intl.DateTimeFormat("ru-RU", { month: "long", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" });
const labels: Record<DateMarker, string> = { readyByDate: "Подготовить к", startDate: "Начало аренды", endDate: "Окончание аренды" };

export function CatalogSchedule({ dates, minDate, showPreparation = true, rentalDays, onChange, onHelp }: {
  dates: ScheduleDates; minDate: string; showPreparation?: boolean; rentalDays: number;
  onChange: (patch: Partial<ScheduleDates>) => void; onHelp: () => void;
}) {
  const { attachViewport, windowStart, visibleDay, dayWidth, usableWidth, dates: preview, dragging, panning, begin, move, finish, onScroll, scrollByDays, jumpToDate, markerKey } = useCatalogTimeline(dates, minDate, onChange);
  const multiDay = preview.startDate !== preview.endDate;
  const days = React.useMemo(() => Array.from({ length: TIMELINE_DAYS }, (_, i) => {
    const date = timelineDate(windowStart + i), value = new Date(`${date}T12:00:00Z`);
    return { date, number: value.getUTCDate(), month: month.format(value), weekday: weekday.format(value), weekend: value.getUTCDay() === 0 || value.getUTCDay() === 6 };
  }), [windowStart]);
  const billed = dragging ? billableRentalDaysFromDateOnly(preview) : rentalDays;
  const count = `${billed} ${rentalDayWord(billed)} аренды`;
  const position = (marker: DateMarker) => timelineDay(preview[marker]) - windowStart
    + (marker === "readyByDate" ? .5 : marker === "startDate" ? .18 : .82);
  const left = position("startDate"), right = position("endDate");
  const markers: DateMarker[] = showPreparation ? ["readyByDate", "startDate", "endDate"] : ["startDate", "endDate"];
  const compactNavigation = usableWidth >= 740 && dayWidth > 88;
  const points = markers.map(marker => (timelineDay(preview[marker]) + .5 - visibleDay) * dayWidth);
  const controls = timelineControlLayout(points, Math.max(0, usableWidth - (compactNavigation ? 220 : 0)));
  const controlStyle = (marker: DateMarker) => ({ "--control-left": `${controls.positions[markers.indexOf(marker)]}px`, "--control-width": `${controls.width}px` } as React.CSSProperties);
  const rangeLeft = (left - visibleDay + windowStart) * dayWidth;
  const rangeRight = (right - visibleDay + windowStart) * dayWidth;
  const countWidth = Math.min(136, Math.max(104, usableWidth));
  const visibleLeft = Math.max(12, rangeLeft + 16), visibleRight = Math.min(usableWidth - 12, rangeRight - 16);
  const countInRange = visibleRight - visibleLeft >= countWidth;
  const countLeft = countInRange ? (visibleLeft + visibleRight - countWidth) / 2
    : rangeRight >= 0 && rangeRight + 4 + countWidth <= usableWidth - 4 ? rangeRight + 4
    : rangeLeft - countWidth - 4 >= 4 && rangeLeft <= usableWidth ? rangeLeft - countWidth - 4
    : Math.max(4, Math.min(Math.max(4, usableWidth - countWidth - 4), (rangeLeft + rangeRight - countWidth) / 2));
  const helpId = React.useId();
  function change(marker: DateMarker, date: string) { onChange({ [marker]: date }); jumpToDate(date); }
  return <section className={styles.schedule} aria-label="Период аренды и подготовка" data-dragging={Boolean(dragging)} data-compact-nav={compactNavigation}>
    <div className={styles.navigation}>
      <span>{monthYear.format(new Date(`${timelineDate(visibleDay)}T12:00:00Z`))}</span>
      <div>
        <button type="button" aria-label="Шкала: раньше на неделю" onClick={() => scrollByDays(-7)}><Chevron /></button>
        <button type="button" className={styles.returnButton} onClick={() => jumpToDate(dates.readyByDate)}>К датам</button>
        <button type="button" aria-label="Шкала: позже на неделю" onClick={() => scrollByDays(7)}><Chevron right /></button>
        <button type="button" onClick={onHelp} aria-label="Подробнее — как считаются даты аренды">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 16h.01" /></svg>
        </button>
      </div>
    </div>
    <div className={styles.dates} data-preparation={showPreparation}>
      {markers.map((marker, index) => <div key={marker} className={styles.date} data-ready={marker === "readyByDate"} data-offscreen={points[index] < 0 || points[index] > usableWidth} style={controlStyle(marker)}>
        {points[index] < 0 || points[index] > usableWidth ? <span className={styles.edgeDirection} role="img" aria-label={points[index] < 0 ? "Дата левее видимой шкалы" : "Дата правее видимой шкалы"}>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={points[index] < 0 ? "m7 2-4 4 4 4M3 6h8" : "m5 2 4 4-4 4M1 6h8"} /></svg>
        </span> : null}
        <CatalogDateField label={labels[marker]} presentation="inline" displayFormat="full" value={preview[marker]}
          min={marker === "endDate" ? preview.startDate : marker === "startDate" ? preview.readyByDate : minDate}
          max={marker === "readyByDate" ? preview.startDate : undefined} onChange={date => change(marker, date)} />
      </div>)}
      <svg className={styles.connectors} width="100%" height="18" aria-hidden="true">
        {markers.map((marker, index) => points[index] >= 0 && points[index] <= usableWidth ? <path key={marker} d={`M${controls.positions[index] + controls.width / 2} 0 V4 L${points[index]} 18`} fill="none" stroke="#ac91d1" strokeWidth="1" /> : null)}
      </svg>
    </div>
    <div className={styles.timelineStage}>
    <div ref={attachViewport} className={styles.viewport} data-panning={panning} role="region" tabIndex={0}
      aria-label="Временная шкала аренды" aria-describedby={helpId} onScroll={onScroll}
      onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); scrollByDays(event.key === "ArrowLeft" ? -1 : 1); } }}
      onPointerDown={event => begin(event)} onPointerMove={move}
      onPointerUp={() => finish(true)} onPointerCancel={() => finish(false)} onLostPointerCapture={() => finish(false)}>
      <div className={styles.canvas} style={{ width: `calc(var(--day-width) * ${TIMELINE_DAYS})` }}>
        <div className={styles.days} aria-hidden="true">{days.map(day => <div key={day.date} className={styles.day} data-weekend={day.weekend} data-date={day.date}>
          <strong>{day.number}</strong><span>{day.month}</span><small>{day.weekday}</small>
        </div>)}</div>
        <div className={styles.rentalBar} aria-hidden="true" style={{ left: `calc(var(--day-width) * ${left})`, width: `calc(var(--day-width) * ${right - left})` }} />
        {markers.map(marker => {
          const min = marker === "readyByDate" ? minDate : marker === "startDate" ? preview.readyByDate : preview.startDate;
          return <button key={marker} type="button" role="slider" className={styles.marker} data-marker={marker} data-active={dragging === marker}
            tabIndex={(position(marker) - visibleDay + windowStart) * dayWidth < 0 || (position(marker) - visibleDay + windowStart) * dayWidth > usableWidth ? -1 : 0}
            aria-label={`${labels[marker]}: переместить дату`} aria-orientation="horizontal"
            aria-valuemin={timelineDay(min)} aria-valuemax={marker === "readyByDate" ? timelineDay(preview.startDate) : LAST_TIMELINE_DAY}
            aria-valuenow={timelineDay(preview[marker])} aria-valuetext={preview[marker]} aria-describedby={helpId}
            style={{ left: `calc(var(--day-width) * ${position(marker)})` }}
            onPointerDown={event => begin(event, marker)} onPointerMove={move}
            onPointerUp={event => { event.stopPropagation(); finish(true); }} onPointerCancel={() => finish(false)}
            onLostPointerCapture={() => finish(false)} onKeyDown={event => markerKey(event, marker)}>
              {marker === "readyByDate" ? <span className={styles.preparationPin} /> : <svg width="14" height="18" viewBox="0 0 14 18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 4v10M9 4v10" /></svg>}
          </button>;
        })}
      </div>
    </div>
    <div className={styles.summary} data-in-range={countInRange} role="status" aria-live="polite" style={{ left: countLeft, width: countWidth }}>{count}</div>
    </div>
    <div className={styles.times}>
      <div style={controlStyle("startDate")}><span className={styles.timeLabel}>Начало аренды</span>{multiDay ? <CatalogDayPartSwitch label="Начало аренды: время" value={preview.rentalStartPartOfDay}
        onChange={rentalStartPartOfDay => onChange({ rentalStartPartOfDay })} /> : <span className={styles.fixedPart}>Утром</span>}</div>
      <div style={controlStyle("endDate")}><span className={styles.timeLabel}>Окончание аренды</span>{multiDay ? <CatalogDayPartSwitch label="Окончание аренды: время" value={preview.rentalEndPartOfDay}
        onChange={rentalEndPartOfDay => onChange({ rentalEndPartOfDay })} /> : <span className={styles.fixedPart}>Вечером</span>}</div>
    </div>
    <p id={helpId} className={styles.hint}>Листайте шкалу. Двигайте маркеры или задайте точную дату выше. При переносе: Escape — отмена.</p>
  </section>;
}

function Chevron({ right = false }: { right?: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={right ? "m9 5 7 7-7 7" : "m15 5-7 7 7 7"} /></svg>;
}
