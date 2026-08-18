import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  boardRespectsDirectionalCap,
  directionalSignatures,
  estimateCorrelatedBoardWinProbability,
  exposureForResolver,
  probit,
} from "@/lib/sportsBingoCorrelation";

// Phase 5b of docs/prop-bingo-nfl-plan.md. Two properties carry the whole module:
//   1. the copula must reproduce every square's marginal probability *exactly* — otherwise it
//      silently re-prices the de-vigged market numbers Phase 2/3 exist to produce;
//   2. correlated squares must make a line likelier than independence says, because that gap is
//      the entire reason the old estimator mis-stated board difficulty.

const LINE_PATTERNS: number[][] = (() => {
  const lines: number[][] = [];
  for (let row = 0; row < 5; row += 1) lines.push([0, 1, 2, 3, 4].map((col) => row * 5 + col));
  for (let col = 0; col < 5; col += 1) lines.push([0, 1, 2, 3, 4].map((row) => row * 5 + col));
  lines.push([0, 6, 12, 18, 24]);
  lines.push([4, 8, 12, 16, 20]);
  return lines;
})();

/** Marginal hit rate of a single square, measured by treating index 0 as a one-square "line". */
function measureMarginal(resolver: Parameters<typeof exposureForResolver>[0], probability: number): number {
  return estimateCorrelatedBoardWinProbability(
    [{ index: 0, probability, isFree: false, resolver }],
    [[0]],
    12_000
  );
}

function independentEstimate(
  squares: Array<{ index: number; probability: number; isFree: boolean }>,
  trials = 40_000
): number {
  let wins = 0;
  for (let trial = 0; trial < trials; trial += 1) {
    const hits = new Array<boolean>(25).fill(false);
    for (const square of squares) {
      hits[square.index] = square.isFree || Math.random() < square.probability;
    }
    if (LINE_PATTERNS.some((line) => line.every((index) => hits[index]))) wins += 1;
  }
  return wins / trials;
}

describe("probit", () => {
  it("inverts the standard normal CDF at the landmarks", () => {
    expect(probit(0.5)).toBeCloseTo(0, 9);
    expect(probit(0.975)).toBeCloseTo(1.959964, 5);
    expect(probit(0.025)).toBeCloseTo(-1.959964, 5);
    expect(probit(0.8413447)).toBeCloseTo(1, 5);
    expect(probit(0.0013499)).toBeCloseTo(-3, 4);
  });

  it("stays finite at the asymptotes rather than returning ±Infinity", () => {
    expect(Number.isFinite(probit(0))).toBe(true);
    expect(Number.isFinite(probit(1))).toBe(true);
    expect(probit(0)).toBeLessThan(-6);
    expect(probit(1)).toBeGreaterThan(6);
  });
});

describe("marginal preservation", () => {
  // Every family gets checked, because each one reaches the latent value by a different route:
  // pure margin, pure closeness (which goes through the folded-normal remap), and player factors.
  const cases: Array<[string, Parameters<typeof exposureForResolver>[0]]> = [
    ["moneyline", { kind: "moneyline", team: "home" } as const],
    ["game total", { kind: "game_total_over", line: 44.5 } as const],
    ["team total", { kind: "team_total_under", team: "away", line: 20.5 } as const],
    ["margin band", { kind: "nfl_margin_at_most", line: 6.5 } as const],
    ["overtime", { kind: "nfl_overtime" } as const],
    ["player prop", { kind: "player_prop", marketKey: "rushing_yards", player: "a", line: 60.5, direction: "over" } as const],
    ["anytime td", { kind: "nfl_player_anytime_td", player: "b" } as const],
    // Phase 8b — one per new family. Each reaches the latent value by a different route (team
    // loading, total loading, closeness), and every one of them must still reproduce its own
    // marginal exactly, because those marginals are the measured base rates from the 2025 sweep.
    ["team stat at least", { kind: "nfl_team_stat_at_least", team: "home", field: "total_yards", threshold: 330 } as const],
    ["team stat at most", { kind: "nfl_team_stat_at_most", team: "away", field: "turnovers", threshold: 0 } as const],
    ["combined team stat", { kind: "nfl_combined_team_stat_at_least", field: "penalty_yards", threshold: 95 } as const],
    ["combined team stat at most", { kind: "nfl_combined_team_stat_at_most", field: "turnovers", threshold: 0 } as const],
    ["perfect red zone", { kind: "nfl_team_perfect_red_zone", team: "home", minTrips: 3 } as const],
    ["red zone trip without td", { kind: "nfl_team_red_zone_trip_without_touchdown", team: "away" } as const],
    ["possession advantage", { kind: "nfl_team_possession_advantage", team: "home", seconds: 300 } as const],
    ["game max stat", { kind: "nfl_game_max_stat_at_least", field: "receiving_yards", threshold: 75, scope: "any_player" } as const],
    ["game max stat both teams", { kind: "nfl_game_max_stat_at_least", field: "passing_yards", threshold: 180, scope: "both_teams" } as const],
    ["game total stat", { kind: "nfl_game_total_stat_at_least", field: "punts_inside_20", threshold: 3 } as const],
    ["missed field goal", { kind: "nfl_game_missed_field_goal" } as const],
    ["non-qb pass", { kind: "nfl_non_quarterback_pass_attempt" } as const],
    ["first score within minutes", { kind: "nfl_first_score_within_minutes", minutes: 6 } as const],
    ["score in final minutes", { kind: "nfl_score_in_final_minutes", segment: "fourth_quarter", minutes: 2 } as const],
    ["both teams lead", { kind: "nfl_both_teams_lead" } as const],
    ["lead change second half", { kind: "nfl_lead_change_second_half" } as const],
    ["tied after halftime", { kind: "nfl_tied_after_halftime" } as const],
    ["winner trailed in fourth", { kind: "nfl_winner_trailed_in_fourth" } as const],
    ["two point conversion", { kind: "nfl_two_point_conversion" } as const],
    ["safety", { kind: "nfl_safety" } as const],
    ["goal line touchdown", { kind: "nfl_goal_line_touchdown", yards: 1 } as const],
  ];

  for (const [name, resolver] of cases) {
    it(`reproduces the marginal for a ${name} square`, () => {
      for (const probability of [0.1, 0.35, 0.6, 0.9]) {
        expect(measureMarginal(resolver, probability)).toBeCloseTo(probability, 1);
      }
    });
  }

  /**
   * The tripwire the plan calls "the sharp edge of the whole phase".
   *
   * `exposureForResolver`'s `default` case treats an unknown kind as independent noise. Shipping a
   * new resolver kind without an entry there silently re-creates the exact defect Phase 5b exists
   * to fix — for the new squares only, invisibly, with the estimator still reporting a confident
   * number. Nothing at runtime catches that, so this is a static check: every NFL kind that appears
   * in `lib/sportsBingo.ts` must have a `case` in `lib/sportsBingoCorrelation.ts`.
   */
  it("gives every NFL resolver kind an explicit exposure entry, never the default", () => {
    const resolverSource = readFileSync(join(process.cwd(), "lib/sportsBingo.ts"), "utf8");
    const exposureSource = readFileSync(join(process.cwd(), "lib/sportsBingoCorrelation.ts"), "utf8");

    const kinds = new Set<string>();
    for (const match of resolverSource.matchAll(/kind: "(nfl_[a-z0-9_]+)"/g)) {
      kinds.add(match[1]);
    }
    // Sanity: if the scan finds nothing the assertion below would pass vacuously.
    expect(kinds.size).toBeGreaterThan(30);

    const missing = [...kinds].filter((kind) => !exposureSource.includes(`case "${kind}":`)).sort();
    expect(missing).toEqual([]);
  });

  it("treats a free square as a certain hit and an unknown resolver as pure noise", () => {
    expect(
      estimateCorrelatedBoardWinProbability([{ index: 0, probability: 0, isFree: true, resolver: { kind: "free" } }], [[0]], 2_000)
    ).toBe(1);
    // `replacement_auto` carries no exposure, so it must still hit at exactly its stated rate.
    expect(measureMarginal({ kind: "replacement_auto" }, 0.4)).toBeCloseTo(0.4, 1);
  });
});

describe("correlation", () => {
  it("makes an aligned board win far more often than independence predicts", () => {
    // A board a bettor would recognise as one-directional: every core square wants the home team
    // to score and the game to go over. This is the shape the old estimator priced as ~28%.
    const squares: Array<{ index: number; probability: number; isFree: boolean; resolver: Parameters<typeof exposureForResolver>[0] }> = [];
    let index = 0;
    const push = (resolver: Parameters<typeof exposureForResolver>[0], probability: number) => {
      if (index === 12) index += 1;
      squares.push({ index, probability, isFree: false, resolver });
      index += 1;
    };

    push({ kind: "moneyline", team: "home" }, 0.62);
    for (const line of [1.5, 3.5, 5.5, 7.5]) push({ kind: "spread_more_than", team: "home", line }, 0.58);
    for (const line of [41.5, 44.5, 47.5, 50.5]) push({ kind: "game_total_over", line }, 0.6);
    for (const line of [18.5, 20.5, 22.5, 24.5]) push({ kind: "team_total_over", team: "home", line }, 0.6);
    for (const line of [17.5, 19.5, 21.5]) push({ kind: "team_total_over", team: "away", line }, 0.55);
    for (const player of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      push({ kind: "player_prop", marketKey: "receiving_yards", player, line: 50.5, direction: "over" }, 0.55);
    }
    squares.push({ index: 12, probability: 1, isFree: true, resolver: { kind: "free" } });
    expect(squares).toHaveLength(25);

    const correlated = estimateCorrelatedBoardWinProbability(squares, LINE_PATTERNS, 12_000);
    const independent = independentEstimate(squares);

    // The direction is the point, and it is never the other way round for an aligned board.
    expect(correlated).toBeGreaterThan(independent + 0.05);
  });

  it("ties two props on the same player together more tightly than two on different players", () => {
    const pair = (playerA: string, playerB: string) =>
      estimateCorrelatedBoardWinProbability(
        [
          { index: 0, probability: 0.5, isFree: false, resolver: { kind: "player_prop", marketKey: "receiving_yards", player: playerA, line: 50.5, direction: "over" } },
          { index: 1, probability: 0.5, isFree: false, resolver: { kind: "player_prop", marketKey: "receptions", player: playerB, line: 4.5, direction: "over" } },
        ],
        [[0, 1]],
        20_000
      );

    expect(pair("mahomes", "mahomes")).toBeGreaterThan(pair("mahomes", "kelce") + 0.02);
  });

  it("moves a prop with its own team's total when the team is known, and with the game's when it is not", () => {
    const withTeam = exposureForResolver(
      { kind: "player_prop", marketKey: "rushing_yards", player: "barkley", line: 89.5, direction: "over" },
      "home"
    );
    const withoutTeam = exposureForResolver(
      { kind: "player_prop", marketKey: "rushing_yards", player: "barkley", line: 89.5, direction: "over" },
      null
    );

    expect(withTeam.home).toBeGreaterThan(0);
    expect(withTeam.away).toBe(0);
    // No hint: the same total magnitude, split across both teams (the game-pace direction).
    expect(withoutTeam.home).toBeCloseTo(withoutTeam.away, 9);
    expect(Math.hypot(withoutTeam.home, withoutTeam.away)).toBeCloseTo(withTeam.home, 9);
  });

  it("points the under side of a prop the opposite way from the over side", () => {
    const over = exposureForResolver({ kind: "player_prop", marketKey: "passing_yards", player: "p", line: 250.5, direction: "over" }, "away");
    const under = exposureForResolver({ kind: "player_prop", marketKey: "passing_yards", player: "p", line: 250.5, direction: "under" }, "away");
    expect(over.away).toBeGreaterThan(0);
    expect(under.away).toBe(-over.away);
    expect(under.player).toBe(-over.player);
  });
});

describe("directional signatures and the per-line cap", () => {
  it("labels each core market with the bet it actually is", () => {
    expect(directionalSignatures({ kind: "moneyline", team: "home" })).toEqual(["margin+"]);
    expect(directionalSignatures({ kind: "moneyline", team: "away" })).toEqual(["margin-"]);
    expect(directionalSignatures({ kind: "game_total_over", line: 44.5 })).toEqual(["total+"]);
    expect(directionalSignatures({ kind: "game_total_under", line: 44.5 })).toEqual(["total-"]);
    expect(directionalSignatures({ kind: "nfl_margin_at_most", line: 6.5 })).toEqual(["close+"]);
    expect(directionalSignatures({ kind: "nfl_margin_at_least", line: 13.5 })).toEqual(["close-"]);
  });

  it("counts a team total as both a margin bet and a total bet, because it is both", () => {
    expect(directionalSignatures({ kind: "team_total_over", team: "home", line: 24.5 })).toEqual(["margin+", "total+"]);
    expect(directionalSignatures({ kind: "team_total_under", team: "home", line: 24.5 })).toEqual(["margin-", "total-"]);
  });

  it("leaves noisy squares out of the cap entirely", () => {
    // Player props and halftime leaders correlate too weakly to be worth constraining structurally;
    // the estimator already prices them. Counting them would make the cap bind on every board.
    expect(directionalSignatures({ kind: "player_prop", marketKey: "receptions", player: "p", line: 4.5, direction: "over" }, "home")).toEqual([]);
    expect(directionalSignatures({ kind: "nfl_team_leads_at_halftime", team: "home" })).toEqual([]);
    expect(directionalSignatures({ kind: "nfl_non_offensive_touchdown" })).toEqual([]);
    expect(directionalSignatures({ kind: "free" })).toEqual([]);
  });

  it("rejects a line stacked on one directional bet and accepts a mixed one", () => {
    const line = [0, 1, 2, 3, 4];
    const stacked = [
      { index: 0, resolver: { kind: "moneyline", team: "home" } as const, isFree: false },
      { index: 1, resolver: { kind: "spread_more_than", team: "home", line: 3.5 } as const, isFree: false },
      { index: 2, resolver: { kind: "spread_more_than", team: "home", line: 7.5 } as const, isFree: false },
      { index: 3, resolver: { kind: "team_total_over", team: "home", line: 24.5 } as const, isFree: false },
      { index: 4, resolver: { kind: "nfl_overtime" } as const, isFree: false },
    ];
    expect(boardRespectsDirectionalCap(stacked, [line])).toBe(false);

    const mixed = [
      { index: 0, resolver: { kind: "moneyline", team: "home" } as const, isFree: false },
      { index: 1, resolver: { kind: "spread_more_than", team: "home", line: 3.5 } as const, isFree: false },
      { index: 2, resolver: { kind: "game_total_under", line: 47.5 } as const, isFree: false },
      { index: 3, resolver: { kind: "nfl_margin_at_least", line: 13.5 } as const, isFree: false },
      { index: 4, resolver: { kind: "player_prop", marketKey: "receptions", player: "p", line: 4.5, direction: "over" } as const, isFree: false },
    ];
    expect(boardRespectsDirectionalCap(mixed, [line])).toBe(true);
  });

  it("does not count the free square against any direction", () => {
    const line = [0, 1, 2, 3, 4];
    const withFree = [
      { index: 0, resolver: { kind: "moneyline", team: "home" } as const, isFree: false },
      { index: 1, resolver: { kind: "spread_more_than", team: "home", line: 3.5 } as const, isFree: false },
      { index: 2, resolver: { kind: "team_total_over", team: "home", line: 24.5 } as const, isFree: false },
      { index: 3, resolver: { kind: "free" } as const, isFree: true },
      { index: 4, resolver: { kind: "game_total_under", line: 47.5 } as const, isFree: false },
    ];
    expect(boardRespectsDirectionalCap(withFree, [line])).toBe(true);
  });
});
