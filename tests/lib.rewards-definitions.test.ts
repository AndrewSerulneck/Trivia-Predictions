import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminLiveShowdownSchedule } from "@/lib/liveShowdownAdmin";

// ── Mocks ────────────────────────────────────────────────────────────────────
// rewards.ts is server-only and leans on two module boundaries: the schedule
// reader (listAdminLiveShowdownSchedules) and the engine (createChallengeCampaign).
// We stub both — the schedule reader returns fixtures, and createChallengeCampaign
// captures the expansion input so we can assert the engine field mapping without a DB.
const mocks = vi.hoisted(() => ({
  listAdminLiveShowdownSchedules: vi.fn(async (): Promise<AdminLiveShowdownSchedule[]> => []),
  createChallengeCampaign: vi.fn(async (input: Record<string, unknown>) => ({ id: "reward-1", ...input })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/liveShowdownAdmin", () => ({
  listAdminLiveShowdownSchedules: mocks.listAdminLiveShowdownSchedules,
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
