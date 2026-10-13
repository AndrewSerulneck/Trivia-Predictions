import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NFLWeek, NFLWeekDates } from "@/lib/nflPickEm";

// The upcoming state decides whether the venue Rewards panel shows an NFL reward
// as "Upcoming · Starts <date>" instead of a live progress bar. A weekly NFL
// reward created before the season has REAL cycles running from the moment it is
// created (deriveNFLWeekScopeTerms → cadence "weekly", startDate null), so
// without this it would read as "In Progress · 0 / N pts" for weeks.
// See docs/nfl-pickem-week1-early-access-plan.md.
//
// attachRewardDescriptions is its only production caller (the standalone
// attachNFLRewardUpcomingState export was deleted in the review-fixes plan,
// Phase 1), so the cases are pinned through it.

const mocks = vi.hoisted(() => ({
  listNFLSeasonWeekDates: vi.fn(async (_season: number): Promise<NFLWeekDates[]> => []),
  listNFLWeeks: vi.fn(async (): Promise<NFLWeek[]> => []),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/liveShowdownAdmin", () => ({
  listVenueLiveShowdownSchedules: vi.fn(async () => []),
}));
vi.mock("@/lib/challengeCampaigns", () => ({
  createChallengeCampaign: vi.fn(async () => ({ id: "reward-1" })),
}));
vi.mock("@/lib/nflPickEm", () => ({
  listNFLSeasonWeekDates: mocks.listNFLSeasonWeekDates,
  listNFLWeeks: mocks.listNFLWeeks,
}));
vi.mock("@/lib/timezone", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/timezone")>();
  return { ...actual, getVenueTimezone: vi.fn(async () => "America/Los_Angeles") };
});

import { attachRewardDescriptions, attachRewardWinDescriptions } from "@/lib/rewards";
import type { ChallengeCampaign, ChallengeCampaignWin, NFLWeekScope } from "@/types";

type TestCampaign = {
  id: string;
  nflWeekScope?: NFLWeekScope | null;
  startDate?: string;
};

/** A full NFL reward row; `rewardDefinitionId: null` makes it a legacy (non-definition) one. */
const reward = ({ id, nflWeekScope, startDate }: TestCampaign, overrides: Partial<ChallengeCampaign> = {}): ChallengeCampaign => ({
  id,
  createdAt: "2026-07-01T00:00:00.000Z",
  name: "NFL Pick 'Em Challenge",
  rules: "",
  venueIds: ["venue-1"],
  scheduleType: "single_day",
  activeDays: ["thu", "fri", "sat", "sun", "mon", "tue", "wed"],
  gameTypes: ["nfl-pickem"],
  challengeMode: "progress",
  leaderboardDisplayLimit: 10,
  leaderboardTiebreaker: "first_to_score",
  pointMultiplier: 1,
  pointsRequiredToWin: 1,
  // Season and single-week rewards are one-offs (createReward's cadence "none").
  recurringType: nflWeekScope && nflWeekScope.kind !== "weekly" ? "none" : "weekly",
  winCondition: "game_winner",
  winnerQuota: 1,
  rewardDefinitionId: nflWeekScope ? "nfl_pickem_challenge" : null,
  prizeKind: "gift_card",
  prizeGiftCertificateAmount: 25,
  isActive: true,
  nflWeekScope: nflWeekScope ?? null,
  ...(startDate ? { startDate } : {}),
  ...overrides,
});

const attachUpcoming = (campaigns: TestCampaign[], now: Date) =>
  attachRewardDescriptions(campaigns.map((campaign) => reward(campaign)), "venue-1", now);

/**
 * A season whose opener is `openerDate` (null = no weeks synced). Week 2 is
 * listed FIRST so the test also proves the opener is the earliest start date,
 * not whichever row happens to come back first.
 */
const seasonOpeningOn = (openerDate: string | null): NFLWeekDates[] =>
  openerDate
    ? [
        { weekNumber: 2, weekStartDate: "2026-09-17", weekEndDate: "2026-09-22" },
        { weekNumber: 1, weekStartDate: openerDate, weekEndDate: "2026-09-15" },
      ]
    : [];

const WEEKLY: NFLWeekScope = { kind: "weekly", season: 2026 };
const SEASON: NFLWeekScope = { kind: "season", season: 2026, fromWeek: 7 };
const SINGLE_WEEK_9: NFLWeekScope = { kind: "single_week", season: 2026, week: 9 };

// Late July 2026 — well before the Sept 10 season opener.
const PRESEASON = new Date("2026-07-28T12:00:00.000Z");
// Mid-season.
const IN_SEASON = new Date("2026-10-20T12:00:00.000Z");

beforeEach(() => {
  mocks.listNFLSeasonWeekDates.mockReset();
  mocks.listNFLSeasonWeekDates.mockResolvedValue(seasonOpeningOn("2026-09-10"));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("attachRewardDescriptions — NFL upcoming state", () => {
  it("marks a weekly NFL reward upcoming before the season opens", async () => {
    const result = await attachUpcoming(
      [{ id: "r1", nflWeekScope: WEEKLY }],
      PRESEASON,
    );

    expect(result[0].upcomingStartDate).toBe("2026-09-10");
    // …and the guest-facing When line says the same thing.
    expect(result[0].description.when).toBe("Starts Thu, Sep 10. Get your picks in early.");
  });

  it("drops the flag once the season has started", async () => {
    const result = await attachUpcoming(
      [{ id: "r1", nflWeekScope: WEEKLY }],
      IN_SEASON,
    );

    expect(result[0].upcomingStartDate).toBeUndefined();
  });

  it("uses a season-long reward's own startDate, not the season opener", async () => {
    const result = await attachUpcoming(
      [{ id: "r1", nflWeekScope: SEASON, startDate: "2026-10-22" }],
      IN_SEASON,
    );

    expect(result[0].upcomingStartDate).toBe("2026-10-22");
  });

  it("treats a reward starting today as live, not upcoming", async () => {
    // Boundary: the panel must flip to a real progress bar on the start date
    // itself, in NFL Eastern time — not a day late.
    mocks.listNFLSeasonWeekDates.mockResolvedValue(seasonOpeningOn("2026-09-10"));
    const onOpeningDay = new Date("2026-09-10T16:00:00.000Z"); // noon ET

    const result = await attachUpcoming(
      [{ id: "r1", nflWeekScope: WEEKLY }],
      onOpeningDay,
    );

    expect(result[0].upcomingStartDate).toBeUndefined();
  });

  it("leaves non-NFL rewards untouched and does no lookups at all", async () => {
    const campaigns: TestCampaign[] = [
      { id: "r1" },
      { id: "r2", nflWeekScope: null },
    ];

    const result = await attachUpcoming(campaigns, PRESEASON);

    expect(result.map((campaign) => campaign.upcomingStartDate)).toEqual([undefined, undefined]);
    expect(mocks.listNFLSeasonWeekDates).not.toHaveBeenCalled();
  });

  it("looks each season up once, however many rewards share it", async () => {
    await attachUpcoming(
      [
        { id: "r1", nflWeekScope: WEEKLY },
        { id: "r2", nflWeekScope: WEEKLY },
        { id: "r3", nflWeekScope: SEASON, startDate: "2026-10-22" },
      ],
      PRESEASON,
    );

    expect(mocks.listNFLSeasonWeekDates).toHaveBeenCalledTimes(1);
    expect(mocks.listNFLSeasonWeekDates).toHaveBeenCalledWith(2026);
  });

  it("leaves the reward alone when the season has no weeks synced yet", async () => {
    mocks.listNFLSeasonWeekDates.mockResolvedValue(seasonOpeningOn(null));

    const result = await attachUpcoming(
      [{ id: "r1", nflWeekScope: WEEKLY }],
      PRESEASON,
    );

    expect(result[0].upcomingStartDate).toBeUndefined();
  });

  it("preserves every other field on the campaign", async () => {
    const result = await attachRewardDescriptions(
      [reward({ id: "r1", nflWeekScope: WEEKLY }, { name: "NFL Weekly Winner" })],
      "venue-1",
      PRESEASON,
    );

    expect(result[0]).toMatchObject({ id: "r1", name: "NFL Weekly Winner", upcomingStartDate: "2026-09-10" });
  });
});

// ── Single week (docs/nfl-pickem-single-week-reward-plan.md Phase 2) ──────────
describe("attachRewardDescriptions — NFL single week", () => {
  it("is upcoming until its own week starts, from its own startDate", async () => {
    const result = await attachUpcoming(
      [{ id: "r1", nflWeekScope: SINGLE_WEEK_9, startDate: "2026-11-05" }],
      IN_SEASON,
    );

    expect(result[0].upcomingStartDate).toBe("2026-11-05");
    expect(result[0].description.when).toBe("Starts Thu, Nov 5. Get your picks in early.");
  });

  it("is live once its week has started", async () => {
    const result = await attachUpcoming(
      [{ id: "r1", nflWeekScope: SINGLE_WEEK_9, startDate: "2026-11-05" }],
      new Date("2026-11-05T16:00:00.000Z"),
    );

    expect(result[0].upcomingStartDate).toBeUndefined();
  });

  it("never borrows the season opener as its start", async () => {
    // No stored startDate (never written by createReward, but fail safe): saying
    // "Starts Sep 10" for a Week 9 contest would be a lie.
    const result = await attachUpcoming([{ id: "r1", nflWeekScope: SINGLE_WEEK_9 }], PRESEASON);

    expect(result[0].upcomingStartDate).toBeUndefined();
  });
});

describe("attachRewardWinDescriptions — NFL single week", () => {
  const win = (overrides: Partial<ChallengeCampaignWin> = {}): ChallengeCampaignWin => ({
    challengeId: "r1",
    venueId: "venue-1",
    challengeName: "NFL Pick 'Em Challenge",
    challengeRules: "",
    winnerUserId: "user-1",
    rewardTerms: {
      rewardDefinitionId: "nfl_pickem_challenge",
      winCondition: "game_winner",
      recurringType: "none",
      pointsRequiredToWin: 1,
      activeDays: ["thu", "fri", "sat", "sun", "mon", "tue", "wed"],
      winnerQuota: 1,
      nflWeekScope: SINGLE_WEEK_9,
      gameWinnerSlots: null,
    },
    ...overrides,
  });

  it("names the reward's own week for a most-picks win, with no week lookup", async () => {
    // Most picks: the resolver keys the coupon on the campaign's start instant.
    const [result] = await attachRewardWinDescriptions(
      [win({ cycleStart: "2026-11-05T08:00:00.000Z" })],
      "venue-1",
    );

    expect(result.winDescription).toBe("You got the most NFL picks right in Week 9");
    expect(mocks.listNFLSeasonWeekDates).not.toHaveBeenCalled();
  });

  it("names the week for a picks-target win, whose coupon carries the one-off epoch cycle", async () => {
    const [result] = await attachRewardWinDescriptions(
      [
        win({
          cycleStart: "1970-01-01T00:00:00.000Z",
          rewardTerms: {
            rewardDefinitionId: "nfl_pickem_challenge",
            winCondition: "points_threshold",
            recurringType: "none",
            pointsRequiredToWin: 10,
            activeDays: ["thu", "fri", "sat", "sun", "mon", "tue", "wed"],
            winnerQuota: 3,
            nflWeekScope: SINGLE_WEEK_9,
            gameWinnerSlots: null,
          },
        }),
      ],
      "venue-1",
    );

    expect(result.winDescription).toBe("You got 10 NFL picks right in Week 9");
    expect(mocks.listNFLSeasonWeekDates).not.toHaveBeenCalled();
  });
});
