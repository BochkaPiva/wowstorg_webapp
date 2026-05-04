"use client";

import React from "react";
import { createPortal } from "react-dom";
import { DayPicker, type DateRange } from "react-day-picker";
import { format, parse } from "date-fns";
import { ru } from "date-fns/locale";

import "react-day-picker/style.css";

import { formatDateRu } from "@/lib/catalogDates";
import type { RentalPartOfDay } from "@/lib/rental-days";

import { RentalPartOfDayToggle } from "@/app/catalog/RentalPartOfDayToggle";

function measurePopoverLeft(wrapRect: DOMRect) {
  const edge = 12;
  const maxByViewport = typeof window !== "undefined" ? window.innerWidth - edge * 2 : 720;
  /** Ширина на два месяца в один ряд; на узком экране — ширина вьюпорта, скролл горизонтальный */
  const popoverW = Math.min(760, Math.max(280, maxByViewport));
  let left = wrapRect.left + wrapRect.width / 2 - popoverW / 2;
  if (left + popoverW > window.innerWidth - edge) {
    left = Math.max(edge, window.innerWidth - popoverW - edge);
  }
  left = Math.max(edge, left);
  return { left, width: popoverW };
}

function ymdLocalToDate(ymd: string): Date {
  const d = parse(ymd, "yyyy-MM-dd", new Date());
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function dateToYmdLocal(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function CatalogRentalPeriodPicker({
  startDate,
  endDate,
  minDate,
  rentalStartPartOfDay,
  rentalEndPartOfDay,
  onRangeChange,
  onStartPartChange,
  onEndPartChange,
}: {
  startDate: string;
  endDate: string;
  minDate: string;
  rentalStartPartOfDay: RentalPartOfDay;
  rentalEndPartOfDay: RentalPartOfDay;
  onRangeChange: (startYmd: string, endYmd: string) => void;
  onStartPartChange: (v: RentalPartOfDay) => void;
  onEndPartChange: (v: RentalPartOfDay) => void;
}) {
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const popRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [coords, setCoords] = React.useState<{ top: number; left: number; width: number } | null>(null);
  const [draftRange, setDraftRange] = React.useState<DateRange>(() => ({
    from: ymdLocalToDate(startDate),
    to: ymdLocalToDate(endDate),
  }));

  const multiDay = startDate !== endDate;

  const updatePosition = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const { left, width } = measurePopoverLeft(r);
    setCoords({
      top: r.bottom + 10,
      left,
      width,
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
    setDraftRange({
      from: ymdLocalToDate(startDate),
      to: ymdLocalToDate(endDate),
    });
  }, [open, startDate, endDate]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setCoords(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onScroll() {
      setOpen(false);
      setCoords(null);
    }
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
      setCoords(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const minD = ymdLocalToDate(minDate);

  function commitRange(from: Date, to: Date) {
    let a = dateToYmdLocal(from);
    let b = dateToYmdLocal(to);
    if (a > b) [a, b] = [b, a];
    onRangeChange(a, b);
  }

  const popover =
    open && typeof document !== "undefined" && coords
      ? createPortal(
          <div
            ref={popRef}
            className="mk-rangePicker-popover"
            role="dialog"
            aria-label="Выбор периода аренды"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              width: coords.width,
              zIndex: 10001,
            }}
          >
            <div className="mk-rangePicker-popoverInner">
              <div className="mk-rangePicker-scroll">
                <DayPicker
                  mode="range"
                  required={false}
                  numberOfMonths={2}
                  locale={ru}
                  pagedNavigation
                  selected={draftRange}
                  onSelect={(r) => {
                    setDraftRange(r ?? { from: undefined, to: undefined });
                    if (r?.from && r?.to) {
                      commitRange(r.from, r.to);
                    }
                  }}
                  defaultMonth={draftRange.from ?? draftRange.to ?? minD}
                  disabled={(date) => dateToYmdLocal(date) < minDate}
                />
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="mk-rentalPeriod">
      <span className="mk-dateFieldLabel">Период аренды</span>
      <div className="mk-rentalPeriodRow">
        <div className="mk-rentalPeriod-edge">
          {multiDay ? (
            <RentalPartOfDayToggle
              compact
              edge="start"
              id="catalog-rental-start"
              value={rentalStartPartOfDay}
              onChange={onStartPartChange}
            />
          ) : (
            <span className="mk-partDay-spacer" aria-hidden />
          )}
        </div>

        <div
          ref={triggerRef}
          role="group"
          tabIndex={0}
          className="mk-rentalPeriod-trigger"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="Период аренды — открыть календарь"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (open) {
                setOpen(false);
                setCoords(null);
              } else if (triggerRef.current) {
                const r = triggerRef.current.getBoundingClientRect();
                const { left, width } = measurePopoverLeft(r);
                setCoords({ top: r.bottom + 10, left, width });
                setOpen(true);
              }
            }
          }}
          onClick={() => {
            if (open) {
              setOpen(false);
              setCoords(null);
              return;
            }
            if (triggerRef.current) {
              const r = triggerRef.current.getBoundingClientRect();
              const { left, width } = measurePopoverLeft(r);
              setCoords({ top: r.bottom + 10, left, width });
            }
            setOpen(true);
          }}
        >
          <span className="mk-rentalPeriod-seg mk-rentalPeriod-segStart">
            <span className="mk-rentalPeriod-segHint">Начало</span>
            <span className="mk-rentalPeriod-segDate">{formatDateRu(startDate)}</span>
          </span>
          <span className="mk-rentalPeriod-triggerSep" aria-hidden />
          <span className="mk-rentalPeriod-seg mk-rentalPeriod-segEnd">
            <span className="mk-rentalPeriod-segHint">Окончание</span>
            <span className="mk-rentalPeriod-segDateRow">
              <span className="mk-rentalPeriod-segDate">{formatDateRu(endDate)}</span>
              {multiDay ? (
                <button
                  type="button"
                  className="mk-rentalPeriod-clearEnd"
                  aria-label="Оставить аренду на один день — убрать дату окончания"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    commitRange(ymdLocalToDate(startDate), ymdLocalToDate(startDate));
                    setDraftRange({
                      from: ymdLocalToDate(startDate),
                      to: ymdLocalToDate(startDate),
                    });
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                    <path d="M18 6L6 18M6 6l12 12" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              ) : null}
            </span>
          </span>
          <span className="mk-rentalPeriod-calIcon" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </span>
        </div>

        <div className="mk-rentalPeriod-edge">
          {multiDay ? (
            <RentalPartOfDayToggle compact edge="end" id="catalog-rental-end" value={rentalEndPartOfDay} onChange={onEndPartChange} />
          ) : (
            <span
              className="mk-partDay-chip"
              style={{ cursor: "default" }}
            >
              Целый день
            </span>
          )}
        </div>
      </div>
      {popover}
    </div>
  );
}
