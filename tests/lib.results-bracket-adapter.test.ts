import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Squares + Brackets plan Phase 9a: March Madness on the Partner Results page
// (lib/results/adapters/bracket.ts). One game per bracket the venue played, listed once it locked,
// named nobody until the championship is graded; standings in the bracket's own order with entry
// tokens (never a user id); a breakdown is that player's picks, right or wrong, totalling their score.

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, reads: [] as string[] }));

class FakeQuery {
  private filters: Array<(row: Row) => boolean> = [];
  constructor(private table: string) {
    db.reads.push(table);
  }
  select() { return this; }
  order() { return this; }
  limit() { return this; }
  returns() { return this; }
  eq(col: string, value: unknown) { this.filters.push((row) => row[col] === value); return this; }
  gt(col: string, value: number) { this.filters.push((row) => Number(row[col]) > value); return this; }
  in(col: string, values: unknown[]) { this.filters.push((row) => values.includes(row[col])); return this; }
  then<T>(resolve: (value: { data: unknown; error: null }) => T): Promise<T> {
    const rows = (db.tables[this.table] ?? []).filter((row) => this.filters.every((filter) => filter(row)));
    return Promise.resolve(resolve({ data: rows, error: null }));
  }
}

const rpc = async (name: string, args: Row) => {
  db.reads.push(`rpc:${name}`);
  expect(name).toBe("bracket_venue_games");
  const counts = new Map<string, Row>();
  for (const row of db.tables.bracket_entries ?? []) {
    if (row.venue_id !== args.p_venue_id || Number(row.pick_count) <= 0) continue;
    const key = `${row.tournament_id}|${row.kind}`;
    const current = counts.get(key) ?? { tournament_id: row.tournament_id, kind: row.kind, entries: 0 };
    current.entries = Number(current.entries) + 1;
    counts.set(key, current);
  }
  return { data: [...counts.values()], error: null };
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: (table: string) => new FakeQuery(table), rpc: (name: string, args: Row) => rpc(name, args) },
}));
vi.mock("@/lib/timezone", () => ({ getVenueTimezone: async () => "America/New_York" }));

import { bracketResultsAdapter } from "@/lib/results/adapters/bracket";
import { RESULTS_ADAPTERS } from "@/lib/results/adapters";
import { getResultsCompetition } from "@/lib/results/competitions";
import { ResultsNotFoundError, ResultsUnavailableError } from "@/lib/results/errors";
import { BRACKET_GAME_NAME } from "@/lib/venueGameCards";

const MEN = "00000000-0000-0000-0000-0000000000a1";
const WOMEN = "00000000-0000-0000-0000-0000000000a2";
const ANN = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const CAT = "33333333-3333-3333-3333-333333333333";
const AFTER = Date.parse("2027-04-07T12:00:00Z");

// Ann picked the home seat everywhere; the results are home everywhere except slot 0 (away won).
const HOME_PICKS = (() => {
  const picks: number[] = [];
  for (let slot = 0; slot < 63; slot += 1) {
    if (slot < 32) picks.push(2 * slot);
    else {
      const round = slot >= 62 ? 6 : slot >= 60 ? 5 : slot >= 56 ? 4 : slot >= 48 ? 3 : 2;
      const offset = 64 - 2 ** (7 - round);
      const below = 64 - 2 ** (8 - round);
      picks.push(picks[below + 2 * (slot - offset)]);
    }
  }
  return picks;
})();
const RESULTS = HOME_PICKS.map((seat, slot) => (slot === 0 ? 1 : seat));

const tournament = (id: string, gender: string, completed: boolean, mainLock: string) => ({
  id,
  gender,
  season: 2026,
  purpose: "live",
  clock_offset_seconds: 0,
  region_names: ["East", "West", "South", "Midwest"],
  winner_seats: RESULTS,
  championship_total: 140,
  main_lock_at: mainLock,
  second_lock_at: null,
  completed_at: completed ? "2027-04-06T03:30:00Z" : null,
});

const entry = (tournament_id: string, user_id: string, score: number, overrides: Row = {}) => ({
  id: `${tournament_id}-${user_id}`,
  tournament_id,
  kind: "main",
  venue_id: "v1",
  user_id,
  score,
  tiebreaker: 140,
  pick_count: 63,
  picks: HOME_PICKS,
  submitted_at: "2027-03-17T12:00:00Z",
  ...overrides,
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_BRACKETS_ENABLED", "true");
  vi.stubEnv("SESSION_SECRET", "test-secret-for-results-tokens");
  db.reads = [];
  db.tables = {
    bracket_tournaments: [
      tournament(MEN, "men", true, "2027-03-18T16:15:00Z"),
      tournament(WOMEN, "women", false, "2027-03-19T16:00:00Z"),
    ],
    bracket_entries: [
      entry(MEN, ANN, 1910),
      entry(MEN, BOB, 1910, { tiebreaker: 150 }),
      entry(MEN, CAT, 0),
      entry(MEN, "dddddddd-dddd-dddd-dddd-dddddddddddd", 900, { venue_id: "v2" }),
      entry(WOMEN, ANN, 400),
    ],
    bracket_games: [],
    users: [
      { id: ANN, username: "ann" },
      { id: BOB, username: "bob" },
      { id: CAT, username: "cat" },
    ],
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("March Madness on Results", () => {
  it("is registered with a breakdown", () => {
    expect(getResultsCompetition("bracket")).toEqual({ id: "bracket", label: BRACKET_GAME_NAME, scoreUnit: "pts", hasBreakdown: true });
    expect(RESULTS_ADAPTERS.bracket).toBe(bracketResultsAdapter);
  });

  it("is inert with both switches off: no game, no read", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRACKETS_ENABLED", "");
    expect(await bracketResultsAdapter.listGames({ venueId: "v1", before: null, limit: 20, nowMs: AFTER, withFirstGameDate: true })).toEqual({
      games: [],
      exhausted: true,
      firstGameDate: null,
    });
    expect(db.reads).toEqual([]);
    await expect(bracketResultsAdapter.getStandings({ venueId: "v1", gameKey: `${MEN}:main`, nowMs: AFTER })).rejects.toBeInstanceOf(ResultsNotFoundError);
  });

  it("lists the venue's locked brackets newest first, dated on the lock day, naming nobody until the final", async () => {
    const page = await bracketResultsAdapter.listGames({ venueId: "v1", before: null, limit: 20, nowMs: AFTER, withFirstGameDate: true });
    expect(page.games).toEqual([
      {
        competitionId: "bracket",
        gameKey: `${WOMEN}:main`,
        date: "2027-03-19",
        startsAt: "2027-03-19T16:00:00.000Z",
        title: "Women's bracket 2027",
        playerCount: 1,
        inProgress: true,
        winners: [],
        topScore: 0,
      },
      {
        competitionId: "bracket",
        gameKey: `${MEN}:main`,
        date: "2027-03-18",
        startsAt: "2027-03-18T16:15:00.000Z",
        title: "Men's bracket 2027",
        playerCount: 3,
        inProgress: false,
        winners: ["ann"], // ties on points go to the closer championship guess
        topScore: 1910,
      },
    ]);
    expect(page).toMatchObject({ exhausted: true, firstGameDate: "2027-03-18" });
    // Before the men's lock nothing is listed.
    const early = await bracketResultsAdapter.listGames({ venueId: "v1", before: null, limit: 20, nowMs: Date.parse("2027-03-18T12:00:00Z") });
    expect(early.games).toEqual([]);
  });

  it("dates a walked rehearsal on the day its lock really passed, not lock + the current offset (plan 10.7.1)", async () => {
    // Replay of March 2026, walked to the final: the offset left is only a few days, so lock + offset
    // lands in March; the stamp says the lock really passed on Oct 21.
    db.tables.bracket_tournaments = [
      {
        ...tournament(MEN, "men", true, "2026-03-19T16:15:00Z"),
        purpose: "rehearsal",
        clock_offset_seconds: 3 * 24 * 3600,
        main_lock_passed_at: "2026-10-21T19:40:00Z",
      },
    ];
    const page = await bracketResultsAdapter.listGames({ venueId: "v1", before: null, limit: 20, nowMs: Date.parse("2026-10-22T12:00:00Z") });
    expect(page.games).toMatchObject([{ gameKey: `${MEN}:main`, date: "2026-10-21", startsAt: "2026-10-21T19:40:00.000Z" }]);
  });

  it("gives the standings in the bracket's order, scorers only, with tokens instead of ids", async () => {
    const detail = await bracketResultsAdapter.getStandings({ venueId: "v1", gameKey: `${MEN}:main`, nowMs: AFTER });
    expect(detail.standings.map((row) => [row.rank, row.username, row.score])).toEqual([
      [1, "ann", 1910],
      [2, "bob", 1910],
    ]);
    expect(detail.standings.every((row) => typeof row.entry === "string" && row.entry.length === 22)).toBe(true);
    expect(JSON.stringify(detail)).not.toContain(ANN);
    const inProgress = await bracketResultsAdapter.getStandings({ venueId: "v1", gameKey: `${WOMEN}:main`, nowMs: AFTER });
    expect(inProgress.standings).toEqual([]);
  });

  it("opens a player's picks: right or wrong, the round's points, totalling their score", async () => {
    const detail = await bracketResultsAdapter.getStandings({ venueId: "v1", gameKey: `${MEN}:main`, nowMs: AFTER });
    const token = detail.standings[0].entry as string;
    const breakdown = await bracketResultsAdapter.getBreakdown!({ venueId: "v1", gameKey: `${MEN}:main`, entry: token, nowMs: AFTER });
    expect(breakdown.rows).toHaveLength(63);
    expect(breakdown.rows[0]).toMatchObject({ group: "Round of 64", label: "East", outcome: "wrong", points: 0 });
    expect(breakdown.rows[62]).toMatchObject({ group: "Championship", label: "Final", outcome: "right", points: 320 });
    expect(breakdown.total).toBe(1910);
    // The token is this venue's game only.
    await expect(
      bracketResultsAdapter.getBreakdown!({ venueId: "v2", gameKey: `${MEN}:main`, entry: token, nowMs: AFTER }),
    ).rejects.toBeInstanceOf(ResultsNotFoundError);
    vi.stubEnv("SESSION_SECRET", "");
    await expect(
      bracketResultsAdapter.getBreakdown!({ venueId: "v1", gameKey: `${MEN}:main`, entry: token, nowMs: AFTER }),
    ).rejects.toBeInstanceOf(ResultsUnavailableError);
  });

  it("404s another venue's bracket, a malformed key and a bracket the venue never played", async () => {
    await expect(bracketResultsAdapter.getStandings({ venueId: "v3", gameKey: `${MEN}:main`, nowMs: AFTER })).rejects.toBeInstanceOf(ResultsNotFoundError);
    await expect(bracketResultsAdapter.getStandings({ venueId: "v1", gameKey: "nope", nowMs: AFTER })).rejects.toBeInstanceOf(ResultsNotFoundError);
    await expect(bracketResultsAdapter.getStandings({ venueId: "v1", gameKey: `${MEN}:second`, nowMs: AFTER })).rejects.toBeInstanceOf(ResultsNotFoundError);
  });
});
