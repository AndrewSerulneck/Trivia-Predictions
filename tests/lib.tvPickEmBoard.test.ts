import { describe, expect, it } from "vitest";
import {
  allTimeColumns,
  boardGamesOf,
  detectScoreFlashes,
  formatLeaderRecord,
  formatPoints,
  pickEmBoardLabel,
  scoreSnapshotOf,
  tileViewOf,
} from "@/lib/tvPickEmBoard";
import type { TvPickEmGame } from "@/lib/tvSportsRelevance";
import { debugCarousel } from "@/lib/venueScreenCarouselShared";

const NOW = Date.parse("2026-11-24T02:00:00.000Z"); // Mon 9 PM ET, Tue 02:00Z

const game = (overrides: Partial<TvPickEmGame> = {}): TvPickEmGame => ({
  key: "g1",
  league: "NFL",
  homeTeam: "Seattle Seahawks",
  awayTeam: "Kansas City Chiefs",
  homeAbbr: "SEA",
  awayAbbr: "KC",
  startsAt: "2026-11-24T01:00:00.000Z",
  status: "live",
  homeScore: 17,
  awayScore: 21,
  periodLabel: "Q3 4:12",
  picks: 41,
  homePickPct: 39,
  ...overrides,
});

describe("tileViewOf", () => {
  it("shows a live game: abbreviations, scores, the leader, picks and the pick split", () => {
    const view = tileViewOf(game());
    expect(view.statusText).toBe("Q3 4:12");
    expect(view.picksText).toBe("41 picks");
    expect(view.away).toEqual({ label: "KC", score: "21", lead: true, pickPct: 61 });
    expect(view.home).toEqual({ label: "SEA", score: "17", lead: false, pickPct: 39 });
  });

  it("never shows an unknown score as 0, and leads nobody on a level or unknown score", () => {
    const unknown = tileViewOf(game({ awayScore: null, homeScore: null, status: "scheduled", periodLabel: null }));
    expect(unknown.away.score).toBe("–");
    expect(unknown.home.score).toBe("–");
    expect(unknown.statusText).toBeNull();
    expect(unknown.away.lead || unknown.home.lead).toBe(false);
    const level = tileViewOf(game({ awayScore: 14, homeScore: 14 }));
    expect(level.away.lead || level.home.lead).toBe(false);
  });

  it("marks the winner of a final, and falls back to the team name without an abbreviation", () => {
    const view = tileViewOf(game({ status: "final", awayScore: 20, homeScore: 27, homeAbbr: null }));
    expect(view.statusText).toBe("Final");
    expect(view.home.lead).toBe(true);
    expect(view.home.label).toBe("Seattle Seahawks");
  });

  it("says nothing about picks when there are none or the count is unknown", () => {
    expect(tileViewOf(game({ picks: 0, homePickPct: null })).picksText).toBeNull();
    expect(tileViewOf(game({ picks: null, homePickPct: null })).away.pickPct).toBeNull();
    expect(tileViewOf(game({ picks: 1 })).picksText).toBe("1 pick");
  });

  it("falls back to Live when a live game has no period label", () => {
    expect(tileViewOf(game({ periodLabel: null })).statusText).toBe("Live");
  });
});

describe("board helpers", () => {
  it("the board is the first four ranked games", () => {
    const games = debugCarousel("sunday", NOW).pickEm?.games ?? [];
    expect(games.length).toBeGreaterThan(4);
    expect(boardGamesOf(games)).toEqual(games.slice(0, 4));
  });

  it("labels the board by league, or by the day when leagues are mixed", () => {
    const nfl = [game(), game({ key: "g2" })];
    expect(pickEmBoardLabel(nfl, NOW, true)).toBe("NFL");
    const mixed = [game({ league: "NBA" }), game({ key: "g2", league: "NHL" })];
    expect(pickEmBoardLabel(mixed, NOW, false)).toBe("Today");
    expect(pickEmBoardLabel(mixed, new Date(2026, 10, 24, 21, 0).getTime(), true)).toBe("Tuesday night");
    expect(pickEmBoardLabel(mixed, new Date(2026, 10, 28, 13, 0).getTime(), true)).toBe("Saturday");
  });

  it("formats records and points", () => {
    expect(formatLeaderRecord({ wins: 9, losses: 3 })).toBe("9–3");
    expect(formatPoints(48210)).toBe("48,210");
    expect(formatPoints(950)).toBe("950");
  });

  it("splits the all-time list into two columns of five, never more than ten", () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({ rank: i + 1, username: `P${i + 1}`, points: 100 - i }));
    const { left, right } = allTimeColumns(entries);
    expect(left.map((e) => e.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(right.map((e) => e.rank)).toEqual([6, 7, 8, 9, 10]);
    expect(allTimeColumns(entries.slice(0, 3)).right).toEqual([]);
  });
});

describe("detectScoreFlashes", () => {
  const before = [game()];

  it("flashes nothing on the first look", () => {
    expect(detectScoreFlashes(null, before)).toEqual([]);
  });

  it("flashes the side that scored, with the points and the venue's pick share", () => {
    const [flash] = detectScoreFlashes(scoreSnapshotOf(before), [game({ awayScore: 28 })]);
    expect(flash).toMatchObject({ gameKey: "g1", side: "away", ribbon: "KC +7", caption: "61% here picked KC" });
    expect(flash?.token).toBe("pickem-score:g1:28-17");
  });

  it("says who scored when the venue has no picks on the game", () => {
    const quiet = [game({ picks: 0, homePickPct: null })];
    const [flash] = detectScoreFlashes(scoreSnapshotOf(quiet), [game({ homeScore: 20, picks: 0, homePickPct: null })]);
    expect(flash?.caption).toBe("SEA scores");
  });

  it("does not flash an unchanged poll, a new game, an unknown earlier score, or a game off the board", () => {
    expect(detectScoreFlashes(scoreSnapshotOf(before), before)).toEqual([]);
    expect(detectScoreFlashes(scoreSnapshotOf([]), before)).toEqual([]);
    expect(detectScoreFlashes(scoreSnapshotOf([game({ awayScore: null, homeScore: null })]), before)).toEqual([]);
    const games = ["a", "b", "c", "d", "e"].map((key) => game({ key }));
    const bumped = games.map((g) => (g.key === "e" ? { ...g, awayScore: 99 } : g));
    expect(detectScoreFlashes(scoreSnapshotOf(games), bumped)).toEqual([]);
  });

  it("does not flash a score that went down (a correction)", () => {
    expect(detectScoreFlashes(scoreSnapshotOf(before), [game({ awayScore: 14 })])).toEqual([]);
  });
});
