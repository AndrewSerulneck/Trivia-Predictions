import "server-only";

import { hasUpcomingGamesInWindow } from "@/lib/sportsBingo";

// Phase 1 of docs/prop-bingo-nfl-plan.md — season gating (ask #1).
//
// Off (default): every league in `LEAGUE_SEASON_WINDOWS` is always reported in-season, matching
// today's always-clickable picker. On: `resolveLeagueSeasonStatus` below is consulted by the
// picker UI and by the server-side guards on /api/bingo/games and board generation.
const truthy = (value: string | undefined): boolean => {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
};

export const isSeasonGatingEnabled = (): boolean => truthy(process.env.NEXT_PUBLIC_BINGO_SEASON_GATING_ENABLED);

/**
 * NFL activation switch (plan Phase 2). Deliberately independent of season gating: it holds NFL
 * back until the whole NFL pipeline — market-derived core squares (Phase 2), the prop mix
 * (Phase 3) and grading (Phase 4) — is ready, even though the live feed starts reporting NFL
 * in-season on its own as Week 1 enters the lookahead window.
 *
 * Off (default): the picker reports NFL as "Coming soon" and the server rejects NFL board
 * requests outright, so a deep link can't route around the picker. On: NFL behaves like any other
 * league and is gated only by its real season status. Flipping this env var is the entire
 * activation, in both directions — there is no code change on either side of the switch.
 */
export const isNflGameplayEnabled = (): boolean => truthy(process.env.NEXT_PUBLIC_BINGO_NFL_ENABLED);

export const NFL_SPORT_KEY = "americanfootball_nfl";

// Player-facing names for known leagues, keyed off the same table as `LEAGUE_SEASON_WINDOWS` so a
// rejection message never echoes caller-supplied input back into the UI
// (`SportsBingoSelectBoard` renders `payload.error` verbatim).
const LEAGUE_DISPLAY_NAMES: Record<string, string> = {
  basketball_nba: "NBA",
  basketball_wnba: "WNBA",
  baseball_mlb: "MLB",
  americanfootball_nfl: "NFL",
};

function displayNameForLeague(sportKey: string): string {
  return LEAGUE_DISPLAY_NAMES[sportKey] ?? "This league";
}

/**
 * The one place that decides whether a `sportKey` may be used for Sports Bingo right now, so the
 * picker, /api/bingo/games and board creation can't drift apart. Returns null when allowed, or a
 * player-facing reason when not.
 */
export async function resolveLeagueBlockReason(sportKey: string): Promise<string | null> {
  if (sportKey === NFL_SPORT_KEY && !isNflGameplayEnabled()) {
    return "NFL Sports Bingo is coming soon.";
  }
  if (!isSeasonGatingEnabled()) {
    return null;
  }
  const seasonInfo = await resolveLeagueSeasonStatus(sportKey);
  if (seasonInfo.status !== "out_of_season") {
    return null;
  }
  return `${displayNameForLeague(sportKey)} is out of season.${seasonInfo.resumesLabel ? ` ${seasonInfo.resumesLabel}.` : ""}`;
}

// How far ahead the live feed is trusted as the primary signal. balldontlie lists games well
// before kickoff (NFL Week 1 games were visible 25 days out per Phase 0 findings), so this needs
// to be wider than the ~36h board-generation lookahead in lib/sportsBingo.ts.
const SEASON_LOOKAHEAD_DAYS = 14;

export type LeagueSeasonStatus = "in_season" | "out_of_season";

export type LeagueSeasonInfo = {
  status: LeagueSeasonStatus;
  resumesLabel?: string;
};

type LeagueSeasonWindow = {
  // Month is 1-12. A window where startMonth/startDay is later in the year than
  // endMonth/endDay wraps across the New Year (e.g. NFL: September -> February).
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
};

// Hand-maintained calendar fallback, only consulted when the live feed has nothing in the
// lookahead window (empty catalog and upstream errors look identical from the caller's side,
// and that's intentional — one bad API minute must never blank a live league, so both cases
// defer to this table rather than to "no games").
//
// Per Andrew's 2026-08-16 decision (docs/prop-bingo-nfl-phase0-findings.md §0): balldontlie
// carries zero NFL preseason games (not thin — zero), so NFL's window models regular season +
// postseason only. There is no preseason carve-out to add here or anywhere downstream.
export const LEAGUE_SEASON_WINDOWS: Record<string, LeagueSeasonWindow> = {
  basketball_nba: { startMonth: 10, startDay: 1, endMonth: 6, endDay: 30 },
  basketball_wnba: { startMonth: 5, startDay: 1, endMonth: 10, endDay: 31 },
  baseball_mlb: { startMonth: 3, startDay: 20, endMonth: 11, endDay: 5 },
  americanfootball_nfl: { startMonth: 9, startDay: 1, endMonth: 2, endDay: 15 },
};

const MONTH_NAMES = [
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
];

function isWithinWindow(window: LeagueSeasonWindow, now: Date): boolean {
  const year = now.getUTCFullYear();
  const start = Date.UTC(year, window.startMonth - 1, window.startDay);
  const end = Date.UTC(year, window.endMonth - 1, window.endDay, 23, 59, 59, 999);
  const nowMs = now.getTime();
  const wraps =
    window.startMonth > window.endMonth || (window.startMonth === window.endMonth && window.startDay > window.endDay);

  if (!wraps) {
    return nowMs >= start && nowMs <= end;
  }
  return nowMs >= start || nowMs <= end;
}

function nextWindowStart(window: LeagueSeasonWindow, now: Date): Date {
  const year = now.getUTCFullYear();
  let candidate = new Date(Date.UTC(year, window.startMonth - 1, window.startDay));
  if (candidate.getTime() <= now.getTime()) {
    candidate = new Date(Date.UTC(year + 1, window.startMonth - 1, window.startDay));
  }
  return candidate;
}

function resumesLabelFor(window: LeagueSeasonWindow, now: Date): string {
  const start = nextWindowStart(window, now);
  return `Returns ${MONTH_NAMES[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
}

/**
 * In-season if the live catalog has any game inside the lookahead window; otherwise falls back
 * to the hand-maintained calendar. A league with no calendar entry fails open (in-season) —
 * there's nothing to gate it against.
 */
export async function resolveLeagueSeasonStatus(sportKey: string): Promise<LeagueSeasonInfo> {
  const window = LEAGUE_SEASON_WINDOWS[sportKey];

  const hasLiveGames = await hasUpcomingGamesInWindow(sportKey, SEASON_LOOKAHEAD_DAYS);
  if (hasLiveGames) {
    return { status: "in_season" };
  }

  if (!window) {
    return { status: "in_season" };
  }

  const now = new Date();
  if (isWithinWindow(window, now)) {
    return { status: "in_season" };
  }

  return { status: "out_of_season", resumesLabel: resumesLabelFor(window, now) };
}
