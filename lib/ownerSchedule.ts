import "server-only";

import { abandonVenueAutoSession } from "@/lib/categoryBlitz";
import {
  createSchedule,
  deleteSchedule,
  getSchedule,
  listSchedules,
  updateSchedule,
} from "@/lib/categoryBlitzSchedules";
import {
  createAdminLiveShowdownSchedule,
  deleteAdminLiveShowdownSchedule,
  listAdminLiveShowdownSchedules,
  updateAdminLiveShowdownSchedule,
  type AdminLiveShowdownSchedule,
} from "@/lib/liveShowdownAdmin";
import {
  listScheduleWindowOccurrences,
  utcIsoToDatetimeLocalValue,
  type CategoryBlitzWindowOccurrence,
} from "@/lib/categoryBlitzScheduleTime";
import { liveTriviaDurationMinutes } from "@/lib/liveTriviaShared";
import type { OwnerAuthContext } from "@/lib/requireOwnerAuth";
import type { CategoryBlitzRecurringType, OwnerSchedule, OwnerScheduleGameType } from "@/types";

/** The timing subset `listScheduleWindowOccurrences` needs — satisfied by OwnerSchedule and by the create/update candidate objects. */
type ScheduleTiming = Pick<
  OwnerSchedule,
  "startTime" | "endTime" | "timezone" | "recurringType" | "recurringDays" | "windowMinutes"
>;

// ── Game-type contract ────────────────────────────────────────────────────────
// The owner scheduling surface is game-type-agnostic so the UI is future-proof.
// KNOWN types are valid on the wire; SUPPORTED types can actually be scheduled
// today. As of Phase 4b BOTH live games are supported — Category Blitz and Live
// Trivia — each backed by its own engine (category_blitz_schedules vs.
// trivia_schedules) but merged into one owner-facing calendar here.
export const KNOWN_OWNER_SCHEDULE_GAME_TYPES: readonly OwnerScheduleGameType[] = [
  "category_blitz",
  "live_trivia",
];
export const SUPPORTED_OWNER_SCHEDULE_GAME_TYPES: readonly OwnerScheduleGameType[] = [
  "category_blitz",
  "live_trivia",
];

export const DEFAULT_OWNER_SCHEDULE_GAME_TYPE: OwnerScheduleGameType = "category_blitz";

// Live Trivia admin schedules are read across ALL venues then filtered here; cap
// the fetch generously (owner venues won't have hundreds of upcoming schedules).
const LIVE_TRIVIA_LIST_LIMIT = 200;

// Sentinel messages the route layer maps to specific HTTP statuses (mirrors the
// `isValidationError` pattern in the admin schedule routes).
export const OWNER_SCHEDULE_OVERLAP_MESSAGE =
  "That time overlaps another scheduled game for this venue. Pick a different time.";
export const OWNER_SCHEDULE_UNSUPPORTED_GAME_MESSAGE =
  "That game can't be scheduled yet — it's coming soon.";
export const OWNER_SCHEDULE_WEEKLY_DAYS_REQUIRED_MESSAGE =
  "Select at least one day for weekly recurring schedules.";
export const OWNER_SCHEDULE_INVALID_RECURRENCE_MESSAGE =
  "Recurrence must be none, daily, or weekly.";

const OWNER_WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * Validate + normalize an owner recurrence request. Recurrence is a Live Trivia
 * ONLY feature — Category Blitz owner schedules are always one-off (it's moving
 * to always-on continuous mode), so any recurrence on a non–Live-Trivia game is
 * coerced to "none". Weekly requires at least one weekday. Throws the tagged
 * validation messages (mapped to 400 by the route layer) on invalid input.
 */
export function normalizeOwnerRecurrence(
  gameType: OwnerScheduleGameType,
  recurringTypeRaw: string | undefined,
  recurringDaysRaw: string[] | undefined,
): { recurringType: CategoryBlitzRecurringType; recurringDays: string[] } {
  if (gameType !== "live_trivia") {
    return { recurringType: "none", recurringDays: [] };
  }
  const type = String(recurringTypeRaw ?? "none").trim().toLowerCase();
  if (type !== "none" && type !== "daily" && type !== "weekly") {
    throw new Error(OWNER_SCHEDULE_INVALID_RECURRENCE_MESSAGE);
  }
  if (type !== "weekly") {
    return { recurringType: type, recurringDays: [] };
  }
  const recurringDays = Array.from(
    new Set(
      (Array.isArray(recurringDaysRaw) ? recurringDaysRaw : [])
        .map((day) => String(day ?? "").trim().toLowerCase())
        .filter((day) => (OWNER_WEEKDAY_KEYS as readonly string[]).includes(day)),
    ),
  );
  if (recurringDays.length === 0) {
    throw new Error(OWNER_SCHEDULE_WEEKLY_DAYS_REQUIRED_MESSAGE);
  }
  return { recurringType: "weekly", recurringDays };
}

export function isKnownGameType(value: string): value is OwnerScheduleGameType {
  return (KNOWN_OWNER_SCHEDULE_GAME_TYPES as readonly string[]).includes(value);
}

export function isSupportedGameType(value: string): value is OwnerScheduleGameType {
  return (SUPPORTED_OWNER_SCHEDULE_GAME_TYPES as readonly string[]).includes(value);
}

/** Whether this owner may act on the given venue. */
export function ownsVenue(auth: OwnerAuthContext, venueId: string): boolean {
  return auth.venueIds.includes(venueId);
}

/**
 * True when the half-open intervals [aStart, aEnd) and [bStart, bEnd) intersect.
 * Half-open so back-to-back games (one ends exactly as the next starts) do NOT
 * count as overlapping. Non-finite inputs never overlap.
 */
export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  const aS = Date.parse(aStart);
  const aE = Date.parse(aEnd);
  const bS = Date.parse(bStart);
  const bE = Date.parse(bEnd);
  if (![aS, aE, bS, bE].every(Number.isFinite)) return false;
  return aS < bE && bS < aE;
}

/** Half-open overlap of two concrete occurrence windows (Date objects). */
function occurrencesOverlap(
  a: CategoryBlitzWindowOccurrence,
  b: CategoryBlitzWindowOccurrence,
): boolean {
  return a.windowStart.getTime() < b.windowEnd.getTime() && b.windowStart.getTime() < a.windowEnd.getTime();
}

/**
 * True when two schedules ever collide, accounting for recurrence. Both `daily`
 * and `weekly` patterns are periodic with a 7-day period at a fixed time of day,
 * so any real collision surfaces within the ~3-week (−7..+14 day) window that
 * `listScheduleWindowOccurrences` enumerates around a given anchor. We anchor
 * that enumeration at several reference points — `now`, plus each schedule's own
 * base start — so a far-future one-off vs. a long-running weekly series is still
 * compared in the right region (a one-off always yields its single fixed
 * occurrence regardless of anchor; a recurring schedule yields the occurrences
 * near whichever anchor lands inside its active range).
 */
function schedulesCollide(candidate: ScheduleTiming, existing: ScheduleTiming): boolean {
  const anchors: Date[] = [new Date()];
  const candBase = Date.parse(candidate.startTime);
  const exBase = Date.parse(existing.startTime);
  if (Number.isFinite(candBase)) anchors.push(new Date(candBase));
  if (Number.isFinite(exBase)) anchors.push(new Date(exBase));

  for (const anchor of anchors) {
    const candOccurrences = listScheduleWindowOccurrences(candidate, anchor);
    const exOccurrences = listScheduleWindowOccurrences(existing, anchor);
    for (const c of candOccurrences) {
      for (const e of exOccurrences) {
        if (occurrencesOverlap(c, e)) return true;
      }
    }
  }
  return false;
}

// ── Live Trivia adapter ───────────────────────────────────────────────────────
// The Live Trivia ("Live Showdown") engine stores schedules with a start time +
// round count and derives the end from rounds; it has no stored end column. We
// project each admin schedule row into the shared OwnerSchedule shape (which is
// CategoryBlitzSchedule + gameType) so both game types render from one list and
// feed one overlap guard. recurringType is coerced to the CB-compatible set —
// owner-created Live Trivia is always one-off ("none"); admin rows that happen to
// be monthly/yearly collapse to "none" for display only (owners can't edit them).

function coerceRecurringType(value: string): CategoryBlitzRecurringType {
  return value === "daily" || value === "weekly" ? value : "none";
}

function adminLiveScheduleToOwnerSchedule(row: AdminLiveShowdownSchedule): OwnerSchedule {
  const windowMinutes = liveTriviaDurationMinutes(row.numRounds);
  const startMs = Date.parse(row.startTime);
  const endTime = Number.isFinite(startMs)
    ? new Date(startMs + windowMinutes * 60_000).toISOString()
    : row.startTime;

  return {
    id: row.id,
    venueId: row.venueId ?? "",
    title: row.title,
    startTime: row.startTime,
    endTime,
    timezone: row.timezone,
    recurringType: coerceRecurringType(row.recurringType),
    recurringDays: row.recurringDays,
    windowMinutes,
    isActive: true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    gameType: "live_trivia",
  };
}

/** All active Live Trivia schedules for one venue, projected onto OwnerSchedule. */
async function listOwnerLiveTriviaSchedules(venueId: string): Promise<OwnerSchedule[]> {
  const all = await listAdminLiveShowdownSchedules(LIVE_TRIVIA_LIST_LIMIT);
  return all
    .filter((row) => row.venueId === venueId)
    .map(adminLiveScheduleToOwnerSchedule);
}

/** All active Category Blitz schedules for one venue, tagged with game type. */
async function listOwnerCategoryBlitzSchedules(venueId: string): Promise<OwnerSchedule[]> {
  const schedules = await listSchedules(venueId);
  return schedules.map((schedule) => ({ ...schedule, gameType: "category_blitz" as const }));
}

/**
 * List a venue's active schedules for the owner surface, tagged with game type.
 * With no `gameType` filter this MERGES both engines (Category Blitz + Live
 * Trivia) into one time-ordered calendar — the dashboard shows the venue's whole
 * live-game schedule in one place. Pass a specific gameType to scope to one
 * engine.
 */
export async function listOwnerSchedules(
  venueId: string,
  gameType?: OwnerScheduleGameType,
): Promise<OwnerSchedule[]> {
  const wantCategoryBlitz = !gameType || gameType === "category_blitz";
  const wantLiveTrivia = !gameType || gameType === "live_trivia";

  const groups = await Promise.all([
    wantCategoryBlitz ? listOwnerCategoryBlitzSchedules(venueId) : Promise.resolve([]),
    wantLiveTrivia ? listOwnerLiveTriviaSchedules(venueId) : Promise.resolve([]),
  ]);

  return groups
    .flat()
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
}

/**
 * Look up a single schedule for the owner surface across BOTH engines (used to
 * enforce ownership before delete). Category Blitz has a direct by-id lookup;
 * Live Trivia has no single-row getter, so we resolve it from the venue-agnostic
 * admin list. Returns null when the id isn't found in either store.
 */
export async function getOwnerSchedule(
  scheduleId: string,
): Promise<OwnerSchedule | null> {
  const categoryBlitz = await getSchedule(scheduleId);
  if (categoryBlitz) {
    return { ...categoryBlitz, gameType: "category_blitz" };
  }

  const liveTrivia = (await listAdminLiveShowdownSchedules(LIVE_TRIVIA_LIST_LIMIT)).find(
    (row) => row.id === scheduleId,
  );
  return liveTrivia ? adminLiveScheduleToOwnerSchedule(liveTrivia) : null;
}

export type CreateOwnerScheduleParams = {
  venueId: string;
  title: string;
  /** Absolute UTC ISO — already converted from the venue-local datetime-local value. */
  startTimeIso: string;
  endTimeIso: string;
  timezone: string;
  gameType: OwnerScheduleGameType;
  /** Live Trivia only: number of rounds (duration derives from this). Ignored for Category Blitz. */
  rounds?: number;
  /** Live Trivia only recurrence (none|daily|weekly). Coerced to "none" for other games. */
  recurringType?: string;
  /** Weekday keys (sun..sat) for weekly recurrence. */
  recurringDays?: string[];
};

/**
 * Create a schedule on behalf of an owner. Assumes the caller has already
 * verified venue ownership. Enforces the plan's guardrail — no overlapping
 * schedules for the same venue, checked across BOTH game engines so a venue can
 * never double-book the same window (Live Trivia at 8pm is rejected if Category
 * Blitz already owns 8pm, and vice-versa). The overlap check is recurrence-aware
 * (see `schedulesCollide`). Throws OWNER_SCHEDULE_UNSUPPORTED_GAME_MESSAGE for a
 * known-but-unsupported game type, the recurrence validation messages for bad
 * recurrence input, and OWNER_SCHEDULE_OVERLAP_MESSAGE on a time collision.
 */
export async function createOwnerSchedule(
  params: CreateOwnerScheduleParams,
): Promise<OwnerSchedule> {
  const { venueId, title, startTimeIso, endTimeIso, timezone, gameType, rounds } = params;

  if (!isSupportedGameType(gameType)) {
    throw new Error(OWNER_SCHEDULE_UNSUPPORTED_GAME_MESSAGE);
  }

  const { recurringType, recurringDays } = normalizeOwnerRecurrence(
    gameType,
    params.recurringType,
    params.recurringDays,
  );

  // Validate the window here rather than relying on the engine, so the boundary
  // is self-contained (the message matches the admin route's validation set).
  const startMs = Date.parse(startTimeIso);
  const endMs = Date.parse(endTimeIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error("A valid start and end date/time are required.");
  }
  if (endMs <= startMs) {
    throw new Error("End date/time must be after the start date/time.");
  }

  // Guardrail: reject a window that overlaps any existing active schedule for
  // this venue, ACROSS BOTH ENGINES. The check is recurrence-aware, so a weekly
  // series is compared occurrence-by-occurrence rather than by its first window.
  const candidate: ScheduleTiming = {
    startTime: startTimeIso,
    endTime: endTimeIso,
    timezone,
    recurringType,
    recurringDays,
    windowMinutes: (endMs - startMs) / 60_000,
  };
  const existing = await listOwnerSchedules(venueId);
  if (existing.some((s) => schedulesCollide(candidate, s))) {
    throw new Error(OWNER_SCHEDULE_OVERLAP_MESSAGE);
  }

  if (gameType === "live_trivia") {
    // The Live Trivia engine takes venue-local targetDate + startTime + rounds,
    // not absolute ISO. Convert the UTC start back to the venue-local wall clock
    // and split it; the engine re-derives the same UTC instant and seeds the
    // question matrix exactly as an admin-created schedule would.
    const local = utcIsoToDatetimeLocalValue(startTimeIso, timezone); // "YYYY-MM-DDTHH:MM"
    const [targetDate, startClock] = local.split("T");
    const created = await createAdminLiveShowdownSchedule({
      title,
      targetDate,
      startTime: startClock,
      timezone,
      recurringType,
      recurringDays,
      numRounds: Math.max(1, Math.floor(Number(rounds)) || 1),
      venueId,
    });
    return adminLiveScheduleToOwnerSchedule(created);
  }

  const schedule = await createSchedule({
    venueId,
    title,
    startTime: startTimeIso,
    endTime: endTimeIso,
    timezone,
  });
  return { ...schedule, gameType: "category_blitz" };
}

export type UpdateOwnerScheduleParams = {
  id: string;
  venueId: string;
  title: string;
  startTimeIso: string;
  endTimeIso: string;
  timezone: string;
  /** Fixed by the caller from the existing row — an owner can't switch a schedule's engine mid-edit. */
  gameType: OwnerScheduleGameType;
  /** Live Trivia only: number of rounds (duration derives from this). Ignored for Category Blitz. */
  rounds?: number;
  /** Live Trivia only recurrence (none|daily|weekly). Coerced to "none" for other games. */
  recurringType?: string;
  /** Weekday keys (sun..sat) for weekly recurrence. */
  recurringDays?: string[];
};

/**
 * Update a schedule on behalf of an owner. Assumes the caller has already
 * verified venue ownership and resolved `gameType` from the existing row (never
 * from client input). Re-checks the recurrence-aware no-overlap guardrail across
 * both engines, excluding the schedule being edited from the collision set. This
 * surface edits title/date/time/timezone/rounds and (Live Trivia only)
 * recurrence; the whole series is edited at once — occurrences are computed
 * on-the-fly from this single row, so there is no per-occurrence edit. Per-
 * schedule ad settings are read from the current row and passed through.
 */
export async function updateOwnerSchedule(
  params: UpdateOwnerScheduleParams,
): Promise<OwnerSchedule> {
  const { id, venueId, title, startTimeIso, endTimeIso, timezone, gameType, rounds } = params;

  if (!isSupportedGameType(gameType)) {
    throw new Error(OWNER_SCHEDULE_UNSUPPORTED_GAME_MESSAGE);
  }

  const { recurringType, recurringDays } = normalizeOwnerRecurrence(
    gameType,
    params.recurringType,
    params.recurringDays,
  );

  const startMs = Date.parse(startTimeIso);
  const endMs = Date.parse(endTimeIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error("A valid start and end date/time are required.");
  }
  if (endMs <= startMs) {
    throw new Error("End date/time must be after the start date/time.");
  }

  const candidate: ScheduleTiming = {
    startTime: startTimeIso,
    endTime: endTimeIso,
    timezone,
    recurringType,
    recurringDays,
    windowMinutes: (endMs - startMs) / 60_000,
  };
  const existing = await listOwnerSchedules(venueId);
  if (existing.some((s) => s.id !== id && schedulesCollide(candidate, s))) {
    throw new Error(OWNER_SCHEDULE_OVERLAP_MESSAGE);
  }

  if (gameType === "live_trivia") {
    const current = (await listAdminLiveShowdownSchedules(LIVE_TRIVIA_LIST_LIMIT)).find(
      (row) => row.id === id,
    );
    if (!current) throw new Error("Schedule not found.");

    const local = utcIsoToDatetimeLocalValue(startTimeIso, timezone); // "YYYY-MM-DDTHH:MM"
    const [targetDate, startClock] = local.split("T");
    const updated = await updateAdminLiveShowdownSchedule({
      id,
      title,
      targetDate,
      startTime: startClock,
      timezone,
      recurringType,
      recurringDays,
      numRounds: Math.max(1, Math.floor(Number(rounds)) || 1),
      venueId,
      intermissionAdDelaySeconds: current.intermissionAdDelaySeconds,
      lobbyAdEnabled: current.lobbyAdEnabled,
    });
    return adminLiveScheduleToOwnerSchedule(updated);
  }

  const current = await getSchedule(id);
  if (!current) throw new Error("Schedule not found.");

  const schedule = await updateSchedule(id, {
    title,
    startTime: startTimeIso,
    endTime: endTimeIso,
    timezone,
    recurringType: current.recurringType,
    recurringDays: current.recurringDays,
  });
  return { ...schedule, gameType: "category_blitz" };
}

/**
 * Delete a schedule on behalf of an owner, routing to the right engine by game
 * type. Assumes the caller has already resolved the schedule and verified venue
 * ownership. Category Blitz additionally drops any running auto session back to
 * the lobby (abandon, not graceful end — mirrors the admin DELETE); Live Trivia's
 * own delete already tears down its session questions/answers and broadcasts a
 * schedule_updated to the venue lobby, so no extra session handling is needed.
 */
export async function deleteOwnerSchedule(schedule: OwnerSchedule): Promise<void> {
  if (schedule.gameType === "live_trivia") {
    await deleteAdminLiveShowdownSchedule(schedule.id);
    return;
  }

  const venueId = await deleteSchedule(schedule.id);
  if (venueId) {
    await abandonVenueAutoSession(venueId);
  }
}
