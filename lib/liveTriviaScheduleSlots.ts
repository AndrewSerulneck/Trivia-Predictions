// ── Which Live Trivia games a venue still has ──────────────────────────────
//
// The ONE reading of "is this Live Trivia game still on" and "which games does
// it make", shared by the reward picker and descriptions (lib/rewards.ts) and
// the schedule-change cascade (lib/rewardGameSlotCascade.ts). It lives in its
// own leaf because lib/rewards.ts imports lib/liveShowdownAdmin.ts, which calls
// the cascade: the cascade importing lib/rewards.ts would be an import cycle.
// Pure: no Supabase, no "server-only".

import { getCurrentOrNextScheduleWindow } from "@/lib/categoryBlitzScheduleTime";
import type { AdminLiveShowdownSchedule } from "@/lib/liveShowdownAdmin";
import { liveTriviaDurationMinutes } from "@/lib/liveTriviaShared";
import {
  enumerateGameSlots,
  scheduleRunWeekdays,
  type RewardGameScheduleShape,
  type RewardGameSlot,
} from "@/lib/rewardGameSlots";
import type { CampaignRecurringType, CategoryBlitzRecurringType } from "@/types";

/**
 * How a schedule recurs, as a reward can express it: a "none" schedule with
 * explicit recurring days is weekly; monthly / yearly run exactly once at
 * start_time (enumerateScheduleOccurrences), so they are one-offs.
 */
export const rewardRecurringType = (schedule: AdminLiveShowdownSchedule): CampaignRecurringType => {
  const declared = schedule.recurringType;
  if (declared === "none" && schedule.recurringDays.length > 0) return "weekly";
  if (declared === "monthly" || declared === "yearly") return "none";
  return declared;
};

// The owner schedule page's own narrowing (lib/ownerSchedule.ts coerceRecurringType),
// repeated here rather than imported: lib/ownerSchedule.ts imports lib/liveShowdownAdmin.ts.
const windowRecurringType = (value: string): CategoryBlitzRecurringType =>
  value === "daily" || value === "weekly" ? value : "none";

/**
 * Whether a schedule has a game that is live right now or still has a future
 * occurrence ahead of it. A one-off schedule is a single occurrence — once its
 * window ends the game no longer exists, even though its `trivia_schedules` row
 * is never deleted. Reuses the same occurrence-window math the owner schedule
 * page uses to bucket a schedule as "Upcoming" vs. "Past"
 * (getCurrentOrNextScheduleWindow), so "scheduled" here means the exact same
 * thing it means to the partner looking at their own schedule.
 */
export const hasLiveOrUpcomingOccurrence = (schedule: AdminLiveShowdownSchedule, now: Date): boolean => {
  const startMs = Date.parse(schedule.startTime);
  if (!Number.isFinite(startMs)) return false;
  const windowMinutes = liveTriviaDurationMinutes(schedule.numRounds);
  const endTime = new Date(startMs + windowMinutes * 60_000).toISOString();
  const window = getCurrentOrNextScheduleWindow(
    {
      startTime: schedule.startTime,
      endTime,
      timezone: schedule.timezone,
      recurringType: windowRecurringType(schedule.recurringType),
      recurringDays: schedule.recurringDays,
      windowMinutes,
    },
    now,
  );
  return window !== null;
};

/**
 * Reduce schedules to the game-picker inputs, keyed by schedule id and carrying
 * the weekdays themselves, because a game-winner reward is pinned to individual
 * `{scheduleId, weekday}` slots. See lib/rewardGameSlots.ts.
 */
export const toGameScheduleShapes = (
  schedules: readonly AdminLiveShowdownSchedule[],
): RewardGameScheduleShape[] => {
  return schedules.map((schedule) => ({
    scheduleId: schedule.id,
    title: schedule.title,
    recurringType: rewardRecurringType(schedule),
    weekdays: scheduleRunWeekdays(schedule),
    startTime: schedule.startTime,
    timezone: schedule.timezone,
  }));
};

/** The games a venue still has (live or upcoming), as pinnable slots. */
export const liveOrUpcomingGameSlots = (
  schedules: readonly AdminLiveShowdownSchedule[],
  now: Date,
): RewardGameSlot[] => {
  return enumerateGameSlots(
    toGameScheduleShapes(schedules.filter((schedule) => hasLiveOrUpcomingOccurrence(schedule, now))),
  );
};
