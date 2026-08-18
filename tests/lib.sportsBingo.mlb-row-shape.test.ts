import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildMLBGamePlayerStatsSnapshot,
  evaluateResolver,
  isBallDontLieLineupStarter,
  normalizeBallDontLieScoreRow,
  pickBestMatchingBallDontLieGame,
} from "@/lib/sportsBingo";

/**
 * Follow-up to Phase C of docs/prop-bingo-out-of-scope-followup-plan.md.
 *
 * Phase C fixed `getScoresBySportKey` for the MLB row shape and *flagged* a second call site it
 * did not verify. Verified 2026-08-18 against a live `/mlb/v1/games` row: the flag understated it.
 * An MLB row carries **no `visitor_team` key at all** (it says `away_team`), **no `full_name`** on
 * its team objects (only `display_name`, plus a mascot-only `name`) and **no `home_team_score`**
 * (runs live at `home_team_data.runs`).
 *
 * `pickBestMatchingBallDontLieGame` read `game.visitor_team` directly, so `getTeamDisplayName`
 * returned `""` and `teamsMatch` rejected it on its first line — **every** MLB game failed to
 * match, so `getMLBGamePlayerStatsSnapshot` returned `null` for every card and no MLB player-prop
 * square could ever grade. The flagged null scores were downstream of that and unreachable.
 *
 * The `oldShape*` helpers below are the pre-fix field reads verbatim, kept so this file proves the
 * defect rather than merely asserting the cure.
 */

/** One live `/mlb/v1/games` row, fields trimmed to what these functions read. Shape is verbatim. */
const mlbGameRow = {
  id: 4213377,
  status: "STATUS_FINAL",
  date: "2026-08-16T17:10:00Z",
  home_team: { id: 21, display_name: "Houston Astros", name: "Astros" },
  away_team: { id: 12, display_name: "Detroit Tigers", name: "Tigers" },
  home_team_data: { runs: 1 },
  away_team_data: { runs: 0 },
};

/** The NBA/NFL shape, for the same functions — this is what must not regress. */
const nbaGameRow = {
  id: 990011,
  status: "Final",
  date: "2026-03-02T00:00:00Z",
  home_team: { id: 8, full_name: "Denver Nuggets", name: "Nuggets" },
  visitor_team: { id: 14, full_name: "Los Angeles Lakers", name: "Lakers" },
  home_team_score: 121,
  visitor_team_score: 117,
};

const card = (homeTeam: string, awayTeam: string, sportKey: string) =>
  ({
    game_id: "x",
    sport_key: sportKey,
    home_team: homeTeam,
    away_team: awayTeam,
    starts_at: "2026-08-16T17:10:00Z",
  }) as Parameters<typeof pickBestMatchingBallDontLieGame>[0];

describe("MLB /games row shape — the matcher that gated every MLB player-stat read", () => {
  const mlbCard = card("Houston Astros", "Detroit Tigers", "baseball_mlb");

  it("matches an MLB game row", () => {
    const matched = pickBestMatchingBallDontLieGame(mlbCard, [mlbGameRow]);
    expect(matched?.id).toBe(4213377);
  });

  it("could not match it before the fix — the away side read as an empty string", () => {
    // Verbatim pre-fix read: `getTeamDisplayName(game.visitor_team)` with a
    // `full_name ?? name` chain inside it.
    const oldShapeAwayName = String(
      (mlbGameRow as { visitor_team?: { full_name?: string; name?: string } }).visitor_team?.full_name ??
        (mlbGameRow as { visitor_team?: { full_name?: string; name?: string } }).visitor_team?.name ??
        ""
    ).trim();
    expect(oldShapeAwayName).toBe("");
    // teamsMatch("", …) is false on its first line, so the filter kept nothing and the function
    // returned null for every MLB card — which is the whole defect.
  });

  it("still matches an NBA/NFL-shaped row", () => {
    const nbaCard = card("Denver Nuggets", "Los Angeles Lakers", "basketball_nba");
    expect(pickBestMatchingBallDontLieGame(nbaCard, [nbaGameRow])?.id).toBe(990011);
  });

  it("still refuses a row for a different game", () => {
    const wrongCard = card("Seattle Mariners", "Detroit Tigers", "baseball_mlb");
    expect(pickBestMatchingBallDontLieGame(wrongCard, [mlbGameRow])).toBeNull();
  });

  it("matches through the mascot fallback, since MLB team objects carry no full_name", () => {
    // `getTeamDisplayName` deliberately still reads `full_name ?? name`, so an MLB team resolves
    // to its mascot here; `teamsMatch`'s `getTeamIdentityKey` fallback is what makes that line up
    // with a card holding the full name. See getTeamDisplayName's docblock for the open question.
    const mascotCard = card("Astros", "Tigers", "baseball_mlb");
    expect(pickBestMatchingBallDontLieGame(mascotCard, [mlbGameRow])?.id).toBe(4213377);
  });
});

describe("MLB player-stats snapshot carries the final score", () => {
  const mlbCard = card("Houston Astros", "Detroit Tigers", "baseball_mlb");

  it("reads runs off *_team_data, which is where MLB puts them", () => {
    const snapshot = buildMLBGamePlayerStatsSnapshot(mlbCard, mlbGameRow, []);
    expect(snapshot.homeScore).toBe(1);
    expect(snapshot.awayScore).toBe(0);
    expect(snapshot.finalized).toBe(true);
  });

  it("read null for both before the fix, which made toMLBLiveScoreSnapshot return null every time", () => {
    const row = mlbGameRow as { home_team_score?: unknown; visitor_team_score?: unknown };
    expect(row.home_team_score).toBeUndefined();
    expect(row.visitor_team_score).toBeUndefined();
  });

  it("was never finalized before the fix — MLB says STATUS_FINAL, the old check was startsWith", () => {
    // Third defect in the same family, found by this file rather than by the Phase C note: with
    // `startsWith("final")` an MLB game was never `finalized`, so even a fixed score would have
    // carried `completed: false` forever and squares would only ever settle via the
    // force-finalize window.
    expect(mlbGameRow.status.trim().toLowerCase().startsWith("final")).toBe(false);
    expect(mlbGameRow.status.trim().toLowerCase().includes("final")).toBe(true);
  });
});

describe("normalizeBallDontLieScoreRow still parses both shapes after the shared-helper refactor", () => {
  it("MLB", () => {
    const snapshot = normalizeBallDontLieScoreRow(mlbGameRow, "baseball_mlb");
    expect(snapshot).toMatchObject({
      gameId: "4213377",
      homeTeam: "Houston Astros",
      awayTeam: "Detroit Tigers",
      homeScore: 1,
      awayScore: 0,
      completed: true,
    });
  });

  it("NBA", () => {
    const snapshot = normalizeBallDontLieScoreRow(nbaGameRow, "basketball_nba");
    expect(snapshot).toMatchObject({
      gameId: "990011",
      homeTeam: "Denver Nuggets",
      awayTeam: "Los Angeles Lakers",
      homeScore: 121,
      awayScore: 117,
      completed: true,
    });
  });
});

/**
 * `/mlb/v1/lineups` rows, verbatim shape, verified live 2026-08-18 across two games (20 rows each:
 * nine batters per side carrying `batting_order` 1-9, plus one `is_probable_pitcher` per side with
 * a null batting order). **No row carries a `starter` key.** NBA rows do — also verified live, 21
 * rows with exactly 10 `starter: true` — which is why the predicate has to read both vocabularies.
 */
const mlbStartingBatter = { batting_order: 2, position: "CF", is_probable_pitcher: false };
const mlbStartingPitcher = { batting_order: null, position: "SP", is_probable_pitcher: true };
const mlbBenchPlayer = { batting_order: null, position: "1B", is_probable_pitcher: false };
const nbaStarter = { starter: true, position: "PG" };
const nbaBench = { starter: false, position: "SG" };

/**
 * Phase 2 of docs/mlb-prop-bingo-validation-plan.md: MLB `player_prop` squares settled `miss` on
 * missing data instead of `void`, contradicting the house rule ("missing data voids, it never
 * misses") that the NFL arm of the same `case "player_prop"` in `evaluateResolver` already
 * honored. Proven failing pre-fix in these three positions: missing snapshot, missing stat line,
 * non-finite value. NBA shares the branch and is deliberately left alone — the last test proves it.
 */
const scoreSnapshot = (completed: boolean) => ({
  gameId: "4213377",
  sportKey: "baseball_mlb",
  homeTeam: "Houston Astros",
  awayTeam: "Detroit Tigers",
  homeScore: completed ? 1 : null,
  awayScore: completed ? 0 : null,
  completed,
});

const playerPropResolver = (player: string) =>
  ({ kind: "player_prop", marketKey: "player_hits", player, line: 0.5, direction: "over" }) as const;

describe("MLB player_prop voids on missing data instead of missing (Phase 2)", () => {
  const mlbCard = card("Houston Astros", "Detroit Tigers", "baseball_mlb");

  it("voids when the MLB stats snapshot itself is missing at Final", () => {
    const result = evaluateResolver(playerPropResolver("Jose Altuve"), scoreSnapshot(true), null, null);
    expect(result).toEqual({ status: "void", resolved: true });
  });

  it("stays pending when the snapshot is missing before Final", () => {
    const result = evaluateResolver(playerPropResolver("Jose Altuve"), scoreSnapshot(false), null, null);
    expect(result).toEqual({ status: "pending", resolved: false });
  });

  it("voids when the snapshot exists but has no stat line for the player at Final", () => {
    const snapshot = buildMLBGamePlayerStatsSnapshot(mlbCard, mlbGameRow, []);
    const result = evaluateResolver(playerPropResolver("Jose Altuve"), scoreSnapshot(true), null, snapshot);
    expect(result).toEqual({ status: "void", resolved: true });
  });

  it("voids when the player's line resolves to a non-finite value at Final", () => {
    const statsRow = {
      player: { first_name: "Jose", last_name: "Altuve" },
      team: { display_name: "Houston Astros" },
      hits: 2,
    };
    const snapshot = buildMLBGamePlayerStatsSnapshot(mlbCard, mlbGameRow, [statsRow]);
    // Force the read-back value non-finite, simulating a stat line the box score genuinely can't parse.
    snapshot.lines[0].hits = Number.NaN;
    const result = evaluateResolver(playerPropResolver("Jose Altuve"), scoreSnapshot(true), null, snapshot);
    expect(result).toEqual({ status: "void", resolved: true });
  });

  it("left the NBA arm alone — still misses (not voids) on a missing snapshot at Final", () => {
    const nbaSnapshot = ({
      gameId: "990011",
      sportKey: "basketball_nba",
      homeTeam: "Denver Nuggets",
      awayTeam: "Los Angeles Lakers",
      homeScore: 121,
      awayScore: 117,
      completed: true,
    }) as const;
    const nbaResolver = {
      kind: "player_prop",
      marketKey: "player_points",
      player: "Nikola Jokic",
      line: 20.5,
      direction: "over",
    } as const;
    const result = evaluateResolver(nbaResolver, nbaSnapshot, null, null);
    expect(result).toEqual({ status: "miss", resolved: true });
  });
});

describe("lineup starter detection across both league vocabularies", () => {
  it("reads MLB starters off batting_order and is_probable_pitcher", () => {
    expect(isBallDontLieLineupStarter(mlbStartingBatter)).toBe(true);
    expect(isBallDontLieLineupStarter(mlbStartingPitcher)).toBe(true);
  });

  it("does not call an MLB bench player a starter", () => {
    expect(isBallDontLieLineupStarter(mlbBenchPlayer)).toBe(false);
  });

  it("still reads NBA starters off the boolean", () => {
    expect(isBallDontLieLineupStarter(nbaStarter)).toBe(true);
    expect(isBallDontLieLineupStarter(nbaBench)).toBe(false);
  });

  it("called every MLB starter a non-starter before the fix", () => {
    // Verbatim pre-fix read. This is the defect that inverted autoSwapLateScratchedStarSquares:
    // that function skips a square when its player IS starting, so `false` for everyone meant it
    // would swap every star-branded home-run square on every MLB card. It stayed dormant only
    // because the snapshot feeding it was unreachable until the row-shape fixes above landed.
    for (const row of [mlbStartingBatter, mlbStartingPitcher]) {
      expect((row as { starter?: boolean }).starter === true).toBe(false);
      expect(isBallDontLieLineupStarter(row)).toBe(true);
    }
  });
});
