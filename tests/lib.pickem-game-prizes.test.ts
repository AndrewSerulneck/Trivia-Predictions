import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Pick 'Em plan Phase 6: what the games list says about a Pick 'Em Prize (lib/pickemGamePrizes.ts) and
// the line it prints (lib/pickemPrizeLine.ts), plus the wording of a Pick 'Em coupon through the
// wallet's attachRewardWinDescriptions. The venue's prizes, its time zone and the pick count are stood in.

const store = vi.hoisted(() => ({
  prizes: [] as unknown[],
  prizesError: null as Error | null,
  timezone: "America/Chicago",
  pickCount: 0,
  countError: null as { message: string } | null,
  countQueries: [] as Array<Array<[string, ...unknown[]]>>,
  prizeReads: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/challengeCampaigns", () => ({
  listActivePickEmPrizeCampaigns: vi.fn(async () => {
    store.prizeReads += 1;
    if (store.prizesError) throw store.prizesError;
    return store.prizes;
  }),
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
  return { supabaseAdmin: { from } };
});

import { loadPickEmGamePrizes } from "@/lib/pickemGamePrizes";
import { clearPickEmPrizeLimitCache } from "@/lib/pickemPrizeLimit";
import { pickemPrizeLineText, type PickEmGamePrize } from "@/lib/pickemPrizeLine";
import { describePickEmPrizePeriodPhrase } from "@/lib/pickemPrizes";
import { serializePickEmPrizeTiers } from "@/lib/pickemPrizeTiers";
import { attachRewardWinDescriptions } from "@/lib/rewards";
import type { ChallengeCampaignWin, PickEmPrizeScope, PickEmPrizeTier, PickEmPrizeWindow } from "@/types";

const COLLEGE: PickEmPrizeScope = { sports: ["ncaaf"], leagues: [] };
const ON_SATURDAY: PickEmPrizeWindow = { kind: "day", date: "2026-11-07" };
const giftPlace = (place: number, amount: number) => ({
  place,
  prizeKind: "gift_card" as const,
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

const prize = (overrides: Record<string, unknown> = {}) => ({
  id: "prize-1",
  winCondition: "points_threshold",
  pointsRequiredToWin: 1,
  pickemScope: COLLEGE,
  pickemWindow: ON_SATURDAY,
  pickemPickLimit: 20,
  pickemTiers: TIERS,
  pickemMinPicks: null,
  ...overrides,
});
const game = (overrides: Record<string, unknown> = {}) => ({
  sportSlug: "ncaaf",
  sportKey: "americanfootball_ncaaf",
  startsAt: "2026-11-07T18:00:00Z", // noon Saturday in Chicago
  ...overrides,
});
const NOW = new Date("2026-11-07T15:00:00Z"); // 9 a.m. Saturday in Chicago

const load = (games: Array<ReturnType<typeof game> & { userPickTeam?: string; pickLimitReached?: boolean }>, userId: string | null = "user-1") =>
  loadPickEmGamePrizes({ games, venueId: "venue-1", userId: userId ?? undefined, now: NOW });

beforeEach(() => {
  store.prizes = [];
  store.prizesError = null;
  store.timezone = "America/Chicago";
  store.pickCount = 0;
  store.countError = null;
  store.countQueries = [];
  store.prizeReads = 0;
  clearPickEmPrizeLimitCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("pickemPrizeLineText", () => {
  const base: PickEmGamePrize = {
    campaignId: "p",
    kind: "tiers",
    when: "today",
    target: null,
    minPicks: null,
    limit: 20,
    tierCorrects: [12, 15, 18],
    picksLeft: 14,
    limitMessage: null,
    hasTiebreaker: false,
  };

  it("tiers: the ladder, the limit and the picks left", () => {
    expect(pickemPrizeLineText(base)).toBe("Prize today: 12, 15 or 18 of 20 right · 14 picks left");
    expect(pickemPrizeLineText({ ...base, picksLeft: 1 })).toBe("Prize today: 12, 15 or 18 of 20 right · 1 pick left");
    expect(pickemPrizeLineText({ ...base, picksLeft: 0 })).toBe("Prize today: 12, 15 or 18 of 20 right · 0 picks left");
    expect(pickemPrizeLineText({ ...base, tierCorrects: [12], picksLeft: null })).toBe("Prize today: 12 of 20 right");
  });

  it("get N right and most picks right", () => {
    expect(pickemPrizeLineText({ ...base, kind: "target", target: 10, limit: null, tierCorrects: [], picksLeft: null, when: "this week" })).toBe(
      "Prize this week: get 10 picks right",
    );
    expect(pickemPrizeLineText({ ...base, kind: "most_right", minPicks: 5, limit: null, tierCorrects: [], picksLeft: null })).toBe(
      "Prize today: most picks right · make 5 or more to qualify",
    );
    expect(pickemPrizeLineText({ ...base, kind: "most_right", minPicks: 1, limit: null, tierCorrects: [], picksLeft: null })).toBe(
      "Prize today: most picks right",
    );
  });

  it("never says Reward on screen", () => {
    expect(pickemPrizeLineText(base)).not.toMatch(/reward/i);
  });
});

describe("describePickEmPrizePeriodPhrase", () => {
  it("says today, this week, a day or a range", () => {
    const day = { startDate: "2026-11-07", endDate: "2026-11-07" };
    expect(describePickEmPrizePeriodPhrase(ON_SATURDAY, day, "2026-11-07")).toBe("today");
    expect(describePickEmPrizePeriodPhrase(ON_SATURDAY, day, "2026-11-04")).toBe("on Sat, Nov 7");
    expect(describePickEmPrizePeriodPhrase({ kind: "week" }, { startDate: "2026-11-02", endDate: "2026-11-08" }, "2026-11-07")).toBe("this week");
    expect(describePickEmPrizePeriodPhrase({ kind: "range", from: "2026-11-01", to: "2026-11-30" }, { startDate: "2026-11-01", endDate: "2026-11-30" }, "2026-11-07")).toBe(
      "from Nov 1 to Nov 30",
    );
  });
});

describe("loadPickEmGamePrizes", () => {
  it("answers nothing, with no extra read, when the bar has no prize for these games", async () => {
    expect(await load([game()])).toEqual([]);
    store.prizes = [prize({ pickemScope: { sports: ["soccer"], leagues: [] } })];
    clearPickEmPrizeLimitCache();
    expect(await load([game()])).toEqual([]);
    expect(store.countQueries).toHaveLength(0);
  });

  it("describes an 'out of N' prize with this player's picks left", async () => {
    store.prizes = [prize()];
    store.pickCount = 6;
    const [line] = await load([game()]);
    expect(line).toMatchObject({
      campaignId: "prize-1",
      kind: "tiers",
      when: "today",
      limit: 20,
      tierCorrects: [12, 15, 18],
      picksLeft: 14,
      limitMessage: null,
      hasTiebreaker: false,
    });
    // One indexed count, scoped to this player, bar and day.
    expect(store.countQueries).toHaveLength(1);
    expect(store.countQueries[0]).toContainEqual(["eq", "user_id", "user-1"]);
    expect(store.countQueries[0]).toContainEqual(["gte", "starts_at", "2026-11-07T06:00:00.000Z"]);
  });

  it("when the limit is used up it says why and blocks only the games not yet picked", async () => {
    store.prizes = [prize()];
    store.pickCount = 20;
    const fresh = game({ startsAt: "2026-11-07T19:00:00Z" });
    const picked = game({ startsAt: "2026-11-07T20:00:00Z", userPickTeam: "Alabama" });
    const [line] = await load([fresh, picked]);
    expect(line.picksLeft).toBe(0);
    expect(line.limitMessage).toBe("This bar's prize counts your first 20 college football picks today, and you've already used all 20.");
    expect(fresh).toMatchObject({ pickLimitReached: true });
    expect(picked).not.toHaveProperty("pickLimitReached");
  });

  it("does not block a game outside the prize's games or period", async () => {
    store.prizes = [prize({ pickemScope: { sports: [], leagues: ["americanfootball_ncaaf"] } })];
    store.pickCount = 20;
    const other = game({ sportSlug: "nba", sportKey: "basketball_nba" });
    const nextDay = game({ startsAt: "2026-11-08T18:00:00Z" });
    await load([other, nextDay]);
    expect(other).not.toHaveProperty("pickLimitReached");
    expect(nextDay).not.toHaveProperty("pickLimitReached");
  });

  it("signed out: the line shows the ladder but no picks left, and nothing is counted", async () => {
    store.prizes = [prize()];
    const [line] = await load([game()], null);
    expect(line.picksLeft).toBeNull();
    expect(store.countQueries).toHaveLength(0);
  });

  it("a failed count shows the line without a number, and blocks nothing", async () => {
    store.prizes = [prize()];
    store.countError = { message: "timeout" };
    const target = game();
    const [line] = await load([target]);
    expect(line.picksLeft).toBeNull();
    expect(target).not.toHaveProperty("pickLimitReached");
  });

  it("leaves out a prize whose period has already ended", async () => {
    store.prizes = [prize({ pickemWindow: { kind: "day", date: "2026-11-01" } })];
    expect(await load([game({ startsAt: "2026-11-01T18:00:00Z" })])).toEqual([]);
  });

  it("a read failure shows no prize line and never throws", async () => {
    store.prizesError = new Error("down");
    expect(await load([game()])).toEqual([]);
    expect(console.error).toHaveBeenCalledWith("[PickEmPrize] game-prizes-failed", expect.objectContaining({ venueId: "venue-1" }));
  });

  it("get N right and most right need no count; the tiebreaker belongs to today's period only", async () => {
    store.prizes = [
      prize({ id: "target", winCondition: "points_threshold", pickemPickLimit: null, pickemTiers: null, pointsRequiredToWin: 10 }),
      prize({ id: "most", winCondition: "game_winner", pickemPickLimit: null, pickemTiers: null, pickemMinPicks: 5, pickemWindow: { kind: "week" } }),
      prize({ id: "most-later", winCondition: "game_winner", pickemPickLimit: null, pickemTiers: null, pickemMinPicks: 5, pickemWindow: { kind: "day", date: "2026-11-08" } }),
    ];
    const lines = await load([game(), game({ startsAt: "2026-11-08T18:00:00Z" })]);
    expect(store.countQueries).toHaveLength(0);
    expect(lines.map((line) => [line.campaignId, line.kind, line.when, line.hasTiebreaker])).toEqual([
      ["target", "target", "today", false],
      ["most", "most_right", "this week", true],
      ["most-later", "most_right", "on Sun, Nov 8", false],
    ]);
    expect(lines[0].target).toBe(10);
    expect(lines[1].minPicks).toBe(5);
  });

  it("reads the bar's prizes once a minute, however many times the list loads", async () => {
    store.prizes = [prize()];
    await load([game()]);
    await load([game()]);
    expect(store.prizeReads).toBe(1);
  });
});

describe("a Pick 'Em coupon says what it was won for", () => {
  const win = (terms: Record<string, unknown>, cycleStart: string): ChallengeCampaignWin =>
    ({
      challengeId: "prize-1",
      venueId: "venue-1",
      challengeName: "Pick 'Em Challenge",
      challengeRules: "",
      winnerUserId: "user-1",
      cycleStart,
      rewardTerms: {
        rewardDefinitionId: "pickem_challenge",
        winCondition: "points_threshold",
        recurringType: "none",
        pointsRequiredToWin: 1,
        activeDays: [],
        winnerQuota: 1,
        nflWeekScope: null,
        gameWinnerSlots: null,
        pickemScope: COLLEGE,
        pickemWindow: ON_SATURDAY,
        pickemPickLimit: 20,
        pickemTiers: TIERS,
        pickemMinPicks: null,
        ...terms,
      },
    }) as unknown as ChallengeCampaignWin;

  it("names the tier reached, the limit, the games and the day", async () => {
    // Saturday midnight in Chicago + 2 seconds = the 15-right tier.
    const [coupon] = await attachRewardWinDescriptions([win({}, "2026-11-07T06:00:02+00:00")], "venue-1");
    expect(coupon.winDescription).toBe("You got 15 of 20 college football picks right on Sat, Nov 7");
  });

  it("most right and get N right", async () => {
    const [most] = await attachRewardWinDescriptions(
      [win({ winCondition: "game_winner", pickemPickLimit: null, pickemTiers: null, pickemMinPicks: 5 }, "2026-11-07T06:00:00+00:00")],
      "venue-1",
    );
    expect(most.winDescription).toMatch(/most college football picks right on Sat, Nov 7/i);
    const [target] = await attachRewardWinDescriptions(
      [win({ pickemPickLimit: null, pickemTiers: null, pointsRequiredToWin: 10 }, "2026-11-07T06:00:00+00:00")],
      "venue-1",
    );
    expect(target.winDescription).toMatch(/10/);
    expect(target.winDescription).toMatch(/college football/);
  });

  it("without the prize's terms the coupon keeps 'Won from: …' (no description)", async () => {
    const [coupon] = await attachRewardWinDescriptions(
      [win({ pickemScope: undefined, pickemWindow: undefined }, "2026-11-07T06:00:02+00:00")],
      "venue-1",
    );
    expect(coupon.winDescription).toBeNull();
  });

  it("a stored tiers array round-trips into the same words", () => {
    expect(serializePickEmPrizeTiers(TIERS)).toHaveLength(3);
  });
});
