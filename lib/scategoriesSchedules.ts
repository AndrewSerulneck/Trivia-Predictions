import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ScategoriesSchedule, ScategoriesRecurringType } from "@/types";

function assertAdmin() {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");
}

type ScheduleRow = {
  id: string;
  venue_id: string;
  title: string;
  start_time: string;
  timezone: string;
  recurring_type: string;
  recurring_days: string[];
  window_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function toSchedule(row: ScheduleRow): ScategoriesSchedule {
  return {
    id: row.id,
    venueId: row.venue_id,
    title: row.title,
    startTime: row.start_time,
    timezone: row.timezone,
    recurringType: row.recurring_type as ScategoriesRecurringType,
    recurringDays: row.recurring_days ?? [],
    windowMinutes: row.window_minutes,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLS =
  "id, venue_id, title, start_time, timezone, recurring_type, recurring_days, window_minutes, is_active, created_at, updated_at";

/** List all active schedules for a venue, ordered by start time. */
export async function listSchedules(venueId: string): Promise<ScategoriesSchedule[]> {
  assertAdmin();
  const { data, error } = await supabaseAdmin!
    .from("scategories_schedules")
    .select(SELECT_COLS)
    .eq("venue_id", venueId)
    .eq("is_active", true)
    .order("start_time", { ascending: true });

  if (error) throw new Error(error.message || "Failed to load schedules.");
  return (data ?? []).map((r) => toSchedule(r as ScheduleRow));
}

/** List all schedules across all venues — used by the cron engine. */
export async function listAllActiveSchedules(): Promise<ScategoriesSchedule[]> {
  assertAdmin();
  const { data, error } = await supabaseAdmin!
    .from("scategories_schedules")
    .select(SELECT_COLS)
    .eq("is_active", true)
    .order("start_time", { ascending: true });

  if (error) throw new Error(error.message || "Failed to load schedules.");
  return (data ?? []).map((r) => toSchedule(r as ScheduleRow));
}

export type CreateScheduleParams = {
  venueId: string;
  title: string;
  startTime: string;
  timezone: string;
  recurringType: ScategoriesRecurringType;
  recurringDays: string[];
  windowMinutes: number;
};

/** Create a new schedule. */
export async function createSchedule(params: CreateScheduleParams): Promise<ScategoriesSchedule> {
  assertAdmin();
  const { venueId, title, startTime, timezone, recurringType, recurringDays, windowMinutes } = params;

  const { data, error } = await supabaseAdmin!
    .from("scategories_schedules")
    .insert({
      venue_id: venueId,
      title,
      start_time: startTime,
      timezone,
      recurring_type: recurringType,
      recurring_days: recurringDays,
      window_minutes: windowMinutes,
    })
    .select(SELECT_COLS)
    .single<ScheduleRow>();

  if (error) throw new Error(error.message || "Failed to create schedule.");
  return toSchedule(data);
}

/** Soft-delete (deactivate) a schedule. */
export async function deleteSchedule(scheduleId: string): Promise<void> {
  assertAdmin();
  const { error } = await supabaseAdmin!
    .from("scategories_schedules")
    .update({ is_active: false })
    .eq("id", scheduleId);

  if (error) throw new Error(error.message || "Failed to delete schedule.");
}

// ── Next-occurrence computation ───────────────────────────────────────────────

/**
 * Given a schedule, compute the next UTC timestamp at which a window opens
 * (or is currently open). Returns null if no future occurrence exists (one-off
 * schedule whose start_time has already passed).
 */
export function nextOccurrence(schedule: ScategoriesSchedule, now: Date = new Date()): Date | null {
  const start = new Date(schedule.startTime);

  if (schedule.recurringType === "none") {
    const windowEnd = new Date(start.getTime() + schedule.windowMinutes * 60_000);
    return windowEnd > now ? start : null;
  }

  if (schedule.recurringType === "daily") {
    // Find the next occurrence: today's wall-clock time in the schedule's timezone,
    // then check if we're before or after the daily window.
    const todayStart = toZonedStartOfDay(now, schedule.timezone);
    const todayWindow = new Date(todayStart.getTime() + msFromMidnight(start, schedule.timezone));
    const todayWindowEnd = new Date(todayWindow.getTime() + schedule.windowMinutes * 60_000);

    if (todayWindowEnd > now) return todayWindow;
    // Try tomorrow.
    const tomorrowWindow = new Date(todayWindow.getTime() + 86_400_000);
    return tomorrowWindow;
  }

  if (schedule.recurringType === "weekly") {
    const days = schedule.recurringDays;
    if (days.length === 0) return null;

    const WEEKDAY_MAP: Record<string, number> = {
      sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
    };
    const targetDayNums = days.map((d) => WEEKDAY_MAP[d.toLowerCase()] ?? -1).filter((n) => n >= 0);
    if (targetDayNums.length === 0) return null;

    // Walk forward up to 14 days to find the next matching day+time.
    for (let offset = 0; offset < 14; offset++) {
      const candidate = new Date(now.getTime() + offset * 86_400_000);
      const dayNum = getDayOfWeekInZone(candidate, schedule.timezone);
      if (!targetDayNums.includes(dayNum)) continue;

      const dayStart = toZonedStartOfDay(candidate, schedule.timezone);
      const windowStart = new Date(dayStart.getTime() + msFromMidnight(start, schedule.timezone));
      const windowEnd = new Date(windowStart.getTime() + schedule.windowMinutes * 60_000);

      if (windowEnd > now) return windowStart;
    }
    return null;
  }

  return null;
}

/**
 * Returns the soonest upcoming (or currently open) schedule for a venue,
 * along with when the current window ends (if open now).
 */
export function getNextScheduleOccurrence(
  schedules: ScategoriesSchedule[],
  now: Date = new Date(),
): { schedule: ScategoriesSchedule; windowStart: Date; windowEnd: Date } | null {
  let best: { schedule: ScategoriesSchedule; windowStart: Date; windowEnd: Date } | null = null;

  for (const s of schedules) {
    const occ = nextOccurrence(s, now);
    if (!occ) continue;
    const end = new Date(occ.getTime() + s.windowMinutes * 60_000);
    if (!best || occ < best.windowStart) {
      best = { schedule: s, windowStart: occ, windowEnd: end };
    }
  }

  return best;
}

/** Whether a window is currently open for the given schedule (at `now`). */
export function isWindowOpen(schedule: ScategoriesSchedule, now: Date = new Date()): boolean {
  const occ = nextOccurrence(schedule, now);
  if (!occ) return false;
  return occ <= now && now < new Date(occ.getTime() + schedule.windowMinutes * 60_000);
}

// ── Timezone helpers ──────────────────────────────────────────────────────────

function toZonedStartOfDay(date: Date, tz: string): Date {
  // Get the local date string in the target timezone, then parse midnight UTC for that date.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year  = parts.find((p) => p.type === "year")?.value ?? "2000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day   = parts.find((p) => p.type === "day")?.value ?? "01";

  // Midnight in the target timezone expressed as UTC.
  return new Date(
    new Intl.DateTimeFormat("en-US", { timeZone: "UTC" }).format(
      new Date(`${year}-${month}-${day}T00:00:00`),
    ) === "invalid"
      ? `${year}-${month}-${day}T00:00:00Z`
      : new Date(`${year}-${month}-${day}T00:00:00`).toLocaleString("en-US", { timeZone: tz })
  );
}

/** Milliseconds since midnight in the given timezone for a reference Date. */
function msFromMidnight(date: Date, tz: string): number {
  const inZone = new Date(date.toLocaleString("en-US", { timeZone: tz }));
  const midnight = new Date(inZone);
  midnight.setHours(0, 0, 0, 0);
  return inZone.getTime() - midnight.getTime();
}

function getDayOfWeekInZone(date: Date, tz: string): number {
  return new Date(date.toLocaleString("en-US", { timeZone: tz })).getDay();
}
