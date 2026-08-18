import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildBasketballPlayWalkExtras } from "@/lib/sportsBingo";

/**
 * Phase 3b of docs/bingo-correctness-and-wnba-repair-plan.md — "a live NBA fix riding along in a
 * WNBA phase," called out explicitly per the plan so an NBA reviewer doesn't have to discover it.
 *
 * Two defects, verified live 2026-08-18 against real completed games in **both** leagues (not
 * WNBA-specific):
 *
 * 1. `/plays` rejects `game_ids[]` (400) for both NBA and WNBA; it wants a scalar `game_id`. This
 *    is exercised by the live validator (`npm run bingo:validate:wnba`), not here — this file
 *    covers the walk itself, which is the part cheap to unit-test.
 * 2. The payload field is `scoring_play`, not `is_scoring_play` — confirmed on a real NBA play row
 *    (`{ scoring_play: true, ... }`, no `is_scoring_play` key at all) and a real WNBA one. Our code
 *    read `is_scoring_play`, which exists on neither league's rows, so `firstScoringTeam` has never
 *    been populated for NBA in production — this is not a WNBA-only defect.
 *
 * `buildBasketballPlayWalkExtras` was pulled out of `getNBAGamePlayerStatsSnapshot` in this same
 * phase specifically so this fix is testable without mocking network.
 */

const card = (homeTeam: string, awayTeam: string) => ({ home_team: homeTeam, away_team: awayTeam }) as Parameters<typeof buildBasketballPlayWalkExtras>[1];

const nbaCard = card("New York Knicks", "San Antonio Spurs");

const scoringPlay = (overrides: Record<string, unknown>) => ({
  period: 1,
  home_score: 0,
  away_score: 0,
  team: { full_name: "New York Knicks" },
  ...overrides,
});

describe("buildBasketballPlayWalkExtras reads scoring_play, the real NBA/WNBA field name", () => {
  it("reads a real NBA play row shape (scoring_play, no is_scoring_play key) and finds the first scorer", () => {
    const plays = [scoringPlay({ home_score: 2, away_score: 0, scoring_play: true })];
    expect("is_scoring_play" in plays[0]!).toBe(false);
    const extras = buildBasketballPlayWalkExtras(plays as never, nbaCard);
    expect(extras.firstScoringTeam).toBe("home");
  });

  it("falls back to is_scoring_play if a future payload variant reintroduces it, without preferring it over scoring_play", () => {
    const plays = [
      scoringPlay({ home_score: 0, away_score: 2, team: { full_name: "San Antonio Spurs" }, is_scoring_play: true, scoring_play: false }),
    ];
    // scoring_play (false) wins over is_scoring_play (true) when both are present — "read whichever
    // exists" means falling back only when scoring_play is absent, not preferring is_scoring_play.
    const extras = buildBasketballPlayWalkExtras(plays as never, nbaCard);
    expect(extras.firstScoringTeam).toBeNull();
  });

  it("before the fix (is_scoring_play only, the field that never existed on a real row) firstScoringTeam stays null forever", () => {
    const plays = [scoringPlay({ home_score: 2, away_score: 0, is_scoring_play: undefined, scoring_play: undefined })];
    const extras = buildBasketballPlayWalkExtras(plays as never, nbaCard);
    expect(extras.firstScoringTeam).toBeNull();
  });
});

describe("buildBasketballPlayWalkExtras computes halftime scores and max quarter points from real play rows", () => {
  it("halftime score is the running score at the end of period 2", () => {
    const plays = [
      scoringPlay({ period: 1, home_score: 10, away_score: 8, scoring_play: true }),
      scoringPlay({ period: 2, home_score: 22, away_score: 19, scoring_play: false }),
      scoringPlay({ period: 3, home_score: 30, away_score: 28, scoring_play: false }),
    ];
    const extras = buildBasketballPlayWalkExtras(plays as never, nbaCard);
    expect(extras.homeHalftimeScore).toBe(22);
    expect(extras.awayHalftimeScore).toBe(19);
  });

  it("max quarter points is the largest single-quarter gain, not the running total", () => {
    const plays = [
      scoringPlay({ period: 1, home_score: 20, away_score: 15, scoring_play: true }),
      scoringPlay({ period: 2, home_score: 35, away_score: 32, scoring_play: false }),
      scoringPlay({ period: 3, home_score: 50, away_score: 60, scoring_play: false }),
      scoringPlay({ period: 4, home_score: 70, away_score: 75, scoring_play: false }),
    ];
    const extras = buildBasketballPlayWalkExtras(plays as never, nbaCard);
    // period gains: home [20, 15, 15, 20], away [15, 17, 28, 15] — largest is away's Q3 (28)
    expect(extras.homeMaxQuarterPoints).toBe(20);
    expect(extras.awayMaxQuarterPoints).toBe(28);
  });

  it("an empty plays response (matches the pre-fix 400) leaves every extra at its safe default", () => {
    const extras = buildBasketballPlayWalkExtras([], nbaCard);
    expect(extras.firstScoringTeam).toBeNull();
    expect(extras.homeHalftimeScore).toBeNull();
    expect(extras.awayHalftimeScore).toBeNull();
    expect(extras.homeMaxQuarterPoints).toBe(0);
    expect(extras.awayMaxQuarterPoints).toBe(0);
  });
});
