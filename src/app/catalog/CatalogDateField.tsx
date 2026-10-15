"use client";

import React from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import { ru } from "date-fns/locale";
import { format, parseISO } from "date-fns";
import "react-day-picker/style.css";

import { formatDateRu, parseRuToDateOnly } from "@/lib/catalogDates";

function measurePopoverLeft(wrapRect: DOMRect) {
  const popoverW = 320;
  let left = wrapRect.left;
  if (left + popoverW > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - popoverW - 8);
  }
  return left;
}

function measurePopoverTop(wrapRect: DOMRect, height: number) {
  const available = window.innerHeight - 16;
  const boundedHeight = Math.min(height, available);
  return wrapRect.bottom + 8 + boundedHeight <= window.innerHeight - 8
    ? wrapRect.bottom + 8
    : Math.max(8, wrapRect.top - boundedHeight - 8);
}

export function CatalogDateField({
  label,
  value,
  onChange,
  hint,
  min,
  max,
  endAccessory,
  inputCaption,
  presentation = "default",
  displayFormat = "short",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  hint?: string;
  min?: string;
  max?: string;
  /** Компактный контрол справа от поля даты (например тумблер «утро/вечер»). */
  endAccessory?: React.ReactNode;
  /** Short in-control caption used by dense catalog date controls. */
  inputCaption?: string;
  presentation?: "default" | "inline";
  displayFormat?: "short" | "long" | "full";
}) {
  const safeMin = min;
  const safeMax =
    min && max && max.localeCompare(min) < 0 ? undefined : max;

  const hintRef = React.useRef<HTMLSpanElement | null>(null);
  const wrapRef = React.useRef<HTMLSpanElement | null>(null);
  const calBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const popoverRef = React.useRef<HTMLDivElement | null>(null);

  const [text, setText] = React.useState(() => formatDateRu(value));
  const [textSource, setTextSource] = React.useState(value);
  const [showHint, setShowHint] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [coords, setCoords] = React.useState<{ top: number; left: number } | null>(null);

  const selectedDate = React.useMemo(() => {
    const d = parseISO(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }, [value]);

  const defaultMonth = React.useMemo(() => {
    if (selectedDate) return selectedDate;
    if (safeMin) {
      const d = parseISO(safeMin);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return new Date();
  }, [selectedDate, safeMin]);

  // Preserve incomplete typing unless the authoritative date actually changes.
  if (textSource !== value) {
    setTextSource(value);
    setText(formatDateRu(value));
  }

  const updatePosition = React.useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoords({
      top: measurePopoverTop(r, popoverRef.current?.getBoundingClientRect().height || 360),
      left: measurePopoverLeft(r),
    });
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, updatePosition]);

  React.useEffect(() => {
    if (!open) return;
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && popoverRef.current?.contains(event.target)) return;
      // Timeline inertia and unrelated inner scrollers do not move this anchor.
      if (event.target instanceof Element && !event.target.contains(wrapRef.current)) return;
      const rect = wrapRef.current?.getBoundingClientRect();
      if (rect && rect.bottom > 0 && rect.top < window.innerHeight) {
        updatePosition();
        return;
      }
      setOpen(false);
      setCoords(null);
    };
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open, updatePosition]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setCoords(null);
        calBtnRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  React.useEffect(() => {
    if (!hint || !showHint) return;
    function handleClickOutside(e: MouseEvent) {
      if (hintRef.current && !hintRef.current.contains(e.target as Node)) {
        setShowHint(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [hint, showHint]);

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (calBtnRef.current?.contains(t)) return;
      const el = e.target as HTMLElement;
      if (wrapRef.current?.contains(t) && el.closest?.("input.mk-dateText")) return;
      setOpen(false);
      setCoords(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const toggleCalendar = () => {
    if (open) {
      setOpen(false);
      setCoords(null);
      return;
    }
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      setCoords({
        top: measurePopoverTop(r, 360),
        left: measurePopoverLeft(r),
      });
    }
    setOpen(true);
  };

  const popover =
    open && typeof document !== "undefined" && coords
      ? createPortal(
          <div
            ref={popoverRef}
            className="mk-dayPicker-popover"
            role="dialog"
            aria-label={`Календарь: ${label}`}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              zIndex: 10001,
              maxHeight: "calc(100dvh - 16px)",
              overflowY: "auto",
            }}
          >
            <DayPicker
              mode="single"
              selected={selectedDate}
              onSelect={(d) => {
                if (!d) return;
                let ymd = format(d, "yyyy-MM-dd");
                if (safeMin && ymd < safeMin) ymd = safeMin;
                if (safeMax && ymd > safeMax) ymd = safeMax;
                onChange(ymd);
                setText(formatDateRu(ymd));
                setOpen(false);
                setCoords(null);
                calBtnRef.current?.focus();
              }}
              locale={ru}
              defaultMonth={defaultMonth}
              disabled={(date) => {
                const ymd = format(date, "yyyy-MM-dd");
                if (safeMin && ymd < safeMin) return true;
                if (safeMax && ymd > safeMax) return true;
                return false;
              }}
            />
          </div>,
          document.body,
        )
      : null;

  const inputTitle =
    safeMin && safeMax
      ? `Допустимый диапазон: ${formatDateRu(safeMin)} — ${formatDateRu(safeMax)}`
      : safeMin
        ? `Не раньше ${formatDateRu(safeMin)}`
        : safeMax
          ? `Не позже ${formatDateRu(safeMax)}`
          : undefined;

  const dateWrap = (
    <span className="mk-dateWrap" ref={wrapRef}>
      <span className="mk-dateTextCell">
        {inputCaption ? <span className="mk-dateTextCaption">{inputCaption}</span> : null}
        {presentation === "inline" && selectedDate ? <span className="mk-dateDisplay" aria-hidden="true">
          {format(selectedDate, displayFormat === "full" ? "d MMMM yyyy" : displayFormat === "long" ? "d MMMM" : "d MMM, EEEEEE", { locale: ru })}
        </span> : null}
        <input
          className="mk-dateText"
          value={text}
          onFocus={() => setEditing(true)}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            setEditing(false);
            const parsed = parseRuToDateOnly(text);
            if (parsed) {
              let d = parsed;
              if (safeMin && d < safeMin) d = safeMin;
              if (safeMax && d > safeMax) d = safeMax;
              onChange(d);
              setText(formatDateRu(d));
            } else {
              setText(formatDateRu(value));
            }
          }}
          inputMode="numeric"
          placeholder="ДД.ММ.ГГГГ"
          aria-label={label}
          title={inputTitle}
        />
      </span>
      <button
        type="button"
        className="mk-datePickBtn"
        ref={calBtnRef}
        aria-label={`Открыть календарь: ${label}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggleCalendar}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {presentation === "inline" ? <path d="m6 9 6 6 6-6" /> : <>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </>}
        </svg>
      </button>
    </span>
  );

  const hasAccessory = Boolean(endAccessory);

  return (
    <div className={["mk-dateField", hasAccessory ? "mk-dateField--hasAccessory" : ""].filter(Boolean).join(" ")}
      data-inline={presentation === "inline" && Boolean(selectedDate)} data-editing={editing}>
      <span className="mk-dateFieldLabel">
        {label}
        {hint ? (
          <span
            ref={hintRef}
            className="mk-dateHint"
            role="button"
            tabIndex={0}
            onClick={() => setShowHint((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setShowHint((v) => !v);
              }
            }}
            aria-label={hint}
            aria-expanded={showHint}
          >
            ?
            {showHint ? (
              <span className="mk-dateTooltip" role="tooltip">
                {hint}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
      {hasAccessory ? (
        <div className="mk-dateInputRow">
          {dateWrap}
          <span className="mk-dateEndAccessory">{endAccessory}</span>
        </div>
      ) : (
        dateWrap
      )}
      {popover}
    </div>
  );
}
