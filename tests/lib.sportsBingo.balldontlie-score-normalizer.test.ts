import { describe, expect, it } from "vitest";

import { normalizeBallDontLieScoreRow } from "@/lib/sportsBingo";

// Phase C of docs/prop-bingo-out-of-scope-followup-plan.md: `getScoresBySportKey` read
// `event.visitor_team?.full_name`, `event.home_team_score`, `event.visitor_team_score`, which
// silently dropped every MLB row (`/mlb/v1/games` uses `away_team`, `display_name`, and
// `home_team_data.runs` instead — confirmed against the live API 2026-08-18). This exercises the
// shape-tolerant normalizer both leagues now share.

describe("normalizeBallDontLieScoreRow", () => {
  it("parses the NBA/WNBA/NFL shape (visitor_team, full_name, *_team_score)", () => {
    const row = {
      id: 42,
      status: "Final",
      home_team: { full_name: "Boston Celtics" },
      visitor_team: { full_name: "Miami Heat" },
      home_team_score: 110,
      visitor_team_score: 101,
    };

    expect(normalizeBallDontLieScoreRow(row, "basketball_nba")).toEqual({
      gameId: "42",
      sportKey: "basketball_nba",
      homeTeam: "Boston Celtics",
      awayTeam: "Miami Heat",
      homeScore: 110,
      awayScore: 101,
      completed: true,
    });
  });

  it("parses the MLB shape (away_team, display_name, *_team_data.runs)", () => {
    const row = {
      id: 5059612,
      status: "STATUS_FINAL",
      home_team: { display_name: "Houston Astros", name: "Astros" },
      away_team: { display_name: "Seattle Mariners", name: "Mariners" },
      home_team_data: { runs: 10 },
      away_team_data: { runs: 7 },
    };

    expect(normalizeBallDontLieScoreRow(row, "baseball_mlb")).toEqual({
      gameId: "5059612",
      sportKey: "baseball_mlb",
      homeTeam: "Houston Astros",
      awayTeam: "Seattle Mariners",
      homeScore: 10,
      awayScore: 7,
      completed: true,
    });
  });

  it("regression: the pre-fix field names yield nothing for an MLB row", () => {
    const mlbRow = {
      id: 5059612,
      status: "STATUS_FINAL",
      home_team: { display_name: "Houston Astros", name: "Astros" },
      away_team: { display_name: "Seattle Mariners", name: "Mariners" },
      home_team_data: { runs: 10 },
      away_team_data: { runs: 7 },
    };

    // Simulates the old parser: only `visitor_team`/`full_name`/`*_team_score` were read.
    const oldAwayTeam = String(
      (mlbRow as { visitor_team?: { full_name?: string } }).visitor_team?.full_name ?? ""
    ).trim();
    const oldHomeScore = (mlbRow as { home_team_score?: number }).home_team_score;

    expect(oldAwayTeam).toBe("");
    expect(oldHomeScore).toBeUndefined();
  });

  it("drops a row missing an id or either team name in either shape", () => {
    expect(
      normalizeBallDontLieScoreRow({ status: "Final", home_team: { full_name: "A" }, visitor_team: { full_name: "B" } }, "basketball_nba")
    ).toBeNull();
    expect(
      normalizeBallDontLieScoreRow({ id: 1, status: "Final", away_team: { display_name: "B" } }, "baseball_mlb")
    ).toBeNull();
  });
});
