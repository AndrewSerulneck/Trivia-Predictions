import { beforeEach, describe, expect, it, vi } from "vitest";

// Squares + Brackets plan Phase 4: awardSquaresPrizes (lib/squaresPrizeAwards.ts) — each graded
// winning result is checked ONCE against its venue's Squares prizes, paid through award_cycle_winner
// with a per-moment cycle key and a quota of 1, then stamped. The ledger RPC and the prizes read are
// stubbed; the squares_results reads/writes run against a small in-memory table.

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  results: [] as Row[],
  updates: [] as Row[],
  readError: null as string | null,
  // venues: read only for a rehearsal event (plan 6.2).
  venues: [] as Row[],
  venueReads: 0,
  venueReadError: null as string | null,
}));

class FakeQuery {
  private filters: Array<(row: Row) => boolean> = [];
  private op: "select" | "update" = "select";
  private payload: Row = {};
  private max = Infinity;
  constructor(private table: string) {}
  select() { return this; }
  order() { return this; }
  returns() { return this; }
  limit(n: number) { this.max = n; return this; }
  eq(col: string, value: unknown) { this.filters.push((row) => row[col] === value); return this; }
  is(col: string, value: null) { this.filters.push((row) => (row[col] ?? null) === value); return this; }
  not(col: string, _op: "is", value: null) { this.filters.push((row) => (row[col] ?? null) !== value); return this; }
  in(col: string, values: unknown[]) { this.filters.push((row) => values.includes(row[col])); return this; }
  update(payload: Row) { this.op = "update"; this.payload = payload; return this; }
  then<T>(resolve: (value: { data: unknown; error: { message: string } | null }) => T): Promise<T> {
    if (this.table === "venues") {
      db.venueReads += 1;
      if (db.venueReadError) return Promise.resolve(resolve({ data: null, error: { message: db.venueReadError } }));
      return Promise.resolve(resolve({ data: db.venues.filter((row) => this.filters.every((filter) => filter(row))), error: null }));
    }
    expect(this.table).toBe("squares_results");
    if (this.op === "select" && db.readError) return Promise.resolve(resolve({ data: null, error: { message: db.readError } }));
    const matched = db.results.filter((row) => this.filters.every((filter) => filter(row))).slice(0, this.max);
    if (this.op === "update") {
      matched.forEach((row) => Object.assign(row, this.payload));
      db.updates.push({ ids: matched.map((row) => row.id), ...this.payload });
    }
    return Promise.resolve(resolve({ data: matched, error: null }));
  }
}

const engine = vi.hoisted(() => ({
  prizes: [] as Row[],
  ledger: new Set<string>(),
  awards: [] as Row[],
  failFor: null as string | null,
  readFails: false,
  // squares_withdraw_prize_coupons: "venue|cycle|user" → its answer (default: nothing to withdraw).
  withdrawAnswers: new Map<string, { withdrawn_count: number; kept_count: number } | "error">(),
  withdrawCalls: [] as Row[],
  notices: [] as Row[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(async (params: Row) => {
    engine.notices.push(params);
  }),
}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (table: string) => new FakeQuery(table),
    rpc: async (name: string, args: Row) => {
      expect(name).toBe("squares_withdraw_prize_coupons");
      engine.withdrawCalls.push(args);
      const answer = engine.withdrawAnswers.get(`${args.p_venue_id}|${args.p_cycle_start}|${args.p_user_id}`);
      if (answer === "error") return { data: null, error: { message: "deadlock detected" } };
      return { data: [answer ?? { withdrawn_count: 0, kept_count: 0 }], error: null };
    },
  },
}));
vi.mock("@/lib/challengeCampaigns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/challengeCampaigns")>();
  return {
    ...actual,
    listActiveSquaresPrizeCampaigns: vi.fn(async (venueIds: string[]) => {
      if (engine.readFails) throw new Error("column squares_moments does not exist");
      return engine.prizes.filter((prize) => (prize.venueIds as string[]).some((id) => venueIds.includes(id)));
    }),
    awardCycleWinner: vi.fn(async (params: { campaign: Row; userId: string; venueId: string; cycleStart: Date; winnerQuota: number; pointsEarned: number }) => {
      if (engine.failFor === params.campaign.id) throw new Error("award_cycle_winner RPC failed: timeout");
      engine.awards.push({ campaignId: params.campaign.id, userId: params.userId, venueId: params.venueId, cycleStart: params.cycleStart.toISOString(), quota: params.winnerQuota, points: params.pointsEarned });
      // The real ledger: unique (prize, cycle, winner), quota 1 per cycle.
      const key = `${params.campaign.id}|${params.cycleStart.toISOString()}`;
      if (engine.ledger.has(key)) return { won: false, exhausted: true };
      engine.ledger.add(key);
      return { won: true, exhausted: true };
    }),
  };
});

import {
  awardSquaresPrizes,
  squaresPrizeCoversEvent,
  squaresPrizePaysAtVenue,
  squaresPrizeWithdrawnMessage,
  withdrawVoidedSquaresPrizes,
} from "@/lib/squaresPrizeAwards";
import { squaresPrizeCycleStart } from "@/lib/squaresPrizes";
import type { ChallengeCampaign } from "@/types";

const EVENT = {
  id: "event-1",
  kickoffAt: "2027-02-14T23:30:00+00:00",
  lockAt: "2027-02-14T23:00:00+00:00",
  purpose: "super_bowl" as const,
};
const NOW = new Date("2027-02-15T00:05:00Z");

const prize = (overrides: Partial<ChallengeCampaign> = {}): Row =>
  ({
    id: "prize-v1",
    createdAt: "2027-02-01T12:00:00Z",
    venueIds: ["v1"],
    rewardDefinitionId: "squares_challenge",
    squaresMoments: ["q1", "final"],
    recurringType: "none",
    scheduleType: "single_day",
    endDate: "2027-02-15",
    ...overrides,
  }) as Row;

let resultId = 0;
const result = (overrides: Row = {}): Row => ({
  id: `r-${++resultId}`,
  event_id: EVENT.id,
  moment: "q1",
  grade_no: 1,
  user_id: "ann",
  points: 25,
  voided_at: null,
  prize_checked_at: null,
  board: { venue_id: "v1" },
  ...overrides,
});

const run = async (event: typeof EVENT | (Omit<typeof EVENT, "purpose"> & { purpose: "rehearsal" }) = EVENT) => {
  const report = { actions: [] as string[], errors: [] as string[] };
  await awardSquaresPrizes(event, report, NOW);
  return report;
};
const REHEARSAL = { ...EVENT, purpose: "rehearsal" as const };

beforeEach(() => {
  db.results = [];
  db.updates = [];
  db.readError = null;
  db.venues = [];
  db.venueReads = 0;
  db.venueReadError = null;
  engine.prizes = [prize()];
  engine.ledger = new Set();
  engine.awards = [];
  engine.failFor = null;
  engine.readFails = false;
  engine.withdrawAnswers = new Map();
  engine.withdrawCalls = [];
  engine.notices = [];
});

describe("awardSquaresPrizes", () => {
  it("pays the venue's prize for a moment it covers, keyed on that moment, quota 1, then stamps the row", async () => {
    db.results.push(result());
    const report = await run();
    expect(engine.awards).toEqual([
      {
        campaignId: "prize-v1",
        userId: "ann",
        venueId: "v1",
        cycleStart: squaresPrizeCycleStart(EVENT.kickoffAt, "q1", 1)!.toISOString(),
        quota: 1,
        points: 25,
      },
    ]);
    expect(report.actions).toEqual(["prizes_awarded_1"]);
    expect(report.errors).toEqual([]);
    expect(db.results[0].prize_checked_at).toBe(NOW.toISOString());
  });

  it("reads nothing more once every result is stamped (the every-minute run is one empty read)", async () => {
    db.results.push(result());
    await run();
    engine.awards = [];
    const report = await run();
    expect(engine.awards).toEqual([]);
    expect(report).toEqual({ actions: [], errors: [] });
  });

  it("stamps without paying a moment the prize doesn't cover, another venue's board, or a voided result", async () => {
    db.results.push(
      result({ moment: "half" }),
      result({ board: { venue_id: "v2" } }),
      result({ voided_at: "2027-02-15T00:01:00Z" }),
    );
    await run();
    expect(engine.awards).toEqual([]);
    expect(db.results.map((row) => row.prize_checked_at)).toEqual([NOW.toISOString(), NOW.toISOString(), null]);
  });

  it("never pays another game's prize, even if the read returned one (plan 6.1)", async () => {
    engine.prizes = [prize({ id: "prize-trivia", rewardDefinitionId: "live_trivia_challenge" }), prize()];
    db.results.push(result({ moment: "q1" }));
    await run();
    expect(engine.awards.map((award) => award.campaignId)).toEqual(["prize-v1"]);
  });

  it("pays every covering prize at the venue, and one player may win several moments", async () => {
    engine.prizes = [prize(), prize({ id: "prize-v1-final", squaresMoments: ["final"] })];
    db.results.push(result({ moment: "q1" }), result({ moment: "final", points: 50 }));
    await run();
    expect(engine.awards.map((award) => [award.campaignId, award.userId])).toEqual([
      ["prize-v1", "ann"],
      ["prize-v1", "ann"],
      ["prize-v1-final", "ann"],
    ]);
    expect(new Set(engine.awards.map((award) => award.cycleStart)).size).toBe(2);
  });

  it("pays the re-graded winner of a voided moment too (a new grade is a new cycle)", async () => {
    db.results.push(result({ voided_at: "2027-02-15T00:01:00Z", prize_checked_at: "2027-02-15T00:00:00Z" }));
    engine.ledger.add(`prize-v1|${squaresPrizeCycleStart(EVENT.kickoffAt, "q1", 1)!.toISOString()}`);
    db.results.push(result({ grade_no: 2, user_id: "bob" }));
    const report = await run();
    expect(engine.awards).toMatchObject([{ userId: "bob", cycleStart: squaresPrizeCycleStart(EVENT.kickoffAt, "q1", 2)!.toISOString() }]);
    expect(report.actions).toEqual(["prizes_awarded_1"]);
  });

  it("is safe to repeat: a row that wasn't stamped is re-asked and the ledger says already won", async () => {
    db.results.push(result());
    await run();
    db.results[0].prize_checked_at = null;
    const report = await run();
    expect(engine.awards).toHaveLength(2);
    expect(report.actions).toEqual([]);
    expect(engine.ledger.size).toBe(1);
  });

  it("leaves a row unstamped when an award fails, so the next run retries it", async () => {
    engine.prizes = [prize(), prize({ id: "prize-broken" })];
    engine.failFor = "prize-broken";
    db.results.push(result());
    const report = await run();
    expect(report.errors).toEqual(["prize prize-broken q1: award_cycle_winner RPC failed: timeout"]);
    expect(db.results[0].prize_checked_at).toBeNull();
  });

  it("stamps nothing when the prizes can't be read (e.g. the migration isn't applied)", async () => {
    engine.readFails = true;
    db.results.push(result());
    const report = await run();
    expect(report.errors[0]).toMatch(/^prize campaigns read:/);
    expect(db.results[0].prize_checked_at).toBeNull();
    expect(db.updates).toEqual([]);
  });

  it("reports a failed results read and does nothing else", async () => {
    db.readError = "column squares_results.prize_checked_at does not exist";
    const report = await run();
    expect(report.errors).toEqual(["prize read: column squares_results.prize_checked_at does not exist"]);
    expect(engine.awards).toEqual([]);
  });
});

describe("a rehearsal event pays prizes only at hidden venues (plan 6.2, §13 F5)", () => {
  it("decides by purpose and the venue's hidden flag; unknown fails closed", () => {
    expect(squaresPrizePaysAtVenue("super_bowl", false)).toBe(true);
    expect(squaresPrizePaysAtVenue("super_bowl", null)).toBe(true);
    expect(squaresPrizePaysAtVenue("rehearsal", true)).toBe(true);
    expect(squaresPrizePaysAtVenue("rehearsal", false)).toBe(false);
    expect(squaresPrizePaysAtVenue("rehearsal", null)).toBe(false);
    expect(squaresPrizePaysAtVenue("rehearsal", undefined)).toBe(false);
  });

  it("a Super Bowl event never reads venues", async () => {
    db.results.push(result());
    await run();
    expect(db.venueReads).toBe(0);
    expect(engine.awards).toHaveLength(1);
  });

  it("pays a rehearsal winner at a hidden venue", async () => {
    db.venues = [{ id: "v1", hidden: true }];
    db.results.push(result());
    const report = await run(REHEARSAL);
    expect(db.venueReads).toBe(1);
    expect(engine.awards).toMatchObject([{ venueId: "v1", userId: "ann" }]);
    expect(report.actions).toEqual(["prizes_awarded_1"]);
  });

  it("never pays a rehearsal winner at a visible venue (or one it can't find), and stamps it once", async () => {
    db.venues = [{ id: "v1", hidden: false }];
    engine.prizes = [prize(), prize({ id: "prize-v9", venueIds: ["v9"] })];
    db.results.push(result(), result({ board: { venue_id: "v9" } }));
    const report = await run(REHEARSAL);
    expect(engine.awards).toEqual([]);
    expect(report).toEqual({ actions: [], errors: [] });
    expect(db.results.every((row) => row.prize_checked_at === NOW.toISOString())).toBe(true);
  });

  it("pays and stamps nothing when the venues can't be read", async () => {
    db.venueReadError = "timeout";
    db.results.push(result());
    const report = await run(REHEARSAL);
    expect(engine.awards).toEqual([]);
    expect(report.errors).toEqual(["prize venues read: timeout"]);
    expect(db.results[0].prize_checked_at).toBeNull();
  });
});

describe("squaresPrizeCoversEvent", () => {
  const covers = (overrides: Partial<ChallengeCampaign>) => squaresPrizeCoversEvent(prize(overrides) as unknown as ChallengeCampaign, EVENT);

  it("needs the prize to exist before claims closed (the lock)", () => {
    expect(covers({ createdAt: "2027-02-14T22:59:59Z" })).toBe(true);
    expect(covers({ createdAt: "2027-02-14T23:00:00Z" })).toBe(false);
    expect(covers({ createdAt: "not a date" })).toBe(false);
  });

  it("never pays a game after the prize closed (an old season's prize, a new season's game)", () => {
    expect(covers({ endDate: "2027-02-15" })).toBe(true);
    expect(covers({ endDate: "2026-02-15" })).toBe(false);
    expect(covers({ endDate: undefined })).toBe(true);
  });

  it("is applied before paying", async () => {
    engine.prizes = [prize({ createdAt: "2027-02-14T23:10:00Z" })];
    db.results.push(result());
    await run();
    expect(engine.awards).toEqual([]);
    expect(db.results[0].prize_checked_at).toBe(NOW.toISOString());
  });
});

describe("withdrawVoidedSquaresPrizes — a voided grade's unused coupon is taken back", () => {
  const VOIDED = "2027-02-15T00:01:00Z";
  const CHECKED = "2027-02-15T00:00:00Z";
  const key = (moment: "q1" | "half" | "q3" | "final", grade: number) => squaresPrizeCycleStart(EVENT.kickoffAt, moment, grade)!.toISOString();
  const withdraw = async () => {
    const report = { actions: [] as string[], errors: [] as string[] };
    await withdrawVoidedSquaresPrizes(EVENT, report, NOW);
    return report;
  };

  it("asks the database to withdraw the voided winner's coupon for that moment and grade, tells them, and stamps it", async () => {
    db.results.push(result({ moment: "half", grade_no: 1, voided_at: VOIDED, prize_checked_at: CHECKED }));
    engine.withdrawAnswers.set(`v1|${key("half", 1)}|ann`, { withdrawn_count: 1, kept_count: 0 });
    const report = await withdraw();
    expect(engine.withdrawCalls).toEqual([{ p_venue_id: "v1", p_cycle_start: key("half", 1), p_user_id: "ann" }]);
    expect(report).toEqual({ actions: ["prizes_withdrawn_1"], errors: [] });
    expect(engine.notices).toEqual([
      { userId: "ann", message: squaresPrizeWithdrawnMessage("half"), type: "info", linkUrl: "/redeem-prizes" },
    ]);
    expect(squaresPrizeWithdrawnMessage("half")).toBe(
      "Score correction in Super Bowl Squares: the result at halftime changed, so its prize went to the right square and your coupon for it was removed.",
    );
    expect(db.results[0].prize_withdrawn_at).toBe(NOW.toISOString());
    // Stamped: the next run reads nothing.
    engine.withdrawCalls = [];
    await withdraw();
    expect(engine.withdrawCalls).toEqual([]);
  });

  it("a redeemed coupon is kept: no notice, still stamped", async () => {
    db.results.push(result({ voided_at: VOIDED, prize_checked_at: CHECKED }));
    engine.withdrawAnswers.set(`v1|${key("q1", 1)}|ann`, { withdrawn_count: 0, kept_count: 1 });
    const report = await withdraw();
    expect(report).toEqual({ actions: [], errors: [] });
    expect(engine.notices).toEqual([]);
    expect(db.results[0].prize_withdrawn_at).toBe(NOW.toISOString());
  });

  it("leaves alone a live result, and a voided one not yet checked for prizes (an award may be mid-flight)", async () => {
    db.results.push(result({ prize_checked_at: CHECKED }), result({ voided_at: VOIDED }));
    await withdraw();
    expect(engine.withdrawCalls).toEqual([]);
    expect(db.results.map((row) => row.prize_withdrawn_at ?? null)).toEqual([null, null]);
  });

  it("retries a failed withdrawal next run (no stamp)", async () => {
    db.results.push(result({ voided_at: VOIDED, prize_checked_at: CHECKED }));
    engine.withdrawAnswers.set(`v1|${key("q1", 1)}|ann`, "error");
    const report = await withdraw();
    expect(report.errors).toEqual(["prize withdraw q1: deadlock detected"]);
    expect(db.results[0].prize_withdrawn_at ?? null).toBeNull();
  });

  it("awards the re-graded winner and withdraws the voided one in the same pass", async () => {
    db.results.push(
      result({ moment: "q1", grade_no: 1, user_id: "ann", voided_at: VOIDED, prize_checked_at: CHECKED }),
      result({ moment: "q1", grade_no: 2, user_id: "bob" }),
    );
    engine.withdrawAnswers.set(`v1|${key("q1", 1)}|ann`, { withdrawn_count: 1, kept_count: 0 });
    const report = { actions: [] as string[], errors: [] as string[] };
    await awardSquaresPrizes(EVENT, report, NOW);
    await withdrawVoidedSquaresPrizes(EVENT, report, NOW);
    expect(engine.awards).toMatchObject([{ userId: "bob", cycleStart: key("q1", 2) }]);
    expect(engine.withdrawCalls).toEqual([{ p_venue_id: "v1", p_cycle_start: key("q1", 1), p_user_id: "ann" }]);
    expect(report.actions).toEqual(["prizes_awarded_1", "prizes_withdrawn_1"]);
  });
});

