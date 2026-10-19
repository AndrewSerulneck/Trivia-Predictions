import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Squares + Brackets plan Phase 2: replays a Super Bowl through runSquaresTick() a minute at a time
// against an in-memory stand-in for the squares_* tables and RPCs (the real SQL is proven by
// `npm run test:squares-sql`). Checks the glue: lock → draw → hold → grade → pay → complete, the
// provider-request budget, and that a retried run pays nothing twice.

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let clockMs = 0;
/** Every select by table, and the size of every `.in()` list (plan 6.3: idle runs read nothing; ≤ 150 ids per `.in()`). */
const io = { selects: [] as string[], inSizes: [] as number[] };
let uuid = 0;
const nextId = () => `00000000-0000-0000-0000-${String(++uuid).padStart(12, "0")}`;

type Filter = (row: Row) => boolean;
class FakeQuery {
  private filters: Filter[] = [];
  private op: "select" | "update" | "insert" | "upsert" = "select";
  private payload: Row | Row[] | null = null;
  private max = Infinity;
  private mode: "many" | "single" | "maybe" = "many";
  constructor(private table: string) {}
  select() { return this; }
  order() { return this; }
  eq(col: string, value: unknown) { this.filters.push((row) => row[col] === value); return this; }
  is(col: string, value: null) { this.filters.push((row) => (row[col] ?? null) === value); return this; }
  not(col: string, _op: "is", value: null) { this.filters.push((row) => (row[col] ?? null) !== value); return this; }
  in(col: string, values: unknown[]) { io.inSizes.push(values.length); this.filters.push((row) => values.includes(row[col])); return this; }
  limit(n: number) { this.max = n; return this; }
  returns() { return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  single() { this.mode = "single"; return this; }
  update(payload: Row) { this.op = "update"; this.payload = payload; return this; }
  insert(payload: Row | Row[]) { this.op = "insert"; this.payload = payload; return this; }
  upsert(payload: Row[]) { this.op = "upsert"; this.payload = payload; return this; }
  then<T>(resolve: (value: { data: unknown; error: null }) => T): Promise<T> {
    const rows = (tables[this.table] ??= []);
    let data: unknown;
    if (this.op === "insert" || this.op === "upsert") {
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      const inserted = items
        .filter((item) => this.op === "insert" || !rows.some((row) => row.event_id === item.event_id && row.moment === item.moment))
        .map((item) => ({ id: nextId(), grade_no: 1, archived_at: null, drawn_at: null, completed_at: null, ...item }));
      rows.push(...inserted);
      data = this.mode === "many" ? inserted : inserted[0];
    } else {
      if (this.op === "select") io.selects.push(this.table);
      const matched = rows.filter((row) => this.filters.every((filter) => filter(row))).slice(0, this.max);
      if (this.op === "update") matched.forEach((row) => Object.assign(row, this.payload));
      data = this.mode === "many" ? matched : matched[0] ?? null;
    }
    return Promise.resolve(resolve({ data, error: null }));
  }
}

const rpc = async (name: string, args: Row) => {
  const events = tables.squares_events ?? [];
  if (name === "squares_draw") {
    const event = events.find((e) => e.id === args.p_event_id) as Row;
    const drew = !event.drawn_at && clockMs >= Date.parse(String(event.lock_at));
    if (drew) Object.assign(event, { col_digits: args.p_col_digits, row_digits: args.p_row_digits, drawn_at: new Date(clockMs).toISOString() });
    return { data: [{ draw_happened: drew, draw_drawn_at: event.drawn_at }], error: null };
  }
  if (name === "squares_grade_moment") {
    const event = events.find((e) => e.id === args.p_event_id) as Row;
    const moment = tables.squares_event_moments.find((m) => m.event_id === args.p_event_id && m.moment === args.p_moment) as Row;
    if (moment.graded_at) return { data: [{ grade_outcome: "already_graded" }], error: null };
    const col = (event.col_digits as number[]).indexOf(Number(args.p_col_score) % 10);
    const row = (event.row_digits as number[]).indexOf(Number(args.p_row_score) % 10);
    const cell = row * 10 + col;
    for (const board of (tables.squares_boards ?? []).filter((b) => b.event_id === event.id)) {
      const claim = (tables.squares_claims ?? []).find((c) => c.board_id === board.id && c.cell === cell);
      (tables.squares_results ??= []).push({
        id: nextId(), event_id: event.id, board_id: board.id, moment: args.p_moment, grade_no: moment.grade_no, winning_cell: cell,
        user_id: claim?.user_id ?? null, points: claim ? args.p_points : 0,
        credit_key: claim ? `${board.id}:${args.p_moment}:${moment.grade_no}` : null, credited_at: null, voided_at: null,
      });
    }
    Object.assign(moment, { col_score: args.p_col_score, row_score: args.p_row_score, winning_cell: cell, score_source: args.p_source, graded_at: new Date(clockMs).toISOString() });
    return { data: [{ grade_outcome: "graded", grade_winning_cell: cell, grade_boards: 0, grade_winners: 0 }], error: null };
  }
  if (name === "credit_seasonal_points") {
    const ledger = (tables.seasonal_points_credits ??= []);
    const out = (args.p_credits as Array<{ user_id: string; source_key: string; points: number }>).map((c) => {
      const existing = ledger.find((l) => l.source_key === c.source_key);
      if (existing) return { credit_user_id: c.user_id, credit_source_key: c.source_key, credit_points: c.points, outcome: "already_credited", existing_user_id: existing.user_id, existing_points: existing.points };
      const user = tables.users.find((u) => u.id === c.user_id);
      if (!user) return { credit_user_id: c.user_id, credit_source_key: c.source_key, credit_points: c.points, outcome: "user_not_found", existing_user_id: null, existing_points: null };
      ledger.push({ source_key: c.source_key, user_id: c.user_id, points: c.points });
      user.points = Number(user.points) + c.points;
      return { credit_user_id: c.user_id, credit_source_key: c.source_key, credit_points: c.points, outcome: "credited", existing_user_id: null, existing_points: null };
    });
    return { data: out, error: null };
  }
  throw new Error(`unexpected rpc ${name}`);
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: (t: string) => new FakeQuery(t), rpc: (name: string, args: Row) => rpc(name, args) },
}));

const feed = vi.hoisted(() => ({ game: null as unknown, superBowl: null as unknown, requests: 0 }));
vi.mock("@/lib/squaresFeed", () => ({
  fetchSquaresGame: async () => { feed.requests += 1; return { ok: true, value: feed.game }; },
  fetchSuperBowlGame: async () => { feed.requests += 1; return { ok: true, value: feed.superBowl }; },
}));

import type { NflFeedGame } from "@/lib/squares";
import { winningCell } from "@/lib/squares";
import { payUnpaidSquaresResults, runSquaresTick, squaresCreditBlockNote } from "@/lib/squaresSettlement";

const postseason = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures/squares/nfl-postseason-2025.json"), "utf8"),
) as NflFeedGame[];
// Super Bowl LX moved to Feb 14, 2027 (inside the card window), same scores: NE (AFC, home) 13 – SEA 29.
const KICKOFF = Date.parse("2027-02-14T23:30:00Z");
const finalRecord: NflFeedGame = { ...postseason.find((g) => g.id === 1341307)!, date: new Date(KICKOFF).toISOString() };
const liveRecord = (status: string, q: { h: (number | null)[]; v: (number | null)[] }): NflFeedGame => {
  const sum = (xs: (number | null)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0);
  return {
    ...finalRecord,
    status, status_state: "in",
    home_team_q1: q.h[0] ?? null, home_team_q2: q.h[1] ?? null, home_team_q3: q.h[2] ?? null, home_team_q4: q.h[3] ?? null, home_team_ot: null,
    visitor_team_q1: q.v[0] ?? null, visitor_team_q2: q.v[1] ?? null, visitor_team_q3: q.v[2] ?? null, visitor_team_q4: q.v[3] ?? null, visitor_team_ot: null,
    home_team_score: sum(q.h), visitor_team_score: sum(q.v),
  };
};

const ANN = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const tick = (atMs: number) => {
  clockMs = atMs;
  return runSquaresTick({ now: new Date(atMs) });
};
const points = (userId: string) => Number(tables.users.find((u) => u.id === userId)?.points);
const moment = (name: string) => tables.squares_event_moments.find((m) => m.moment === name) as Row;

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
  tables.users = [
    { id: ANN, venue_id: "v1", points: 0 },
    { id: BOB, venue_id: "v2", points: 0 },
  ];
  feed.requests = 0;
  io.selects = [];
  io.inSizes = [];
  feed.superBowl = finalRecord;
  feed.game = { ...finalRecord, status: "2/14 - 6:30 PM EST", status_state: "scheduled", home_team_score: null, visitor_team_score: null };
  vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "true");
});

describe("runSquaresTick — a Super Bowl, minute by minute", () => {
  it("creates the event, draws once at lock, grades each moment after the hold and pays once", async () => {
    // Feb 1, 00:15 ET: discovery creates the event (Super Bowl found on a 15-minute boundary).
    await tick(Date.parse("2027-02-01T05:15:00Z"));
    expect(tables.squares_events).toHaveLength(1);
    expect(tables.squares_events[0]).toMatchObject({ col_side: "home", lock_at: "2027-02-14T23:00:00.000Z" });
    expect(tables.squares_event_moments).toHaveLength(4);

    // Before lock: at most one refresh an hour.
    const before = feed.requests;
    await tick(Date.parse("2027-02-14T20:00:00Z"));
    await tick(Date.parse("2027-02-14T20:01:00Z"));
    expect(feed.requests - before).toBe(1);
    expect(tables.squares_events[0].drawn_at).toBeNull();

    // Boards with claims (the claim RPC's rules are covered by the SQL proof).
    tables.squares_boards = [
      { id: "board-1", event_id: tables.squares_events[0].id, venue_id: "v1" },
      { id: "board-2", event_id: tables.squares_events[0].id, venue_id: "v2" },
    ];

    // Lock: drawn once.
    await tick(Date.parse("2027-02-14T23:00:00Z"));
    const event = tables.squares_events[0];
    const digits = { col: event.col_digits as number[], row: event.row_digits as number[] };
    expect(event.drawn_at).toBe("2027-02-14T23:00:00.000Z");
    await tick(Date.parse("2027-02-14T23:01:00Z"));
    expect(tables.squares_events[0].col_digits).toBe(digits.col);

    // Ann (v1) holds the Q1 square 0–3 and the final square 13–29; Bob (v2) holds halftime 0–9.
    tables.squares_claims = [
      { board_id: "board-1", cell: winningCell(digits.col, digits.row, 0, 3), user_id: ANN },
      { board_id: "board-1", cell: winningCell(digits.col, digits.row, 13, 29), user_id: ANN },
      { board_id: "board-2", cell: winningCell(digits.col, digits.row, 0, 9), user_id: BOB },
    ];

    // Q2 under way: SEA scored 3 in Q1 → Q1 (0–3) observed, then graded 60 s later.
    feed.game = liveRecord("2nd Quarter", { h: [null, null], v: [3, null] });
    await tick(Date.parse("2027-02-14T23:50:00Z"));
    expect(moment("q1").observed_at).toBe("2027-02-14T23:50:00.000Z");
    expect(moment("q1").graded_at ?? null).toBeNull();
    await tick(Date.parse("2027-02-14T23:51:00Z"));
    expect(moment("q1")).toMatchObject({ col_score: 0, row_score: 3, score_source: "feed" });
    expect(points(ANN)).toBe(25);
    expect(points(BOB)).toBe(0);

    // A score change during the hold restarts it.
    feed.game = liveRecord("Halftime", { h: [null, null], v: [3, 3] });
    await tick(Date.parse("2027-02-15T00:20:00Z"));
    feed.game = liveRecord("Halftime", { h: [null, null], v: [3, 6] });
    await tick(Date.parse("2027-02-15T00:21:00Z"));
    expect(moment("half").observed_row_score).toBe(9);
    expect(moment("half").graded_at ?? null).toBeNull();
    await tick(Date.parse("2027-02-15T00:22:00Z"));
    expect(moment("half")).toMatchObject({ col_score: 0, row_score: 9 });
    expect(points(BOB)).toBe(25);

    // Q4 under way → Q3 (0–12); then final 13–29.
    feed.game = liveRecord("4th Quarter", { h: [null, null, null, 0], v: [3, 6, 3, 7] });
    await tick(Date.parse("2027-02-15T01:30:00Z"));
    await tick(Date.parse("2027-02-15T01:31:00Z"));
    expect(moment("q3")).toMatchObject({ col_score: 0, row_score: 12 });
    expect(tables.squares_results.filter((r) => r.moment === "q3" && r.user_id)).toHaveLength(0); // nobody held it

    feed.game = finalRecord;
    await tick(Date.parse("2027-02-15T02:30:00Z"));
    await tick(Date.parse("2027-02-15T02:31:00Z"));
    expect(moment("final")).toMatchObject({ col_score: 13, row_score: 29 });
    expect(points(ANN)).toBe(25 + 50);
    expect(tables.squares_events[0].completed_at).toBe("2027-02-15T02:31:00.000Z");
    expect(tables.squares_event_moments.every((m) => !m.mismatch_note)).toBe(true);

    // Retried runs pay nothing twice; the post-final watch reads the feed at most every 5 minutes.
    const afterFinal = feed.requests;
    for (let i = 1; i <= 10; i += 1) await tick(Date.parse("2027-02-15T02:31:00Z") + i * 60_000);
    expect(feed.requests - afterFinal).toBe(2);
    expect(points(ANN)).toBe(75);
    expect(points(BOB)).toBe(25);
    expect(tables.seasonal_points_credits).toHaveLength(3);
    expect(tables.squares_results.filter((r) => r.user_id).every((r) => r.credited_at)).toBe(true);

    // After the watch: idle.
    const idle = await tick(Date.parse("2027-02-15T06:00:00Z"));
    expect(idle.skipped).toBe("watch_over");
  });

  it("flags a graded quarter the final record contradicts (report-only)", async () => {
    await tick(Date.parse("2027-02-01T05:15:00Z"));
    await tick(Date.parse("2027-02-14T23:00:00Z"));
    // A bad live record: SEA shown with 7 in Q1, later corrected to 3.
    feed.game = liveRecord("2nd Quarter", { h: [null, null], v: [7, null] });
    await tick(Date.parse("2027-02-14T23:50:00Z"));
    await tick(Date.parse("2027-02-14T23:51:00Z"));
    expect(moment("q1")).toMatchObject({ row_score: 7 });
    for (const [at, game] of [
      ["2027-02-15T00:20:00Z", liveRecord("Halftime", { h: [null, null], v: [3, 6] })],
      ["2027-02-15T00:21:00Z", liveRecord("Halftime", { h: [null, null], v: [3, 6] })],
      ["2027-02-15T01:30:00Z", liveRecord("4th Quarter", { h: [null, null, null, 0], v: [3, 6, 3, 7] })],
      ["2027-02-15T01:31:00Z", liveRecord("4th Quarter", { h: [null, null, null, 0], v: [3, 6, 3, 7] })],
      ["2027-02-15T02:30:00Z", finalRecord],
      ["2027-02-15T02:31:00Z", finalRecord],
    ] as const) {
      feed.game = game;
      await tick(Date.parse(at));
    }
    expect(moment("q1").row_score).toBe(7); // never changed automatically
    expect(String(moment("q1").mismatch_note)).toContain("0–3");
    expect(tables.squares_admin_log.some((entry) => entry.action === "moment_mismatch")).toBe(true);
  });

  it("creates the discovered Super Bowl as a super_bowl event (plan 6.2)", async () => {
    await tick(Date.parse("2027-02-01T05:15:00Z"));
    expect(tables.squares_events[0]).toMatchObject({ purpose: "super_bowl", created_by: "auto" });
  });

  it("stays off the database outside the card window", async () => {
    const report = await tick(Date.parse("2026-11-01T12:00:00Z"));
    expect(report).toMatchObject({ ran: false, skipped: "inactive" });
    expect(tables.squares_events).toBeUndefined();
    expect(feed.requests).toBe(0);
  });
});

// Plan 6.2: the event lifecycle — rehearsal mode, archived games, late voids.
describe("runSquaresTick — event lifecycle (plan 6.2)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** Discover, draw, then the final record grades all four moments and completes the event. */
  const playToFinal = async () => {
    await tick(Date.parse("2027-02-01T05:15:00Z"));
    await tick(Date.parse("2027-02-14T23:00:00Z"));
    feed.game = finalRecord;
    await tick(Date.parse("2027-02-15T02:30:00Z"));
    await tick(Date.parse("2027-02-15T02:31:00Z"));
    expect(tables.squares_events[0].completed_at).toBe("2027-02-15T02:31:00.000Z");
  };

  /** What squares_void_moment leaves behind for q1 (the SQL itself is proven on PGlite). */
  const voidQ1 = (atMs: number, stampReopened: boolean) => {
    const q1 = moment("q1");
    for (const result of (tables.squares_results ?? []).filter((r) => r.moment === "q1")) result.voided_at = new Date(atMs).toISOString();
    Object.assign(q1, {
      grade_no: Number(q1.grade_no) + 1, col_score: null, row_score: null, winning_cell: null, score_source: null,
      graded_at: null, observed_col_score: null, observed_row_score: null, observed_at: null,
    });
    Object.assign(tables.squares_events[0], { completed_at: null, reopened_at: stampReopened ? new Date(atMs).toISOString() : null });
  };

  it("re-grades a void made after the 12-hour no-final deadline from the feed, at the post-final pace (§13 F3)", async () => {
    await playToFinal();
    const voidAt = Date.parse("2027-02-15T12:30:00Z"); // kickoff + 13 h
    voidQ1(voidAt, true);
    const before = feed.requests;
    await tick(voidAt + 60_000);
    expect(feed.requests - before).toBe(1);
    expect(moment("q1").observed_at).toBe(new Date(voidAt + 60_000).toISOString());
    const waiting = await tick(voidAt + 2 * 60_000);
    expect(waiting.skipped).toBe("reopened_wait");
    expect(feed.requests - before).toBe(1);
    await tick(voidAt + 6 * 60_000);
    expect(moment("q1")).toMatchObject({ col_score: 0, row_score: 3, grade_no: 2, score_source: "feed" });
    expect(tables.squares_events[0].completed_at).toBe(new Date(voidAt + 6 * 60_000).toISOString());
  });

  it("stops watching 3 hours after the void, and never watches without reopened_at", async () => {
    await playToFinal();
    const voidAt = Date.parse("2027-02-15T12:30:00Z");
    voidQ1(voidAt, true);
    const before = feed.requests;
    const late = await tick(voidAt + 3 * 60 * 60_000 + 60_000);
    expect(late.skipped).toBe("no_final_deadline");
    voidQ1(voidAt, false);
    const unstamped = await tick(voidAt + 60_000);
    expect(unstamped.skipped).toBe("no_final_deadline");
    expect(feed.requests).toBe(before);
  });

  it("never re-creates a Super Bowl whose event was archived (§13 F4)", async () => {
    tables.squares_events = [
      { id: "old-event", bdl_game_id: finalRecord.id, archived_at: "2027-02-03T12:00:00Z", purpose: "super_bowl" },
    ];
    const report = await tick(Date.parse("2027-02-03T12:15:00Z"));
    expect(report.actions).toEqual(["super_bowl_archived"]);
    expect(tables.squares_events).toHaveLength(1);
  });

  it("rehearsal switch alone runs the settlement outside the window, without the public flag, and never discovers", async () => {
    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "");
    vi.stubEnv("SQUARES_REHEARSAL_ENABLED", "true");
    const idle = await tick(Date.parse("2026-12-06T18:00:00Z"));
    expect(idle).toMatchObject({ ran: true, skipped: "no_event", feedRequests: 0 });
    expect(tables.squares_events ?? []).toHaveLength(0);

    // An admin-created rehearsal event is drawn at its lock by the same cron.
    tables.squares_events = [
      {
        id: "rehearsal-1", season: 2026, bdl_game_id: 999, col_side: "visitor", col_team: {}, row_team: {}, purpose: "rehearsal",
        kickoff_at: "2026-12-06T18:00:00Z", lock_at: "2026-12-06T17:30:00Z", lock_at_set_by: "auto",
        drawn_at: null, completed_at: null, archived_at: null, reopened_at: null, feed_checked_at: null, live_score: null,
      },
    ];
    tables.squares_event_moments = ["q1", "half", "q3", "final"].map((name) => ({ event_id: "rehearsal-1", moment: name, grade_no: 1 }));
    feed.game = { ...finalRecord, id: 999, status: "scheduled", status_state: "scheduled", home_team_score: null, visitor_team_score: null };
    await tick(Date.parse("2026-12-06T17:30:00Z"));
    expect(tables.squares_events[0].drawn_at).toBe("2026-12-06T17:30:00.000Z");
  });

  it("does nothing in December with the public flag but no rehearsal switch", async () => {
    vi.stubEnv("SQUARES_REHEARSAL_ENABLED", "");
    const report = await tick(Date.parse("2026-12-06T18:00:00Z"));
    expect(report).toMatchObject({ ran: false, skipped: "inactive" });
  });
});

// Plan 6.3: paying winners — chunked writes, results that can never be paid, no idle reads.
describe("paying Squares winners (plan 6.3)", () => {
  const unpaidResult = (n: number, userId: string, creditKey = `board-${n}:q1:1`): Row => ({
    id: `result-${n}`, event_id: "event-1", board_id: `board-${n}`, moment: "q1", grade_no: 1, winning_cell: 0,
    user_id: userId, points: 25, credit_key: creditKey, credited_at: null, voided_at: null, credit_blocked_at: null,
  });

  it("marks a big moment paid in chunks of at most 150 ids (§13 F2)", async () => {
    const userId = (i: number) => `44444444-4444-4444-4444-${String(i).padStart(12, "0")}`;
    tables.users = Array.from({ length: 400 }, (_, i) => ({ id: userId(i), points: 0 }));
    tables.squares_results = Array.from({ length: 400 }, (_, i) => unpaidResult(i, userId(i)));
    const report = { actions: [] as string[], errors: [] as string[] };
    await payUnpaidSquaresResults("event-1", report);
    expect(report.errors).toEqual([]);
    expect(report.actions).toEqual(["paid_400"]);
    expect(tables.squares_results.every((r) => r.credited_at)).toBe(true);
    expect(io.inSizes.length).toBe(3);
    expect(Math.max(...io.inSizes)).toBeLessThanOrEqual(150);
  });

  it("stamps a result that can never be paid once, and never re-sends it (§13 F8)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    tables.seasonal_points_credits = [{ source_key: "board-2:q1:1", user_id: BOB, points: 25 }];
    tables.squares_results = [
      unpaidResult(1, ANN),
      unpaidResult(2, ANN), // its key was paid to BOB: only another bug gets here
      unpaidResult(3, "33333333-3333-3333-3333-333333333333"), // account gone
    ];
    const report = { actions: [] as string[], errors: [] as string[] };
    await payUnpaidSquaresResults("event-1", report);
    expect(report.errors).toEqual([]);
    expect(report.actions).toEqual(["paid_1", "credit_blocked_1", "credit_blocked_1"]);
    const [paid, otherUser, gone] = tables.squares_results;
    expect(paid).toMatchObject({ credit_blocked_at: null });
    expect(paid.credited_at).toBeTruthy();
    expect(otherUser).toMatchObject({ credited_at: null, credit_blocked_note: "This win's points were already paid to a different player." });
    expect(gone).toMatchObject({ credited_at: null, credit_blocked_note: "The player's account no longer exists." });
    expect(error.mock.calls.filter(([tag]) => tag === "[Squares] credit-blocked")).toHaveLength(2);
    expect(points(ANN)).toBe(25);

    // The next run reads nothing left to pay and sends no credit.
    const ledgerBefore = tables.seasonal_points_credits.length;
    const again = { actions: [] as string[], errors: [] as string[] };
    await payUnpaidSquaresResults("event-1", again);
    expect(again.actions).toEqual([]);
    expect(tables.seasonal_points_credits).toHaveLength(ledgerBefore);
    expect(error.mock.calls.filter(([tag]) => tag === "[Squares] credit-blocked")).toHaveLength(2);
    error.mockRestore();
    warn.mockRestore();
  });

  it("squaresCreditBlockNote: only a gone player or a key paid to someone else blocks", () => {
    expect(squaresCreditBlockNote({ outcome: "credited", userId: ANN, existingUserId: null })).toBeNull();
    expect(squaresCreditBlockNote({ outcome: "already_credited", userId: ANN, existingUserId: ANN })).toBeNull();
    expect(squaresCreditBlockNote({ outcome: "already_credited", userId: ANN, existingUserId: null })).toBeNull(); // retried
    expect(squaresCreditBlockNote({ outcome: "already_credited", userId: ANN, existingUserId: BOB })).toMatch(/different player/);
    expect(squaresCreditBlockNote({ outcome: "user_not_found", userId: ANN, existingUserId: null })).toMatch(/no longer exists/);
  });

  /** Discover, draw, then the final record grades all four moments and completes the event. */
  const playToFinal = async () => {
    await tick(Date.parse("2027-02-01T05:15:00Z"));
    await tick(Date.parse("2027-02-14T23:00:00Z"));
    feed.game = finalRecord;
    await tick(Date.parse("2027-02-15T02:30:00Z"));
    await tick(Date.parse("2027-02-15T02:31:00Z"));
    expect(tables.squares_events[0].completed_at).toBe("2027-02-15T02:31:00.000Z");
  };

  it("reads only the event once the post-final watch is over (§13 F7)", async () => {
    await playToFinal();
    io.selects = [];
    const report = await tick(Date.parse("2027-02-15T06:00:00Z"));
    expect(report.skipped).toBe("watch_over");
    expect(io.selects).toEqual(["squares_events"]);
  });

  it("reads only the event past the no-final deadline with no late-void watch", async () => {
    await tick(Date.parse("2027-02-01T05:15:00Z"));
    await tick(Date.parse("2027-02-14T23:00:00Z")); // drawn, never completed
    io.selects = [];
    const report = await tick(Date.parse("2027-02-15T12:00:00Z"));
    expect(report.skipped).toBe("no_final_deadline");
    expect(io.selects).toEqual(["squares_events"]);
  });

  it("still settles during the watch, and a forced admin run settles after it", async () => {
    await playToFinal();
    io.selects = [];
    await tick(Date.parse("2027-02-15T02:33:00Z")); // inside the watch, between feed reads
    expect(io.selects).toContain("squares_results");
    io.selects = [];
    clockMs = Date.parse("2027-02-15T06:00:00Z");
    await runSquaresTick({ now: new Date(clockMs), force: true });
    expect(io.selects).toContain("squares_results");
  });
});
