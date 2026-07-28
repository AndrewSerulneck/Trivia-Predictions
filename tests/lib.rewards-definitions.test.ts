import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminLiveShowdownSchedule } from "@/lib/liveShowdownAdmin";
import type { NFLWeek } from "@/lib/nflPickEm";

// ── Mocks ────────────────────────────────────────────────────────────────────
// rewards.ts is server-only and leans on two module boundaries: the schedule
// reader (listAdminLiveShowdownSchedules) and the engine (createChallengeCampaign).
// We stub both — the schedule reader returns fixtures, and createChallengeCampaign
// captures the expansion input so we can assert the engine field mapping without a DB.
// The NFL Pick 'Em Challenge adds a THIRD boundary: the season calendar
// (listNFLWeeks over nfl_pickem_weeks). Stubbed the same way, so the NFL branch
// is asserted without a DB and without the update_nfl_week_status RPC.
const mocks = vi.hoisted(() => ({
  listAdminLiveShowdownSchedules: vi.fn(async (): Promise<AdminLiveShowdownSchedule[]> => []),
  createChallengeCampaign: vi.fn(async (input: Record<string, unknown>) => ({ id: "reward-1", ...input })),
  listNFLWeeks: vi.fn(async (): Promise<NFLWeek[]> => []),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/liveShowdownAdmin", () => ({
  listAdminLiveShowdownSchedules: mocks.listAdminLiveShowdownSchedules,
}));
vi.mock("@/lib/nflPickEm", () => ({
  listNFLWeeks: mocks.listNFLWeeks,
}));
vi.mock("@/lib/challengeCampaigns", () => ({
  createChallengeCampaign: mocks.createChallengeCampaign,
}));

import {
  REWARD_DEFINITIONS,
  SUPPORTED_REWARD_CADENCES,
  getRewardDefinition,
  renderRewardRequirement,
} from "@/lib/rewardDefinitions";
import {
  REWARD_NFL_SEASON_UNAVAILABLE_MESSAGE,
  REWARD_REQUIRES_SCHEDULED_GAME_MESSAGE,
  REWARD_UNKNOWN_DEFINITION_MESSAGE,
  REWARD_INVALID_PRIZE_MESSAGE,
  createReward,
  resolveRewardCreationContext,
  type RewardPrizeInput,
} from "@/lib/rewards";
import {
  REWARD_TERMS_ONE_OFF_ONLY_MESSAGE,
  quantityOutOfRangeMessage,
} from "@/lib/rewardTerms";
import {
  NFL_WEEK_SCOPE_INVALID_MESSAGE,
  NFL_WEEK_WINNER_QUANTITY_MESSAGE,
  type NFLRewardWeekScope,
} from "@/lib/nflPickEmRewardWeeks";
import type { ChallengeWinCondition } from "@/types";

function makeSchedule(overrides: Partial<AdminLiveShowdownSchedule> = {}): AdminLiveShowdownSchedule {
  return {
    id: "sched-1",
    title: "Tuesday Trivia",
    // 2026-07-21 is a Tuesday; 19:00 America/New_York.
    startTime: "2026-07-21T23:00:00.000Z",
    timezone: "America/New_York",
    recurringType: "weekly",
    recurringDays: ["tue"],
    numRounds: 5,
    venueId: "venue-1",
    intermissionAdDelaySeconds: 0,
    lobbyAdEnabled: false,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

const APPETIZER_PRIZE: RewardPrizeInput = {
  prizeKind: "menu_item",
  menuItem: "appetizer",
  discountKind: "percent",
  discountValue: 50,
};

beforeEach(() => {
  mocks.listAdminLiveShowdownSchedules.mockReset();
  mocks.createChallengeCampaign.mockClear();
  mocks.listNFLWeeks.mockReset();
  mocks.listNFLWeeks.mockResolvedValue([]);
  // Fixtures below are anchored on 2026-07-21 (a Tuesday); freeze "now" the day
  // before so that date reads as upcoming, not a stale past occurrence — see
  // hasLiveOrUpcomingOccurrence in lib/rewards.ts.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-20T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reward definition registry", () => {
  it("exposes the Live Trivia Challenge definition and renders its requirement copy", () => {
    const def = getRewardDefinition("live_trivia_challenge");
    expect(def).not.toBeNull();
    expect(def?.gameType).toBe("live-trivia");
    expect(def?.challengeMode).toBe("progress");
    expect(def?.requiresScheduledGame).toBe("live_trivia");
    expect(renderRewardRequirement(def!, 500)).toBe("Earn 500 points in Live Trivia");
    expect(getRewardDefinition("nope")).toBeNull();
  });

  it("only offers cadences the engine actually supports", () => {
    // All four recurrences have real cycle windows since the terms-sentence
    // rebuild (docs/rewards-terms-sentence-plan.md Phase 1). What a given VENUE
    // may pick is narrowed separately by its Live Trivia schedule.
    expect([...SUPPORTED_REWARD_CADENCES]).toEqual(["none", "daily", "weekly", "monthly", "yearly"]);
    // Every definition is progress mode (leaderboard is retired from creation).
    expect(REWARD_DEFINITIONS.every((d) => d.challengeMode === "progress")).toBe(true);
  });
});

describe("resolveRewardCreationContext", () => {
  it("blocks when Live Trivia is not scheduled at the venue", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([]);
    const ctx = await resolveRewardCreationContext("venue-1", "live_trivia_challenge");
    expect(ctx.scheduled).toBe(false);
    expect(ctx.allowedCadences).toEqual([]);
  });

  it("offers every period a weekly schedule can fill, and anchors on its days", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeSchedule()]);
    const ctx = await resolveRewardCreationContext("venue-1", "live_trivia_challenge");
    expect(ctx.scheduled).toBe(true);
    expect(ctx.hasRecurringSchedule).toBe(true);
    // Tuesday-only trivia guarantees a game every week, month, and year — but
    // not every day, so "daily" is never offered.
    expect(ctx.allowedCadences).toEqual(["none", "weekly", "monthly", "yearly"]);
    expect(ctx.scheduleDays).toEqual(["tue"]);
    expect(ctx.scheduleShapes).toEqual([{ recurringType: "weekly", weekdayCount: 1 }]);
  });

  it("offers a daily period only when the venue runs Live Trivia every day", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([
      makeSchedule({ recurringType: "daily", recurringDays: [] }),
    ]);
    const ctx = await resolveRewardCreationContext("venue-1", "live_trivia_challenge");
    expect(ctx.allowedCadences).toEqual(["none", "daily", "weekly", "monthly", "yearly"]);
  });

  it("reports a daily schedule as running EVERY weekday, not just its start_time's", async () => {
    // Regression (found in Phase 6 browser verification): falling back to the
    // start_time weekday made a daily venue report scheduleDays ["tue"], which
    // became the reward's activeDays and killed accrual six days in seven.
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([
      makeSchedule({ recurringType: "daily", recurringDays: [] }),
    ]);
    const ctx = await resolveRewardCreationContext("venue-1", "live_trivia_challenge");
    expect([...ctx.scheduleDays].sort()).toEqual(["fri", "mon", "sat", "sun", "thu", "tue", "wed"]);
  });

  it("treats a monthly-only schedule as one-off (the engine never actually recurs it)", async () => {
    // enumerateScheduleOccurrences (lib/liveShowdownEngine.ts) collapses
    // monthly/yearly trivia_schedules rows to a single fixed start — nothing
    // ever advances them forward — so reward terms must not treat one as a real
    // recurring cadence either: allowedCadences offers only a one-off.
    //
    // scheduleDays IS the start weekday, though. The game really does run, once,
    // on that day, and returning [] here used to drop the schedule out of the
    // game picker entirely (enumerateGameSlots skips a schedule with no
    // resolvable weekday) while the context still reported the venue as
    // scheduled — stranding the partner on a "no games scheduled" step with a
    // dead Next button.
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([
      makeSchedule({ recurringType: "monthly", recurringDays: [] }),
    ]);
    const ctx = await resolveRewardCreationContext("venue-1", "live_trivia_challenge");
    expect(ctx.scheduleDays).toEqual(["tue"]);
    expect(ctx.scheduleShapes).toEqual([{ recurringType: "none", weekdayCount: 1 }]);
    expect(ctx.allowedCadences).toEqual(["none"]);
    // The whole point: it is now pinnable, as a single dated game.
    expect(ctx.gameSlots).toHaveLength(1);
    expect(ctx.gameSlots[0].recurring).toBe(false);
    expect(ctx.gameSlots[0].weekday).toBe("tue");
  });

  it("refuses a locked game-winner reward once a stray one-off game joins a weekly schedule", async () => {
    // A one-off Live Trivia game alongside the recurring weekly one adds a
    // winner in whichever week it lands, breaking the "same count every week"
    // promise a locked game-winner reward makes.
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([
      makeSchedule(),
      makeSchedule({
        id: "sched-2",
        recurringType: "none",
        recurringDays: [],
        startTime: "2026-07-22T23:00:00.000Z", // a Wednesday one-off, still upcoming
      }),
    ]);
    await expect(
      createReward({
        venueId: "venue-1",
        definitionId: "live_trivia_challenge",
        cadence: "weekly",
        winCondition: "game_winner",
        threshold: 500,
        winnerQuota: 1,
        prize: APPETIZER_PRIZE,
      }),
    ).rejects.toThrow(/don't run the same number of Live Trivia games every week/);
  });

  it("offers only a one-off for a non-recurring schedule, anchoring on the start_time weekday", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([
      makeSchedule({ recurringType: "none", recurringDays: [] }),
    ]);
    const ctx = await resolveRewardCreationContext("venue-1", "live_trivia_challenge");
    expect(ctx.hasRecurringSchedule).toBe(false);
    expect(ctx.allowedCadences).toEqual(["none"]);
    // 2026-07-21T23:00Z is Tuesday 19:00 in America/New_York.
    expect(ctx.scheduleDays).toEqual(["tue"]);
  });

  it("filters schedules to the requested venue only", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([
      makeSchedule({ venueId: "other-venue" }),
    ]);
    const ctx = await resolveRewardCreationContext("venue-1", "live_trivia_challenge");
    expect(ctx.scheduled).toBe(false);
  });

  it("drops a schedule with an unparseable start_time entirely (can't tell if it's live/upcoming)", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([
      makeSchedule({ recurringType: "weekly", recurringDays: [], startTime: "not-a-date" }),
    ]);
    const ctx = await resolveRewardCreationContext("venue-1", "live_trivia_challenge");
    expect(ctx.scheduled).toBe(false);
    expect(ctx.allowedCadences).toEqual([]);
  });

  it("blocks when the only schedule is a one-off game that has already ended", async () => {
    // Same shape as a real "no Live Trivia scheduled" venue: a past one-off
    // game whose trivia_schedules row was never deleted. This is the exact bug
    // reported in production — a stale row must NOT count as "scheduled".
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([
      makeSchedule({
        recurringType: "none",
        recurringDays: [],
        startTime: "2026-07-10T23:00:00.000Z", // 10 days before frozen "now"
      }),
    ]);
    const ctx = await resolveRewardCreationContext("venue-1", "live_trivia_challenge");
    expect(ctx.scheduled).toBe(false);
    expect(ctx.allowedCadences).toEqual([]);
  });

  it("allows a one-off game whose window is currently live (started before now, hasn't ended)", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([
      makeSchedule({
        recurringType: "none",
        recurringDays: [],
        startTime: "2026-07-20T11:00:00.000Z", // 1 hour before frozen "now"; a 5-round game runs well past that
      }),
    ]);
    const ctx = await resolveRewardCreationContext("venue-1", "live_trivia_challenge");
    expect(ctx.scheduled).toBe(true);
  });

  it("allows a recurring schedule whose first occurrence was in the past but future occurrences remain", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([
      makeSchedule({
        recurringType: "weekly",
        recurringDays: ["tue"],
        startTime: "2026-01-06T23:00:00.000Z", // first occurrence months before frozen "now"
      }),
    ]);
    const ctx = await resolveRewardCreationContext("venue-1", "live_trivia_challenge");
    expect(ctx.scheduled).toBe(true);
    expect(ctx.hasRecurringSchedule).toBe(true);
    expect(ctx.allowedCadences).toEqual(["none", "weekly", "monthly", "yearly"]);
  });
});

describe("createReward — expansion + validation", () => {
  it("expands a weekly Live Trivia Challenge into the proven engine field shape", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeSchedule()]);

    await createReward({
      venueId: "venue-1",
      definitionId: "live_trivia_challenge",
      cadence: "weekly",
      threshold: 500,
      winnerQuota: 5,
      prize: APPETIZER_PRIZE,
      createdByOwnerId: "owner-9",
    });

    expect(mocks.createChallengeCampaign).toHaveBeenCalledTimes(1);
    expect(mocks.createChallengeCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Live Trivia Challenge",
        rules: "Earn 500 points in Live Trivia",
        venueIds: ["venue-1"],
        gameTypes: ["live-trivia"],
        challengeMode: "progress",
        pointsRequiredToWin: 500,
        scheduleType: "single_day",
        recurringType: "weekly",
        activeDays: ["tue"], // weekly cycle anchored on the Live Trivia day
        winnerQuota: 5,
        rewardDefinitionId: "live_trivia_challenge",
        prizeKind: "menu_item",
        prizeMenuItem: "appetizer",
        prizeDiscountKind: "percent",
        prizeDiscountValue: 50,
        prizeGiftCertificateAmount: null,
        createdByOwnerId: "owner-9",
      }),
    );
  });

  it("expands a one-off reward with no day restriction", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeSchedule()]);

    await createReward({
      venueId: "venue-1",
      definitionId: "live_trivia_challenge",
      cadence: "none",
      threshold: 750,
      winnerQuota: 1,
      prize: { prizeKind: "gift_card", amount: 25 },
    });

    expect(mocks.createChallengeCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        recurringType: "none",
        activeDays: [],
        winnerQuota: 1,
        prizeKind: "gift_card",
        prizeGiftCertificateAmount: 25,
        prizeMenuItem: null,
        createdByOwnerId: null,
      }),
    );
  });

  it("rejects an unknown definition", async () => {
    await expect(
      createReward({
        venueId: "venue-1",
        definitionId: "nope",
        cadence: "none",
        threshold: 500,
        winnerQuota: 1,
        prize: APPETIZER_PRIZE,
      }),
    ).rejects.toThrow(REWARD_UNKNOWN_DEFINITION_MESSAGE);
    expect(mocks.createChallengeCampaign).not.toHaveBeenCalled();
  });

  it("blocks creation when Live Trivia is not scheduled", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([]);
    await expect(
      createReward({
        venueId: "venue-1",
        definitionId: "live_trivia_challenge",
        cadence: "none",
        threshold: 500,
        winnerQuota: 1,
        prize: APPETIZER_PRIZE,
      }),
    ).rejects.toThrow(REWARD_REQUIRES_SCHEDULED_GAME_MESSAGE);
    expect(mocks.createChallengeCampaign).not.toHaveBeenCalled();
  });

  it("blocks creation when the only schedule is a past one-off game (regression: stale trivia_schedules row)", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([
      makeSchedule({ recurringType: "none", recurringDays: [], startTime: "2026-07-10T23:00:00.000Z" }),
    ]);
    await expect(
      createReward({
        venueId: "venue-1",
        definitionId: "live_trivia_challenge",
        cadence: "none",
        winCondition: "game_winner",
        threshold: 500,
        winnerQuota: 1,
        prize: APPETIZER_PRIZE,
      }),
    ).rejects.toThrow(REWARD_REQUIRES_SCHEDULED_GAME_MESSAGE);
    expect(mocks.createChallengeCampaign).not.toHaveBeenCalled();
  });

  it("rejects a recurring period when the venue's schedule is a one-off", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([
      makeSchedule({ recurringType: "none", recurringDays: [] }),
    ]);
    await expect(
      createReward({
        venueId: "venue-1",
        definitionId: "live_trivia_challenge",
        cadence: "weekly",
        threshold: 500,
        winnerQuota: 1,
        prize: APPETIZER_PRIZE,
      }),
    ).rejects.toThrow(REWARD_TERMS_ONE_OFF_ONLY_MESSAGE);
  });

  it("rejects a weekly cadence when the only schedule has an unparseable start_time (dropped as unscheduled)", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([
      makeSchedule({ recurringType: "weekly", recurringDays: [], startTime: "not-a-date" }),
    ]);
    await expect(
      createReward({
        venueId: "venue-1",
        definitionId: "live_trivia_challenge",
        cadence: "weekly",
        threshold: 500,
        winnerQuota: 1,
        prize: APPETIZER_PRIZE,
      }),
    ).rejects.toThrow(REWARD_REQUIRES_SCHEDULED_GAME_MESSAGE);
    expect(mocks.createChallengeCampaign).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range winner quantity", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeSchedule()]);
    await expect(
      createReward({
        venueId: "venue-1",
        definitionId: "live_trivia_challenge",
        cadence: "weekly",
        threshold: 500,
        winnerQuota: 0,
        prize: APPETIZER_PRIZE,
      }),
    ).rejects.toThrow(quantityOutOfRangeMessage());
  });

  // ── Terms sentence: "give out [N] rewards every [period]" ──────────────────
  it("rejects more game-winner rewards per week than the venue runs games", async () => {
    // One Tuesday game a week — a second weekly prize has no game to award it.
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeSchedule()]);
    await expect(
      createReward({
        venueId: "venue-1",
        definitionId: "live_trivia_challenge",
        cadence: "weekly",
        winCondition: "game_winner",
        threshold: 500,
        winnerQuota: 2,
        prize: APPETIZER_PRIZE,
      }),
    ).rejects.toThrow(/at most 1 "winner of the game" reward per week/);
    expect(mocks.createChallengeCampaign).not.toHaveBeenCalled();
  });

  it("allows one game-winner reward per game when the venue runs two games a week", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([
      makeSchedule({ recurringDays: ["tue", "thu"] }),
    ]);
    await createReward({
      venueId: "venue-1",
      definitionId: "live_trivia_challenge",
      cadence: "weekly",
      winCondition: "game_winner",
      threshold: 500,
      winnerQuota: 2,
      prize: APPETIZER_PRIZE,
    });
    expect(mocks.createChallengeCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ recurringType: "weekly", winnerQuota: 2, winCondition: "game_winner" }),
    );
  });

  it("rejects a monthly game-winner reward at a weekly venue (4 or 5 games a month is not a promise)", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeSchedule()]);
    await expect(
      createReward({
        venueId: "venue-1",
        definitionId: "live_trivia_challenge",
        cadence: "monthly",
        winCondition: "game_winner",
        threshold: 500,
        winnerQuota: 4,
        prize: APPETIZER_PRIZE,
      }),
    ).rejects.toThrow(/don't run the same number of Live Trivia games every month/);
  });

  it("allows a monthly POINTS-TARGET reward at a weekly venue", async () => {
    // Several guests can clear a points target at the same game, so the quantity
    // is the partner's choice — only the period has to contain a game.
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeSchedule()]);
    await createReward({
      venueId: "venue-1",
      definitionId: "live_trivia_challenge",
      cadence: "monthly",
      threshold: 500,
      winnerQuota: 10,
      prize: APPETIZER_PRIZE,
    });
    expect(mocks.createChallengeCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        recurringType: "monthly",
        winnerQuota: 10,
        // Points still only accrue on the night the game runs; the monthly cycle
        // is calendar-anchored and needs no weekday anchor of its own.
        activeDays: ["tue"],
      }),
    );
  });

  it("expands a daily reward at a daily venue with no weekday restriction on accrual", async () => {
    // The counterpart to the scheduleDays regression above: a daily reward must
    // let points accrue every day, or its quota resets daily against progress
    // that can only be earned on one weekday.
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([
      makeSchedule({ recurringType: "daily", recurringDays: [] }),
    ]);
    await createReward({
      venueId: "venue-1",
      definitionId: "live_trivia_challenge",
      cadence: "daily",
      threshold: 300,
      winnerQuota: 2,
      prize: APPETIZER_PRIZE,
    });
    const input = mocks.createChallengeCampaign.mock.calls[0][0] as { activeDays: string[] };
    expect([...input.activeDays].sort()).toEqual(["fri", "mon", "sat", "sun", "thu", "tue", "wed"]);
  });

  it("rejects a daily reward when the venue only runs Live Trivia on Tuesdays", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeSchedule()]);
    await expect(
      createReward({
        venueId: "venue-1",
        definitionId: "live_trivia_challenge",
        cadence: "daily",
        threshold: 500,
        winnerQuota: 1,
        prize: APPETIZER_PRIZE,
      }),
    ).rejects.toThrow(/don't run Live Trivia every day/);
  });

  it("rejects a one-off game-winner reward worth more than one prize", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([
      makeSchedule({ recurringType: "none", recurringDays: [] }),
    ]);
    await expect(
      createReward({
        venueId: "venue-1",
        definitionId: "live_trivia_challenge",
        cadence: "none",
        winCondition: "game_winner",
        threshold: 500,
        winnerQuota: 3,
        prize: APPETIZER_PRIZE,
      }),
    ).rejects.toThrow(/has one winner/);
  });

  it("rejects an invalid menu-item prize (percent over 100)", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeSchedule()]);
    await expect(
      createReward({
        venueId: "venue-1",
        definitionId: "live_trivia_challenge",
        cadence: "weekly",
        threshold: 500,
        winnerQuota: 1,
        prize: { prizeKind: "menu_item", menuItem: "appetizer", discountKind: "percent", discountValue: 150 },
      }),
    ).rejects.toThrow(REWARD_INVALID_PRIZE_MESSAGE);
  });

  it("allows a game_winner reward", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeSchedule()]);
    await createReward({
      venueId: "venue-1",
      definitionId: "live_trivia_challenge",
      cadence: "weekly",
      winCondition: "game_winner",
      threshold: 500,
      winnerQuota: 1,
      prize: APPETIZER_PRIZE,
    });
    expect(mocks.createChallengeCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ winCondition: "game_winner" }),
    );
  });

  it("requires a free-text name when the menu item is 'other'", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeSchedule()]);
    await expect(
      createReward({
        venueId: "venue-1",
        definitionId: "live_trivia_challenge",
        cadence: "weekly",
        threshold: 500,
        winnerQuota: 1,
        prize: { prizeKind: "menu_item", menuItem: "other", discountKind: "dollar", discountValue: 10 },
      }),
    ).rejects.toThrow(REWARD_INVALID_PRIZE_MESSAGE);
  });
});

// ── Game-winner slot pinning (docs/rewards-game-winner-picker-plan.md Phase 3) ──
// A slot-pinned reward derives its cadence, quota and activeDays from the games
// the partner picked. The client sends the picks; the server re-resolves them
// against the venue's real schedule and takes NOTHING else on trust, because
// every unit of quota is a real coupon at a real game.
describe("createReward — game-winner slots", () => {
  const tueThu = () => makeSchedule({ recurringDays: ["tue", "thu"] });
  // A second Tuesday game (9pm) at the same venue — the case that makes a slot a
  // {scheduleId, weekday} pair rather than just a weekday.
  const tueLate = () =>
    makeSchedule({ id: "sched-2", title: "Late Trivia", startTime: "2026-07-22T01:00:00.000Z" });
  const oneOff = () =>
    makeSchedule({
      id: "sched-off",
      title: "Trivia Fundraiser",
      recurringType: "none",
      recurringDays: [],
      startTime: "2026-07-22T23:00:00.000Z", // Wednesday 19:00 ET
    });

  const createWithSlots = (
    slots: Array<{ scheduleId: string; weekday: string }> | null,
    overrides: Partial<Parameters<typeof createReward>[0]> = {},
  ) =>
    createReward({
      venueId: "venue-1",
      definitionId: "live_trivia_challenge",
      cadence: "weekly",
      winCondition: "game_winner",
      threshold: 500,
      winnerQuota: 1,
      gameWinnerSlots: slots,
      prize: APPETIZER_PRIZE,
      ...overrides,
    });

  it("exposes the venue's individual games as pickable slots", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([tueThu(), tueLate()]);
    const ctx = await resolveRewardCreationContext("venue-1", "live_trivia_challenge");
    expect(ctx.gameSlots.map((slot) => `${slot.scheduleId}:${slot.weekday}`)).toEqual([
      "sched-1:tue",
      "sched-1:thu",
      "sched-2:tue",
    ]);
    expect(ctx.gameSlots[0].label).toBe("Tuesday 7:00 PM — Tuesday Trivia");
  });

  it("derives weekly cadence, quota and activeDays from the picked games", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([tueThu()]);
    await createWithSlots([
      { scheduleId: "sched-1", weekday: "tue" },
      { scheduleId: "sched-1", weekday: "thu" },
    ]);
    expect(mocks.createChallengeCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        recurringType: "weekly",
        winnerQuota: 2,
        activeDays: ["tue", "thu"],
        gameWinnerSlots: [
          { scheduleId: "sched-1", weekday: "tue" },
          { scheduleId: "sched-1", weekday: "thu" },
        ],
      }),
    );
  });

  it("pins to one of two games on the same weekday and leaves the other out", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeSchedule(), tueLate()]);
    await createWithSlots([{ scheduleId: "sched-2", weekday: "tue" }]);
    expect(mocks.createChallengeCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        winnerQuota: 1,
        gameWinnerSlots: [{ scheduleId: "sched-2", weekday: "tue" }],
      }),
    );
  });

  it("discards the client's own cadence and quota", async () => {
    // The wizard sends them; a hand-rolled request could send anything. The
    // selection is the only thing that decides how many prizes exist.
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([tueThu()]);
    await createWithSlots(
      [{ scheduleId: "sched-1", weekday: "tue" }],
      { cadence: "none", winnerQuota: 99 },
    );
    expect(mocks.createChallengeCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ recurringType: "weekly", winnerQuota: 1, activeDays: ["tue"] }),
    );
  });

  it("creates a one-time reward worth exactly 1 for a single one-off game", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([tueThu(), oneOff()]);
    await createWithSlots([{ scheduleId: "sched-off", weekday: "wed" }]);
    expect(mocks.createChallengeCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        recurringType: "none",
        winnerQuota: 1,
        activeDays: [],
        gameWinnerSlots: [{ scheduleId: "sched-off", weekday: "wed" }],
      }),
    );
  });

  it("rejects a game the venue doesn't actually have", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([tueThu()]);
    await expect(createWithSlots([{ scheduleId: "sched-1", weekday: "mon" }])).rejects.toThrow(
      /no longer on your schedule/,
    );
    expect(mocks.createChallengeCampaign).not.toHaveBeenCalled();
  });

  it("rejects mixing a recurring game with a one-off game", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([tueThu(), oneOff()]);
    await expect(
      createWithSlots([
        { scheduleId: "sched-1", weekday: "tue" },
        { scheduleId: "sched-off", weekday: "wed" },
      ]),
    ).rejects.toThrow(/not both/);
  });

  it("rejects an empty selection instead of quietly meaning 'every game'", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([tueThu()]);
    await expect(createWithSlots([])).rejects.toThrow(/at least one Live Trivia game/);
  });

  it("stores null when no selection is sent, keeping the legacy every-game reward", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([tueThu()]);
    await createReward({
      venueId: "venue-1",
      definitionId: "live_trivia_challenge",
      cadence: "weekly",
      winCondition: "game_winner",
      threshold: 500,
      winnerQuota: 2,
      prize: APPETIZER_PRIZE,
    });
    expect(mocks.createChallengeCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ gameWinnerSlots: null, winnerQuota: 2 }),
    );
  });

  it("ignores a selection sent for a points-target reward", async () => {
    // Slots only describe who wins a GAME. A points target is won by accrual, so
    // its terms sentence still governs.
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([tueThu()]);
    await createWithSlots([{ scheduleId: "sched-1", weekday: "tue" }], {
      winCondition: "points_threshold",
      winnerQuota: 3,
    });
    expect(mocks.createChallengeCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ gameWinnerSlots: null, winnerQuota: 3, activeDays: ["tue", "thu"] }),
    );
  });
});

// ── NFL Pick 'Em Challenge (Phase 4) ─────────────────────────────────────────
// This definition gates on the NFL season calendar rather than a venue schedule,
// so it takes NONE of the terms-sentence machinery above. Everything the engine
// receives — cadence, quota, activeDays, date bounds — is DERIVED from the week
// scope on the server; the client supplies only the shape.

/**
 * Four Thu→Wed weeks around the frozen clock (2026-07-20). Week 3 is the current
 * one (its weekEndDate hasn't passed), so "current, else next" must resolve to it
 * and the season must end on week 4's weekEndDate.
 */
const NFL_WEEKS: NFLWeek[] = [
  ["2026-07-02", "2026-07-08"],
  ["2026-07-09", "2026-07-15"],
  ["2026-07-16", "2026-07-22"],
  ["2026-07-23", "2026-07-29"],
].map(([weekStartDate, weekEndDate], index) => ({
  id: `week-${index + 1}`,
  season: 2026,
  weekNumber: index + 1,
  weekType: "regular",
  displayLabel: null,
  weekStartDate,
  weekEndDate,
  thursdayKickoff: `${weekStartDate}T20:15:00.000Z`,
  status: "upcoming",
  gamesCount: 16,
  syncedAt: null,
}));

const ALL_SEVEN_THURSDAY_FIRST = ["thu", "fri", "sat", "sun", "mon", "tue", "wed"];

type NFLCreateOverrides = {
  winCondition?: ChallengeWinCondition;
  winnerQuota?: number;
  threshold?: number;
  nflWeekScope?: NFLRewardWeekScope | null;
};

const createNFLReward = (overrides: NFLCreateOverrides = {}) =>
  createReward({
    venueId: "venue-1",
    definitionId: "nfl_pickem_challenge",
    // Deliberately a cadence the scope must OVERRIDE, never honor.
    cadence: "monthly",
    winCondition: overrides.winCondition ?? "game_winner",
    threshold: overrides.threshold ?? 1,
    winnerQuota: overrides.winnerQuota ?? 1,
    nflWeekScope:
      overrides.nflWeekScope === undefined
        ? { kind: "weekly", season: 2026 }
        : overrides.nflWeekScope,
    prize: APPETIZER_PRIZE,
  });

describe("resolveRewardCreationContext — NFL season gate", () => {
  it("reads the current-or-next week and the season's end out of nfl_pickem_weeks", async () => {
    mocks.listNFLWeeks.mockResolvedValue(NFL_WEEKS);
    const ctx = await resolveRewardCreationContext("venue-1", "nfl_pickem_challenge");

    expect(ctx.scheduled).toBe(true);
    // Exactly the two week-scope shapes — never the terms sentence's periods.
    expect(ctx.allowedCadences).toEqual(["none", "weekly"]);
    expect(ctx.scheduleShapes).toEqual([]);
    expect(ctx.gameSlots).toEqual([]);
    expect(ctx.nflSeason).toEqual({
      season: 2026,
      fromWeek: 3,
      fromWeekStartDate: "2026-07-16",
      seasonEndDate: "2026-07-29",
      weeksRemaining: 2,
    });
    // The venue's Live Trivia schedule is irrelevant here and must not be read.
    expect(mocks.listAdminLiveShowdownSchedules).not.toHaveBeenCalled();
  });

  it("blocks when the season has no weeks left", async () => {
    // Both remaining fixtures ended before the frozen clock.
    mocks.listNFLWeeks.mockResolvedValue(NFL_WEEKS.slice(0, 2));
    const ctx = await resolveRewardCreationContext("venue-1", "nfl_pickem_challenge");
    expect(ctx.scheduled).toBe(false);
    expect(ctx.allowedCadences).toEqual([]);
    expect(ctx.nflSeason).toBeNull();
  });

  it("leaves nflSeason null for a schedule-gated definition", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeSchedule()]);
    const ctx = await resolveRewardCreationContext("venue-1", "live_trivia_challenge");
    expect(ctx.nflSeason).toBeNull();
    expect(mocks.listNFLWeeks).not.toHaveBeenCalled();
  });
});

describe("createReward — NFL Pick 'Em Challenge", () => {
  beforeEach(() => {
    mocks.listNFLWeeks.mockResolvedValue(NFL_WEEKS);
  });

  it("expands a weekly week-winner reward with all seven days, Thursday first", async () => {
    await createNFLReward({ nflWeekScope: { kind: "weekly", season: 2026 } });

    expect(mocks.createChallengeCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        venueIds: ["venue-1"],
        gameTypes: ["nfl-pickem"],
        scheduleType: "single_day",
        recurringType: "weekly",
        winnerQuota: 1,
        gameWinnerSlots: null,
        nflWeekScope: { kind: "weekly", season: 2026 },
      }),
    );
    const input = mocks.createChallengeCampaign.mock.calls[0][0];
    // Order matters twice over: computeCycleStart anchors on activeDays[0] (an
    // NFL week runs Thu→Wed) and isCampaignEligibleAtTime blocks accrual on any
    // day missing from the list (NFL games settle Thu/Sun/Mon).
    expect(input.activeDays).toEqual(ALL_SEVEN_THURSDAY_FIRST);
    // A weekly reward's boundaries belong to the weekly cycle math, not to dates.
    expect(input.startDate).toBeUndefined();
    expect(input.endDate).toBeUndefined();
  });

  it("expands a season-long reward into a closed one-off with real date bounds", async () => {
    await createNFLReward({ nflWeekScope: { kind: "season", season: 2026, fromWeek: 3 } });

    expect(mocks.createChallengeCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        recurringType: "none",
        winnerQuota: 1,
        // Drawn from the server's own week rows: week 3's start, the season's end.
        // Without both, computeCycleStart returns the epoch sentinel and
        // getCampaignCloseTimestampMs returns null — the reward never closes.
        startDate: "2026-07-16",
        endDate: "2026-07-29",
        nflWeekScope: { kind: "season", season: 2026, fromWeek: 3 },
      }),
    );
    // Still all seven days: activeDays is the accrual gate for a season reward too.
    expect(mocks.createChallengeCampaign.mock.calls[0][0].activeDays).toEqual(
      ALL_SEVEN_THURSDAY_FIRST,
    );
  });

  it("refuses a week-winner quantity other than 1 instead of clamping it", async () => {
    await expect(createNFLReward({ winnerQuota: 5 })).rejects.toThrow(
      NFL_WEEK_WINNER_QUANTITY_MESSAGE,
    );
    expect(mocks.createChallengeCampaign).not.toHaveBeenCalled();
  });

  it("takes the picks target's quantity but still range-checks it", async () => {
    await createNFLReward({ winCondition: "points_threshold", threshold: 25, winnerQuota: 3 });
    expect(mocks.createChallengeCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        winCondition: "points_threshold",
        // thresholdStep 1 — correct PICKS, not Live Trivia's multiples of 10.
        pointsRequiredToWin: 25,
        winnerQuota: 3,
      }),
    );

    mocks.createChallengeCampaign.mockClear();
    await expect(
      createNFLReward({ winCondition: "points_threshold", threshold: 25, winnerQuota: 999 }),
    ).rejects.toThrow(quantityOutOfRangeMessage());
    expect(mocks.createChallengeCampaign).not.toHaveBeenCalled();
  });

  it("overrides a client-supplied past fromWeek with the server's own", async () => {
    // Backdating to week 1 would mint prizes for weeks that already played.
    await createNFLReward({ nflWeekScope: { kind: "season", season: 1999, fromWeek: 1 } });
    expect(mocks.createChallengeCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        nflWeekScope: { kind: "season", season: 2026, fromWeek: 3 },
        startDate: "2026-07-16",
      }),
    );
  });

  it("drops a smuggled week list — there is no third scope shape", async () => {
    const smuggled = {
      kind: "season",
      season: 2026,
      fromWeek: 3,
      weekNumbers: [12, 13, 14],
    } as unknown as NFLRewardWeekScope;
    await createNFLReward({ nflWeekScope: smuggled });
    expect(mocks.createChallengeCampaign.mock.calls[0][0].nflWeekScope).toEqual({
      kind: "season",
      season: 2026,
      fromWeek: 3,
    });
  });

  it("refuses a missing or malformed scope rather than guessing one", async () => {
    await expect(createNFLReward({ nflWeekScope: null })).rejects.toThrow(
      NFL_WEEK_SCOPE_INVALID_MESSAGE,
    );
    expect(mocks.createChallengeCampaign).not.toHaveBeenCalled();
  });

  it("refuses creation when the season has no weeks left, with its own message", async () => {
    // Not REWARD_REQUIRES_SCHEDULED_GAME_MESSAGE: no amount of Live Trivia
    // scheduling would fix this, so the copy must not send the partner there.
    mocks.listNFLWeeks.mockResolvedValue([]);
    await expect(createNFLReward()).rejects.toThrow(REWARD_NFL_SEASON_UNAVAILABLE_MESSAGE);
    expect(mocks.createChallengeCampaign).not.toHaveBeenCalled();
  });
});
