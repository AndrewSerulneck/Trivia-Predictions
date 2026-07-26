import { readFileSync } from "fs";
import { join } from "path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChallengeCampaign } from "@/types";

// What happens to a slot-pinned reward when the game it was offered at is
// cancelled or edited. Two rules carry real money here (see
// docs/rewards-game-winner-picker-plan.md Phase 4):
//   1. losing SOME games shrinks the reward; only losing its LAST game retires it,
//   2. retiring means is_active = false — never a DELETE, because
//      challenge_campaign_redemptions cascades and would take coupons players
//      already won with it.

const mocks = vi.hoisted(() => ({
  listChallengeCampaigns: vi.fn(async (_params: { venueId?: string } = {}): Promise<ChallengeCampaign[]> => []),
  updateChallengeCampaign: vi.fn(async (input: Record<string, unknown>) => input as unknown as ChallengeCampaign),
  deleteChallengeCampaign: vi.fn(async () => ({ deleted: true })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/challengeCampaigns", () => ({
  listChallengeCampaigns: mocks.listChallengeCampaigns,
  updateChallengeCampaign: mocks.updateChallengeCampaign,
  deleteChallengeCampaign: mocks.deleteChallengeCampaign,
}));

import {
  applyScheduleChangeToGameWinnerRewards,
  cascadeScheduleChangeToRewards,
  describeCascadeReport,
  rewardCascadeRecurrence,
} from "@/lib/rewardGameSlotCascade";

function makeCampaign(overrides: Partial<ChallengeCampaign> = {}): ChallengeCampaign {
  return {
    id: "camp-1",
    createdAt: "2026-07-20T00:00:00.000Z",
    name: "Live Trivia Challenge",
    rules: "Win the Live Trivia game",
    venueIds: ["venue-1"],
    scheduleType: "single_day",
    activeDays: ["tue", "thu"],
    gameTypes: ["live-trivia"],
    challengeMode: "progress",
    leaderboardDisplayLimit: 10,
    leaderboardTiebreaker: "earliest",
    pointMultiplier: 1,
    pointsRequiredToWin: 1,
    recurringType: "weekly",
    winCondition: "game_winner",
    winnerQuota: 2,
    gameWinnerSlots: [
      { scheduleId: "sched-1", weekday: "tue" },
      { scheduleId: "sched-1", weekday: "thu" },
    ],
    rewardDefinitionId: "live_trivia_challenge",
    prizeKind: "menu_item",
    prizeMenuItem: "appetizer",
    isActive: true,
    ...overrides,
  } as ChallengeCampaign;
}

beforeEach(() => {
  mocks.listChallengeCampaigns.mockReset();
  mocks.listChallengeCampaigns.mockResolvedValue([makeCampaign()]);
  mocks.updateChallengeCampaign.mockClear();
  mocks.deleteChallengeCampaign.mockClear();
});

describe("applyScheduleChangeToGameWinnerRewards", () => {
  it("drops the cancelled weekday and shrinks the quota and active days to match", async () => {
    // Tue+Thu trivia edited down to Tuesday only.
    const report = await applyScheduleChangeToGameWinnerRewards({
      scheduleId: "sched-1",
      venueId: "venue-1",
      survivingWeekdays: ["tue"],
    });

    expect(mocks.updateChallengeCampaign).toHaveBeenCalledWith({
      id: "camp-1",
      gameWinnerSlots: [{ scheduleId: "sched-1", weekday: "tue" }],
      winnerQuota: 1,
      activeDays: ["tue"],
    });
    expect(report.pruned).toEqual([{ campaignId: "camp-1", remainingSlots: 1 }]);
    expect(report.deactivated).toEqual([]);
  });

  it("deactivates — never deletes — a reward whose last game is gone", async () => {
    const report = await applyScheduleChangeToGameWinnerRewards({
      scheduleId: "sched-1",
      venueId: "venue-1",
      survivingWeekdays: [],
    });

    expect(mocks.updateChallengeCampaign).toHaveBeenCalledWith({ id: "camp-1", isActive: false });
    // The rule that protects coupons already sitting in players' wallets.
    expect(mocks.deleteChallengeCampaign).not.toHaveBeenCalled();
    expect(report.deactivated).toEqual(["camp-1"]);
    expect(report.pruned).toEqual([]);
  });

  it("keeps a reward alive on its OTHER schedule when one of two games is deleted", async () => {
    // Two different games (6pm and 9pm) that happen to share a weekday — the
    // case slot identity exists for. Deleting one must not touch the other.
    mocks.listChallengeCampaigns.mockResolvedValue([
      makeCampaign({
        activeDays: ["tue"],
        gameWinnerSlots: [
          { scheduleId: "sched-1", weekday: "tue" },
          { scheduleId: "sched-2", weekday: "tue" },
        ],
      }),
    ]);

    await applyScheduleChangeToGameWinnerRewards({
      scheduleId: "sched-1",
      venueId: "venue-1",
      survivingWeekdays: [],
    });

    expect(mocks.updateChallengeCampaign).toHaveBeenCalledWith({
      id: "camp-1",
      gameWinnerSlots: [{ scheduleId: "sched-2", weekday: "tue" }],
      winnerQuota: 1,
      activeDays: ["tue"],
    });
  });

  // ── Rule 3: recurrence changes ────────────────────────────────────────────
  // Weekdays alone are not enough. A weekly Tuesday game switched to a one-off
  // Tuesday leaves every weekday intact, so the weekday pruning sees "nothing
  // changed" while the reward keeps promising "1 winner every week" for a game
  // that will never run again.

  it("retires a weekly reward when its game becomes a one-off, even though the weekday survives", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([
      makeCampaign({
        activeDays: ["tue"],
        recurringType: "weekly",
        winnerQuota: 1,
        gameWinnerSlots: [{ scheduleId: "sched-1", weekday: "tue" }],
      }),
    ]);

    const report = await applyScheduleChangeToGameWinnerRewards({
      scheduleId: "sched-1",
      venueId: "venue-1",
      survivingWeekdays: ["tue"],
      survivingRecurrence: "none",
    });

    expect(mocks.updateChallengeCampaign).toHaveBeenCalledWith({ id: "camp-1", isActive: false });
    expect(mocks.deleteChallengeCampaign).not.toHaveBeenCalled();
    expect(report.retiredForRecurrenceChange).toEqual(["camp-1"]);
    // Reported separately from a cancelled game so the notice can say which.
    expect(report.deactivated).toEqual([]);
    expect(report.pruned).toEqual([]);
  });

  it("retires a one-off reward when its game is promoted to weekly", async () => {
    // The reverse: a "none" campaign is spent at its FIRST resolved game, so it
    // would award once and then look broken against a now-repeating game.
    mocks.listChallengeCampaigns.mockResolvedValue([
      makeCampaign({
        activeDays: [],
        recurringType: "none",
        winnerQuota: 1,
        gameWinnerSlots: [{ scheduleId: "sched-1", weekday: "tue" }],
      }),
    ]);

    const report = await applyScheduleChangeToGameWinnerRewards({
      scheduleId: "sched-1",
      venueId: "venue-1",
      survivingWeekdays: ["tue"],
      survivingRecurrence: "weekly",
    });

    expect(mocks.updateChallengeCampaign).toHaveBeenCalledWith({ id: "camp-1", isActive: false });
    expect(report.retiredForRecurrenceChange).toEqual(["camp-1"]);
  });

  it("leaves a reward alone when the recurrence is unchanged", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([
      makeCampaign({
        activeDays: ["tue"],
        recurringType: "weekly",
        winnerQuota: 1,
        gameWinnerSlots: [{ scheduleId: "sched-1", weekday: "tue" }],
      }),
    ]);

    const report = await applyScheduleChangeToGameWinnerRewards({
      scheduleId: "sched-1",
      venueId: "venue-1",
      survivingWeekdays: ["tue"],
      survivingRecurrence: "weekly",
    });

    expect(mocks.updateChallengeCampaign).not.toHaveBeenCalled();
    expect(report.retiredForRecurrenceChange).toEqual([]);
  });

  it("does not retire a reward pinned only to OTHER schedules on a recurrence change", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([
      makeCampaign({
        activeDays: ["tue"],
        recurringType: "weekly",
        winnerQuota: 1,
        gameWinnerSlots: [{ scheduleId: "sched-2", weekday: "tue" }],
      }),
    ]);

    const report = await applyScheduleChangeToGameWinnerRewards({
      scheduleId: "sched-1",
      venueId: "venue-1",
      survivingWeekdays: ["tue"],
      survivingRecurrence: "none",
    });

    expect(mocks.updateChallengeCampaign).not.toHaveBeenCalled();
    expect(report.retiredForRecurrenceChange).toEqual([]);
  });

  it("treats a deleted schedule (null recurrence) as a cancellation, not a recurrence change", async () => {
    // A delete has no surviving recurrence to compare against; the reward must
    // land in `deactivated` so the partner is told the game is gone, not that it
    // changed how often it repeats.
    mocks.listChallengeCampaigns.mockResolvedValue([
      makeCampaign({
        activeDays: ["tue"],
        recurringType: "weekly",
        winnerQuota: 1,
        gameWinnerSlots: [{ scheduleId: "sched-1", weekday: "tue" }],
      }),
    ]);

    const report = await applyScheduleChangeToGameWinnerRewards({
      scheduleId: "sched-1",
      venueId: "venue-1",
      survivingWeekdays: [],
      survivingRecurrence: null,
    });

    expect(report.deactivated).toEqual(["camp-1"]);
    expect(report.retiredForRecurrenceChange).toEqual([]);
  });

  it("leaves an unpinned (legacy) reward completely alone", async () => {
    // null means "award at every game" — it was never tied to this schedule.
    mocks.listChallengeCampaigns.mockResolvedValue([makeCampaign({ gameWinnerSlots: null })]);

    const report = await applyScheduleChangeToGameWinnerRewards({
      scheduleId: "sched-1",
      venueId: "venue-1",
      survivingWeekdays: [],
    });

    expect(mocks.updateChallengeCampaign).not.toHaveBeenCalled();
    expect(report).toEqual({ pruned: [], deactivated: [], retiredForRecurrenceChange: [], errors: [] });
  });

  it("ignores points-target rewards and already-inactive rewards", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([
      makeCampaign({ id: "points", winCondition: "points_threshold" }),
      makeCampaign({ id: "retired", isActive: false }),
    ]);

    await applyScheduleChangeToGameWinnerRewards({
      scheduleId: "sched-1",
      venueId: "venue-1",
      survivingWeekdays: [],
    });

    expect(mocks.updateChallengeCampaign).not.toHaveBeenCalled();
  });

  it("does nothing when the changed schedule isn't one this reward covers", async () => {
    await applyScheduleChangeToGameWinnerRewards({
      scheduleId: "sched-other",
      venueId: "venue-1",
      survivingWeekdays: [],
    });

    expect(mocks.updateChallengeCampaign).not.toHaveBeenCalled();
  });

  it("does nothing when the weekday it lost was one it never covered", async () => {
    // Growing a schedule (Tue → Tue+Thu) must not silently widen a reward, and
    // must not rewrite it either.
    await applyScheduleChangeToGameWinnerRewards({
      scheduleId: "sched-1",
      venueId: "venue-1",
      survivingWeekdays: ["tue", "thu", "fri"],
    });

    expect(mocks.updateChallengeCampaign).not.toHaveBeenCalled();
  });

  it("skips a schedule with no venue rather than scanning every campaign", async () => {
    await applyScheduleChangeToGameWinnerRewards({
      scheduleId: "sched-1",
      venueId: null,
      survivingWeekdays: [],
    });

    expect(mocks.listChallengeCampaigns).not.toHaveBeenCalled();
  });

  it("collects a failed update instead of abandoning the remaining rewards", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([
      makeCampaign({ id: "camp-broken" }),
      makeCampaign({ id: "camp-ok" }),
    ]);
    mocks.updateChallengeCampaign.mockRejectedValueOnce(new Error("db down"));

    const report = await applyScheduleChangeToGameWinnerRewards({
      scheduleId: "sched-1",
      venueId: "venue-1",
      survivingWeekdays: ["tue"],
    });

    expect(report.errors).toEqual([{ campaignId: "camp-broken", message: "db down" }]);
    expect(report.pruned).toEqual([{ campaignId: "camp-ok", remainingSlots: 1 }]);
  });
});

describe("cascadeScheduleChangeToRewards", () => {
  it("never lets a cascade failure surface as a failed schedule change", async () => {
    // The delete/edit already committed; throwing here would invite a retry.
    mocks.listChallengeCampaigns.mockRejectedValue(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      cascadeScheduleChangeToRewards({
        scheduleId: "sched-1",
        venueId: "venue-1",
        survivingWeekdays: [],
      }),
    ).resolves.toEqual({ pruned: [], deactivated: [], retiredForRecurrenceChange: [], errors: [] });

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("schedule funnels are wired to the cascade", () => {
  // The cascade is invisible from the outside: if these call sites are dropped,
  // rewards silently keep paying out at games that no longer exist. Both admin
  // and owner schedule edits/deletes funnel through this one module.
  const source = readFileSync(join(process.cwd(), "lib/liveShowdownAdmin.ts"), "utf8");

  it("calls the cascade from both the delete and the update funnel", () => {
    const deleteFn = source.slice(source.indexOf("export async function deleteAdminLiveShowdownSchedule"));
    const updateFn = source.slice(
      source.indexOf("export async function updateAdminLiveShowdownSchedule"),
      source.indexOf("export async function deleteAdminLiveShowdownSchedule"),
    );
    expect(deleteFn).toContain("cascadeScheduleChangeToRewards(");
    expect(updateFn).toContain("cascadeScheduleChangeToRewards(");
  });

  it("never deletes a campaign from the schedule funnels", () => {
    expect(source).not.toContain("deleteChallengeCampaign");
  });

  it("passes the schedule's surviving recurrence, not just its weekdays", () => {
    // Without this the cascade can't see a weekly→one-off flip (rule 3): every
    // weekday survives, so the weekday pruning reports "nothing changed".
    expect(source).toContain("survivingRecurrence");
    expect(source).toContain("rewardCascadeRecurrence(");
  });

  it("returns the cascade report to its callers instead of only logging it", () => {
    // A silently retired reward is one the partner is still advertising to
    // players. Both funnels must hand the report up so the UI can say so.
    expect(source).toContain("rewardCascade");
  });
});

describe("rewardCascadeRecurrence", () => {
  // Must read a schedule the same way lib/rewards.ts's rewardRecurringType does,
  // or the cascade and the creation path disagree about what a schedule is and
  // every reward gets retired the first time its game is edited.
  it("treats daily and weekly as repeating", () => {
    expect(rewardCascadeRecurrence({ recurringType: "daily" })).toBe("weekly");
    expect(rewardCascadeRecurrence({ recurringType: "weekly" })).toBe("weekly");
  });

  it("treats monthly and yearly as single dated games, matching the engine", () => {
    // enumerateScheduleOccurrences runs these exactly once at start_time.
    expect(rewardCascadeRecurrence({ recurringType: "monthly" })).toBe("none");
    expect(rewardCascadeRecurrence({ recurringType: "yearly" })).toBe("none");
  });

  it("reads a 'none' schedule carrying explicit recurring days as weekly", () => {
    expect(
      rewardCascadeRecurrence({ recurringType: "none", recurringDays: ["tue"] }),
    ).toBe("weekly");
    expect(rewardCascadeRecurrence({ recurringType: "none", recurringDays: [] })).toBe("none");
    expect(rewardCascadeRecurrence({ recurringType: null })).toBe("none");
  });

  it("does not let a monthly schedule's stray recurring days make it repeating", () => {
    expect(
      rewardCascadeRecurrence({ recurringType: "monthly", recurringDays: ["fri"] }),
    ).toBe("none");
  });
});

describe("describeCascadeReport", () => {
  const base = { pruned: [], deactivated: [], retiredForRecurrenceChange: [], errors: [] };

  it("says nothing when no reward was affected", () => {
    expect(describeCascadeReport(base)).toBeNull();
  });

  it("distinguishes a cancelled game from a changed recurrence", () => {
    expect(describeCascadeReport({ ...base, deactivated: ["a"] })).toContain(
      "no longer runs",
    );
    expect(
      describeCascadeReport({ ...base, retiredForRecurrenceChange: ["a"] }),
    ).toContain("how often the game repeats changed");
  });

  it("pluralizes and reports several outcomes at once", () => {
    const notice = describeCascadeReport({
      ...base,
      deactivated: ["a", "b"],
      pruned: [{ campaignId: "c", remainingSlots: 1 }],
    });
    expect(notice).toContain("2 rewards");
    expect(notice).toContain("1 reward now covers fewer games");
  });

  it("stays silent about errors alone — the partner's change did succeed", () => {
    expect(
      describeCascadeReport({ ...base, errors: [{ campaignId: "a", message: "boom" }] }),
    ).toBeNull();
  });
});
