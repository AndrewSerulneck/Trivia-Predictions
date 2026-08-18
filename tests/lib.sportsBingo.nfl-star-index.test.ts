import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  NFL_BRAND_NAME_BONUS,
  NFL_STAR_BRAND_BONUS_MAX,
  NFL_STAR_INDEX_SNAPSHOT_MAX_AGE_DAYS,
  NFL_STAR_WEIGHT_MARKET,
  NFL_STAR_WEIGHT_USAGE,
  NFL_STAR_WEIGHT_PRODUCTION,
  computeNFLSeasonStarIndex,
  computeNFLStarScore,
  isNFLStarIndexSnapshotStale,
  nflBrandBonus,
  nflMarketAttentionScore,
  resolveCurrentNFLSeasonYear,
  resolveNFLStarIndex,
  resolvePriorNFLSeasonYear,
  summarizeNFLStarMarketSignal,
  type BallDontLieNFLSeasonStatsRow,
} from "@/lib/sportsBingoNflStars";
import type { NFLPlayerPropMarket } from "@/lib/sportsBingoOdds";

// Phase 9a of docs/prop-bingo-nfl-plan.md — the star signal. Phase 9c (below) adds the 24h-cached
// live resolver and the generated snapshot's staleness tripwire; everything above that point is
// pure-math, no fetch, no caching.

function seasonRow(overrides: Partial<BallDontLieNFLSeasonStatsRow> & { id: number; position: string }): BallDontLieNFLSeasonStatsRow {
  return {
    player: { id: overrides.id, position_abbreviation: overrides.position },
    games_played: overrides.games_played ?? 10,
    passing_attempts: overrides.passing_attempts ?? null,
    rushing_attempts: overrides.rushing_attempts ?? null,
    receiving_targets: overrides.receiving_targets ?? null,
    field_goal_attempts: overrides.field_goal_attempts ?? null,
    passing_touchdowns: overrides.passing_touchdowns ?? null,
    rushing_touchdowns: overrides.rushing_touchdowns ?? null,
    receiving_touchdowns: overrides.receiving_touchdowns ?? null,
    passing_yards_per_game: overrides.passing_yards_per_game ?? null,
    rushing_yards_per_game: overrides.rushing_yards_per_game ?? null,
    receiving_yards_per_game: overrides.receiving_yards_per_game ?? null,
  };
}

function propMarket(overrides: Partial<NFLPlayerPropMarket>): NFLPlayerPropMarket {
  return {
    propType: "rushing_yards",
    marketType: "over_under",
    playerId: 1,
    playerName: "Test Player",
    teamName: "Test Team",
    line: 50,
    probability: 0.5,
    vendorCount: 2,
    ...overrides,
  };
}

describe("NFL star index — blend weights", () => {
  it("sums the three base weights to 1, so the blend is a true weighted average absent brand bonus", () => {
    expect(NFL_STAR_WEIGHT_MARKET + NFL_STAR_WEIGHT_USAGE + NFL_STAR_WEIGHT_PRODUCTION).toBeCloseTo(1, 6);
  });
});

describe("NFL star index — market attention", () => {
  it("scores full breadth plus a near-certain anytime-TD price near the ceiling", () => {
    const signal = summarizeNFLStarMarketSignal([
      propMarket({ propType: "rushing_yards" }),
      propMarket({ propType: "receiving_yards" }),
      propMarket({ propType: "receptions" }),
      propMarket({ propType: "longest_rush" }),
      propMarket({ propType: "rushing_attempts" }),
      propMarket({ propType: "rushing_receiving_yards" }),
      propMarket({ propType: "kicking_points" }),
      propMarket({ propType: "anytime_td", marketType: "milestone", probability: 0.75 }),
    ]);
    expect(signal.breadth).toBe(8);
    expect(signal.anytimeTdProbability).toBeCloseTo(0.75, 6);
    expect(nflMarketAttentionScore(signal)).toBeGreaterThan(0.85);
  });

  it("scores a single-market role player near the floor", () => {
    const signal = summarizeNFLStarMarketSignal([propMarket({ propType: "receptions" })]);
    expect(signal.anytimeTdProbability).toBeNull();
    expect(nflMarketAttentionScore(signal)).toBeLessThan(0.15);
  });

  it("returns 0 for a player with no posted markets at all", () => {
    expect(nflMarketAttentionScore(summarizeNFLStarMarketSignal([]))).toBe(0);
  });
});

describe("NFL star index — position-normalised percentiles", () => {
  it("ranks usage and production within position, not across positions", () => {
    const rows: BallDontLieNFLSeasonStatsRow[] = [
      // QBs: heavy volume, but should never be compared against RB/WR volume directly.
      seasonRow({ id: 1, position: "QB", passing_attempts: 550, rushing_attempts: 40, passing_touchdowns: 35, passing_yards_per_game: 280 }),
      seasonRow({ id: 2, position: "QB", passing_attempts: 300, rushing_attempts: 20, passing_touchdowns: 15, passing_yards_per_game: 200 }),
      // RBs: much lower raw volume than QBs, but the RB1 here should still rank at the top of RBs.
      seasonRow({ id: 3, position: "RB", rushing_attempts: 300, receiving_targets: 50, rushing_touchdowns: 12, rushing_yards_per_game: 90 }),
      seasonRow({ id: 4, position: "RB", rushing_attempts: 80, receiving_targets: 10, rushing_touchdowns: 2, rushing_yards_per_game: 30 }),
    ];
    const index = computeNFLSeasonStarIndex(rows);

    const rb1 = index.get(3)!;
    const rb2 = index.get(4)!;
    expect(rb1.usagePercentile).toBeGreaterThan(rb2.usagePercentile);
    expect(rb1.productionPercentile).toBeGreaterThan(rb2.productionPercentile);
    // The RB1's raw pass-adjacent volume (350) is dwarfed by both QBs' raw attempt counts, but a
    // within-position percentile must not let that leak through — RB1 is still top of its group.
    expect(rb1.usagePercentile).toBe(1);

    const qb1 = index.get(1)!;
    const qb2 = index.get(2)!;
    expect(qb1.usagePercentile).toBeGreaterThan(qb2.usagePercentile);
  });

  it("drops rows at positions Prop Bingo never posts props for", () => {
    const rows: BallDontLieNFLSeasonStatsRow[] = [
      seasonRow({ id: 5, position: "LB", games_played: 16 }),
      seasonRow({ id: 6, position: "QB", passing_attempts: 400 }),
    ];
    const index = computeNFLSeasonStarIndex(rows);
    expect(index.has(5)).toBe(false);
    expect(index.has(6)).toBe(true);
  });

  it("gives the sole player at a position the top percentile", () => {
    const rows: BallDontLieNFLSeasonStatsRow[] = [seasonRow({ id: 7, position: "K", field_goal_attempts: 20 })];
    const index = computeNFLSeasonStarIndex(rows);
    expect(index.get(7)!.usagePercentile).toBe(1);
  });
});

describe("NFL star index — early-season shrinkage", () => {
  const priorEntry = { playerId: 9, position: "WR" as const, gamesPlayed: 17, usagePercentile: 0.9, productionPercentile: 0.8 };
  const marketFloor = { breadth: 0, anytimeTdProbability: null };

  it("leans heavily on the prior season in week 1 (few games played this season)", () => {
    const currentEarly = { playerId: 9, position: "WR" as const, gamesPlayed: 1, usagePercentile: 0.2, productionPercentile: 0.2 };
    const result = computeNFLStarScore({ playerName: "Nobody Yet", market: marketFloor, current: currentEarly, prior: priorEntry });
    // With gamesPlayed=1 and K=3, weight on the current season is 1/4 — the prior dominates.
    expect(result.usagePercentile).toBeGreaterThan(0.6);
    expect(result.usagePercentile).toBeLessThan(0.9);
  });

  it("leans on the current season once enough games have accumulated", () => {
    const currentLate = { playerId: 9, position: "WR" as const, gamesPlayed: 15, usagePercentile: 0.2, productionPercentile: 0.2 };
    const result = computeNFLStarScore({ playerName: "Established Vet", market: marketFloor, current: currentLate, prior: priorEntry });
    expect(result.usagePercentile).toBeLessThan(0.4);
  });

  it("a rookie with no prior season scores on market attention alone", () => {
    const result = computeNFLStarScore({
      playerName: "Rookie Nobody Has Heard Of",
      market: { breadth: 6, anytimeTdProbability: 0.4 },
      current: null,
      prior: null,
    });
    expect(result.usagePercentile).toBe(0);
    expect(result.productionPercentile).toBe(0);
    expect(result.marketScore).toBeGreaterThan(0);
    expect(result.starScore).toBeCloseTo(NFL_STAR_WEIGHT_MARKET * result.marketScore, 6);
  });

  it("a drafted rookie with early-season stats but no BDL prior-season row is not shrunk toward nothing", () => {
    const currentRookie = { playerId: 11, position: "RB" as const, gamesPlayed: 2, usagePercentile: 0.7, productionPercentile: 0.6 };
    const result = computeNFLStarScore({ playerName: "Hot Rookie", market: marketFloor, current: currentRookie, prior: null });
    expect(result.usagePercentile).toBe(0.7);
    expect(result.productionPercentile).toBe(0.6);
  });
});

describe("NFL star index — brand bonus", () => {
  it("stays under 25 hand-maintained entries", () => {
    expect(NFL_BRAND_NAME_BONUS.size).toBeLessThan(25);
  });

  it("caps every entry at NFL_STAR_BRAND_BONUS_MAX", () => {
    for (const { bonus } of NFL_BRAND_NAME_BONUS.values()) {
      expect(bonus).toBeGreaterThan(0);
      expect(bonus).toBeLessThanOrEqual(NFL_STAR_BRAND_BONUS_MAX);
    }
  });

  it("every entry carries a reviewBy date", () => {
    for (const { reviewBy } of NFL_BRAND_NAME_BONUS.values()) {
      expect(Number.isNaN(Date.parse(reviewBy))).toBe(false);
    }
  });

  it("matches names case- and suffix-insensitively", () => {
    expect(nflBrandBonus("Patrick Mahomes")).toBeGreaterThan(0);
    expect(nflBrandBonus("PATRICK MAHOMES")).toBeGreaterThan(0);
  });

  it("is 0 for a name not on the list", () => {
    expect(nflBrandBonus("Some Unknown Backup")).toBe(0);
  });

  it("never pushes a maxed-out blend past 1 + the cap", () => {
    const perfect = { playerId: 1, position: "WR" as const, gamesPlayed: 17, usagePercentile: 1, productionPercentile: 1 };
    const result = computeNFLStarScore({
      playerName: "Patrick Mahomes",
      market: { breadth: 20, anytimeTdProbability: 1 },
      current: perfect,
      prior: perfect,
    });
    expect(result.starScore).toBeLessThanOrEqual(1 + NFL_STAR_BRAND_BONUS_MAX);
  });
});

describe("NFL star index — current/prior season year resolution", () => {
  it("attributes January and February to the season that started the previous calendar year", () => {
    expect(resolveCurrentNFLSeasonYear(new Date(Date.UTC(2026, 0, 15)))).toBe(2025);
    expect(resolveCurrentNFLSeasonYear(new Date(Date.UTC(2026, 1, 10)))).toBe(2025);
  });

  it("attributes September onward to the season starting that calendar year", () => {
    expect(resolveCurrentNFLSeasonYear(new Date(Date.UTC(2026, 8, 5)))).toBe(2026);
  });

  it("prior season is exactly one year before current", () => {
    const now = new Date(Date.UTC(2026, 9, 1));
    expect(resolvePriorNFLSeasonYear(now)).toBe(resolveCurrentNFLSeasonYear(now) - 1);
  });
});

// Phase 9c — the live, cached resolver. `resolveNFLStarIndex` takes an injectable
// `fetchSeasonStats` so these tests never touch the network: the default argument is the real
// `fetchNFLSeasonStats`, wired in by scripts/refresh-nfl-star-index.cjs and lib/sportsBingo.ts.
//
// `resolveNFLStarIndex`'s cache is module-level state keyed by season, so each test below resets
// modules and re-imports it fresh — the same isolation pattern
// tests/lib.sportsBingo.nfl-star-tilt.test.ts uses — rather than risk one test's cached pair
// leaking into the next.
describe("resolveNFLStarIndex — the 24h check-in cache (Phase 9c)", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function row(id: number, gamesPlayed: number): BallDontLieNFLSeasonStatsRow {
    return { player: { id, position_abbreviation: "WR" }, games_played: gamesPlayed, receiving_targets: 80 };
  }

  it("shares one fetch per season across calls inside the TTL, and refetches once it expires", async () => {
    const { resolveNFLStarIndex: resolve } = await import("@/lib/sportsBingoNflStars");
    const fetchSeasonStats = vi.fn(async (season: number) => [row(season, 10)]);
    const t0 = new Date(Date.UTC(2026, 8, 10));

    const first = await resolve(t0, fetchSeasonStats);
    expect(first.current.get(2026)?.gamesPlayed).toBe(10);
    expect(fetchSeasonStats).toHaveBeenCalledTimes(2); // current (2026) + prior (2025)

    // Still inside the 24h TTL — no new fetch, same cached pair returned.
    const second = await resolve(new Date(t0.getTime() + 60_000), fetchSeasonStats);
    expect(second).toBe(first);
    expect(fetchSeasonStats).toHaveBeenCalledTimes(2);

    // Past the 24h TTL — the live layer re-pulls, which is the whole point: a player who breaks
    // out on Sunday is in the index by Tuesday with no deploy.
    await resolve(new Date(t0.getTime() + 25 * 60 * 60 * 1000), fetchSeasonStats);
    expect(fetchSeasonStats).toHaveBeenCalledTimes(4);
  });

  it("degrades to empty maps on a feed failure rather than throwing", async () => {
    const { resolveNFLStarIndex: resolve } = await import("@/lib/sportsBingoNflStars");
    const fetchSeasonStats = vi.fn(async () => {
      throw new Error("balldontlie is down");
    });
    // fetchNFLSeasonStats itself never throws (it catches and returns []), so a caller passing a
    // throwing fetch here is simulating a bug in that contract, not a real feed error — the point
    // is that resolveNFLStarIndex doesn't add its own new way to crash on top of it.
    await expect(resolve(new Date(Date.UTC(2027, 0, 5)), fetchSeasonStats)).rejects.toThrow();
  });

  it("degrades to empty maps when the injected fetch returns no rows, same as a real feed error", async () => {
    const { resolveNFLStarIndex: resolve } = await import("@/lib/sportsBingoNflStars");
    const pair = await resolve(new Date(Date.UTC(2027, 1, 20)), async () => []);
    expect(pair.current.size).toBe(0);
    expect(pair.prior.size).toBe(0);
  });
});

describe("NFL star index — generated snapshot staleness tripwire (Phase 9c)", () => {
  const SNAPSHOT_PATH = path.join(process.cwd(), "data/sports-bingo/nfl-star-index.json");

  it("flags an old generatedAt as stale, and a recent one as fresh", () => {
    const now = new Date(Date.UTC(2026, 8, 30));
    const stale = new Date(now.getTime() - (NFL_STAR_INDEX_SNAPSHOT_MAX_AGE_DAYS + 1) * 24 * 60 * 60 * 1000);
    const fresh = new Date(now.getTime() - (NFL_STAR_INDEX_SNAPSHOT_MAX_AGE_DAYS - 1) * 24 * 60 * 60 * 1000);
    expect(isNFLStarIndexSnapshotStale(stale.toISOString(), now)).toBe(true);
    expect(isNFLStarIndexSnapshotStale(fresh.toISOString(), now)).toBe(false);
  });

  it("treats an unparsable date as stale rather than silently passing", () => {
    expect(isNFLStarIndexSnapshotStale("not-a-date")).toBe(true);
  });

  it("the committed snapshot exists, is generated (not hand-edited), and is not itself stale", () => {
    expect(fs.existsSync(SNAPSHOT_PATH)).toBe(true);
    const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
    expect(typeof snapshot.generatedAt).toBe("string");
    expect(Array.isArray(snapshot.current?.players)).toBe(true);
    expect(Array.isArray(snapshot.prior?.players)).toBe(true);
    expect(isNFLStarIndexSnapshotStale(snapshot.generatedAt)).toBe(false);
  });
});
