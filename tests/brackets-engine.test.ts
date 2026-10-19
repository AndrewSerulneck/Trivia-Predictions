import { describe, expect, it } from "vitest";
import ncaabBracket from "./fixtures/brackets/ncaab-bracket-season-2025.json";
import ncaawBracket from "./fixtures/brackets/ncaaw-bracket-season-2025.json";
import {
  autoBracketLocks,
  bracketKindPhase,
  bracketWinnerSeats,
  championshipTotal,
  emptyBracketGame,
  hasFullField,
  linkOpeners,
  maskBracketFeedAt,
  mergeBracketFeed,
  nextBracketSyncAt,
  REPLAY_GAME_MS,
  roundsChangedBetween,
  type BracketFeedGame,
  type BracketGameState,
} from "@/lib/brackets/games";
import {
  bracketPickCount,
  bracketPicksProblem,
  choosableSeats,
  copyableBracketPicks,
  isBracketComplete,
  setBracketPick,
} from "@/lib/brackets/picks";
import {
  bracketCreditKey,
  bracketMaxPossible,
  bracketMaxScore,
  bracketRoundCorrect,
  bracketRoundVenuePoints,
  bracketScore,
  isSeatAlive,
  rankBracketEntries,
} from "@/lib/brackets/scoring";
import {
  BRACKET_SLOT_COUNT,
  childSlots,
  emptyPicks,
  locationOfSlot,
  parentOf,
  regionOfSlot,
  roundOfSlot,
  seatRangeOfSlot,
  slotOf,
  slotsOfKind,
  type BracketKind,
} from "@/lib/brackets/tree";

// Phase 7 of docs/squares-and-brackets-plan.md: the bracket rules, proven on the real 2026
// tournaments (fixtures saved in Phase 0).

const tournaments: Array<[string, BracketFeedGame[]]> = [
  ["men's", ncaabBracket as BracketFeedGame[]],
  ["women's", ncaawBracket as BracketFeedGame[]],
];

const HOUR = 60 * 60_000;

describe("bracket tree", () => {
  it("numbers 63 slots round by round and inverts cleanly", () => {
    const seen = new Set<number>();
    for (const [round, games] of [[1, 32], [2, 16], [3, 8], [4, 4], [5, 2], [6, 1]] as const) {
      for (let location = 1; location <= games; location += 1) {
        const slot = slotOf(round, location) as number;
        expect(roundOfSlot(slot)).toBe(round);
        expect(locationOfSlot(slot)).toBe(location);
        seen.add(slot);
      }
      expect(slotOf(round, games + 1)).toBeNull();
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(Array.from({ length: 63 }, (_, i) => i));
  });

  it("links parents and children both ways, and a slot covers exactly its children's seats", () => {
    for (let slot = 32; slot < BRACKET_SLOT_COUNT; slot += 1) {
      const [home, away] = childSlots(slot) as [number, number];
      expect(parentOf(home)).toEqual({ slot, side: "home" });
      expect(parentOf(away)).toEqual({ slot, side: "away" });
      expect(seatRangeOfSlot(slot)).toEqual([seatRangeOfSlot(home)[0], seatRangeOfSlot(away)[1]]);
    }
    expect(seatRangeOfSlot(62)).toEqual([0, 63]);
    expect(parentOf(62)).toBeNull();
    expect(childSlots(0)).toBeNull();
  });

  it("puts round-1 locations 8i+1…8i+8 in region i and the Final Four in none", () => {
    expect(regionOfSlot(slotOf(1, 1) as number)).toBe(0);
    expect(regionOfSlot(slotOf(1, 9) as number)).toBe(1);
    expect(regionOfSlot(slotOf(1, 32) as number)).toBe(3);
    expect(regionOfSlot(slotOf(4, 3) as number)).toBe(2);
    expect(regionOfSlot(slotOf(5, 1) as number)).toBeNull();
  });

  it("main picks 63 slots, second chance the 15 from the Sweet 16 on", () => {
    expect(slotsOfKind("main")).toHaveLength(63);
    expect(slotsOfKind("second")).toEqual(Array.from({ length: 15 }, (_, i) => 48 + i));
    expect(bracketMaxScore("main")).toBe(1920);
    expect(bracketMaxScore("second")).toBe(1280);
  });
});

// The team in each seat, from the finished round-1 records (opening-round winners already placed).
const seatTeams = (games: BracketFeedGame[]): Map<number, number> => {
  const map = new Map<number, number>();
  for (const game of games.filter((g) => g.round === 1)) {
    const slot = slotOf(1, game.bracket_location) as number;
    map.set(2 * slot, game.home_team?.id as number);
    map.set(2 * slot + 1, game.away_team?.id as number);
  }
  return map;
};

const feedWinnerId = (game: BracketFeedGame): number =>
  (game.home_team?.winner === true ? game.home_team.id : game.away_team?.id) as number;

/** "Higher seed wins" (home on a tie), built by TEAM, independently of the seat encoding. */
const chalkByTeam = (games: BracketFeedGame[]): Map<number, number> => {
  const seedOf = new Map<number, number>();
  for (const game of games) {
    for (const team of [game.home_team, game.away_team]) if (team?.id) seedOf.set(team.id, Number(team.seed));
  }
  const teams = seatTeams(games);
  const winnerTeam = new Map<number, number>();
  for (let slot = 0; slot < BRACKET_SLOT_COUNT; slot += 1) {
    const children = childSlots(slot);
    const home = children ? (winnerTeam.get(children[0]) as number) : (teams.get(2 * slot) as number);
    const away = children ? (winnerTeam.get(children[1]) as number) : (teams.get(2 * slot + 1) as number);
    winnerTeam.set(slot, (seedOf.get(away) as number) < (seedOf.get(home) as number) ? away : home);
  }
  return winnerTeam;
};

describe.each(tournaments)("%s 2026 tournament", (_label, feed) => {
  const merged = mergeBracketFeed([], feed);
  const winnerSeats = bracketWinnerSeats(merged.games);
  const teams = seatTeams(feed);

  it("decides every slot, and each winning seat holds the team the feed says won", () => {
    expect(winnerSeats.every((seat) => seat !== null)).toBe(true);
    for (const game of feed.filter((g) => g.round >= 1)) {
      const slot = slotOf(game.round, game.bracket_location) as number;
      expect(teams.get(winnerSeats[slot] as number), `slot ${slot}`).toBe(feedWinnerId(game));
    }
    expect(merged.mismatches).toEqual([]);
  });

  it("links every opening-round game to the seat its winner took", () => {
    const openers = merged.games.filter((g) => g.round === 0);
    expect(openers.length).toBe(4);
    for (const opener of openers) {
      const winnerId = opener.winnerSide === "home" ? opener.homeTeam?.id : opener.awayTeam?.id;
      expect(opener.feedsSeat).not.toBeNull();
      expect(teams.get(opener.feedsSeat as number)).toBe(winnerId);
      expect((opener.feedsSeat as number) % 2).toBe(1); // an away seat
    }
  });

  it("scores a perfect bracket 1,920 and a perfect second chance 1,280", () => {
    expect(bracketPicksProblem(winnerSeats, "main", winnerSeats)).toBeNull();
    expect(bracketScore(winnerSeats, winnerSeats, "main")).toBe(1920);
    const second = winnerSeats.map((seat, slot) => (slot >= 48 ? seat : null));
    expect(bracketPicksProblem(second, "second", winnerSeats)).toBeNull();
    expect(bracketScore(second, winnerSeats, "second")).toBe(1280);
    expect(bracketRoundCorrect(second, winnerSeats, "second")).toEqual([0, 0, 8, 4, 2, 1]);
  });

  it("scores a chalk bracket the same as an independent count by team", () => {
    const chalk = chalkByTeam(feed);
    const seatOfTeam = new Map([...teams].map(([seat, team]) => [team, seat]));
    const picks = Array.from({ length: 63 }, (_, slot) => seatOfTeam.get(chalk.get(slot) as number) as number);
    expect(bracketPicksProblem(picks, "main", winnerSeats)).toBeNull();
    let expected = 0;
    for (const game of feed.filter((g) => g.round >= 1)) {
      const slot = slotOf(game.round, game.bracket_location) as number;
      if (chalk.get(slot) === feedWinnerId(game)) expected += 10 * 2 ** (game.round - 1);
    }
    expect(expected).toBeGreaterThan(0);
    expect(bracketScore(picks, winnerSeats, "main")).toBe(expected);
    expect(bracketMaxPossible(picks, winnerSeats, "main")).toBe(expected); // all decided
  });

  it("replays hour by hour on the replay clock: locks, second chance, monotonic results", () => {
    const tips = feed.map((g) => Date.parse(String(g.date)));
    const start = Math.min(...tips) - 24 * HOUR;
    const end = Math.max(...tips) + REPLAY_GAME_MS + HOUR;
    let stored: BracketGameState[] = [];
    let previous: Array<number | null> = Array.from({ length: 63 }, () => null);
    const phases: Record<BracketKind, string[]> = { main: [], second: [] };
    for (let now = start; now <= end; now += HOUR) {
      stored = mergeBracketFeed(stored, maskBracketFeedAt(feed, now)).games;
      const seats = bracketWinnerSeats(stored);
      for (let slot = 0; slot < 63; slot += 1) {
        if (previous[slot] !== null) expect(seats[slot]).toBe(previous[slot]);
      }
      previous = seats;
      const locks = autoBracketLocks(stored);
      for (const kind of ["main", "second"] as const) {
        const phase = bracketKindPhase({ kind, nowMs: now, lockAt: locks[kind], fullField: hasFullField(stored), winnerSeats: seats });
        if (phases[kind].at(-1) !== phase) phases[kind].push(phase);
      }
      // Before an opener is over, its round-1 seat is empty.
      for (const opener of stored.filter((g) => g.round === 0 && !g.winnerSide)) {
        if (opener.feedsSeat === null) continue;
        const r1 = stored.find((g) => g.slot === Math.floor((opener.feedsSeat as number) / 2));
        expect(r1?.awayTeam).toBeNull();
      }
    }
    expect(phases.main).toEqual(["open", "locked", "complete"]);
    expect(phases.second).toEqual(["not_open", "open", "locked", "complete"]);
    expect(previous).toEqual(winnerSeats);
    expect(championshipTotal(stored)).toBe(championshipTotal(merged.games));
  });
});

describe("picks", () => {
  const seats = bracketWinnerSeats(mergeBracketFeed([], ncaabBracket as BracketFeedGame[]).games);

  it("offers a game's two teams, and a later game only the teams picked into it", () => {
    let picks: Array<number | null> = emptyPicks();
    expect(choosableSeats(picks, 0, "main", seats)).toEqual([0, 1]);
    expect(choosableSeats(picks, 32, "main", seats)).toEqual([]);
    picks = setBracketPick(picks, 0, 1, "main", seats) as Array<number | null>;
    picks = setBracketPick(picks, 1, 2, "main", seats) as Array<number | null>;
    expect(choosableSeats(picks, 32, "main", seats)).toEqual([1, 2]);
    expect(setBracketPick(picks, 32, 3, "main", seats)).toBeNull();
    expect(setBracketPick(picks, 0, 5, "main", seats)).toBeNull();
  });

  it("clears every later pick that advanced the team a change replaces", () => {
    let picks: Array<number | null> = [...seats];
    const champion = seats[62] as number;
    const firstGame = Math.floor(champion / 2);
    const other = champion % 2 === 0 ? champion + 1 : champion - 1;
    picks = setBracketPick(picks, firstGame, other, "main", seats) as Array<number | null>;
    expect(picks[firstGame]).toBe(other);
    for (let up = parentOf(firstGame); up; up = parentOf(up.slot)) expect(picks[up.slot]).toBeNull();
    expect(bracketPicksProblem(picks, "main", seats)).toBeNull();
    expect(bracketPickCount(picks, "main")).toBe(63 - 5); // rounds 2–6 on its path
    expect(isBracketComplete(picks, "main")).toBe(false);
  });

  it("rejects an impossible bracket, a wrong length and second-chance picks before the Sweet 16", () => {
    const bad = [...seats];
    bad[32] = bad[0] === 0 ? 1 : 0; // a team that lost its first game wins the next
    expect(bracketPicksProblem(bad, "main", seats)).toMatch(/doesn't follow/);
    expect(bracketPicksProblem(seats.slice(1), "main", seats)).toMatch(/array of 63/);
    expect(bracketPicksProblem(seats, "second", seats)).toMatch(/not part/);
    const second = emptyPicks();
    second[48] = seatRangeOfSlot(48)[0] === seats[32] ? seats[32] : (seats[33] as number);
    expect(bracketPicksProblem(second, "second", seats)).toBeNull();
    second[48] = 7; // a team that is not in the Sweet 16
    expect(bracketPicksProblem(second, "second", seats)).not.toBeNull();
  });

  it("copies a valid bracket and refuses one that no longer fits", () => {
    expect(copyableBracketPicks(seats, "main", seats)).toEqual(seats);
    const bad = [...seats];
    bad[62] = 99;
    expect(copyableBracketPicks(bad, "main", seats)).toBeNull();
  });
});

describe("scoring", () => {
  it("counts alive teams for max possible", () => {
    const decided: Array<number | null> = emptyPicks();
    decided[0] = 0; // seat 0 won its first game, seat 1 is out
    expect(isSeatAlive(0, decided)).toBe(true);
    expect(isSeatAlive(1, decided)).toBe(false);
    expect(isSeatAlive(40, decided)).toBe(true);
    const picks = emptyPicks();
    picks[0] = 0;
    picks[1] = 2;
    picks[32] = 2;
    expect(bracketMaxPossible(picks, decided, "main")).toBe(10 + 10 + 20);
    picks[32] = 1;
    expect(bracketMaxPossible(picks, decided, "main")).toBe(10 + 10);
  });

  it("pays bracket points ÷ 10 per round under a per-round key", () => {
    expect(bracketRoundVenuePoints(1, 32)).toBe(32);
    expect(bracketRoundVenuePoints(6, 1)).toBe(32);
    expect(bracketRoundVenuePoints(3, 0)).toBe(0);
    expect(bracketCreditKey("e1", 3, 2)).toBe("e1:r3:2");
  });

  it("ranks by score, then tiebreaker distance once the final is known, then earliest save", () => {
    const entries = [
      { entryId: "a", score: 500, tiebreaker: 150, submittedAt: "2027-03-17T10:00:00Z" },
      { entryId: "b", score: 500, tiebreaker: 141, submittedAt: "2027-03-17T12:00:00Z" },
      { entryId: "c", score: 500, tiebreaker: null, submittedAt: "2027-03-17T09:00:00Z" },
      { entryId: "d", score: 700, tiebreaker: 100, submittedAt: "2027-03-17T13:00:00Z" },
    ];
    expect(rankBracketEntries(entries, null).map((e) => e.entryId)).toEqual(["d", "c", "a", "b"]);
    const final = rankBracketEntries(entries, 140);
    expect(final.map((e) => e.entryId)).toEqual(["d", "b", "a", "c"]);
    expect(final.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
    expect(final[1].tiebreakDistance).toBe(1);
  });
});

describe("feed merge", () => {
  const feed = ncaabBracket as BracketFeedGame[];

  it("never changes a decided result from the feed: it reports a mismatch instead", () => {
    const stored = mergeBracketFeed([], feed).games;
    const flipped = feed.map((g) =>
      g.round === 1 && g.bracket_location === 1
        ? {
            ...g,
            home_team: { ...g.home_team, winner: g.home_team?.winner ? null : true, score: g.home_team?.winner ? 0 : 200 },
            away_team: { ...g.away_team, winner: g.away_team?.winner ? null : true, score: g.away_team?.winner ? 0 : 200 },
          }
        : g,
    );
    const again = mergeBracketFeed(stored, flipped);
    expect(bracketWinnerSeats(again.games)).toEqual(bracketWinnerSeats(stored));
    expect(again.mismatches).toHaveLength(1);
    expect(roundsChangedBetween(bracketWinnerSeats(stored), bracketWinnerSeats(again.games))).toEqual([]);
  });

  it("keeps an admin's teams and seat links", () => {
    const stored = mergeBracketFeed([], feed).games.map((g) =>
      g.slot === 0
        ? { ...g, teamsSetBy: "admin" as const, homeTeam: { ...(g.homeTeam as NonNullable<typeof g.homeTeam>), name: "Fixed" } }
        : g.round === 0 && g.location === 1
          ? { ...g, feedsSeat: 3, feedsSeatSetBy: "admin" as const }
          : g,
    );
    const again = mergeBracketFeed(stored, feed);
    expect(again.games.find((g) => g.slot === 0)?.homeTeam?.name).toBe("Fixed");
    expect(again.games.find((g) => g.round === 0 && g.location === 1)?.feedsSeat).toBe(3);
  });

  it("links the last opener to the last empty seat by elimination", () => {
    const games = [emptyBracketGame(1, 1), { ...emptyBracketGame(0, 1), homeTeam: null }];
    games[0] = { ...games[0], homeTeam: { id: 5, name: "A", fullName: "A", college: "A", abbreviation: "A", seed: 1 } };
    expect(linkOpeners(games).find((g) => g.round === 0)?.feedsSeat).toBe(1);
  });

  it("is a no-op on a second identical pull", () => {
    const stored = mergeBracketFeed([], feed).games;
    expect(mergeBracketFeed(stored, feed).changed).toEqual([]);
  });

  it("paces the sync: 2 min while a game is live, else until the next tip (≤ 1 h), stops when decided", () => {
    const tip = Date.parse("2027-03-18T16:00:00Z");
    const game = { ...emptyBracketGame(1, 1), tipAt: new Date(tip).toISOString() };
    expect(nextBracketSyncAt([game], tip - 3 * HOUR)).toBe(tip - 2 * HOUR);
    expect(nextBracketSyncAt([game], tip - 10 * 60_000)).toBe(tip);
    expect(nextBracketSyncAt([game], tip + 60_000)).toBe(tip + 3 * 60_000);
    expect(nextBracketSyncAt(mergeBracketFeed([], feed).games, tip)).toBeNull();
  });
});
