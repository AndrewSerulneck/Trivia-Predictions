import {
  datetimeLocalValueToUtcIso,
  utcIsoToDatetimeLocalValue,
} from "@/lib/categoryBlitzScheduleTime";
import { gameDurationMinutes, roundsFromWindowMinutes } from "@/lib/categoryBlitzShared";
import { liveTriviaDurationMinutes, roundsFromLiveTriviaWindowMinutes } from "@/lib/liveTriviaShared";
import { GAME_LABELS, WEEKDAY_OPTIONS } from "@/lib/ownerScheduleDisplay";
import { resolveStep } from "@/lib/ownerSheetParams";
import type { CategoryBlitzRecurringType, OwnerSchedule, OwnerScheduleGameType } from "@/types";

// The Schedule Live Games flow's logic (docs/partner-dashboard-app-redesign-plan.md §4e),
// extracted from the old ScheduleForm in app/owner/schedule/page.tsx. Pure: no React,
// no DOM, so the step-skip rules and the request body can be unit-tested. The time,
// duration and recurrence maths is the old form's, unchanged in meaning — the
// equivalence test (tests/lib.owner-schedule-form.test.ts) keeps a copy of the old
// handleSave as its oracle.

/** Wall-clock length in minutes for N rounds of the given game — the server derives the same. */
export const durationMinutesFor = (gameType: OwnerScheduleGameType, rounds: number): number =>
  gameType === "live_trivia" ? liveTriviaDurationMinutes(rounds) : gameDurationMinutes(rounds);

/** Best-effort inverse, for prefilling the edit form's rounds field from a stored window. */
export const roundsFromWindowMinutesFor = (gameType: OwnerScheduleGameType, windowMinutes: number): number =>
  gameType === "live_trivia"
    ? roundsFromLiveTriviaWindowMinutes(windowMinutes)
    : roundsFromWindowMinutes(windowMinutes);

export const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export const FALLBACK_TIMEZONE = "America/New_York";

/** The browser's timezone when we offer it, otherwise the same default the old form used. */
export const pickDefaultTimezone = (browserTimeZone: string | null | undefined): string =>
  browserTimeZone && TIMEZONES.includes(browserTimeZone) ? browserTimeZone : FALLBACK_TIMEZONE;

export const detectBrowserTimeZone = (): string | null => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
};

// Owner recurrence is a Live Trivia–only feature and limited to what the engine
// actually recurs on. Monthly/yearly are omitted because the engine treats them as
// a single one-off occurrence.
export const RECURRING_OPTIONS: { value: CategoryBlitzRecurringType; label: string; hint: string }[] = [
  { value: "none", label: "Just once", hint: "Runs one time at the start you picked." },
  { value: "daily", label: "Every day", hint: "Runs every day at this time." },
  { value: "weekly", label: "Every week on…", hint: "Runs every selected day at this time." },
];

export type GameTypeOption = {
  value: OwnerScheduleGameType;
  label: string;
  glyph: string;
  gradient: string;
  supported: boolean;
};

const ALL_GAME_TYPE_OPTIONS: GameTypeOption[] = [
  { value: "category_blitz", label: "Category Blitz", glyph: "🔤", gradient: "bg-ht-game-blitz", supported: true },
  { value: "live_trivia", label: "Live Trivia", glyph: "🧠", gradient: "bg-ht-game-live", supported: true },
];

/**
 * Category Blitz now defaults to an always-on continuous loop rather than a
 * scheduled window (see docs/CATEGORY_BLITZ_CONTINUOUS_DEFAULT_PLAN.md), so once
 * that rollout flag is on it's dropped from the schedulable game types — there is
 * no "number of rounds" to ask for. Flag off keeps the legacy picker, for rollback
 * safety. Takes the flag as an argument so callers read it once, at module load.
 */
export const scheduleGameOptions = (continuousDefault: boolean): GameTypeOption[] =>
  continuousDefault ? ALL_GAME_TYPE_OPTIONS.filter((option) => option.value !== "category_blitz") : ALL_GAME_TYPE_OPTIONS;

export const supportsRecurrence = (gameType: OwnerScheduleGameType): boolean => gameType === "live_trivia";

// ─── Steps ──────────────────────────────────────────────────────────────────

export const SCHEDULE_FLOW_STEPS = ["game", "when", "repeat", "review"] as const;
export type ScheduleFlowStep = (typeof SCHEDULE_FLOW_STEPS)[number];

/** Screens outside the linear flow: the full upcoming list, past games, one game's edit/cancel screen. */
export const SCHEDULE_EXTRA_STEPS = ["all", "history", "detail"] as const;
export type ScheduleExtraStep = (typeof SCHEDULE_EXTRA_STEPS)[number];

export type ScheduleSheetStep = ScheduleFlowStep | ScheduleExtraStep;

/**
 * Left-to-right order SlideSteps uses to pick a slide direction. Every screen
 * needs a rank: an unranked step always counts as "forward", which would slide
 * detail ← review the wrong way. Reads: hub (all) → one game (detail) → the
 * create/edit steps → history at the far end.
 */
export const SCHEDULE_SLIDE_ORDER: readonly ScheduleSheetStep[] = [
  "all",
  "detail",
  "game",
  "when",
  "repeat",
  "review",
  "history",
];

/**
 * The linear steps for this game, after the skip rules:
 *  - Game is skipped when only one game can be scheduled (true today, while the
 *    continuous-default flag hides Category Blitz) and always when editing (the
 *    game type of an existing schedule can't change).
 *  - Repeat is skipped for any game that can't recur (everything but Live Trivia).
 */
export const scheduleSteps = ({
  gameOptions,
  gameType,
  isEditing = false,
}: {
  gameOptions: readonly Pick<GameTypeOption, "supported">[];
  gameType: OwnerScheduleGameType;
  isEditing?: boolean;
}): ScheduleFlowStep[] =>
  SCHEDULE_FLOW_STEPS.filter((step) => {
    if (step === "game") return !isEditing && gameOptions.filter((option) => option.supported).length > 1;
    if (step === "repeat") return supportsRecurrence(gameType);
    return true;
  });

/**
 * Which screen to show for the raw `?step=`. Anything unknown or skipped lands
 * on the first flow step; a screen whose data isn't there (a reload lost the
 * tapped game, or the start time) falls back to the nearest screen that works.
 */
export const resolveScheduleStep = ({
  rawStep,
  steps,
  hasSchedule,
  hasStartTime,
}: {
  rawStep: string | null | undefined;
  steps: readonly ScheduleFlowStep[];
  hasSchedule: boolean;
  hasStartTime: boolean;
}): ScheduleSheetStep => {
  const resolved: ScheduleSheetStep = resolveStep<ScheduleSheetStep>(rawStep, steps, SCHEDULE_EXTRA_STEPS) ?? "when";
  if (resolved === "detail" && !hasSchedule) return "all";
  if ((resolved === "repeat" || resolved === "review") && !hasStartTime) return "when";
  return resolved;
};

// ─── Form state ─────────────────────────────────────────────────────────────

export type ScheduleFormState = {
  gameType: OwnerScheduleGameType;
  /** null = the partner hasn't typed a title, so the game's name is used. */
  title: string | null;
  /** A `datetime-local` value, in `timezone`. */
  startTime: string;
  rounds: number;
  timezone: string;
  recurringType: CategoryBlitzRecurringType;
  recurringDays: string[];
};

export const initialScheduleFormState = ({
  gameOptions,
  browserTimeZone,
}: {
  gameOptions: readonly GameTypeOption[];
  browserTimeZone?: string | null;
}): ScheduleFormState => ({
  gameType: gameOptions[0]?.value ?? "live_trivia",
  title: null,
  startTime: "",
  rounds: 3,
  timezone: pickDefaultTimezone(browserTimeZone),
  recurringType: "none",
  recurringDays: [],
});

export const scheduleFormStateFromSchedule = (schedule: OwnerSchedule): ScheduleFormState => ({
  gameType: schedule.gameType,
  title: schedule.title,
  startTime: utcIsoToDatetimeLocalValue(schedule.startTime, schedule.timezone),
  rounds: roundsFromWindowMinutesFor(schedule.gameType, schedule.windowMinutes),
  timezone: schedule.timezone,
  recurringType: schedule.recurringType ?? "none",
  recurringDays: schedule.recurringDays ?? [],
});

export const safeRounds = (rounds: number): number => Math.max(1, Math.floor(rounds) || 1);

/** The title that will be saved: what was typed, else the game's name — so it can never block saving. */
export const effectiveTitle = (form: Pick<ScheduleFormState, "title" | "gameType">): string =>
  (form.title ?? "").trim() || GAME_LABELS[form.gameType];

/** "Just once" / "Every day" / "Every week on Fri, Sat" — what the Review screen shows for Repeat. */
export const repeatSummary = (form: Pick<ScheduleFormState, "gameType" | "recurringType" | "recurringDays">): string => {
  if (!supportsRecurrence(form.gameType) || form.recurringType === "none") return "Just once";
  if (form.recurringType === "daily") return "Every day";
  const days = WEEKDAY_OPTIONS.filter((day) => form.recurringDays.includes(day.key)).map((day) => day.label);
  return days.length > 0 ? `Every week on ${days.join(", ")}` : "Every week";
};

export const toggleDay = (days: readonly string[], key: string): string[] =>
  days.includes(key) ? days.filter((day) => day !== key) : [...days, key];

// ─── Time display ───────────────────────────────────────────────────────────

/** The end as a `datetime-local` value in `timezone`, or null while no start is picked. */
export const endsAtLocalValue = (startTime: string, timezone: string, durationMinutes: number): string | null => {
  if (!startTime) return null;
  try {
    const startMs = Date.parse(datetimeLocalValueToUtcIso(startTime, timezone));
    const endIso = new Date(startMs + durationMinutes * 60_000).toISOString();
    return utcIsoToDatetimeLocalValue(endIso, timezone);
  } catch {
    return null;
  }
};

/** `YYYY-MM-DD · HH:mm` in `timezone` for a start + duration, or null while no start is picked. */
export const endsAtLocalLabel = (startTime: string, timezone: string, durationMinutes: number): string | null =>
  endsAtLocalValue(startTime, timezone, durationMinutes)?.replace("T", " · ") ?? null;

/**
 * "Fri, Oct 3 · 8:00 PM" for a `datetime-local` value (`YYYY-MM-DDTHH:mm`), read
 * as wall-clock time — no timezone conversion, since the value already is local
 * to the schedule's timezone. Falls back to the raw value if it doesn't parse.
 */
export const formatLocalDateTime = (value: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return value;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (Number.isNaN(date.getTime())) return value;
  const datePart = date.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
  const timePart = date.toLocaleTimeString("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit", hour12: true });
  return `${datePart} · ${timePart}`;
};

// ─── Request ────────────────────────────────────────────────────────────────

export type ScheduleCreateBody = {
  venueId: string;
  title: string;
  startTime: string;
  endTime: string;
  timezone: string;
  gameType: OwnerScheduleGameType;
  rounds: number;
  recurringType: CategoryBlitzRecurringType;
  recurringDays: string[];
};

/** PATCH body: an existing schedule's venue and game type never change. */
export type ScheduleUpdateBody = Omit<ScheduleCreateBody, "venueId" | "gameType">;

export type ScheduleRequest =
  | { ok: true; method: "POST"; url: string; body: ScheduleCreateBody; startIso: string }
  | { ok: true; method: "PATCH"; url: string; body: ScheduleUpdateBody; startIso: string }
  | { ok: false; error: string };

export const WEEKLY_DAYS_REQUIRED_MESSAGE = "Select at least one day for weekly recurring schedules.";
export const START_TIME_REQUIRED_MESSAGE = "Pick a start date and time.";

/** The validation the Repeat step blocks on (also re-checked when building the request). */
export const repeatError = (form: Pick<ScheduleFormState, "gameType" | "recurringType" | "recurringDays">): string | null =>
  supportsRecurrence(form.gameType) && form.recurringType === "weekly" && form.recurringDays.length === 0
    ? WEEKLY_DAYS_REQUIRED_MESSAGE
    : null;

/**
 * The POST (new) or PATCH (`editingId` set) the old form's handleSave sent for the
 * same inputs. Recurrence only applies to Live Trivia; anything else is one-off.
 */
export const buildScheduleRequest = ({
  venueId,
  editingId,
  form,
}: {
  venueId: string;
  editingId: string | null;
  form: ScheduleFormState;
}): ScheduleRequest => {
  if (!form.startTime) return { ok: false, error: START_TIME_REQUIRED_MESSAGE };
  const recurrenceProblem = repeatError(form);
  if (recurrenceProblem) return { ok: false, error: recurrenceProblem };

  const recurs = supportsRecurrence(form.gameType);
  const recurringType: CategoryBlitzRecurringType = recurs ? form.recurringType : "none";
  const recurringDays = recurs && form.recurringType === "weekly" ? form.recurringDays : [];
  const rounds = safeRounds(form.rounds);
  const title = effectiveTitle(form);

  try {
    const startIso = datetimeLocalValueToUtcIso(form.startTime, form.timezone);
    const endIso = new Date(Date.parse(startIso) + durationMinutesFor(form.gameType, rounds) * 60_000).toISOString();
    const endTime = utcIsoToDatetimeLocalValue(endIso, form.timezone);

    if (editingId) {
      return {
        ok: true,
        method: "PATCH",
        url: `/api/owner/schedule/${editingId}`,
        startIso,
        body: { title, startTime: form.startTime, endTime, timezone: form.timezone, rounds, recurringType, recurringDays },
      };
    }
    return {
      ok: true,
      method: "POST",
      url: "/api/owner/schedule",
      startIso,
      body: {
        venueId,
        title,
        startTime: form.startTime,
        endTime,
        timezone: form.timezone,
        gameType: form.gameType,
        rounds,
        recurringType,
        recurringDays,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't save that game." };
  }
};
