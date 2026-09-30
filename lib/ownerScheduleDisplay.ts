import { getCurrentOrNextScheduleWindow } from "@/lib/categoryBlitzScheduleTime";
import type { OwnerSchedule, OwnerScheduleGameType } from "@/types";

// Display helpers for owner schedules, shared by the dashboard's Live Games
// section and the Schedule page / sheet. Pure: no React, no DOM.

export const GAME_LABELS: Record<OwnerScheduleGameType, string> = {
  category_blitz: "Category Blitz",
  live_trivia: "Live Trivia",
};

// Per-game accent for list pills (matches the picker gradients / app/globals.css tokens).
export const GAME_PILL_STYLES: Record<OwnerScheduleGameType, string> = {
  category_blitz: "bg-ht-cyan-500/15 text-ht-cyan-300",
  live_trivia: "bg-sky-500/15 text-sky-300",
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

/** Short human label for a schedule's recurrence, or null for one-off. */
export const recurrenceLabel = (schedule: OwnerSchedule): string | null => {
  if (schedule.recurringType === "daily") return "Daily";
  if (schedule.recurringType === "weekly") {
    const days = WEEKDAY_OPTIONS.filter((d) => schedule.recurringDays?.includes(d.key)).map((d) => d.label);
    return days.length > 0 ? `Weekly · ${days.join(", ")}` : "Weekly";
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
