import { describe, expect, it } from "vitest";

import { normalizeBallDontLieScoreRow } from "@/lib/sportsBingo";

// Phase C of docs/prop-bingo-out-of-scope-followup-plan.md: `getScoresBySportKey` read
// `event.visitor_team?.full_name`, `event.home_team_score`, `event.visitor_team_score`, which
// silently dropped every MLB row (`/mlb/v1/games` uses `away_team`, `display_name`, and
// `home_team_data.runs` instead — confirmed against the live API 2026-08-18). This exercises the
// shape-tolerant normalizer both leagues now share.
//
// Phase 7 of docs/mlb-prop-bingo-validation-plan.md (2026-08-18): WNBA is a *third* shape.
// `status` is `"post"`, never `"final"` — the finality signal lives in the sibling `status_state`
// field instead — and scores are flat `home_score`/`away_score`, distinct from NBA/NFL's
// `*_team_score` and MLB's `*_team_data.runs`. Confirmed against a real completed WNBA game
// (Aces @ Mystics, 2026-08-11) before the fix below.

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

  it("parses the WNBA shape (status: post + status_state: final, flat home_score/away_score)", () => {
    const row = {
      id: 24999,
      status: "post",
      status_state: "final",
      home_team: { full_name: "Las Vegas Aces" },
      visitor_team: { full_name: "Washington Mystics" },
      home_score: 86,
      away_score: 76,
    };

    expect(normalizeBallDontLieScoreRow(row, "basketball_wnba")).toEqual({
      gameId: "24999",
      sportKey: "basketball_wnba",
      homeTeam: "Las Vegas Aces",
      awayTeam: "Washington Mystics",
      homeScore: 86,
      awayScore: 76,
      completed: true,
    });
  });

  it("regression: the pre-fix status/score reads yield nothing for a WNBA row", () => {
    const wnbaRow = {
      id: 24999,
      status: "post",
      status_state: "final",
      home_score: 86,
      away_score: 76,
    };

    // Simulates the old parser: only `status` (not `status_state`) and `*_team_score` (not the
    // flat `*_score` keys) were read.
    const oldCompleted = String(
      (wnbaRow as { status?: string }).status ?? ""
    ).toLowerCase().includes("final");
    const oldHomeScore = (wnbaRow as { home_team_score?: number }).home_team_score;

    expect(oldCompleted).toBe(false);
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
