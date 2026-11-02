import { beforeEach, describe, expect, it, vi } from "vitest";

// Pick 'Em plan Phase 4b: the Pick 'Em Prize award rules (lib/pickemPrizeStandings.ts, pure) and the
// sweep (lib/pickemPrizeAwards.ts) against small fake tables. The award RPCs are stubbed here; their
// SQL is proven by `npm run test:pickem-prize-awards-sql` (tiers) and the existing award_cycle_winner tests.

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  reads: [] as string[],
  upserts: [] as Array<{ table: string; row: Row }>,
}));

const asMs = (value: unknown): number => Date.parse(String(value));
const compare = (a: unknown, b: unknown): number => {
  const am = asMs(a);
  const bm = asMs(b);
  if (Number.isFinite(am) && Number.isFinite(bm)) return am - bm;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
};

class FakeQuery {
  private filters: Array<(row: Row) => boolean> = [];
  private from = 0;
  private to = Infinity;
  private max = Infinity;
  private upsertRow: Row | null = null;
  constructor(private table: string) {}
  select() { return this; }
  order() { return this; }
  returns() { return this; }
  limit(n: number) { this.max = n; return this; }
  range(from: number, to: number) { this.from = from; this.to = to; return this; }
  eq(col: string, value: unknown) { this.filters.push((row) => row[col] === value); return this; }
  neq(col: string, value: unknown) { this.filters.push((row) => row[col] !== value); return this; }
  in(col: string, values: unknown[]) { this.filters.push((row) => values.includes(row[col])); return this; }
  gte(col: string, value: unknown) { this.filters.push((row) => row[col] !== null && row[col] !== undefined && compare(row[col], value) >= 0); return this; }
  lte(col: string, value: unknown) { this.filters.push((row) => row[col] !== null && row[col] !== undefined && compare(row[col], value) <= 0); return this; }
  lt(col: string, value: unknown) { this.filters.push((row) => row[col] !== null && row[col] !== undefined && compare(row[col], value) < 0); return this; }
  upsert(row: Row) { this.upsertRow = row; return this; }
  then<T>(resolve: (value: { data: unknown; error: null }) => T): Promise<T> {
    if (this.upsertRow) {
      db.upserts.push({ table: this.table, row: this.upsertRow });
      (db.tables[this.table] ??= []).push(this.upsertRow);
      return Promise.resolve(resolve({ data: null, error: null }));
    }
    db.reads.push(this.table);
    const rows = (db.tables[this.table] ?? []).filter((row) => this.filters.every((f) => f(row)));
    return Promise.resolve(resolve({ data: rows.slice(this.from, Math.min(this.to + 1, this.from + this.max)), error: null }));
  }
}

const engine = vi.hoisted(() => ({
  prizes: [] as Row[],
  cycleAwards: [] as Array<{ campaignId: string; userId: string; cycleStart: string; points: number; quota: number }>,
  tierAwards: [] as Array<{ campaignId: string; userId: string; periodStart: string; correct: number }>,
  guesses: [] as Row[],
  gameTotal: null as number | null,
  ended: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (table: string) => new FakeQuery(table) } }));
vi.mock("@/lib/timezone", () => ({ getVenueTimezone: vi.fn(async () => "America/New_York") }));
vi.mock("@/lib/pickemPrizeTiebreaker", () => ({
  listPickEmPrizeGuesses: vi.fn(async (params: { userIds: string[] }) =>
    engine.guesses.filter((guess) => params.userIds.includes(String(guess.userId))),
  ),
  pickemPrizeGameTotal: vi.fn(async () => engine.gameTotal),
}));
vi.mock("@/lib/challengeCampaigns", () => ({
  listAllActivePickEmPrizeCampaigns: vi.fn(async () => engine.prizes),
  endPickEmPrize: vi.fn(async (campaignId: string) => {
    engine.ended.push(campaignId);
  }),
  awardCycleWinner: vi.fn(
    async (params: { campaign: Row; userId: string; cycleStart: Date; pointsEarned: number; winnerQuota: number }) => {
      const cycleStart = params.cycleStart.toISOString();
      const taken = engine.cycleAwards.filter((a) => a.campaignId === params.campaign.id && a.cycleStart === cycleStart);
      if (taken.length >= params.winnerQuota || taken.some((a) => a.userId === params.userId)) return { won: false, exhausted: true };
      engine.cycleAwards.push({
        campaignId: String(params.campaign.id),
        userId: params.userId,
        cycleStart,
        points: params.pointsEarned,
        quota: params.winnerQuota,
      });
      return { won: true, exhausted: taken.length + 1 >= params.winnerQuota };
    },
  ),
  awardPickEmTierPrize: vi.fn(async (params: { campaign: Row; userId: string; periodStart: Date; correct: number }) => {
    engine.tierAwards.push({
      campaignId: String(params.campaign.id),
      userId: params.userId,
      periodStart: params.periodStart.toISOString(),
      correct: params.correct,
    });
    return { status: "awarded", tier: 1 };
  }),
}));

import { settlePickEmPrizes } from "@/lib/pickemPrizeAwards";
import {
  PICKEM_PRIZE_SETTLE_GRACE_MS,
  isPickEmPrizeFinalPassReady,
  isPickEmPrizePeriodDue,
  pickemPrizeCandidatePeriods,
  picksForPickEmPrizePeriod,
  planPickEmMostRight,
  planPickEmTargetAwards,
  planPickEmTierAwards,
  rankPickEmPrizeTiebreak,
  type PickEmPrizePick,
} from "@/lib/pickemPrizeStandings";
import { pickemPrizePeriodForDate } from "@/lib/pickemPrizes";
import type { PickEmPrizeWindow } from "@/types";

const TZ = "America/New_York";
// Saturday Nov 7, 2026 in New York (EST, UTC−5): 05:00Z to Nov 8 05:00Z.
const SAT_START = "2026-11-07T05:00:00.000Z";
const SAT_END_MS = Date.parse("2026-11-08T05:00:00.000Z");
const SATURDAYS: PickEmPrizeWindow = { kind: "weekday", weekday: "sat" };
const NCAAF = { sports: ["ncaaf" as const], leagues: [] };

let seq = 0;
const pick = (
  userId: string,
  status: PickEmPrizePick["status"],
  options: { made?: string; starts?: string; resolved?: string | null; slug?: string; key?: string } = {},
): PickEmPrizePick => {
  seq += 1;
  return {
    id: `p${String(seq).padStart(4, "0")}`,
    userId,
    status,
    createdAt: options.made ?? `2026-11-07T14:${String(seq % 60).padStart(2, "0")}:00Z`,
    startsAt: options.starts ?? "2026-11-07T20:00:00Z",
    resolvedAt: options.resolved === undefined ? (status === "pending" ? null : "2026-11-07T23:30:00Z") : options.resolved,
    sportSlug: options.slug ?? "ncaaf",
    sportKey: options.key ?? "americanfootball_ncaaf",
  };
};

const saturday = () => pickemPrizePeriodForDate(SATURDAYS, "2026-11-07", TZ)!;

describe("which periods count (Q2 / Q3)", () => {
  it("a Saturday prize created that Saturday afternoon pays that Saturday", () => {
    const periods = pickemPrizeCandidatePeriods(SATURDAYS, "2026-11-07T20:00:00Z", Date.parse("2026-11-08T01:00:00Z"), TZ);
    expect(periods.map((p) => p.startDate)).toEqual(["2026-11-07"]);
  });

  it("a Saturday that ended before the prize existed doesn't", () => {
    expect(pickemPrizeCandidatePeriods(SATURDAYS, "2026-11-08T15:00:00Z", Date.parse("2026-11-08T16:00:00Z"), TZ)).toEqual([]);
  });

  it("a weekly prize created on Wednesday pays that whole Monday–Sunday week", () => {
    const periods = pickemPrizeCandidatePeriods({ kind: "week" }, "2026-11-11T15:00:00Z", Date.parse("2026-11-11T16:00:00Z"), TZ);
    expect(periods.map((p) => [p.startDate, p.endDate])).toEqual([["2026-11-09", "2026-11-15"]]);
  });

  it("is looked at for 5 days after it ends, never before it begins", () => {
    const created = "2026-11-01T12:00:00Z";
    expect(pickemPrizeCandidatePeriods(SATURDAYS, created, Date.parse("2026-11-12T12:00:00Z"), TZ).map((p) => p.startDate)).toEqual([
      "2026-11-07",
    ]);
    expect(pickemPrizeCandidatePeriods(SATURDAYS, created, Date.parse("2026-11-13T12:00:00Z"), TZ)).toEqual([]);
    expect(
      pickemPrizeCandidatePeriods({ kind: "day", date: "2026-11-14" }, created, Date.parse("2026-11-13T12:00:00Z"), TZ),
    ).toEqual([]);
  });

  it("an unreadable created_at pays nothing", () => {
    expect(pickemPrizeCandidatePeriods(SATURDAYS, "nope", Date.parse("2026-11-07T20:00:00Z"), TZ)).toEqual([]);
  });

  it("counts only picks in the prize's games whose game starts in the period, never cancelled ones", () => {
    const counted = picksForPickEmPrizePeriod(
      [
        pick("a", "won"),
        pick("a", "canceled"),
        pick("a", "won", { slug: "soccer", key: "soccer_epl" }),
        pick("a", "won", { starts: "2026-11-08T05:00:00Z" }),
        pick("a", "won", { starts: "2026-11-07T04:59:00Z" }),
        pick("a", "pending", { made: "2026-11-01T12:00:00Z" }),
      ],
      NCAAF,
      saturday(),
    );
    expect(counted.map((p) => p.status)).toEqual(["won", "pending"]);
  });
});

describe("when a period pays", () => {
  const period = { endMsExclusive: SAT_END_MS };
  it("the final pass waits for the last pending pick, or the grace", () => {
    expect(isPickEmPrizeFinalPassReady({ period, periodPicks: [pick("a", "won")], nowMs: SAT_END_MS - 1 })).toBe(false);
    expect(isPickEmPrizeFinalPassReady({ period, periodPicks: [pick("a", "pending")], nowMs: SAT_END_MS + 60_000 })).toBe(false);
    expect(isPickEmPrizeFinalPassReady({ period, periodPicks: [pick("a", "won")], nowMs: SAT_END_MS + 60_000 })).toBe(true);
    expect(
      isPickEmPrizeFinalPassReady({ period, periodPicks: [pick("a", "pending")], nowMs: SAT_END_MS + PICKEM_PRIZE_SETTLE_GRACE_MS }),
    ).toBe(true);
  });

  it("reads a period only when something can have changed", () => {
    const open = SAT_END_MS - 3_600_000;
    expect(isPickEmPrizePeriodDue({ period, recentlyGraded: false, nowMs: open })).toBe(false);
    expect(isPickEmPrizePeriodDue({ period, recentlyGraded: true, nowMs: open })).toBe(true);
    expect(isPickEmPrizePeriodDue({ period, recentlyGraded: false, nowMs: SAT_END_MS + 60_000 })).toBe(true); // just ended
    expect(isPickEmPrizePeriodDue({ period, recentlyGraded: false, nowMs: SAT_END_MS + 11 * 60_000 })).toBe(false);
    expect(isPickEmPrizePeriodDue({ period, recentlyGraded: false, nowMs: SAT_END_MS + 20 * 60_000 })).toBe(true); // retry minute
    expect(isPickEmPrizePeriodDue({ period, recentlyGraded: false, nowMs: SAT_END_MS + PICKEM_PRIZE_SETTLE_GRACE_MS + 60_000 })).toBe(true);
  });
});

describe('"X out of N"', () => {
  it("counts only each player's FIRST N picks, by when they were made", () => {
    const picks = [
      pick("a", "lost", { made: "2026-11-07T14:00:00Z" }),
      pick("a", "lost", { made: "2026-11-07T14:01:00Z" }),
      pick("a", "won", { made: "2026-11-07T14:02:00Z" }),
      pick("a", "won", { made: "2026-11-07T14:03:00Z" }), // a 4th pick past N = 3 slipped through the limit: never helps
    ];
    expect(planPickEmTierAwards({ periodPicks: picks, limit: 3, lowestTierCorrect: 2, alreadyWon: new Set(), finalPass: true })).toEqual([]);
    expect(planPickEmTierAwards({ periodPicks: picks, limit: 3, lowestTierCorrect: 1, alreadyWon: new Set(), finalPass: false })).toEqual([
      { userId: "a", correct: 1 },
    ]);
  });

  it("pays once all N are graded, earliest finisher first; the rest at the final pass", () => {
    const picks = [
      pick("late", "won", { resolved: "2026-11-07T23:50:00Z" }),
      pick("late", "won", { resolved: "2026-11-07T23:50:00Z" }),
      pick("early", "won", { resolved: "2026-11-07T21:00:00Z" }),
      pick("early", "won", { resolved: "2026-11-07T21:00:00Z" }),
      pick("short", "won", { resolved: "2026-11-07T23:55:00Z" }), // only 1 of 2 picks made
      pick("waiting", "won"),
      pick("waiting", "pending"),
    ];
    const base = { periodPicks: picks, limit: 2, lowestTierCorrect: 1, alreadyWon: new Set<string>() };
    expect(planPickEmTierAwards({ ...base, finalPass: false }).map((a) => a.userId)).toEqual(["early", "late"]);
    expect(planPickEmTierAwards({ ...base, finalPass: true }).map((a) => a.userId)).toEqual(["early", "late", "short", "waiting"]);
    expect(planPickEmTierAwards({ ...base, finalPass: true, alreadyWon: new Set(["early"]) }).map((a) => a.userId)).not.toContain("early");
  });
});

describe('"Get N right"', () => {
  it("pays in the order players reached N, up to the prizes left", () => {
    const picks = [
      pick("b", "won", { resolved: "2026-11-07T22:00:00Z" }),
      pick("b", "won", { resolved: "2026-11-07T22:30:00Z" }),
      pick("a", "won", { resolved: "2026-11-07T21:00:00Z" }),
      pick("a", "won", { resolved: "2026-11-07T22:10:00Z" }),
      pick("c", "won"),
      pick("c", "lost"),
      pick("d", "won", { resolved: "2026-11-07T20:00:00Z" }),
      pick("d", "won", { resolved: "2026-11-07T20:05:00Z" }),
    ];
    expect(planPickEmTargetAwards({ periodPicks: picks, target: 2, prizesLeft: 2, alreadyWon: new Set() })).toEqual([
      { userId: "d", correct: 2 },
      { userId: "a", correct: 2 },
    ]);
    expect(planPickEmTargetAwards({ periodPicks: picks, target: 2, prizesLeft: 5, alreadyWon: new Set(["d"]) }).map((a) => a.userId)).toEqual([
      "a",
      "b",
    ]);
    expect(planPickEmTargetAwards({ periodPicks: picks, target: 2, prizesLeft: 0, alreadyWon: new Set() })).toEqual([]);
  });
});

describe('"Most picks right"', () => {
  it("applies the minimum players, the minimum picks, and needs more than 0 right", () => {
    const picks = [pick("a", "won"), pick("a", "won"), pick("b", "won"), pick("b", "won"), pick("b", "won"), pick("c", "lost")];
    expect(planPickEmMostRight({ periodPicks: picks, minPicks: 1, minPlayers: 4 })).toEqual({ kind: "below_minimum", participants: 3 });
    expect(planPickEmMostRight({ periodPicks: picks, minPicks: 1, minPlayers: 3 })).toEqual({
      kind: "winner",
      participants: 3,
      userId: "b",
      correct: 3,
    });
    expect(planPickEmMostRight({ periodPicks: picks, minPicks: 4, minPlayers: null })).toEqual({ kind: "no_winner", participants: 3 });
    expect(planPickEmMostRight({ periodPicks: [pick("c", "lost")], minPicks: 1, minPlayers: null })).toEqual({
      kind: "no_winner",
      participants: 1,
    });
    expect(planPickEmMostRight({ periodPicks: [pick("x", "won"), pick("y", "won")], minPicks: 1, minPlayers: null })).toEqual({
      kind: "tie",
      participants: 2,
      leaders: ["x", "y"],
      correct: 1,
    });
  });

  it("breaks ties: closest, then the lower guess, guessers first, then the earliest guess, then id", () => {
    const guess = (userId: string, predictedTotal: number, savedAt = "2026-11-07T15:00:00Z") => ({ userId, predictedTotal, savedAt });
    expect(rankPickEmPrizeTiebreak(["a", "b", "c"], [guess("a", 50), guess("b", 44), guess("c", 47)], 46)).toEqual(["c", "b", "a"]);
    expect(rankPickEmPrizeTiebreak(["a", "b"], [guess("a", 50), guess("b", 42)], 46)).toEqual(["b", "a"]);
    expect(rankPickEmPrizeTiebreak(["a", "b", "z"], [guess("z", 90)], 46)).toEqual(["z", "a", "b"]);
    expect(
      rankPickEmPrizeTiebreak(["a", "b"], [guess("a", 46, "2026-11-07T16:00:00Z"), guess("b", 46, "2026-11-07T15:00:00Z")], 46),
    ).toEqual(["b", "a"]);
    expect(rankPickEmPrizeTiebreak(["b", "a"], [guess("a", 46), guess("b", 46)], 46)).toEqual(["a", "b"]);
    expect(
      rankPickEmPrizeTiebreak(["a", "b"], [guess("a", 10, "2026-11-07T16:00:00Z"), guess("b", 99, "2026-11-07T15:00:00Z")], null),
    ).toEqual(["b", "a"]);
  });
});

// ── The sweep ─────────────────────────────────────────────────────────────────────────────────

const prize = (overrides: Row = {}): Row => ({
  id: "c-target",
  name: "College Saturday",
  rewardDefinitionId: "pickem_challenge",
  isActive: true,
  venueIds: ["venue-a"],
  createdAt: "2026-11-07T20:00:00Z",
  winCondition: "points_threshold",
  pointsRequiredToWin: 2,
  winnerQuota: 2,
  minPlayers: null,
  pickemScope: NCAAF,
  pickemWindow: SATURDAYS,
  pickemPickLimit: null,
  pickemTiers: null,
  pickemMinPicks: null,
  ...overrides,
});

const pickRow = (p: PickEmPrizePick, venueId = "venue-a"): Row => ({
  id: p.id,
  user_id: p.userId,
  venue_id: venueId,
  status: p.status,
  created_at: p.createdAt,
  starts_at: p.startsAt,
  resolved_at: p.resolvedAt,
  sport_slug: p.sportSlug,
  sport_key: p.sportKey,
});

const readsOf = (table: string) => db.reads.filter((name) => name === table).length;

beforeEach(() => {
  db.tables = { pickem_picks: [], pickem_prize_settlements: [], challenge_cycle_winners: [] };
  db.reads = [];
  db.upserts = [];
  engine.prizes = [];
  engine.cycleAwards = [];
  engine.tierAwards = [];
  engine.guesses = [];
  engine.gameTotal = null;
  engine.ended = [];
});

describe("settlePickEmPrizes", () => {
  it("does one read and stops when no bar has a Pick 'Em Prize", async () => {
    const report = await settlePickEmPrizes(new Date("2026-11-07T23:31:00Z"));
    expect(report).toEqual({ prizes: 0, periodsChecked: 0, awarded: 0, settled: 0, ended: 0, errors: [] });
    expect(db.reads).toEqual([]);
  });

  it("ignores another kind of prize", async () => {
    engine.prizes = [prize({ rewardDefinitionId: "nfl_pickem_challenge" })];
    expect((await settlePickEmPrizes(new Date("2026-11-07T23:31:00Z"))).prizes).toBe(0);
  });

  it("reads an open period's picks only when one of them was just graded", async () => {
    engine.prizes = [prize()];
    db.tables.pickem_picks = [pickRow(pick("a", "won", { resolved: "2026-11-07T20:00:00Z" }))];
    const report = await settlePickEmPrizes(new Date("2026-11-07T23:31:00Z"));
    expect(report.periodsChecked).toBe(0);
    expect(readsOf("pickem_picks")).toBe(1); // the "graded in the last 5 minutes" read only
  });

  it('"Get N right" pays as players reach N, up to its quantity, and settles after the period', async () => {
    engine.prizes = [prize()];
    db.tables.pickem_picks = [
      pick("a", "won", { resolved: "2026-11-07T23:00:00Z" }),
      pick("a", "won", { resolved: "2026-11-07T23:29:00Z" }),
      pick("b", "won", { resolved: "2026-11-07T23:10:00Z" }),
      pick("b", "won", { resolved: "2026-11-07T23:20:00Z" }),
      pick("c", "won", { resolved: "2026-11-07T23:25:00Z" }),
      pick("c", "won", { resolved: "2026-11-07T23:30:00Z" }),
      pick("d", "won", { slug: "soccer", key: "soccer_epl", resolved: "2026-11-07T23:30:00Z" }),
    ].map((p) => pickRow(p));
    const report = await settlePickEmPrizes(new Date("2026-11-07T23:31:00Z"));
    expect(engine.cycleAwards.map((a) => [a.userId, a.cycleStart, a.quota])).toEqual([
      ["b", SAT_START, 2],
      ["a", SAT_START, 2],
    ]);
    expect(report).toMatchObject({ periodsChecked: 1, awarded: 2, settled: 0 });
    expect(db.upserts).toEqual([]);

    // After midnight (just ended, nothing pending): the final pass records the period.
    db.tables.challenge_cycle_winners = engine.cycleAwards.map((a) => ({
      challenge_id: a.campaignId,
      cycle_start: a.cycleStart,
      winner_user_id: a.userId,
    }));
    const after = await settlePickEmPrizes(new Date(SAT_END_MS + 60_000));
    expect(after).toMatchObject({ awarded: 0, settled: 1 });
    expect(db.upserts[0]).toEqual({
      table: "pickem_prize_settlements",
      row: { challenge_id: "c-target", period_start: SAT_START, venue_id: "venue-a", outcome: "awarded", participant_count: 3, winner_count: 2 },
    });

    // Settled: never read again.
    db.reads = [];
    await settlePickEmPrizes(new Date(SAT_END_MS + 2 * 60_000));
    expect(readsOf("pickem_picks")).toBe(0);
  });

  it('"X out of N" pays finished players during the period and the rest at the final pass', async () => {
    engine.prizes = [
      prize({
        id: "c-tiers",
        pickemPickLimit: 2,
        pickemTiers: [{ place: 1, correct: 1, quantity: 5, prizeKind: "gift_card", prizeGiftCertificateAmount: 10 }],
      }),
    ];
    db.tables.pickem_picks = [
      pick("done", "won", { resolved: "2026-11-07T23:29:00Z" }),
      pick("done", "lost", { resolved: "2026-11-07T23:29:00Z" }),
      pick("half", "won", { resolved: "2026-11-07T23:29:00Z" }),
    ].map((p) => pickRow(p));
    await settlePickEmPrizes(new Date("2026-11-07T23:31:00Z"));
    expect(engine.tierAwards).toEqual([{ campaignId: "c-tiers", userId: "done", periodStart: SAT_START, correct: 1 }]);

    db.tables.challenge_cycle_winners = [{ challenge_id: "c-tiers", cycle_start: "2026-11-07T05:00:01.000Z", winner_user_id: "done" }];
    const after = await settlePickEmPrizes(new Date(SAT_END_MS + 60_000));
    expect(engine.tierAwards.map((a) => a.userId)).toEqual(["done", "half"]);
    expect(after.settled).toBe(1);
    expect(db.upserts[0].row).toMatchObject({ outcome: "awarded", winner_count: 2, participant_count: 2 });
  });

  it('"Most picks right" waits for the tiebreaker game, then pays the closest guess', async () => {
    engine.prizes = [prize({ id: "c-most", winCondition: "game_winner", winnerQuota: 1, pickemMinPicks: 1 })];
    db.tables.pickem_picks = [pick("x", "won"), pick("y", "won"), pick("z", "lost")].map((p) => pickRow(p));
    engine.guesses = [
      { userId: "x", predictedTotal: 60, savedAt: "2026-11-07T15:00:00Z", sportKey: "americanfootball_ncaaf", gameId: "g1", gameStartsAt: "2026-11-08T03:30:00Z" },
      { userId: "y", predictedTotal: 48, savedAt: "2026-11-07T16:00:00Z", sportKey: "americanfootball_ncaaf", gameId: "g1", gameStartsAt: "2026-11-08T03:30:00Z" },
    ];

    // Not final yet, inside the grace: nobody is paid and the period stays open.
    await settlePickEmPrizes(new Date(SAT_END_MS + 60_000));
    expect(engine.cycleAwards).toEqual([]);
    expect(db.upserts).toEqual([]);

    engine.gameTotal = 51;
    await settlePickEmPrizes(new Date(SAT_END_MS + 20 * 60_000));
    expect(engine.cycleAwards).toEqual([{ campaignId: "c-most", userId: "y", cycleStart: SAT_START, points: 1, quota: 1 }]);
    expect(db.upserts[0].row).toMatchObject({ outcome: "awarded", winner_count: 1, participant_count: 3 });
  });

  it('"Most picks right" past the grace with no final score: the earliest guess wins', async () => {
    engine.prizes = [prize({ id: "c-most", winCondition: "game_winner", winnerQuota: 1, pickemMinPicks: 1 })];
    db.tables.pickem_picks = [pick("x", "won"), pick("y", "won")].map((p) => pickRow(p));
    engine.guesses = [
      { userId: "x", predictedTotal: 60, savedAt: "2026-11-07T15:00:00Z", sportKey: "k", gameId: "g1", gameStartsAt: "2026-11-08T03:30:00Z" },
      { userId: "y", predictedTotal: 48, savedAt: "2026-11-07T16:00:00Z", sportKey: "k", gameId: "g1", gameStartsAt: "2026-11-08T03:30:00Z" },
    ];
    await settlePickEmPrizes(new Date(SAT_END_MS + PICKEM_PRIZE_SETTLE_GRACE_MS + 60_000));
    expect(engine.cycleAwards.map((a) => a.userId)).toEqual(["x"]);
  });

  it('"Most picks right" below the minimum players pays nobody and records why', async () => {
    engine.prizes = [prize({ id: "c-most", winCondition: "game_winner", winnerQuota: 1, pickemMinPicks: 1, minPlayers: 3 })];
    db.tables.pickem_picks = [pick("x", "won"), pick("y", "lost")].map((p) => pickRow(p));
    const report = await settlePickEmPrizes(new Date(SAT_END_MS + 60_000));
    expect(engine.cycleAwards).toEqual([]);
    expect(report.settled).toBe(1);
    expect(db.upserts[0].row).toMatchObject({ outcome: "below_minimum", winner_count: 0, participant_count: 2 });
  });

  it("an ended period with a pick still pending waits (until the grace)", async () => {
    engine.prizes = [prize({ id: "c-most", winCondition: "game_winner", winnerQuota: 1, pickemMinPicks: 1 })];
    db.tables.pickem_picks = [pick("x", "won"), pick("y", "pending")].map((p) => pickRow(p));
    await settlePickEmPrizes(new Date(SAT_END_MS + 60_000));
    expect(db.upserts).toEqual([]);
    await settlePickEmPrizes(new Date(SAT_END_MS + PICKEM_PRIZE_SETTLE_GRACE_MS + 60_000));
    expect(engine.cycleAwards.map((a) => a.userId)).toEqual(["x"]);
    expect(db.upserts).toHaveLength(1);
  });

  it("ends a one-day prize on the run after its only period settles (Phase 7.2)", async () => {
    engine.prizes = [prize({ pickemWindow: { kind: "day", date: "2026-11-07" } })];
    db.tables.pickem_picks = [pick("a", "won"), pick("a", "won")].map((p) => pickRow(p));
    const settledRun = await settlePickEmPrizes(new Date(SAT_END_MS + 60_000));
    expect(settledRun).toMatchObject({ settled: 1, ended: 0 });
    expect(engine.ended).toEqual([]);

    const next = await settlePickEmPrizes(new Date(SAT_END_MS + 2 * 60_000));
    expect(next).toMatchObject({ ended: 1, errors: [] });
    expect(engine.ended).toEqual(["c-target"]);
  });

  it("ends a date-range prize only once its whole range has settled", async () => {
    engine.prizes = [prize({ pickemWindow: { kind: "range", from: "2026-11-07", to: "2026-11-08" } })];
    db.tables.pickem_picks = [pickRow(pick("a", "won"))];
    // Saturday is over but the range runs through Sunday: nothing is settled or ended.
    await settlePickEmPrizes(new Date(SAT_END_MS + 60_000));
    await settlePickEmPrizes(new Date(SAT_END_MS + 2 * 60_000));
    expect(engine.ended).toEqual([]);
  });

  it("never ends a repeating prize when one of its periods settles", async () => {
    engine.prizes = [prize()];
    db.tables.pickem_picks = [pick("a", "won"), pick("a", "won")].map((p) => pickRow(p));
    await settlePickEmPrizes(new Date(SAT_END_MS + 60_000));
    const next = await settlePickEmPrizes(new Date(SAT_END_MS + 2 * 60_000));
    expect(next.ended).toBe(0);
    expect(engine.ended).toEqual([]);
  });

  it("skips a prize for more than one venue and reports it", async () => {
    engine.prizes = [prize({ venueIds: ["venue-a", "venue-b"] })];
    const report = await settlePickEmPrizes(new Date("2026-11-07T23:31:00Z"));
    expect(report.errors).toEqual(["prize is not for exactly one venue"]);
    expect(engine.cycleAwards).toEqual([]);
  });

  it("pages the winners ledger by (cycle_start, id) and keys a deleted player by row id (7.5.5, F18)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("lib/pickemPrizeAwards.ts", "utf8");
    const start = source.indexOf('.from("challenge_cycle_winners")');
    const block = source.slice(start, start + 900);
    expect(block).toContain('.order("cycle_start", { ascending: true })');
    expect(block.indexOf('.order("id"')).toBeGreaterThan(block.indexOf('.order("cycle_start"'));
    expect(source).toContain("`deleted:${row.id}`");
    expect(source).not.toContain("deleted:${row.cycle_start}");
  });
});
