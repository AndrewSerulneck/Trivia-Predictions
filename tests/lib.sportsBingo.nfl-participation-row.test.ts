import { describe, expect, it, vi } from "vitest";
import nflFixture from "@/tests/fixtures/bingo-brunswick-grove-2026-09-09.json";
import { gradeResolversAgainstCompletedNFLGame, type SportsBingoResolver } from "@/lib/sportsBingo";
vi.mock("server-only", () => ({}));

type Raw = Record<string, unknown>;

// Captured 2026-10-10 from /nfl/v1/stats?game_ids[]=1392217 (Keion White, DE): every graded column
// is null and the only numbers are fumble columns. Rows like this appeared in 22 of 65 completed
// 2026 Week 1–5 games and voided every whole-game max/total and non-QB-pass square on those boards.
const fumbleRecoveryOnlyRow = (team: unknown, fumblesRecovered: number): Raw => ({
  player: { id: 1636, first_name: "Keion", last_name: "White", position_abbreviation: "DE" },
  team,
  passing_completions: null, passing_attempts: null, passing_yards: null, passing_touchdowns: null,
  passing_interceptions: null, sacks: null, rushing_attempts: null, rushing_yards: null, rushing_touchdowns: null,
  long_rushing: null, receptions: null, receiving_yards: null, receiving_touchdowns: null, long_reception: null,
  receiving_targets: null, fumbles: 0, fumbles_lost: 0, fumbles_recovered: fumblesRecovered, total_tackles: null,
  defensive_sacks: null, solo_tackles: null, tackles_for_loss: null, passes_defended: null, qb_hits: null,
  fumbles_touchdowns: null, defensive_interceptions: null, interception_yards: null, interception_touchdowns: null,
  kick_returns: null, kick_return_yards: null, kick_return_touchdowns: null, punt_returns: null,
  punt_return_yards: null, punt_return_touchdowns: null, field_goal_attempts: null, field_goals_made: null,
  long_field_goal_made: null, extra_points_made: null, punts: null, punt_yards: null, punts_inside_20: null,
});

const input = (extraRow?: (team: unknown) => Raw) => {
  const statRows = structuredClone(nflFixture.provider.stats.rows) as Raw[];
  if (extraRow) statRows.push(extraRow(structuredClone(statRows[0].team)));
  return {
    game: structuredClone(nflFixture.provider.game.rows[0]) as Raw,
    homeTeam: nflFixture.card.home_team,
    awayTeam: nflFixture.card.away_team,
    statRows,
    teamStatRows: structuredClone(nflFixture.provider.teamStats.rows) as Raw[],
    designationRows: structuredClone(nflFixture.provider.designations.rows) as Raw[],
  };
};
const grade = (resolver: SportsBingoResolver, params: ReturnType<typeof input>) =>
  gradeResolversAgainstCompletedNFLGame({ ...params, resolvers: [resolver] })[0];

const maxReceptions = Math.max(...(nflFixture.provider.stats.rows as Raw[]).map((row) => Number(row.receptions ?? 0)));
const resolvers: SportsBingoResolver[] = [
  { kind: "nfl_game_max_stat_at_least", field: "receptions", scope: "any_player", threshold: maxReceptions },
  { kind: "nfl_game_total_stat_at_least", field: "rushing_yards", threshold: 1 },
  { kind: "nfl_non_quarterback_pass_attempt" },
];

describe("NFL participation: a fumble-recovery-only row is a participant, not missing data", () => {
  for (const resolver of resolvers) {
    it(`${resolver.kind} grades the same with the row present as without it`, () => {
      const baseline = grade(resolver, input()).status;
      expect(baseline === "hit" || baseline === "miss").toBe(true);
      expect(grade(resolver, input((team) => fumbleRecoveryOnlyRow(team, 1))).status).toBe(baseline);
    });

    it(`${resolver.kind} still voids on a zero-only row (no positive evidence of participation)`, () => {
      expect(grade(resolver, input((team) => fumbleRecoveryOnlyRow(team, 0))).status).toBe("void");
    });
  }
});
