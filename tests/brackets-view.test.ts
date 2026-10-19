import { describe, expect, it } from "vitest";
import { entryOf, makeTournament, replayGames } from "./fixtures/brackets/view";
import { setBracketPick, bracketPickCount } from "@/lib/brackets/picks";
import { bracketMaxPossible, bracketScore } from "@/lib/brackets/scoring";
import { emptyPicks, slotsOfKind, regionOfSlot, roundOfSlot } from "@/lib/brackets/tree";
import {
  bracketChampionPick,
  bracketFinishStepId,
  bracketHeadline,
  bracketKeyFor,
  bracketMatchupSides,
  bracketOptionLabel,
  bracketPickCounts,
  bracketPickState,
  bracketRegionName,
  bracketSaveMessage,
  bracketSeatTeams,
  bracketStateCanChange,
  bracketStepProgress,
  bracketSteps,
  bracketSwitcher,
  defaultBracketKey,
  filterBracketStandings,
  formatBracketLock,
  selectableBrackets,
  withSavedEntry,
} from "@/lib/bracketsView";

// Phase 8 of docs/squares-and-brackets-plan.md: every decision the bracket screen makes, on the real
// 2026 tournaments (fixtures from Phase 0). The rules themselves are pinned in brackets-engine.test.ts.

const SELECTION_SUNDAY = Date.parse("2026-03-15T20:00:00Z");

describe("bracket steps", () => {
  const names = ["East", "West", null, "Midwest"];

  it("fills the main bracket one region at a time, then the Final Four, then Finish", () => {
    const steps = bracketSteps("main", names);
    expect(steps.map((step) => step.title)).toEqual(["East", "West", "Region 3", "Midwest", "Final Four", "Finish"]);
    for (const step of steps.slice(0, 4)) {
      const slots = step.groups.flatMap((group) => group.slots);
      expect(slots).toHaveLength(15);
      expect(step.groups.map((group) => group.slots.length)).toEqual([8, 4, 2, 1]);
      expect(new Set(slots.map((slot) => regionOfSlot(slot))).size).toBe(1);
    }
    expect(steps[4].groups.flatMap((group) => group.slots)).toHaveLength(3);
    expect(steps[5].id).toBe(bracketFinishStepId);
    expect(steps[5].groups).toEqual([]);
  });

  it("covers every pick of a kind exactly once", () => {
    for (const kind of ["main", "second"] as const) {
      const covered = bracketSteps(kind, names).flatMap((step) => step.groups.flatMap((group) => group.slots));
      expect([...covered].sort((a, b) => a - b)).toEqual([...slotsOfKind(kind)].sort((a, b) => a - b));
    }
  });

  it("gives the second chance one region step of 12 picks, grouped by region, plus the Final Four", () => {
    const steps = bracketSteps("second", names);
    expect(steps.map((step) => step.id)).toEqual(["regions", "final-four", bracketFinishStepId]);
    expect(steps[0].groups).toHaveLength(4);
    expect(steps[0].groups.every((group) => group.slots.length === 3 && group.showRound)).toBe(true);
    expect(steps[0].groups.flatMap((group) => group.slots).every((slot) => roundOfSlot(slot) >= 3)).toBe(true);
  });

  it("counts a step's picks", () => {
    const steps = bracketSteps("main", names);
    const picks = emptyPicks();
    picks[0] = 0;
    picks[1] = 3;
    expect(bracketStepProgress(steps[0], picks)).toEqual({ done: 2, total: 15 });
    expect(bracketStepProgress(steps[1], picks)).toEqual({ done: 0, total: 15 });
  });

  it("names a region the admin hasn't entered yet", () => {
    expect(bracketRegionName(names, 2)).toBe("Region 3");
    expect(bracketRegionName(names, 0)).toBe("East");
  });
});

describe("seat teams", () => {
  it("knows all 64 teams once the field is set", () => {
    const { views } = replayGames("men");
    const seats = bracketSeatTeams(views);
    expect(seats).toHaveLength(64);
    expect(seats.every((seat) => !seat.tbd && !seat.pending)).toBe(true);
    expect(seats.every((seat) => seat.seed !== null && seat.name.length > 0)).toBe(true);
  });

  it("shows an undecided opening-round game as 'A / B' in the seat it fills", () => {
    // Before Selection Sunday's openers are played the feed has no team in their round-1 seats, and
    // nothing links the two until an admin does (Phase 7 'problems' list): link them here the same way.
    const { views } = replayGames("men", SELECTION_SUNDAY);
    const unlinked = bracketSeatTeams(views);
    const empty = unlinked.filter((seat) => seat.tbd).map((seat) => seat.seat);
    const openers = views.filter((game) => game.round === 0);
    expect(openers.length).toBeGreaterThan(0);
    expect(empty.length).toBeGreaterThanOrEqual(openers.length);
    const linked = views.map((game) => {
      const index = openers.indexOf(game);
      return index >= 0 ? { ...game, feedsSeat: empty[index] } : game;
    });
    const seats = bracketSeatTeams(linked);
    const pending = seats.filter((seat) => seat.pending);
    expect(pending.map((seat) => seat.seat)).toEqual(empty.slice(0, openers.length));
    for (const seat of pending) {
      expect(seat.name).toContain(" / ");
      expect(seat.abbreviation).toContain(" / ");
    }
  });

  it("shows the winner once the opening-round game is decided", () => {
    const { views } = replayGames("men", SELECTION_SUNDAY);
    const [opener] = views.filter((game) => game.round === 0 && game.home && game.away);
    const seat = bracketSeatTeams(views).find((candidate) => candidate.tbd)?.seat as number;
    const decided = views.map((game) => (game === opener ? { ...game, feedsSeat: seat, winnerSide: "away" as const } : game));
    const team = bracketSeatTeams(decided)[seat];
    expect(team.pending).toBe(false);
    expect(team.name).toBe(opener.away?.name);
  });

  it("says TBD for a seat nothing is known about", () => {
    const seats = bracketSeatTeams([]);
    expect(seats.every((seat) => seat.tbd && seat.name === "TBD")).toBe(true);
  });
});

describe("matchups and pick states", () => {
  const { winnerSeats } = replayGames("men");

  it("offers a round-1 game's two seats, and a later game what you picked before it", () => {
    const picks = emptyPicks();
    expect(bracketMatchupSides(picks, 0, "main", winnerSeats)).toEqual([0, 1]);
    expect(bracketMatchupSides(picks, 32, "main", winnerSeats)).toEqual([null, null]);
    const withFirst = setBracketPick(picks, 0, 1, "main", winnerSeats) as Array<number | null>;
    const withBoth = setBracketPick(withFirst, 1, 2, "main", winnerSeats) as Array<number | null>;
    expect(bracketMatchupSides(withBoth, 32, "main", winnerSeats)).toEqual([1, 2]);
  });

  it("starts the second chance from the real Sweet 16, not from picks", () => {
    const sides = bracketMatchupSides(emptyPicks(), 48, "second", winnerSeats);
    expect(sides).toEqual([winnerSeats[32], winnerSeats[33]]);
    expect(sides.every((seat) => seat !== null)).toBe(true);
  });

  it("marks a perfect bracket all correct and a blank one all unpicked", () => {
    const perfect = winnerSeats.map((seat) => seat);
    const counts = bracketPickCounts(perfect, winnerSeats, "main");
    expect(counts).toEqual({ none: 0, correct: 63, wrong: 0, alive: 0, out: 0 });
    expect(bracketPickCounts(emptyPicks(), winnerSeats, "main").none).toBe(63);
  });

  it("tells wrong from right, and alive from knocked out, before the tournament is over", () => {
    const early = replayGames("men", Date.parse("2026-03-20T03:00:00Z")); // after most of the Round of 64's first day
    const decided = early.winnerSeats.findIndex((seat, slot) => slot < 32 && seat !== null);
    expect(decided).toBeGreaterThanOrEqual(0);
    const winner = early.winnerSeats[decided] as number;
    const loser = winner % 2 === 0 ? winner + 1 : winner - 1;
    const picks = emptyPicks();
    picks[decided] = winner;
    expect(bracketPickState(picks, early.winnerSeats, decided)).toBe("correct");
    picks[decided] = loser;
    expect(bracketPickState(picks, early.winnerSeats, decided)).toBe("wrong");
    // The loser's later-round pick can't happen any more.
    const pending = early.winnerSeats.findIndex((seat, slot) => slot >= 32 && seat === null);
    const laterPicks = emptyPicks();
    laterPicks[pending] = loser;
    expect(bracketPickState(laterPicks, early.winnerSeats, pending)).toBe("out");
    // A team that won and has not played again is still alive.
    laterPicks[pending] = winner;
    expect(bracketPickState(laterPicks, early.winnerSeats, pending)).toBe("alive");
  });

  it("finds the champion pick", () => {
    expect(bracketChampionPick(emptyPicks(), winnerSeats)).toBeNull();
    const picks = winnerSeats.map((seat) => seat);
    expect(bracketChampionPick(picks, winnerSeats)).toEqual({ seat: winnerSeats[62], state: "correct" });
  });

  it("scores in step with the engine (the screen shows what the database stores)", () => {
    const picks = winnerSeats.map((seat) => seat);
    expect(bracketScore(picks, winnerSeats, "main")).toBe(1920);
    expect(bracketMaxPossible(picks, winnerSeats, "main")).toBe(1920);
    expect(bracketPickCount(picks, "main")).toBe(63);
  });
});

describe("which brackets show", () => {
  const open = makeTournament({ id: "m", gender: "men", main: { phase: "open", lockAt: "2027-03-18T16:15:00.000Z" } });
  const women = makeTournament({ id: "w", gender: "women", main: { phase: "locked" }, second: { phase: "not_open" } });

  it("lists only open, locked or graded brackets, men's first, main before second chance", () => {
    expect(selectableBrackets([women, open]).map((option) => option.label)).toEqual(["Men's bracket", "Women's bracket"]);
    const both = makeTournament({ id: "m", gender: "men", main: { phase: "complete" }, second: { phase: "open" } });
    expect(selectableBrackets([both, women]).map((option) => option.label)).toEqual([
      "Men's bracket",
      "Women's bracket",
      "Men's second chance",
    ]);
    expect(selectableBrackets([makeTournament({})])).toEqual([]);
  });

  it("opens on a bracket the player still has to finish", () => {
    const options = selectableBrackets([open, women]);
    expect(defaultBracketKey(options)).toBe("m:main");
    const finished = makeTournament({
      id: "m",
      gender: "men",
      main: { phase: "open", mine: entryOf(replayGames("men").winnerSeats) },
    });
    const unfinishedWomen = makeTournament({ id: "w", gender: "women", main: { phase: "open" } });
    expect(defaultBracketKey(selectableBrackets([finished, unfinishedWomen]))).toBe("w:main");
    expect(defaultBracketKey([])).toBeNull();
  });

  it("builds the switcher from what exists", () => {
    const options = selectableBrackets([
      makeTournament({ id: "m", gender: "men", main: { phase: "complete" }, second: { phase: "complete" } }),
      makeTournament({ id: "w", gender: "women", main: { phase: "open" } }),
    ]);
    const men = options.find((option) => option.key === "m:second") ?? null;
    expect(bracketSwitcher(options, men)).toEqual({ genders: ["men", "women"], kinds: ["main", "second"] });
    const women = options.find((option) => option.key === "w:main") ?? null;
    expect(bracketSwitcher(options, women)).toEqual({ genders: ["men", "women"], kinds: ["main"] });
    expect(bracketKeyFor(options, "women", "second")).toBe("w:main");
    expect(bracketKeyFor(options, "men", "second")).toBe("m:second");
    expect(bracketOptionLabel("women", "second")).toBe("Women's second chance");
  });

  it("only re-reads on return while something can still change", () => {
    expect(bracketStateCanChange([open])).toBe(true);
    const done = makeTournament({ main: { phase: "complete" }, second: { phase: "complete" } });
    expect(bracketStateCanChange([done])).toBe(false);
  });
});

describe("headline and messages", () => {
  const lockAt = "2027-03-18T16:15:00.000Z";

  it("tells an open bracket's story by how far along it is", () => {
    const blank = bracketHeadline({ phase: "open", kind: "main", mine: null, lockAt, timeZone: "America/New_York" });
    expect(blank.title).toBe("Fill out your bracket");
    expect(blank.detail).toBe("Picks lock Thu, Mar 18, 12:15 PM EDT");
    const part = bracketHeadline({ phase: "open", kind: "main", mine: entryOf(emptyPicks().map((_, i) => (i < 10 ? 0 : null))), lockAt });
    expect(part.title).toMatch(/^\d+ picks to go$/);
    const full = bracketHeadline({ phase: "open", kind: "main", mine: entryOf(replayGames("men").winnerSeats), lockAt });
    expect(full.title).toBe("Your bracket is in");
  });

  it("covers locked and final", () => {
    const mine = entryOf(replayGames("men").winnerSeats, { score: 340 });
    expect(bracketHeadline({ phase: "locked", kind: "main", mine, lockAt })).toEqual({ title: "Picks are locked", detail: "340 points so far" });
    expect(bracketHeadline({ phase: "complete", kind: "main", mine, lockAt }).detail).toBe("You finished with 340 points");
    expect(bracketHeadline({ phase: "locked", kind: "main", mine: null, lockAt }).detail).toBe("You didn't fill this one out.");
  });

  it("formats a lock time, and nothing for a missing one", () => {
    expect(formatBracketLock(null)).toBeNull();
    expect(formatBracketLock("not a date")).toBeNull();
    expect(formatBracketLock(lockAt, "America/New_York")).toContain("12:15 PM");
  });

  it("has words for every refusal", () => {
    for (const outcome of ["locked", "not_open", "wrong_venue", "invalid_picks", "invalid_tiebreaker", "no_source", "source_invalid", "no_tournament", null]) {
      expect(bracketSaveMessage(outcome).length).toBeGreaterThan(10);
    }
    expect(bracketSaveMessage("locked")).toContain("locked");
  });
});

describe("saving without re-reading", () => {
  it("replaces the entry in the state it already holds", () => {
    const tournament = makeTournament({ id: "m", main: { phase: "open" }, second: { phase: "not_open" } });
    const picks = emptyPicks();
    picks[0] = 1;
    const next = withSavedEntry([tournament], { tournamentId: "m", kind: "main", picks, tiebreaker: 140, savedAt: "2027-03-15T00:00:00.000Z", maxPossible: 10 });
    expect(next[0].kinds.main.mine).toEqual({
      picks,
      tiebreaker: 140,
      pickCount: 1,
      score: 0,
      maxPossible: 10,
      savedAt: "2027-03-15T00:00:00.000Z",
    });
    expect(next[0].kinds.second).toBe(tournament.kinds.second);
    expect(tournament.kinds.main.mine).toBeNull();
  });
});

describe("standings search", () => {
  const rows = [{ username: "Maverick" }, { username: "goose" }, { username: "Iceman" }];
  it("finds a player by any part of the name, ignoring case", () => {
    expect(filterBracketStandings(rows, "GOO")).toEqual([{ username: "goose" }]);
    expect(filterBracketStandings(rows, " ice ")).toEqual([{ username: "Iceman" }]);
    expect(filterBracketStandings(rows, "")).toHaveLength(3);
    expect(filterBracketStandings(rows, "zzz")).toEqual([]);
  });
});
