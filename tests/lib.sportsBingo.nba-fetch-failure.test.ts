import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Phase 2b of docs/bingo-correctness-and-wnba-repair-plan.md.
 *
 * `fetchBallDontLieList` degrades both a network error and a non-OK response to `[]` — it never
 * throws (see lib/ballDontLieClient.ts). Before this phase, `getNBAGamePlayerStatsSnapshot` could
 * not tell that degraded `[]` apart from a real "the game had no qualifying rows" `[]`, so a failed
 * box-score fetch produced a fully-formed, zero-filled snapshot instead of `null` — which every
 * resolver then read as "this event definitively did not happen" (a false `miss`, not a `void`).
 * This is the mechanism that mis-settled all 43 WNBA squares in production before Phase 3's
 * endpoint fixes made the fetches succeed; Phase 3 removed that one instance, this phase closes the
 * general case (rate limit, outage, schema change, a future league on the wrong path).
 *
 * This file drives the real `getNBAGamePlayerStatsSnapshot` (not a reimplementation) under a
 * per-path-controllable mock of `@/lib/ballDontLieClient`, so it proves the actual failure-box
 * wiring rather than a mirror of it.
 */

const GAME_ID = 500001;
const HOME_TEAM = "Home Team";
const AWAY_TEAM = "Away Team";

const gameRow = {
  id: GAME_ID,
  status: "Final",
  status_state: "final",
  date: "2026-08-12T02:00:00.000Z",
  home_team: { id: 1, full_name: HOME_TEAM },
  visitor_team: { id: 2, full_name: AWAY_TEAM },
  home_team_score: 100,
  visitor_team_score: 90,
};

const statRow = {
  player: { id: 777, first_name: "Star", last_name: "Player" },
  team: { full_name: HOME_TEAM },
  pts: 25,
  reb: 10,
  ast: 8,
  stl: 2,
  blk: 1,
  turnover: 3,
  fg3m: 2,
  fgm: 9,
  fga: 18,
  ftm: 5,
  fta: 6,
  oreb: 2,
  dreb: 8,
  min: "34:00",
  plus_minus: 12,
};

const scoringPlayRow = {
  period: 1,
  home_score: 2,
  away_score: 0,
  scoring_play: true,
  team: { full_name: HOME_TEAM },
};

/**
 * Controls which endpoint suffix fails on the next call and counts calls per suffix, so tests can
 * assert both "did the failure propagate correctly" and "did the cache actually skip a refetch."
 * Reset in `beforeEach` — module-level because `vi.mock` factories run before any `beforeEach`.
 */
const failing = new Set<string>();
/** Like `failing`, but returns `[]` without setting the failure box — a real "provider said empty". */
const emptying = new Set<string>();
const callCounts = new Map<string, number>();
const countCall = (path: string) => {
  for (const suffix of ["/games", "/stats", "/lineups", "/plays"]) {
    if (path.endsWith(suffix)) {
      callCounts.set(suffix, (callCounts.get(suffix) ?? 0) + 1);
      return;
    }
  }
};

vi.mock("@/lib/ballDontLieClient", () => ({
  isBallDontLieConfigured: () => true,
  fetchBallDontLieJson: async () => ({}),
  fetchBallDontLieList: async (path: string, _query: URLSearchParams, options?: { failure?: { failed: boolean } }) => {
    countCall(path);
    const suffix = ["/games", "/stats", "/lineups", "/plays"].find((s) => path.endsWith(s));
    if (suffix && failing.has(suffix)) {
      if (options?.failure) options.failure.failed = true;
      return [];
    }
    if (suffix && emptying.has(suffix)) {
      return [];
    }
    if (path.endsWith("/games")) return [gameRow];
    if (path.endsWith("/stats")) return [statRow];
    if (path.endsWith("/lineups")) return [];
    if (path.endsWith("/plays")) return [scoringPlayRow];
    return [];
  },
}));

import { getNBAGamePlayerStatsSnapshot, NBA_PLAYER_STATS_CACHE_MS, NBA_PLAYER_STATS_FAILURE_CACHE_MS } from "@/lib/sportsBingo";

const card = (gameId: string) =>
  ({
    game_id: gameId,
    sport_key: "basketball_nba",
    home_team: HOME_TEAM,
    away_team: AWAY_TEAM,
    starts_at: "2026-08-12T02:00:00.000Z",
  }) as Parameters<typeof getNBAGamePlayerStatsSnapshot>[0];

let nextGameId = 1;
/** A fresh `game_id` per test so nobody reads another test's cache entry. */
const freshCard = () => card(String(nextGameId++));

beforeEach(() => {
  failing.clear();
  emptying.clear();
  callCounts.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getNBAGamePlayerStatsSnapshot — a failed fetch must not look like a real zero (Phase 2b)", () => {
  it("box-score fetch fails: the whole snapshot is null, not a zero-filled one", async () => {
    failing.add("/stats");
    const snapshot = await getNBAGamePlayerStatsSnapshot(freshCard());
    expect(snapshot).toBeNull();
  });

  it("box-score fetch succeeds with genuinely no rows: that is a real result, not a failure — snapshot is non-null with empty lines", async () => {
    emptying.add("/stats");
    const snapshot = await getNBAGamePlayerStatsSnapshot(freshCard());
    expect(snapshot).not.toBeNull();
    expect(snapshot?.lines).toHaveLength(0);
  });

  it("plays fetch fails, box score succeeds: box-score squares still have data; quarter/halftime extras are marked unavailable, not zeroed", async () => {
    failing.add("/plays");
    const snapshot = await getNBAGamePlayerStatsSnapshot(freshCard());
    expect(snapshot).not.toBeNull();
    // Box score grading is untouched by the plays failure.
    expect(snapshot?.lines).toHaveLength(1);
    expect(snapshot?.lines[0]?.pts).toBe(25);
    // The plays-derived extras are flagged unavailable rather than defaulting to "nothing scored".
    expect(snapshot?.quarterExtrasAvailable).toBe(false);
    expect(snapshot?.firstScoringTeam).toBeNull();
    expect(snapshot?.homeMaxQuarterPoints).toBe(0);
    // Lineups did not fail, so that flag is untouched by the plays failure.
    expect(snapshot?.lineupDataAvailable).toBe(true);
  });

  it("lineups fetch fails: lineupDataAvailable is false; box-score and plays data are untouched", async () => {
    failing.add("/lineups");
    const snapshot = await getNBAGamePlayerStatsSnapshot(freshCard());
    expect(snapshot).not.toBeNull();
    expect(snapshot?.lineupDataAvailable).toBe(false);
    expect(snapshot?.lines).toHaveLength(1);
    expect(snapshot?.quarterExtrasAvailable).toBe(true);
  });

  it("a successful snapshot gets the full TTL: a repeat call inside the failure window still hits the cache, not the network", async () => {
    const c = freshCard();
    await getNBAGamePlayerStatsSnapshot(c);
    const gamesCallsAfterFirst = callCounts.get("/games") ?? 0;
    vi.advanceTimersByTime(NBA_PLAYER_STATS_FAILURE_CACHE_MS + 1);
    await getNBAGamePlayerStatsSnapshot(c);
    expect(callCounts.get("/games") ?? 0).toBe(gamesCallsAfterFirst); // still cached, no new fetch
  });

  it("a failure gets the short negative TTL, not the full one: a repeat call past the failure window refetches", async () => {
    failing.add("/stats");
    const c = freshCard();
    const first = await getNBAGamePlayerStatsSnapshot(c);
    expect(first).toBeNull();
    const gamesCallsAfterFirst = callCounts.get("/games") ?? 0;
    expect(gamesCallsAfterFirst).toBeGreaterThan(0);

    // Still well inside the full success TTL, but past the short failure TTL.
    vi.advanceTimersByTime(NBA_PLAYER_STATS_FAILURE_CACHE_MS + 1);
    expect(NBA_PLAYER_STATS_FAILURE_CACHE_MS).toBeLessThan(NBA_PLAYER_STATS_CACHE_MS);
    await getNBAGamePlayerStatsSnapshot(c);
    expect(callCounts.get("/games") ?? 0).toBeGreaterThan(gamesCallsAfterFirst); // refetched
  });
});
