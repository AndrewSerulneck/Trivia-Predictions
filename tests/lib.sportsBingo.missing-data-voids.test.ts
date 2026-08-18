import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Phase 2a of docs/bingo-correctness-and-wnba-repair-plan.md.
//
// The file's own stated rule is "missing data voids, it never misses." The NFL arm of
// `evaluateResolver` obeys this everywhere; the NBA/WNBA arm did not, at 21 resolver kinds, all
// of the same shape: `if (!nbaStatsSnapshot) { … return { status: "miss" } }`. The trigger is
// `refreshSportsBingoProgress`'s 12-hour force-finalize fallback, which synthesizes
// `{ homeScore: null, awayScore: null, completed: true }` with no stats snapshot at all — at
// which point a market resolver reads `!hasGameScore` and voids, while a stats resolver read
// `completed === true` with no snapshot and missed. Same missing-data condition, two different
// answers on the same card. This file proves that inconsistency is gone.
//
// Deliberately calls `evaluateResolver` directly rather than routing through
// `refreshSportsBingoProgress` + a mocked Supabase/balldontlie double (contrast
// `nfl-settlement.test.ts`) — the bug and the fix live entirely inside one pure function, so a
// unit call is the more direct proof and needs no fixture plumbing.

import { evaluateResolver, isResolverEligibleForVoidRegrade, type SportsBingoResolver } from "@/lib/sportsBingo";

// The exact fallback shape `refreshSportsBingoProgress` (~lib/sportsBingo.ts:10806) synthesizes
// once the 12-hour force-finalize window passes with no score.
const FORCE_FINALIZED_NO_SCORE = {
  gameId: "1",
  sportKey: "basketball_nba",
  homeTeam: "Home",
  awayTeam: "Away",
  homeScore: null,
  awayScore: null,
  completed: true,
} as const;

// A normal in-progress snapshot, for the "no over-reach" control group — completed is false, so
// a missing snapshot here must stay `pending`, not flip to `void`.
const IN_PROGRESS_NO_SCORE = {
  ...FORCE_FINALIZED_NO_SCORE,
  completed: false,
} as const;

// One resolver per shape called out in the plan: a player kind, a team kind, a quarter kind, and
// a halftime kind. Each is also one of the 21/22 guard sites touched by the fix.
const PLAYER_KIND: SportsBingoResolver = {
  kind: "nba_player_stat_at_least",
  player: "Player One",
  metric: "points",
  threshold: 20,
};
const TEAM_KIND: SportsBingoResolver = {
  kind: "nba_team_stat_at_least",
  team: "home",
  metric: "points",
  threshold: 100,
};
const QUARTER_KIND: SportsBingoResolver = {
  kind: "nba_team_points_in_any_quarter_at_least",
  team: "home",
  threshold: 30,
};
const HALFTIME_KIND: SportsBingoResolver = {
  kind: "nba_team_leads_at_halftime",
  team: "home",
};

const REPRESENTATIVE_SAMPLE: { label: string; resolver: SportsBingoResolver }[] = [
  { label: "player kind (nba_player_stat_at_least)", resolver: PLAYER_KIND },
  { label: "team kind (nba_team_stat_at_least)", resolver: TEAM_KIND },
  { label: "quarter kind (nba_team_points_in_any_quarter_at_least)", resolver: QUARTER_KIND },
  { label: "halftime kind (nba_team_leads_at_halftime)", resolver: HALFTIME_KIND },
];

// All 22 guard sites the fix touched (21 resolver kinds — team_triple_double and
// any_triple_double share one guard). Re-derived independently of the plan's own enumeration by
// reading every `case` in `evaluateResolver` with a bare `!nbaStatsSnapshot` guard.
const ALL_TOUCHED_RESOLVERS: { label: string; resolver: SportsBingoResolver }[] = [
  { label: "nba_player_stat_at_least", resolver: PLAYER_KIND },
  { label: "nba_player_double_double", resolver: { kind: "nba_player_double_double", player: "Player One" } },
  { label: "team_triple_double", resolver: { kind: "team_triple_double", team: "home" } },
  { label: "any_triple_double", resolver: { kind: "any_triple_double" } },
  { label: "nba_team_stat_at_least", resolver: TEAM_KIND },
  {
    label: "nba_team_players_scored_at_least",
    resolver: { kind: "nba_team_players_scored_at_least", team: "home", threshold: 5 },
  },
  { label: "nba_player_triple_double", resolver: { kind: "nba_player_triple_double", player: "Player One" } },
  { label: "nba_player_perfect_ft", resolver: { kind: "nba_player_perfect_ft", player: "Player One" } },
  { label: "nba_player_perfect_fg", resolver: { kind: "nba_player_perfect_fg", player: "Player One" } },
  { label: "nba_player_triple_threat", resolver: { kind: "nba_player_triple_threat", player: "Player One" } },
  { label: "nba_player_zero_turnovers", resolver: { kind: "nba_player_zero_turnovers", player: "Player One" } },
  {
    label: "nba_player_plus_minus_at_least",
    resolver: { kind: "nba_player_plus_minus_at_least", player: "Player One", threshold: 10 },
  },
  { label: "nba_team_has_double_double", resolver: { kind: "nba_team_has_double_double", team: "home" } },
  {
    label: "nba_team_three_pt_scorers",
    resolver: { kind: "nba_team_three_pt_scorers", team: "home", threshold: 3 },
  },
  {
    label: "nba_team_turnovers_at_most",
    resolver: { kind: "nba_team_turnovers_at_most", team: "home", threshold: 12 },
  },
  { label: "nba_team_outrebounds", resolver: { kind: "nba_team_outrebounds", team: "home" } },
  {
    label: "nba_player_bench_scores",
    resolver: { kind: "nba_player_bench_scores", player: "Player One", threshold: 10 },
  },
  { label: "nba_team_scores_first", resolver: { kind: "nba_team_scores_first", team: "home" } },
  { label: "nba_team_leads_at_halftime", resolver: HALFTIME_KIND },
  { label: "nba_team_points_in_any_quarter_at_least", resolver: QUARTER_KIND },
  {
    label: "nba_player_points_first_half_at_least",
    resolver: { kind: "nba_player_points_first_half_at_least", player: "Player One", threshold: 10 },
  },
  {
    label: "nba_player_assists_in_any_quarter_at_least",
    resolver: { kind: "nba_player_assists_in_any_quarter_at_least", player: "Player One", threshold: 5 },
  },
  {
    label: "nba_player_steals_first_half_at_least",
    resolver: { kind: "nba_player_steals_first_half_at_least", player: "Player One", threshold: 2 },
  },
];

describe("evaluateResolver — missing stats snapshot voids instead of missing (Phase 2a)", () => {
  it("reproduces production: force-finalized with no snapshot voids across a representative sample", () => {
    for (const { label, resolver } of REPRESENTATIVE_SAMPLE) {
      const result = evaluateResolver(resolver, FORCE_FINALIZED_NO_SCORE, null, null, null);
      expect(result, label).toEqual({ status: "void", resolved: true });
    }
  });

  it("voids across every one of the 21 resolver kinds this phase touches", () => {
    for (const { label, resolver } of ALL_TOUCHED_RESOLVERS) {
      const result = evaluateResolver(resolver, FORCE_FINALIZED_NO_SCORE, null, null, null);
      expect(result.status, label).toBe("void");
      expect(result.resolved, label).toBe(true);
    }
  });

  it("the consistency property: a market resolver and a stats resolver never disagree on the same missing-data condition", () => {
    // A market (score-based) resolver reading the exact same synthesized snapshot.
    const marketResult = evaluateResolver({ kind: "moneyline", team: "home" }, FORCE_FINALIZED_NO_SCORE, null, null, null);
    expect(marketResult.status).not.toBe("miss");

    for (const { label, resolver } of REPRESENTATIVE_SAMPLE) {
      const statsResult = evaluateResolver(resolver, FORCE_FINALIZED_NO_SCORE, null, null, null);
      expect(statsResult.status, label).not.toBe("miss");
    }
  });

  it("no over-reach: a snapshot that has not arrived yet (game in progress) still stays pending, not void", () => {
    for (const { label, resolver } of REPRESENTATIVE_SAMPLE) {
      const result = evaluateResolver(resolver, IN_PROGRESS_NO_SCORE, null, null, null);
      expect(result, label).toEqual({ status: "pending", resolved: false });
    }
  });

  it("no over-reach: a present snapshot where the player/team is genuinely below threshold at Final still misses", () => {
    const finalizedSnapshot = {
      finalized: true,
      // Minimal shape — only the fields `findNBAPlayerStatLine` / `buildNBATeamAggregates` need to
      // return "nobody found" / "zero across the board" without throwing.
      lines: [],
      byPlayerKey: new Map(),
      lineupByPlayerId: new Map(),
      firstHalfByPlayerId: new Map(),
      maxQuarterAssistsByPlayerId: new Map(),
      homeMaxQuarterPoints: 0,
      awayMaxQuarterPoints: 0,
      homeHalftimeScore: 40,
      awayHalftimeScore: 45,
      firstScoringTeam: "away",
      homeHasTripleDouble: false,
      awayHasTripleDouble: false,
      anyHasTripleDouble: false,
    } as any;

    const playerResult = evaluateResolver(PLAYER_KIND, { ...FORCE_FINALIZED_NO_SCORE, completed: true }, finalizedSnapshot, null, null);
    expect(playerResult.status).toBe("miss");

    const teamResult = evaluateResolver(TEAM_KIND, { ...FORCE_FINALIZED_NO_SCORE, completed: true }, finalizedSnapshot, null, null);
    expect(teamResult.status).toBe("miss");

    const halftimeResult = evaluateResolver(HALFTIME_KIND, { ...FORCE_FINALIZED_NO_SCORE, completed: true }, finalizedSnapshot, null, null);
    expect(halftimeResult.status === "hit" || halftimeResult.status === "miss").toBe(true);
  });

  it("every voided kind is reachable by the void-regrade seam, so a late box score can reopen it", () => {
    for (const { label, resolver } of ALL_TOUCHED_RESOLVERS) {
      expect(isResolverEligibleForVoidRegrade(resolver), label).toBe(true);
    }
  });
});
