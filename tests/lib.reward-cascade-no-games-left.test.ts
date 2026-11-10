import { readFileSync } from "fs";
import { join } from "path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminLiveShowdownSchedule } from "@/lib/liveShowdownAdmin";
import type { TriviaScheduleRow } from "@/lib/liveShowdownEngine";
import type { RankedWeekClosePlan } from "@/lib/liveTriviaRankedRewards";
import type { RewardGameSlot, RewardWeekday } from "@/lib/rewardGameSlots";
import type { ChallengeCampaign } from "@/types";

// Rule 4 of lib/rewardGameSlotCascade.ts (docs/cancelled-prizes-pick-windows-away-mode-plan.md
// Phase A2): a Live Trivia prize NOT tied to one game — weekly places, points target, legacy
// "every game" winner — is retired (never deleted) when the venue has no Live Trivia game left
// that it could count. Phase R1: anything already played is paid BEFORE the change
// (settleVenueBeforeScheduleChange, while the game and its answers still exist); the cascade after
// the write retires a places/winner prize only if that step confirmed it. Phase R7: that step only
// RANKS a week it would close early; the cascade pays it after the write, then retires the prize.

const mocks = vi.hoisted(() => ({
  listChallengeCampaigns: vi.fn(async (): Promise<ChallengeCampaign[]> => []),
  updateChallengeCampaign: vi.fn(async (input: Record<string, unknown>) => input as unknown as ChallengeCampaign),
  deleteChallengeCampaign: vi.fn(async () => ({ deleted: true })),
  listVenueLiveShowdownSchedules: vi.fn(async (): Promise<AdminLiveShowdownSchedule[]> => []),
  resolveGameWinnerRewards: vi.fn(async () => ({ errors: [] as Array<{ scope: string; message: string }> })),
  resolveRankedPlaceRewards: vi.fn(async () => ({ errors: [] as Array<{ scope: string; message: string }> })),
  planRankedWeekEarlyClose: vi.fn(async (): Promise<{ outcome: string; plan?: unknown }> => ({ outcome: "nothing_played" })),
  payPlannedWeekClose: vi.fn(async () => "awarded"),
  loadLiveTriviaSchedulesForVenues: vi.fn(async (): Promise<TriviaScheduleRow[]> => []),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/challengeCampaigns", () => ({
  listChallengeCampaigns: mocks.listChallengeCampaigns,
  updateChallengeCampaign: mocks.updateChallengeCampaign,
  deleteChallengeCampaign: mocks.deleteChallengeCampaign,
}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: null }));
vi.mock("@/lib/liveTriviaBroadcast", () => ({ broadcastLiveTrivia: vi.fn() }));
vi.mock("@/lib/liveShowdownAdmin", async (importOriginal) => {
  // The real venueSchedulesFromRows: the dry run must read preloaded rows exactly as the SQL would.
  const actual = await importOriginal<typeof import("@/lib/liveShowdownAdmin")>();
  return {
    venueSchedulesFromRows: actual.venueSchedulesFromRows,
    listVenueLiveShowdownSchedules: mocks.listVenueLiveShowdownSchedules,
  };
});
vi.mock("@/lib/liveTriviaWinnerRewards", () => ({
  resolveGameWinnerRewards: mocks.resolveGameWinnerRewards,
}));
vi.mock("@/lib/liveTriviaRankedRewards", () => ({
  resolveRankedPlaceRewards: mocks.resolveRankedPlaceRewards,
  planRankedWeekEarlyClose: mocks.planRankedWeekEarlyClose,
  payPlannedWeekClose: mocks.payPlannedWeekClose,
  isLiveTriviaRankedCampaign: (campaign: ChallengeCampaign) => campaign.rewardDefinitionId === "live_trivia_challenge",
  rankedRewardConfigError: (campaign: ChallengeCampaign) =>
    campaign.recurringType === "weekly" ? null : "A weekly places reward must repeat weekly.",
}));
vi.mock("@/lib/liveShowdownEngine", () => ({
  loadLiveTriviaSchedulesForVenues: mocks.loadLiveTriviaSchedulesForVenues,
}));

import {
  applyScheduleChangeToGameWinnerRewards,
  describeCascadeReport,
  isRule4Candidate,
  isScheduleChangeSettlementError,
  prizeHasGameLeft,
  SCHEDULE_CHANGE_SETTLEMENT_MESSAGE,
  ScheduleChangeSettlementError,
  settleVenueBeforeScheduleChange,
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

// Thursday 2026-11-12, 8:00 PM Eastern — a future one-off.
const futureOneOff = (overrides: Partial<AdminLiveShowdownSchedule> = {}) =>
  schedule({ id: "sched-one-off", recurringType: "none", recurringDays: [], startTime: "2026-11-13T01:00:00.000Z", ...overrides });
// Saturday 2026-11-07 — already played.
const pastOneOff = () =>
  schedule({ id: "sched-past", recurringType: "none", recurringDays: [], startTime: "2026-11-08T01:00:00.000Z" });

const ranked = (overrides: Partial<ChallengeCampaign> = {}): ChallengeCampaign =>
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

const pointsTarget = (overrides: Partial<ChallengeCampaign> = {}) =>
  ranked({ id: "points-1", winCondition: "points_threshold", winnerQuota: 1, pointsRequiredToWin: 500, ...overrides });
const everyGameWinner = (overrides: Partial<ChallengeCampaign> = {}) =>
  ranked({ id: "winner-1", winCondition: "game_winner", winnerQuota: 1, ...overrides });

// The post-write cascade. `settled` = what settleVenueBeforeScheduleChange confirmed beforehand.
const run = (
  params: {
    scheduleId?: string;
    venueId?: string;
    survivingWeekdays?: string[];
    settled?: string[];
    weekCloses?: ReadonlyMap<string, RankedWeekClosePlan>;
  } = {},
) =>
  applyScheduleChangeToGameWinnerRewards({
    scheduleId: params.scheduleId ?? "sched-wed-fri",
    venueId: params.venueId ?? "venue-1",
    survivingWeekdays: params.survivingWeekdays ?? [],
    survivingRecurrence: null,
    now: NOW,
    settledCampaignIds: params.settled ? new Set(params.settled) : undefined,
    weekCloses: params.weekCloses,
  });

const expectNoPayoutAfterTheWrite = () => {
  expect(mocks.resolveGameWinnerRewards).not.toHaveBeenCalled();
  expect(mocks.resolveRankedPlaceRewards).not.toHaveBeenCalled();
  expect(mocks.planRankedWeekEarlyClose).not.toHaveBeenCalled();
  expect(mocks.payPlannedWeekClose).not.toHaveBeenCalled();
};

beforeEach(() => {
  mocks.listChallengeCampaigns.mockReset();
  mocks.updateChallengeCampaign.mockClear();
  mocks.deleteChallengeCampaign.mockClear();
  mocks.listVenueLiveShowdownSchedules.mockReset();
  mocks.listVenueLiveShowdownSchedules.mockResolvedValue([]);
  mocks.resolveGameWinnerRewards.mockReset();
  mocks.resolveGameWinnerRewards.mockResolvedValue({ errors: [] });
  mocks.resolveRankedPlaceRewards.mockReset();
  mocks.resolveRankedPlaceRewards.mockResolvedValue({ errors: [] });
  mocks.planRankedWeekEarlyClose.mockReset();
  mocks.planRankedWeekEarlyClose.mockResolvedValue({ outcome: "nothing_played" });
  mocks.payPlannedWeekClose.mockReset();
  mocks.payPlannedWeekClose.mockResolvedValue("awarded");
  mocks.loadLiveTriviaSchedulesForVenues.mockReset();
  mocks.loadLiveTriviaSchedulesForVenues.mockResolvedValue([]);
});

describe("rule 4: deleting games", () => {
  it("retires a weekly places prize when the venue's last game is deleted, once it was settled first", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([ranked()]);

    const report = await run({ settled: ["ranked-1"] });

    expect(mocks.updateChallengeCampaign).toHaveBeenCalledWith({ id: "ranked-1", isActive: false });
    expectNoPayoutAfterTheWrite();
    expect(report.retiredNoGamesLeft).toEqual(["ranked-1"]);
    expect(report.errors).toEqual([]);
  });

  it("keeps the prize when one of two games is deleted", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([ranked(), pointsTarget({ activeDays: ["thu"] }), everyGameWinner()]);
    mocks.listVenueLiveShowdownSchedules.mockResolvedValue([futureOneOff()]);

    const report = await run();

    expect(mocks.updateChallengeCampaign).not.toHaveBeenCalled();
    expect(mocks.resolveRankedPlaceRewards).not.toHaveBeenCalled();
    expect(report.retiredNoGamesLeft).toEqual([]);
  });

  it("does not count a one-off that has already been played", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([everyGameWinner()]);
    mocks.listVenueLiveShowdownSchedules.mockResolvedValue([pastOneOff()]);

    const report = await run({ settled: ["winner-1"] });

    expect(report.retiredNoGamesLeft).toEqual(["winner-1"]);
  });

  it("retires but never deletes, so coupons already won stay in wallets", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([ranked(), pointsTarget(), everyGameWinner()]);

    const report = await run({ settled: ["ranked-1", "winner-1"] });

    expect(mocks.deleteChallengeCampaign).not.toHaveBeenCalled();
    for (const call of mocks.updateChallengeCampaign.mock.calls) {
      expect(call[0]).toEqual({ id: expect.any(String), isActive: false });
    }
    expect(report.retiredNoGamesLeft.sort()).toEqual(["points-1", "ranked-1", "winner-1"]);
  });
});

describe("rule 4: editing games", () => {
  it("retires a points target when an edit leaves no game on any of its days", async () => {
    // Wed/Thu/Fri edited down to Tuesday: the prize only accrues Wed–Fri.
    mocks.listChallengeCampaigns.mockResolvedValue([pointsTarget()]);
    mocks.listVenueLiveShowdownSchedules.mockResolvedValue([schedule({ recurringDays: ["tue"] })]);

    const report = await run({ survivingWeekdays: ["tue"] });

    // A points target pays as points accrue: it retires without a settle.
    expectNoPayoutAfterTheWrite();
    expect(report.retiredNoGamesLeft).toEqual(["points-1"]);
  });

  it("keeps a weekly places prize when an edit moves its nights (every game counts toward its week)", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([ranked()]);
    mocks.listVenueLiveShowdownSchedules.mockResolvedValue([schedule({ recurringDays: ["tue"] })]);

    const report = await run({ survivingWeekdays: ["tue"] });

    expect(report.retiredNoGamesLeft).toEqual([]);
  });

  it("retires a weekly places prize pinned to games none of which are left", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([
      ranked({ id: "pinned-gone", gameWinnerSlots: [{ scheduleId: "sched-wed-fri", weekday: "wed" }] }),
      ranked({ id: "pinned-kept", gameWinnerSlots: [{ scheduleId: "sched-other", weekday: "tue" }] }),
    ]);
    mocks.listVenueLiveShowdownSchedules.mockResolvedValue([
      schedule({ id: "sched-other", recurringDays: ["tue"] }),
    ]);

    const report = await run({ settled: ["pinned-gone"] });

    expect(report.retiredNoGamesLeft).toEqual(["pinned-gone"]);
  });
});

describe("rule 4: transfers", () => {
  it("retires the old venue's prize when its only game moves to another venue", async () => {
    // The read is venue-filtered; a row for another venue must never count here.
    mocks.listChallengeCampaigns.mockResolvedValue([ranked()]);
    mocks.listVenueLiveShowdownSchedules.mockResolvedValue([schedule({ venueId: "venue-2" })]);

    const report = await run({ settled: ["ranked-1"] });

    expect(mocks.listVenueLiveShowdownSchedules).toHaveBeenCalledWith(["venue-1"], NOW);
    expect(report.retiredNoGamesLeft).toEqual(["ranked-1"]);
  });

  it("merges the old venue's rule-4 retirements into the edit's report", () => {
    const source = readFileSync(join(process.cwd(), "lib/liveShowdownAdmin.ts"), "utf8");
    expect(source).toContain("cascade.retiredNoGamesLeft.push(...transferCascade.retiredNoGamesLeft)");
  });
});

describe("rule 4: what it never touches", () => {
  it("never retires a multi-game legacy leaderboard (Riverside)", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([
      pointsTarget({
        id: "legacy",
        rewardDefinitionId: null,
        gameTypes: ["pickem", "fantasy", "speed-trivia", "live-trivia", "bingo"],
      }),
    ]);

    const report = await run();

    expect(mocks.listVenueLiveShowdownSchedules).not.toHaveBeenCalled();
    expect(report.retiredNoGamesLeft).toEqual([]);
  });

  it("never retires a prize shared with other venues", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([pointsTarget({ venueIds: ["venue-1", "venue-2"] })]);

    await run();

    expect(mocks.updateChallengeCampaign).not.toHaveBeenCalled();
  });

  it("leaves slot-pinned game-winner prizes to rules 1–3", () => {
    expect(
      isRule4Candidate(everyGameWinner({ gameWinnerSlots: [{ scheduleId: "s", weekday: "tue" }] }), "venue-1"),
    ).toBe(false);
    expect(isRule4Candidate(everyGameWinner(), "venue-1")).toBe(true);
  });

  it("ignores inactive and won-out prizes", () => {
    expect(isRule4Candidate(ranked({ isActive: false }), "venue-1")).toBe(false);
    expect(isRule4Candidate(ranked({ winnerUserId: "u1" }), "venue-1")).toBe(false);
  });

  it("does not read the schedule when the venue has no candidate prize", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([
      everyGameWinner({ gameWinnerSlots: [{ scheduleId: "sched-other", weekday: "tue" }] }),
    ]);

    await run();

    expect(mocks.listVenueLiveShowdownSchedules).not.toHaveBeenCalled();
  });
});

describe("rule 4: failures keep the prize live", () => {
  it("retires nothing when the schedule read fails", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([ranked()]);
    mocks.listVenueLiveShowdownSchedules.mockRejectedValue(new Error("db down"));

    const report = await run();

    expect(mocks.updateChallengeCampaign).not.toHaveBeenCalled();
    expect(report.errors).toEqual([{ campaignId: "ranked-1", message: "db down" }]);
  });

  it("keeps a places or winner prize the pre-change step didn't confirm (a second edit landed in between)", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([ranked(), everyGameWinner(), pointsTarget()]);

    const report = await run({ settled: ["winner-1"] });

    expectNoPayoutAfterTheWrite();
    expect(report.retiredNoGamesLeft.sort()).toEqual(["points-1", "winner-1"]);
    expect(report.errors).toEqual([
      { campaignId: "ranked-1", message: "Not retired: its payout wasn't confirmed before the change." },
    ]);
  });

  it("retires no places or winner prize when nothing was settled", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([ranked(), everyGameWinner()]);

    const report = await run();

    expect(mocks.updateChallengeCampaign).not.toHaveBeenCalled();
    expect(report.errors.map((error) => error.campaignId).sort()).toEqual(["ranked-1", "winner-1"]);
  });
});

describe("prizeHasGameLeft", () => {
  const slot = (weekday: RewardWeekday, scheduleId = "s"): RewardGameSlot => ({
    scheduleId,
    weekday,
    recurring: true,
    title: "",
    timeLabel: "",
    dateLabel: null,
    label: "",
  });

  it("a points target with no days counts any game", () => {
    expect(prizeHasGameLeft(pointsTarget({ activeDays: [] }), [slot("mon")])).toBe(true);
    expect(prizeHasGameLeft(pointsTarget({ activeDays: [] }), [])).toBe(false);
  });

  it("a points target counts only games on its days", () => {
    expect(prizeHasGameLeft(pointsTarget({ activeDays: ["thu"] }), [slot("thu")])).toBe(true);
    expect(prizeHasGameLeft(pointsTarget({ activeDays: ["thu"] }), [slot("mon")])).toBe(false);
  });
});

describe("describeCascadeReport: rule 4", () => {
  const base = { pruned: [], deactivated: [], retiredForRecurrenceChange: [], retiredNoGamesLeft: [], errors: [] };

  it("names the case in one short sentence", () => {
    expect(describeCascadeReport({ ...base, retiredNoGamesLeft: ["a"] })).toBe(
      "1 prize was retired because no Live Trivia games are left for it.",
    );
    expect(describeCascadeReport({ ...base, retiredNoGamesLeft: ["a", "b"] })).toBe(
      "2 prizes were retired because no Live Trivia games are left for them.",
    );
  });
});

// ── Phase R1 / R7: settle before the change ─────────────────────────────────
describe("settleVenueBeforeScheduleChange (R1 + R7: pay what's owed before, rank an early close, read once)", () => {
  // Wednesday 2026-11-11, noon Eastern: Tuesday's game is played, Thursday's isn't.
  const WED = Date.parse("2026-11-11T17:00:00.000Z");
  const tueThu = () => schedule({ id: "sched-tue-thu", recurringDays: ["tue", "thu"] });
  const row = (overrides: Partial<TriviaScheduleRow> = {}): TriviaScheduleRow => ({
    id: "sched-tue-thu",
    title: "Weekday Trivia",
    start_time: "2026-10-01T23:00:00.000Z",
    timezone: "America/New_York",
    recurring_type: "weekly",
    recurring_days: ["tue", "thu"],
    num_rounds: 3,
    venue_id: "venue-1",
    intermission_ad_delay_seconds: 10,
    lobby_ad_enabled: true,
    ...overrides,
  });
  const tueThuRow = () => row();
  // Thursday 2026-11-12, 8:00 PM Eastern — another game that stays on.
  const futureOneOffRow = () =>
    row({ id: "sched-one-off", recurring_type: "none", recurring_days: [], start_time: "2026-11-13T01:00:00.000Z" });
  const cancel = { survivingWeekdays: [], survivingRecurrence: null, schedule: null };
  const settle = (change: Parameters<typeof settleVenueBeforeScheduleChange>[0]["change"] = cancel) =>
    settleVenueBeforeScheduleChange({ venueId: "venue-1", scheduleId: "sched-tue-thu", change, nowMs: WED });
  const plan = (campaign: ChallengeCampaign) => ({
    campaignId: campaign.id,
    campaign,
    venueId: "venue-1",
    cycleStart: new Date("2026-11-10T05:00:00.000Z"),
    places: [{ place: 1, userId: "u-tue", totalPoints: 90, reachedAt: "2026-11-11T01:00:00.000Z" }],
    participantCount: 4,
    gameCount: 1,
    tiebreakUnresolved: false,
  });
  // The settle's one read of each, handed to the dry run and both sweeps.
  const scopeWith = (campaigns: ChallengeCampaign[], schedules: TriviaScheduleRow[]) => ({
    venueIds: ["venue-1"],
    campaigns,
    schedules,
  });

  beforeEach(() => {
    // Before the write: the schedule being cancelled is still there.
    mocks.loadLiveTriviaSchedulesForVenues.mockResolvedValue([tueThuRow()]);
  });

  it("the finding: Tue + Thu, Tue played, cancelled Wed — the week is ranked before, paid after the write, then retired", async () => {
    const prize = ranked({ activeDays: ["tue", "thu"] });
    mocks.listChallengeCampaigns.mockResolvedValue([prize]);
    mocks.planRankedWeekEarlyClose.mockResolvedValue({ outcome: "planned", plan: plan(prize) });

    const { settledCampaignIds, weekCloses } = await settle();

    // The finished-weeks sweep for this venue, then this week ranked on the nights played.
    expect(mocks.resolveRankedPlaceRewards).toHaveBeenCalledWith(WED, scopeWith([prize], [tueThuRow()]));
    expect(mocks.planRankedWeekEarlyClose).toHaveBeenCalledWith({ campaign: prize, schedules: [tueThuRow()], nowMs: WED });
    expect(mocks.resolveRankedPlaceRewards.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.planRankedWeekEarlyClose.mock.invocationCallOrder[0],
    );
    // Nothing is written or paid by the pre-change step.
    expect(mocks.payPlannedWeekClose).not.toHaveBeenCalled();
    expect(mocks.updateChallengeCampaign).not.toHaveBeenCalled();
    expect([...settledCampaignIds]).toEqual(["ranked-1"]);
    expect([...weekCloses.keys()]).toEqual(["ranked-1"]);

    // After the delete the schedule is gone; the cascade pays the plan, then retires the prize.
    mocks.listVenueLiveShowdownSchedules.mockResolvedValue([]);
    mocks.resolveRankedPlaceRewards.mockClear();
    const report = await applyScheduleChangeToGameWinnerRewards({
      scheduleId: "sched-tue-thu",
      venueId: "venue-1",
      survivingWeekdays: [],
      survivingRecurrence: null,
      now: new Date(WED),
      settledCampaignIds,
      weekCloses,
    });
    expect(mocks.payPlannedWeekClose).toHaveBeenCalledWith(weekCloses.get("ranked-1"), new Date(WED));
    expect(mocks.payPlannedWeekClose.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.updateChallengeCampaign.mock.invocationCallOrder[0],
    );
    expect(mocks.updateChallengeCampaign).toHaveBeenCalledWith({ id: "ranked-1", isActive: false });
    expect(report.retiredNoGamesLeft).toEqual(["ranked-1"]);
    expect(mocks.resolveRankedPlaceRewards).not.toHaveBeenCalled();
  });

  it("a failed award keeps the prize active and logs the whole plan for a manual payout", async () => {
    const prize = ranked();
    const week = plan(prize);
    mocks.listChallengeCampaigns.mockResolvedValue([prize]);
    mocks.payPlannedWeekClose.mockRejectedValue(new Error("award RPC failed"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const report = await run({ settled: ["ranked-1"], weekCloses: new Map([["ranked-1", week]]) });

      expect(mocks.updateChallengeCampaign).not.toHaveBeenCalled();
      expect(report.retiredNoGamesLeft).toEqual([]);
      expect(report.errors).toEqual([
        { campaignId: "ranked-1", message: "Not retired: its payout wasn't confirmed before the change." },
      ]);
      expect(error).toHaveBeenCalledWith(
        "[RankedReward] early-close-award-failed",
        expect.objectContaining({
          campaignId: "ranked-1",
          cycleStart: "2026-11-10T05:00:00.000Z",
          places: [{ place: 1, userId: "u-tue", totalPoints: 90 }],
          message: "award RPC failed",
        }),
      );
    } finally {
      error.mockRestore();
    }
  });

  it("the real run keeps a prize that has a plan: the plan is dropped unpaid (the cron pays that week)", async () => {
    const prize = ranked();
    mocks.listChallengeCampaigns.mockResolvedValue([prize]);
    // The real run finds a game left (the dry run thought none would be).
    mocks.listVenueLiveShowdownSchedules.mockResolvedValue([futureOneOff()]);

    const report = await run({ settled: ["ranked-1"], weekCloses: new Map([["ranked-1", plan(prize)]]) });

    expect(mocks.payPlannedWeekClose).not.toHaveBeenCalled();
    expect(mocks.updateChallengeCampaign).not.toHaveBeenCalled();
    expect(report.retiredNoGamesLeft).toEqual([]);
  });

  it("nothing played or already settled: no plan, and the prize still retires", async () => {
    const prize = ranked();
    mocks.listChallengeCampaigns.mockResolvedValue([prize]);
    mocks.planRankedWeekEarlyClose.mockResolvedValue({ outcome: "already_settled" });

    const { settledCampaignIds, weekCloses } = await settle();

    expect([...settledCampaignIds]).toEqual(["ranked-1"]);
    expect(weekCloses.size).toBe(0);
  });

  it("reads the venue's prizes once and its schedules once; the dry run and both sweeps reuse them (finding 5)", async () => {
    const prizes = [ranked(), everyGameWinner()];
    mocks.listChallengeCampaigns.mockResolvedValue(prizes);

    await settle();

    expect(mocks.listChallengeCampaigns).toHaveBeenCalledTimes(1);
    expect(mocks.loadLiveTriviaSchedulesForVenues).toHaveBeenCalledTimes(1);
    expect(mocks.loadLiveTriviaSchedulesForVenues).toHaveBeenCalledWith(["venue-1"]);
    expect(mocks.listVenueLiveShowdownSchedules).not.toHaveBeenCalled();
    expect(mocks.resolveGameWinnerRewards).toHaveBeenCalledWith(WED, scopeWith(prizes, [tueThuRow()]));
    expect(mocks.resolveRankedPlaceRewards).toHaveBeenCalledWith(WED, scopeWith(prizes, [tueThuRow()]));

    // After the write: one fresh read of each (the sweeps just wrote winners; the schedule changed).
    mocks.listChallengeCampaigns.mockClear();
    await run({ settled: ["ranked-1", "winner-1"] });
    expect(mocks.listChallengeCampaigns).toHaveBeenCalledTimes(1);
    expect(mocks.listVenueLiveShowdownSchedules).toHaveBeenCalledTimes(1);
  });

  it("a venue with no game-winner or places prize costs one prize read: no schedule read, no sweep", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([pointsTarget()]);

    const { settledCampaignIds } = await settle();

    expect(settledCampaignIds.size).toBe(0);
    expect(mocks.loadLiveTriviaSchedulesForVenues).not.toHaveBeenCalled();
    expect(mocks.listVenueLiveShowdownSchedules).not.toHaveBeenCalled();
    expectNoPayoutAfterTheWrite();
  });

  it("pays a game-winner game that ended 2 minutes before the cancel (this venue only)", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([everyGameWinner()]);

    const { settledCampaignIds } = await settle();

    expect(mocks.resolveGameWinnerRewards).toHaveBeenCalledWith(WED, scopeWith([everyGameWinner()], [tueThuRow()]));
    expect(mocks.resolveRankedPlaceRewards).not.toHaveBeenCalled();
    expect([...settledCampaignIds]).toEqual(["winner-1"]);
  });

  it("pays a pinned game-winner prize whose only game is cancelled (rules 1–3)", async () => {
    const pinned = everyGameWinner({ id: "pinned", gameWinnerSlots: [{ scheduleId: "sched-tue-thu", weekday: "tue" }] });
    mocks.listChallengeCampaigns.mockResolvedValue([pinned]);

    const { settledCampaignIds } = await settle();

    expect(mocks.resolveGameWinnerRewards).toHaveBeenCalledWith(WED, scopeWith([pinned], [tueThuRow()]));
    expect([...settledCampaignIds]).toEqual(["pinned"]);
  });

  it("pays a pinned game-winner prize an edit only shrinks", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([
      everyGameWinner({
        id: "pinned",
        gameWinnerSlots: [
          { scheduleId: "sched-tue-thu", weekday: "tue" },
          { scheduleId: "sched-tue-thu", weekday: "thu" },
        ],
      }),
    ]);

    const { settledCampaignIds } = await settle({
      survivingWeekdays: ["tue"],
      survivingRecurrence: "weekly",
      schedule: { ...tueThu(), recurringDays: ["tue"] },
    });

    expect(mocks.resolveGameWinnerRewards).toHaveBeenCalledTimes(1);
    expect([...settledCampaignIds]).toEqual(["pinned"]);
  });

  it("a change that ends nothing still pays the venue's played games first (the delete takes their answers)", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([ranked()]);
    // Another game stays on, so the prize keeps going.
    mocks.loadLiveTriviaSchedulesForVenues.mockResolvedValue([tueThuRow(), futureOneOffRow()]);

    const { settledCampaignIds, weekCloses } = await settle();

    expect(mocks.resolveRankedPlaceRewards).toHaveBeenCalledTimes(1);
    // Not ending: no week is ranked early, and it isn't reported as settled for rule 4.
    expect(mocks.planRankedWeekEarlyClose).not.toHaveBeenCalled();
    expect(settledCampaignIds.size).toBe(0);
    expect(weekCloses.size).toBe(0);
  });

  it("the dry run applies the SQL's 24-hour one-off filter to the preloaded rows", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([ranked()]);
    // A one-off that ended days ago is no game left: the prize still ends.
    mocks.loadLiveTriviaSchedulesForVenues.mockResolvedValue([
      tueThuRow(),
      row({ id: "sched-past", recurring_type: "none", recurring_days: [], start_time: "2026-11-08T01:00:00.000Z" }),
    ]);

    const { settledCampaignIds } = await settle();

    expect([...settledCampaignIds]).toEqual(["ranked-1"]);
    expect(mocks.planRankedWeekEarlyClose).toHaveBeenCalledTimes(1);
  });

  it("a prize the change leaves running is blocked only by an error on the game being changed", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([ranked()]);
    mocks.loadLiveTriviaSchedulesForVenues.mockResolvedValue([tueThuRow(), futureOneOffRow()]);
    mocks.resolveRankedPlaceRewards.mockResolvedValue({
      errors: [{ scope: "sched-one-off@2026-11-13", message: "other game failed" }],
    });

    await expect(settle()).resolves.toEqual({ settledCampaignIds: new Set(), weekCloses: new Map() });

    mocks.resolveRankedPlaceRewards.mockResolvedValue({
      errors: [{ scope: "sched-tue-thu@2026-11-10", message: "this game failed" }],
    });
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    await expect(settle()).rejects.toBeInstanceOf(ScheduleChangeSettlementError);
  });

  it("a points target ending needs no sweep and never refuses", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([pointsTarget()]);
    mocks.resolveGameWinnerRewards.mockRejectedValue(new Error("would refuse"));

    const { settledCampaignIds } = await settle();

    expect(settledCampaignIds.size).toBe(0);
    expectNoPayoutAfterTheWrite();
  });

  it("refuses when a sweep fails, before anything is written", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([ranked()]);
    mocks.resolveRankedPlaceRewards.mockRejectedValue(new Error("sweep down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const refused = await settle().catch((caught: unknown) => caught);
      expect(refused).toBeInstanceOf(ScheduleChangeSettlementError);
      expect(isScheduleChangeSettlementError(refused)).toBe(true);
      expect((refused as Error).message).toBe(SCHEDULE_CHANGE_SETTLEMENT_MESSAGE);
      expect((refused as ScheduleChangeSettlementError).failures).toEqual([
        { campaignId: "ranked-1", message: "sweep down" },
      ]);
      expect(mocks.planRankedWeekEarlyClose).not.toHaveBeenCalled();
      expect(mocks.updateChallengeCampaign).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it("refuses when ranking the week early fails (a read failed)", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([ranked()]);
    mocks.planRankedWeekEarlyClose.mockRejectedValue(new Error("totals RPC failed"));
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);

    await expect(settle()).rejects.toBeInstanceOf(ScheduleChangeSettlementError);
    expect(mocks.payPlannedWeekClose).not.toHaveBeenCalled();
  });

  it("refuses on a sweep error for the game being cancelled (matched against the schedules BEFORE the change)", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([everyGameWinner()]);
    mocks.resolveGameWinnerRewards.mockResolvedValue({
      errors: [{ scope: "sched-tue-thu@2026-11-10", message: "standings failed" }],
    });
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);

    await expect(settle()).rejects.toBeInstanceOf(ScheduleChangeSettlementError);
  });

  it("is not blocked by another prize's sweep error", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([ranked()]);
    mocks.resolveRankedPlaceRewards.mockResolvedValue({
      errors: [{ scope: "someone-else@2026-11-04T05:00:00.000Z", message: "elsewhere" }],
    });

    const { settledCampaignIds } = await settle();

    expect([...settledCampaignIds]).toEqual(["ranked-1"]);
  });

  it("refuses when the venue's schedules can't be read", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([ranked()]);
    mocks.loadLiveTriviaSchedulesForVenues.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);

    await expect(settle()).rejects.toBeInstanceOf(ScheduleChangeSettlementError);
    expectNoPayoutAfterTheWrite();
  });

  it("refuses when the venue's prizes can't be read", async () => {
    mocks.listChallengeCampaigns.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);

    await expect(settle()).rejects.toBeInstanceOf(ScheduleChangeSettlementError);
    expect(mocks.loadLiveTriviaSchedulesForVenues).not.toHaveBeenCalled();
  });

  it("a places prize the sweep can't pay (admin-edited row) owes nothing: no sweep, no early close, no refusal", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([
      ranked({ recurringType: "none" }),
      ranked({ id: "unowned", rewardDefinitionId: null, gameTypes: ["live-trivia"] }),
    ]);
    mocks.resolveRankedPlaceRewards.mockRejectedValue(new Error("would refuse"));

    const { settledCampaignIds } = await settle();

    expectNoPayoutAfterTheWrite();
    expect([...settledCampaignIds].sort()).toEqual(["ranked-1", "unowned"]);
  });

  it("never runs an unscoped sweep from the request path, and never pays an early close before the write", () => {
    const source = readFileSync(join(process.cwd(), "lib/rewardGameSlotCascade.ts"), "utf8");
    expect(source).not.toMatch(/resolveGameWinnerRewards\(nowMs\)|resolveGameWinnerRewards\(params\.nowMs\)/);
    expect(source).not.toMatch(/resolveRankedPlaceRewards\(nowMs\)|resolveRankedPlaceRewards\(params\.nowMs\)/);
    expect(source).not.toContain("settleBeforeRetiring");
    expect(source).not.toContain("closeRankedWeekEarly");
    const settleFn = source.slice(
      source.indexOf("export const settleVenueBeforeScheduleChange"),
      source.indexOf("export async function cascadeScheduleChangeToRewards"),
    );
    expect(settleFn).not.toContain("payPlannedWeekClose");
    expect(settleFn).not.toContain("payWeekClose");
  });
});

describe("R1: refusals reach the partner as 409", () => {
  it("the admin DELETE and POST/PATCH catch blocks map ScheduleChangeSettlementError to 409", () => {
    const source = readFileSync(join(process.cwd(), "app/api/admin/route.ts"), "utf8");
    const refusals = source.match(/if \(isScheduleChangeSettlementError\(error\)\) \{\n\s+return NextResponse\.json\(\{ ok: false, error: error\.message \}, \{ status: 409 \}\);/g);
    expect(refusals).toHaveLength(2);
  });
});
