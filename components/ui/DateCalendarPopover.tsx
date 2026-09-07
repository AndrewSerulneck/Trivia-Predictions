"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { setScrollLock } from "@/lib/scrollLock";

/**
 * A date rail + month-grid popover. Built for Prop Bingo's "look at a previous day" flow
 * (docs/prop-bingo-page-simplification-plan.md, phase 5b) but deliberately game-agnostic, so
 * Pick 'Em's bare `◀ ▶` arrows can adopt it later (5e).
 *
 * Everything here speaks ONE date format: `YYYY-MM-DD`, interpreted as a LOCAL calendar day.
 * No `Date` ever crosses the prop boundary — that is what keeps a "day" from drifting a
 * timezone at the edges. All the arithmetic below goes through the local-time `Date`
 * constructor (`new Date(y, m, d)`), never `Date.parse` on the key, because parsing a bare
 * `YYYY-MM-DD` is specified as UTC and would land on the wrong day west of Greenwich.
 *
 * No date library: none is installed and a month grid does not justify adding one.
 * The slide-up sheet reuses the existing global `tp-popup-sheet-*` / `tp-fade-*` animations
 * (app/globals.css), which already no-op under `prefers-reduced-motion`.
 */

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"] as const;
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

// Matches .animate-tp-popup-sheet-down in app/globals.css.
const SHEET_EXIT_MS = 270;

const resolveExitMs = (): number => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : SHEET_EXIT_MS;
  } catch {
    return SHEET_EXIT_MS;
  }
};

type YearMonthDay = { year: number; month: number; day: number };

const parseDateKey = (key: string): YearMonthDay | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return null;
  }
  const [year, month, day] = key.split("-").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return { year, month, day };
};

export const formatDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Local `YYYY-MM-DD` for the day an ISO instant falls on in the viewer's own timezone. */
export const toLocalDateKey = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : formatDateKey(date);
};

export const todayDateKey = (): string => formatDateKey(new Date());

/** Shifts a `YYYY-MM-DD` key by whole days, rolling months and years correctly. */
export const addDaysToDateKey = (key: string, days: number): string => {
  const parts = parseDateKey(key);
  if (!parts) {
    return key;
  }
  return formatDateKey(new Date(parts.year, parts.month - 1, parts.day + days));
};

const toDate = (key: string): Date | null => {
  const parts = parseDateKey(key);
  return parts ? new Date(parts.year, parts.month - 1, parts.day) : null;
};

const formatRailLabel = (key: string): string => {
  const date = toDate(key);
  if (!date) {
    return key;
  }
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};

const formatFullLabel = (key: string): string => {
  const date = toDate(key);
  if (!date) {
    return key;
  }
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type DateCalendarPopoverProps = {
  /** Currently shown day, `YYYY-MM-DD` local. */
  selectedDate: string;
  /** The viewer's "today", `YYYY-MM-DD` local. Passed in (not derived) so the host owns the clock. */
  today: string;
  /** Days that have something on them — rendered with a dot. */
  markedDates?: readonly string[];
  /** Earliest selectable day, inclusive. Omit for no lower bound. */
  minDate?: string;
  /** Latest selectable day, inclusive. Defaults to `today` — future days are disabled. */
  maxDate?: string;
  onSelect: (date: string) => void;
  /** Accessible name for the whole rail. */
  label?: string;
  className?: string;
};

export const DateCalendarPopover = ({
  selectedDate,
  today,
  markedDates,
  minDate,
  maxDate,
  onSelect,
  label = "Select a date",
  className = "",
}: DateCalendarPopoverProps) => {
  const scrollLockId = useId();
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => selectedDate.slice(0, 7));

  const upperBound = maxDate ?? today;
  const markedSet = useMemo(() => new Set(markedDates ?? []), [markedDates]);

  const isSelectable = useCallback(
    (key: string): boolean => {
      if (minDate && key < minDate) return false;
      if (upperBound && key > upperBound) return false;
      return true;
    },
    [minDate, upperBound]
  );

  const previousDay = addDaysToDateKey(selectedDate, -1);
  const nextDay = addDaysToDateKey(selectedDate, 1);

  const closeSheet = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setIsOpen(false);
      setIsClosing(false);
      triggerRef.current?.focus();
    }, resolveExitMs());
  }, [isClosing]);

  const openSheet = () => {
    // Cancel any in-flight close: the backdrop is `pointer-events-none` while closing, so the
    // trigger stays tappable, and a reopen inside `resolveExitMs()` would otherwise let the
    // stale timer fire against the freshly-opened sheet — closing it and yanking focus back.
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setVisibleMonth(selectedDate.slice(0, 7));
    setIsClosing(false);
    setIsOpen(true);
  };

  const pick = (key: string) => {
    onSelect(key);
    closeSheet();
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSheet();
        return;
      }
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (current === first || !root.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeSheet, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    // Focus the dialog itself rather than a day cell: landing on a specific date would read it
    // aloud as if it were already chosen.
    dialogRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    setScrollLock(`date-calendar:${scrollLockId}`, isOpen, "popup");
    return () => setScrollLock(`date-calendar:${scrollLockId}`, false);
  }, [isOpen, scrollLockId]);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    []
  );

  const monthParts = parseDateKey(`${visibleMonth}-01`) ?? parseDateKey(`${today.slice(0, 7)}-01`);
  const monthYear = monthParts?.year ?? new Date().getFullYear();
  const monthIndex = (monthParts?.month ?? 1) - 1;

  const monthCells = useMemo(() => {
    const firstOfMonth = new Date(monthYear, monthIndex, 1);
    const leadingBlanks = firstOfMonth.getDay();
    const daysInMonth = new Date(monthYear, monthIndex + 1, 0).getDate();
    const cells: Array<string | null> = [];
    for (let i = 0; i < leadingBlanks; i += 1) {
      cells.push(null);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(formatDateKey(new Date(monthYear, monthIndex, day)));
    }
    return cells;
  }, [monthIndex, monthYear]);

  const shiftMonth = (delta: number) => {
    const shifted = new Date(monthYear, monthIndex + delta, 1);
    setVisibleMonth(formatDateKey(shifted).slice(0, 7));
  };

  const canPageToPreviousMonth = !minDate || `${visibleMonth}-01` > minDate;
  const canPageToNextMonth = formatDateKey(new Date(monthYear, monthIndex + 1, 1)) <= upperBound;

  return (
    <div className={`flex items-center gap-2 ${className}`} role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onSelect(previousDay)}
        disabled={!isSelectable(previousDay)}
        aria-label={`Previous day, ${formatFullLabel(previousDay)}`}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sky-300/25 bg-slate-900 text-sky-300 transition-colors disabled:opacity-35 enabled:active:bg-slate-800"
      >
        <ChevronLeft aria-hidden="true" className="h-5 w-5" />
      </button>

      <button
        ref={triggerRef}
        type="button"
        onClick={openSheet}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-sky-300/30 bg-slate-900 px-3 text-[13px] font-black tracking-[0.01em] text-slate-100"
      >
        <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-sky-300" />
        <span className="truncate">{formatRailLabel(selectedDate)}</span>
        {selectedDate === today ? (
          <span className="shrink-0 rounded-full border border-sky-300/40 bg-sky-300/[0.14] px-2 py-0.5 text-[9.5px] font-black uppercase tracking-[0.08em] text-sky-300">
            Today
          </span>
        ) : null}
      </button>

      <button
        type="button"
        onClick={() => onSelect(nextDay)}
        disabled={!isSelectable(nextDay)}
        aria-label={`Next day, ${formatFullLabel(nextDay)}`}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sky-300/25 bg-slate-900 text-sky-300 transition-colors disabled:opacity-35 enabled:active:bg-slate-800"
      >
        <ChevronRight aria-hidden="true" className="h-5 w-5" />
      </button>

      {isOpen ? (
        <div
          data-tp-scroll-lock="active"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSheet();
          }}
          className={`fixed inset-0 z-[5000] flex items-end justify-center bg-slate-950/70 p-3 sm:items-center ${
            isClosing ? "pointer-events-none animate-tp-fade-out" : "animate-tp-fade-in"
          }`}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={`w-full max-w-[26rem] overflow-hidden rounded-2xl border border-sky-300/30 bg-slate-900 shadow-[0_18px_40px_rgba(0,0,0,0.6)] outline-none ${
              isClosing ? "animate-tp-popup-sheet-down" : "animate-tp-popup-sheet-up"
            }`}
          >
            <header className="flex items-center justify-between gap-2 border-b border-sky-300/20 px-3 py-3">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                disabled={!canPageToPreviousMonth}
                aria-label="Previous month"
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-sky-300/25 bg-slate-800/60 text-sky-300 disabled:opacity-35"
              >
                <ChevronLeft aria-hidden="true" className="h-5 w-5" />
              </button>
              <h2 id={titleId} className="min-w-0 truncate text-[14px] font-black text-slate-100">
                {MONTH_LABELS[monthIndex]} {monthYear}
              </h2>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                disabled={!canPageToNextMonth}
                aria-label="Next month"
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-sky-300/25 bg-slate-800/60 text-sky-300 disabled:opacity-35"
              >
                <ChevronRight aria-hidden="true" className="h-5 w-5" />
              </button>
            </header>

            <div className="px-3 pb-3 pt-2">
              <div className="grid grid-cols-7 gap-1 pb-1">
                {WEEKDAY_LABELS.map((weekday, index) => (
                  <span
                    key={`${weekday}-${index}`}
                    aria-hidden="true"
                    className="py-1 text-center text-[10px] font-black uppercase tracking-[0.08em] text-slate-500"
                  >
                    {weekday}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {monthCells.map((key, index) => {
                  if (!key) {
                    return <span key={`blank-${index}`} aria-hidden="true" className="h-11" />;
                  }
                  const isSelected = key === selectedDate;
                  const isToday = key === today;
                  const disabled = !isSelectable(key);
                  const dayNumber = Number.parseInt(key.slice(8), 10);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => pick(key)}
                      disabled={disabled}
                      aria-current={isSelected ? "date" : undefined}
                      aria-label={`${formatFullLabel(key)}${markedSet.has(key) ? ", has boards" : ""}`}
                      className={`relative flex h-11 items-center justify-center rounded-xl text-[13px] font-black transition-colors ${
                        isSelected
                          ? "bg-sky-300 text-[#08233a]"
                          : disabled
                            ? "text-slate-700"
                            : "text-slate-200 active:bg-slate-800"
                      } ${isToday && !isSelected ? "ring-1 ring-inset ring-sky-300/70" : ""}`}
                    >
                      {dayNumber}
                      {markedSet.has(key) ? (
                        <span
                          aria-hidden="true"
                          className={`absolute bottom-1.5 h-1 w-1 rounded-full ${
                            isSelected ? "bg-[#08233a]" : "bg-sky-300"
                          }`}
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <footer className="flex items-center justify-between gap-2 border-t border-sky-300/20 px-3 py-2.5">
              <button
                type="button"
                onClick={() => pick(today)}
                className="inline-flex h-11 items-center rounded-xl border border-sky-300/40 bg-sky-300/[0.12] px-3.5 text-[12px] font-black uppercase tracking-[0.06em] text-sky-300"
              >
                Jump to today
              </button>
              <button
                type="button"
                onClick={closeSheet}
                className="inline-flex h-11 items-center rounded-xl border border-slate-700 bg-slate-800 px-3.5 text-[12px] font-black uppercase tracking-[0.06em] text-slate-300"
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
};
