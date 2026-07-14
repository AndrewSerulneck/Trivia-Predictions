import "server-only";

import { abandonVenueAutoSession } from "@/lib/categoryBlitz";
import {
  createSchedule,
  deleteSchedule,
  getSchedule,
  listSchedules,
} from "@/lib/categoryBlitzSchedules";
import {
  createAdminLiveShowdownSchedule,
  deleteAdminLiveShowdownSchedule,
  listAdminLiveShowdownSchedules,
  type AdminLiveShowdownSchedule,
} from "@/lib/liveShowdownAdmin";
import { utcIsoToDatetimeLocalValue } from "@/lib/categoryBlitzScheduleTime";
import { liveTriviaDurationMinutes } from "@/lib/liveTriviaShared";
import type { OwnerAuthContext } from "@/lib/requireOwnerAuth";
import type { CategoryBlitzRecurringType, OwnerSchedule, OwnerScheduleGameType } from "@/types";

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
};

/**
 * Create a schedule on behalf of an owner. Assumes the caller has already
 * verified venue ownership. Enforces the plan's guardrail — no overlapping
 * schedules for the same venue, checked across BOTH game engines so a venue can
 * never double-book the same window (Live Trivia at 8pm is rejected if Category
 * Blitz already owns 8pm, and vice-versa). Throws
 * OWNER_SCHEDULE_UNSUPPORTED_GAME_MESSAGE for a known-but-unsupported game type
 * and OWNER_SCHEDULE_OVERLAP_MESSAGE on a time collision.
 */
export async function createOwnerSchedule(
  params: CreateOwnerScheduleParams,
): Promise<OwnerSchedule> {
  const { venueId, title, startTimeIso, endTimeIso, timezone, gameType, rounds } = params;

  if (!isSupportedGameType(gameType)) {
    throw new Error(OWNER_SCHEDULE_UNSUPPORTED_GAME_MESSAGE);
  }

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
  // this venue, ACROSS BOTH ENGINES. Owner-created schedules are one-off ("none"
  // recurring), so an absolute start/end range comparison is the right check.
  const existing = await listOwnerSchedules(venueId);
  const collides = existing.some((s) =>
    rangesOverlap(startTimeIso, endTimeIso, s.startTime, s.endTime),
  );
  if (collides) {
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
