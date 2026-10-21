import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ncaabBracket from "./fixtures/brackets/ncaab-bracket-season-2025.json";
import ncaawBracket from "./fixtures/brackets/ncaaw-bracket-season-2025.json";

// Squares + Brackets plan Phase 7: replays both 2026 tournaments (moved 364 days later, into the
// 2027 card window) through runBracketsTick() a minute at a time, against an in-memory stand-in
// for the bracket_* tables and RPCs (the real SQL is proven by `npm run test:brackets-sql`). The
// feed answers as it would have at each minute (maskBracketFeedAt). Checks the glue: discovery →
// open → lock → results → per-round venue points paid once → stop; the request budget (plan §6);
// zero I/O outside the window; discovery never re-creating an archived tournament. Plan 10.1: an
// admin correction is paid again at the next tick (also after the championship), "No result" holds
// against the feed, and a sync write landing after an admin override keeps the admin's result.

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let clockMs = 0;
const io = { selects: [] as string[], feedRequests: 0 };
/** Runs once, inside the next bracket_save_feed_games call, before it writes (the 10.1 race). */
const hooks: { beforeFeedWrite: ((tournamentId: string) => Promise<void>) | null } = { beforeFeedWrite: null };
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
  if (name === "bracket_save_feed_games") {
    // Mirrors 20261021035254 + 20261021134157 (proven on PGlite): feed columns always (a null score
    // keeps the stored one); what an admin took over in the CURRENT row is kept.
    if (hooks.beforeFeedWrite) {
      const hook = hooks.beforeFeedWrite;
      hooks.beforeFeedWrite = null;
      await hook(String(args.p_tournament_id));
    }
    const rows = (tables.bracket_games ??= []);
    for (const g of args.p_games as Row[]) {
      const current = rows.find((r) => r.tournament_id === args.p_tournament_id && r.round === g.round && r.location === g.location);
      const feedWinner = g.result_source === "feed" && g.winner_side !== null;
      const autoLink = g.feeds_seat_set_by === "auto" && g.feeds_seat !== null;
      const feedCols = {
        feed_game_id: g.feed_game_id, tip_at: g.tip_at, status_state: g.status_state, status_detail: g.status_detail,
        home_score: g.home_score ?? current?.home_score ?? null, away_score: g.away_score ?? current?.away_score ?? null,
      };
      if (!current) {
        rows.push({
          tournament_id: args.p_tournament_id, round: g.round, location: g.location, slot: g.slot, ...feedCols,
          home_team: g.home_team, away_team: g.away_team,
          winner_side: feedWinner ? g.winner_side : null, result_source: feedWinner ? "feed" : null, result_held: false,
          teams_set_by: "feed", feeds_seat: autoLink ? g.feeds_seat : null, feeds_seat_set_by: autoLink ? "auto" : null,
          mismatch_note: g.mismatch_note,
        });
        continue;
      }
      const seenSame = (current.winner_side ?? null) === g.seen_winner_side && Boolean(current.result_held) === Boolean(g.seen_result_held);
      Object.assign(current, {
        ...feedCols,
        ...(current.teams_set_by === "admin" ? {} : { home_team: g.home_team, away_team: g.away_team }),
        ...(current.feeds_seat_set_by !== "admin" && autoLink ? { feeds_seat: g.feeds_seat, feeds_seat_set_by: "auto" } : {}),
        ...(current.winner_side == null && !current.result_held && feedWinner ? { winner_side: g.winner_side, result_source: "feed" } : {}),
        ...(seenSame ? { mismatch_note: g.mismatch_note } : {}),
      });
    }
    return { data: (args.p_games as Row[]).length, error: null };
  }
  if (name === "bracket_record_results") {
    const t = tables.bracket_tournaments.find((row) => row.id === args.p_tournament_id) as Row;
    const before = t.winner_seats as Array<number | null>;
    const next = args.p_winner_seats as Array<number | null>;
    const expected = args.p_expected_winner_seats as Array<number | null> | null;
    if (expected && JSON.stringify(expected) !== JSON.stringify(before)) {
      return { data: [{ changed_slots: 0, regraded_rounds: [], reversed_credits: 0, graded_entries: 0, stale: true }], error: null };
    }
    const changedDecided = before.some((seat, i) => seat !== null && seat !== next[i]);
    if (changedDecided && !args.p_allow_change) return { data: null, error: { message: "needs an admin override" } };
    // Rounds complete before a changed decided slot: spend their keys at the current grade_no, bump it.
    const regraded: number[] = [];
    let reversed = 0;
    for (let round = 1; round <= 6; round += 1) {
      const slots = slotsOfRound(round as BracketRound);
      const changed = slots.some((slot) => before[slot] !== null && before[slot] !== next[slot]);
      if (!changed || slots.some((slot) => before[slot] === null)) continue;
      const r = tables.bracket_rounds.find((row) => row.tournament_id === t.id && row.round === round) as Row;
      const ledger = (tables.seasonal_points_credits ??= []);
      for (const entry of (tables.bracket_entries ?? []).filter((e) => e.tournament_id === t.id && (e.kind === "main" || round >= 3))) {
        const key = `${entry.id}:r${round}:${r.grade_no}`;
        const paid = ledger.find((l) => l.source_key === key);
        if (paid && !paid.spent) {
          const user = tables.users.find((u) => u.id === paid.user_id) as Row;
          user.points = Number(user.points) - Number(paid.points);
          paid.spent = "reversed";
        } else if (!paid) ledger.push({ source_key: key, user_id: entry.user_id, points: 1, spent: "burned" });
        reversed += 1;
      }
      Object.assign(r, { grade_no: Number(r.grade_no) + 1, paid_grade_no: null, paid_at: null });
      regraded.push(round);
    }
    Object.assign(t, {
      winner_seats: next,
      championship_total: args.p_championship_total,
      completed_at: next[62] === null ? null : (t.completed_at ?? new Date(clockMs).toISOString()),
    });
    let graded = 0;
    for (const entry of (tables.bracket_entries ?? []).filter((e) => e.tournament_id === t.id)) {
      const rc = bracketRoundCorrect(entry.picks as Array<number | null>, next, entry.kind as BracketKind);
      if (JSON.stringify(rc) !== JSON.stringify(entry.round_correct)) graded += 1;
      Object.assign(entry, { round_correct: rc, score: bracketScoreFromRoundCorrect(rc) });
    }
    return { data: [{ changed_slots: 0, regraded_rounds: regraded, reversed_credits: reversed, graded_entries: graded, stale: false }], error: null };
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
import { bracketRoundCorrect, bracketRoundVenuePoints, bracketScore, bracketScoreFromRoundCorrect } from "@/lib/brackets/scoring";
import { emptyPicks, slotsOfRound, type BracketKind, type BracketRound } from "@/lib/brackets/tree";
import { runBracketsAdminAction } from "@/lib/bracketsAdmin";
import { bracketRealLockMs, lockPassedPatch, tournamentFromRow } from "@/lib/bracketsStore";
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
  hooks.beforeFeedWrite = null;
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

describe("a walked rehearsal remembers when its lock really passed (plan 10.7.1, §25 F1)", () => {
  it("pays the prize created before the lock, after set_clock walks across the lock and on past the final", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRACKETS_ENABLED", "");
    vi.stubEnv("BRACKETS_REHEARSAL_ENABLED", "true");
    const start = Date.parse("2027-05-01T15:00:00Z"); // real time; the replay clock reads Selection Sunday
    const replayAt = Date.parse("2027-03-15T12:00:00Z");
    const rehearsalId = nextId();
    tables.bracket_tournaments = [
      {
        id: rehearsalId, gender: "men", season: 2026, purpose: "rehearsal", clock_offset_seconds: Math.round((start - replayAt) / 1000),
        archived_at: null, completed_at: null, next_sync_at: null, prizes_settled_at: null, winner_seats: Array.from({ length: 63 }, () => null),
        main_lock_set_by: "auto", second_lock_set_by: "auto", main_lock_at: null, second_lock_at: null, region_names: null, championship_total: null,
        main_lock_passed_at: null, second_lock_passed_at: null, created_at: new Date(start).toISOString(),
      },
    ];
    for (const round of [1, 2, 3, 4, 5, 6]) {
      (tables.bracket_rounds ??= []).push({ tournament_id: rehearsalId, round, grade_no: 1, paid_grade_no: null, paid_at: null });
    }
    tables.venues = [{ id: "vh", hidden: true }];
    const t = () => tables.bracket_tournaments.find((row) => row.id === rehearsalId) as Row;
    const admin = (action: Record<string, unknown>, atMs: number) => {
      clockMs = atMs;
      return runBracketsAdminAction({ tournamentId: rehearsalId, ...action } as Parameters<typeof runBracketsAdminAction>[0], "tester", atMs);
    };
    const sync = async (atMs: number) => {
      clockMs = atMs;
      await runBracketsTick({ now: new Date(atMs) });
    };

    await sync(start);
    const lockAt = String(t().main_lock_at);
    expect(t().main_lock_passed_at).toBeNull();

    // The partner's prize, created before the lock (real time), paying the men's main bracket.
    const prizeAt = start + 2 * MINUTE;
    tables.challenge_campaigns = [
      {
        id: "c-bracket", name: "Bracket prize", created_at: new Date(prizeAt).toISOString(), reward_definition_id: "bracket_challenge",
        is_active: true, venue_ids: ["vh"], bracket_keys: ["men_main"], schedule_type: "single_day", active_days: [], game_types: [],
        recurring_type: "none", place_prizes: [{ place: 1, prize_kind: "gift_card", prize_gift_certificate_amount: 25 }],
      },
    ];
    const perfect = bracketWinnerSeats(mergeBracketFeed([], FEEDS.men as BracketFeedGame[]).games);
    for (const [user, picks] of [[ANN, perfect], [BOB, homeBracket()]] as const) {
      (tables.bracket_entries ??= []).push({
        id: nextId(), tournament_id: rehearsalId, kind: "main", user_id: user, venue_id: "vh", picks, round_correct: [0, 0, 0, 0, 0, 0],
        score: 0, pick_count: 63, tiebreaker: 140, submitted_at: new Date(prizeAt).toISOString(),
      });
    }

    // Walk across the lock: it passes for players at the moment of this call.
    const crossAt = start + 10 * MINUTE;
    expect(await admin({ action: "set_clock", asOf: new Date(Date.parse(lockAt) + MINUTE).toISOString() }, crossAt)).toMatchObject({ ok: true });
    expect(t().main_lock_passed_at).toBe(new Date(crossAt).toISOString());
    await sync(crossAt + MINUTE);
    expect(t().main_lock_passed_at).toBe(new Date(crossAt).toISOString()); // written once

    // Jump on past the final: the offset shrinks by weeks, the stamp stays.
    const finalAt = start + 20 * MINUTE;
    expect(await admin({ action: "set_clock", asOf: "2027-04-06T15:00:00Z" }, finalAt)).toMatchObject({ ok: true });
    for (let m = 1; m <= 10 && !t().prizes_settled_at; m += 1) await sync(finalAt + m * MINUTE);
    expect(t().main_lock_passed_at).toBe(new Date(crossAt).toISOString());
    // The old rule (lock + the current offset) would put the lock weeks before the prize existed.
    expect(Date.parse(lockAt) + Number(t().clock_offset_seconds) * 1000).toBeLessThan(prizeAt);
    expect(bracketRealLockMs(tournamentFromRow(t() as Parameters<typeof tournamentFromRow>[0]), "main")).toBe(crossAt);

    expect(typeof t().prizes_settled_at).toBe("string");
    const settled = (tables.challenge_cycle_settlements ?? []).filter((row) => row.challenge_id === "c-bracket");
    expect(settled).toHaveLength(1);
    expect(settled[0]).toMatchObject({ venue_id: "vh", outcome: "awarded", winners: [expect.objectContaining({ user_id: ANN, place: 1 })] });
  }, 60_000);

  it("a lock already passed before a jump keeps lock + the OLD offset; a live tournament's real lock is unchanged", () => {
    const base = {
      mainLockAt: "2027-03-18T16:15:00Z", secondLockAt: null, mainLockPassedAt: null, secondLockPassedAt: null,
    };
    // Live: offset 0, the sync's stamp is the lock itself.
    const live = lockPassedPatch(base, { main: base.mainLockAt, second: null }, Date.parse("2027-03-18T17:00:00Z"), { offsetSeconds: 0 });
    expect(live).toEqual({ main_lock_passed_at: "2027-03-18T16:15:00.000Z" });
    expect(bracketRealLockMs({ ...base, mainLockPassedAt: live.main_lock_passed_at, clockOffsetSeconds: 0 }, "main")).toBe(Date.parse(base.mainLockAt));
    expect(bracketRealLockMs({ ...base, clockOffsetSeconds: 0 }, "main")).toBe(Date.parse(base.mainLockAt));
    // Not passed yet: nothing to stamp. Already stamped: never rewritten.
    expect(lockPassedPatch(base, { main: base.mainLockAt, second: null }, Date.parse("2027-03-18T16:00:00Z"), { offsetSeconds: 0 })).toEqual({});
    expect(lockPassedPatch({ ...base, mainLockPassedAt: "2027-01-01T00:00:00Z" }, { main: base.mainLockAt, second: null }, Date.parse("2027-04-01T00:00:00Z"), { offsetSeconds: 0 })).toEqual({});
  });
});

describe("admin corrections reach players and stick (plan 10.1)", () => {
  const SELECTION_SUNDAY = Date.parse("2027-03-14T23:00:00Z"); // a discovery minute
  const AFTER_FINALS = Date.parse("2027-04-06T15:00:00Z"); // both championships over; window still open
  const perfect = () => bracketWinnerSeats(mergeBracketFeed([], FEEDS.men as BracketFeedGame[]).games);
  const men = () => tables.bracket_tournaments.find((t) => t.gender === "men" && t.purpose === "live") as Row;
  const game = (round: number, location: number) =>
    tables.bracket_games.find((g) => g.tournament_id === men().id && g.round === round && g.location === location) as Row;
  const round = (n: number) => tables.bracket_rounds.find((r) => r.tournament_id === men().id && r.round === n) as Row;
  /** Venue points a bracket is owed against the men's results as stored now. */
  const owed = (picks: Array<number | null>) =>
    bracketRoundCorrect(picks, men().winner_seats as Array<number | null>, "main").reduce(
      (sum, correct, i) => sum + bracketRoundVenuePoints((i + 1) as BracketRound, correct),
      0,
    );
  const enter = async () => {
    await tick(SELECTION_SUNDAY);
    for (const [user, picks] of [[ANN, perfect()], [BOB, homeBracket()]] as const) {
      (tables.bracket_entries ??= []).push({
        id: nextId(), tournament_id: men().id, kind: "main", user_id: user, venue_id: "v1",
        picks, round_correct: [0, 0, 0, 0, 0, 0], score: 0, pick_count: 63, tiebreaker: 140, submitted_at: new Date(SELECTION_SUNDAY).toISOString(),
      });
    }
  };
  const finish = async () => {
    await enter();
    await tick(AFTER_FINALS);
    expect(men().next_sync_at).toBeNull(); // decided, paid and settled: never due again on its own
    expect(points(ANN)).toBe(192);
  };
  const admin = (action: Record<string, unknown>, atMs: number) => {
    clockMs = atMs;
    return runBracketsAdminAction({ tournamentId: men().id, ...action } as Parameters<typeof runBracketsAdminAction>[0], "tester", atMs);
  };

  it("pays a re-graded round again at the next tick, even after the championship (B1)", async () => {
    await finish();
    const champion = game(6, 1).winner_side;
    const other = champion === "home" ? "away" : "home";
    // The other champion needs the corrected score too (plan 10.5.2): the feed's, swapped.
    const feedScores = { home: Number(game(6, 1).home_score), away: Number(game(6, 1).away_score) };
    const swapped = { home: feedScores.away, away: feedScores.home };
    const at = AFTER_FINALS + 60 * MINUTE;
    const result = await admin({ action: "override_result", round: 6, location: 1, winner: other, scores: swapped, reason: "Feed had the wrong champion" }, at);
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.message).toMatch(/paid again at the next sync.*within a minute/);
    expect(men().next_sync_at).toBe(new Date(at).toISOString());
    expect(round(6)).toMatchObject({ grade_no: 2, paid_grade_no: null });
    expect(points(ANN)).toBeLessThan(192); // round 6 taken back

    const report = await tick(at + MINUTE);
    const synced = report.synced.find((s) => s.tournamentId === men().id);
    expect(synced?.paidRounds).toEqual([6]);
    expect(synced?.needsAdmin).toBeNull();
    expect(round(6)).toMatchObject({ grade_no: 2, paid_grade_no: 2 });
    expect(points(ANN)).toBe(owed(perfect()));
    expect(points(BOB)).toBe(owed(homeBracket()));
    expect(game(6, 1)).toMatchObject({ winner_side: other, result_source: "admin" }); // the feed only reports
    expect(String(game(6, 1).mismatch_note)).toMatch(/Feed says/);
    expect(men().next_sync_at).toBeNull();

    // After the window the cron no longer drives it: the message says so, and Sync now pays.
    const late = Date.parse("2027-04-08T15:00:00Z");
    const back = await admin({ action: "override_result", round: 6, location: 1, winner: champion, scores: feedScores, reason: "Back to the feed's champion" }, late);
    expect(back.ok && back.message).toMatch(/press Sync now/);
    expect((await tick(late + MINUTE)).skipped).toBe("inactive");
    const synced2 = await admin({ action: "sync" }, late + 2 * MINUTE);
    expect(synced2.ok && synced2.sync?.paidRounds).toEqual([6]);
    expect(points(ANN)).toBe(192);
  }, 60_000);

  it("pays several due rounds in ONE pass over the entries, with the same credits (plan 10.4, §17 B10)", async () => {
    await finish();
    const before = { ann: points(ANN), bob: points(BOB) };
    const keysBefore = (tables.seasonal_points_credits ?? []).map((c) => String(c.source_key)).sort();
    // Rounds 1–3 as if their pay runs had failed: unpaid, nothing in the ledger.
    const ledger = tables.seasonal_points_credits;
    for (const n of [1, 2, 3]) {
      Object.assign(round(n), { paid_grade_no: null, paid_at: null });
      for (const credit of ledger.filter((c) => String(c.source_key).endsWith(`:r${n}:1`))) {
        const user = tables.users.find((u) => u.id === credit.user_id) as Row;
        user.points = Number(user.points) - Number(credit.points);
      }
    }
    tables.seasonal_points_credits = ledger.filter((c) => !/:r[123]:1$/.test(String(c.source_key)));
    expect(points(ANN)).toBeLessThan(before.ann);

    const at = AFTER_FINALS + 60 * MINUTE;
    men().next_sync_at = new Date(at).toISOString();
    io.selects = [];
    const report = await tick(at);
    expect(report.synced.find((s) => s.tournamentId === men().id)?.paidRounds).toEqual([1, 2, 3]);
    expect(io.selects.filter((table) => table === "bracket_entries")).toHaveLength(1); // one page, all three rounds
    expect([1, 2, 3].map((n) => round(n).paid_grade_no)).toEqual([1, 1, 1]);
    expect({ ann: points(ANN), bob: points(BOB) }).toEqual(before);
    expect((tables.seasonal_points_credits ?? []).map((c) => String(c.source_key)).sort()).toEqual(keysBefore);
  }, 60_000);

  it("holds a game on No result until an admin lets the feed decide (B2)", async () => {
    await finish();
    const champion = game(6, 1).winner_side;
    const at = AFTER_FINALS + 60 * MINUTE;
    const held = await admin({ action: "override_result", round: 6, location: 1, winner: null, reason: "Hold: feed result disputed" }, at);
    expect(held.ok && held.message).toMatch(/held/);
    expect(game(6, 1)).toMatchObject({ winner_side: null, result_source: null, result_held: true });

    for (const minutes of [1, 2, 60, 61]) await tick(at + minutes * MINUTE);
    expect(game(6, 1)).toMatchObject({ winner_side: null, result_held: true });
    expect(String(game(6, 1).mismatch_note)).toMatch(/held/);
    expect((men().winner_seats as Array<number | null>)[62]).toBeNull();

    expect(await admin({ action: "release_result", round: 6, location: 2, reason: "x".repeat(5) }, at)).toMatchObject({ ok: false });
    const released = await admin({ action: "release_result", round: 6, location: 1, reason: "Feed confirmed" }, at + 62 * MINUTE);
    expect(released).toMatchObject({ ok: true });
    await tick(at + 63 * MINUTE);
    expect(game(6, 1)).toMatchObject({ winner_side: champion, result_source: "feed", result_held: false, mismatch_note: null });
    expect(men().winner_seats).toEqual(perfect());
    expect(points(ANN)).toBe(192); // round 6 paid again under its new grade
    expect(round(6).paid_grade_no).toBe(round(6).grade_no);
  }, 60_000);

  it("keeps an admin override that lands between the sync's read and its write (B3)", async () => {
    await enter();
    const at = Date.parse("2027-03-19T12:00:00Z"); // the first Round-of-64 day is over
    const decidedNow = mergeBracketFeed([], maskBracketFeedAt(FEEDS.men as BracketFeedGame[], at)).games.find(
      (g) => g.round === 1 && g.winnerSide && g.homeTeam && g.awayTeam,
    );
    expect(decidedNow).toBeDefined();
    const location = decidedNow?.location as number;
    const adminSide = decidedNow?.winnerSide === "home" ? "away" : "home";
    hooks.beforeFeedWrite = async (tournamentId) => {
      expect(tournamentId).toBe(men().id); // men's is synced first (created first)
      const result = await admin({ action: "override_result", round: 1, location, winner: adminSide, reason: "Scorer error" }, at);
      expect(result).toMatchObject({ ok: true });
    };
    const first = await tick(at);
    const run = first.synced.find((s) => s.tournamentId === men().id);
    expect(run?.errors).toEqual([]);
    expect(game(1, location)).toMatchObject({ winner_side: adminSide, result_source: "admin" });
    const adminSeat = 2 * (location - 1) + (adminSide === "home" ? 0 : 1);
    expect((men().winner_seats as Array<number | null>)[location - 1]).toBe(adminSeat);
    expect(run?.newResults).toBe(0); // stale: recorded nothing on its old read

    const second = await tick(at + MINUTE); // the admin asked for a sync now
    const next = second.synced.find((s) => s.tournamentId === men().id);
    expect(next?.needsAdmin).toBeNull();
    expect(next?.errors).toEqual([]);
    expect(next?.newResults).toBeGreaterThan(0);
    expect((men().winner_seats as Array<number | null>)[location - 1]).toBe(adminSeat);
    expect(game(1, location).result_source).toBe("admin");
  }, 60_000);
});

describe("lock and final-score guards (plan 10.2)", () => {
  const SELECTION_SUNDAY = Date.parse("2027-03-14T23:00:00Z");
  const AFTER_FINALS = Date.parse("2027-04-06T15:00:00Z");
  const men = (purpose = "live") => tables.bracket_tournaments.find((t) => t.gender === "men" && t.purpose === purpose) as Row;
  const admin = (tournamentId: string, action: Record<string, unknown>, atMs: number) => {
    clockMs = atMs;
    return runBracketsAdminAction({ tournamentId, ...action } as Parameters<typeof runBracketsAdminAction>[0], "tester", atMs);
  };
  const minutesFrom = (iso: unknown, minutes: number) => new Date(Date.parse(String(iso)) + minutes * MINUTE).toISOString();

  it("refuses a main lock after the first Round-of-64 tip, live (B5)", async () => {
    await tick(SELECTION_SUNDAY);
    const firstTip = men().main_lock_at; // auto = the first Round-of-64 tip
    expect(typeof firstTip).toBe("string");
    const id = String(men().id);
    expect(await admin(id, { action: "move_lock", kind: "main", lockAt: minutesFrom(firstTip, 1) }, SELECTION_SUNDAY)).toMatchObject({
      ok: false,
      status: 409,
      error: expect.stringMatching(/after the first Round-of-64 tip/),
    });
    expect(men().main_lock_at).toBe(firstTip);
    expect(await admin(id, { action: "move_lock", kind: "main", lockAt: firstTip }, SELECTION_SUNDAY)).toMatchObject({ ok: true });
    expect(await admin(id, { action: "move_lock", kind: "main", lockAt: minutesFrom(firstTip, -60) }, SELECTION_SUNDAY)).toMatchObject({ ok: true });
    expect(men()).toMatchObject({ main_lock_at: minutesFrom(firstTip, -60), main_lock_set_by: "admin" });
    // Once it has tipped, the lock only moves earlier (plan 10.5.1): never later, never reopened.
    expect(await admin(id, { action: "move_lock", kind: "main", lockAt: minutesFrom(firstTip, -30) }, Date.parse(String(firstTip)))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/only move earlier/),
    });
    expect(await admin(id, { action: "move_lock", kind: "main", lockAt: minutesFrom(firstTip, -120) }, Date.parse(String(firstTip)))).toMatchObject({ ok: true });
  });

  it("a late admin lock found after the first tip can be pulled in, and is logged once (plan 10.5.1, §22 R1/R9)", async () => {
    await tick(SELECTION_SUNDAY);
    const firstTip = String(men().main_lock_at);
    const id = String(men().id);
    // The feed used to show the first tip 6 h later, and the admin locked 3 h after the real one.
    for (const game of tables.bracket_games) {
      if (game.tournament_id === id && game.tip_at) game.tip_at = minutesFrom(game.tip_at, 360);
    }
    Object.assign(men(), { main_lock_at: minutesFrom(firstTip, 180), main_lock_set_by: "admin" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await admin(id, { action: "sync" }, SELECTION_SUNDAY); // this run's merge moves the first tip back
      await admin(id, { action: "sync" }, SELECTION_SUNDAY + MINUTE); // same tips: no second warning
      expect(warn.mock.calls.filter(([tag]) => tag === "[Brackets] admin-lock-after-first-tip")).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
    const playing = Date.parse(firstTip) + 10 * MINUTE; // games are being played; the late lock hasn't passed
    expect(await admin(id, { action: "move_lock", kind: "main", lockAt: minutesFrom(firstTip, 240) }, playing)).toMatchObject({
      ok: false,
      status: 409,
      error: expect.stringMatching(/only move earlier/),
    });
    // Follow feed: the feed's lock (the first tip) is earlier, so it's written at once and entries close.
    expect(await admin(id, { action: "move_lock", kind: "main", lockAt: null }, playing)).toMatchObject({ ok: true });
    expect(men()).toMatchObject({ main_lock_at: firstTip, main_lock_set_by: "auto" });
    // Closed now: it can't be moved later again.
    expect(await admin(id, { action: "move_lock", kind: "main", lockAt: minutesFrom(firstTip, 60) }, playing)).toMatchObject({ ok: false, status: 409 });
  });

  it("compares on a rehearsal's replay clock (B5)", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRACKETS_ENABLED", "");
    vi.stubEnv("BRACKETS_REHEARSAL_ENABLED", "true");
    const now = Date.parse("2027-05-01T15:00:00Z");
    const replayAt = Date.parse("2027-03-15T12:00:00Z");
    tables.bracket_tournaments = [
      {
        id: nextId(), gender: "men", season: 2026, purpose: "rehearsal", clock_offset_seconds: Math.round((now - replayAt) / 1000),
        archived_at: null, completed_at: null, next_sync_at: null, winner_seats: Array.from({ length: 63 }, () => null),
        main_lock_set_by: "auto", second_lock_set_by: "auto", main_lock_at: null, second_lock_at: null, region_names: null, championship_total: null,
        created_at: new Date(now).toISOString(),
      },
    ];
    clockMs = now;
    await runBracketsTick({ now: new Date(now) });
    const firstTip = men("rehearsal").main_lock_at;
    expect(Date.parse(String(firstTip))).toBeGreaterThan(replayAt); // replay time, not real time
    const id = String(men("rehearsal").id);
    expect(await admin(id, { action: "move_lock", kind: "main", lockAt: minutesFrom(firstTip, 30) }, now)).toMatchObject({ ok: false, status: 409 });
    expect(await admin(id, { action: "move_lock", kind: "main", lockAt: minutesFrom(firstTip, -30) }, now)).toMatchObject({ ok: true });
  });

  it("a final with no score: hourly + needsAdmin, then the admin's score settles the prizes (B6)", async () => {
    const original = FEEDS.men;
    // The feed stalls in the championship's second half: no final, no score.
    const stalled = (team: BracketFeedGame["home_team"]) => (team ? { ...team, score: null, winner: null } : team);
    FEEDS.men = (original as BracketFeedGame[]).map((g) =>
      g.round === 6
        ? { ...g, status: "in", status_state: "in", status_detail: "2nd Half", home_team: stalled(g.home_team), away_team: stalled(g.away_team) }
        : g,
    );
    try {
      await tick(SELECTION_SUNDAY);
      await tick(AFTER_FINALS);
      const id = String(men().id);
      const champion = (original as BracketFeedGame[]).find((g) => g.round === 6);
      const winner = champion?.home_team?.winner === true ? "home" : "away";
      const decidedAt = AFTER_FINALS + 10 * MINUTE;
      const picked = await admin(id, { action: "override_result", round: 6, location: 1, winner, reason: "Feed stuck; champion confirmed" }, decidedAt);
      expect(picked).toMatchObject({ ok: true, message: expect.stringMatching(/Prizes need the final score/) });

      const first = await tick(decidedAt + MINUTE);
      const run = first.synced.find((s) => s.tournamentId === id);
      expect(run?.errors).toEqual([]);
      expect(run?.needsAdmin).toMatch(/Enter the final score/);
      expect((men().winner_seats as Array<number | null>)[62]).not.toBeNull();
      expect(men()).toMatchObject({ championship_total: null, prizes_settled_at: null });
      expect(men().next_sync_at).toBe(new Date(decidedAt + MINUTE + 60 * MINUTE).toISOString()); // hourly, not every 2 min

      io.feedRequests = 0;
      for (const minutes of [3, 5, 30]) await tick(decidedAt + minutes * MINUTE);
      expect(io.feedRequests).toBe(0);

      const [home, away] = winner === "home" ? [70, 64] : [64, 70];
      const at = decidedAt + 40 * MINUTE;
      const saved = await admin(id, { action: "override_result", round: 6, location: 1, winner, scores: { home, away }, reason: "Final score from the box score" }, at);
      expect(saved).toMatchObject({ ok: true, message: expect.stringMatching(/total 134\): prizes settle at the next sync/) });
      expect(men().championship_total).toBe(134);

      const next = await tick(at + MINUTE);
      const settled = next.synced.find((s) => s.tournamentId === id);
      expect(settled?.needsAdmin).toBeNull();
      expect(settled?.errors).toEqual([]);
      expect(typeof men().prizes_settled_at).toBe("string");
      expect(men()).toMatchObject({ championship_total: 134, next_sync_at: null });
      // The still-stalled feed has no score: it never clears the admin's total.
      const game = tables.bracket_games.find((g) => g.tournament_id === id && g.round === 6) as Row;
      expect(game).toMatchObject({ home_score: home, away_score: away, result_source: "admin" });
    } finally {
      FEEDS.men = original;
    }
  }, 60_000);
});

describe("the championship score stays put and agrees with the winner (plan 10.5.2)", () => {
  const SELECTION_SUNDAY = Date.parse("2027-03-14T23:00:00Z");
  const AFTER_FINALS = Date.parse("2027-04-06T15:00:00Z");
  const men = () => tables.bracket_tournaments.find((t) => t.gender === "men" && t.purpose === "live") as Row;
  const admin = (action: Record<string, unknown>, atMs: number) => {
    clockMs = atMs;
    return runBracketsAdminAction({ tournamentId: men().id, ...action } as Parameters<typeof runBracketsAdminAction>[0], "tester", atMs);
  };
  const final = () => tables.bracket_games.find((g) => g.tournament_id === men().id && g.round === 6) as Row;
  const championOf = (games: BracketFeedGame[]) => (games.find((g) => g.round === 6)?.home_team?.winner === true ? "home" : "away");

  it("a stale run never clears the admin's final score, and a later override keeps the total (§22 R2, R4)", async () => {
    const original = FEEDS.men;
    const stalled = (team: BracketFeedGame["home_team"]) => (team ? { ...team, score: null, winner: null } : team);
    FEEDS.men = (original as BracketFeedGame[]).map((g) =>
      g.round === 6
        ? { ...g, status: "in", status_state: "in", status_detail: "2nd Half", home_team: stalled(g.home_team), away_team: stalled(g.away_team) }
        : g,
    );
    try {
      await tick(SELECTION_SUNDAY);
      await tick(AFTER_FINALS);
      const winner = championOf(original as BracketFeedGame[]);
      const [home, away] = winner === "home" ? [70, 64] : [64, 70];
      const at = AFTER_FINALS + 10 * MINUTE;
      // The sync reads the final (no score) and the admin's score lands before its write.
      hooks.beforeFeedWrite = async () => {
        const saved = await admin({ action: "override_result", round: 6, location: 1, winner, scores: { home, away }, reason: "Box score" }, at);
        expect(saved).toMatchObject({ ok: true });
      };
      // Force the run to write the final row (the stalled feed's status detail moves on).
      FEEDS.men = (FEEDS.men as BracketFeedGame[]).map((g) => (g.round === 6 ? { ...g, status_detail: "Final" } : g));
      await tick(Math.max(at, Date.parse(String(men().next_sync_at))));
      expect(hooks.beforeFeedWrite).toBeNull();
      expect(final()).toMatchObject({ home_score: home, away_score: away });
      expect(men().championship_total).toBe(134);

      // Defence: even with the final's scores gone, an override of another game keeps the total.
      Object.assign(final(), { home_score: null, away_score: null });
      const semi = tables.bracket_games.find((g) => g.tournament_id === men().id && g.round === 5 && g.location === 1) as Row;
      const again = await admin(
        { action: "override_result", round: 5, location: 1, winner: semi.winner_side, reason: "Re-apply the semifinal" },
        at + 5 * MINUTE,
      );
      expect(again).toMatchObject({ ok: true });
      expect(again.ok && again.message).not.toMatch(/Prizes need the final score/);
      expect(men().championship_total).toBe(134);
    } finally {
      FEEDS.men = original;
    }
  }, 60_000);

  it("refuses a championship winner the stored score contradicts, unless the corrected score comes too (§22 R5)", async () => {
    await tick(SELECTION_SUNDAY);
    await tick(AFTER_FINALS);
    const champion = String(final().winner_side);
    const other = champion === "home" ? "away" : "home";
    const total = men().championship_total;
    expect(typeof total).toBe("number");
    const at = AFTER_FINALS + 10 * MINUTE;

    expect(await admin({ action: "override_result", round: 6, location: 1, winner: other, reason: "Wrong champion?" }, at)).toMatchObject({
      ok: false,
      status: 409,
      error: "The stored score says the other team won: enter the corrected score too.",
    });
    expect(final().winner_side).toBe(champion);
    expect(await admin({ action: "override_result", round: 6, location: 1, winner: champion, reason: "Confirm champion" }, at)).toMatchObject({ ok: true });
    expect(men().championship_total).toBe(total);

    const scores = other === "home" ? { home: 80, away: 60 } : { home: 60, away: 80 };
    expect(await admin({ action: "override_result", round: 6, location: 1, winner: other, scores, reason: "Scorer error" }, at)).toMatchObject({ ok: true });
    expect(final()).toMatchObject({ winner_side: other, home_score: scores.home, away_score: scores.away });
    expect(men().championship_total).toBe(140);
    // "No result" stays allowed whatever the score says.
    expect(await admin({ action: "override_result", round: 6, location: 1, winner: null, reason: "Hold: disputed" }, at)).toMatchObject({ ok: true });
    expect(men().championship_total).toBeNull();
  }, 60_000);
});
