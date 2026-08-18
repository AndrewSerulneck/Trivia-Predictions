import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Phase 3's achievement-candidate test (below) needs `buildNBAAchievementCandidates` to run for
 * real against a controlled player pool, since generation-suppression (3d) is a code-path
 * assertion, not a row-shape one — a mirrored reimplementation would validate the mirror, not the
 * gate. This mock is file-scoped (vi.mock is hoisted), so every test in this file runs under it;
 * the pre-existing tests never call a network-touching function, so it changes nothing for them.
 */
const HOME_TEAM_ID = 8;
const AWAY_TEAM_ID = 5;
const HOME_PLAYER_ID = 90001;
const AWAY_PLAYER_ID = 90002;

const seasonAverageRow = (playerId: number) => ({
  player: { id: playerId },
  stats: { pts: 25, reb: 10, ast: 8, stl: 3, blk: 2, oreb: 3, dreb: 7, fg3m: 3, ftm: 5, fta: 6, fgm: 9, fga: 18, min: 32, plus_minus: 8 },
});

const historicalStatRow = (playerId: number, teamId: number, gameId: number) => ({
  player: { id: playerId, first_name: playerId === HOME_PLAYER_ID ? "Home" : "Away", last_name: "Star" },
  team: { id: teamId },
  game: { id: gameId },
  pts: 25,
  reb: 10,
  ast: 8,
  stl: 3,
  blk: 2,
  fg3m: 3,
  oreb: 3,
  dreb: 7,
  plus_minus: 8,
  min: "32:00",
});

vi.mock("@/lib/ballDontLieClient", () => ({
  isBallDontLieConfigured: () => true,
  fetchBallDontLieJson: async () => ({}),
  fetchBallDontLieList: async (path: string) => {
    if (path.endsWith("/games")) {
      return [
        {
          id: 500001,
          season: 2025,
          datetime: "2026-08-12T02:00:00.000Z",
          home_team: { id: HOME_TEAM_ID, full_name: "Home Team" },
          visitor_team: { id: AWAY_TEAM_ID, full_name: "Away Team" },
        },
      ];
    }
    if (path.endsWith("/players/active")) {
      return [
        { id: HOME_PLAYER_ID, first_name: "Home", last_name: "Star", team: { id: HOME_TEAM_ID } },
        { id: AWAY_PLAYER_ID, first_name: "Away", last_name: "Star", team: { id: AWAY_TEAM_ID } },
      ];
    }
    if (path.endsWith("/season_averages/general")) {
      return [seasonAverageRow(HOME_PLAYER_ID), seasonAverageRow(AWAY_PLAYER_ID)];
    }
    if (path.endsWith("/stats") || path.endsWith("/player_stats")) {
      // 6+ rows per player across distinct games clears the `hasSample` floor in
      // buildNBAAchievementCandidates so the empirical rate path (not the season-stat fallback)
      // is what's under test — matching what the fixed historical walk (3c) actually returns.
      const rows = [];
      for (let g = 0; g < 6; g += 1) {
        rows.push(historicalStatRow(HOME_PLAYER_ID, HOME_TEAM_ID, 600000 + g));
        rows.push(historicalStatRow(AWAY_PLAYER_ID, AWAY_TEAM_ID, 600000 + g));
      }
      return rows;
    }
    if (path.endsWith("/lineups")) {
      return [];
    }
    return [];
  },
}));

import { buildNBAAchievementCandidates, buildNBAGamePlayerStatsSnapshot, basketballStatsPathForSportKey, pickBestMatchingBallDontLieGame } from "@/lib/sportsBingo";

/**
 * Phase 7 of docs/mlb-prop-bingo-validation-plan.md — WNBA audit, found (not "no findings"): two
 * real row-shape defects on the settlement path `buildNBAGamePlayerStatsSnapshot` shares with NBA
 * via `basketballApiPrefixForSportKey`.
 *
 * 1. **`finalized` was permanently false for WNBA.** `isBallDontLieGameFinal` read only `status`,
 *    which is `"post"` for a completed WNBA game (never `"final"`) — the finality signal lives in
 *    the sibling `status_state` field instead, which was never read anywhere.
 * 2. **Scores were permanently null for WNBA.** WNBA is a *third* score shape: no
 *    `home_team_score` (NBA/NFL's flat key) and no `home_team_data` (MLB's nested shape) — just
 *    flat `home_score`/`away_score`.
 *
 * Both confirmed live 2026-08-18 against a real completed game (Aces @ Mystics, 2026-08-11,
 * id 24999). Production impact: 6 WNBA cards existed at audit time, all settled 12 hours late via
 * the force-finalize safety net instead of on completion, with 101/150 squares voided.
 *
 * The `nbaGameRow` case alongside proves NBA — which already worked — was not disturbed.
 */

const wnbaGameRow = {
  id: 24999,
  status: "post",
  status_state: "final",
  date: "2026-08-12T02:00:00.000Z",
  home_team: { id: 8, full_name: "Las Vegas Aces", name: "Aces" },
  visitor_team: { id: 5, full_name: "Washington Mystics", name: "Mystics" },
  home_score: 86,
  away_score: 76,
};

const nbaGameRow = {
  id: 21716137,
  status: "Final",
  status_state: "final",
  date: "2026-06-10",
  home_team: { id: 20, full_name: "New York Knicks", name: "Knicks" },
  visitor_team: { id: 27, full_name: "San Antonio Spurs", name: "Spurs" },
  home_team_score: 107,
  visitor_team_score: 106,
};

const card = (homeTeam: string, awayTeam: string, sportKey: string) =>
  ({
    game_id: "x",
    sport_key: sportKey,
    home_team: homeTeam,
    away_team: awayTeam,
    starts_at: "2026-08-12T02:00:00.000Z",
  }) as Parameters<typeof pickBestMatchingBallDontLieGame>[0];

describe("WNBA player-stats snapshot carries the final score", () => {
  const wnbaCard = card("Las Vegas Aces", "Washington Mystics", "basketball_wnba");

  it("reads status_state as a second finality signal, since status alone stays \"post\"", () => {
    const snapshot = buildNBAGamePlayerStatsSnapshot(wnbaCard, wnbaGameRow, []);
    expect(snapshot.finalized).toBe(true);
  });

  it("reads flat home_score/away_score, the shape neither *_team_score nor *_team_data covers", () => {
    const snapshot = buildNBAGamePlayerStatsSnapshot(wnbaCard, wnbaGameRow, []);
    expect(snapshot.homeScore).toBe(86);
    expect(snapshot.awayScore).toBe(76);
  });

  it("was never finalized before the fix — WNBA status is \"post\", not \"final\"", () => {
    expect(wnbaGameRow.status.trim().toLowerCase().includes("final")).toBe(false);
    expect(wnbaGameRow.status_state.trim().toLowerCase().includes("final")).toBe(true);
  });

  it("read null for both scores before the fix — no *_team_score, no *_team_data on a WNBA row", () => {
    const row = wnbaGameRow as { home_team_score?: unknown; home_team_data?: unknown };
    expect(row.home_team_score).toBeUndefined();
    expect(row.home_team_data).toBeUndefined();
  });
});

describe("NBA player-stats snapshot is unaffected by the WNBA fallback", () => {
  const nbaCard = card("New York Knicks", "San Antonio Spurs", "basketball_nba");

  it("still reads *_team_score first, ignoring the (absent) flat *_score keys", () => {
    const snapshot = buildNBAGamePlayerStatsSnapshot(nbaCard, nbaGameRow, []);
    expect(snapshot.homeScore).toBe(107);
    expect(snapshot.awayScore).toBe(106);
    expect(snapshot.finalized).toBe(true);
  });
});

/**
 * Phase 3 of docs/bingo-correctness-and-wnba-repair-plan.md — WNBA repair.
 *
 * 3a: box-score endpoint is genuinely inverted between leagues (verified live 2026-08-18: NBA's
 * `/stats` 200s and `/player_stats` 404s; WNBA's the other way around).
 */
describe("basketballStatsPathForSportKey — the box-score path is inverted, not shared", () => {
  it("NBA reads /stats", () => {
    expect(basketballStatsPathForSportKey("basketball_nba")).toBe("stats");
  });

  it("WNBA reads /player_stats", () => {
    expect(basketballStatsPathForSportKey("basketball_wnba")).toBe("player_stats");
  });
});

describe("buildNBAGamePlayerStatsSnapshot reads WNBA's null-as-zero stat rows correctly", () => {
  it("a row with every counting stat null (WNBA's actual shape, not a hypothetical) parses to 0, not NaN or a dropped line", () => {
    const nullStatsRow = {
      player: { id: 1, first_name: "Null", last_name: "Stats" },
      team: { full_name: "Las Vegas Aces" },
      pts: null,
      reb: null,
      ast: null,
      stl: null,
      blk: null,
      turnover: null,
      fg3m: null,
      fgm: null,
      fga: null,
      ftm: null,
      fta: null,
      oreb: null,
      dreb: null,
      plus_minus: null,
    };
    const wnbaCard = card("Las Vegas Aces", "Washington Mystics", "basketball_wnba");
    const snapshot = buildNBAGamePlayerStatsSnapshot(wnbaCard, wnbaGameRow, [nullStatsRow as never]);
    expect(snapshot.lines).toHaveLength(1);
    const line = snapshot.lines[0]!;
    expect(line.pts).toBe(0);
    expect(line.reb).toBe(0);
    expect(line.ast).toBe(0);
    expect(line.stl).toBe(0);
    expect(line.blk).toBe(0);
    expect(line.threes).toBe(0);
    expect(line.plusMinus).toBe(0);
  });
});

describe("3e: mascot-only team names (Toronto \"Tempo\", Portland \"Fire\") still match", () => {
  it("teamsMatch accepts a bare-mascot full_name with an empty city, unchanged by anything Phase 3 touched", () => {
    const tempoGameRow = {
      id: 30001,
      status: "post",
      status_state: "final",
      date: "2026-08-12T02:00:00.000Z",
      home_team: { id: 40, full_name: "Tempo", name: "Tempo", city: "" },
      visitor_team: { id: 41, full_name: "Fire", name: "Fire", city: "" },
      home_score: 80,
      away_score: 74,
    };
    const tempoCard = card("Tempo", "Fire", "basketball_wnba");
    const matched = pickBestMatchingBallDontLieGame(tempoCard, [tempoGameRow as never]);
    expect(matched?.id).toBe(30001);
  });
});

/**
 * 3d: `buildNBAAchievementCandidates` must not generate the four families WNBA cannot support
 * (no starter flag, no per-period player split) — for WNBA, regardless of the underlying stats.
 * Both leagues here are fed an identical, generous player pool via the ballDontLieClient mock
 * above, so any difference in which kinds appear is attributable only to the `wnbaMode` gate, not
 * to different input data.
 */
describe("3d: the four data-unavailable families are suppressed for WNBA generation, not NBA", () => {
  const SUPPRESSED_KINDS = [
    "nba_player_bench_scores",
    "nba_player_points_first_half_at_least",
    "nba_player_assists_in_any_quarter_at_least",
    "nba_player_steals_first_half_at_least",
  ];

  const gameFor = (sportKey: string, id: string) =>
    ({
      id,
      sportKey,
      homeTeam: "Home Team",
      awayTeam: "Away Team",
      startsAt: "2026-08-12T02:00:00.000Z",
      gameLabel: "Home Team vs Away Team",
      isLocked: false,
    }) as Parameters<typeof buildNBAAchievementCandidates>[0];

  it("WNBA candidate set contains none of the four suppressed kinds", async () => {
    // Distinct game ids so this test and the NBA one below don't collide in
    // getNBAPlayerProfilesForGame's module-level cache; the mock's /games route falls back to
    // normalized team-name matching (both use "Home Team"/"Away Team"), so an id that isn't
    // literally 500001 still resolves to the same mocked game row.
    const candidates = await buildNBAAchievementCandidates(gameFor("basketball_wnba", "500001-wnba"), []);
    const kinds = new Set<string>(candidates.map((c) => c.resolver.kind));
    for (const kind of SUPPRESSED_KINDS) {
      expect(kinds.has(kind)).toBe(false);
    }
  });

  it("NBA candidate set, built from the identical player pool, contains at least one of each", async () => {
    const candidates = await buildNBAAchievementCandidates(gameFor("basketball_nba", "500001-nba"), []);
    const kinds = new Set<string>(candidates.map((c) => c.resolver.kind));
    for (const kind of SUPPRESSED_KINDS) {
      expect(kinds.has(kind)).toBe(true);
    }
  });
});
