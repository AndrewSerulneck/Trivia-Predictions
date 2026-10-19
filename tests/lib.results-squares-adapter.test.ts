import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Squares + Brackets plan Phase 4: Super Bowl Squares on the Partner Results page
// (lib/results/adapters/squares.ts). One game per season per venue, listed once it has kicked off,
// standings = the venue points each winner's squares paid there (voided grades left out), usernames
// and scores only — no player id, no entry token. Inert with the flag off.

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
  is(col: string, value: null) { this.filters.push((row) => (row[col] ?? null) === value); return this; }
  not(col: string, _op: "is", value: null) { this.filters.push((row) => (row[col] ?? null) !== value); return this; }
  in(col: string, values: unknown[]) { this.filters.push((row) => values.includes(row[col])); return this; }
  then<T>(resolve: (value: { data: unknown; error: null }) => T): Promise<T> {
    const rows = (db.tables[this.table] ?? []).filter((row) => this.filters.every((filter) => filter(row)));
    return Promise.resolve(resolve({ data: rows, error: null }));
  }
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (table: string) => new FakeQuery(table) } }));
vi.mock("@/lib/timezone", () => ({ getVenueTimezone: async () => "America/Los_Angeles" }));

import { squaresResultsAdapter } from "@/lib/results/adapters/squares";
import { RESULTS_ADAPTERS } from "@/lib/results/adapters";
import { getResultsCompetition } from "@/lib/results/competitions";
import { ResultsNotFoundError } from "@/lib/results/errors";
import { SQUARES_GAME_NAME } from "@/lib/venueGameCards";

const EVENT_2027 = "00000000-0000-0000-0000-00000000e027";
const EVENT_2026 = "00000000-0000-0000-0000-00000000e026";
const ANN = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const CAT = "33333333-3333-3333-3333-333333333333";
const AFTER_GAME = Date.parse("2027-02-15T06:00:00Z");

const event = (id: string, kickoff: string, completed: boolean) => ({
  id,
  kickoff_at: kickoff,
  completed_at: completed ? "2027-02-15T03:00:00Z" : null,
  col_team: { name: "Patriots", abbreviation: "NE" },
  row_team: { name: "Seahawks", abbreviation: "SEA" },
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "true");
  db.reads = [];
  db.tables = {
    squares_boards: [
      // Kickoff 3:30 PM Pacific, Feb 14 (23:30 UTC).
      { id: "b-v1", venue_id: "v1", event_id: EVENT_2027, event: event(EVENT_2027, "2027-02-14T23:30:00Z", true) },
      { id: "b-v1-old", venue_id: "v1", event_id: EVENT_2026, event: event(EVENT_2026, "2026-02-08T23:30:00Z", true) },
      { id: "b-v2", venue_id: "v2", event_id: EVENT_2027, event: event(EVENT_2027, "2027-02-14T23:30:00Z", true) },
    ],
    squares_claims: [
      { board_id: "b-v1", user_id: ANN },
      { board_id: "b-v1", user_id: ANN },
      { board_id: "b-v1", user_id: BOB },
      { board_id: "b-v1", user_id: CAT },
      { board_id: "b-v2", user_id: CAT },
    ],
    squares_results: [
      { board_id: "b-v1", user_id: ANN, points: 25, created_at: "2027-02-15T00:00:00Z", voided_at: null },
      { board_id: "b-v1", user_id: BOB, points: 50, created_at: "2027-02-15T03:00:00Z", voided_at: null },
      { board_id: "b-v1", user_id: ANN, points: 25, created_at: "2027-02-15T01:00:00Z", voided_at: null },
      // A voided grade pays nothing here.
      { board_id: "b-v1", user_id: CAT, points: 25, created_at: "2027-02-15T02:00:00Z", voided_at: "2027-02-15T02:30:00Z" },
      // Another venue's board never counts.
      { board_id: "b-v2", user_id: CAT, points: 50, created_at: "2027-02-15T03:00:00Z", voided_at: null },
    ],
    users: [
      { id: ANN, username: "ann" },
      { id: BOB, username: "bob" },
    ],
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Super Bowl Squares on Results", () => {
  it("is registered with no breakdown", () => {
    expect(getResultsCompetition("squares")).toEqual({ id: "squares", label: SQUARES_GAME_NAME, scoreUnit: "pts", hasBreakdown: false });
    expect(RESULTS_ADAPTERS.squares).toBe(squaresResultsAdapter);
    expect(squaresResultsAdapter.getBreakdown).toBeUndefined();
  });

  it("lists one game per season, newest first, on the venue's own date, with its winners", async () => {
    const page = await squaresResultsAdapter.listGames({ venueId: "v1", before: null, limit: 20, nowMs: AFTER_GAME, withFirstGameDate: true });
    expect(page.exhausted).toBe(true);
    expect(page.firstGameDate).toBe("2026-02-08");
    expect(page.games[0]).toEqual({
      competitionId: "squares",
      gameKey: EVENT_2027,
      date: "2027-02-14",
      startsAt: "2027-02-14T23:30:00.000Z",
      title: "Patriots vs Seahawks",
      playerCount: 3,
      inProgress: false,
      winners: ["ann", "bob"],
      topScore: 50,
    });
    expect(page.games.map((game) => game.gameKey)).toEqual([EVENT_2027, EVENT_2026]);
    expect(JSON.stringify(page)).not.toMatch(new RegExp(`${ANN}|${BOB}|${CAT}`));
  });

  it("pages by date like every other competition", async () => {
    const page = await squaresResultsAdapter.listGames({ venueId: "v1", before: "2027-02-14", limit: 20, nowMs: AFTER_GAME });
    expect(page.games.map((game) => game.gameKey)).toEqual([EVENT_2026]);
    expect(page).not.toHaveProperty("firstGameDate");
    const first = await squaresResultsAdapter.listGames({ venueId: "v1", before: null, limit: 1, nowMs: AFTER_GAME });
    expect(first.games).toHaveLength(1);
    expect(first.exhausted).toBe(false);
  });

  it("doesn't list a game before kickoff, and names nobody while it's being played", async () => {
    const beforeKickoff = await squaresResultsAdapter.listGames({ venueId: "v1", before: null, limit: 20, nowMs: Date.parse("2027-02-14T23:00:00Z") });
    expect(beforeKickoff.games.map((game) => game.gameKey)).toEqual([EVENT_2026]);

    (db.tables.squares_boards[0].event as Row).completed_at = null;
    const live = await squaresResultsAdapter.getStandings({ venueId: "v1", gameKey: EVENT_2027, nowMs: AFTER_GAME });
    expect(live.game).toMatchObject({ inProgress: true, winners: [], topScore: 0, playerCount: 3 });
    expect(live.standings).toEqual([]);
  });

  it("standings are usernames and scores only, ranked, a tie going to whoever got there first", async () => {
    const detail = await squaresResultsAdapter.getStandings({ venueId: "v1", gameKey: EVENT_2027, nowMs: AFTER_GAME });
    expect(detail.standings).toEqual([
      { rank: 1, username: "ann", score: 50, entry: null },
      { rank: 1, username: "bob", score: 50, entry: null },
    ]);
    expect(JSON.stringify(detail)).not.toMatch(new RegExp(`${ANN}|${BOB}|${CAT}`));
  });

  it("is a 404 for another venue's game, a malformed key, or a game not yet kicked off", async () => {
    const notFound = (params: { venueId: string; gameKey: string; nowMs?: number }) =>
      expect(squaresResultsAdapter.getStandings({ nowMs: AFTER_GAME, ...params })).rejects.toBeInstanceOf(ResultsNotFoundError);
    await notFound({ venueId: "v3", gameKey: EVENT_2027 });
    await notFound({ venueId: "v1", gameKey: "../../etc" });
    await notFound({ venueId: "v1", gameKey: EVENT_2027, nowMs: Date.parse("2027-02-14T20:00:00Z") });
  });

  it("is inert with the flag off: nothing listed, every game a 404, and no read at all", async () => {
    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "");
    const page = await squaresResultsAdapter.listGames({ venueId: "v1", before: null, limit: 20, nowMs: AFTER_GAME, withFirstGameDate: true });
    expect(page).toEqual({ games: [], exhausted: true, firstGameDate: null });
    await expect(squaresResultsAdapter.getStandings({ venueId: "v1", gameKey: EVENT_2027, nowMs: AFTER_GAME })).rejects.toBeInstanceOf(
      ResultsNotFoundError,
    );
    expect(db.reads).toEqual([]);
  });

  it("costs one read for a venue with no Squares board", async () => {
    const page = await squaresResultsAdapter.listGames({ venueId: "v-none", before: null, limit: 20, nowMs: AFTER_GAME });
    expect(page.games).toEqual([]);
    expect(db.reads).toEqual(["squares_boards"]);
  });
});
