import "server-only";

import {
  computeWindowMinutesFromRange,
  deriveEndTimeIso,
  getCurrentOrNextScheduleWindow,
  isScheduleWindowOpen,
} from "@/lib/categoryBlitzScheduleTime";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { broadcastCategoryBlitz } from "@/lib/categoryBlitzBroadcast";
import type { CategoryBlitzSchedule, CategoryBlitzRecurringType } from "@/types";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type CategoryBlitzWeekday = (typeof WEEKDAY_KEYS)[number];

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

function toSchedule(row: ScheduleRow): CategoryBlitzSchedule {
  return {
    id: row.id,
    venueId: row.venue_id,
    title: row.title,
    startTime: row.start_time,
    endTime: deriveEndTimeIso(row.start_time, row.window_minutes),
    timezone: row.timezone,
    recurringType: row.recurring_type as CategoryBlitzRecurringType,
    recurringDays: row.recurring_days ?? [],
    windowMinutes: row.window_minutes,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLS =
  "id, venue_id, title, start_time, timezone, recurring_type, recurring_days, window_minutes, is_active, created_at, updated_at";

function normalizeScheduleRecurrence(params: {
  recurringType?: string;
  recurringDays?: unknown;
}): { recurringType: CategoryBlitzRecurringType; recurringDays: CategoryBlitzWeekday[] } {
  const rawType = String(params.recurringType ?? "none").trim().toLowerCase();
  if (rawType !== "none" && rawType !== "daily" && rawType !== "weekly") {
    throw new Error("recurringType must be none, daily, or weekly.");
  }

  if (rawType !== "weekly") {
    return { recurringType: rawType, recurringDays: [] };
  }

  if (!Array.isArray(params.recurringDays)) {
    throw new Error("Select at least one day for weekly recurring schedules.");
  }

  const recurringDays = Array.from(
    new Set(
      params.recurringDays.map((entry) => String(entry ?? "").trim().toLowerCase())
    )
  );
  const invalidDay = recurringDays.find((entry) => !WEEKDAY_KEYS.includes(entry as CategoryBlitzWeekday));
  if (invalidDay) {
    throw new Error("recurringDays must contain valid weekday keys.");
  }
  if (recurringDays.length === 0) {
    throw new Error("Select at least one day for weekly recurring schedules.");
  }

  return {
    recurringType: "weekly",
    recurringDays: recurringDays as CategoryBlitzWeekday[],
  };
}

/** Get a single schedule by id, or null if not found. */
export async function getSchedule(scheduleId: string): Promise<CategoryBlitzSchedule | null> {
  assertAdmin();
  const { data, error } = await supabaseAdmin!
    .from("category_blitz_schedules")
    .select(SELECT_COLS)
    .eq("id", scheduleId)
    .maybeSingle<ScheduleRow>();

  if (error) throw new Error(error.message || "Failed to load schedule.");
  return data ? toSchedule(data) : null;
}

/** List all active schedules for a venue, ordered by start time. */
export async function listSchedules(venueId: string): Promise<CategoryBlitzSchedule[]> {
  assertAdmin();
  const { data, error } = await supabaseAdmin!
    .from("category_blitz_schedules")
    .select(SELECT_COLS)
    .eq("venue_id", venueId)
    .eq("is_active", true)
    .order("start_time", { ascending: true });

  if (error) throw new Error(error.message || "Failed to load schedules.");
  return (data ?? []).map((r) => toSchedule(r as ScheduleRow));
}

/** List all schedules across all venues — used by the cron engine. */
export async function listAllActiveSchedules(): Promise<CategoryBlitzSchedule[]> {
  assertAdmin();
  const { data, error } = await supabaseAdmin!
    .from("category_blitz_schedules")
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
  endTime: string;
  timezone: string;
  recurringType?: string;
  recurringDays?: string[];
};

/** Create a new schedule. */
export async function createSchedule(params: CreateScheduleParams): Promise<CategoryBlitzSchedule> {
  assertAdmin();
  const { venueId, title, startTime, endTime, timezone } = params;
  const windowMinutes = computeWindowMinutesFromRange(startTime, endTime);
  const recurrence = normalizeScheduleRecurrence(params);

  const { data, error } = await supabaseAdmin!
    .from("category_blitz_schedules")
    .insert({
      venue_id: venueId,
      title,
      start_time: startTime,
      timezone,
      recurring_type: recurrence.recurringType,
      recurring_days: recurrence.recurringDays,
      window_minutes: windowMinutes,
    })
    .select(SELECT_COLS)
    .single<ScheduleRow>();

  if (error) throw new Error(error.message || "Failed to create schedule.");
  const schedule = toSchedule(data);
  await broadcastCategoryBlitz(venueId, "schedule_updated", { scheduleId: schedule.id });
  return schedule;
}

export type UpdateScheduleParams = {
  title: string;
  startTime: string;
  endTime: string;
  timezone: string;
  recurringType?: string;
  recurringDays?: string[];
};

/** Update mutable fields on an existing schedule. */
export async function updateSchedule(
  scheduleId: string,
  params: UpdateScheduleParams,
): Promise<CategoryBlitzSchedule> {
  assertAdmin();
  const { title, startTime, endTime, timezone } = params;
  const windowMinutes = computeWindowMinutesFromRange(startTime, endTime);
  const recurrence = normalizeScheduleRecurrence(params);

  const { data, error } = await supabaseAdmin!
    .from("category_blitz_schedules")
    .update({
      title,
      start_time: startTime,
      timezone,
      recurring_type: recurrence.recurringType,
      recurring_days: recurrence.recurringDays,
      window_minutes: windowMinutes,
    })
    .eq("id", scheduleId)
    .select(SELECT_COLS)
    .single<ScheduleRow>();

  if (error) throw new Error(error.message || "Failed to update schedule.");
  const schedule = toSchedule(data);
  await broadcastCategoryBlitz(schedule.venueId, "schedule_updated", { scheduleId: schedule.id });
  return schedule;
}

/** Soft-delete (deactivate) a schedule and return its venue id (or null if not found). */
export async function deleteSchedule(scheduleId: string): Promise<string | null> {
  assertAdmin();

  // Fetch venue_id before soft-deleting so the caller can end any running auto session.
  const { data: schedule } = await supabaseAdmin!
    .from("category_blitz_schedules")
    .select("venue_id")
    .eq("id", scheduleId)
    .maybeSingle<{ venue_id: string }>();

  const venueId = schedule?.venue_id ?? null;

  const { error } = await supabaseAdmin!
    .from("category_blitz_schedules")
    .update({ is_active: false })
    .eq("id", scheduleId);

  if (error) throw new Error(error.message || "Failed to delete schedule.");

  if (venueId) await broadcastCategoryBlitz(venueId, "schedule_updated", { scheduleId });

  return venueId;
}

// ── Next-occurrence computation ───────────────────────────────────────────────

/**
 * Given a schedule, compute the next UTC timestamp at which a window opens
 * (or is currently open). Returns null if no future occurrence exists (one-off
 * schedule whose start_time has already passed).
 */
export function nextOccurrence(schedule: CategoryBlitzSchedule, now: Date = new Date()): Date | null {
  return getCurrentOrNextScheduleWindow(schedule, now)?.windowStart ?? null;
}

/**
 * Returns the soonest upcoming (or currently open) schedule for a venue,
 * along with when the current window ends (if open now).
 */
export function getNextScheduleOccurrence(
  schedules: CategoryBlitzSchedule[],
  now: Date = new Date(),
): { schedule: CategoryBlitzSchedule; windowStart: Date; windowEnd: Date } | null {
  let best: { schedule: CategoryBlitzSchedule; windowStart: Date; windowEnd: Date } | null = null;

  for (const s of schedules) {
    const occurrence = getCurrentOrNextScheduleWindow(s, now);
    if (!occurrence) continue;
    if (!best || occurrence.windowStart < best.windowStart) {
      best = { schedule: s, windowStart: occurrence.windowStart, windowEnd: occurrence.windowEnd };
    }
  }

  return best;
}

/** Whether a window is currently open for the given schedule (at `now`). */
export function isWindowOpen(schedule: CategoryBlitzSchedule, now: Date = new Date()): boolean {
  return isScheduleWindowOpen(schedule, now);
}
