import { describe, expect, it } from "vitest";

// The terms sentence — "I want to make [N] of these rewards available every
// [period]" for points-target, "I want to give out [N] ... every [period]" for
// game-winner — is the contract a partner signs, and N is a count of real
// coupons. These tests
// pin the two things that make it honest: the guaranteed-games-per-period floors,
// and the refusal to let a venue promise more prizes than it has games to award
// them at. See docs/rewards-terms-sentence-plan.md §1b/§1c.

import {
  REWARD_PERIODS,
  allowedPeriodsFor,
  cadenceForPeriod,
  computeScheduleGameCounts,
  exactGameCountForPeriod,
  lockedQuantityFor,
  periodForCadence,
  renderTermsSentence,
  summarizeRewardSchedules,
  validateRewardTerms,
  type RewardScheduleShape,
} from "@/lib/rewardTerms";

const tuesdayWeekly: RewardScheduleShape = { recurringType: "weekly", weekdayCount: 1 };
const tueThuWeekly: RewardScheduleShape = { recurringType: "weekly", weekdayCount: 2 };
const everyDay: RewardScheduleShape = { recurringType: "daily", weekdayCount: 1 };
const monthly: RewardScheduleShape = { recurringType: "monthly", weekdayCount: 1 };
const yearly: RewardScheduleShape = { recurringType: "yearly", weekdayCount: 1 };
const oneOff: RewardScheduleShape = { recurringType: "none", weekdayCount: 1 };

const facts = (...schedules: RewardScheduleShape[]) => summarizeRewardSchedules(schedules);

describe("computeScheduleGameCounts", () => {
  it("counts a single weekly game with whole-period floors", () => {
    expect(computeScheduleGameCounts([tuesdayWeekly])).toEqual({
      daily: 0,
      weekly: 1,
      // Every month contains four whole weeks; the 5th Tuesday is a bonus, not a promise.
      monthly: 4,
      yearly: 52,
    });
  });

  it("counts multiple weekdays on one schedule", () => {
    expect(computeScheduleGameCounts([tueThuWeekly])).toEqual({
      daily: 0,
      weekly: 2,
      monthly: 8,
      yearly: 104,
    });
  });

  it("counts a daily schedule as seven games a week", () => {
    expect(computeScheduleGameCounts([everyDay])).toEqual({
      daily: 1,
      weekly: 7,
      monthly: 28,
      yearly: 364,
    });
  });

  it("sums independent schedules", () => {
    expect(computeScheduleGameCounts([tuesdayWeekly, tueThuWeekly])).toMatchObject({ weekly: 3 });
  });

  it("does not compound the 4-week month floor into the year", () => {
    // 52 weeks, not 4 × 12 = 48 — a weekly venue really does run 52 games a year.
    expect(computeScheduleGameCounts([tuesdayWeekly]).yearly).toBe(52);
  });

  it("rolls a monthly schedule up to twelve a year", () => {
    expect(computeScheduleGameCounts([monthly])).toEqual({
      daily: 0,
      weekly: 0,
      monthly: 1,
      yearly: 12,
    });
  });

  it("ignores one-off schedules — they recur in no period", () => {
    expect(computeScheduleGameCounts([oneOff])).toEqual({ daily: 0, weekly: 0, monthly: 0, yearly: 0 });
  });
});

describe("exactGameCountForPeriod", () => {
  it("makes a week exact for a weekly venue but a month inexact", () => {
    expect(exactGameCountForPeriod([tuesdayWeekly], "weekly")).toBe(1);
    // 4 or 5 Tuesdays depending on the month — not a fixed promise.
    expect(exactGameCountForPeriod([tuesdayWeekly], "monthly")).toBeNull();
    expect(exactGameCountForPeriod([tuesdayWeekly], "yearly")).toBeNull();
    expect(exactGameCountForPeriod([tuesdayWeekly], "daily")).toBeNull();
  });

  it("makes both day and week exact for a daily venue", () => {
    expect(exactGameCountForPeriod([everyDay], "daily")).toBe(1);
    expect(exactGameCountForPeriod([everyDay], "weekly")).toBe(7);
  });

  it("makes a day inexact once a weekly schedule adds a game to one weekday", () => {
    expect(exactGameCountForPeriod([everyDay, tuesdayWeekly], "daily")).toBeNull();
    // The week is still exact — both schedules repeat within it.
    expect(exactGameCountForPeriod([everyDay, tuesdayWeekly], "weekly")).toBe(8);
  });

  it("makes month and year exact for month-anchored schedules", () => {
    expect(exactGameCountForPeriod([monthly], "monthly")).toBe(1);
    expect(exactGameCountForPeriod([monthly], "yearly")).toBe(12);
    expect(exactGameCountForPeriod([monthly, yearly], "yearly")).toBe(13);
    expect(exactGameCountForPeriod([monthly, yearly], "monthly")).toBeNull();
  });

  it("returns null when nothing recurs", () => {
    for (const period of REWARD_PERIODS) {
      expect(exactGameCountForPeriod([oneOff], period)).toBeNull();
    }
  });

  it("refuses every period once a stray one-off is mixed in with a recurring schedule", () => {
    // A one-off adds a game in whichever period it lands in, then never again —
    // the week it happens has 2 games, every other week has 1. Locking a
    // game-winner count here would overpromise or underdeliver depending on the
    // week, so no period should read as exact anymore.
    for (const period of REWARD_PERIODS) {
      expect(exactGameCountForPeriod([tuesdayWeekly, oneOff], period)).toBeNull();
    }
  });
});

describe("allowedPeriodsFor", () => {
  it("offers a weekly venue everything but 'day' for a points target", () => {
    expect(allowedPeriodsFor(facts(tuesdayWeekly), "points_threshold")).toEqual([
      "weekly",
      "monthly",
      "yearly",
    ]);
  });

  it("offers a weekly venue only 'week' for a game-winner reward", () => {
    expect(allowedPeriodsFor(facts(tuesdayWeekly), "game_winner")).toEqual(["weekly"]);
  });

  it("offers a daily venue every period for a points target", () => {
    expect(allowedPeriodsFor(facts(everyDay), "points_threshold")).toEqual([
      "daily",
      "weekly",
      "monthly",
      "yearly",
    ]);
  });

  it("offers a daily venue day + week for a game-winner reward", () => {
    expect(allowedPeriodsFor(facts(everyDay), "game_winner")).toEqual(["daily", "weekly"]);
  });

  it("offers nothing when the venue has only a one-off game", () => {
    expect(allowedPeriodsFor(facts(oneOff), "points_threshold")).toEqual([]);
    expect(allowedPeriodsFor(facts(oneOff), "game_winner")).toEqual([]);
  });

  it("offers no game-winner period once a stray one-off joins a weekly schedule, but points targets still work", () => {
    expect(allowedPeriodsFor(facts(tuesdayWeekly, oneOff), "game_winner")).toEqual([]);
    // The one-off still guarantees a game to hit a points target in whichever
    // period it falls in, so it isn't blocked the way game_winner's exact count is.
    expect(allowedPeriodsFor(facts(tuesdayWeekly, oneOff), "points_threshold")).toEqual([
      "weekly",
      "monthly",
      "yearly",
    ]);
  });

  it("offers nothing when the game isn't scheduled at all", () => {
    expect(allowedPeriodsFor(facts(), "points_threshold")).toEqual([]);
  });
});

describe("lockedQuantityFor", () => {
  it("locks a game-winner quantity to the games in the period", () => {
    expect(lockedQuantityFor(facts(tueThuWeekly), "game_winner", "weekly")).toBe(2);
    expect(lockedQuantityFor(facts(everyDay), "game_winner", "daily")).toBe(1);
  });

  it("locks a one-off game-winner reward to exactly one prize", () => {
    expect(lockedQuantityFor(facts(oneOff), "game_winner", null)).toBe(1);
  });

  it("leaves the quantity to the partner for a points target", () => {
    expect(lockedQuantityFor(facts(tueThuWeekly), "points_threshold", "weekly")).toBeNull();
  });
});

describe("validateRewardTerms", () => {
  const weekly = facts(tuesdayWeekly);

  it("accepts a points target within an offered period", () => {
    expect(
      validateRewardTerms(weekly, { winCondition: "points_threshold", period: "weekly", quantity: 5 }),
    ).toBeNull();
  });

  it("blocks a period with no scheduled game", () => {
    expect(
      validateRewardTerms(weekly, { winCondition: "points_threshold", period: "daily", quantity: 1 }),
    ).toMatch(/don't run Live Trivia every day/);
  });

  it("blocks promising more game-winner rewards than there are games", () => {
    expect(
      validateRewardTerms(weekly, { winCondition: "game_winner", period: "weekly", quantity: 2 }),
    ).toMatch(/at most 1 "winner of the game" reward per week/);
  });

  it("accepts exactly as many game-winner rewards as there are games", () => {
    expect(
      validateRewardTerms(facts(tueThuWeekly), {
        winCondition: "game_winner",
        period: "weekly",
        quantity: 2,
      }),
    ).toBeNull();
  });

  it("blocks FEWER game-winner rewards than games — the count is locked, not capped", () => {
    // The resolver awards every finished game's winner and never reads
    // winner_quota, so storing "1 per week" at a two-game venue would quietly
    // hand out two. Refusing beats storing a number that won't be honored.
    expect(
      validateRewardTerms(facts(tueThuWeekly), {
        winCondition: "game_winner",
        period: "weekly",
        quantity: 1,
      }),
    ).toMatch(/gives out exactly 2 per week/);
  });

  it("blocks a game-winner period whose game count varies", () => {
    expect(
      validateRewardTerms(weekly, { winCondition: "game_winner", period: "monthly", quantity: 4 }),
    ).toMatch(/don't run the same number of Live Trivia games every month/);
  });

  it("blocks any recurring period when the venue only has a one-off game", () => {
    expect(
      validateRewardTerms(facts(oneOff), {
        winCondition: "points_threshold",
        period: "weekly",
        quantity: 1,
      }),
    ).toMatch(/Schedule recurring Live Trivia/);
  });

  it("accepts a multi-winner one-off points target", () => {
    expect(
      validateRewardTerms(facts(oneOff), {
        winCondition: "points_threshold",
        period: null,
        quantity: 5,
      }),
    ).toBeNull();
  });

  it("blocks a one-off game-winner reward worth more than one prize", () => {
    expect(
      validateRewardTerms(facts(oneOff), { winCondition: "game_winner", period: null, quantity: 2 }),
    ).toMatch(/has one winner/);
  });

  it("blocks an unscheduled venue outright", () => {
    expect(
      validateRewardTerms(facts(), { winCondition: "points_threshold", period: null, quantity: 1 }),
    ).toMatch(/isn't scheduled/);
  });

  it("range-checks the quantity", () => {
    for (const quantity of [0, -1, 101]) {
      expect(
        validateRewardTerms(weekly, { winCondition: "points_threshold", period: "weekly", quantity }),
      ).toMatch(/between 1 and 100/);
    }
  });
});

describe("sentence copy", () => {
  it("reads naturally for one and for many, defaulting to points-target wording", () => {
    expect(renderTermsSentence(1, "weekly")).toBe(
      "I want to make 1 of these rewards available every week.",
    );
    expect(renderTermsSentence(3, "monthly")).toBe(
      "I want to make 3 of these rewards available every month.",
    );
    expect(renderTermsSentence(2, "daily")).toBe(
      "I want to make 2 of these rewards available every day.",
    );
  });

  it("swaps in the one-off wording when there's no period", () => {
    expect(renderTermsSentence(5, null)).toBe(
      "I want to make 5 of these rewards available at my next Live Trivia game.",
    );
  });

  it("uses 'give out' wording for a game-winner reward, both periodic and one-off", () => {
    // Game-winner rewards a real player wins, not a standing promotion — and this
    // sentence is superseded by the game picker (docs/rewards-game-winner-picker-plan.md)
    // once that ships, so it stays "give out" rather than adopting the new copy.
    expect(renderTermsSentence(2, "weekly", "game_winner")).toBe(
      "I want to give out 2 of these rewards every week.",
    );
    expect(renderTermsSentence(1, null, "game_winner")).toBe(
      "I want to give out 1 of these rewards at my next Live Trivia game.",
    );
  });

  it("uses 'make ... available' wording when points_threshold is passed explicitly", () => {
    expect(renderTermsSentence(4, "yearly", "points_threshold")).toBe(
      "I want to make 4 of these rewards available every year.",
    );
  });
});

describe("engine mapping", () => {
  it("maps the sentence's period straight onto the campaign recurrence", () => {
    expect(cadenceForPeriod("monthly")).toBe("monthly");
    expect(cadenceForPeriod(null)).toBe("none");
    expect(periodForCadence("monthly")).toBe("monthly");
    expect(periodForCadence("none")).toBeNull();
  });
});
