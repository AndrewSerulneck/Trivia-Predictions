import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The guest-facing reward description (docs/reward-descriptions-plan.md §3,
// copy approved by Andrew 2026-10-03). One case per §3 row, plus the state
// overrides and the invariants every description must hold: never "this venue"
// (the guest is standing in it), never the retired "Awarded to the winner", no
// unfilled {placeholder}, and times always in the SCHEDULE's timezone — never the
// phone's.

import {
  describeReward,
  describeRewardWin,
  type RewardDescription,
  type RewardDescriptionInput,
  type RewardScheduleSlotFact,
} from "@/lib/rewardDescription";
import {
  REWARD_DEFINITIONS,
  describeRewardPrizeInSentence,
  withIndefiniteArticle,
} from "@/lib/rewardDefinitions";
import { enumerateGameSlots, type RewardGameScheduleShape } from "@/lib/rewardGameSlots";

// Every time below is authored in Chicago and the runtime is forced to UTC, so a
// composer that leaked the runtime zone would print 1:00 AM / Wednesday instead.
const SCHEDULE_TZ = "America/Chicago";
const originalTZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC";
});
afterAll(() => {
  process.env.TZ = originalTZ;
});

// 2026-10-07T01:00Z = Tuesday Oct 6, 8:00 PM CDT (Wednesday 1:00 AM in UTC).
const tue8pm: RewardGameScheduleShape = {
  scheduleId: "sched-tue",
  title: "Trivia Night",
  recurringType: "weekly",
  weekdays: ["tue"],
  startTime: "2026-10-07T01:00:00.000Z",
  timezone: SCHEDULE_TZ,
};
// 2026-10-09T02:00Z = Thursday Oct 8, 9:00 PM CDT.
const thu9pm: RewardGameScheduleShape = {
  scheduleId: "sched-thu",
  title: "Late Trivia",
  recurringType: "weekly",
  weekdays: ["thu"],
  startTime: "2026-10-09T02:00:00.000Z",
  timezone: SCHEDULE_TZ,
};
// 2026-10-14T01:00Z = Tuesday Oct 13, 8:00 PM CDT, one game only.
const oneOffTue: RewardGameScheduleShape = {
  scheduleId: "sched-once",
  title: "Halloween Special",
  recurringType: "none",
  weekdays: ["tue"],
  startTime: "2026-10-14T01:00:00.000Z",
  timezone: SCHEDULE_TZ,
};

const slotsOf = (...shapes: RewardGameScheduleShape[]): RewardScheduleSlotFact[] => enumerateGameSlots(shapes);

const NOW = new Date("2026-10-03T17:00:00.000Z");

const GIFT_CARD = { prizeKind: "gift_card" as const, prizeGiftCertificateAmount: 100 };

const liveTrivia = (overrides: Partial<RewardDescriptionInput> = {}): RewardDescriptionInput => ({
  rules: "Win the Live Trivia game",
  rewardDefinitionId: "live_trivia_challenge",
  winCondition: "game_winner",
  recurringType: "weekly",
  activeDays: ["tue"],
  winnerQuota: 1,
  pointsRequiredToWin: 1,
  gameWinnerSlots: [{ scheduleId: "sched-tue", weekday: "tue" }],
  schedule: { slots: slotsOf(tue8pm, thu9pm) },
  timezone: SCHEDULE_TZ,
  ...GIFT_CARD,
  ...overrides,
});

const nfl = (overrides: Partial<RewardDescriptionInput> = {}): RewardDescriptionInput => ({
  rules: "Get the most NFL picks right at this venue",
  rewardDefinitionId: "nfl_pickem_challenge",
  winCondition: "game_winner",
  recurringType: "weekly",
  activeDays: ["thu", "fri", "sat", "sun", "mon", "tue", "wed"],
  winnerQuota: 1,
  pointsRequiredToWin: 1,
  nflWeekScope: { kind: "weekly", season: 2026 },
  nfl: { upcomingStartDate: null, seasonEndDate: "2027-01-12" },
  ...GIFT_CARD,
  ...overrides,
});

const allText = (description: RewardDescription): string =>
  [description.summary, description.when, description.fineprint].filter(Boolean).join(" ");

/** The invariants every composed (non-legacy) description holds. */
const expectClean = (description: RewardDescription): void => {
  const text = allText(description);
  expect(text.toLowerCase()).not.toContain("this venue");
  expect(text).not.toContain("Awarded to the winner");
  expect(text).not.toMatch(/[{}]/);
  expect(text).not.toMatch(/\s{2,}/);
  expect(text).not.toContain("undefined");
  expect(text).not.toContain("null");
  expect(description.isCustom).toBe(false);
};

const describeClean = (input: RewardDescriptionInput, now: Date = NOW): RewardDescription => {
  const description = describeReward(input, now);
  expectClean(description);
  return description;
};

describe("describeReward — NFL Pick 'Em (§3 rows 1–4)", () => {
  it("most picks, weekly", () => {
    expect(describeClean(nfl())).toEqual({
      summary: "Get the most NFL picks right this week and win a $100 gift card.",
      when: "A new contest starts every Thursday of the NFL season. Make your picks before each game kicks off.",
      fineprint:
        "Ties are broken by this week's tiebreaker question. At least 3 players need to make picks for a winner to be named.",
      isCustom: false,
    });
  });

  it("most picks, rest of season", () => {
    expect(
      describeClean(
        nfl({ recurringType: "none", nflWeekScope: { kind: "season", season: 2026, fromWeek: 5 } }),
      ),
    ).toEqual({
      summary:
        "Get the most NFL picks right from Week 5 through the end of the regular season and win a $100 gift card.",
      when: "One contest, all season long. Make your picks every week before kickoff.",
      fineprint:
        "Ties are broken by the final week's tiebreaker question. At least 3 players need to make picks for a winner to be named.",
      isCustom: false,
    });
  });

  it("picks target, weekly — many winners", () => {
    expect(
      describeClean(nfl({ winCondition: "points_threshold", pointsRequiredToWin: 10, winnerQuota: 3 })),
    ).toEqual({
      summary: "Get 10 NFL picks right this week and win a $100 gift card.",
      when: "Resets every Thursday during the NFL season.",
      fineprint: "The first 3 players to get there each week win.",
      isCustom: false,
    });
  });

  it("picks target, season — one winner", () => {
    expect(
      describeClean(
        nfl({
          winCondition: "points_threshold",
          pointsRequiredToWin: 25,
          winnerQuota: 1,
          recurringType: "none",
          nflWeekScope: { kind: "season", season: 2026, fromWeek: 5 },
        }),
      ),
    ).toEqual({
      summary: "Get 25 NFL picks right by the end of the regular season and win a $100 gift card.",
      when: "Counts from Week 5 on.",
      fineprint: "The first player to get there wins.",
      isCustom: false,
    });
  });

  it("upcoming: says when it starts instead of the cadence", () => {
    const description = describeClean(nfl({ nfl: { upcomingStartDate: "2026-09-10", seasonEndDate: "2027-01-12" } }));
    expect(description.when).toBe("Starts Thu, Sep 10. Get your picks in early.");
    expect(description.summary).toBe("Get the most NFL picks right this week and win a $100 gift card.");
  });

  it("off-season: a weekly reward that outlived the season", () => {
    const description = describeClean(nfl(), new Date("2027-02-20T17:00:00.000Z"));
    expect(description.when).toBe("Back when the NFL season starts.");
  });

  it("the season's last day still counts as in-season (Eastern date, not UTC)", () => {
    // 2027-01-13T03:00Z is still Jan 12 at 10 PM in New York.
    const description = describeClean(nfl(), new Date("2027-01-13T03:00:00.000Z"));
    expect(description.when).not.toBe("Back when the NFL season starts.");
  });

  it("quota filled this week: says when the next contest starts", () => {
    const description = describeClean(
      nfl({
        winCondition: "points_threshold",
        pointsRequiredToWin: 10,
        winnerQuota: 2,
        quotaRemaining: 0,
        nextCycleStart: "2026-10-08T04:00:00.000Z", // Thu Oct 8, 12:00 AM Eastern
      }),
    );
    expect(description.when).toBe("Next contest starts Thu, Oct 8.");
  });

  it("a malformed scope falls back to the stored rules", () => {
    expect(describeReward(nfl({ nflWeekScope: null }), NOW)).toEqual({
      summary: "Get the most NFL picks right at this venue",
      when: null,
      fineprint: null,
      isCustom: true,
    });
  });
});

describe("describeReward — Live Trivia game winner (§3 rows 5–7)", () => {
  it("pinned to one recurring game", () => {
    expect(describeClean(liveTrivia())).toEqual({
      summary: "Win Live Trivia on Tuesday night and win a $100 gift card.",
      when: "Live Trivia starts at 8:00 PM every Tuesday. Be here and signed in when it starts.",
      fineprint: "One winner per game.",
      isCustom: false,
    });
  });

  it("pinned to several recurring games: plural nights and the any-of list", () => {
    const description = describeClean(
      liveTrivia({
        winnerQuota: 2,
        activeDays: ["tue", "thu"],
        // Stored out of week order on purpose — the copy reads in week order.
        gameWinnerSlots: [
          { scheduleId: "sched-thu", weekday: "thu" },
          { scheduleId: "sched-tue", weekday: "tue" },
        ],
      }),
    );
    expect(description).toEqual({
      summary: "Win Live Trivia on Tuesday and Thursday nights and win a $100 gift card.",
      when: "Live Trivia starts at 8:00 PM every Tuesday and 9:00 PM every Thursday. Be here and signed in when it starts.",
      fineprint: "One winner per game. Win any of these games: Tuesday 8:00 PM or Thursday 9:00 PM.",
      isCustom: false,
    });
  });

  it("several days at the same time collapse into one phrase", () => {
    const description = describeClean(
      liveTrivia({
        winnerQuota: 3,
        activeDays: ["mon", "wed", "fri"],
        gameWinnerSlots: [
          { scheduleId: "sched-mwf", weekday: "mon" },
          { scheduleId: "sched-mwf", weekday: "wed" },
          { scheduleId: "sched-mwf", weekday: "fri" },
        ],
        schedule: { slots: slotsOf({ ...tue8pm, scheduleId: "sched-mwf", weekdays: ["mon", "wed", "fri"] }) },
      }),
    );
    expect(description.summary).toBe("Win Live Trivia on Monday, Wednesday and Friday nights and win a $100 gift card.");
    expect(description.when).toBe(
      "Live Trivia starts at 8:00 PM every Monday, Wednesday and Friday. Be here and signed in when it starts.",
    );
    expect(description.fineprint).toBe(
      "One winner per game. Win any of these games: Monday 8:00 PM, Wednesday 8:00 PM or Friday 8:00 PM.",
    );
  });

  it("a daytime game is not called a night", () => {
    // 2026-10-06T19:00Z = Tuesday 2:00 PM CDT.
    const description = describeClean(
      liveTrivia({ schedule: { slots: slotsOf({ ...tue8pm, startTime: "2026-10-06T19:00:00.000Z" }) } }),
    );
    expect(description.summary).toBe("Win Live Trivia on Tuesday and win a $100 gift card.");
    expect(description.when).toBe("Live Trivia starts at 2:00 PM every Tuesday. Be here and signed in when it starts.");
  });

  it("one-off game", () => {
    expect(
      describeClean(
        liveTrivia({
          recurringType: "none",
          activeDays: [],
          gameWinnerSlots: [{ scheduleId: "sched-once", weekday: "tue" }],
          schedule: { slots: slotsOf(tue8pm, oneOffTue) },
          prizeKind: "menu_item",
          prizeMenuItem: "appetizer",
          prizeDiscountKind: "percent",
          prizeDiscountValue: 100,
        }),
      ),
    ).toEqual({
      summary: "Win Live Trivia on Tue, Oct 13 and win a free appetizer.",
      when: "It starts at 8:00 PM. One game only.",
      fineprint: "One winner.",
      isCustom: false,
    });
  });

  it("legacy unpinned weekly reward lists every recurring game", () => {
    expect(describeClean(liveTrivia({ gameWinnerSlots: null, activeDays: ["tue", "thu"], winnerQuota: 2 }))).toEqual({
      summary: "Win any Live Trivia game this week and win a $100 gift card.",
      when: "Live Trivia runs Tuesdays at 8:00 PM and Thursdays at 9:00 PM.",
      fineprint: "One winner per game.",
      isCustom: false,
    });
  });

  it("a daily schedule reads as 'every day', not seven weekdays", () => {
    const daily = { ...tue8pm, scheduleId: "sched-daily", recurringType: "daily" as const, weekdays: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] };
    const description = describeClean(liveTrivia({ gameWinnerSlots: null, schedule: { slots: slotsOf(daily) } }));
    expect(description.when).toBe("Live Trivia runs every day at 8:00 PM.");
  });

  describe("schedule no longer matches — never a stale time", () => {
    it("a pinned game was deleted", () => {
      const description = describeClean(
        liveTrivia({
          gameWinnerSlots: [
            { scheduleId: "sched-tue", weekday: "tue" },
            { scheduleId: "sched-gone", weekday: "thu" },
          ],
          winnerQuota: 2,
        }),
      );
      expect(description.summary).toBe("Win Live Trivia on Tuesday and Thursday nights and win a $100 gift card.");
      expect(description.when).toBe("Check the Live Trivia schedule for the next game.");
      expect(allText(description)).not.toMatch(/\d:\d\d/);
    });

    it("a pinned game moved to another weekday", () => {
      const description = describeClean(liveTrivia({ gameWinnerSlots: [{ scheduleId: "sched-tue", weekday: "wed" }] }));
      expect(description.when).toBe("Check the Live Trivia schedule for the next game.");
      expect(allText(description)).not.toMatch(/\d:\d\d/);
    });

    it("the schedule couldn't be read at all", () => {
      const description = describeClean(liveTrivia({ schedule: null }));
      expect(description.when).toBe("Check the Live Trivia schedule for the next game.");
    });

    it("a one-off game that's gone keeps its weekday but drops the date and time", () => {
      const description = describeClean(
        liveTrivia({
          recurringType: "none",
          activeDays: [],
          gameWinnerSlots: [{ scheduleId: "sched-once", weekday: "tue" }],
          schedule: { slots: slotsOf(tue8pm) },
        }),
      );
      expect(description.summary).toBe("Win Live Trivia on Tuesday night and win a $100 gift card.");
      expect(description.when).toBe("Check the Live Trivia schedule for the next game.");
    });
  });

  it("quota filled this week: says when the next contest starts, in the venue's zone", () => {
    const description = describeClean(
      liveTrivia({ quotaRemaining: 0, nextCycleStart: "2026-10-14T01:00:00.000Z" }),
    );
    expect(description.when).toBe("Next contest starts Tue, Oct 13.");
    expect(description.summary).toBe("Win Live Trivia on Tuesday night and win a $100 gift card.");
  });

  it("a filled one-off reward has no next contest", () => {
    const description = describeClean(
      liveTrivia({
        recurringType: "none",
        activeDays: [],
        gameWinnerSlots: [{ scheduleId: "sched-once", weekday: "tue" }],
        schedule: { slots: slotsOf(oneOffTue) },
        quotaRemaining: 0,
        nextCycleStart: "2026-10-21T01:00:00.000Z",
      }),
    );
    expect(description.when).toBe("It starts at 8:00 PM. One game only.");
  });
});

describe("describeReward — Live Trivia points target (§3 rows 8–9)", () => {
  const points = (overrides: Partial<RewardDescriptionInput> = {}): RewardDescriptionInput =>
    liveTrivia({
      winCondition: "points_threshold",
      pointsRequiredToWin: 500,
      gameWinnerSlots: null,
      activeDays: ["tue", "thu"],
      winnerQuota: 3,
      prizeKind: "menu_item",
      prizeMenuItem: "whole_order",
      prizeDiscountKind: "percent",
      prizeDiscountValue: 20,
      ...overrides,
    });

  it("weekly", () => {
    expect(describeClean(points())).toEqual({
      summary: "Earn 500 points in Live Trivia this week and win 20% off your whole order.",
      when: "Live Trivia runs Tuesdays at 8:00 PM and Thursdays at 9:00 PM. Your points reset every Tuesday.",
      fineprint: "The first 3 players to hit 500 each week win.",
      isCustom: false,
    });
  });

  it("daily, one winner", () => {
    const description = describeClean(points({ recurringType: "daily", winnerQuota: 1 }));
    expect(description.summary).toBe("Earn 500 points in Live Trivia today and win 20% off your whole order.");
    expect(description.when).toBe(
      "Live Trivia runs Tuesdays at 8:00 PM and Thursdays at 9:00 PM. Your points reset every day.",
    );
    expect(description.fineprint).toBe("The first player to hit 500 each day wins.");
  });

  it("monthly", () => {
    const description = describeClean(points({ recurringType: "monthly", pointsRequiredToWin: 1000 }));
    expect(description.summary).toBe("Earn 1,000 points in Live Trivia this month and win 20% off your whole order.");
    expect(description.when).toMatch(/Your points reset on the 1st of every month\.$/);
    expect(description.fineprint).toBe("The first 3 players to hit 1,000 each month win.");
  });

  it("yearly", () => {
    const description = describeClean(points({ recurringType: "yearly" }));
    expect(description.summary).toBe("Earn 500 points in Live Trivia this year and win 20% off your whole order.");
    expect(description.when).toMatch(/Your points reset every January 1\.$/);
    expect(description.fineprint).toBe("The first 3 players to hit 500 each year win.");
  });

  it("weekly with no readable schedule still states the reset day", () => {
    expect(describeClean(points({ schedule: null })).when).toBe(
      "Check the Live Trivia schedule for the next game. Your points reset every Tuesday.",
    );
  });

  it("one-off at the venue's single dated game", () => {
    expect(
      describeClean(points({ recurringType: "none", activeDays: [], winnerQuota: 1, schedule: { slots: slotsOf(oneOffTue) } })),
    ).toEqual({
      summary: "Earn 500 points at Live Trivia on Tue, Oct 13 and win 20% off your whole order.",
      when: "It starts at 8:00 PM.",
      fineprint: "The first player to hit 500 wins.",
      isCustom: false,
    });
  });

  it("one-off with no single game to name doesn't guess a date", () => {
    expect(describeClean(points({ recurringType: "none", activeDays: [], winnerQuota: 2 }))).toEqual({
      summary: "Earn 500 points in Live Trivia and win 20% off your whole order.",
      when: "Live Trivia runs Tuesdays at 8:00 PM and Thursdays at 9:00 PM.",
      fineprint: "The first 2 players to hit 500 win.",
      isCustom: false,
    });
  });
});

describe("describeReward — legacy campaigns (§3 row 10)", () => {
  const legacyRules = "Earn the most points before last call on Saturday. Winner gets a $20 gift card.";

  it("no reward definition: the hand-written rules, unchanged", () => {
    expect(
      describeReward(liveTrivia({ rewardDefinitionId: null, rules: legacyRules }), NOW),
    ).toEqual({ summary: legacyRules, when: null, fineprint: null, isCustom: true });
  });

  it("an unknown definition id is treated as legacy", () => {
    expect(describeReward(liveTrivia({ rewardDefinitionId: "retired_reward", rules: legacyRules }), NOW).isCustom).toBe(
      true,
    );
  });
});

describe("times are the schedule's, never the runtime's", () => {
  it("renders a Chicago 8 PM game as Tuesday 8:00 PM with the runtime in UTC", () => {
    expect(process.env.TZ).toBe("UTC");
    const text = allText(describeClean(liveTrivia()));
    expect(text).toContain("8:00 PM every Tuesday");
    expect(text).not.toContain("1:00 AM");
    expect(text).not.toContain("Wednesday");
  });

  it("is identical whatever zone the runtime is in", () => {
    const inUtc = describeReward(liveTrivia(), NOW);
    process.env.TZ = "Asia/Tokyo";
    try {
      expect(describeReward(liveTrivia({ schedule: { slots: slotsOf(tue8pm, thu9pm) } }), NOW)).toEqual(inUtc);
    } finally {
      process.env.TZ = "UTC";
    }
  });
});

describe("describeRewardPrizeInSentence", () => {
  it.each([
    [{ prizeKind: "gift_card" as const, prizeGiftCertificateAmount: 100 }, "a $100 gift card"],
    [{ prizeKind: "gift_card" as const, prizeGiftCertificateAmount: 12.5 }, "a $12.50 gift card"],
    [{ prizeKind: "gift_card" as const, prizeGiftCertificateAmount: null }, "a gift card"],
    [
      { prizeKind: "menu_item" as const, prizeMenuItem: "appetizer" as const, prizeDiscountKind: "percent" as const, prizeDiscountValue: 100 },
      "a free appetizer",
    ],
    [
      { prizeKind: "menu_item" as const, prizeMenuItem: "entree" as const, prizeDiscountKind: "percent" as const, prizeDiscountValue: 100 },
      "a free entrée",
    ],
    [
      { prizeKind: "menu_item" as const, prizeMenuItem: "whole_order" as const, prizeDiscountKind: "percent" as const, prizeDiscountValue: 20 },
      "20% off your whole order",
    ],
    [
      { prizeKind: "menu_item" as const, prizeMenuItem: "whole_order" as const, prizeDiscountKind: "percent" as const, prizeDiscountValue: 100 },
      "your whole order free",
    ],
    [
      { prizeKind: "menu_item" as const, prizeMenuItem: "appetizer" as const, prizeDiscountKind: "dollar" as const, prizeDiscountValue: 5 },
      "$5 off an appetizer",
    ],
    [{ prizeKind: "menu_item" as const, prizeMenuItem: "wine_bottle" as const }, "a bottle of wine"],
    [
      { prizeKind: "menu_item" as const, prizeMenuItem: "other" as const, prizeMenuItemName: "Order of Wings", prizeDiscountKind: "percent" as const, prizeDiscountValue: 100 },
      "a free Order of Wings",
    ],
    [{ prizeKind: "menu_item" as const, prizeMenuItem: "other" as const, prizeMenuItemName: "Ice Cream Sundae" }, "an Ice Cream Sundae"],
    [{ prizeKind: "menu_item" as const, prizeMenuItem: "other" as const, prizeMenuItemName: "  " }, "a menu item"],
    [{ prizeKind: null }, "a prize"],
  ])("%j → %s", (prize, expected) => {
    expect(describeRewardPrizeInSentence(prize)).toBe(expected);
  });

  it("withIndefiniteArticle leaves an existing article or number alone", () => {
    expect(withIndefiniteArticle("The Big Burger")).toBe("The Big Burger");
    expect(withIndefiniteArticle("2 Tacos")).toBe("2 Tacos");
    expect(withIndefiniteArticle("your whole order")).toBe("your whole order");
    expect(withIndefiniteArticle("apple pie")).toBe("an apple pie");
    expect(withIndefiniteArticle("burger")).toBe("a burger");
  });

  it("withIndefiniteArticle gives a plural-looking name no article", () => {
    expect(withIndefiniteArticle("Chicken Wings")).toBe("Chicken Wings");
    expect(withIndefiniteArticle("free Uber Nachos")).toBe("free Uber Nachos");
    expect(withIndefiniteArticle("Order of Wings")).toBe("an Order of Wings");
    expect(withIndefiniteArticle("Hummus")).toBe("a Hummus");
    expect(withIndefiniteArticle("Glass")).toBe("a Glass");
    expect(
      describeRewardPrizeInSentence({
        prizeKind: "menu_item",
        prizeMenuItem: "other",
        prizeMenuItemName: "Chicken Wings",
        prizeDiscountKind: "percent",
        prizeDiscountValue: 20,
      }),
    ).toBe("20% off Chicken Wings");
  });
});

describe("describeRewardWin — the prize-wallet coupon line", () => {
  it("NFL most picks, weekly", () => {
    expect(describeRewardWin(nfl(), { cycleStart: "2026-10-01T04:00:00.000Z", nflWeekNumber: 5 })).toBe(
      "You got the most NFL picks right in Week 5",
    );
  });

  it("NFL weekly falls back to the week's date when the week number is unknown", () => {
    expect(describeRewardWin(nfl(), { cycleStart: "2026-10-01T04:00:00.000Z" })).toBe(
      "You got the most NFL picks right the week of Oct 1",
    );
  });

  it("NFL picks target, season", () => {
    expect(
      describeRewardWin(
        nfl({
          winCondition: "points_threshold",
          pointsRequiredToWin: 25,
          recurringType: "none",
          nflWeekScope: { kind: "season", season: 2026, fromWeek: 5 },
        }),
        { cycleStart: "2026-10-01T04:00:00.000Z" },
      ),
    ).toBe("You got 25 NFL picks right in the 2026 season");
  });

  it("Live Trivia game winner: the game's own local date", () => {
    // cycle_start is the occurrence start — Tue 8 PM Chicago, Wed in UTC.
    expect(describeRewardWin(liveTrivia(), { cycleStart: "2026-10-07T01:00:00.000Z", timezone: SCHEDULE_TZ })).toBe(
      "You won Live Trivia on Tue, Oct 6",
    );
  });

  it("Live Trivia points target, per cadence", () => {
    const points = (recurringType: RewardDescriptionInput["recurringType"]) =>
      liveTrivia({ winCondition: "points_threshold", pointsRequiredToWin: 500, gameWinnerSlots: null, recurringType });
    const win = { cycleStart: "2026-10-07T01:00:00.000Z", timezone: SCHEDULE_TZ };
    expect(describeRewardWin(points("weekly"), win)).toBe("You earned 500 points in Live Trivia the week of Oct 6");
    expect(describeRewardWin(points("daily"), win)).toBe("You earned 500 points in Live Trivia on Tue, Oct 6");
    expect(describeRewardWin(points("monthly"), win)).toBe("You earned 500 points in Live Trivia in October 2026");
    expect(describeRewardWin(points("yearly"), win)).toBe("You earned 500 points in Live Trivia in 2026");
    // A one-time reward with no startDate has the epoch sentinel as cycle_start.
    expect(describeRewardWin(points("none"), { cycleStart: new Date(0).toISOString() })).toBe(
      "You earned 500 points in Live Trivia",
    );
  });

  it("legacy campaigns keep 'Won from: …' (null)", () => {
    expect(describeRewardWin(liveTrivia({ rewardDefinitionId: null }), { cycleStart: "2026-10-07T01:00:00.000Z" })).toBeNull();
  });

  it("an undatable game win returns null rather than a half sentence", () => {
    expect(describeRewardWin(liveTrivia(), { cycleStart: null })).toBeNull();
  });
});

describe("registry description templates", () => {
  it("every definition's sentences name the prize and never say 'this venue'", () => {
    for (const definition of REWARD_DEFINITIONS) {
      for (const [key, template] of Object.entries(definition.description)) {
        if (key === "calendar") continue;
        expect(template.toLowerCase(), `${definition.id}.${key}`).not.toContain("this venue");
        if (!key.startsWith("won")) expect(template, `${definition.id}.${key}`).toContain("{prize}");
      }
    }
  });
});
