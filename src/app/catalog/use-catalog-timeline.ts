"use client";

import React from "react";
import { LAST_TIMELINE_DAY, TIMELINE_DAYS, moveDateMarker, timelineAnchor, timelineDay, type DateMarker, type ScheduleDates } from "./timeline-dates";

type Gesture = {
  pointer: number; target: HTMLElement; base: ScheduleDates; source: string;
  marker?: DateMarker; startX: number; x: number; offset: number; anchor: number; armed: boolean;
};
const fingerprint = (dates: ScheduleDates) => JSON.stringify(dates);

/** Bounded calendar window; scrolling is view-only, a date commits once on release. */
export function useCatalogTimeline(dates: ScheduleDates, minDate: string, onChange: (dates: Partial<ScheduleDates>) => void) {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const attachViewport = React.useCallback((node: HTMLDivElement | null) => { viewportRef.current = node; }, []);
  const [windowStart, setWindowStart] = React.useState(() => timelineAnchor(dates, minDate));
  const [draft, setDraft] = React.useState<{ source: string; dates: ScheduleDates; marker: DateMarker } | null>(null);
  const [panning, setPanning] = React.useState(false);
  const [viewportMeasure, setViewportMeasure] = React.useState({ days: 7, cell: 112, usable: 784 });
  const [visibleDay, setVisibleDay] = React.useState(() => Math.max(timelineDay(minDate), timelineDay(dates.readyByDate) - 1));
  const gesture = React.useRef<Gesture | null>(null);
  const frame = React.useRef(0);
  const pendingScroll = React.useRef<number | null>(null);
  const latest = React.useRef({ dates, minDate, onChange, windowStart });
  const key = fingerprint(dates);
  const [observed, setObserved] = React.useState(key);
  const earliest = timelineDay(dates.readyByDate);
  const anchor = timelineAnchor(dates, minDate);
  // External project prefills and precision-calendar jumps may be years away.
  if (observed !== key) {
    setObserved(key);
    if ((earliest < windowStart || earliest >= windowStart + TIMELINE_DAYS) && windowStart !== anchor && !draft) setWindowStart(anchor);
  }
  React.useLayoutEffect(() => { latest.current = { dates, minDate, onChange, windowStart }; });
  const width = () => Number.parseFloat(getComputedStyle(viewportRef.current!).getPropertyValue("--day-width")) || 112;

  React.useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      const cell = width(), clearance = Number.parseFloat(getComputedStyle(el).getPropertyValue("--scene-clearance")) || 0;
      const usable = Math.max(0, el.clientWidth - clearance);
      setViewportMeasure({ days: usable / cell, cell, usable });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  React.useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollLeft = pendingScroll.current ?? Math.max(0, (timelineDay(latest.current.dates.readyByDate) - windowStart - 1) * width());
    pendingScroll.current = null;
  }, [windowStart]);

  const finish = React.useCallback((commit: boolean) => {
    const current = gesture.current;
    gesture.current = null;
    cancelAnimationFrame(frame.current); frame.current = 0;
    setPanning(false);
    setDraft(null);
    if (!current) return;
    if (current.target.hasPointerCapture?.(current.pointer)) current.target.releasePointerCapture(current.pointer);
    if (!commit || !current.marker || !current.armed || current.source !== fingerprint(latest.current.dates)) return;
    const el = viewportRef.current;
    if (!el) return;
    const absoluteDay = latest.current.windowStart + (current.x - el.getBoundingClientRect().left + el.scrollLeft) / width();
    const next = moveDateMarker(current.base, current.marker, absoluteDay - current.offset, latest.current.minDate);
    if (fingerprint(next) !== current.source) latest.current.onChange(next);
  }, []);

  React.useEffect(() => {
    const cancel = () => finish(false);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && gesture.current) { event.preventDefault(); finish(false); } };
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("blur", cancel); window.removeEventListener("keydown", escape);
      cancelAnimationFrame(frame.current);
      const current = gesture.current; gesture.current = null;
      if (current?.target.hasPointerCapture?.(current.pointer)) current.target.releasePointerCapture(current.pointer);
    };
  }, [finish]);

  function preview() {
    const current = gesture.current, el = viewportRef.current;
    if (!current?.marker || !el || !current.armed) return;
    const absoluteDay = latest.current.windowStart + (current.x - el.getBoundingClientRect().left + el.scrollLeft) / width();
    const next = moveDateMarker(current.base, current.marker, absoluteDay - current.offset, latest.current.minDate);
    setDraft(previous => previous && fingerprint(previous.dates) === fingerprint(next) ? previous : { source: current.source, dates: next, marker: current.marker! });
  }
  function autoScroll() {
    const current = gesture.current, el = viewportRef.current;
    if (!current?.marker || !current.armed || !el) { frame.current = 0; return; }
    const rect = el.getBoundingClientRect();
    const rightEdge = rect.right - (Number.parseFloat(getComputedStyle(el).getPropertyValue("--scene-clearance")) || 0);
    const edge = 36;
    const speed = current.x < rect.left + edge ? -Math.min(12, (rect.left + edge - current.x) / 3)
      : current.x > rightEdge - edge ? Math.min(12, (current.x - rightEdge + edge) / 3) : 0;
    if (speed) { el.scrollLeft += speed; preview(); }
    frame.current = requestAnimationFrame(autoScroll);
  }

  function begin(event: React.PointerEvent<HTMLElement>, marker?: DateMarker) {
    if (event.button !== 0 || gesture.current) return;
    if (!marker && (event.pointerType !== "mouse" || (event.target as HTMLElement).closest("button,input,a"))) return;
    const el = viewportRef.current;
    if (!el) return;
    const clearance = Number.parseFloat(getComputedStyle(el).getPropertyValue("--scene-clearance")) || 0;
    if (marker && clearance > 0 && event.clientX > el.getBoundingClientRect().right - clearance) return;
    if (marker) { event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true }); }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const absoluteDay = windowStart + (event.clientX - el.getBoundingClientRect().left + el.scrollLeft) / width();
    gesture.current = { pointer: event.pointerId, target: event.currentTarget, base: dates, source: key,
      marker, startX: event.clientX, x: event.clientX, armed: false,
      offset: marker ? absoluteDay - timelineDay(dates[marker]) : 0, anchor: windowStart + el.scrollLeft / width() };
  }
  function move(event: React.PointerEvent<HTMLElement>) {
    const current = gesture.current, el = viewportRef.current;
    if (!current || current.pointer !== event.pointerId || !el) return;
    current.x = event.clientX;
    if (!current.armed && Math.abs(current.x - current.startX) < 6) return;
    current.armed = true;
    if (current.marker) { event.stopPropagation(); preview(); if (!frame.current) frame.current = requestAnimationFrame(autoScroll); }
    else { setPanning(true); el.scrollLeft = (current.anchor - latest.current.windowStart) * width() - (current.x - current.startX); }
  }
  function onScroll() {
    const el = viewportRef.current;
    if (!el || pendingScroll.current !== null) return;
    const cell = width(), min = timelineDay(minDate);
    const visible = windowStart + el.scrollLeft / cell;
    setVisibleDay(previous => previous === visible ? previous : visible);
    const step = el.scrollLeft < cell * 2 && windowStart > min ? -Math.min(30, windowStart - min)
      : el.scrollLeft > el.scrollWidth - el.clientWidth - cell * 2 && windowStart < LAST_TIMELINE_DAY - TIMELINE_DAYS ? Math.min(30, LAST_TIMELINE_DAY - TIMELINE_DAYS + 1 - windowStart) : 0;
    if (!step) return;
    pendingScroll.current = el.scrollLeft - step * cell;
    setWindowStart(windowStart + step);
  }
  function scrollByDays(days: number) { const el = viewportRef.current; if (el) { el.scrollLeft += days * width(); onScroll(); } }
  function jumpToDate(date: string) {
    const el = viewportRef.current, day = timelineDay(date);
    const next = Math.min(LAST_TIMELINE_DAY - TIMELINE_DAYS + 1, Math.max(timelineDay(minDate), day - 2));
    pendingScroll.current = (day - next - 1) * width();
    if (next === windowStart && el) { el.scrollLeft = Math.max(0, pendingScroll.current); pendingScroll.current = null; }
    else setWindowStart(next);
  }
  function markerKey(event: React.KeyboardEvent, marker: DateMarker) {
    const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "PageUp" ? -7 : event.key === "PageDown" ? 7 : 0;
    if (!delta && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const min = marker === "readyByDate" ? minDate : marker === "startDate" ? dates.readyByDate : dates.startDate;
    const next = moveDateMarker(dates, marker, event.key === "Home" ? timelineDay(min)
      : event.key === "End" ? timelineDay(marker === "readyByDate" ? dates.startDate : dates.endDate)
      : timelineDay(dates[marker]) + delta * (event.shiftKey ? 7 : 1), minDate);
    onChange(next); jumpToDate(next[marker]);
  }
  return { attachViewport, windowStart, visibleDay, viewportDays: viewportMeasure.days, dayWidth: viewportMeasure.cell, usableWidth: viewportMeasure.usable, dates: draft?.source === key ? draft.dates : dates,
    dragging: draft?.source === key ? draft.marker : null, panning, begin, move, finish, onScroll, scrollByDays, jumpToDate, markerKey };
}
