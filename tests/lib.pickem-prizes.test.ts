import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Pick 'Em plan Phase 4a (docs/pickem-college-football-and-prize-plan.md): the Pick 'Em Prize's data
// and rules. The pure rules (scope, window, periods, the cycle key, validation, the overlap rule D6,
// wording), the server's create path (createReward with the engine stubbed), the pick limit (D5)
// against a stand-in count query, and that the 10-points-a-pick accrual never feeds one.

const store = vi.hoisted(() => ({
  timezone: "America/Chicago",
  createChallengeCampaign: vi.fn(async (input: Record<string, unknown>) => ({ id: "prize-new", ...input })),
  listActivePickEmPrizeCampaigns: vi.fn(async (): Promise<unknown[]> => []),
  pickCount: 0 as number,
  countError: null as { message: string } | null,
  countQueries: [] as Array<Array<[string, ...unknown[]]>>,
  // The save lease (Phase 7.5.3): venue → holder, as claim_pickem_prize_save / release_pickem_prize_save keep it.
  leases: new Map<string, { token: string; expiresAtMs: number }>(),
  leaseError: null as { code?: string; message: string } | null,
  rpcCalls: [] as Array<[string, Record<string, unknown>]>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/challengeCampaigns", () => ({
  createChallengeCampaign: store.createChallengeCampaign,
  listActivePickEmPrizeCampaigns: store.listActivePickEmPrizeCampaigns,
  computeUpcomingCycleStart: () => null,
  loadSquaresPrizeMoments: async () => new Map(),
  loadBracketPrizeKeys: async () => new Map(),
  loadPickEmPrizeTerms: async () => new Map(),
}));
vi.mock("@/lib/squaresStore", () => ({ getCurrentSquaresEvent: async () => ({ ok: true, value: null }) }));
vi.mock("@/lib/bracketsStore", () => ({ listCurrentBracketTournaments: async () => ({ ok: true, value: [] }) }));
vi.mock("@/lib/timezone", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/timezone")>()),
  getVenueTimezone: vi.fn(async () => store.timezone),
}));
vi.mock("@/lib/supabaseAdmin", () => {
  // Only the pick limit's count query: from("pickem_picks").select(…, { count, head }).eq…or(…).
  const from = () => {
    const calls: Array<[string, ...unknown[]]> = [];
    store.countQueries.push(calls);
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "neq", "gte", "lt", "or"]) {
      builder[method] = (...args: unknown[]) => {
        calls.push([method, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(store.countError ? { count: null, error: store.countError } : { count: store.pickCount, error: null }).then(resolve);
    return builder;
  };
  // The two lease RPCs, with the migration's rules: claim wins on no row, an expired row or its own
  // token; release deletes only its own token.
  const rpc = async (name: string, args: Record<string, unknown>) => {
    store.rpcCalls.push([name, args]);
    if (store.leaseError) return { data: null, error: store.leaseError };
    const venueId = String(args.p_venue_id);
    const token = String(args.p_token);
    const held = store.leases.get(venueId);
    if (name === "claim_pickem_prize_save") {
      if (held && held.expiresAtMs > Date.now() && held.token !== token) return { data: false, error: null };
      store.leases.set(venueId, { token, expiresAtMs: Date.now() + Number(args.p_ttl_seconds) * 1000 });
      return { data: true, error: null };
    }
    if (name === "release_pickem_prize_save") {
      if (held?.token !== token) return { data: false, error: null };
      store.leases.delete(venueId);
      return { data: true, error: null };
    }
    throw new Error(`unexpected rpc ${name}`);
  };
  return { supabaseAdmin: { from, rpc } };
});

import {
  PICKEM_PRIZE_DEFINITION_ID,
  PICKEM_PRIZE_MOST_RIGHT_SCORES_MESSAGE,
  PICKEM_PRIZE_PICK_LIMIT_MESSAGE,
  PICKEM_PRIZE_RANGE_LENGTH_MESSAGE,
  PICKEM_PRIZE_RANGE_ORDER_MESSAGE,
  PICKEM_PRIZE_SCOPE_MESSAGE,
  PICKEM_PRIZE_TERMS_MISMATCH_MESSAGE,
  PICKEM_PRIZE_TIER_COUNT_MESSAGE,
  PICKEM_PRIZE_TIER_ORDER_MESSAGE,
  PICKEM_PRIZE_TIER_QUANTITY_MESSAGE,
  PICKEM_PRIZE_WINDOW_PAST_MESSAGE,
  PICKEM_PRIZE_WINDOW_TOO_FAR_MESSAGE,
  describePickEmPrizeScope,
  describePickEmPrizeWindow,
  findPickEmPrizeConflict,
  isPickEmPrizeOffered,
  normalizePickEmPrizeScope,
  normalizePickEmPrizeWindow,
  pickemPickLimitMessage,
  pickemPrizeCampaignCalendar,
  pickemPrizeCycleDate,
  pickemPrizeCycleStart,
  pickemPrizePeriodAt,
  pickemPrizePeriodForDate,
  pickemPrizeTierAboveLimitMessage,
  pickemPrizeTierOfCycle,
  pickemPrizeWinKind,
  pickemScopeCovers,
  pickemScopeHasScoreGames,
  pickemScopesOverlap,
  pickemWindowsShareADay,
  validatePickEmPrizeTerms,
  validatePickEmPrizeWindow,
  type PickEmPrizeOverlapTerms,
  type PickEmPrizeTermsInput,
} from "@/lib/pickemPrizes";
import { normalizePickEmPrizeTiers, serializePickEmPrizeTiers } from "@/lib/pickemPrizeTiers";
import { checkPickEmPrizePickLimit, clearPickEmPrizeLimitCache } from "@/lib/pickemPrizeLimit";
import { PICKEM_PRIZE_SAVE_LEASE_TTL_SECONDS } from "@/lib/pickemPrizeSaveLease";
import { describeReward, describeRewardWin } from "@/lib/rewardDescription";
import { getRewardDefinition, offeredRewardDefinitions } from "@/lib/rewardDefinitions";
import {
  REWARD_PICKEM_OVERLAP_UNCHECKED_MESSAGE,
  REWARD_PICKEM_RANKED_PLACES_MESSAGE,
  REWARD_PICKEM_SAVE_BUSY_MESSAGE,
  RewardConflictError,
  RewardTermsError,
  createReward,
  resolveRewardCreationContext,
  type CreateRewardParams,
  type RewardPrizeInput,
} from "@/lib/rewards";
import type { ChallengeCampaign, PickEmPrizeScope, PickEmPrizeTier, PickEmPrizeWindow, RewardPlacePrize } from "@/types";

const CHICAGO = "America/Chicago";
const TODAY = "2026-11-04"; // a Wednesday
const SATURDAY = "2026-11-07";
const COLLEGE: PickEmPrizeScope = { sports: ["ncaaf"], leagues: [] };
const SOCCER: PickEmPrizeScope = { sports: ["soccer"], leagues: [] };
const NBA_EPL: PickEmPrizeScope = { sports: [], leagues: ["basketball_nba", "soccer_epl"] };
const ON_SATURDAY: PickEmPrizeWindow = { kind: "day", date: SATURDAY };
const SATURDAYS: PickEmPrizeWindow = { kind: "weekday", weekday: "sat" };
const WEEKLY: PickEmPrizeWindow = { kind: "week" };
const GIFT = (amount: number): RewardPrizeInput => ({ prizeKind: "gift_card", amount });
const giftPlace = (place: number, amount: number): RewardPlacePrize => ({
  place,
  prizeKind: "gift_card",
  prizeGiftCertificateAmount: amount,
  prizeMenuItem: null,
  prizeMenuItemName: null,
  prizeDiscountKind: null,
  prizeDiscountValue: null,
  prizePosValueCents: null,
  prizePosDelivery: null,
});
const TIERS: PickEmPrizeTier[] = [
  { ...giftPlace(1, 10), correct: 12, quantity: 5 },
  { ...giftPlace(2, 20), correct: 15, quantity: 3 },
  { ...giftPlace(3, 50), correct: 18, quantity: 1 },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-04T18:00:00.000Z")); // noon in Chicago, Wed Nov 4
  store.timezone = CHICAGO;
  store.createChallengeCampaign.mockClear();
  store.listActivePickEmPrizeCampaigns.mockReset();
  store.listActivePickEmPrizeCampaigns.mockResolvedValue([]);
  store.pickCount = 0;
  store.countError = null;
  store.countQueries = [];
  store.leases.clear();
  store.leaseError = null;
  store.rpcCalls = [];
  clearPickEmPrizeLimitCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Scope ──────────────────────────────────────────────────────────────────────────────────────

describe("scope: which games count", () => {
  it("keeps known sports and leagues in catalog order, each once, dropping a league its sport covers", () => {
    expect(normalizePickEmPrizeScope({ sports: ["soccer", "ncaaf", "soccer"], leagues: ["soccer_epl", "basketball_nba"] })).toEqual({
      sports: ["soccer", "ncaaf"],
      leagues: ["basketball_nba"],
    });
    expect(normalizePickEmPrizeScope({ leagues: ["basketball_nba", "soccer_epl"] })).toEqual(NBA_EPL);
  });

  it("refuses the NFL, unknown names, an empty scope and anything that isn't one", () => {
    for (const bad of [
      { sports: ["nfl"] },
      { leagues: ["americanfootball_nfl"] },
      { sports: ["cricket"] },
      { sports: [], leagues: [] },
      { sports: "soccer" },
      null,
      [],
    ]) {
      expect(normalizePickEmPrizeScope(bad)).toBeNull();
    }
  });

  it("covers a game by its sport (every league, later ones too) or its league", () => {
    expect(pickemScopeCovers(SOCCER, { sportSlug: "soccer", sportKey: "soccer_some_new_league" })).toBe(true);
    expect(pickemScopeCovers(NBA_EPL, { sportSlug: "soccer", sportKey: "soccer_epl" })).toBe(true);
    expect(pickemScopeCovers(NBA_EPL, { sportSlug: "soccer", sportKey: "soccer_usa_mls" })).toBe(false);
    expect(pickemScopeCovers(NBA_EPL, { sportSlug: "nba", sportKey: "basketball_wnba" })).toBe(false);
  });

  it("overlaps when two scopes share a league, including through a whole sport", () => {
    expect(pickemScopesOverlap(SOCCER, NBA_EPL)).toBe(true);
    expect(pickemScopesOverlap(SOCCER, { sports: ["soccer"], leagues: [] })).toBe(true);
    expect(pickemScopesOverlap(COLLEGE, NBA_EPL)).toBe(false);
    expect(pickemScopesOverlap({ sports: [], leagues: ["soccer_usa_mls"] }, NBA_EPL)).toBe(false);
  });

  it("knows which scopes have score games (for the tiebreaker) and reads as a phrase", () => {
    expect(pickemScopeHasScoreGames({ sports: ["mma", "tennis"], leagues: [] })).toBe(false);
    expect(pickemScopeHasScoreGames({ sports: ["mma"], leagues: ["icehockey_nhl"] })).toBe(true);
    expect(describePickEmPrizeScope(COLLEGE)).toBe("college football");
    expect(describePickEmPrizeScope(NBA_EPL)).toBe("NBA and EPL");
    expect(describePickEmPrizeScope({ sports: ["soccer", "mlb"], leagues: ["icehockey_nhl"] })).toBe("soccer, MLB and NHL");
  });
});

// ── Window, periods and the cycle key ─────────────────────────────────────────────────────────

describe("window: when the prize runs", () => {
  it("reads the four kinds and refuses unreal dates or unknown kinds", () => {
    expect(normalizePickEmPrizeWindow({ kind: "day", date: SATURDAY })).toEqual(ON_SATURDAY);
    expect(normalizePickEmPrizeWindow({ kind: "weekday", weekday: "sat" })).toEqual(SATURDAYS);
    expect(normalizePickEmPrizeWindow({ kind: "week", extra: 1 })).toEqual(WEEKLY);
    expect(normalizePickEmPrizeWindow({ kind: "range", from: "2026-11-01", to: "2026-11-30" })).toEqual({
      kind: "range",
      from: "2026-11-01",
      to: "2026-11-30",
    });
    expect(normalizePickEmPrizeWindow({ kind: "day", date: "2026-02-30" })).toBeNull();
    expect(normalizePickEmPrizeWindow({ kind: "weekday", weekday: "saturday" })).toBeNull();
    expect(normalizePickEmPrizeWindow({ kind: "month" })).toBeNull();
  });

  it("is judged against the venue's today: no past day, nothing more than a year out, ranges in order and ≤ 180 days", () => {
    expect(validatePickEmPrizeWindow({ kind: "day", date: TODAY }, TODAY)).toBeNull();
    expect(validatePickEmPrizeWindow({ kind: "day", date: "2026-11-03" }, TODAY)).toBe(PICKEM_PRIZE_WINDOW_PAST_MESSAGE);
    expect(validatePickEmPrizeWindow({ kind: "day", date: "2027-11-05" }, TODAY)).toBe(PICKEM_PRIZE_WINDOW_TOO_FAR_MESSAGE);
    expect(validatePickEmPrizeWindow({ kind: "range", from: "2026-11-03", to: "2026-11-30" }, TODAY)).toBe(
      PICKEM_PRIZE_WINDOW_PAST_MESSAGE,
    );
    expect(validatePickEmPrizeWindow({ kind: "range", from: "2026-11-30", to: "2026-11-29" }, TODAY)).toBe(
      PICKEM_PRIZE_RANGE_ORDER_MESSAGE,
    );
    expect(validatePickEmPrizeWindow({ kind: "range", from: TODAY, to: "2027-05-02" }, TODAY)).toBeNull(); // 180 days
    expect(validatePickEmPrizeWindow({ kind: "range", from: TODAY, to: "2027-05-03" }, TODAY)).toBe(
      PICKEM_PRIZE_RANGE_LENGTH_MESSAGE,
    );
    expect(validatePickEmPrizeWindow(SATURDAYS, TODAY)).toBeNull();
    expect(validatePickEmPrizeWindow(WEEKLY, TODAY)).toBeNull();
  });

  it("reads as a phrase", () => {
    expect(describePickEmPrizeWindow(ON_SATURDAY)).toBe("on Sat, Nov 7");
    expect(describePickEmPrizeWindow(SATURDAYS)).toBe("each Saturday");
    expect(describePickEmPrizeWindow(WEEKLY)).toBe("each week (Monday to Sunday)");
    expect(describePickEmPrizeWindow({ kind: "range", from: "2026-11-01", to: "2026-11-30" })).toBe(
      "from Sun, Nov 1 to Mon, Nov 30",
    );
  });
});

describe("periods (venue-local) and the cycle key", () => {
  it("cuts each window into its periods, bounded by the venue's midnights", () => {
    // Chicago is on CST from Nov 1: midnight = 06:00Z.
    expect(pickemPrizePeriodForDate(ON_SATURDAY, SATURDAY, CHICAGO)).toEqual({
      startDate: SATURDAY,
      endDate: SATURDAY,
      startMs: Date.parse("2026-11-07T06:00:00Z"),
      endMsExclusive: Date.parse("2026-11-08T06:00:00Z"),
    });
    expect(pickemPrizePeriodForDate(ON_SATURDAY, "2026-11-08", CHICAGO)).toBeNull();
    expect(pickemPrizePeriodForDate(SATURDAYS, "2026-11-14", CHICAGO)?.startDate).toBe("2026-11-14");
    expect(pickemPrizePeriodForDate(SATURDAYS, "2026-11-13", CHICAGO)).toBeNull();
    // A week runs Monday to Sunday: Sunday Nov 15 belongs to the week of Monday Nov 9.
    expect(pickemPrizePeriodForDate(WEEKLY, "2026-11-15", CHICAGO)).toMatchObject({ startDate: "2026-11-09", endDate: "2026-11-15" });
    expect(pickemPrizePeriodForDate(WEEKLY, "2026-11-09", CHICAGO)).toMatchObject({ startDate: "2026-11-09", endDate: "2026-11-15" });
    // A range is one period, across the change from daylight time (CDT 05:00Z → CST 06:00Z).
    expect(pickemPrizePeriodForDate({ kind: "range", from: "2026-10-31", to: "2026-11-02" }, "2026-11-01", CHICAGO)).toEqual({
      startDate: "2026-10-31",
      endDate: "2026-11-02",
      startMs: Date.parse("2026-10-31T05:00:00Z"),
      endMsExclusive: Date.parse("2026-11-03T06:00:00Z"),
    });
  });

  it("reads an instant as the venue's date, not UTC's", () => {
    // 03:00Z Sunday is still Saturday night in Chicago.
    expect(pickemPrizePeriodAt(ON_SATURDAY, new Date("2026-11-08T03:00:00Z"), CHICAGO)?.startDate).toBe(SATURDAY);
    expect(pickemPrizePeriodAt(ON_SATURDAY, new Date("2026-11-08T03:00:00Z"), "UTC")).toBeNull();
  });

  it("is the period start plus the tier in seconds, and reads back", () => {
    const period = pickemPrizePeriodForDate(ON_SATURDAY, SATURDAY, CHICAGO)!;
    expect(pickemPrizeCycleStart(period)?.toISOString()).toBe("2026-11-07T06:00:00.000Z");
    expect(pickemPrizeCycleStart(period, 3)?.toISOString()).toBe("2026-11-07T06:00:03.000Z");
    expect(pickemPrizeCycleStart(period, 4)).toBeNull();
    expect(pickemPrizeCycleStart({ startMs: Number.NaN })).toBeNull();
    expect(pickemPrizeTierOfCycle("2026-11-07T06:00:02.000Z")).toBe(2);
    expect(pickemPrizeTierOfCycle("2026-11-07T06:00:00.000Z")).toBe(0);
    expect(pickemPrizeTierOfCycle("2026-11-07T06:00:07.000Z")).toBeNull();
    expect(pickemPrizeCycleDate("2026-11-07T06:00:02.000Z", CHICAGO)).toBe(SATURDAY);
  });

  it("tier 0 equals the generic cycle start of the campaign createReward stores", async () => {
    const { computeCycleStart } = await vi.importActual<typeof import("@/lib/challengeCampaigns")>("@/lib/challengeCampaigns");
    const campaignFor = (window: PickEmPrizeWindow) =>
      ({ ...pickemPrizeCampaignCalendar(window), scheduleType: "recurring" }) as unknown as ChallengeCampaign;
    const at = new Date("2026-11-07T20:00:00Z");
    for (const window of [ON_SATURDAY, SATURDAYS, WEEKLY, { kind: "range", from: "2026-11-01", to: "2026-11-30" } as const]) {
      const period = pickemPrizePeriodAt(window, at, CHICAGO)!;
      expect(computeCycleStart(campaignFor(window), at, CHICAGO).toISOString()).toBe(pickemPrizeCycleStart(period)?.toISOString());
    }
  });
});

// ── How it's won: validation ──────────────────────────────────────────────────────────────────

describe("validatePickEmPrizeTerms", () => {
  const base = { scope: COLLEGE, window: ON_SATURDAY };
  const check = (input: Partial<PickEmPrizeTermsInput> & Pick<PickEmPrizeTermsInput, "winKind">) =>
    validatePickEmPrizeTerms({ ...base, ...input }, TODAY);

  it("most right needs a minimum number of picks and a score sport, and nothing else", () => {
    expect(check({ winKind: "most_right", minPicks: 10 })).toBeNull();
    expect(check({ winKind: "most_right" })).toMatch(/how many picks a player must make/);
    expect(check({ winKind: "most_right", minPicks: 101 })).toMatch(/how many picks a player must make/);
    expect(check({ winKind: "most_right", minPicks: 5, scope: { sports: ["mma", "tennis"], leagues: [] } })).toBe(
      PICKEM_PRIZE_MOST_RIGHT_SCORES_MESSAGE,
    );
    expect(check({ winKind: "most_right", minPicks: 5, pickLimit: 20 })).toBe(PICKEM_PRIZE_TERMS_MISMATCH_MESSAGE);
  });

  it("get N right needs N and a quantity", () => {
    expect(check({ winKind: "target", target: 15, quantity: 3 })).toBeNull();
    expect(check({ winKind: "target", target: 0, quantity: 3 })).toMatch(/how many picks right wins/);
    expect(check({ winKind: "target", target: 15, quantity: 0 })).toMatch(/how many of this prize/);
    expect(check({ winKind: "target", target: 15, quantity: 1, minPicks: 3 })).toBe(PICKEM_PRIZE_TERMS_MISMATCH_MESSAGE);
  });

  it("X out of N needs N and 1–3 rising tiers within it, with quantities", () => {
    const tiers = [
      { correct: 12, quantity: 5 },
      { correct: 15, quantity: 3 },
      { correct: 18, quantity: 1 },
    ];
    expect(check({ winKind: "tiers", pickLimit: 20, tiers })).toBeNull();
    expect(check({ winKind: "tiers", tiers })).toBe(PICKEM_PRIZE_PICK_LIMIT_MESSAGE);
    expect(check({ winKind: "tiers", pickLimit: 20, tiers: [] })).toBe(PICKEM_PRIZE_TIER_COUNT_MESSAGE);
    expect(check({ winKind: "tiers", pickLimit: 20, tiers: [...tiers, { correct: 19, quantity: 1 }] })).toBe(
      PICKEM_PRIZE_TIER_COUNT_MESSAGE,
    );
    expect(check({ winKind: "tiers", pickLimit: 20, tiers: [tiers[1], tiers[0]] })).toBe(PICKEM_PRIZE_TIER_ORDER_MESSAGE);
    expect(check({ winKind: "tiers", pickLimit: 20, tiers: [tiers[0], { correct: 12, quantity: 1 }] })).toBe(
      PICKEM_PRIZE_TIER_ORDER_MESSAGE,
    );
    expect(check({ winKind: "tiers", pickLimit: 16, tiers })).toBe(pickemPrizeTierAboveLimitMessage(16));
    expect(check({ winKind: "tiers", pickLimit: 20, tiers: [{ correct: 12, quantity: 0 }] })).toBe(PICKEM_PRIZE_TIER_QUANTITY_MESSAGE);
    expect(
      check({ winKind: "tiers", pickLimit: 20, tiers: [{ correct: 12, quantity: 60 }, { correct: 15, quantity: 41 }] }),
    ).toBe(PICKEM_PRIZE_TIER_QUANTITY_MESSAGE);
    expect(check({ winKind: "tiers", pickLimit: 20, tiers, minPicks: 1 })).toBe(PICKEM_PRIZE_TERMS_MISMATCH_MESSAGE);
  });

  it("refuses a window the venue can't run", () => {
    expect(check({ winKind: "target", target: 5, quantity: 1, window: { kind: "day", date: "2026-11-01" } })).toBe(
      PICKEM_PRIZE_WINDOW_PAST_MESSAGE,
    );
  });

  it("reads a stored prize's win kind", () => {
    expect(pickemPrizeWinKind({ winCondition: "game_winner" })).toBe("most_right");
    expect(pickemPrizeWinKind({ winCondition: "points_threshold", pickemTiers: TIERS })).toBe("tiers");
    expect(pickemPrizeWinKind({ winCondition: "points_threshold", pickemTiers: null })).toBe("target");
  });
});

// ── The overlap rule (D6) ─────────────────────────────────────────────────────────────────────

describe("windows sharing a day", () => {
  const range = (from: string, to: string): PickEmPrizeWindow => ({ kind: "range", from, to });
  const cases: Array<[string, PickEmPrizeWindow, PickEmPrizeWindow, boolean]> = [
    ["the same day", ON_SATURDAY, ON_SATURDAY, true],
    ["different days", ON_SATURDAY, { kind: "day", date: "2026-11-08" }, false],
    ["a Saturday and every Saturday", ON_SATURDAY, SATURDAYS, true],
    ["a Sunday and every Saturday", { kind: "day", date: "2026-11-08" }, SATURDAYS, false],
    ["every Saturday and every Sunday", SATURDAYS, { kind: "weekday", weekday: "sun" }, false],
    ["every week and anything", WEEKLY, { kind: "weekday", weekday: "tue" }, true],
    ["a range containing the day", range("2026-11-05", "2026-11-09"), ON_SATURDAY, true],
    ["a range before the day", range("2026-11-04", "2026-11-06"), ON_SATURDAY, false],
    ["a short range without a Saturday", range("2026-11-09", "2026-11-12"), SATURDAYS, false],
    ["two ranges that meet on one day", range("2026-11-04", "2026-11-10"), range("2026-11-10", "2026-11-20"), true],
    ["a day prize that has already passed", { kind: "day", date: "2026-10-31" }, SATURDAYS, false],
  ];
  it.each(cases)("%s", (_label, a, b, expected) => {
    expect(pickemWindowsShareADay(a, b, TODAY)).toBe(expected);
    expect(pickemWindowsShareADay(b, a, TODAY)).toBe(expected);
  });
});

describe("findPickEmPrizeConflict (D6)", () => {
  const prize = (id: string, overrides: Partial<PickEmPrizeOverlapTerms>): PickEmPrizeOverlapTerms & { id: string } => ({
    id,
    scope: COLLEGE,
    window: ON_SATURDAY,
    pickLimit: null,
    minPicks: null,
    ...overrides,
  });

  it("refuses a second pick limit on the same league and day, naming the first prize", () => {
    const conflict = findPickEmPrizeConflict(prize("new", { pickLimit: 20 }), [prize("old", { pickLimit: 15, window: SATURDAYS })], TODAY);
    expect(conflict).toEqual({
      conflictId: "old",
      message:
        "Your college football prize each Saturday already limits picks for some of these games on the same day. Only one prize with a pick limit can cover a game.",
    });
  });

  it("allows pick limits on different leagues or days, and prizes without a limit anywhere", () => {
    expect(findPickEmPrizeConflict(prize("new", { pickLimit: 20 }), [prize("old", { pickLimit: 20, scope: SOCCER })], TODAY)).toBeNull();
    expect(
      findPickEmPrizeConflict(prize("new", { pickLimit: 20 }), [prize("old", { pickLimit: 20, window: { kind: "weekday", weekday: "sun" } })], TODAY),
    ).toBeNull();
    expect(findPickEmPrizeConflict(prize("new", {}), [prize("old", { pickLimit: 20 }), prize("old2", {})], TODAY)).toBeNull();
    expect(findPickEmPrizeConflict(prize("new", { pickLimit: 20 }), [prize("old", {})], TODAY)).toBeNull();
  });

  it("refuses a most-right prize that needs more picks than an overlapping limit gives — either one new", () => {
    expect(findPickEmPrizeConflict(prize("new", { minPicks: 25 }), [prize("old", { pickLimit: 20 })], TODAY)?.message).toBe(
      "Your college football prize on Sat, Nov 7 gives players 20 picks, so this prize can't require 25.",
    );
    expect(findPickEmPrizeConflict(prize("new", { pickLimit: 20 }), [prize("old", { minPicks: 25, window: WEEKLY })], TODAY)?.message).toBe(
      "Your college football prize each week (Monday to Sunday) requires 25 picks, so players can't be limited to 20.",
    );
    expect(findPickEmPrizeConflict(prize("new", { minPicks: 20 }), [prize("old", { pickLimit: 20 })], TODAY)).toBeNull();
  });
});

describe("the pick limit's words", () => {
  const period = { startDate: SATURDAY, endDate: SATURDAY };
  it("says today, a date, this week or the range", () => {
    expect(pickemPickLimitMessage({ limit: 20, scope: COLLEGE, window: ON_SATURDAY, period, today: SATURDAY })).toBe(
      "This bar's prize counts your first 20 college football picks today, and you've already used all 20.",
    );
    expect(pickemPickLimitMessage({ limit: 20, scope: COLLEGE, window: SATURDAYS, period, today: TODAY })).toContain(
      "picks on Sat, Nov 7,",
    );
    expect(
      pickemPickLimitMessage({ limit: 5, scope: NBA_EPL, window: WEEKLY, period: { startDate: "2026-11-02", endDate: "2026-11-08" }, today: TODAY }),
    ).toBe("This bar's prize counts your first 5 NBA and EPL picks this week, and you've already used all 5.");
    expect(
      pickemPickLimitMessage({
        limit: 5,
        scope: SOCCER,
        window: { kind: "range", from: "2026-11-01", to: "2026-11-30" },
        period: { startDate: "2026-11-01", endDate: "2026-11-30" },
        today: TODAY,
      }),
    ).toContain("soccer picks from Nov 1 to Nov 30,");
  });
});

// ── Tiers storage and wording ─────────────────────────────────────────────────────────────────

describe("stored tiers", () => {
  it("round-trip in the place_prizes shape plus correct and quantity", () => {
    const stored = serializePickEmPrizeTiers(TIERS);
    expect(stored[0]).toMatchObject({ place: 1, prize_kind: "gift_card", prize_gift_certificate_amount: 10, correct: 12, quantity: 5 });
    expect(normalizePickEmPrizeTiers(JSON.parse(JSON.stringify(stored)))).toEqual(TIERS);
  });

  it("are unreadable (null) when out of order, missing a number or a prize, or too many", () => {
    const stored = serializePickEmPrizeTiers(TIERS);
    expect(normalizePickEmPrizeTiers([{ ...stored[0], correct: 16 }, stored[1]])).toBeNull();
    expect(normalizePickEmPrizeTiers([{ ...stored[0], quantity: 0 }])).toBeNull();
    expect(normalizePickEmPrizeTiers([{ ...stored[0], prize_kind: "points" }])).toBeNull();
    expect(normalizePickEmPrizeTiers([...stored, { ...stored[2], place: 4, correct: 19 }])).toBeNull();
    expect(normalizePickEmPrizeTiers([])).toBeNull();
  });
});

describe("guest wording", () => {
  const base = {
    rules: "stored",
    rewardDefinitionId: PICKEM_PRIZE_DEFINITION_ID,
    recurringType: "none" as const,
    activeDays: [],
    pickemScope: COLLEGE,
    pickemWindow: ON_SATURDAY,
  };
  const now = new Date();

  it("most right", () => {
    const description = describeReward(
      { ...base, winCondition: "game_winner", winnerQuota: 1, pointsRequiredToWin: 1, pickemMinPicks: 10, minPlayers: 4, prizeKind: "gift_card", prizeGiftCertificateAmount: 25 },
      now,
    );
    expect(description.summary).toBe("Get the most college football picks right on Sat, Nov 7 and win a $25 gift card.");
    expect(description.when).toBe("Make your picks in Pick 'Em. Only college football games count.");
    expect(description.fineprint).toBe(
      "Make at least 10 picks to be ranked. Ties go to the closest guess of the total points in the last game, then the earliest guess. At least 4 players need to play for a winner to be named.",
    );
    expect(description.isCustom).toBe(false);
  });

  it("get N right", () => {
    const description = describeReward(
      { ...base, pickemWindow: SATURDAYS, winCondition: "points_threshold", winnerQuota: 3, pointsRequiredToWin: 15, prizeKind: "gift_card", prizeGiftCertificateAmount: 20 },
      now,
    );
    expect(description.summary).toBe("Get 15 college football picks right each Saturday and win a $20 gift card.");
    expect(description.fineprint).toBe("The first 3 players to get there win.");
  });

  it("X out of N, one tier and three", () => {
    const one = describeReward(
      { ...base, winCondition: "points_threshold", winnerQuota: 5, pointsRequiredToWin: 15, pickemPickLimit: 20, pickemTiers: [{ ...TIERS[1], place: 1 }] },
      now,
    );
    expect(one.summary).toBe("Get 15 of your 20 college football picks right on Sat, Nov 7 and win a $20 gift card.");
    expect(one.when).toBe("You get 20 college football picks on Sat, Nov 7. Only your first 20 count.");
    const three = describeReward(
      { ...base, winCondition: "points_threshold", winnerQuota: 9, pointsRequiredToWin: 12, pickemPickLimit: 20, pickemTiers: TIERS },
      now,
    );
    expect(three.summary).toBe(
      "Get 12, 15 or 18 of your 20 college football picks right on Sat, Nov 7. 12 right wins a $10 gift card, 15 right wins a $20 gift card and 18 right wins a $50 gift card.",
    );
    expect(three.fineprint).toBe("You win only the highest tier you reach.");
  });

  it("falls back to the stored wording when the terms couldn't be read", () => {
    const description = describeReward({ ...base, pickemScope: null, winCondition: "game_winner", winnerQuota: 1, pointsRequiredToWin: 1 }, now);
    expect(description).toMatchObject({ summary: "stored", isCustom: true });
  });

  it("says what a coupon was won for, from its cycle key in the venue's zone", () => {
    const tierCycle = "2026-11-07T06:00:02.000Z";
    expect(
      describeRewardWin(
        { ...base, winCondition: "points_threshold", winnerQuota: 9, pointsRequiredToWin: 12, pickemPickLimit: 20, pickemTiers: TIERS },
        { cycleStart: tierCycle, timezone: CHICAGO },
      ),
    ).toBe("You got 15 of 20 college football picks right on Sat, Nov 7");
    expect(
      describeRewardWin(
        { ...base, pickemWindow: WEEKLY, winCondition: "game_winner", winnerQuota: 1, pointsRequiredToWin: 1 },
        { cycleStart: "2026-11-09T06:00:00.000Z", timezone: CHICAGO },
      ),
    ).toBe("You got the most college football picks right the week of Nov 9");
    expect(
      describeRewardWin(
        { ...base, winCondition: "points_threshold", winnerQuota: 1, pointsRequiredToWin: 8 },
        { cycleStart: "2026-11-07T06:00:00.000Z", timezone: CHICAGO },
      ),
    ).toBe("You got 8 college football picks right on Sat, Nov 7");
  });
});

// ── The registry and createReward ─────────────────────────────────────────────────────────────

describe("the registry", () => {
  it("knows the Pick 'Em Prize and the wizard offers it (Phase 5)", () => {
    expect(getRewardDefinition(PICKEM_PRIZE_DEFINITION_ID)).toMatchObject({ gameType: "pickem", requiresScheduledGame: null });
    expect(isPickEmPrizeOffered()).toBe(true);
    expect(offeredRewardDefinitions().map((definition) => definition.id)).toContain(PICKEM_PRIZE_DEFINITION_ID);
  });

  it("gives the wizard the venue's today and time zone, gated on nothing scheduled", async () => {
    store.timezone = "America/Los_Angeles";
    vi.setSystemTime(new Date("2026-11-05T06:30:00Z")); // still Nov 4 in Los Angeles
    const context = await resolveRewardCreationContext("venue-1", PICKEM_PRIZE_DEFINITION_ID);
    expect(context).toMatchObject({ scheduled: true, pickem: { today: TODAY, timezone: "America/Los_Angeles" } });
  });
});

describe("createReward — Pick 'Em Prize", () => {
  const params = (overrides: Partial<CreateRewardParams>): CreateRewardParams => ({
    venueId: "venue-1",
    definitionId: PICKEM_PRIZE_DEFINITION_ID,
    cadence: "none",
    threshold: Number.NaN,
    winnerQuota: Number.NaN,
    prize: GIFT(25),
    pickemScope: { sports: ["ncaaf"] },
    pickemWindow: { kind: "day", date: SATURDAY },
    ...overrides,
  });
  const created = () => store.createChallengeCampaign.mock.calls[0][0] as Record<string, unknown>;

  it("most right → one game_winner per day, with the minimum picks and players", async () => {
    await createReward(params({ winCondition: "game_winner", pickemMinPicks: 10, minPlayers: 4 }));
    expect(created()).toMatchObject({
      rewardDefinitionId: PICKEM_PRIZE_DEFINITION_ID,
      gameTypes: ["pickem"],
      winCondition: "game_winner",
      winnerQuota: 1,
      pointsRequiredToWin: 1,
      recurringType: "none",
      activeDays: [],
      startDate: SATURDAY,
      endDate: SATURDAY,
      minPlayers: 4,
      prizeKind: "gift_card",
      prizeGiftCertificateAmount: 25,
      pickemScope: COLLEGE,
      pickemWindow: ON_SATURDAY,
      pickemMinPicks: 10,
      pickemPickLimit: null,
      pickemTiers: null,
      rules: "Get the most college football picks right on Sat, Nov 7 and win a $25 gift card.",
    });
  });

  it("get N right → points_threshold with N correct picks and the quantity, weekly on its weekday", async () => {
    await createReward(params({ threshold: 15, winnerQuota: 3, pickemWindow: { kind: "weekday", weekday: "sat" } }));
    expect(created()).toMatchObject({
      winCondition: "points_threshold",
      pointsRequiredToWin: 15,
      winnerQuota: 3,
      recurringType: "weekly",
      activeDays: ["sat"],
      pickemMinPicks: null,
    });
    expect(created()).not.toHaveProperty("startDate");
  });

  it("X out of N → the limit, each tier's prize, quota = all tiers, threshold = the lowest tier, no campaign prize", async () => {
    await createReward(
      params({
        pickemWindow: { kind: "week" },
        pickemPickLimit: 20,
        pickemTiers: [
          { correct: 12, quantity: 5, prize: GIFT(10) },
          { correct: 15, quantity: 3, prize: GIFT(20) },
          { correct: 18, quantity: 1, prize: GIFT(50) },
        ],
      }),
    );
    expect(created()).toMatchObject({
      winCondition: "points_threshold",
      pointsRequiredToWin: 12,
      winnerQuota: 9,
      recurringType: "weekly",
      activeDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      prizeKind: null,
      placePrizes: null,
      pickemPickLimit: 20,
      pickemTiers: TIERS,
    });
  });

  it("judges the window in the venue's time zone", async () => {
    // 05:00Z Nov 5 is still Nov 4 in Chicago: Nov 4 is today there, not yesterday.
    vi.setSystemTime(new Date("2026-11-05T05:00:00Z"));
    await expect(createReward(params({ threshold: 5, winnerQuota: 1, pickemWindow: { kind: "day", date: TODAY } }))).resolves.toBeTruthy();
    store.timezone = "UTC";
    await expect(createReward(params({ threshold: 5, winnerQuota: 1, pickemWindow: { kind: "day", date: TODAY } }))).rejects.toThrow(
      PICKEM_PRIZE_WINDOW_PAST_MESSAGE,
    );
  });

  it("refuses what a Pick 'Em Prize can't have — never silently changes it (400s)", async () => {
    const refusals: Array<[Partial<CreateRewardParams>, string | RegExp]> = [
      [{ pickemScope: { sports: ["nfl"] }, threshold: 5, winnerQuota: 1 }, PICKEM_PRIZE_SCOPE_MESSAGE],
      [{ pickemWindow: { kind: "day", date: "2026-11-01" }, threshold: 5, winnerQuota: 1 }, PICKEM_PRIZE_WINDOW_PAST_MESSAGE],
      [{ winCondition: "ranked_places" }, REWARD_PICKEM_RANKED_PLACES_MESSAGE],
      [{ threshold: 5, winnerQuota: 1, minPlayers: 3 }, /minimum number of players/],
      [{ threshold: 5, winnerQuota: 1, placePrizes: [GIFT(5)] }, /prize for each place/],
      [{ winCondition: "game_winner" }, /how many picks a player must make/],
      [{ winCondition: "game_winner", pickemMinPicks: 3, pickemScope: { sports: ["mma"] } }, PICKEM_PRIZE_MOST_RIGHT_SCORES_MESSAGE],
      [{ pickemPickLimit: 10, pickemTiers: [{ correct: 12, quantity: 1, prize: GIFT(5) }] }, pickemPrizeTierAboveLimitMessage(10)],
    ];
    for (const [overrides, message] of refusals) {
      const attempt = createReward(params(overrides));
      await expect(attempt).rejects.toBeInstanceOf(RewardTermsError);
      await expect(createReward(params(overrides))).rejects.toThrow(message);
    }
    // A tier without a valid prize is refused like any prize.
    await expect(
      createReward(params({ pickemPickLimit: 20, pickemTiers: [{ correct: 12, quantity: 1, prize: { prizeKind: "gift_card", amount: 0 } }] })),
    ).rejects.toThrow(/Check what the winner gets/);
    expect(store.createChallengeCampaign).not.toHaveBeenCalled();
  });

  it("refuses an overlap with the bar's other Pick 'Em Prizes (a 409, naming it) and fails closed when it can't check", async () => {
    store.listActivePickEmPrizeCampaigns.mockResolvedValue([
      { id: "old", pickemScope: SOCCER, pickemWindow: SATURDAYS, pickemPickLimit: 20, pickemMinPicks: null, pickemTiers: [] },
    ]);
    const attempt = createReward(
      params({ pickemScope: { leagues: ["soccer_epl"] }, pickemPickLimit: 15, pickemTiers: [{ correct: 10, quantity: 1, prize: GIFT(5) }] }),
    );
    await expect(attempt).rejects.toBeInstanceOf(RewardConflictError);
    await expect(attempt).rejects.toThrow("Your soccer prize each Saturday already limits picks");

    store.listActivePickEmPrizeCampaigns.mockRejectedValue(new Error("down"));
    await expect(createReward(params({ threshold: 5, winnerQuota: 1 }))).rejects.toThrow(REWARD_PICKEM_OVERLAP_UNCHECKED_MESSAGE);
    expect(store.createChallengeCampaign).not.toHaveBeenCalled();
    // Both refusals released the lease.
    expect(store.leases.size).toBe(0);
  });
});

// ── One save at a time per bar (Phase 7.5.3, F17) ───────────────────────────────────────────────

describe("createReward — Pick 'Em Prize save lease", () => {
  const params = (overrides: Partial<CreateRewardParams> = {}): CreateRewardParams => ({
    venueId: "venue-1",
    definitionId: PICKEM_PRIZE_DEFINITION_ID,
    cadence: "none",
    threshold: Number.NaN,
    winnerQuota: Number.NaN,
    prize: GIFT(25),
    pickemScope: { sports: ["soccer"] },
    pickemWindow: SATURDAYS,
    pickemPickLimit: 20,
    pickemTiers: [{ correct: 10, quantity: 1, prize: GIFT(5) }],
    ...overrides,
  });
  // Two "X out of N" prizes on the same games and days: the second clashes with the first (D6).
  const savedPrizes: unknown[] = [];
  beforeEach(() => {
    savedPrizes.length = 0;
    store.listActivePickEmPrizeCampaigns.mockImplementation(async () => [...savedPrizes]);
    store.createChallengeCampaign.mockImplementation(async (input: Record<string, unknown>) => {
      // The insert takes a moment, so a second save starts while the first still holds the lease.
      await new Promise((resolve) => setTimeout(resolve, 5));
      const row = { id: `prize-${savedPrizes.length + 1}`, ...input };
      savedPrizes.push(row);
      return row;
    });
  });
  afterEach(() => {
    store.createChallengeCampaign.mockImplementation(async (input: Record<string, unknown>) => ({ id: "prize-new", ...input }));
  });

  it("two saves at once at the same bar → one is created, the other is a 409 conflict; nothing overlaps", async () => {
    const [first, second] = await Promise.allSettled([createReward(params()), createReward(params())]);
    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("rejected");
    const reason = (second as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(RewardConflictError);
    expect((reason as Error).message).toBe(REWARD_PICKEM_SAVE_BUSY_MESSAGE);
    expect(store.createChallengeCampaign).toHaveBeenCalledTimes(1);
    expect(savedPrizes).toHaveLength(1);
    // Released afterwards: the next save gets the lease and then meets the overlap rule itself.
    expect(store.leases.size).toBe(0);
    await expect(createReward(params())).rejects.toThrow("already limits picks");
  });

  it("claims before the overlap read and releases after the insert, with its own token", async () => {
    const heldDuring: string[] = [];
    store.listActivePickEmPrizeCampaigns.mockImplementationOnce(async () => {
      if (store.leases.has("venue-1")) heldDuring.push("overlap read");
      return [];
    });
    store.createChallengeCampaign.mockImplementationOnce(async (input: Record<string, unknown>) => {
      if (store.leases.has("venue-1")) heldDuring.push("insert");
      return { id: "prize-new", ...input };
    });
    await createReward(params());
    expect(heldDuring).toEqual(["overlap read", "insert"]);
    const [claim, release] = store.rpcCalls;
    expect(store.rpcCalls).toHaveLength(2);
    expect(claim).toEqual([
      "claim_pickem_prize_save",
      { p_venue_id: "venue-1", p_token: expect.any(String), p_ttl_seconds: PICKEM_PRIZE_SAVE_LEASE_TTL_SECONDS },
    ]);
    expect(release).toEqual(["release_pickem_prize_save", { p_venue_id: "venue-1", p_token: claim[1].p_token }]);
    expect(store.leases.size).toBe(0);
  });

  it("a different bar is not blocked", async () => {
    const results = await Promise.allSettled([createReward(params()), createReward(params({ venueId: "venue-2" }))]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
  });

  it("releases the lease when the insert throws", async () => {
    store.createChallengeCampaign.mockRejectedValueOnce(new Error("insert failed"));
    await expect(createReward(params())).rejects.toThrow("insert failed");
    expect(store.rpcCalls.map(([name]) => name)).toEqual(["claim_pickem_prize_save", "release_pickem_prize_save"]);
    expect(store.leases.size).toBe(0);
  });

  it("a lease another save left behind blocks until it runs out", async () => {
    store.leases.set("venue-1", { token: "someone-else", expiresAtMs: Date.now() + 10_000 });
    await expect(createReward(params())).rejects.toThrow(REWARD_PICKEM_SAVE_BUSY_MESSAGE);
    expect(store.listActivePickEmPrizeCampaigns).not.toHaveBeenCalled();
    // The busy save never releases a lease it doesn't hold.
    expect(store.rpcCalls.map(([name]) => name)).toEqual(["claim_pickem_prize_save"]);
    vi.setSystemTime(new Date(Date.now() + 11_000));
    await expect(createReward(params())).resolves.toBeTruthy();
  });

  it("fails closed when the lease can't be taken (missing RPC or any error): nothing read, nothing created", async () => {
    for (const leaseError of [
      { code: "PGRST202", message: "Could not find the function public.claim_pickem_prize_save" },
      { message: "connection reset" },
    ]) {
      store.leaseError = leaseError;
      const attempt = createReward(params());
      await expect(attempt).rejects.toThrow(REWARD_PICKEM_OVERLAP_UNCHECKED_MESSAGE);
      await expect(attempt).rejects.not.toBeInstanceOf(RewardConflictError);
    }
    expect(store.listActivePickEmPrizeCampaigns).not.toHaveBeenCalled();
    expect(store.createChallengeCampaign).not.toHaveBeenCalled();
  });
});

// ── The 10-points-a-pick accrual never feeds a Pick 'Em Prize ─────────────────────────────────

describe("generic points accrual", () => {
  it("skips Pick 'Em Prizes but not other Pick 'Em points prizes", async () => {
    const { isCampaignEligibleForAccrual } = await vi.importActual<typeof import("@/lib/challengeCampaigns")>(
      "@/lib/challengeCampaigns",
    );
    const campaign = {
      isActive: true,
      winnerUserId: null,
      gameTypes: ["pickem"],
      scheduleType: "recurring",
      activeDays: [],
      recurringType: "none",
      rewardDefinitionId: null,
    } as unknown as ChallengeCampaign;
    const at = new Date();
    expect(isCampaignEligibleForAccrual(campaign, at, "pickem", CHICAGO, null)).toBe(true);
    const prize = { ...campaign, rewardDefinitionId: PICKEM_PRIZE_DEFINITION_ID };
    expect(isCampaignEligibleForAccrual(prize, at, "pickem", CHICAGO, null)).toBe(false);
    expect(isCampaignEligibleForAccrual(prize, at, "pickem", CHICAGO, { startMs: 0, endMsExclusive: Date.now() + 1 })).toBe(false);
  });
});

// ── The pick limit (D5) ───────────────────────────────────────────────────────────────────────

describe("checkPickEmPrizePickLimit", () => {
  const limitPrize = (overrides: Record<string, unknown> = {}) => ({
    id: "limit-prize",
    pickemScope: COLLEGE,
    pickemWindow: ON_SATURDAY,
    pickemPickLimit: 20,
    pickemMinPicks: null,
    pickemTiers: TIERS,
    ...overrides,
  });
  const collegeGame = { sportSlug: "ncaaf", sportKey: "americanfootball_ncaaf", startsAt: "2026-11-07T17:00:00Z" };
  const check = (game = collegeGame) => checkPickEmPrizePickLimit({ userId: "user-1", venueId: "venue-1", game, now: new Date("2026-11-07T15:00:00Z") });

  it("allows any pick when the bar has no limit covering the game", async () => {
    expect(await check()).toEqual({ ok: true });
    store.listActivePickEmPrizeCampaigns.mockResolvedValue([limitPrize({ pickemPickLimit: null }), limitPrize({ scope: SOCCER, pickemScope: SOCCER })]);
    clearPickEmPrizeLimitCache();
    expect(await check()).toEqual({ ok: true });
    expect(store.countQueries).toHaveLength(0);
  });

  it("counts the player's picks in the prize's games and day, and refuses the one past N", async () => {
    store.listActivePickEmPrizeCampaigns.mockResolvedValue([limitPrize()]);
    store.pickCount = 19;
    expect(await check()).toEqual({ ok: true });
    expect(store.countQueries[0]).toEqual([
      ["select", "id", { count: "exact", head: true }],
      ["eq", "user_id", "user-1"],
      ["eq", "venue_id", "venue-1"],
      ["gte", "starts_at", "2026-11-07T06:00:00.000Z"],
      ["lt", "starts_at", "2026-11-08T06:00:00.000Z"],
      ["neq", "status", "canceled"],
      ["or", 'sport_slug.in.("ncaaf")'],
    ]);
    store.pickCount = 20;
    expect(await check()).toEqual({
      ok: false,
      message: "This bar's prize counts your first 20 college football picks today, and you've already used all 20.",
    });
  });

  it("ignores a limit on another day of the week, and reads the venue's date for a late game", async () => {
    store.listActivePickEmPrizeCampaigns.mockResolvedValue([limitPrize({ pickemScope: NBA_EPL })]);
    store.pickCount = 50;
    // 03:00Z Sunday = Saturday night in Chicago: still the Saturday prize's day.
    expect((await check({ sportSlug: "nba", sportKey: "basketball_nba", startsAt: "2026-11-08T03:00:00Z" })).ok).toBe(false);
    expect(store.countQueries[0].at(-1)).toEqual(["or", 'sport_key.in.("basketball_nba","soccer_epl")']);
    expect((await check({ sportSlug: "nba", sportKey: "basketball_nba", startsAt: "2026-11-08T17:00:00Z" })).ok).toBe(true);
  });

  it("reads the bar's prizes once a minute per server, not once per pick", async () => {
    store.listActivePickEmPrizeCampaigns.mockResolvedValue([]);
    await check();
    await check();
    expect(store.listActivePickEmPrizeCampaigns).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 61_000);
    await check();
    expect(store.listActivePickEmPrizeCampaigns).toHaveBeenCalledTimes(2);
  });

  it("fails open on a read error (the prize counts only the first N picks, so a stray pick can't help)", async () => {
    store.listActivePickEmPrizeCampaigns.mockRejectedValue(new Error("down"));
    expect(await check()).toEqual({ ok: true });
    store.listActivePickEmPrizeCampaigns.mockResolvedValue([limitPrize()]);
    store.countError = { message: "timeout" };
    expect(await check()).toEqual({ ok: true }); // the failed read wasn't cached
    expect(console.error).toHaveBeenCalledWith("[PickEmPrize] limit-count-failed", expect.objectContaining({ campaignId: "limit-prize" }));
  });
});
