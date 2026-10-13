import { describe, expect, it } from "vitest";

import { isCampaignEligibleForAccrual } from "@/lib/challengeCampaigns";
import { nflSingleWeekAccrualWindow } from "@/lib/nflPickEmRewardAccrual";
import type { ChallengeCampaign, NFLWeekScope } from "@/types";

/**
 * docs/nfl-pickem-single-week-reward-plan.md Phase 2, step 4: a picks-target
 * "Single week" reward counts picks from THAT week only.
 *
 * Runs the REAL engine predicate (isCampaignEligibleForAccrual) on the exact
 * campaign createReward writes. Without the window, the stored Thu→Mon dates are
 * wrong in both directions — the single-day path has no start bound (earlier
 * weeks' picks leak in) and ends at Monday 23:59 UTC (Monday Night Football,
 * Tue ~01:15 UTC, is dropped). Both gaps are pinned below so a refactor that
 * stops passing the window fails loudly.
 */

// Week 9 of 2026, as stored in production: Thu 2026-11-05 → Mon 2026-11-09.
const WEEK_9_START = "2026-11-05";
const WEEK_9_END = "2026-11-09";

const singleWeekCampaign = (overrides: Partial<ChallengeCampaign> = {}): ChallengeCampaign =>
  ({
    id: "camp-single",
    createdAt: "2026-10-12T15:00:00.000Z",
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
    pointsRequiredToWin: 10,
    recurringType: "none",
    startDate: WEEK_9_START,
    endDate: WEEK_9_END,
    winCondition: "points_threshold",
    winnerQuota: 3,
    rewardDefinitionId: "nfl_pickem_challenge",
    nflWeekScope: { kind: "single_week", season: 2026, week: 9 } as NFLWeekScope,
    isActive: true,
    ...overrides,
  }) as ChallengeCampaign;

const ZONE = "America/Los_Angeles";

const eligible = (campaign: ChallengeCampaign, kickoffIso: string, withWindow = true): boolean =>
  isCampaignEligibleForAccrual(
    campaign,
    new Date(kickoffIso),
    "nfl-pickem",
    ZONE,
    withWindow ? nflSingleWeekAccrualWindow(campaign) : null,
  );

describe("single-week accrual window", () => {
  const campaign = singleWeekCampaign();

  it("counts every game of its own week, Monday Night Football included", () => {
    // Wednesday-evening opener (Weeks 1 and 12 of 2026 open this way).
    expect(eligible(campaign, "2026-11-05T01:00:00.000Z")).toBe(true);
    // Thursday Night Football.
    expect(eligible(campaign, "2026-11-06T01:15:00.000Z")).toBe(true);
    // Sunday 1 PM Eastern.
    expect(eligible(campaign, "2026-11-08T18:00:00.000Z")).toBe(true);
    // Monday Night Football — Mon 8:15 PM Eastern = Tue 01:15 UTC.
    expect(eligible(campaign, "2026-11-10T01:15:00.000Z")).toBe(true);
  });

  it("counts nothing from the week before or after", () => {
    // Week 8's Sunday and Monday night games.
    expect(eligible(campaign, "2026-11-01T18:00:00.000Z")).toBe(false);
    expect(eligible(campaign, "2026-11-03T01:15:00.000Z")).toBe(false);
    // Week 10's Thursday and Sunday games.
    expect(eligible(campaign, "2026-11-13T01:15:00.000Z")).toBe(false);
    expect(eligible(campaign, "2026-11-15T18:00:00.000Z")).toBe(false);
  });

  it("uses the shared Tue 05:00 UTC week span, half-open", () => {
    expect(nflSingleWeekAccrualWindow(campaign)).toEqual({
      startMs: Date.parse("2026-11-03T05:00:00.000Z"),
      endMsExclusive: Date.parse("2026-11-10T05:00:00.000Z"),
    });
    expect(eligible(campaign, "2026-11-03T05:00:00.000Z")).toBe(true);
    expect(eligible(campaign, "2026-11-03T04:59:59.999Z")).toBe(false);
    expect(eligible(campaign, "2026-11-10T05:00:00.000Z")).toBe(false);
  });

  it("pins the two gaps the window closes (the engine's date gates alone)", () => {
    // Earlier weeks leak in: the single-day path has no start bound.
    expect(eligible(campaign, "2026-11-01T18:00:00.000Z", false)).toBe(true);
    // Monday Night Football is dropped: it kicks off after Monday 23:59 UTC.
    expect(eligible(campaign, "2026-11-10T01:15:00.000Z", false)).toBe(false);
  });

  it("still honors the activity gates inside the window", () => {
    const inWeek = "2026-11-08T18:00:00.000Z";
    expect(eligible(singleWeekCampaign({ isActive: false }), inWeek)).toBe(false);
    expect(eligible(singleWeekCampaign({ winnerUserId: "user-1" }), inWeek)).toBe(false);
    expect(eligible(singleWeekCampaign({ gameTypes: ["pickem"] }), inWeek)).toBe(false);
  });

  it("fails closed on a single-week reward with no usable start date", () => {
    const broken = singleWeekCampaign({ startDate: undefined });
    expect(nflSingleWeekAccrualWindow(broken)).toEqual({ startMs: Number.NaN, endMsExclusive: Number.NaN });
    expect(eligible(broken, "2026-11-08T18:00:00.000Z")).toBe(false);
    expect(eligible(singleWeekCampaign({ startDate: "11/05/2026" }), "2026-11-08T18:00:00.000Z")).toBe(false);
  });

  it("still windows a stored single_week whose week number the strict normalizer rejects", () => {
    // The engine's looser round-trip loads { week: 31 } as single_week; it must
    // get the exact window (fail closed), never the leaky date gates.
    const odd = singleWeekCampaign({ nflWeekScope: { kind: "single_week", season: 2026, week: 31 } });
    expect(nflSingleWeekAccrualWindow(odd)).not.toBeNull();
    expect(eligible(odd, "2026-10-25T18:00:00.000Z")).toBe(false);
  });

  it("leaves every other NFL reward on the engine's normal gates", () => {
    const weekly = singleWeekCampaign({
      recurringType: "weekly",
      startDate: undefined,
      endDate: undefined,
      nflWeekScope: { kind: "weekly", season: 2026 },
    });
    const season = singleWeekCampaign({ nflWeekScope: { kind: "season", season: 2026, fromWeek: 9 } });
    expect(nflSingleWeekAccrualWindow(weekly)).toBeNull();
    expect(nflSingleWeekAccrualWindow(season)).toBeNull();
    expect(nflSingleWeekAccrualWindow(singleWeekCampaign({ nflWeekScope: null }))).toBeNull();
  });
});
