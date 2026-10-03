import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NFLWeek, NFLWeekDates } from "@/lib/nflPickEm";

// attachNFLRewardUpcomingState decides whether the venue Rewards panel shows an
// NFL reward as "Upcoming · Starts <date>" instead of a live progress bar. A
// weekly NFL reward created before the season has REAL cycles running from the
// moment it is created (deriveNFLWeekScopeTerms → cadence "weekly", startDate
// null), so without this it would read as "In Progress · 0 / N pts" for weeks.
// See docs/nfl-pickem-week1-early-access-plan.md.

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

import { attachNFLRewardUpcomingState } from "@/lib/rewards";
import type { NFLWeekScope } from "@/types";

type TestCampaign = {
  id: string;
  nflWeekScope?: NFLWeekScope | null;
  startDate?: string;
};

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

describe("attachNFLRewardUpcomingState", () => {
  it("marks a weekly NFL reward upcoming before the season opens", async () => {
    const result = await attachNFLRewardUpcomingState<TestCampaign>(
      [{ id: "r1", nflWeekScope: WEEKLY }],
      PRESEASON,
    );

    expect(result[0].upcomingStartDate).toBe("2026-09-10");
  });

  it("drops the flag once the season has started", async () => {
    const result = await attachNFLRewardUpcomingState<TestCampaign>(
      [{ id: "r1", nflWeekScope: WEEKLY }],
      IN_SEASON,
    );

    expect(result[0].upcomingStartDate).toBeUndefined();
  });

  it("uses a season-long reward's own startDate, not the season opener", async () => {
    const result = await attachNFLRewardUpcomingState<TestCampaign>(
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

    const result = await attachNFLRewardUpcomingState<TestCampaign>(
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

    const result = await attachNFLRewardUpcomingState(campaigns, PRESEASON);

    expect(result).toEqual(campaigns);
    expect(mocks.listNFLSeasonWeekDates).not.toHaveBeenCalled();
  });

  it("looks each season up once, however many rewards share it", async () => {
    await attachNFLRewardUpcomingState<TestCampaign>(
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

    const result = await attachNFLRewardUpcomingState<TestCampaign>(
      [{ id: "r1", nflWeekScope: WEEKLY }],
      PRESEASON,
    );

    expect(result[0].upcomingStartDate).toBeUndefined();
  });

  it("preserves every other field on the campaign", async () => {
    const result = await attachNFLRewardUpcomingState<TestCampaign & { name: string }>(
      [{ id: "r1", name: "NFL Weekly Winner", nflWeekScope: WEEKLY }],
      PRESEASON,
    );

    expect(result[0]).toMatchObject({ id: "r1", name: "NFL Weekly Winner" });
  });
});
