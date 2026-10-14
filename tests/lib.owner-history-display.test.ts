import { describe, expect, it } from "vitest";
import {
  formatCycleLabel,
  formatOccurrenceDate,
  parseGamesCursor,
  parseRewardsCursor,
  rankGameStandings,
  rewardHowWonLabel,
  rewardWinnerLabel,
  rewardsCursor,
  winnersLabel,
} from "@/lib/ownerHistoryDisplay";
import { rankedNightsForVenue } from "@/lib/rankedPlaceRewards";

// docs/live-trivia-weekly-places-reward-plan.md §5f (Phase 8): the Past Winners wording and paging rules.

const ID_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ID_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe("cursors", () => {
  it("accepts only a real YYYY-MM-DD games cursor", () => {
    expect(parseGamesCursor("2026-10-09")).toBe("2026-10-09");
    expect(parseGamesCursor(" 2026-10-09 ")).toBe("2026-10-09");
    for (const bad of [null, "", "2026-1-9", "2026-10-09T00:00:00Z", "yesterday", "2026-13-40"]) {
      expect(parseGamesCursor(bad)).toBeNull();
    }
  });

  it("round-trips a rewards cursor with the database's own timestamp text, and refuses a malformed one", () => {
    const row = { lastActivityAt: "2026-10-10 02:00:00.123456+00", rewardId: ID_A };
    expect(parseRewardsCursor(rewardsCursor(row))).toEqual({ at: "2026-10-10 02:00:00.123456+00", id: ID_A });
    expect(parseRewardsCursor(`2026-10-10T02:00:00.000Z_${ID_C}`)).toEqual({ at: "2026-10-10T02:00:00.000Z", id: ID_C });
    for (const bad of [null, "", "_" + ID_A, "2026-10-10T02:00:00.000Z_not-a-uuid", "garbage_" + ID_A, `2026-10-10; drop table x_${ID_B}`]) {
      expect(parseRewardsCursor(bad)).toBeNull();
    }
  });
});

describe("labels", () => {
  it("formats a venue-local date without shifting it, adding the year only when it differs", () => {
    expect(formatOccurrenceDate("2026-10-09", 2026)).toBe("Fri, Oct 9");
    expect(formatOccurrenceDate("2025-12-31", 2026)).toBe("Wed, Dec 31, 2025");
  });

  it("labels a cycle in the venue's timezone, and a one-time reward by when it was won", () => {
    const base = { timeZone: "America/New_York", happenedAt: null, currentYear: 2026 };
    // Wed 00:00 New York = 04:00Z.
    expect(formatCycleLabel({ ...base, cycleStart: "2026-10-07T04:00:00Z", recurringType: "weekly" })).toBe("Week of Wed, Oct 7");
    expect(formatCycleLabel({ ...base, cycleStart: "2026-10-09T04:00:00Z", recurringType: "daily" })).toBe("Fri, Oct 9");
    expect(formatCycleLabel({ ...base, cycleStart: "2026-10-01T04:00:00Z", recurringType: "monthly" })).toBe("October 2026");
    expect(formatCycleLabel({ ...base, cycleStart: "2026-01-01T05:00:00Z", recurringType: "yearly" })).toBe("2026");
    expect(formatCycleLabel({ ...base, cycleStart: "1970-01-01T00:00:00Z", recurringType: "none" })).toBe("Won");
    expect(
      formatCycleLabel({ ...base, cycleStart: "1970-01-01T00:00:00Z", recurringType: "none", happenedAt: "2026-10-10T02:00:00Z" }),
    ).toBe("Won Fri, Oct 9");
  });

  it("says how each kind of reward is won", () => {
    expect(rewardHowWonLabel({ winCondition: "ranked_places", pointsRequiredToWin: 0, placeCount: 3 })).toBe("Top 3 players each week");
    expect(rewardHowWonLabel({ winCondition: "ranked_places", pointsRequiredToWin: 0, placeCount: 1 })).toBe("Top player each week");
    expect(rewardHowWonLabel({ winCondition: "game_winner", pointsRequiredToWin: 0 })).toBe("Winner of the game");
    expect(rewardHowWonLabel({ winCondition: "points_threshold", pointsRequiredToWin: 1500 })).toBe("Reach 1,500 points");
    expect(
      rewardHowWonLabel({ winCondition: "game_winner", rewardDefinitionId: "nfl_pickem_challenge", pointsRequiredToWin: 0 }),
    ).toBe("Most picks right");
  });

  it("names winners, ties and deleted players", () => {
    expect(winnersLabel([])).toBe("");
    expect(winnersLabel(["Snooker"])).toBe("Snooker");
    expect(winnersLabel(["Snooker", null])).toBe("Snooker & Deleted player (tie)");
    expect(winnersLabel(["a", "b", "c", "d"])).toBe("a, b & 2 more (tie)");
    expect(rewardWinnerLabel({ place: 2, username: "Kuch" })).toBe("2nd · Kuch");
    expect(rewardWinnerLabel({ place: null, username: null })).toBe("Deleted player");
  });
});

describe("rankGameStandings", () => {
  it("lists scorers only, competition-ranked, first-to-reach first within a tie", () => {
    expect(
      rankGameStandings([
        { username: "late", points: 50, reachedAt: "2026-10-10T01:30:00Z" },
        { username: "zero", points: 0, reachedAt: null },
        { username: "top", points: 90, reachedAt: "2026-10-10T01:40:00Z" },
        { username: "early", points: 50, reachedAt: "2026-10-10T01:10:00Z" },
        { username: "fourth", points: 10, reachedAt: "2026-10-10T01:00:00Z" },
      ]),
    ).toEqual([
      { rank: 1, username: "top", points: 90 },
      { rank: 2, username: "early", points: 50 },
      { rank: 2, username: "late", points: 50 },
      { rank: 4, username: "fourth", points: 10 },
    ]);
  });

  it("keeps the top N plus everyone tied with the last kept row", () => {
    const rows = [100, 90, 80, 80, 80, 70].map((points, i) => ({ username: `p${i}`, points, reachedAt: null }));
    expect(rankGameStandings(rows, 3).map((row) => row.points)).toEqual([100, 90, 80, 80, 80]);
    expect(rankGameStandings(rows, 2).map((row) => row.points)).toEqual([100, 90]);
  });
});

describe("rankedNightsForVenue (Andrew, 2026-10-14: offered even with a single game)", () => {
  const slot = (weekday: string, recurring: boolean) => ({ weekday, recurring });

  it("uses the repeating nights, first night first; a one-off never moves the anchor", () => {
    expect(rankedNightsForVenue({ gameSlots: [slot("fri", true), slot("wed", true), slot("thu", true), slot("tue", false)] })).toEqual([
      "wed",
      "thu",
      "fri",
    ]);
  });

  it("falls back to the one-off games' nights, then to the schedule's days, else nothing", () => {
    expect(rankedNightsForVenue({ gameSlots: [slot("sat", false)] })).toEqual(["sat"]);
    expect(rankedNightsForVenue({ gameSlots: [], scheduleDays: ["mon"] })).toEqual(["mon"]);
    expect(rankedNightsForVenue({ gameSlots: [], scheduleDays: [] })).toEqual([]);
    expect(rankedNightsForVenue({ gameSlots: [] })).toEqual([]);
  });
});
