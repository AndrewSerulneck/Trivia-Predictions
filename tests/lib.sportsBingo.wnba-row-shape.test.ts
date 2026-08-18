import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildNBAGamePlayerStatsSnapshot, pickBestMatchingBallDontLieGame } from "@/lib/sportsBingo";

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
