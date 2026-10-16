import { getCurrentOrNextScheduleWindow } from "@/lib/categoryBlitzScheduleTime";
import type { OwnerSchedule, OwnerScheduleGameType } from "@/types";

// Display helpers for owner schedules, shared by the dashboard's Live Games
// section and the Schedule page / sheet. Pure: no React, no DOM.

export const GAME_LABELS: Record<OwnerScheduleGameType, string> = {
  category_blitz: "Category Blitz",
  live_trivia: "Live Trivia",
};

// Keys are the lowercase 3-letter codes the engine stores (sun..sat).
export const WEEKDAY_OPTIONS: { key: string; label: string }[] = [
  { key: "sun", label: "Sun" },
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
];

/** The next (or currently-open) occurrence window for a schedule, falling back to the stored one-off window. */
export const displayWindow = (schedule: OwnerSchedule): { startTime: string; endTime: string } => {
  const occurrence = getCurrentOrNextScheduleWindow(schedule);
  if (occurrence) {
    return {
      startTime: occurrence.windowStart.toISOString(),
      endTime: occurrence.windowEnd.toISOString(),
    };
  }
  return { startTime: schedule.startTime, endTime: schedule.endTime };
};

/** Short human label for a schedule's recurrence ("Every day", "Every Mon, Fri"), or null for one-off. */
export const recurrenceLabel = (schedule: OwnerSchedule): string | null => {
  if (schedule.recurringType === "daily") return "Every day";
  if (schedule.recurringType === "weekly") {
    const days = WEEKDAY_OPTIONS.filter((d) => schedule.recurringDays?.includes(d.key)).map((d) => d.label);
    if (days.length === WEEKDAY_OPTIONS.length) return "Every day";
    return days.length > 0 ? `Every ${days.join(", ")}` : "Weekly";
  }
  return null;
};

export const formatScheduleTime = (iso: string, timeZone: string): string => {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
};

const clockParts = (iso: string, timeZone: string): { clock: string; period: string; day: string } => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    clock: `${part("hour")}:${part("minute")}`,
    period: part("dayPeriod").toUpperCase(),
    day: `${part("year")}-${part("month")}-${part("day")}`,
  };
};

/**
 * A game's time range without repeating the date (the row's date box already shows it):
 * "7:00 – 9:00 PM", "11:30 AM – 1:00 PM", or "11:00 PM – Oct 4, 1:00 AM" past midnight.
 */
export const formatTimeRange = (startIso: string, endIso: string, timeZone: string): string => {
  try {
    const start = clockParts(startIso, timeZone);
    const end = clockParts(endIso, timeZone);
    if (start.day !== end.day) return `${start.clock} ${start.period} – ${formatScheduleTime(endIso, timeZone)}`;
    if (start.period === end.period) return `${start.clock} – ${end.clock} ${end.period}`;
    return `${start.clock} ${start.period} – ${end.clock} ${end.period}`;
  } catch {
    return `${formatScheduleTime(startIso, timeZone)} – ${formatScheduleTime(endIso, timeZone)}`;
  }
};

/** Whether `title` already contains `label` as whole words, ignoring case ("Friday Live Trivia", not "Live Triviathon"). */
const titleNamesGame = (title: string, label: string): boolean => {
  const escaped = label.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(title);
};

/**
 * The one muted line under a game's title: time range, how often it repeats, and the
 * game's name only when the title doesn't already contain it. `window` is the row's
 * `displayWindow(schedule)`, passed in so a row computes it once.
 */
export const scheduleRowDetail = (
  schedule: OwnerSchedule,
  window: { startTime: string; endTime: string },
): string => {
  const gameLabel = GAME_LABELS[schedule.gameType];
  return [
    formatTimeRange(window.startTime, window.endTime, schedule.timezone),
    recurrenceLabel(schedule),
    titleNamesGame(schedule.title, gameLabel) ? null : gameLabel,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
};

export const dateChip = (iso: string, timeZone: string): { month: string; day: string } => {
  try {
    const d = new Date(iso);
    return {
      month: d.toLocaleString("en-US", { timeZone, month: "short" }).toUpperCase(),
      day: d.toLocaleString("en-US", { timeZone, day: "numeric" }),
    };
  } catch {
    return { month: "—", day: "—" };
  }
};

/**
 * Bucket by the NEXT occurrence's window, not the stored (first) one — a weekly
 * series whose first occurrence has passed still has a future occurrence and
 * belongs in "upcoming", not "past". Upcoming is soonest-first, past newest-first.
 */
export const splitSchedules = (
  schedules: OwnerSchedule[],
  nowMs: number,
): { upcoming: OwnerSchedule[]; past: OwnerSchedule[] } => {
  const windowed = schedules.map((schedule) => ({ schedule, window: displayWindow(schedule) }));
  const startOf = (w: { window: { startTime: string } }) => Date.parse(w.window.startTime);
  return {
    upcoming: windowed
      .filter((w) => Date.parse(w.window.endTime) >= nowMs)
      .sort((a, b) => startOf(a) - startOf(b))
      .map((w) => w.schedule),
    past: windowed
      .filter((w) => Date.parse(w.window.endTime) < nowMs)
      .sort((a, b) => startOf(b) - startOf(a))
      .map((w) => w.schedule),
  };
};
