import { describe, expect, it } from "vitest";
import ncaabBracket from "./fixtures/brackets/ncaab-bracket-season-2025.json";
import ncaawBracket from "./fixtures/brackets/ncaaw-bracket-season-2025.json";
import nflPostseason from "./fixtures/squares/nfl-postseason-2025.json";

// Phase 0 of docs/squares-and-brackets-plan.md: pins what the BallDontLie feeds look like, so the
// Phase 7 bracket engine and the Phase 2 Squares engine are built on proven facts, not guesses.

type FeedTeam = { id: number; seed: string; winner: boolean | null; score: number | null };
type FeedGame = {
  game_id: number;
  round: number;
  bracket_location: number;
  date: string;
  home_team: FeedTeam;
  away_team: FeedTeam;
};

const tournaments: Array<[string, FeedGame[]]> = [
  ["men's", ncaabBracket as FeedGame[]],
  ["women's", ncaawBracket as FeedGame[]],
];

const winnerOf = (game: FeedGame): FeedTeam => {
  const winner = [game.home_team, game.away_team].find((team) => team.winner === true);
  if (!winner) throw new Error(`game ${game.game_id} has no winner`);
  return winner;
};

const gameAt = (games: FeedGame[], round: number, location: number): FeedGame => {
  const game = games.find((g) => g.round === round && g.bracket_location === location);
  if (!game) throw new Error(`no game at round ${round} location ${location}`);
  return game;
};

describe.each(tournaments)("%s bracket feed (2026 tournament, season=2025)", (_label, games) => {
  it("has 4 opening-round games and a 32/16/8/4/2/1 main bracket", () => {
    const counts = [0, 1, 2, 3, 4, 5, 6].map((round) => games.filter((g) => g.round === round).length);
    expect(counts).toEqual([4, 32, 16, 8, 4, 2, 1]);
  });

  it("is a binary tree: round r location k is fed by round r-1 locations 2k-1 (home) and 2k (away)", () => {
    for (const game of games.filter((g) => g.round >= 2)) {
      const odd = gameAt(games, game.round - 1, 2 * game.bracket_location - 1);
      const even = gameAt(games, game.round - 1, 2 * game.bracket_location);
      expect(game.home_team.id).toBe(winnerOf(odd).id);
      expect(game.away_team.id).toBe(winnerOf(even).id);
    }
  });

  it("puts each region in 8 consecutive round-1 locations with the standard seed order", () => {
    const seedOrder = [[1, 16], [8, 9], [5, 12], [4, 13], [6, 11], [3, 14], [7, 10], [2, 15]];
    for (const game of games.filter((g) => g.round === 1)) {
      const expected = seedOrder[(game.bracket_location - 1) % 8];
      expect([Number(game.home_team.seed), Number(game.away_team.seed)]).toEqual(expected);
    }
  });

  it("sends each opening-round winner to an AWAY slot in round 1, matched only by team id", () => {
    for (const opener of games.filter((g) => g.round === 0)) {
      const winner = winnerOf(opener);
      const next = games.find((g) => g.round === 1 && (g.home_team.id === winner.id || g.away_team.id === winner.id));
      expect(next?.away_team.id).toBe(winner.id);
    }
  });

  it("marks a loser's winner flag null, never false", () => {
    const flags = new Set(games.flatMap((g) => [g.home_team.winner, g.away_team.winner]));
    expect([...flags].sort()).toEqual([null, true].sort());
  });

  it("finishes every opening-round game before the first round-1 tip (the main bracket lock)", () => {
    const lastOpener = games.filter((g) => g.round === 0).map((g) => g.date).sort().at(-1) ?? "";
    const firstRound1 = games.filter((g) => g.round === 1).map((g) => g.date).sort()[0] ?? "";
    expect(lastOpener < firstRound1).toBe(true);
  });
});

type NflTeam = { conference: string };
type NflGame = {
  week: number;
  postseason: boolean;
  home_team: NflTeam;
  visitor_team: NflTeam;
  home_team_score: number;
  visitor_team_score: number;
  home_team_ot: number | null;
  visitor_team_ot: number | null;
} & Record<`${"home" | "visitor"}_team_q${1 | 2 | 3 | 4}`, number | null>;

describe("NFL postseason feed (2025 season)", () => {
  const games = nflPostseason as NflGame[];

  it("has the Super Bowl as postseason week 5 with one AFC and one NFC team", () => {
    const superBowl = games.filter((g) => g.postseason && g.week === 5);
    expect(superBowl).toHaveLength(1);
    const conferences = [superBowl[0].home_team.conference, superBowl[0].visitor_team.conference].sort();
    expect(conferences).toEqual(["AFC", "NFC"]);
  });

  it("stores scoreless quarters as null in finished postseason records, and quarters + OT sum to the final", () => {
    const sb = games.find((g) => g.week === 5);
    expect(sb?.home_team_q1).toBeNull();
    for (const game of games) {
      for (const side of ["home", "visitor"] as const) {
        const quarters = ([1, 2, 3, 4] as const).reduce((sum, q) => sum + (game[`${side}_team_q${q}`] ?? 0), 0);
        expect(quarters + (game[`${side}_team_ot`] ?? 0)).toBe(game[`${side}_team_score`]);
      }
    }
  });
});
