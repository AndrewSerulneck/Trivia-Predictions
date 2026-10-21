import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ncaabBracket from "./fixtures/brackets/ncaab-bracket-season-2025.json";
import ncaawBracket from "./fixtures/brackets/ncaaw-bracket-season-2025.json";

// Squares + Brackets plan Phase 7: replays both 2026 tournaments (moved 364 days later, into the
// 2027 card window) through runBracketsTick() a minute at a time, against an in-memory stand-in
// for the bracket_* tables and RPCs (the real SQL is proven by `npm run test:brackets-sql`). The
// feed answers as it would have at each minute (maskBracketFeedAt). Checks the glue: discovery →
// open → lock → results → per-round venue points paid once → stop; the request budget (plan §6);
// zero I/O outside the window; discovery never re-creating an archived tournament.

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let clockMs = 0;
const io = { selects: [] as string[], feedRequests: 0 };
let uuid = 0;
const nextId = () => `00000000-0000-0000-0000-${String(++uuid).padStart(12, "0")}`;

type Filter = (row: Row) => boolean;
class FakeQuery {
  private filters: Filter[] = [];
  private op: "select" | "update" | "insert" | "upsert" = "select";
  private payload: Row | Row[] | null = null;
  private max = Infinity;
  private mode: "many" | "single" | "maybe" = "many";
  private sortCol: string | null = null;
  constructor(private table: string) {}
  select() { return this; }
  order(col: string) { this.sortCol ??= col; return this; }
  eq(col: string, value: unknown) { this.filters.push((row) => row[col] === value); return this; }
  is(col: string, value: null) { this.filters.push((row) => (row[col] ?? null) === value); return this; }
  gt(col: string, value: string) { this.filters.push((row) => String(row[col]) > value); return this; }
  in(col: string, values: unknown[]) { this.filters.push((row) => values.includes(row[col])); return this; }
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
    if (this.op === "insert") {
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      const inserted = items.map((item) => ({
        id: nextId(),
        archived_at: null,
        completed_at: null,
        prizes_settled_at: null,
        next_sync_at: null,
        feed_checked_at: null,
        main_lock_at: null,
        main_lock_set_by: "auto",
        second_lock_at: null,
        second_lock_set_by: "auto",
        region_names: null,
        championship_total: null,
        winner_seats: Array.from({ length: 63 }, () => null),
        created_at: new Date(clockMs).toISOString(),
        ...item,
      }));
      rows.push(...inserted);
      if (this.table === "bracket_tournaments") {
        for (const t of inserted) {
          for (let round = 1; round <= 6; round += 1) {
            (tables.bracket_rounds ??= []).push({ tournament_id: t.id, round, grade_no: 1, paid_grade_no: null, paid_at: null });
          }
        }
      }
      data = this.mode === "many" ? inserted : inserted[0];
    } else if (this.op === "upsert") {
      for (const item of this.payload as Row[]) {
        const existing = rows.find((r) => r.tournament_id === item.tournament_id && r.round === item.round && r.location === item.location);
        if (existing) Object.assign(existing, item);
        else rows.push({ ...item });
      }
      data = null;
    } else {
      if (this.op === "select") io.selects.push(this.table);
      let matched = rows.filter((row) => this.filters.every((filter) => filter(row)));
      if (this.sortCol === "id") matched = [...matched].sort((a, b) => String(a.id).localeCompare(String(b.id)));
      matched = matched.slice(0, this.max);
      if (this.op === "update") matched.forEach((row) => Object.assign(row, this.payload));
      data = this.mode === "many" ? matched : matched[0] ?? null;
    }
    return Promise.resolve(resolve({ data, error: null }));
  }
}

const rpc = async (name: string, args: Row) => {
  if (name === "bracket_record_results") {
    const t = tables.bracket_tournaments.find((row) => row.id === args.p_tournament_id) as Row;
    const before = t.winner_seats as Array<number | null>;
    const next = args.p_winner_seats as Array<number | null>;
    const changedDecided = before.some((seat, i) => seat !== null && seat !== next[i]);
    if (changedDecided && !args.p_allow_change) return { data: null, error: { message: "needs an admin override" } };
    Object.assign(t, { winner_seats: next, championship_total: args.p_championship_total, completed_at: next[62] === null ? null : new Date(clockMs).toISOString() });
    let graded = 0;
    for (const entry of (tables.bracket_entries ?? []).filter((e) => e.tournament_id === t.id)) {
      const rc = bracketRoundCorrect(entry.picks as Array<number | null>, next, entry.kind as BracketKind);
      if (JSON.stringify(rc) !== JSON.stringify(entry.round_correct)) graded += 1;
      Object.assign(entry, { round_correct: rc, score: bracketScoreFromRoundCorrect(rc) });
    }
    return { data: [{ changed_slots: 0, regraded_rounds: [], reversed_credits: 0, graded_entries: graded }], error: null };
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
  if (name === "award_ranked_cycle_places") {
    // The real RPC is proven by the ranked-places SQL tests; this records what the sync asked for.
    const winners = args.p_winners as Array<{ user_id: string; place: number; points: number }>;
    const settled = (tables.challenge_cycle_settlements ??= []);
    if (settled.some((r) => r.challenge_id === args.p_challenge_id && r.cycle_start === args.p_cycle_start)) {
      return { data: [{ status: "already_resolved", winners_awarded: 0 }], error: null };
    }
    const status = winners.length > 0 ? "awarded" : "no_scorers";
    settled.push({ challenge_id: args.p_challenge_id, cycle_start: args.p_cycle_start, venue_id: args.p_venue_id, outcome: status, participant_count: args.p_participant_count, winners });
    return { data: [{ status, winners_awarded: winners.length }], error: null };
  }
  throw new Error(`unexpected rpc ${name}`);
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: (t: string) => new FakeQuery(t), rpc: (name: string, args: Row) => rpc(name, args) },
}));

const SHIFT_MS = 364 * 24 * 60 * 60_000; // Tuesday → Tuesday, March 2026 → March 2027
const shift = (games: BracketFeedGame[]): BracketFeedGame[] =>
  games.map((g) => ({ ...g, season: 2026, date: new Date(Date.parse(String(g.date)) + SHIFT_MS).toISOString() }));
const FEEDS = vi.hoisted(() => ({ men: [] as unknown[], women: [] as unknown[] }));
vi.mock("@/lib/bracketsFeed", () => ({
  fetchBracketFeed: async (gender: "men" | "women") => {
    io.feedRequests += 1;
    return { ok: true, games: maskBracketFeedAt(FEEDS[gender] as BracketFeedGame[], clockMs) };
  },
}));

import { bracketWinnerSeats, maskBracketFeedAt, mergeBracketFeed, type BracketFeedGame } from "@/lib/brackets/games";
import { bracketRoundCorrect, bracketScore, bracketScoreFromRoundCorrect } from "@/lib/brackets/scoring";
import { emptyPicks, type BracketKind } from "@/lib/brackets/tree";
import { runBracketsTick } from "@/lib/bracketsSync";

FEEDS.men = shift(ncaabBracket as BracketFeedGame[]);
FEEDS.women = shift(ncaawBracket as BracketFeedGame[]);

const ANN = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const MINUTE = 60_000;
const tick = (atMs: number) => {
  clockMs = atMs;
  return runBracketsTick({ now: new Date(atMs) });
};
const points = (userId: string) => Number(tables.users.find((u) => u.id === userId)?.points);

/** "Home team wins every game" — a valid bracket that needs no feed. */
const homeBracket = (): Array<number | null> => {
  const picks = emptyPicks();
  for (let slot = 0; slot < 63; slot += 1) {
    if (slot < 32) picks[slot] = 2 * slot;
    else {
      const round = slot >= 62 ? 6 : slot >= 60 ? 5 : slot >= 56 ? 4 : slot >= 48 ? 3 : 2;
      const offset = 64 - 2 ** (7 - round);
      const below = 64 - 2 ** (8 - round);
      picks[slot] = picks[below + 2 * (slot - offset)];
    }
  }
  return picks;
};

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
  tables.users = [
    { id: ANN, venue_id: "v1", points: 0 },
    { id: BOB, venue_id: "v1", points: 0 },
  ];
  io.selects = [];
  io.feedRequests = 0;
  vi.stubEnv("NEXT_PUBLIC_BRACKETS_ENABLED", "true");
  vi.stubEnv("BRACKETS_REHEARSAL_ENABLED", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("bracket sync, minute by minute through March Madness 2027", () => {
  it("discovers, locks, grades, pays each round once, then goes quiet", async () => {
    const start = Date.parse("2027-03-14T22:00:00Z"); // Selection Sunday evening, Eastern
    const end = Date.parse("2027-04-07T03:59:00Z"); // Apr 6 23:59 Eastern: the window's last minute
    const perfect = bracketWinnerSeats(mergeBracketFeed([], FEEDS.men as BracketFeedGame[]).games);
    const home = homeBracket();
    // Two March Madness prizes at v1: one set up on Selection Sunday (pays), one after the men's lock
    // (was never on offer, so it pays nothing).
    const prize = (id: string, createdAt: string) => ({
      id, name: "March Madness Challenge", rules: "", venue_ids: ["v1"], game_types: ["bracket"],
      reward_definition_id: "bracket_challenge", is_active: true, win_condition: "ranked_places", challenge_mode: "progress",
      recurring_type: "none", schedule_type: "single_day", active_days: [], winner_quota: 4, points_required_to_win: 1,
      end_date: "2027-04-06", created_at: createdAt, bracket_keys: ["men_main", "women_main"], min_players: null,
      place_prizes: [
        { place: 1, prize_kind: "gift_card", prize_gift_certificate_amount: 30 },
        { place: 2, prize_kind: "gift_card", prize_gift_certificate_amount: 20 },
      ],
    });
    tables.challenge_campaigns = [
      prize("aaaaaaaa-0000-0000-0000-000000000001", "2027-03-14T23:30:00Z"),
      prize("aaaaaaaa-0000-0000-0000-000000000002", "2027-03-20T12:00:00Z"),
    ];
    let entered = false;
    const errors: string[] = [];
    for (let now = start; now <= end; now += MINUTE) {
      const report = await tick(now);
      errors.push(...report.errors, ...report.synced.flatMap((s) => s.errors));
      if (!entered && tables.bracket_tournaments?.length === 2) {
        const men = tables.bracket_tournaments.find((t) => t.gender === "men") as Row;
        expect(Date.parse(String(men.main_lock_at))).toBeGreaterThan(now); // open on Selection Sunday
        for (const [user, picks] of [[ANN, perfect], [BOB, home]] as const) {
          (tables.bracket_entries ??= []).push({
            id: nextId(), tournament_id: men.id, kind: "main", user_id: user, venue_id: "v1",
            picks, round_correct: [0, 0, 0, 0, 0, 0], score: 0, pick_count: 63, tiebreaker: 140, submitted_at: new Date(now).toISOString(),
          });
        }
        entered = true;
      }
    }
    expect(errors).toEqual([]);
    expect(entered).toBe(true);

    const men = tables.bracket_tournaments.find((t) => t.gender === "men") as Row;
    expect(men.winner_seats).toEqual(perfect);
    expect(men.next_sync_at).toBeNull(); // decided and paid: never read again
    expect(tables.bracket_rounds.filter((r) => r.tournament_id === men.id).every((r) => r.paid_grade_no === 1)).toBe(true);
    // Venue points = bracket points ÷ 10, paid once per round.
    expect(points(ANN)).toBe(192);
    expect(points(BOB)).toBe(bracketScore(home, perfect, "main") / 10);
    const keys = (tables.seasonal_points_credits ?? []).map((c) => String(c.source_key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((k) => k.startsWith(String(tables.bracket_entries[0].id))).length).toBe(6);

    // Prizes (Phase 9a): settled once after each championship, only for the prize set up in time.
    // Men's: Ann (perfect) 1st, Bob 2nd. Women's: nobody entered, so it is recorded as paying nobody.
    const settled = tables.challenge_cycle_settlements ?? [];
    expect(settled.map((r) => r.challenge_id)).toEqual(["aaaaaaaa-0000-0000-0000-000000000001", "aaaaaaaa-0000-0000-0000-000000000001"]);
    const menCycle = settled.find((r) => (r.winners as unknown[]).length > 0) as Row;
    expect(menCycle.winners).toEqual([
      { user_id: ANN, place: 1, points: 1920 },
      { user_id: BOB, place: 2, points: bracketScore(home, perfect, "main") },
    ]);
    expect(menCycle.participant_count).toBe(2);
    expect(Date.parse(String(menCycle.cycle_start))).toBe(Math.floor(Date.parse(String(men.created_at)) / MINUTE) * MINUTE + 1000);
    const womenCycle = settled.find((r) => r !== menCycle) as Row;
    expect(womenCycle).toMatchObject({ outcome: "no_scorers", participant_count: 0 });
    expect(tables.bracket_tournaments.every((t) => typeof t.prizes_settled_at === "string")).toBe(true);

    // Plan §6 estimated 6–8k requests for the whole tournament (both genders); report the real number.
    expect(io.feedRequests).toBeLessThan(8000);
    console.info(`[brackets-sync test] feed requests for both 2027 tournaments: ${io.feedRequests}`);

    // Done: a run reads the tournaments row and nothing else.
    io.selects = [];
    io.feedRequests = 0;
    await tick(end + MINUTE * 0); // still inside the window
    expect(io.feedRequests).toBe(0);
    expect(io.selects).toEqual(["bracket_tournaments"]);
  }, 120_000);

  it("does nothing at all outside the window with the flag on", async () => {
    const report = await tick(Date.parse("2027-04-08T15:00:00Z"));
    expect(report.skipped).toBe("inactive");
    expect(io.selects).toEqual([]);
    expect(io.feedRequests).toBe(0);
  });

  it("never re-creates an archived tournament", async () => {
    const minute = Date.parse("2027-03-14T23:00:00Z"); // a discovery minute
    await tick(minute);
    expect(tables.bracket_tournaments).toHaveLength(2);
    for (const t of tables.bracket_tournaments) t.archived_at = new Date(minute).toISOString();
    io.feedRequests = 0;
    await tick(minute + 10 * MINUTE);
    expect(tables.bracket_tournaments).toHaveLength(2);
    expect(io.feedRequests).toBe(0);
  });

  it("drives a rehearsal on the switch alone, without discovering anything", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRACKETS_ENABLED", "");
    vi.stubEnv("BRACKETS_REHEARSAL_ENABLED", "true");
    // Outside the card window, flag off: only the switch drives it. The replay clock reads March 15.
    const now = Date.parse("2027-05-01T15:00:00Z");
    const replayAt = Date.parse("2027-03-15T12:00:00Z");
    tables.bracket_tournaments = [];
    tables.bracket_tournaments.push({
      id: nextId(), gender: "men", season: 2026, purpose: "rehearsal", clock_offset_seconds: Math.round((now - replayAt) / 1000),
      archived_at: null, completed_at: null, next_sync_at: null, winner_seats: Array.from({ length: 63 }, () => null),
      main_lock_set_by: "auto", second_lock_set_by: "auto", main_lock_at: null, second_lock_at: null, region_names: null, championship_total: null,
    });
    clockMs = now; // the feed (as of real time) has every result; the rehearsal masks by its own clock
    const report = await runBracketsTick({ now: new Date(now) });
    expect(report.discovered).toEqual([]);
    expect(report.synced).toHaveLength(1);
    const t = tables.bracket_tournaments[0];
    expect((t.winner_seats as Array<number | null>).every((s) => s === null)).toBe(true); // replay clock: nothing played yet
    expect(Date.parse(String(t.main_lock_at))).toBeGreaterThan(replayAt);
  });
});
