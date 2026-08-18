import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  MLB_BRAND_NAME_BONUS,
  MLB_BRAND_NAME_KEYS,
  MLB_STAR_BRAND_BONUS_MAX,
  MLB_STAR_INDEX_SNAPSHOT_MAX_AGE_DAYS,
  MLB_STAR_MARKET_BREADTH_NORM_BATTER,
  MLB_STAR_MARKET_BREADTH_NORM_PITCHER,
  MLB_STAR_PRIOR_SHRINKAGE_K,
  MLB_STAR_WEIGHT_MARKET,
  MLB_STAR_WEIGHT_PRODUCTION,
  MLB_STAR_WEIGHT_USAGE,
  computeMLBSeasonStarIndex,
  computeMLBStarScore,
  isMLBStarIndexSnapshotStale,
  mlbBrandBonus,
  mlbMarketAttentionScore,
  resolveCurrentMLBSeasonYear,
  resolveMLBStarGroup,
  resolvePriorMLBSeasonYear,
  summarizeMLBStarMarketSignal,
  type BallDontLieMLBSeasonStatsRow,
  type MLBSeasonStarIndexEntry,
} from "@/lib/sportsBingoMlbStars";
import type { MLBPlayerPropMarket } from "@/lib/sportsBingoOdds";

// Phase 9d of docs/prop-bingo-nfl-plan.md — the MLB star signal, mirroring
// tests/lib.sportsBingo.nfl-star-index.test.ts. Everything here is pure math against hand-built
// fixtures except the `resolveMLBStarIndex` block at the bottom, which injects its fetch.

function batterRow(
  overrides: { id: number; position?: string } & Partial<BallDontLieMLBSeasonStatsRow>
): BallDontLieMLBSeasonStatsRow {
  return {
    batting_gp: overrides.batting_gp ?? 100,
    batting_ab: overrides.batting_ab ?? 350,
    batting_bb: overrides.batting_bb ?? 40,
    batting_r: overrides.batting_r ?? 50,
    batting_hr: overrides.batting_hr ?? 15,
    batting_rbi: overrides.batting_rbi ?? 55,
    batting_tb: overrides.batting_tb ?? 160,
    ...overrides,
    player: { id: overrides.id, position: overrides.position ?? "LF" },
  };
}

function pitcherRow(
  overrides: { id: number; position?: string } & Partial<BallDontLieMLBSeasonStatsRow>
): BallDontLieMLBSeasonStatsRow {
  return {
    pitching_gp: overrides.pitching_gp ?? 25,
    pitching_ip: overrides.pitching_ip ?? 140,
    pitching_k: overrides.pitching_k ?? 150,
    pitching_k_per_9: overrides.pitching_k_per_9 ?? 9.6,
    ...overrides,
    player: { id: overrides.id, position: overrides.position ?? "SP" },
  };
}

function propMarket(overrides: Partial<MLBPlayerPropMarket>): MLBPlayerPropMarket {
  return {
    marketKey: "player_hits",
    propType: "hits",
    marketType: "over_under",
    playerId: 1,
    playerName: "Test Player",
    teamName: "Test Team",
    line: 0.5,
    probability: 0.55,
    vendorCount: 4,
    ...overrides,
  };
}

const entry = (over: Partial<MLBSeasonStarIndexEntry> = {}): MLBSeasonStarIndexEntry => ({
  playerId: 1,
  group: "batter",
  gamesPlayed: 100,
  usagePercentile: 0.5,
  productionPercentile: 0.5,
  ...over,
});

describe("MLB star groups", () => {
  it("reads both of balldontlie's position vocabularies", () => {
    // Confirmed live 2026-08-17: a season pull carries "RP" and "Relief Pitcher" on the same page.
    expect(resolveMLBStarGroup("SP")).toBe("pitcher");
    expect(resolveMLBStarGroup("RP")).toBe("pitcher");
    expect(resolveMLBStarGroup("P")).toBe("pitcher");
    expect(resolveMLBStarGroup("Starting Pitcher")).toBe("pitcher");
    expect(resolveMLBStarGroup("Relief Pitcher")).toBe("pitcher");
    expect(resolveMLBStarGroup("SS")).toBe("batter");
    expect(resolveMLBStarGroup("Left Fielder")).toBe("batter");
    expect(resolveMLBStarGroup("DH")).toBe("batter");
  });

  it("treats an unknown or empty position as a batter rather than dropping the player", () => {
    // A two-way player or a mis-typed position must not vanish from the index entirely.
    expect(resolveMLBStarGroup("")).toBe("batter");
    expect(resolveMLBStarGroup("UTIL")).toBe("batter");
  });
});

describe("computeMLBSeasonStarIndex — percentiles within group", () => {
  it("ranks a player against their own group, never across batter/pitcher", () => {
    // The pitcher has far fewer "usage" units (140 IP) than any batter's plate appearances, so a
    // pooled ranking would bury him. Within his own group of one he is the top.
    const index = computeMLBSeasonStarIndex([
      batterRow({ id: 1, batting_ab: 100, batting_bb: 5 }),
      batterRow({ id: 2, batting_ab: 500, batting_bb: 80 }),
      pitcherRow({ id: 3, pitching_ip: 140 }),
    ]);
    expect(index.get(2)!.usagePercentile).toBeGreaterThan(index.get(1)!.usagePercentile);
    expect(index.get(3)!.group).toBe("pitcher");
    expect(index.get(3)!.usagePercentile).toBe(1);
  });

  it("scores batting production off both the counting line and total bases", () => {
    const index = computeMLBSeasonStarIndex([
      batterRow({ id: 1, batting_hr: 2, batting_rbi: 10, batting_r: 10, batting_tb: 60 }),
      batterRow({ id: 2, batting_hr: 40, batting_rbi: 110, batting_r: 100, batting_tb: 330 }),
      batterRow({ id: 3, batting_hr: 20, batting_rbi: 60, batting_r: 55, batting_tb: 200 }),
    ]);
    expect(index.get(2)!.productionPercentile).toBeGreaterThan(index.get(3)!.productionPercentile);
    expect(index.get(3)!.productionPercentile).toBeGreaterThan(index.get(1)!.productionPercentile);
  });

  it("drops a row with no games played in its own discipline", () => {
    // An injured-list season carries no signal and would otherwise sit at the bottom of every
    // percentile and compress the live scale for everyone above it.
    const index = computeMLBSeasonStarIndex([
      batterRow({ id: 1 }),
      batterRow({ id: 2, batting_gp: 0 }),
      pitcherRow({ id: 3, pitching_gp: 0 }),
    ]);
    expect(index.has(1)).toBe(true);
    expect(index.has(2)).toBe(false);
    expect(index.has(3)).toBe(false);
  });

  it("ignores rows with no usable player id", () => {
    const index = computeMLBSeasonStarIndex([
      { player: { id: null, position: "LF" }, batting_gp: 100, batting_ab: 400 },
      batterRow({ id: 7 }),
    ]);
    expect(index.size).toBe(1);
    expect(index.has(7)).toBe(true);
  });
});

describe("mlbMarketAttentionScore — breadth normalised per group", () => {
  it("infers the group from the market keys, not from the season index", () => {
    // A rookie call-up the stats feed has never seen still needs the right breadth norm; the books
    // posting `pitcher_outs` on someone is proof enough that he is pitching.
    const pitcher = summarizeMLBStarMarketSignal([
      propMarket({ marketKey: "player_strikeouts_pitcher", propType: "pitcher_strikeouts" }),
      propMarket({ marketKey: "player_pitcher_outs", propType: "pitcher_outs" }),
    ]);
    expect(pitcher.group).toBe("pitcher");
    expect(summarizeMLBStarMarketSignal([propMarket({})]).group).toBe("batter");
  });

  it("lets a fully-covered pitcher reach the same market score as a fully-covered batter", () => {
    // The bug this norm split exists to prevent: with one shared norm of 5, a pitcher tops out at
    // 3/5 by construction and no ace can out-score a bench outfielder.
    const pitcher = mlbMarketAttentionScore({
      breadth: MLB_STAR_MARKET_BREADTH_NORM_PITCHER,
      group: "pitcher",
      homeRunProbability: null,
    });
    const batter = mlbMarketAttentionScore({
      breadth: MLB_STAR_MARKET_BREADTH_NORM_BATTER,
      group: "batter",
      homeRunProbability: 0.25,
    });
    expect(pitcher).toBe(1);
    expect(batter).toBeCloseTo(1, 5);
  });

  it("does not penalise a pitcher for having no home-run market", () => {
    // Folding a missing term in as a zero would hand every pitcher a flat 0.4 penalty.
    const thin = mlbMarketAttentionScore({ breadth: 1, group: "pitcher", homeRunProbability: null });
    const full = mlbMarketAttentionScore({ breadth: 3, group: "pitcher", homeRunProbability: null });
    expect(full).toBeGreaterThan(thin);
    expect(full).toBe(1);
  });

  it("separates a covered hitter from a one-market bench bat", () => {
    const star = summarizeMLBStarMarketSignal([
      propMarket({ marketKey: "player_hits" }),
      propMarket({ marketKey: "player_home_runs", probability: 0.24 }),
      propMarket({ marketKey: "player_rbis" }),
      propMarket({ marketKey: "player_runs" }),
      propMarket({ marketKey: "player_stolen_bases" }),
    ]);
    const bench = summarizeMLBStarMarketSignal([propMarket({ marketKey: "player_hits" })]);
    expect(star.breadth).toBe(5);
    expect(star.homeRunProbability).toBeCloseTo(0.24, 5);
    expect(mlbMarketAttentionScore(star)).toBeGreaterThan(mlbMarketAttentionScore(bench) + 0.4);
  });
});

describe("computeMLBStarScore — the blend and its shrinkage", () => {
  it("weights the three signals as documented", () => {
    const result = computeMLBStarScore({
      playerName: "Nobody Famous",
      market: { breadth: MLB_STAR_MARKET_BREADTH_NORM_BATTER, group: "batter", homeRunProbability: 0.25 },
      current: entry({ gamesPlayed: 10_000, usagePercentile: 1, productionPercentile: 1 }),
      prior: entry({ usagePercentile: 1, productionPercentile: 1 }),
    });
    expect(result.marketScore).toBeCloseTo(1, 5);
    expect(result.starScore).toBeCloseTo(
      MLB_STAR_WEIGHT_MARKET + MLB_STAR_WEIGHT_USAGE + MLB_STAR_WEIGHT_PRODUCTION,
      5
    );
  });

  it("blends toward the prior season early and trusts the current one late", () => {
    const inputs = (gamesPlayed: number) => ({
      playerName: "Nobody Famous",
      market: { breadth: 0, group: "batter" as const, homeRunProbability: null },
      current: entry({ gamesPlayed, usagePercentile: 1, productionPercentile: 1 }),
      prior: entry({ usagePercentile: 0, productionPercentile: 0 }),
    });
    const april = computeMLBStarScore(inputs(3));
    const august = computeMLBStarScore(inputs(120));
    // w = gp / (gp + K): three games in, the prior season still dominates.
    expect(april.usagePercentile).toBeCloseTo(3 / (3 + MLB_STAR_PRIOR_SHRINKAGE_K), 5);
    expect(august.usagePercentile).toBeGreaterThan(0.88);
    expect(august.usagePercentile).toBeGreaterThan(april.usagePercentile);
  });

  it("scores a rookie with no prior season on market attention plus his own live usage", () => {
    // No prior to shrink toward, so the current value is used outright — his April usage is real
    // signal, it just has no season to blend against.
    const rookie = computeMLBStarScore({
      playerName: "Brand New Callup",
      market: { breadth: 5, group: "batter", homeRunProbability: 0.2 },
      current: entry({ gamesPlayed: 4, usagePercentile: 0.9, productionPercentile: 0.8 }),
      prior: null,
    });
    expect(rookie.usagePercentile).toBe(0.9);
    expect(rookie.productionPercentile).toBe(0.8);
  });

  it("degrades to market attention alone when the season feed gave nothing", () => {
    const noIndex = computeMLBStarScore({
      playerName: "Nobody Famous",
      market: { breadth: 5, group: "batter", homeRunProbability: 0.25 },
      current: null,
      prior: null,
    });
    expect(noIndex.usagePercentile).toBe(0);
    expect(noIndex.productionPercentile).toBe(0);
    expect(noIndex.starScore).toBeCloseTo(MLB_STAR_WEIGHT_MARKET * 1, 5);
  });
});

describe("MLB brand bonus — capped, dated, and the single source for the branded HR square", () => {
  it("never exceeds the cap and is 0 for an unlisted name", () => {
    for (const [, value] of MLB_BRAND_NAME_BONUS) {
      expect(value.bonus).toBeLessThanOrEqual(MLB_STAR_BRAND_BONUS_MAX);
      expect(value.bonus).toBeGreaterThan(0);
    }
    expect(mlbBrandBonus("Shohei Ohtani")).toBeLessThanOrEqual(MLB_STAR_BRAND_BONUS_MAX);
    expect(mlbBrandBonus("Some Unknown Backup")).toBe(0);
  });

  it("stays small — if the list is doing the work, the signal is broken", () => {
    expect(MLB_BRAND_NAME_BONUS.size).toBeLessThanOrEqual(25);
  });

  it("carries a review date on every entry", () => {
    for (const [name, value] of MLB_BRAND_NAME_BONUS) {
      expect(value.reviewBy, `${name} needs a reviewBy date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isFinite(Date.parse(value.reviewBy))).toBe(true);
    }
  });

  it("is keyed by the same normalization the resolver uses, suffixes stripped", () => {
    // `MLB_BRAND_NAME_KEYS` is what the `mlb_star_hr:` branded-square feature reads, so a mismatch
    // here silently turns that feature off rather than failing loudly — which is exactly what the
    // hardcoded list this replaces did for the two generational-suffix names: it stored them as
    // "fernando tatis jr" / "vladimir guerrero jr", while `normalizeNameKey` strips the suffix, so
    // neither could ever match. Both are live now.
    expect(mlbBrandBonus("Fernando Tatis Jr.")).toBeGreaterThan(0);
    expect(mlbBrandBonus("Vladimir Guerrero Jr.")).toBeGreaterThan(0);
    expect(mlbBrandBonus("Aaron Judge")).toBeGreaterThan(0);
    expect(MLB_BRAND_NAME_KEYS.has("shohei ohtani")).toBe(true);
    expect(MLB_BRAND_NAME_KEYS.size).toBe(MLB_BRAND_NAME_BONUS.size);
    // No key may carry a suffix the normalizer would have removed — that is the shape of the bug.
    for (const key of MLB_BRAND_NAME_KEYS) {
      expect(key, `${key} would never match a normalized name`).not.toMatch(/\b(jr|sr|ii|iii|iv|v)\b/);
      expect(key).toBe(key.toLowerCase().trim());
    }
  });

  it("cannot push a maxed-out blend past 1 + the cap", () => {
    const perfect = entry({ usagePercentile: 1, productionPercentile: 1, gamesPlayed: 162 });
    const result = computeMLBStarScore({
      playerName: "Shohei Ohtani",
      market: { breadth: 50, group: "batter", homeRunProbability: 1 },
      current: perfect,
      prior: perfect,
    });
    expect(result.starScore).toBeLessThanOrEqual(1 + MLB_STAR_BRAND_BONUS_MAX);
  });

  it("cannot set a tier on its own — the bonus is smaller than the market signal it rides on", () => {
    const branded = computeMLBStarScore({
      playerName: "Shohei Ohtani",
      market: { breadth: 0, group: "batter", homeRunProbability: null },
      current: null,
      prior: null,
    });
    const coveredUnknown = computeMLBStarScore({
      playerName: "Nobody Famous",
      market: { breadth: MLB_STAR_MARKET_BREADTH_NORM_BATTER, group: "batter", homeRunProbability: 0.25 },
      current: null,
      prior: null,
    });
    expect(branded.starScore).toBeLessThan(coveredUnknown.starScore);
  });
});

describe("MLB season year resolution", () => {
  it("names a season for the calendar year it is played in", () => {
    // The NFL offset does not apply: MLB 2026 runs March-November 2026.
    expect(resolveCurrentMLBSeasonYear(new Date(Date.UTC(2026, 3, 15)))).toBe(2026);
    expect(resolveCurrentMLBSeasonYear(new Date(Date.UTC(2026, 9, 20)))).toBe(2026);
  });

  it("attributes January and February to the season that just ended", () => {
    expect(resolveCurrentMLBSeasonYear(new Date(Date.UTC(2027, 0, 15)))).toBe(2026);
    expect(resolveCurrentMLBSeasonYear(new Date(Date.UTC(2027, 1, 10)))).toBe(2026);
  });

  it("prior season is exactly one year before current", () => {
    const now = new Date(Date.UTC(2026, 6, 1));
    expect(resolvePriorMLBSeasonYear(now)).toBe(resolveCurrentMLBSeasonYear(now) - 1);
  });
});

describe("resolveMLBStarIndex — the 24h check-in cache", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const row = (id: number, gamesPlayed: number): BallDontLieMLBSeasonStatsRow => ({
    player: { id, position: "LF" },
    batting_gp: gamesPlayed,
    batting_ab: 400,
  });

  it("shares one fetch per season across calls inside the TTL, and refetches once it expires", async () => {
    const { resolveMLBStarIndex: resolve } = await import("@/lib/sportsBingoMlbStars");
    const fetchSeasonStats = vi.fn(async (season: number) => [row(season, 100)]);
    const t0 = new Date(Date.UTC(2026, 6, 10));

    const first = await resolve(t0, fetchSeasonStats);
    expect(first.current.get(2026)?.gamesPlayed).toBe(100);
    expect(fetchSeasonStats).toHaveBeenCalledTimes(2); // current (2026) + prior (2025)

    const second = await resolve(new Date(t0.getTime() + 60_000), fetchSeasonStats);
    expect(second).toBe(first);
    expect(fetchSeasonStats).toHaveBeenCalledTimes(2);

    await resolve(new Date(t0.getTime() + 25 * 60 * 60 * 1000), fetchSeasonStats);
    expect(fetchSeasonStats).toHaveBeenCalledTimes(4);
  });

  it("degrades to empty maps when the feed returns no rows — no index, no tilt", async () => {
    // This is the documented failure contract for both sports: a feed failure never reaches for the
    // committed snapshot, it just stops tilting.
    const { resolveMLBStarIndex: resolve } = await import("@/lib/sportsBingoMlbStars");
    const pair = await resolve(new Date(Date.UTC(2026, 4, 20)), async () => []);
    expect(pair.current.size).toBe(0);
    expect(pair.prior.size).toBe(0);
  });

  it("keys its cache by season, so a January call does not serve December's pair", async () => {
    const { resolveMLBStarIndex: resolve } = await import("@/lib/sportsBingoMlbStars");
    const fetchSeasonStats = vi.fn(async (season: number) => [row(season, 100)]);
    await resolve(new Date(Date.UTC(2026, 6, 1)), fetchSeasonStats);
    expect(fetchSeasonStats).toHaveBeenCalledTimes(2);
    // Season 2027 — a different cache key, so it re-pulls even though the TTL has not elapsed in
    // wall-clock terms for the previous entry.
    await resolve(new Date(Date.UTC(2027, 6, 1)), fetchSeasonStats);
    expect(fetchSeasonStats).toHaveBeenCalledTimes(4);
  });
});

describe("MLB star index — generated snapshot staleness tripwire", () => {
  const SNAPSHOT_PATH = path.join(process.cwd(), "data/sports-bingo/mlb-star-index.json");

  it("flags an old generatedAt as stale, and a recent one as fresh", () => {
    const now = new Date(Date.UTC(2026, 8, 30));
    const stale = new Date(now.getTime() - (MLB_STAR_INDEX_SNAPSHOT_MAX_AGE_DAYS + 1) * 24 * 60 * 60 * 1000);
    const fresh = new Date(now.getTime() - (MLB_STAR_INDEX_SNAPSHOT_MAX_AGE_DAYS - 1) * 24 * 60 * 60 * 1000);
    expect(isMLBStarIndexSnapshotStale(stale.toISOString(), now)).toBe(true);
    expect(isMLBStarIndexSnapshotStale(fresh.toISOString(), now)).toBe(false);
  });

  it("treats an unparsable date as stale rather than silently passing", () => {
    expect(isMLBStarIndexSnapshotStale("not-a-date")).toBe(true);
  });

  it("the committed snapshot exists, is generated (not hand-edited), and is not itself stale", () => {
    expect(fs.existsSync(SNAPSHOT_PATH)).toBe(true);
    const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
    expect(typeof snapshot.generatedAt).toBe("string");
    expect(Array.isArray(snapshot.current?.players)).toBe(true);
    expect(Array.isArray(snapshot.prior?.players)).toBe(true);
    expect(isMLBStarIndexSnapshotStale(snapshot.generatedAt)).toBe(false);
  });

  it("the committed snapshot carries both groups, ranked, with names joined back", () => {
    const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
    const players = snapshot.current.players.length > 0 ? snapshot.current.players : snapshot.prior.players;
    expect(players.length).toBeGreaterThan(100);
    expect(new Set(players.map((p: { group: string }) => p.group))).toEqual(new Set(["batter", "pitcher"]));
    // Named, so the diff report is readable by a human rather than a list of ids.
    expect(players.filter((p: { name: string | null }) => p.name).length).toBeGreaterThan(players.length * 0.9);
  });
});
