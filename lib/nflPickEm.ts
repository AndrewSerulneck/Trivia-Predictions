import "server-only";

import fs from "node:fs";
import path from "node:path";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchBallDontLieList } from "@/lib/balldontlie";
import { getLocalDateKey, getEasternDayOfWeek } from "@/lib/timezone";
import { type PickEmPick, type PickEmGame } from "@/lib/pickem";
import { getVenueNFLPickEmScoringMode, type NFLPickEmScoringMode } from "@/lib/venueGameSettings";

// DEV-ONLY TEST DATA SEED: when scripts/seed-nfl-pickem-test-data.cjs has
// created this flag file, fetchNFLGamesFromBDL returns fake games instead of
// calling the real balldontlie API. Remove via scripts/unseed-nfl-pickem-test-data.cjs
// (deletes the flag file), which also removes this whole block's dependency.
const NFL_PICKEM_TEST_DATA_FLAG = path.join(process.cwd(), ".nfl-pickem-test-data");

function isNFLPickEmTestDataEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  try {
    return fs.existsSync(NFL_PICKEM_TEST_DATA_FLAG);
  } catch {
    return false;
  }
}

const MOCK_NFL_MATCHUPS: Array<{ home: string; away: string; homeId: string; awayId: string }> = [
  { home: "Kansas City Chiefs", away: "Baltimore Ravens", homeId: "mock-kc", awayId: "mock-bal" },
  { home: "San Francisco 49ers", away: "Dallas Cowboys", homeId: "mock-sf", awayId: "mock-dal" },
  { home: "Buffalo Bills", away: "Miami Dolphins", homeId: "mock-buf", awayId: "mock-mia" },
  { home: "Philadelphia Eagles", away: "New York Giants", homeId: "mock-phi", awayId: "mock-nyg" },
  { home: "Detroit Lions", away: "Green Bay Packers", homeId: "mock-det", awayId: "mock-gb" },
  { home: "Cincinnati Bengals", away: "Cleveland Browns", homeId: "mock-cin", awayId: "mock-cle" },
  { home: "Seattle Seahawks", away: "Los Angeles Rams", homeId: "mock-sea", awayId: "mock-lar" },
  { home: "Houston Texans", away: "Jacksonville Jaguars", homeId: "mock-hou", awayId: "mock-jax" },
  { home: "Minnesota Vikings", away: "Chicago Bears", homeId: "mock-min", awayId: "mock-chi" },
  { home: "New Orleans Saints", away: "Tampa Bay Buccaneers", homeId: "mock-no", awayId: "mock-tb" },
  { home: "Los Angeles Chargers", away: "Denver Broncos", homeId: "mock-lac", awayId: "mock-den" },
  { home: "Pittsburgh Steelers", away: "New York Jets", homeId: "mock-pit", awayId: "mock-nyj" },
  { home: "Indianapolis Colts", away: "Tennessee Titans", homeId: "mock-ind", awayId: "mock-ten" },
  { home: "Arizona Cardinals", away: "Atlanta Falcons", homeId: "mock-ari", awayId: "mock-atl" },
];

// Deterministic, varied final score per matchup index (13-34 range, home and
// away alternate winning) so seeded weeks don't all show the same 24-17.
function mockFinalScore(index: number): { home: number; away: number } {
  const home = 13 + ((index * 7) % 22);
  let away = 10 + ((index * 13) % 25);
  if (away === home) away += 3;
  return { home, away };
}

function setUtcHm(base: Date, hours: number, minutes: number): Date {
  const d = new Date(base);
  d.setUTCHours(hours, minutes, 0, 0);
  return d;
}

// Realistic Thursday/Sunday/Monday kickoff slots anchored to the week's own
// Thursday. Used for weeks that are unambiguously all-past or all-future.
function buildCalendarKickoffs(weekStart: Date): Date[] {
  const thursday = new Date(weekStart);
  const sunday = new Date(weekStart);
  sunday.setUTCDate(sunday.getUTCDate() + 3);
  const monday = new Date(weekStart);
  monday.setUTCDate(monday.getUTCDate() + 4);

  return [
    setUtcHm(thursday, 20, 20),
    setUtcHm(sunday, 13, 0),
    setUtcHm(sunday, 13, 0),
    setUtcHm(sunday, 13, 0),
    setUtcHm(sunday, 13, 0),
    setUtcHm(sunday, 16, 5),
    setUtcHm(sunday, 16, 5),
    setUtcHm(sunday, 16, 25),
    setUtcHm(sunday, 16, 25),
    setUtcHm(sunday, 16, 25),
    setUtcHm(sunday, 20, 20),
    setUtcHm(sunday, 20, 20),
    setUtcHm(monday, 20, 15),
    setUtcHm(monday, 20, 15),
  ];
}

// Kickoffs anchored directly to "now" instead of the week's calendar bounds:
// 2 already kicked off, the rest spread over the following days. This is what
// guarantees a locked/open mix for the "current" test week even when it's
// seeded on a Tue/Wed, i.e. outside any real Thursday-Monday window (the NFL
// week never spans a Tue/Wed, so "now" can't fall inside a calendar window on
// those days — see docs/nfl-pickem-phase0.md).
function buildCurrentWeekKickoffs(now: number): Date[] {
  const hoursFromNow = (h: number) => new Date(now + h * 60 * 60 * 1000);
  return [
    hoursFromNow(-5),
    hoursFromNow(-2),
    hoursFromNow(2),
    hoursFromNow(5),
    hoursFromNow(9),
    hoursFromNow(24),
    hoursFromNow(27),
    hoursFromNow(30),
    hoursFromNow(48),
    hoursFromNow(51),
    hoursFromNow(72),
    hoursFromNow(75),
    hoursFromNow(96),
    hoursFromNow(99),
  ];
}

// Week-aware mock game generator: past weeks come back fully "final" with
// varied scores; future weeks come back fully "scheduled"; a week whose
// calendar bounds are at most a few days from "now" (i.e. it's meant to be
// the current/in-progress week) always gets a guaranteed locked/open mix,
// anchored to "now" rather than the calendar so it holds regardless of which
// day of the week the caller runs on.
function generateMockNFLGames(
  fromDate: string,
  toDate: string
): Array<{
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  startsAt: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeam: string | null;
  status: string;
}> {
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDate}T23:59:59.999Z`);
  const now = Date.now();

  const nowWithinWeek = now >= from.getTime() && now <= to.getTime();
  const nearWeek =
    Math.abs(now - from.getTime()) <= 6 * 24 * 60 * 60 * 1000 ||
    Math.abs(now - to.getTime()) <= 6 * 24 * 60 * 60 * 1000;
  const treatAsCurrentWeek = nowWithinWeek || nearWeek;

  const kickoffs = treatAsCurrentWeek ? buildCurrentWeekKickoffs(now) : buildCalendarKickoffs(from);

  return MOCK_NFL_MATCHUPS.map((matchup, index) => {
    const startsAt = (kickoffs[index] ?? kickoffs[kickoffs.length - 1]).toISOString();
    const startsAtMs = Date.parse(startsAt);
    const isPast = startsAtMs < now;
    const score = mockFinalScore(index);
    return {
      id: `mock-${matchup.homeId}-${matchup.awayId}`,
      homeTeam: matchup.home,
      awayTeam: matchup.away,
      homeTeamId: matchup.homeId,
      awayTeamId: matchup.awayId,
      startsAt,
      homeScore: isPast ? score.home : null,
      awayScore: isPast ? score.away : null,
      winnerTeam: isPast ? (score.home > score.away ? matchup.home : matchup.away) : null,
      status: isPast ? "final" : "scheduled",
    };
  });
}

// ============================================
// CONSTANTS
// ============================================

const NFL_PICKEM_SPORT_KEY = "americanfootball_nfl";
const NFL_PICKEM_LEAGUE = "NFL";
// Exported so the NFL-only accrual sweep (lib/nflPickEmRewardAccrual.ts) keys off
// the same value that submitNFLPickEmPick writes, rather than re-hardcoding "nfl".
export const NFL_PICKEM_SPORT_SLUG = "nfl" as const;
/**
 * Every correct NFL pick is worth this many venue points — flat, no bonus tiers.
 * NOTE for reward accrual: challenge progress for an NFL reward counts CORRECT
 * PICKS, not these points (see lib/nflPickEmRewardAccrual.ts).
 */
export const PICKEM_REWARD_POINTS = 10;
const PICKEM_LOCK_GRACE_MS = 0;

// ============================================
// TYPES
// ============================================

export type NFLWeek = {
  id: string;
  season: number;
  weekNumber: number;
  weekType: "preseason" | "regular" | "postseason";
  displayLabel: string | null;
  weekStartDate: string; // YYYY-MM-DD (Thursday)
  weekEndDate: string;   // YYYY-MM-DD (Monday)
  thursdayKickoff: string | null; // ISO timestamp
  status: "upcoming" | "open" | "locked" | "complete";
  gamesCount: number;
  syncedAt: string | null;
};

export type NFLPickEmGame = PickEmGame & {
  nflWeekId: string;
  weekNumber: number;
  homeSpread?: number | null;
  awaySpread?: number | null;
  isThursdayGame: boolean;
  isSundayGame: boolean;
  isMondayGame: boolean;
  /** Eastern calendar date (`YYYY-MM-DD`) this game falls on — the grouping key. */
  dayGroupKey: string;
  /** Display heading for this game's day-section, e.g. "Thursday Night Football · Sept 10" or "Wednesday, Sept 9". */
  dayGroupLabel: string;
  /** True only when this game IS the lone Thursday-night primetime slot — drives the 🏈/amber section styling. Not derived from dayGroupLabel text so client styling can't silently drift from it. */
  isThursdayNightSection: boolean;
};

export type NFLPickEmGameLine = {
  gameId: string;
  startsAt: string;
  homeTeam: string;
  awayTeam: string;
  homeSpread: number;
  awaySpread: number;
  provider: string;
  fetchedAt: string | null;
  lockedAt: string | null;
};

export type NFLUserWeekSummary = {
  id: string;
  weekId: string;
  weekNumber: number;
  weekStartDate: string;
  weekEndDate: string;
  status: string;
  picksCount: number;
  correctPicks: number;
  incorrectPicks: number;
  totalPoints: number;
  isComplete: boolean;
  isLocked: boolean;
  lockTime: string | null;
};

export type NFLWeekOption = {
  id: string;
  weekNumber: number;
  weekType: NFLWeek["weekType"];
  label: string;
  weekStartDate: string;
  weekEndDate: string;
  status: string;
  isLocked: boolean;
  isCurrent: boolean;
  gamesCount: number;
  /**
   * True only for the single preseason preview week returned by
   * buildNFLGameWeekOptions before any week has started — lets the UI show
   * "opens <date>" framing instead of treating it as a live, in-progress week.
   */
  isUpcomingPreview: boolean;
};

// Raw types from database
 type NFLWeekRow = {
  id: string;
  season: number;
  week_number: number;
  week_type?: string | null;
  display_label?: string | null;
  week_start_date: string;
  week_end_date: string;
  thursday_kickoff: string | null;
  status: string;
  games_count: number;
  synced_at: string | null;
};

type NFLUserWeekRow = {
  id: string;
  user_id: string;
  venue_id: string;
  nfl_week_id: string;
  picks_count: number;
  correct_picks: number;
  incorrect_picks: number;
  total_points: number;
  is_complete: boolean;
  completed_at: string | null;
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * The UTC hour at which one NFL week hands over to the next: Tuesday 05:00 UTC.
 *
 * 5, not 4, on purpose. 4:00 UTC is exactly midnight Eastern only while the US
 * is on Daylight Time, which ends Sunday 2026-11-01 — from then on 4:00 UTC is
 * 11:00 PM MONDAY, while a Monday Night Football game that kicked off at 8:15 PM
 * EST is still being played. 5:00 UTC is 1:00 AM EDT early season and 12:00 AM
 * EST from November: always after MNF has ended, every week, with no timezone
 * library in the path. See docs/nfl-pickem-code-review-fixes-plan.md.
 */
export const NFL_WEEK_ROLLOVER_UTC_HOUR = 5;

/** 0 = Sunday … 2 = Tuesday, matching Date#getUTCDay. */
const TUESDAY_UTC_DAY = 2;

export type NFLWeekSpan = { startMs: number; endMsExclusive: number };

/**
 * The half-open instant span an NFL week OWNS: from its own Tuesday
 * 05:00 UTC to the next Tuesday 05:00 UTC.
 *
 * This is the single window every read of a week's picks uses — leaderboards,
 * reward standings, the user's own pick attach, and the recalculate_nfl_user_week
 * RPC (see supabase/migrations/20260728120100_nfl_week_tuesday_span.sql). It is
 * deliberately wider than the stored Thu→Mon `week_start_date`/`week_end_date`
 * shape, which is left alone:
 *
 * - Monday Night Football kicks off Tue ~00:15 UTC — outside the stored shape,
 *   inside this span.
 * - A Wednesday game (Christmas weeks) sits inside this span too, so it can't
 *   land in a neighbouring week.
 *
 * Gapless and non-overlapping by construction: week N's span ends at the exact
 * instant week N+1's begins, so season-mode totals never double-count and no
 * pick falls between weeks. No venue timezone is consulted.
 *
 * Returns NaN bounds for an unparseable date — callers filter on Number.isFinite.
 */
export function nflWeekSpanMs(week: Pick<NFLWeek, "weekStartDate">): NFLWeekSpan {
  const anchorMs = Date.parse(`${week.weekStartDate}T00:00:00.000Z`);
  if (!Number.isFinite(anchorMs)) {
    return { startMs: Number.NaN, endMsExclusive: Number.NaN };
  }

  const daysSinceTuesday = (new Date(anchorMs).getUTCDay() - TUESDAY_UTC_DAY + 7) % 7;
  const startMs = anchorMs - daysSinceTuesday * DAY_MS + NFL_WEEK_ROLLOVER_UTC_HOUR * HOUR_MS;

  return { startMs, endMsExclusive: startMs + 7 * DAY_MS };
}

/**
 * Get the Thursday that starts the week containing the given date
 */
export function getThursdayOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const dayOfWeek = d.getUTCDay(); // 0 = Sunday, 4 = Thursday
  const daysSinceThursday = (dayOfWeek - 4 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceThursday);
  return d;
}

/**
 * Calculate NFL week number based on season start
 * NFL Week 1 is the first Thursday in September
 */
export function calculateNFLWeekNumber(thursdayDate: Date, season: number): number {
  const seasonStart = new Date(Date.UTC(season, 8, 1)); // September 1st
  const firstThursday = getThursdayOfWeek(seasonStart);
  
  // If first Thursday is before Sept 1, move to next Thursday
  if (firstThursday.getUTCMonth() < 8) {
    firstThursday.setUTCDate(firstThursday.getUTCDate() + 7);
  }
  
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const diffTime = thursdayDate.getTime() - firstThursday.getTime();
  const diffWeeks = Math.floor(diffTime / msPerWeek);
  
  return Math.max(1, diffWeeks + 1);
}

const EASTERN_TZ = "America/New_York";
const EASTERN_WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Sept 10" for `date`, as read in `America/New_York`. */
function formatEasternMonthDay(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: EASTERN_TZ, month: "short", day: "numeric" }).format(date);
}

type DayGroupClassification = { label: string; isThursdayNightSection: boolean };

/**
 * Heading + section-styling flag for a game's day-section. `sameDayCount` is
 * how many other games in the week share this game's `dayGroupKey` — a lone
 * Thursday/Monday game gets the primetime framing, but a multi-game Thursday
 * (e.g. Thanksgiving) or Saturday doesn't get mislabeled as a single-game
 * slot. `isThursdayNightSection` is derived from the same condition that
 * produces the "Thursday Night Football" label (not by re-parsing the label
 * string downstream), so the two can never disagree.
 */
function classifyDayGroup(game: { isThursdayGame: boolean; isSundayGame: boolean; isMondayGame: boolean }, dayOfWeek: number, gameDate: Date, sameDayCount: number): DayGroupClassification {
  const monthDay = formatEasternMonthDay(gameDate);
  const isThursdayNightSection = game.isThursdayGame && sameDayCount === 1;
  if (isThursdayNightSection) return { label: `Thursday Night Football · ${monthDay}`, isThursdayNightSection };
  if (game.isMondayGame && sameDayCount === 1) return { label: `Monday Night Football · ${monthDay}`, isThursdayNightSection };
  if (game.isSundayGame) return { label: `Sunday, ${monthDay}`, isThursdayNightSection };
  return { label: `${EASTERN_WEEKDAY_NAMES[dayOfWeek]}, ${monthDay}`, isThursdayNightSection };
}

/**
 * Check if a week is locked (picks can no longer be changed)
 * Per-game locking: each game locks at its own kickoff
 * Week is considered "locked" for UI purposes when the first game has started
 */
export function isNFLWeekLocked(week: NFLWeek): boolean {
  // For per-game locking, we use thursdayKickoff as a UI indicator
  // but actual pick locks happen per-game
  if (!week.thursdayKickoff) return false;
  return Date.now() >= new Date(week.thursdayKickoff).getTime();
}

/**
 * Check if an individual game is locked
 */
function isGameLocked(startsAt: string): boolean {
  const startsAtMs = new Date(startsAt).getTime();
  if (!Number.isFinite(startsAtMs)) {
    return true;
  }
  return Date.now() >= startsAtMs;
}

/**
 * Determine if a date is within a given week
 */
export function isDateInWeek(date: string, week: NFLWeek): boolean {
  const d = new Date(date);
  const start = new Date(week.weekStartDate);
  const end = new Date(week.weekEndDate);
  end.setDate(end.getDate() + 1); // Include the full Monday
  
  return d >= start && d < end;
}

function normalizeNFLWeekType(value: string | null | undefined): NFLWeek["weekType"] {
  if (value === "preseason" || value === "postseason") {
    return value;
  }
  return "regular";
}

export function getNFLWeekDisplayLabel(week: Pick<NFLWeek, "displayLabel" | "weekNumber">): string {
  const label = String(week.displayLabel ?? "").trim();
  return label || `Week ${week.weekNumber}`;
}

/**
 * Has this week's play actually begun? Used by the LEADERBOARD only, which must
 * not list a week before there is anything to rank. The picking surface uses the
 * looser isNFLWeekOpenForPicks instead.
 */
export function isNFLWeekStarted(
  week: Pick<NFLWeek, "weekStartDate">,
  options: { now?: Date; timeZone?: string } = {}
): boolean {
  const timeZone = String(options.timeZone ?? "America/New_York").trim() || "America/New_York";
  return week.weekStartDate <= getLocalDateKey(options.now ?? new Date(), timeZone);
}

/**
 * Is this week selectable/pickable yet? True from the instant the week's span
 * opens — Tuesday 05:00 UTC — which is the weekly rollover: at that moment the
 * just-finished week hands over and the new slate appears.
 *
 * Both buildNFLGameWeekOptions (the client's week list) and
 * app/api/nfl-pickem/games (the server-side gate on a user-controllable weekId)
 * are built on this one predicate, so they cannot disagree about which weeks are
 * open — the mismatch that produced a 400 when the list was computed in one
 * timezone and the gate in another.
 */
export function isNFLWeekOpenForPicks(
  week: Pick<NFLWeek, "weekStartDate">,
  options: { now?: Date } = {}
): boolean {
  const { startMs } = nflWeekSpanMs(week);
  if (!Number.isFinite(startMs)) return false;
  return (options.now ?? new Date()).getTime() >= startMs;
}

export function buildNFLLeaderboardWeekOptions(
  weeks: NFLWeek[],
  options: { now?: Date; timeZone?: string } = {}
): {
  weeks: NFLWeekOption[];
  currentWeekId: string | null;
  defaultWeekId: string | null;
} {
  const timeZone = String(options.timeZone ?? "America/New_York").trim() || "America/New_York";
  const today = getLocalDateKey(options.now ?? new Date(), timeZone);
  const startedWeeks = weeks.filter((week) => isNFLWeekStarted(week, { now: options.now, timeZone }));
  const currentWeek = startedWeeks.find((week) => week.weekStartDate <= today && week.weekEndDate >= today) ?? null;
  const defaultWeek = currentWeek ?? startedWeeks[startedWeeks.length - 1] ?? null;

  return {
    weeks: startedWeeks.map((week) => ({
      id: week.id,
      weekNumber: week.weekNumber,
      weekType: week.weekType,
      label: getNFLWeekDisplayLabel(week),
      weekStartDate: week.weekStartDate,
      weekEndDate: week.weekEndDate,
      status: week.status,
      isLocked: isNFLWeekLocked(week),
      isCurrent: currentWeek?.id === week.id,
      gamesCount: week.gamesCount,
      // The preseason preview exception is game-mode only (buildNFLGameWeekOptions) —
      // there's nothing to show on a leaderboard before any picks exist.
      isUpcomingPreview: false,
    })),
    currentWeekId: currentWeek?.id ?? null,
    defaultWeekId: defaultWeek?.id ?? null,
  };
}

/**
 * Build the game-mode week list: past + current weeks only, never future
 * ones (deliberate retention mechanic — see docs/nfl-pickem-improvements-plan.md).
 * "Current" means open for picks — the week whose Tue 05:00 UTC span has begun —
 * so the new slate appears at the Tuesday rollover rather than on Thursday, and
 * there is no Tue/Wed limbo where the finished week is still the current one.
 *
 * PRESEASON EXCEPTION: if no week is open yet, that rule would return an
 * empty list — there'd be nothing to pick for months. Instead, surface the
 * single earliest upcoming week as a read-only preview (isUpcomingPreview:
 * true) so guests can see the matchups and start picking before kickoff. This
 * self-expires the moment that week's span opens: isNFLWeekOpenForPicks
 * then makes it fall into the ordinary branch below, on its own, with no
 * extra state to clean up. See docs/nfl-pickem-week1-early-access-plan.md.
 */
export function buildNFLGameWeekOptions(
  weeks: NFLWeek[],
  options: { now?: Date } = {}
): {
  weeks: NFLWeekOption[];
  currentWeekId: string | null;
} {
  const startedWeeks = weeks.filter((week) => isNFLWeekOpenForPicks(week, { now: options.now }));

  if (startedWeeks.length === 0) {
    const earliestUpcoming = [...weeks].sort((a, b) =>
      a.weekStartDate < b.weekStartDate ? -1 : a.weekStartDate > b.weekStartDate ? 1 : 0
    )[0];

    if (!earliestUpcoming) {
      return { weeks: [], currentWeekId: null };
    }

    return {
      weeks: [
        {
          id: earliestUpcoming.id,
          weekNumber: earliestUpcoming.weekNumber,
          weekType: earliestUpcoming.weekType,
          label: getNFLWeekDisplayLabel(earliestUpcoming),
          weekStartDate: earliestUpcoming.weekStartDate,
          weekEndDate: earliestUpcoming.weekEndDate,
          status: earliestUpcoming.status,
          isLocked: isNFLWeekLocked(earliestUpcoming),
          isCurrent: true,
          gamesCount: earliestUpcoming.gamesCount,
          isUpcomingPreview: true,
        },
      ],
      currentWeekId: earliestUpcoming.id,
    };
  }

  const currentWeek = startedWeeks[startedWeeks.length - 1] ?? null;

  return {
    weeks: startedWeeks.map((week) => ({
      id: week.id,
      weekNumber: week.weekNumber,
      weekType: week.weekType,
      label: getNFLWeekDisplayLabel(week),
      weekStartDate: week.weekStartDate,
      weekEndDate: week.weekEndDate,
      status: week.status,
      isLocked: isNFLWeekLocked(week),
      isCurrent: currentWeek?.id === week.id,
      gamesCount: week.gamesCount,
      isUpcomingPreview: false,
    })),
    currentWeekId: currentWeek?.id ?? null,
  };
}

/**
 * True when `week` qualifies for the preseason-preview exception: no week in
 * `seasonWeeks` is open for picks yet, and `week` is the single earliest upcoming
 * one — the same week buildNFLGameWeekOptions would surface as its preview
 * entry. Lets a route re-derive that same allow rule server-side rather than
 * trusting the client's own week list: a request's weekId is user-controllable,
 * so "the client saw this week in its list" is never sufficient on its own.
 * See docs/nfl-pickem-week1-early-access-plan.md.
 */
export function isPreseasonPreviewWeek(
  week: Pick<NFLWeek, "id">,
  seasonWeeks: NFLWeek[],
  options: { now?: Date } = {}
): boolean {
  const anyOpen = seasonWeeks.some((w) => isNFLWeekOpenForPicks(w, { now: options.now }));
  if (anyOpen) return false;

  const earliestUpcoming = [...seasonWeeks].sort((a, b) =>
    a.weekStartDate < b.weekStartDate ? -1 : a.weekStartDate > b.weekStartDate ? 1 : 0
  )[0];

  return earliestUpcoming?.id === week.id;
}

// ============================================
// LOCK MECHANISM
// ============================================

/**
 * Determine the lock time for an NFL week
 *
 * Rules:
 * 1. If there's a Thursday Night Football game, lock at earliest kickoff
 * 2. If no Thursday game (bye week), lock at first game of the week
 * 3. If no games at all (shouldn't happen), return null
 */
export async function determineWeekLockTime(
  weekStartDate: string,
  weekEndDate: string
): Promise<string | null> {
  // Fetch Thursday games
  const thursdayGames = await fetchNFLGamesFromBDL(weekStartDate, weekStartDate);
  
  if (thursdayGames.length > 0) {
    // Find earliest kickoff on Thursday
    const earliest = thursdayGames
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
    
    return earliest.startsAt;
  }
  
  // No Thursday game - find first game of the week
  const allGames = await fetchNFLGamesFromBDL(weekStartDate, weekEndDate);
  
  if (allGames.length === 0) {
    return null;
  }
  
  const earliestGame = allGames
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
  
  return earliestGame.startsAt;
}

/**
 * Get lock status with detailed information
 */
export function getLockStatus(week: {
  thursdayKickoff: string | null;
}): {
  isLocked: boolean;
  timeUntilLock: number | null; // milliseconds
  lockTimeFormatted: string | null;
} {
  if (!week.thursdayKickoff) {
    return {
      isLocked: false,
      timeUntilLock: null,
      lockTimeFormatted: null,
    };
  }
  
  const lockTime = new Date(week.thursdayKickoff).getTime();
  const now = Date.now();
  const isLocked = now >= lockTime;
  
  return {
    isLocked,
    timeUntilLock: isLocked ? 0 : lockTime - now,
    lockTimeFormatted: new Date(week.thursdayKickoff).toLocaleString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }),
  };
}

// ============================================
// WEEK MANAGEMENT
// ============================================

/**
 * Fetch all NFL weeks for a season
 */
export async function listNFLWeeks(
  season: number,
  includeComplete: boolean = false
): Promise<NFLWeek[]> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client not configured");
  }
  
  // First, update week statuses
  await supabaseAdmin.rpc("update_nfl_week_status");
  
  let query = supabaseAdmin
    .from("nfl_pickem_weeks")
    .select("*")
    .eq("season", season)
    .order("week_number", { ascending: true });
  
  if (!includeComplete) {
    query = query.neq("status", "complete");
  }
  
  const { data, error } = await query;
  
  if (error) {
    throw new Error(`Failed to fetch NFL weeks: ${error.message}`);
  }
  
  return (data || []).map(mapNFLWeekRow);
}

/**
 * The `week_start_date` of a season's earliest week, or null if that season has
 * no weeks synced yet.
 *
 * Deliberately NOT listNFLWeeks: that helper fires the update_nfl_week_status
 * RPC (a write) on every call, which is far too heavy for a read this is used
 * for — deciding whether a reward is still "upcoming" on the venue Rewards
 * panel, on every panel load.
 */
export async function getSeasonFirstWeekStartDate(season: number): Promise<string | null> {
  if (!supabaseAdmin) return null;
  if (!Number.isFinite(season)) return null;

  const { data, error } = await supabaseAdmin
    .from("nfl_pickem_weeks")
    .select("week_start_date")
    .eq("season", season)
    .order("week_start_date", { ascending: true })
    .limit(1)
    .maybeSingle<Pick<NFLWeekRow, "week_start_date">>();

  if (error || !data) return null;
  return data.week_start_date ?? null;
}

/**
 * Get a specific NFL week by ID
 */
export async function getNFLWeekById(weekId: string): Promise<NFLWeek | null> {
  if (!supabaseAdmin) return null;
  
  const { data, error } = await supabaseAdmin
    .from("nfl_pickem_weeks")
    .select("*")
    .eq("id", weekId)
    .single();
  
  if (error || !data) return null;
  
  return mapNFLWeekRow(data);
}

/**
 * Get the current NFL week based on today's date
 */
export async function getCurrentNFLWeek(season: number): Promise<NFLWeek | null> {
  const weeks = await listNFLWeeks(season, true);
  const now = new Date();
  
  return weeks.find(w => {
    const start = new Date(w.weekStartDate);
    const end = new Date(w.weekEndDate);
    end.setUTCHours(23, 59, 59, 999);
    return now >= start && now <= end;
  }) || null;
}

/**
 * Map database row to NFLWeek type
 */
function mapNFLWeekRow(row: NFLWeekRow): NFLWeek {
  return {
    id: row.id,
    season: row.season,
    weekNumber: row.week_number,
    weekType: normalizeNFLWeekType(row.week_type),
    displayLabel: row.display_label ?? null,
    weekStartDate: row.week_start_date,
    weekEndDate: row.week_end_date,
    thursdayKickoff: row.thursday_kickoff,
    status: row.status as NFLWeek["status"],
    gamesCount: row.games_count,
    syncedAt: row.synced_at,
  };
}

// ============================================
// GAME FETCHING
// ============================================

// Raw shape returned by balldontlie's /nfl/v1/games.
type BDLTeam = {
  id?: number | string;
  full_name?: string;
  name?: string;
};

type BDLGame = {
  id: number | string;
  date: string;
  week?: number;
  status: string;
  home_team?: BDLTeam;
  visitor_team?: BDLTeam;
  home_team_score?: number | null;
  visitor_team_score?: number | null;
  winner_team?: BDLTeam | null;
};

type NFLGameFetchResult = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  startsAt: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeam: string | null;
  status: string;
};

type NFLPickEmGameLineRow = {
  game_id: string;
  starts_at: string;
  home_team: string;
  away_team: string;
  home_spread: number | string;
  away_spread: number | string;
  provider: string;
  fetched_at: string | null;
  locked_at: string | null;
};

type BDLNFLOdds = {
  game_id?: number | string | null;
  vendor?: string | null;
  spread_home_value?: number | string | null;
  spread_away_value?: number | string | null;
  updated_at?: string | null;
};

type NormalizedNFLSpreadLine = {
  providerGameId: string;
  homeSpread: number;
  awaySpread: number;
  provider: string;
  fetchedAt: string | null;
  updatedAtMs: number;
  priority: number;
};

function mapBDLGame(game: BDLGame): NFLGameFetchResult {
  const homeTeam = game.home_team?.full_name || game.home_team?.name || "";
  const awayTeam = game.visitor_team?.full_name || game.visitor_team?.name || "";
  const isCompleted = game.status?.toLowerCase() === "final" || game.status?.toLowerCase() === "post";

  return {
    id: String(game.id),
    homeTeam,
    awayTeam,
    homeTeamId: game.home_team?.id !== undefined ? String(game.home_team.id) : null,
    awayTeamId: game.visitor_team?.id !== undefined ? String(game.visitor_team.id) : null,
    startsAt: game.date,
    homeScore: isCompleted ? game.home_team_score ?? null : null,
    awayScore: isCompleted ? game.visitor_team_score ?? null : null,
    winnerTeam: game.winner_team?.full_name ?? null,
    status: game.status,
  };
}

function toNFLPickEmGameId(game: Pick<NFLGameFetchResult, "id" | "startsAt" | "awayTeam" | "homeTeam">): string {
  return `${game.id}__${game.startsAt}__${game.awayTeam}__${game.homeTeam}`;
}

function mapGameLineRow(row: NFLPickEmGameLineRow): NFLPickEmGameLine {
  return {
    gameId: row.game_id,
    startsAt: row.starts_at,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    homeSpread: Number(row.home_spread),
    awaySpread: Number(row.away_spread),
    provider: row.provider,
    fetchedAt: row.fetched_at,
    lockedAt: row.locked_at,
  };
}

function parseSpreadValue(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

const NFL_SPREAD_VENDOR_PRIORITY = [
  "fanduel",
  "draftkings",
  "betmgm",
  "caesars",
  "bet365",
  "fanatics",
  "betrivers",
  "betparx",
  "ballybet",
  "betway",
];

function getSpreadVendorPriority(vendor: string): number {
  const index = NFL_SPREAD_VENDOR_PRIORITY.indexOf(vendor.toLowerCase());
  return index >= 0 ? index : NFL_SPREAD_VENDOR_PRIORITY.length;
}

function normalizeBDLNFLSpread(row: BDLNFLOdds): NormalizedNFLSpreadLine | null {
  const providerGameId = String(row.game_id ?? "").trim();
  if (!providerGameId) return null;

  const rawHomeSpread = parseSpreadValue(row.spread_home_value);
  const rawAwaySpread = parseSpreadValue(row.spread_away_value);
  if (rawHomeSpread === null && rawAwaySpread === null) return null;

  const homeSpread = rawHomeSpread ?? -rawAwaySpread!;
  const awaySpread = rawAwaySpread ?? -homeSpread;
  if (!Number.isFinite(homeSpread) || !Number.isFinite(awaySpread)) return null;

  const vendor = String(row.vendor ?? "unknown").trim() || "unknown";
  const updatedAtMs = Date.parse(String(row.updated_at ?? ""));

  return {
    providerGameId,
    homeSpread,
    awaySpread,
    provider: `balldontlie:${vendor}`,
    fetchedAt: row.updated_at ?? null,
    updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
    priority: getSpreadVendorPriority(vendor),
  };
}

function pickBetterSpreadLine(
  current: NormalizedNFLSpreadLine | undefined,
  next: NormalizedNFLSpreadLine
): NormalizedNFLSpreadLine {
  if (!current) return next;
  if (next.priority !== current.priority) {
    return next.priority < current.priority ? next : current;
  }
  return next.updatedAtMs > current.updatedAtMs ? next : current;
}

async function fetchNFLSpreadLinesFromBDL(params: {
  seasonWeek?: { season: number; weekNumber: number };
  providerGameIds: string[];
}): Promise<Map<string, NormalizedNFLSpreadLine>> {
  if (params.providerGameIds.length === 0) return new Map();

  const query = new URLSearchParams({ per_page: "100" });
  if (params.seasonWeek) {
    query.set("season", String(params.seasonWeek.season));
    query.set("week", String(params.seasonWeek.weekNumber));
  } else {
    for (const gameId of params.providerGameIds) {
      query.append("game_ids[]", gameId);
    }
  }

  const rows = await fetchBallDontLieList<BDLNFLOdds>("/nfl/v1/odds", query, 4);
  const byProviderGameId = new Map<string, NormalizedNFLSpreadLine>();

  for (const row of rows) {
    const line = normalizeBDLNFLSpread(row);
    if (!line) continue;
    if (!params.providerGameIds.includes(line.providerGameId)) continue;
    byProviderGameId.set(
      line.providerGameId,
      pickBetterSpreadLine(byProviderGameId.get(line.providerGameId), line)
    );
  }

  return byProviderGameId;
}

export async function getNFLPickEmGameLine(gameId: string): Promise<NFLPickEmGameLine | null> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }

  const { data, error } = await supabaseAdmin
    .from("nfl_pickem_game_lines")
    .select("game_id, starts_at, home_team, away_team, home_spread, away_spread, provider, fetched_at, locked_at")
    .eq("game_id", gameId)
    .maybeSingle<NFLPickEmGameLineRow>();

  if (error) {
    throw new Error(error.message ?? "Failed to load NFL Pick 'Em game line.");
  }

  return data ? mapGameLineRow(data) : null;
}

export async function getLockedNFLPickEmGameLineForSettlement(
  gameId: string,
  now = new Date()
): Promise<NFLPickEmGameLine | null> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }

  const existing = await getNFLPickEmGameLine(gameId);
  if (!existing) return null;
  if (existing.lockedAt) return existing;

  const startsAtMs = Date.parse(existing.startsAt);
  const nowMs = now.getTime();
  if (!Number.isFinite(startsAtMs) || !Number.isFinite(nowMs) || startsAtMs > nowMs) {
    return null;
  }

  const lockedAt = new Date(startsAtMs).toISOString();
  const { data, error } = await supabaseAdmin
    .from("nfl_pickem_game_lines")
    .update({ locked_at: lockedAt })
    .eq("game_id", gameId)
    .is("locked_at", null)
    .select("game_id, starts_at, home_team, away_team, home_spread, away_spread, provider, fetched_at, locked_at")
    .maybeSingle<NFLPickEmGameLineRow>();

  if (error) {
    throw new Error(error.message ?? "Failed to lock NFL Pick 'Em game line for settlement.");
  }

  if (data) {
    return mapGameLineRow(data);
  }

  const reloaded = await getNFLPickEmGameLine(gameId);
  return reloaded?.lockedAt ? reloaded : null;
}

/**
 * Which scoring mode should decide whether the spread-line refresh runs.
 *
 * A failed settings read resolves to `undefined` (= refresh), not "standard":
 * the expensive-but-correct branch is the safe default, since skipping the
 * refresh for a venue that is actually on spread is what leaves picks
 * ungradeable later.
 */
async function resolveScoringModeForLineRefresh(params: {
  venueId?: string;
  scoringMode?: NFLPickEmScoringMode;
}): Promise<NFLPickEmScoringMode | undefined> {
  if (params.scoringMode) return params.scoringMode;
  if (!params.venueId) return undefined;

  try {
    return await getVenueNFLPickEmScoringMode(params.venueId);
  } catch (error) {
    console.warn(
      `[NFL Pick 'Em] Could not resolve scoring mode for venue ${params.venueId}; refreshing spread lines anyway.`,
      error
    );
    return undefined;
  }
}

async function refreshNFLPickEmGameLines(
  games: NFLGameFetchResult[],
  seasonWeek?: { season: number; weekNumber: number }
): Promise<Map<string, NFLPickEmGameLine>> {
  if (!supabaseAdmin || games.length === 0) return new Map();

  const gameIds = games.map(toNFLPickEmGameId);
  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from("nfl_pickem_game_lines")
    .select("game_id, starts_at, home_team, away_team, home_spread, away_spread, provider, fetched_at, locked_at")
    .in("game_id", gameIds)
    .returns<NFLPickEmGameLineRow[]>();

  if (existingError) {
    throw new Error(existingError.message ?? "Failed to load NFL Pick 'Em game lines.");
  }

  const existingByGameId = new Map((existingRows ?? []).map((row) => [row.game_id, mapGameLineRow(row)]));
  const linesByGameId = new Map(existingByGameId);
  const nowMs = Date.now();
  const stampIso = new Date(nowMs).toISOString();
  const unlockableGames = games.filter((game) => {
    const existing = existingByGameId.get(toNFLPickEmGameId(game));
    if (existing?.lockedAt) return false;

    const startsAtMs = Date.parse(game.startsAt);
    return !Number.isFinite(startsAtMs) || nowMs < startsAtMs;
  });
  const providerLines =
    unlockableGames.length > 0
      ? await fetchNFLSpreadLinesFromBDL({
          seasonWeek,
          providerGameIds: unlockableGames.map((game) => game.id),
        })
      : new Map<string, NormalizedNFLSpreadLine>();

  for (const game of games) {
    const gameId = toNFLPickEmGameId(game);
    const existing = existingByGameId.get(gameId);
    if (existing?.lockedAt) continue;

    const startsAtMs = Date.parse(game.startsAt);
    const hasKickedOff = Number.isFinite(startsAtMs) && nowMs >= startsAtMs;
    if (hasKickedOff && existing) {
      const lockedAt = new Date(startsAtMs).toISOString();
      // Deliberately parallel to getLockedNFLPickEmGameLineForSettlement above:
      // .is("locked_at", null) makes this a compare-and-set, so a concurrent
      // request can lose the race and match zero rows. That's success by
      // another writer, not a failure — only a genuine DB error should throw.
      const { data, error } = await supabaseAdmin
        .from("nfl_pickem_game_lines")
        .update({ locked_at: lockedAt })
        .eq("game_id", gameId)
        .is("locked_at", null)
        .select("game_id, starts_at, home_team, away_team, home_spread, away_spread, provider, fetched_at, locked_at")
        .maybeSingle<NFLPickEmGameLineRow>();

      if (error) {
        throw new Error(error.message ?? "Failed to lock NFL Pick 'Em game line.");
      }

      if (data) {
        linesByGameId.set(gameId, mapGameLineRow(data));
        continue;
      }

      const reloaded = await getNFLPickEmGameLine(gameId);
      if (reloaded?.lockedAt) {
        linesByGameId.set(gameId, reloaded);
      }
      continue;
    }

    if (hasKickedOff) {
      continue;
    }

    const providerLine = providerLines.get(game.id);
    if (!providerLine) continue;

    const fetchedAt = providerLine.fetchedAt ?? stampIso;
    const { data, error } = await supabaseAdmin
      .from("nfl_pickem_game_lines")
      .upsert(
        {
          game_id: gameId,
          starts_at: game.startsAt,
          home_team: game.homeTeam,
          away_team: game.awayTeam,
          home_spread: providerLine.homeSpread,
          away_spread: providerLine.awaySpread,
          provider: providerLine.provider,
          fetched_at: fetchedAt,
          locked_at: null,
        },
        { onConflict: "game_id" }
      )
      .select("game_id, starts_at, home_team, away_team, home_spread, away_spread, provider, fetched_at, locked_at")
      .single<NFLPickEmGameLineRow>();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to save NFL Pick 'Em game line.");
    }
    linesByGameId.set(gameId, mapGameLineRow(data));
  }

  return linesByGameId;
}

/**
 * Fetch NFL games either by an explicit season+week (preferred — matches
 * balldontlie's own week boundaries exactly) or by a Thu-Mon date range
 * (legacy path, still used for the mock/test-data generator and any caller
 * without a resolved week number).
 *
 * A date-range fetch bound to a week's stored week_start_date/week_end_date
 * (Thu-Mon, enforced by a DB CHECK constraint) silently drops Monday Night
 * Football: MNF kicks off ~8:15pm ET Monday, which is already Tuesday in UTC
 * — outside the Thu-Mon window. Fetching by season+week sidesteps this
 * entirely by asking balldontlie for exactly that week's games, however they
 * fall across UTC dates. See docs/nfl-pickem-week1-early-access-plan.md.
 */
async function fetchNFLGamesFromBDL(
  fromDate: string,
  toDate: string,
  seasonWeek?: { season: number; weekNumber: number }
): Promise<NFLGameFetchResult[]> {
  if (isNFLPickEmTestDataEnabled()) {
    return generateMockNFLGames(fromDate, toDate);
  }

  let rawGames: BDLGame[];

  if (seasonWeek) {
    rawGames = await fetchBallDontLieList<BDLGame>(
      "/nfl/v1/games",
      new URLSearchParams({
        "seasons[]": String(seasonWeek.season),
        "weeks[]": String(seasonWeek.weekNumber),
        per_page: "100",
      }),
      2
    );
  } else {
    const dates: string[] = [];
    let current = new Date(fromDate);
    const end = new Date(toDate);

    while (current <= end) {
      dates.push(current.toISOString().slice(0, 10));
      current.setDate(current.getDate() + 1);
    }

    rawGames = [];
    for (const date of dates) {
      const games = await fetchBallDontLieList<BDLGame>(
        "/nfl/v1/games",
        new URLSearchParams({ "dates[]": date, per_page: "100" }),
        2
      );
      rawGames.push(...games);
    }
  }

  // Deduplicate by ID
  const seen = new Set<string>();
  const uniqueGames = rawGames.filter((game) => {
    const id = String(game.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return uniqueGames.map(mapBDLGame);
}

/**
 * Get all games for a specific NFL week
 * FIXES THE BUG: Uses week range instead of single date
 */
export async function listNFLPickEmGames(params: {
  weekId: string;
  userId?: string;
  venueId?: string;
  /**
   * The venue's NFL Pick 'Em scoring mode, when the caller already resolved it
   * (the games route does). Omitted + a venueId means we resolve it here;
   * omitted + no venueId means "no venue context" and the spread-line refresh
   * runs, because such callers (settlement sweeps, tiebreaker, winner rewards)
   * are exactly the paths that want lines kept current for whichever venues
   * *are* on spread.
   */
  scoringMode?: NFLPickEmScoringMode;
}): Promise<{
  week: NFLWeek;
  games: NFLPickEmGame[];
  userSummary?: NFLUserWeekSummary;
  /**
   * True only when a spread-line refresh was attempted and failed. The games
   * list still renders; spreads are simply absent. Callers that display
   * spreads should surface this rather than showing a spread game as if it
   * had no line.
   */
  spreadLinesUnavailable: boolean;
}> {
  const week = await getNFLWeekById(params.weekId);
  if (!week) {
    throw new Error("NFL Week not found");
  }

  // Fetch games from balldontlie across the FULL week range (Thursday to Monday)
  // FIX: Use week range instead of single date to get all games
  const games = await fetchNFLGamesFromBDL(week.weekStartDate, week.weekEndDate, {
    season: week.season,
    weekNumber: week.weekNumber,
  });

  const scoringMode = await resolveScoringModeForLineRefresh(params);

  // Standard (straight-up) venues never read a spread line, so the refresh —
  // a provider fetch plus up to ~16 sequential writes on a path every player
  // hits on every games-list load — is pure cost for them, and (before this
  // guard) a spread-line failure took NFL Pick 'Em down for venues that never
  // opted into the feature.
  //
  // Mid-week standard→spread switch, deliberately reasoned through rather than
  // assumed: (a) a line row that already exists but is still unlocked is locked
  // lazily at settlement by getLockedNFLPickEmGameLineForSettlement, which
  // stamps locked_at = kickoff on its own — skipping the refresh here cannot
  // strand it. (b) A line row that was never created (no spread venue loaded
  // this week's games before kickoff) leaves the switched venue's spread picks
  // with no line at all. That failure already exists independently — the row
  // is also absent when balldontlie simply had no odds for the game — and the
  // fix belongs in the settlement fallback (round-3 Phase 4), not in making a
  // standard venue pay for a line it will never read.
  let gameLines = new Map<string, NFLPickEmGameLine>();
  let spreadLinesUnavailable = false;
  if (scoringMode !== "standard") {
    try {
      gameLines = await refreshNFLPickEmGameLines(games, {
        season: week.season,
        weekNumber: week.weekNumber,
      });
    } catch (error) {
      // Log and proceed, same policy as sweepAbandonedIncompleteSubscriptions:
      // the spread line is an enrichment of the games list, not the games list.
      // Failing the whole request means a player cannot see or make *any* pick
      // because a third-party odds feed hiccuped — strictly worse than
      // rendering the week without spreads and retrying on the next load.
      spreadLinesUnavailable = true;
      console.warn(
        `[NFL Pick 'Em] Spread-line refresh failed for season ${week.season} week ${week.weekNumber}; rendering games without lines.`,
        error
      );
    }
  }

  // Transform to NFLPickEmGame format
  const gameDates = games.map(game => new Date(game.startsAt));
  const dayGroupKeys = gameDates.map(gameDate => getLocalDateKey(gameDate, EASTERN_TZ));
  const sameDayCounts = new Map<string, number>();
  for (const key of dayGroupKeys) {
    sameDayCounts.set(key, (sameDayCounts.get(key) ?? 0) + 1);
  }

  const nflGames: NFLPickEmGame[] = games.map((game, index) => {
    const gameDate = gameDates[index];
    const gameId = toNFLPickEmGameId(game);
    const gameLine = gameLines.get(gameId);
    const dayOfWeek = getEasternDayOfWeek(gameDate);
    const dayGroupKey = dayGroupKeys[index];

    const isLocked = isGameLocked(game.startsAt);
    const isCompleted = game.winnerTeam !== null;

    const isThursdayGame = dayOfWeek === 4;
    const isSundayGame = dayOfWeek === 0;
    const isMondayGame = dayOfWeek === 1;

    const dayGroup = classifyDayGroup(
      { isThursdayGame, isSundayGame, isMondayGame },
      dayOfWeek,
      gameDate,
      sameDayCounts.get(dayGroupKey) ?? 1
    );

    return {
      id: `${game.id}__${game.startsAt}__${game.awayTeam}__${game.homeTeam}`,
      sportSlug: NFL_PICKEM_SPORT_SLUG,
      sportKey: NFL_PICKEM_SPORT_KEY,
      league: NFL_PICKEM_LEAGUE,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      startsAt: game.startsAt,
      isLocked,
      status: isCompleted ? "final" : isLocked ? "live" : "scheduled",
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      winnerTeam: game.winnerTeam,
      homeSpread: gameLine?.homeSpread ?? null,
      awaySpread: gameLine?.awaySpread ?? null,
      periodLabel: null,
      nflWeekId: week.id,
      weekNumber: week.weekNumber,
      isThursdayGame,
      isSundayGame,
      isMondayGame,
      dayGroupKey,
      dayGroupLabel: dayGroup.label,
      isThursdayNightSection: dayGroup.isThursdayNightSection,
    };
  });

  // Chronological order — the only ordering that can never strand a game
  // (e.g. a Wednesday opener) at the bottom of the page. See
  // docs/nfl-pickem-chronological-order-plan.md.
  nflGames.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  
  // Attach user's existing picks, across the week's full Tue→Tue span — the
  // same window every leaderboard read uses. The old Thu→Mon-23:59 window
  // excluded Monday Night Football (Tue ~00:15 UTC), so a guest's own MNF pick
  // came back unselected and looked like it had never saved.
  if (params.userId && params.venueId) {
    const span = nflWeekSpanMs(week);

    const { data: picks } = await supabaseAdmin!
      .from("pickem_picks")
      .select("*")
      .eq("user_id", params.userId)
      .eq("venue_id", params.venueId)
      .eq("sport_slug", NFL_PICKEM_SPORT_SLUG)
      .gte("starts_at", new Date(span.startMs).toISOString())
      .lt("starts_at", new Date(span.endMsExclusive).toISOString());

    const pickMap = new Map(picks?.map(p => [p.game_id, p]));
    
    for (const game of nflGames) {
      const pick = pickMap.get(game.id);
      if (pick) {
        game.userPickId = pick.id;
        game.userPickTeam = pick.selected_team;
        game.userPickStatus = pick.status as PickEmPick["status"];
        game.userPickRewardPoints = pick.reward_points;
        game.userPickRewardClaimedAt = pick.reward_claimed_at;
      }
    }
  }
  
  // Get user summary
  let userSummary: NFLUserWeekSummary | undefined;
  if (params.userId && params.venueId) {
    userSummary = await getUserNFLWeekSummary(params.userId, params.venueId, week.id);
  }
  
  return { week, games: nflGames, userSummary, spreadLinesUnavailable };
}

// ============================================
// USER SUMMARIES
// ============================================

/**
 * Get or create user week summary
 */
export async function getUserNFLWeekSummary(
  userId: string,
  venueId: string,
  weekId: string
): Promise<NFLUserWeekSummary | undefined> {
  if (!supabaseAdmin) return undefined;
  
  // First ensure the summary exists
  await supabaseAdmin.rpc("recalculate_nfl_user_week", {
    p_user_id: userId,
    p_venue_id: venueId,
    p_nfl_week_id: weekId,
  });
  
  // Fetch the summary
  const { data, error } = await supabaseAdmin
    .from("nfl_pickem_user_weeks")
    .select("*, nfl_week: nfl_week_id(*)")
    .eq("user_id", userId)
    .eq("venue_id", venueId)
    .eq("nfl_week_id", weekId)
    .single();
  
  if (error || !data) return undefined;
  
  const row = data as NFLUserWeekRow & { nfl_week: NFLWeekRow };
  
  return {
    id: row.id,
    weekId: row.nfl_week_id,
    weekNumber: row.nfl_week.week_number,
    weekStartDate: row.nfl_week.week_start_date,
    weekEndDate: row.nfl_week.week_end_date,
    status: row.nfl_week.status,
    picksCount: row.picks_count,
    correctPicks: row.correct_picks,
    incorrectPicks: row.incorrect_picks,
    totalPoints: row.total_points,
    isComplete: row.is_complete,
    isLocked: isNFLWeekLocked(mapNFLWeekRow(row.nfl_week)),
    lockTime: row.nfl_week.thursday_kickoff,
  };
}

// ============================================
// PICK SUBMISSION
// ============================================

// Pick row selection for queries
const PICKEM_PICK_SELECT =
  "id, user_id, venue_id, sport_slug, sport_key, league, game_id, home_team_id, away_team_id, selected_team_id, winning_team_id, game_label, home_team, away_team, starts_at, selected_team, selected_side, status, home_score, away_score, created_at, updated_at, resolved_at, reward_points, reward_claimed_at";

// Raw pick row type
type PickEmPickRow = {
  id: string;
  user_id: string;
  venue_id: string;
  sport_slug: string;
  sport_key: string;
  league: string;
  game_id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  selected_team_id: string | null;
  winning_team_id: string | null;
  game_label: string;
  home_team: string;
  away_team: string;
  starts_at: string;
  selected_team: string;
  selected_side: "home" | "away";
  status: "pending" | "won" | "lost" | "push" | "canceled";
  home_score: number | null;
  away_score: number | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  reward_points: number;
  reward_claimed_at: string | null;
};

function mapPickRowToPick(row: PickEmPickRow): PickEmPick {
  return {
    id: row.id,
    userId: row.user_id,
    venueId: row.venue_id,
    sportSlug: row.sport_slug as PickEmPick["sportSlug"],
    sportKey: row.sport_key,
    league: row.league,
    gameId: row.game_id,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    selectedTeamId: row.selected_team_id,
    winningTeamId: row.winning_team_id,
    gameLabel: row.game_label,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    startsAt: row.starts_at,
    selectedTeam: row.selected_team,
    selectedSide: row.selected_side,
    status: row.status,
    homeScore: row.home_score,
    awayScore: row.away_score,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    rewardPoints: row.reward_points,
    rewardClaimedAt: row.reward_claimed_at,
  };
}

/**
 * Submit an NFL Pick 'Em pick
 * Per-game locking: each game locks at its own kickoff
 * Bypasses the isClickable check in lib/pickem.ts
 */
export async function submitNFLPickEmPick(params: {
  userId: string;
  venueId: string;
  weekId: string;
  gameId: string;
  pickTeam: string;
}): Promise<PickEmPick> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }
  
  const week = await getNFLWeekById(params.weekId);
  if (!week) {
    throw new Error("NFL Week not found");
  }
  
  // Get the game details
  const { games } = await listNFLPickEmGames({
    weekId: params.weekId,
    userId: params.userId,
    venueId: params.venueId,
  });
  
  const game = games.find(g => g.id === params.gameId);
  if (!game) {
    throw new Error("Game not found");
  }
  
  // Per-game locking check
  if (game.isLocked) {
    throw new Error("This game has already started. Picks lock at kickoff.");
  }
  
  // Validate pick team
  if (params.pickTeam !== game.homeTeam && params.pickTeam !== game.awayTeam) {
    throw new Error(`pickTeam must be either "${game.homeTeam}" or "${game.awayTeam}"`);
  }
  
  const selectedSide: "home" | "away" = params.pickTeam === game.homeTeam ? "home" : "away";
  const selectedTeamId = selectedSide === "home" ? game.homeTeamId : game.awayTeamId;
  const gameLabel = `${game.awayTeam} vs ${game.homeTeam}`;
  
  // Check for existing pick
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("pickem_picks")
    .select(PICKEM_PICK_SELECT)
    .eq("user_id", params.userId)
    .eq("venue_id", params.venueId)
    .eq("game_id", params.gameId)
    .maybeSingle<PickEmPickRow>();
  
  if (existingError) {
    throw new Error(existingError.message ?? "Failed to verify existing pick.");
  }
  
  if (existing) {
    // Check if pick is locked
    const startsAtMs = new Date(existing.starts_at).getTime();
    if (!Number.isFinite(startsAtMs) || Date.now() >= startsAtMs + PICKEM_LOCK_GRACE_MS) {
      throw new Error("This pick is locked because the game has started.");
    }
    
    if (existing.status !== "pending") {
      throw new Error("This pick can no longer be modified.");
    }
    
    // Update existing pick
    const { data, error } = await supabaseAdmin
      .from("pickem_picks")
      .update({
        selected_team: params.pickTeam,
        selected_side: selectedSide,
        game_label: gameLabel,
        league: game.league,
        sport_key: game.sportKey,
        selected_team_id: selectedTeamId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select(PICKEM_PICK_SELECT)
      .single<PickEmPickRow>();
    
    if (error || !data) {
      throw new Error(error?.message ?? "Failed to update pick.");
    }
    
    // Recalculate user week summary
    await supabaseAdmin.rpc("recalculate_nfl_user_week", {
      p_user_id: params.userId,
      p_venue_id: params.venueId,
      p_nfl_week_id: params.weekId,
    });
    
    return mapPickRowToPick(data);
  }
  
  // Insert new pick
  const { data, error } = await supabaseAdmin
    .from("pickem_picks")
    .insert({
      user_id: params.userId,
      venue_id: params.venueId,
      sport_slug: NFL_PICKEM_SPORT_SLUG,
      sport_key: game.sportKey,
      league: game.league,
      game_id: params.gameId,
      home_team_id: game.homeTeamId,
      away_team_id: game.awayTeamId,
      selected_team: params.pickTeam,
      selected_side: selectedSide,
      selected_team_id: selectedTeamId,
      game_label: gameLabel,
      home_team: game.homeTeam,
      away_team: game.awayTeam,
      starts_at: game.startsAt,
      status: "pending",
      reward_points: PICKEM_REWARD_POINTS,
    })
    .select(PICKEM_PICK_SELECT)
    .single<PickEmPickRow>();
  
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to save pick.");
  }
  
  // Recalculate user week summary
  await supabaseAdmin.rpc("recalculate_nfl_user_week", {
    p_user_id: params.userId,
    p_venue_id: params.venueId,
    p_nfl_week_id: params.weekId,
  });
  
  return mapPickRowToPick(data);
}

/**
 * The stored week whose Tue→Tue span contains `startsAt`, or null. Candidates
 * are narrowed by stored date first (a week's span never reaches more than two
 * days before its week_start_date, nor more than seven days past it), then the
 * containing span is picked in JS — spans are non-overlapping, so at most one
 * week can match.
 */
async function findNFLWeekContaining(startsAt: string): Promise<NFLWeek | null> {
  if (!supabaseAdmin) return null;

  const startsAtMs = Date.parse(startsAt);
  if (!Number.isFinite(startsAtMs)) return null;

  const candidateFrom = new Date(startsAtMs - 8 * DAY_MS).toISOString().slice(0, 10);
  const candidateTo = new Date(startsAtMs + 3 * DAY_MS).toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from("nfl_pickem_weeks")
    .select("*")
    .gte("week_start_date", candidateFrom)
    .lte("week_start_date", candidateTo)
    .returns<NFLWeekRow[]>();

  if (error) return null;

  const match = (data ?? []).find((row) => {
    const span = nflWeekSpanMs({ weekStartDate: row.week_start_date });
    return startsAtMs >= span.startMs && startsAtMs < span.endMsExclusive;
  });

  return match ? mapNFLWeekRow(match) : null;
}

/**
 * Clear an NFL Pick 'Em pick
 */
export async function clearNFLPick(params: {
  userId: string;
  gameId: string;
}): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin not configured");
  }
  
  // Get the pick to find its week
  const { data: pick, error: pickError } = await supabaseAdmin
    .from("pickem_picks")
    .select("*, starts_at")
    .eq("user_id", params.userId)
    .eq("game_id", params.gameId)
    .eq("sport_slug", NFL_PICKEM_SPORT_SLUG)
    .single();
  
  if (pickError || !pick) {
    throw new Error("Pick not found");
  }
  
  // Per-game locking: check if this specific game has started
  if (isGameLocked(pick.starts_at)) {
    throw new Error("Cannot clear pick - game has already started");
  }
  
  // Delete the pick
  const { error } = await supabaseAdmin
    .from("pickem_picks")
    .delete()
    .eq("id", pick.id);
  
  if (error) {
    throw new Error(`Failed to clear pick: ${error.message}`);
  }
  
  // Find the week for this game and recalculate summary. Matched on the week's
  // Tue→Tue span rather than its stored Thu→Mon dates: a Monday Night Football
  // kickoff is TUESDAY in UTC and so matched no week at all under those dates,
  // which left the user's week summary stale after clearing an MNF pick.
  const week = await findNFLWeekContaining(String(pick.starts_at));

  if (week) {
    await supabaseAdmin.rpc("recalculate_nfl_user_week", {
      p_user_id: params.userId,
      p_venue_id: pick.venue_id,
      p_nfl_week_id: week.id,
    });
  }
}

// ============================================
// LEADERBOARD
// ============================================

export type NFLLeaderboardMode = "week" | "season";

/**
 * One pick inside a leaderboard entry.
 *
 * PRIVACY: `selectedTeam` is *absent* (not null) whenever the pick belongs to
 * another user and that game has not kicked off yet. The selection never
 * reaches the client, so a hostile client has nothing to un-hide. Only the
 * existence of the pick is exposed (it drives the picks count).
 */
export type NFLLeaderboardPickEntry = {
  gameId: string;
  gameLabel: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  isHidden: boolean;
  selectedTeam?: string;
  status: PickEmPick["status"];
  winnerTeam: string | null;
  homeScore: number | null;
  awayScore: number | null;
};

export type NFLLeaderboardEntry = {
  userId: string;
  username: string;
  picksCount: number;
  correctPicks: number;
  incorrectPicks: number;
  totalPoints: number;
  rank: number;
  isCurrentUser: boolean;
  picks: NFLLeaderboardPickEntry[];
};

export type NFLLeaderboardResult = {
  mode: NFLLeaderboardMode;
  weekId: string | null;
  season: number | null;
  entries: NFLLeaderboardEntry[];
};

const NFL_LEADERBOARD_PICK_SELECT =
  "user_id, game_id, game_label, home_team, away_team, starts_at, selected_team, selected_side, status, home_score, away_score, reward_points";

type NFLLeaderboardPickRow = Pick<
  PickEmPickRow,
  | "user_id"
  | "game_id"
  | "game_label"
  | "home_team"
  | "away_team"
  | "starts_at"
  | "selected_team"
  | "selected_side"
  | "status"
  | "home_score"
  | "away_score"
  | "reward_points"
>;

type NFLWeekRange = NFLWeekSpan;

// PostgREST caps a single response at 1000 rows; a season's worth of picks for
// a busy venue easily exceeds that, so leaderboard reads page explicitly.
const NFL_LEADERBOARD_PAGE_SIZE = 1000;
const NFL_LEADERBOARD_USER_CHUNK = 500;

async function fetchNFLLeaderboardPickRows(params: {
  venueId: string;
  startMs: number;
  endMsExclusive: number;
}): Promise<NFLLeaderboardPickRow[]> {
  const rows: NFLLeaderboardPickRow[] = [];
  const startIso = new Date(params.startMs).toISOString();
  const endIso = new Date(params.endMsExclusive).toISOString();

  for (let page = 0; ; page += 1) {
    const from = page * NFL_LEADERBOARD_PAGE_SIZE;
    const { data, error } = await supabaseAdmin!
      .from("pickem_picks")
      .select(NFL_LEADERBOARD_PICK_SELECT)
      .eq("venue_id", params.venueId)
      .eq("sport_slug", NFL_PICKEM_SPORT_SLUG)
      .gte("starts_at", startIso)
      .lt("starts_at", endIso)
      .order("starts_at", { ascending: true })
      .order("user_id", { ascending: true })
      .order("game_id", { ascending: true })
      .range(from, from + NFL_LEADERBOARD_PAGE_SIZE - 1)
      .returns<NFLLeaderboardPickRow[]>();

    if (error) {
      throw new Error(`Failed to load leaderboard picks: ${error.message}`);
    }

    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < NFL_LEADERBOARD_PAGE_SIZE) break;
  }

  return rows;
}

async function fetchNFLLeaderboardUsernames(userIds: string[]): Promise<Map<string, string>> {
  const usernames = new Map<string, string>();

  for (let index = 0; index < userIds.length; index += NFL_LEADERBOARD_USER_CHUNK) {
    const chunk = userIds.slice(index, index + NFL_LEADERBOARD_USER_CHUNK);
    const { data, error } = await supabaseAdmin!
      .from("users")
      .select("id, username")
      .in("id", chunk)
      .returns<Array<{ id: string; username: string | null }>>();

    if (error) {
      throw new Error(`Failed to load leaderboard usernames: ${error.message}`);
    }

    for (const row of data ?? []) {
      const username = String(row.username ?? "").trim();
      if (username) usernames.set(row.id, username);
    }
  }

  return usernames;
}

/**
 * Winner of a settled game, derived from the pick itself — a won pick's winner
 * is the selected team, a lost pick's winner is the other side. Pending and
 * pushed games have no winner, so a hidden (not-yet-started) pick can never
 * leak a selection through this field.
 */
function deriveWinnerTeam(row: NFLLeaderboardPickRow): string | null {
  if (row.status === "won") return row.selected_team;
  if (row.status === "lost") return row.selected_side === "home" ? row.away_team : row.home_team;
  return null;
}

function toLeaderboardPickEntry(row: NFLLeaderboardPickRow, isOwnPick: boolean, nowMs: number): NFLLeaderboardPickEntry {
  const startsAtMs = Date.parse(row.starts_at);
  // An unparseable kickoff is treated as "not started yet" so it stays hidden.
  const hasStarted = Number.isFinite(startsAtMs) && nowMs >= startsAtMs;
  const isHidden = !isOwnPick && !hasStarted;

  const entry: NFLLeaderboardPickEntry = {
    gameId: row.game_id,
    gameLabel: row.game_label,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    startsAt: row.starts_at,
    isHidden,
    status: row.status,
    winnerTeam: deriveWinnerTeam(row),
    homeScore: row.home_score,
    awayScore: row.away_score,
  };

  // Set the key only when revealed: JSON.stringify omits absent keys entirely.
  if (!isHidden) {
    entry.selectedTeam = row.selected_team;
  }

  return entry;
}

/**
 * Venue-scoped NFL Pick 'Em leaderboard, in `week` or cumulative `season` mode.
 *
 * Aggregates from `pickem_picks` rather than `nfl_pickem_user_weeks`: that
 * summary table is only refreshed when a pick is written or settled, so a week
 * whose games finished without further pick activity can be stale. The
 * aggregation here reproduces the recalculate_nfl_user_week RPC's definitions
 * (won = correct, lost = incorrect, points = reward points of won picks).
 */
export async function getNFLPickEmLeaderboard(params: {
  venueId: string;
  mode: NFLLeaderboardMode;
  weekId?: string | null;
  season?: number | null;
  userId?: string | null;
  now?: Date;
}): Promise<NFLLeaderboardResult> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client not configured");
  }

  const venueId = String(params.venueId ?? "").trim();
  if (!venueId) {
    throw new Error("venueId is required");
  }

  const requestingUserId = String(params.userId ?? "").trim();
  const nowMs = (params.now ?? new Date()).getTime();

  let ranges: NFLWeekRange[] = [];
  let weekId: string | null = null;
  let season: number | null = null;

  if (params.mode === "week") {
    const requestedWeekId = String(params.weekId ?? "").trim();
    if (!requestedWeekId) {
      throw new Error("weekId is required when mode=week");
    }
    const week = await getNFLWeekById(requestedWeekId);
    if (!week) {
      throw new Error("NFL Week not found");
    }
    weekId = week.id;
    season = week.season;
    ranges = [nflWeekSpanMs(week)];
  } else {
    const requestedSeason = Number(params.season);
    if (!Number.isFinite(requestedSeason)) {
      throw new Error("season is required when mode=season");
    }
    season = requestedSeason;

    const { data, error } = await supabaseAdmin
      .from("nfl_pickem_weeks")
      .select("week_start_date")
      .eq("season", requestedSeason)
      .returns<Array<Pick<NFLWeekRow, "week_start_date">>>();

    if (error) {
      throw new Error(`Failed to load NFL weeks: ${error.message}`);
    }

    ranges = (data ?? []).map((row) => nflWeekSpanMs({ weekStartDate: row.week_start_date }));
  }

  ranges = ranges.filter((range) => Number.isFinite(range.startMs) && Number.isFinite(range.endMsExclusive));

  if (ranges.length === 0) {
    return { mode: params.mode, weekId, season, entries: [] };
  }

  const rows = await fetchNFLLeaderboardPickRows({
    venueId,
    startMs: Math.min(...ranges.map((range) => range.startMs)),
    endMsExclusive: Math.max(...ranges.map((range) => range.endMsExclusive)),
  });

  // The paged read above uses one outer min→max window, so keep only picks that
  // fall inside an actual week span. Week spans are gapless and non-overlapping,
  // so this can neither drop a pick between weeks nor count one twice.
  const inRange = (startsAt: string): boolean => {
    const ms = Date.parse(startsAt);
    if (!Number.isFinite(ms)) return false;
    return ranges.some((range) => ms >= range.startMs && ms < range.endMsExclusive);
  };

  const rowsByUser = new Map<string, NFLLeaderboardPickRow[]>();
  for (const row of rows) {
    if (!inRange(row.starts_at)) continue;
    const userId = String(row.user_id ?? "").trim();
    if (!userId) continue;
    const existing = rowsByUser.get(userId);
    if (existing) {
      existing.push(row);
    } else {
      rowsByUser.set(userId, [row]);
    }
  }

  if (rowsByUser.size === 0) {
    return { mode: params.mode, weekId, season, entries: [] };
  }

  const usernames = await fetchNFLLeaderboardUsernames([...rowsByUser.keys()]);

  const entries: Array<Omit<NFLLeaderboardEntry, "rank">> = [...rowsByUser.entries()].map(([userId, userRows]) => {
    const isCurrentUser = requestingUserId.length > 0 && userId === requestingUserId;

    let correctPicks = 0;
    let incorrectPicks = 0;
    let totalPoints = 0;
    for (const row of userRows) {
      if (row.status === "won") {
        correctPicks += 1;
        totalPoints += Number(row.reward_points ?? PICKEM_REWARD_POINTS);
      } else if (row.status === "lost") {
        incorrectPicks += 1;
      }
    }

    const picks = [...userRows]
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
      .map((row) => toLeaderboardPickEntry(row, isCurrentUser, nowMs));

    return {
      userId,
      username: usernames.get(userId) ?? `Player ${userId.slice(0, 4) || "?"}`,
      picksCount: userRows.length,
      correctPicks,
      incorrectPicks,
      totalPoints,
      isCurrentUser,
      picks,
    };
  });

  entries.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.correctPicks !== a.correctPicks) return b.correctPicks - a.correctPicks;
    return a.username.localeCompare(b.username);
  });

  // Standard competition ranking: equal points + equal correct share a rank,
  // and the next entry skips ahead (1, 2, 2, 4).
  let lastRank = 0;
  const ranked: NFLLeaderboardEntry[] = entries.map((entry, index) => {
    const previous = index > 0 ? entries[index - 1] : null;
    const tied =
      previous !== null && previous.totalPoints === entry.totalPoints && previous.correctPicks === entry.correctPicks;
    lastRank = tied ? lastRank : index + 1;
    return { ...entry, rank: lastRank };
  });

  return { mode: params.mode, weekId, season, entries: ranked };
}

// ============================================
// WEEK SYNC (for cron job)
// ============================================

/**
 * The Thursday a week's `week_start_date` anchors on.
 *
 * NOT the Thursday of the earliest kickoff. `getThursdayOfWeek` walks BACKWARD
 * to the most recent Thursday, so a Wednesday game (Christmas weeks, and the
 * occasional international/holiday slate) resolves to the PREVIOUS week's
 * Thursday — six days early. Anchoring on the earliest kickoff therefore let a
 * single Wednesday opener drag the whole week back seven days, colliding with
 * the real previous week. That is finding 6 in
 * docs/nfl-pickem-code-review-fixes-plan.md.
 *
 * Every candidate Thursday its games suggest is scored by how many of the
 * week's games its own Tue→Tue span would actually contain, and the best one
 * wins. A Wednesday-opener week scores 0 for the too-early Thursday (whose span
 * has closed before the Wednesday game even starts) and a clean sweep for the
 * right one, so the majority slate always decides. Ties fall to the LATER
 * Thursday: every way this can go wrong points a week too early, never too late.
 */
function resolveWeekAnchorThursday(games: BDLGame[]): Date | null {
  const kickoffs = games.map((game) => Date.parse(game.date)).filter((ms) => Number.isFinite(ms));
  if (kickoffs.length === 0) return null;

  const candidates = new Map<number, Date>();
  for (const ms of kickoffs) {
    const thursday = getThursdayOfWeek(new Date(ms));
    candidates.set(thursday.getTime(), thursday);
  }

  const scored = [...candidates.values()].map((thursday) => {
    const span = nflWeekSpanMs({ weekStartDate: thursday.toISOString().slice(0, 10) });
    return {
      thursday,
      contained: kickoffs.filter((ms) => ms >= span.startMs && ms < span.endMsExclusive).length,
    };
  });

  scored.sort((a, b) => b.contained - a.contained || b.thursday.getTime() - a.thursday.getTime());
  return scored[0].thursday;
}

type PlannedNFLWeek = {
  weekNumber: number;
  weekStartDate: string;
  weekEndDate: string;
  thursdayKickoff: string;
  gamesCount: number;
};

/**
 * Refuse to write a set of weeks whose Tue→Tue spans overlap.
 *
 * Overlapping spans mean a single pick belongs to two weeks at once: it would be
 * counted twice in a season total and could win two weekly prizes. This is the
 * tripwire for the assumption the whole span model rests on — that no NFL week
 * ever contains a game outside its 7-day Tue→Tue window — so it throws BEFORE
 * anything is upserted rather than leaving the table half-migrated.
 */
function assertNoOverlappingWeekSpans(planned: PlannedNFLWeek[]): void {
  const ordered = [...planned]
    .map((week) => ({ week, span: nflWeekSpanMs(week) }))
    .sort((a, b) => a.span.startMs - b.span.startMs);

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (current.span.startMs < previous.span.endMsExclusive) {
      throw new Error(
        `NFL week sync aborted: weeks ${previous.week.weekNumber} (${previous.week.weekStartDate}) and ` +
          `${current.week.weekNumber} (${current.week.weekStartDate}) resolve to overlapping spans. ` +
          `No weeks were written.`
      );
    }
  }
}

/**
 * Sync NFL weeks from balldontlie API
 * This should be run weekly via cron job
 */
export async function syncNFLWeeks(season: number): Promise<NFLWeek[]> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin not configured");
  }

  // Fetch all games for the season. NOTE: balldontlie requires bracket-style
  // array params ("seasons[]", not "seasons") — the plain "seasons" key this
  // used to send matched zero games, silently, which is why this sync always
  // produced 0 weeks even before it went unscheduled. Verified directly
  // against the live API; see docs/nfl-pickem-week1-early-access-plan.md.
  const games = await fetchBallDontLieList<BDLGame>(
    "/nfl/v1/games",
    new URLSearchParams({
      "seasons[]": String(season),
      per_page: "100",
      postseason: "false", // Regular season only
    }),
    3
  );

  // Group games by balldontlie's own week number. Do NOT recompute it via
  // calculateNFLWeekNumber's "first Thursday in September" anchor — that
  // anchor lands on the wrong calendar Thursday for seasons (like 2026) whose
  // real Week 1 starts later in September, mislabeling every week.
  const weekMap = new Map<number, BDLGame[]>();

  for (const game of games) {
    const weekNumber = Number(game.week);
    if (!Number.isFinite(weekNumber) || weekNumber < 1) continue;

    const existing = weekMap.get(weekNumber);
    if (existing) {
      existing.push(game);
    } else {
      weekMap.set(weekNumber, [game]);
    }
  }

  // Plan every week first, validate the whole set, and only then write: an
  // overlap has to abort the sync before it has half-rewritten the table.
  const planned: PlannedNFLWeek[] = [];

  for (const [weekNumber, weekGames] of weekMap) {
    const byKickoff = [...weekGames].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const weekStart = resolveWeekAnchorThursday(weekGames);
    if (!weekStart) {
      console.error(`Skipping week ${weekNumber}: no parseable kickoff among ${weekGames.length} games`);
      continue;
    }

    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 4); // Monday

    // Any game the resolved span doesn't cover would be attributed to a
    // neighbouring week's leaderboard. Loud, but not fatal — a single postponed
    // game must not stop the whole season from syncing.
    const span = nflWeekSpanMs({ weekStartDate: weekStart.toISOString().slice(0, 10) });
    const outside = weekGames.filter((game) => {
      const ms = Date.parse(game.date);
      return Number.isFinite(ms) && (ms < span.startMs || ms >= span.endMsExclusive);
    });
    if (outside.length > 0) {
      console.warn(
        `[NFL Pick 'Em] Week ${weekNumber} has ${outside.length} game(s) outside its Tue→Tue span ` +
          `(anchor ${weekStart.toISOString().slice(0, 10)}): ${outside.map((game) => game.date).join(", ")}`
      );
    }

    // Find Thursday games for lock time (used for UI indication)
    const thursdayGames = weekGames.filter(g => {
      const d = new Date(g.date);
      return d.getUTCDay() === 4;
    });

    // A week with no Thursday game (bye/holiday week) locks at its first
    // kickoff instead of leaving thursday_kickoff null.
    const earliestThursday = thursdayGames.length > 0
      ? thursdayGames.sort((a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
        )[0]
      : byKickoff[0];

    planned.push({
      weekNumber,
      weekStartDate: weekStart.toISOString().slice(0, 10),
      weekEndDate: weekEnd.toISOString().slice(0, 10),
      thursdayKickoff: earliestThursday.date,
      gamesCount: weekGames.length,
    });
  }

  assertNoOverlappingWeekSpans(planned);

  const weeks: NFLWeek[] = [];

  for (const plan of planned) {
    const { data: week, error } = await supabaseAdmin
      .from("nfl_pickem_weeks")
      .upsert({
        season,
        week_number: plan.weekNumber,
        week_start_date: plan.weekStartDate,
        week_end_date: plan.weekEndDate,
        thursday_kickoff: plan.thursdayKickoff,
        games_count: plan.gamesCount,
        synced_at: new Date().toISOString(),
      }, {
        onConflict: "season,week_number",
      })
      .select()
      .single();

    if (error) {
      console.error(`Failed to sync week ${plan.weekNumber}:`, error);
      continue;
    }

    weeks.push(mapNFLWeekRow(week));
  }

  return weeks.sort((a, b) => a.weekNumber - b.weekNumber);
}
