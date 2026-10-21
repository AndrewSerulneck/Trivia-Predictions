import { beforeEach, describe, expect, it, vi } from "vitest";

// Squares + Brackets plan Phase 9a: settleBracketPrizes (lib/bracketPrizeAwards.ts) — once a
// tournament's championship is graded, every bracket prize that pays one of its brackets settles that
// bracket's cycle at its venue through award_ranked_cycle_places (stubbed here; the RPC is the weekly
// places one, proven by its own SQL tests). The entries and venues reads run against small tables.

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  entries: [] as Row[],
  venues: [] as Row[],
  reads: [] as string[],
}));

class FakeQuery {
  private filters: Array<(row: Row) => boolean> = [];
  private max = Infinity;
  constructor(private table: string) {}
  select() { return this; }
  order() { return this; }
  limit(n: number) { this.max = n; return this; }
  eq(col: string, value: unknown) { this.filters.push((row) => row[col] === value); return this; }
  gt(col: string, value: number) { this.filters.push((row) => Number(row[col]) > value); return this; }
  in(col: string, values: unknown[]) { this.filters.push((row) => values.includes(row[col])); return this; }
  then<T>(resolve: (value: { data: unknown; error: null }) => T): Promise<T> {
    db.reads.push(this.table);
    const rows = this.table === "venues" ? db.venues : db.entries;
    return Promise.resolve(resolve({ data: rows.filter((row) => this.filters.every((f) => f(row))).slice(0, this.max), error: null }));
  }
}

const engine = vi.hoisted(() => ({ prizes: [] as Row[], awards: [] as Row[], settled: new Set<string>() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (table: string) => new FakeQuery(table) } }));
vi.mock("@/lib/challengeCampaigns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/challengeCampaigns")>();
  return {
    ...actual,
    listActiveBracketPrizeCampaigns: vi.fn(async () => engine.prizes),
    awardRankedCyclePlaces: vi.fn(
      async (params: { campaign: Row; venueId: string; cycleStart: Date; places: Array<{ place: number; userId: string; totalPoints: number }>; participantCount: number }) => {
        const key = `${params.campaign.id}|${params.cycleStart.toISOString()}`;
        if (engine.settled.has(key)) return { status: "already_resolved", winnersAwarded: 0 };
        engine.settled.add(key);
        const minPlayers = params.campaign.minPlayers as number | null;
        const status =
          params.places.length > 0 ? "awarded" : minPlayers && params.participantCount < minPlayers ? "below_minimum" : "no_scorers";
        engine.awards.push({
          campaignId: params.campaign.id,
          venueId: params.venueId,
          cycleStart: params.cycleStart.toISOString(),
          places: params.places.map((p) => [p.place, p.userId, p.totalPoints]),
          participants: params.participantCount,
          status,
        });
        return { status, winnersAwarded: params.places.length };
      },
    ),
  };
});

import {
  bracketPrizeCoversBracket,
  bracketPrizePlaces,
  bracketRealLockMs,
  settleBracketPrizes,
} from "@/lib/bracketPrizeAwards";
import { bracketPrizeCycleStart } from "@/lib/bracketPrizes";
import type { BracketTournamentRecord } from "@/lib/bracketsStore";
import type { ChallengeCampaign } from "@/types";

const DONE = Array.from({ length: 63 }, (_, slot) => slot); // any non-null seats: the championship is decided
const OPEN = Array.from({ length: 63 }, () => null);
const NOW = new Date("2027-04-06T04:00:00Z");

const tournament = (overrides: Partial<BracketTournamentRecord> = {}): BracketTournamentRecord =>
  ({
    id: "t-men",
    gender: "men",
    season: 2026,
    purpose: "live",
    clockOffsetSeconds: 0,
    mainLockAt: "2027-03-18T16:15:00Z",
    secondLockAt: "2027-03-26T23:00:00Z",
    createdAt: "2027-03-14T22:10:00Z",
    completedAt: "2027-04-06T03:30:00Z",
    prizesSettledAt: null,
    winnerSeats: DONE,
    championshipTotal: 140,
    ...overrides,
  }) as BracketTournamentRecord;

const prize = (overrides: Partial<ChallengeCampaign> = {}): Row =>
  ({
    id: "prize-v1",
    isActive: true,
    createdAt: "2027-03-15T12:00:00Z",
    venueIds: ["v1"],
    rewardDefinitionId: "bracket_challenge",
    bracketKeys: ["men_main", "men_second"],
    recurringType: "none",
    scheduleType: "single_day",
    endDate: "2027-04-06",
    minPlayers: null,
    placePrizes: [
      { place: 1, prizeKind: "gift_card", prizeGiftCertificateAmount: 30 },
      { place: 2, prizeKind: "gift_card", prizeGiftCertificateAmount: 20 },
    ],
    ...overrides,
  }) as Row;

let entryId = 0;
const entry = (overrides: Row = {}): Row => ({
  id: `e-${++entryId}`,
  tournament_id: "t-men",
  kind: "main",
  venue_id: "v1",
  user_id: "ann",
  score: 100,
  tiebreaker: 140,
  pick_count: 63,
  submitted_at: "2027-03-16T12:00:00Z",
  ...overrides,
});

beforeEach(() => {
  db.entries = [];
  db.venues = [];
  db.reads = [];
  engine.prizes = [];
  engine.awards = [];
  engine.settled = new Set();
});

describe("which prizes pay a bracket", () => {
  const lock = Date.parse("2027-03-18T16:15:00Z");
  it("only an active, one-venue bracket prize for that bracket, set up before the lock and not closed before it", () => {
    const ok = prize() as unknown as ChallengeCampaign;
    expect(bracketPrizeCoversBracket(ok, "men_main", lock)).toBe(true);
    expect(bracketPrizeCoversBracket(ok, "women_main", lock)).toBe(false);
    expect(bracketPrizeCoversBracket(prize({ createdAt: "2027-03-18T16:15:00Z" }) as unknown as ChallengeCampaign, "men_main", lock)).toBe(false);
    expect(bracketPrizeCoversBracket(prize({ isActive: false }) as unknown as ChallengeCampaign, "men_main", lock)).toBe(false);
    expect(bracketPrizeCoversBracket(prize({ venueIds: ["v1", "v2"] }) as unknown as ChallengeCampaign, "men_main", lock)).toBe(false);
    expect(bracketPrizeCoversBracket(prize({ rewardDefinitionId: "live_trivia_challenge" }) as unknown as ChallengeCampaign, "men_main", lock)).toBe(false);
    // Last season's prize (closed Apr 6, 2027) never pays the 2028 bracket.
    expect(bracketPrizeCoversBracket(ok, "men_main", Date.parse("2028-03-16T16:00:00Z"))).toBe(false);
    expect(bracketPrizeCoversBracket(ok, "men_main", null)).toBe(false);
  });

  it("compares a rehearsal's lock in real time", () => {
    const rehearsal = tournament({ purpose: "rehearsal", clockOffsetSeconds: 3600, mainLockAt: "2026-03-19T16:15:00Z" });
    expect(bracketRealLockMs(rehearsal, "main")).toBe(Date.parse("2026-03-19T17:15:00Z"));
    expect(bracketRealLockMs(tournament({ secondLockAt: null }), "second")).toBeNull();
  });
});

describe("who places", () => {
  it("ranks by points, then the tiebreaker's distance, then the earliest save — scorers only", () => {
    const rows = [
      entry({ id: "a", user_id: "ann", score: 900, tiebreaker: 150 }),
      entry({ id: "b", user_id: "bob", score: 900, tiebreaker: 141 }),
      entry({ id: "c", user_id: "cat", score: 0 }),
      entry({ id: "d", user_id: "dan", score: 500 }),
    ] as Array<{ id: string; user_id: string; score: number; tiebreaker: number | null; submitted_at: string }>;
    const { places, participantCount } = bracketPrizePlaces(rows, 140, 3, null);
    expect(participantCount).toBe(4);
    expect(places.map((p) => [p.place, p.userId, p.totalPoints])).toEqual([
      [1, "bob", 900],
      [2, "ann", 900],
      [3, "dan", 500],
    ]);
    expect(bracketPrizePlaces(rows, 140, 3, 5).places).toEqual([]); // below the partner's minimum
    expect(bracketPrizePlaces(rows.slice(2, 3), 140, 3, null).places).toEqual([]); // nobody scored
  });
});

describe("settleBracketPrizes", () => {
  it("does nothing until the championship is decided", async () => {
    engine.prizes = [prize()];
    expect(await settleBracketPrizes(tournament(), OPEN, null, NOW)).toEqual({ ok: true, ready: false });
    expect(db.reads).toEqual([]);
  });

  it("settles each bracket the prize pays at its venue, under that bracket's own cycle key", async () => {
    engine.prizes = [prize(), prize({ id: "prize-late", createdAt: "2027-03-20T12:00:00Z" })];
    db.entries = [
      entry({ user_id: "ann", score: 1200 }),
      entry({ user_id: "bob", score: 800 }),
      entry({ user_id: "cat", score: 700 }),
      entry({ user_id: "zed", venue_id: "v2", score: 1900 }), // another venue's bracket
      entry({ user_id: "sam", kind: "second", score: 320 }),
    ];
    const result = await settleBracketPrizes(tournament(), DONE, 140, NOW);
    expect(result).toMatchObject({ ok: true, ready: true });
    const created = tournament().createdAt;
    expect(engine.awards).toEqual([
      // The late prize (set up after the men's lock) pays the second chance only: it locked later.
      { campaignId: "prize-v1", venueId: "v1", cycleStart: bracketPrizeCycleStart(created, "men_main")?.toISOString(), places: [[1, "ann", 1200], [2, "bob", 800]], participants: 3, status: "awarded" },
      { campaignId: "prize-v1", venueId: "v1", cycleStart: bracketPrizeCycleStart(created, "men_second")?.toISOString(), places: [[1, "sam", 320]], participants: 1, status: "awarded" },
      { campaignId: "prize-late", venueId: "v1", cycleStart: bracketPrizeCycleStart(created, "men_second")?.toISOString(), places: [[1, "sam", 320]], participants: 1, status: "awarded" },
    ]);
    // One entries read per (venue, bracket), shared by both prizes.
    expect(db.reads.filter((table) => table === "bracket_entries")).toHaveLength(2);
  });

  it("is safe to repeat: a settled bracket answers already resolved", async () => {
    engine.prizes = [prize({ bracketKeys: ["men_main"] })];
    db.entries = [entry()];
    await settleBracketPrizes(tournament(), DONE, 140, NOW);
    const again = await settleBracketPrizes(tournament(), DONE, 140, NOW);
    expect(again).toMatchObject({ ok: true, ready: true, settlements: [{ status: "already_resolved" }] });
    expect(engine.awards).toHaveLength(1);
  });

  it("a rehearsal pays only at hidden venues", async () => {
    engine.prizes = [prize({ id: "public", bracketKeys: ["men_main"] }), prize({ id: "hidden", venueIds: ["vh"], bracketKeys: ["men_main"] })];
    db.venues = [{ id: "vh", hidden: true }];
    db.entries = [entry({ venue_id: "vh", tournament_id: "t-r" })];
    await settleBracketPrizes(
      tournament({ id: "t-r", purpose: "rehearsal", clockOffsetSeconds: 0, mainLockAt: "2027-03-18T16:15:00Z" }),
      DONE,
      140,
      NOW,
    );
    expect(engine.awards.map((award) => award.campaignId)).toEqual(["hidden"]);
  });

  it("reports a failure instead of throwing (the sync retries)", async () => {
    engine.prizes = [prize()];
    const { listActiveBracketPrizeCampaigns } = await import("@/lib/challengeCampaigns");
    vi.mocked(listActiveBracketPrizeCampaigns).mockRejectedValueOnce(new Error("column bracket_keys does not exist"));
    expect(await settleBracketPrizes(tournament(), DONE, 140, NOW)).toEqual({ ok: false, error: "column bracket_keys does not exist" });
  });
});
