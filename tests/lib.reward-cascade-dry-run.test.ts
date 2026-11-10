import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminLiveShowdownSchedule } from "@/lib/liveShowdownAdmin";
import type { ChallengeCampaign } from "@/types";

// Phase A3 of docs/cancelled-prizes-pick-windows-away-mode-plan.md: the warning before a cancel or
// edit is a DRY RUN of the same cascade (lib/rewardGameSlotCascade.ts runCascade). It must never
// write a campaign or run a payout sweep, and it must simulate the change the real run sees after
// the write (the schedule dropped, or replaced by its edited form).

const mocks = vi.hoisted(() => ({
  listChallengeCampaigns: vi.fn(async (): Promise<ChallengeCampaign[]> => []),
  updateChallengeCampaign: vi.fn(async (input: Record<string, unknown>) => input as unknown as ChallengeCampaign),
  listVenueLiveShowdownSchedules: vi.fn(async (): Promise<AdminLiveShowdownSchedule[]> => []),
  resolveGameWinnerRewards: vi.fn(async () => ({ errors: [] as Array<{ scope: string; message: string }> })),
  resolveRankedPlaceRewards: vi.fn(async () => ({ errors: [] as Array<{ scope: string; message: string }> })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/challengeCampaigns", () => ({
  listChallengeCampaigns: mocks.listChallengeCampaigns,
  updateChallengeCampaign: mocks.updateChallengeCampaign,
}));
vi.mock("@/lib/liveShowdownAdmin", () => ({
  listVenueLiveShowdownSchedules: mocks.listVenueLiveShowdownSchedules,
}));
vi.mock("@/lib/liveTriviaWinnerRewards", () => ({
  resolveGameWinnerRewards: mocks.resolveGameWinnerRewards,
}));
vi.mock("@/lib/liveTriviaRankedRewards", () => ({
  resolveRankedPlaceRewards: mocks.resolveRankedPlaceRewards,
}));

import {
  describeScheduleChangePreview,
  mergeScheduleChangePreviews,
  previewScheduleChangeToRewards,
  simulateScheduleChange,
  type DryRunScheduleChange,
} from "@/lib/rewardGameSlotCascade";

// Monday 2026-11-09, noon Eastern.
const NOW = new Date("2026-11-09T17:00:00.000Z");

const schedule = (overrides: Partial<AdminLiveShowdownSchedule> = {}): AdminLiveShowdownSchedule => ({
  id: "sched-wed-fri",
  title: "Weekday Trivia",
  startTime: "2026-10-01T23:00:00.000Z",
  timezone: "America/New_York",
  recurringType: "weekly",
  recurringDays: ["wed", "thu", "fri"],
  numRounds: 3,
  venueId: "venue-1",
  intermissionAdDelaySeconds: 10,
  lobbyAdEnabled: true,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

const campaign = (overrides: Partial<ChallengeCampaign> = {}): ChallengeCampaign =>
  ({
    id: "ranked-1",
    createdAt: "2026-10-01T00:00:00.000Z",
    name: "Weekly top 3",
    rules: "",
    venueIds: ["venue-1"],
    scheduleType: "single_day",
    activeDays: ["wed", "thu", "fri"],
    gameTypes: ["live-trivia"],
    challengeMode: "progress",
    leaderboardDisplayLimit: 10,
    leaderboardTiebreaker: "earliest",
    pointMultiplier: 1,
    pointsRequiredToWin: 1,
    recurringType: "weekly",
    winCondition: "ranked_places",
    winnerQuota: 3,
    gameWinnerSlots: null,
    rewardDefinitionId: "live_trivia_challenge",
    isActive: true,
    winnerUserId: null,
    ...overrides,
  }) as ChallengeCampaign;

const pinnedWinner = (overrides: Partial<ChallengeCampaign> = {}) =>
  campaign({
    id: "pinned-1",
    name: "$50 gift card",
    winCondition: "game_winner",
    winnerQuota: 2,
    activeDays: ["wed", "fri"],
    gameWinnerSlots: [
      { scheduleId: "sched-wed-fri", weekday: "wed" },
      { scheduleId: "sched-wed-fri", weekday: "fri" },
    ],
    ...overrides,
  });

const cancelPreview = () =>
  previewScheduleChangeToRewards({
    scheduleId: "sched-wed-fri",
    venueId: "venue-1",
    survivingWeekdays: [],
    survivingRecurrence: null,
    now: NOW,
    schedule: null,
  });

const expectNoWritesOrPayouts = () => {
  expect(mocks.updateChallengeCampaign).not.toHaveBeenCalled();
  expect(mocks.resolveGameWinnerRewards).not.toHaveBeenCalled();
  expect(mocks.resolveRankedPlaceRewards).not.toHaveBeenCalled();
};

beforeEach(() => {
  mocks.listChallengeCampaigns.mockReset();
  mocks.updateChallengeCampaign.mockClear();
  mocks.listVenueLiveShowdownSchedules.mockReset();
  // Before the write: the schedule being changed is still in the venue's list.
  mocks.listVenueLiveShowdownSchedules.mockResolvedValue([schedule()]);
  mocks.resolveGameWinnerRewards.mockClear();
  mocks.resolveRankedPlaceRewards.mockClear();
});

describe("cancel preview", () => {
  it("names a weekly places prize that would end with the venue's last game, writing and paying nothing", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([campaign()]);

    const preview = await cancelPreview();

    expect(preview).toEqual({ ending: ["Weekly top 3"], shrinking: [] });
    expectNoWritesOrPayouts();
  });

  it("names a slot-pinned prize whose only game is cancelled (rules 1–3)", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([pinnedWinner()]);

    expect(await cancelPreview()).toEqual({ ending: ["$50 gift card"], shrinking: [] });
    expectNoWritesOrPayouts();
  });

  it("is empty when another game is left for the prize", async () => {
    mocks.listVenueLiveShowdownSchedules.mockResolvedValue([
      schedule(),
      schedule({ id: "sched-sat", recurringDays: ["sat"] }),
    ]);
    mocks.listChallengeCampaigns.mockResolvedValue([campaign()]);

    expect(await cancelPreview()).toEqual({ ending: [], shrinking: [] });
    expectNoWritesOrPayouts();
  });

  it("ignores prizes at other venues and inactive ones", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([
      campaign({ id: "other", venueIds: ["venue-2"] }),
      campaign({ id: "off", isActive: false }),
    ]);

    expect(await cancelPreview()).toEqual({ ending: [], shrinking: [] });
  });
});

describe("edit preview", () => {
  const editTo = (edit: Partial<NonNullable<DryRunScheduleChange["schedule"]>>, survivingWeekdays: string[]) =>
    previewScheduleChangeToRewards({
      scheduleId: "sched-wed-fri",
      venueId: "venue-1",
      survivingWeekdays,
      survivingRecurrence: "weekly",
      now: NOW,
      schedule: {
        startTime: "2026-10-01T23:00:00.000Z",
        timezone: "America/New_York",
        recurringType: "weekly",
        recurringDays: ["wed", "thu", "fri"],
        numRounds: 3,
        venueId: "venue-1",
        ...edit,
      },
    });

  it("names a slot-pinned prize that would cover fewer games", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([pinnedWinner()]);

    expect(await editTo({ recurringDays: ["wed"] }, ["wed"])).toEqual({ ending: [], shrinking: ["$50 gift card"] });
    expectNoWritesOrPayouts();
  });

  it("names a points prize whose days lose every game, using the EDITED schedule", async () => {
    // Points accrue only on Wed–Fri; the game moves to Mondays.
    mocks.listChallengeCampaigns.mockResolvedValue([
      campaign({ id: "points-1", name: "500 points", winCondition: "points_threshold", pointsRequiredToWin: 500 }),
    ]);

    expect(await editTo({ recurringDays: ["mon"] }, ["mon"])).toEqual({ ending: ["500 points"], shrinking: [] });
    expectNoWritesOrPayouts();
  });

  it("keeps a weekly places prize while the edited game still runs", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([campaign()]);

    expect(await editTo({ recurringDays: ["mon"] }, ["mon"])).toEqual({ ending: [], shrinking: [] });
  });

  it("names a pinned weekly prize when the game becomes a one-off (rule 3)", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([pinnedWinner()]);

    const preview = await previewScheduleChangeToRewards({
      scheduleId: "sched-wed-fri",
      venueId: "venue-1",
      survivingWeekdays: ["wed"],
      survivingRecurrence: "none",
      now: NOW,
      schedule: {
        startTime: "2026-11-12T01:00:00.000Z",
        timezone: "America/New_York",
        recurringType: "none",
        recurringDays: [],
        numRounds: 3,
        venueId: "venue-1",
      },
    });

    expect(preview).toEqual({ ending: ["$50 gift card"], shrinking: [] });
    expectNoWritesOrPayouts();
  });
});

describe("simulateScheduleChange", () => {
  const edit = {
    startTime: "2026-11-12T01:00:00.000Z",
    timezone: "America/New_York",
    recurringType: "none" as const,
    recurringDays: [],
    numRounds: 2,
    venueId: "venue-1",
  };

  it("drops the schedule on a cancel or a move away", () => {
    expect(simulateScheduleChange([schedule()], "sched-wed-fri", "venue-1", { schedule: null })).toEqual([]);
    expect(
      simulateScheduleChange([schedule()], "sched-wed-fri", "venue-1", { schedule: { ...edit, venueId: "venue-2" } }),
    ).toEqual([]);
  });

  it("replaces it with the edited form, keeping the stored fields an edit can't change", () => {
    const [row] = simulateScheduleChange([schedule()], "sched-wed-fri", "venue-1", { schedule: edit });
    expect(row).toMatchObject({ ...edit, id: "sched-wed-fri", title: "Weekday Trivia", lobbyAdEnabled: true });
  });

  it("builds the row from the edit when the read didn't return it (an ended one-off moved forward)", () => {
    const [row] = simulateScheduleChange([], "sched-old", "venue-1", { schedule: edit });
    expect(row).toMatchObject({ ...edit, id: "sched-old" });
  });
});

describe("describeScheduleChangePreview", () => {
  it("is null when nothing would end or shrink", () => {
    expect(describeScheduleChangePreview({ ending: [], shrinking: [] })).toBeNull();
  });

  it("names what ends, then what shrinks, in one short line", () => {
    expect(
      describeScheduleChangePreview(
        mergeScheduleChangePreviews(
          { ending: ["$50 gift card"], shrinking: [] },
          { ending: ["500 points"], shrinking: ["Weekly top 3"] },
        ),
      ),
    ).toBe("Also ends: $50 gift card, 500 points. Covers fewer games: Weekly top 3.");
  });
});
