import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Weekly places reward copy (docs/live-trivia-weekly-places-reward-plan.md Phase 3): the card
// sentence, fine print, the coupon's "what you won it for" line, the D7 minimum on game-winner
// rewards, the week-night order that anchors the cycle, and the place-win notification.

import { describeReward, describeRewardWin, type RewardDescriptionInput } from "@/lib/rewardDescription";
import {
  describePlacePrizeLadder,
  placeOrdinal,
  rankedPlaceWinMessage,
  rankedWeekNights,
} from "@/lib/rankedPlaceRewards";
import { getRewardDefinition, renderRewardRequirement } from "@/lib/rewardDefinitions";
import { enumerateGameSlots, type RewardGameScheduleShape } from "@/lib/rewardGameSlots";
import type { RewardPlacePrize } from "@/types";

const TZ = "America/New_York";
const originalTZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC";
});
afterAll(() => {
  process.env.TZ = originalTZ;
});

const NOW = new Date("2026-10-14T16:00:00.000Z");

const giftCard = (place: number, amount: number): RewardPlacePrize => ({
  place,
  prizeKind: "gift_card",
  prizeGiftCertificateAmount: amount,
  prizeMenuItem: null,
  prizeMenuItemName: null,
  prizeDiscountKind: null,
  prizeDiscountValue: null,
  prizePosValueCents: null,
  prizePosDelivery: null,
});

const GSB_LADDER = [giftCard(1, 30), giftCard(2, 20), giftCard(3, 10)];

// 2026-10-15T00:00Z = Wednesday Oct 14, 8:00 PM EDT; one schedule, Wed/Thu/Fri.
const wedThuFri: RewardGameScheduleShape = {
  scheduleId: "sched-gsb",
  title: "Trivia Night",
  recurringType: "weekly",
  weekdays: ["wed", "thu", "fri"],
  startTime: "2026-10-15T00:00:00.000Z",
  timezone: TZ,
};

const ranked = (overrides: Partial<RewardDescriptionInput> = {}): RewardDescriptionInput => ({
  rules: "",
  rewardDefinitionId: "live_trivia_challenge",
  winCondition: "ranked_places",
  recurringType: "weekly",
  activeDays: ["wed", "thu", "fri"],
  winnerQuota: 3,
  pointsRequiredToWin: 1,
  gameWinnerSlots: null,
  placePrizes: GSB_LADDER,
  minPlayers: null,
  schedule: { slots: enumerateGameSlots([wedThuFri]) },
  timezone: TZ,
  ...overrides,
});

const allText = (input: RewardDescriptionInput): string => {
  const d = describeReward(input, NOW);
  return [d.summary, d.when, d.fineprint].filter(Boolean).join(" ");
};

describe("describeReward — weekly places", () => {
  it("Garden State Bar's reward reads as the plan's sentence", () => {
    expect(describeReward(ranked(), NOW)).toEqual({
      summary:
        "Finish top 3 in Live Trivia across Wednesday, Thursday and Friday nights each week. 1st wins a $30 gift card, 2nd a $20 gift card and 3rd a $10 gift card.",
      when:
        "Live Trivia runs Wednesdays, Thursdays and Fridays at 8:00 PM. Your points from every game that week add up. Winners are named after Friday's game.",
      fineprint: "Ties go to whoever reached their score first. One place per player each week.",
      isCustom: false,
    });
  });

  it("states the partner's minimum in the fine print", () => {
    expect(describeReward(ranked({ minPlayers: 4 }), NOW).fineprint).toBe(
      "Ties go to whoever reached their score first. One place per player each week. At least 4 players need to play that week for prizes to be awarded.",
    );
  });

  it("one place reads as a single winner, and mixes prize kinds per place", () => {
    expect(describeReward(ranked({ placePrizes: [giftCard(1, 25)], winnerQuota: 1 }), NOW).summary).toBe(
      "Finish 1st in Live Trivia across Wednesday, Thursday and Friday nights each week. The winner gets a $25 gift card.",
    );
    const appetizer: RewardPlacePrize = {
      ...giftCard(2, 0),
      prizeKind: "menu_item",
      prizeGiftCertificateAmount: null,
      prizeMenuItem: "appetizer",
      prizeDiscountKind: "percent",
      prizeDiscountValue: 100,
    };
    expect(describePlacePrizeLadder([giftCard(1, 30), appetizer])).toBe(
      "1st wins a $30 gift card and 2nd a free appetizer.",
    );
  });

  it("a single night reads 'on … night'", () => {
    const tue: RewardGameScheduleShape = { ...wedThuFri, weekdays: ["tue"], startTime: "2026-10-14T00:00:00.000Z" };
    const text = describeReward(
      ranked({ activeDays: ["tue"], schedule: { slots: enumerateGameSlots([tue]) } }),
      NOW,
    );
    expect(text.summary).toMatch(/^Finish top 3 in Live Trivia on Tuesday night each week\./);
    expect(text.when).toContain("Winners are named after Tuesday's game.");
  });

  it("a wrap-around week reads from its first night (Fri, Sat, Sun)", () => {
    const weekend: RewardGameScheduleShape = { ...wedThuFri, weekdays: ["sun", "fri", "sat"] };
    const d = describeReward(
      ranked({ activeDays: ["fri", "sat", "sun"], schedule: { slots: enumerateGameSlots([weekend]) } }),
      NOW,
    );
    expect(d.summary).toContain("across Friday, Saturday and Sunday nights");
    expect(d.when).toContain("Winners are named after Sunday's game.");
  });

  it("pinned games narrow the nights", () => {
    const d = describeReward(
      ranked({
        activeDays: ["thu", "fri"],
        gameWinnerSlots: [
          { scheduleId: "sched-gsb", weekday: "fri" },
          { scheduleId: "sched-gsb", weekday: "thu" },
        ],
      }),
      NOW,
    );
    expect(d.summary).toContain("across Thursday and Friday nights");
  });

  it("falls back to activeDays when the schedule can't be read", () => {
    const d = describeReward(ranked({ schedule: null }), NOW);
    expect(d.summary).toContain("across Wednesday, Thursday and Friday nights");
    expect(d.when).toMatch(/^Check the Live Trivia schedule for the next game\./);
  });

  it("never leaves a placeholder, 'this venue', a points target or a gauge word", () => {
    for (const input of [ranked(), ranked({ minPlayers: 10 }), ranked({ schedule: null }), ranked({ placePrizes: null })]) {
      const text = allText(input);
      expect(text).not.toMatch(/[{}]/);
      expect(text.toLowerCase()).not.toContain("this venue");
      expect(text).not.toContain("undefined");
      expect(text).not.toContain("null");
      expect(text).not.toMatch(/Earn \d|points target/);
      expect(text).not.toMatch(/\s{2,}/);
    }
  });
});

describe("describeReward — game-winner minimum players (D7)", () => {
  const gameWinner = (minPlayers: number | null): RewardDescriptionInput => ({
    ...ranked(),
    winCondition: "game_winner",
    placePrizes: null,
    winnerQuota: 3,
    minPlayers,
    prizeKind: "gift_card",
    prizeGiftCertificateAmount: 50,
  });

  it("adds the minimum after the existing fine print", () => {
    expect(describeReward(gameWinner(5), NOW).fineprint).toBe(
      "One winner per game. At least 5 players need to play for a winner to be named.",
    );
  });

  it("is unchanged when no minimum is set", () => {
    expect(describeReward(gameWinner(null), NOW).fineprint).toBe("One winner per game.");
  });

  it("is ignored on a points-target reward (it can't have one)", () => {
    const d = describeReward({ ...gameWinner(5), winCondition: "points_threshold", pointsRequiredToWin: 500 }, NOW);
    expect(d.fineprint).not.toContain("At least");
  });
});

describe("describeRewardWin — weekly places", () => {
  it("names the place and the week, from the coupon's own place", () => {
    expect(
      describeRewardWin(ranked(), { cycleStart: "2026-10-07T04:00:00+00:00", timezone: TZ, place: 1 }),
    ).toBe("You finished 1st in Live Trivia the week of Oct 7");
    expect(describeRewardWin(ranked(), { cycleStart: "2026-08-05T04:00:00.000Z", timezone: TZ, place: 3 })).toBe(
      "You finished 3rd in Live Trivia the week of Aug 5",
    );
  });

  it("returns null (coupon keeps 'Won from: …') without a place or a date", () => {
    expect(describeRewardWin(ranked(), { cycleStart: "2026-10-07T04:00:00Z", timezone: TZ, place: null })).toBeNull();
    expect(describeRewardWin(ranked(), { cycleStart: null, timezone: TZ, place: 2 })).toBeNull();
  });
});

describe("rankedWeekNights — the week's anchor is activeDays[0]", () => {
  it("starts on the night after the longest gap, whatever the input order", () => {
    expect(rankedWeekNights(["fri", "wed", "thu"])).toEqual(["wed", "thu", "fri"]);
    expect(rankedWeekNights(["sun", "sat", "fri"])).toEqual(["fri", "sat", "sun"]);
    // Tue→Sat is 4 days, Sat→Tue 3: the longest gap ends on Saturday, so the week is Sat→Fri.
    expect(rankedWeekNights(["tue", "sat"])).toEqual(["sat", "tue"]);
    expect(rankedWeekNights(["tue"])).toEqual(["tue"]);
  });

  it("drops junk and duplicates; every day starts on Sunday", () => {
    expect(rankedWeekNights(["WED", "wed", "nope", ""])).toEqual(["wed"]);
    expect(rankedWeekNights(["sat", "fri", "thu", "wed", "tue", "mon", "sun"])).toEqual([
      "sun",
      "mon",
      "tue",
      "wed",
      "thu",
      "fri",
      "sat",
    ]);
    expect(rankedWeekNights([])).toEqual([]);
  });
});

describe("copy helpers", () => {
  it("ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21].map(placeOrdinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st"]);
  });

  it("the place-win notification names the place and prize, and no date", () => {
    expect(rankedPlaceWinMessage({ place: 2, campaignName: "Live Trivia Challenge", prize: giftCard(2, 20) })).toBe(
      'You finished 2nd in "Live Trivia Challenge" and won a $20 gift card! Tap here to view your coupon before it expires.',
    );
    expect(rankedPlaceWinMessage({ place: 1, campaignName: "Live Trivia Challenge", prize: null })).toBe(
      'You finished 1st in "Live Trivia Challenge"! Tap here to view your coupon before it expires.',
    );
  });

  it("the requirement line for a weekly places reward", () => {
    const def = getRewardDefinition("live_trivia_challenge")!;
    expect(def.supportsRankedPlaces).toBe(true);
    expect(getRewardDefinition("nfl_pickem_challenge")!.supportsRankedPlaces).toBe(false);
    expect(renderRewardRequirement(def, 1, "ranked_places")).toBe("Finish at the top of Live Trivia this week");
  });
});
