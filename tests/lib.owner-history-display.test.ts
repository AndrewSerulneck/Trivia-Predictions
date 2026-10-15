import { describe, expect, it } from "vitest";
import {
  defaultOpenGroupKeys,
  formatCycleLabel,
  gameCountLabel,
  groupGameHistory,
  groupsByYear,
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

// docs/live-trivia-weekly-places-reward-plan.md §5f (Phase 8): the Game Results wording and paging rules.

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

describe("Games list grouping (Andrew, 2026-10-14)", () => {
  const game = (occurrenceDate: string, scheduleId = "s1") => ({
    scheduleId,
    occurrenceDate,
    scheduleName: "Trivia",
    playerCount: 3,
    inProgress: false,
    topPoints: 10,
    winners: ["a"],
  });

  it("nests month → Monday–Sunday week → day, newest first, cutting weeks at month edges", () => {
    // Thu Oct 1 2026 and Wed Sep 30 share the week of Mon Sep 28, but sit in different months.
    const years = groupGameHistory(
      [game("2026-10-09"), game("2026-10-09", "s2"), game("2026-10-01"), game("2026-09-30"), game("2026-09-27")],
      { byYear: false, moreToLoad: false },
    );
    expect(years).toHaveLength(1);
    const [october, september] = years[0].months;
    expect(october.label).toBe("October 2026");
    expect(october.gameCount).toBe(3);
    expect(october.weeks.map((week) => week.label)).toEqual(["Oct 5 – 11", "Oct 1 – 4"]);
    expect(october.weeks[0].days).toHaveLength(1); // two games, one day
    expect(october.weeks[0].days[0]).toMatchObject({ date: "2026-10-09", label: "Fri, Oct 9" });
    expect(october.weeks[0].days[0].games).toHaveLength(2);
    expect(september.weeks.map((week) => week.label)).toEqual(["Sep 28 – 30", "Sep 21 – 27"]); // Sun Sep 27 ends its week
  });

  it("labels months without the year under a year heading", () => {
    const years = groupGameHistory([game("2027-01-04"), game("2026-12-28")], { byYear: true, moreToLoad: false });
    expect(years.map((year) => year.label)).toEqual(["2027", "2026"]);
    expect(years[0].months[0].label).toBe("January");
    expect(years[1].months[0].weeks[0].label).toBe("Dec 28 – 31");
  });

  it("marks a group partial only when more pages exist and it starts before the oldest loaded date", () => {
    const years = groupGameHistory([game("2026-10-09"), game("2026-09-24")], { byYear: false, moreToLoad: true });
    const [october, september] = years[0].months;
    expect(october.complete).toBe(true);
    expect(september.complete).toBe(false); // Sep 1–23 may still be on the next page
    expect(september.weeks[0].complete).toBe(false); // the week of Mon Sep 21
    expect(groupGameHistory([game("2026-09-24")], { byYear: false, moreToLoad: false })[0].months[0].complete).toBe(true);
  });

  it("counts games, open-ended while partial", () => {
    expect(gameCountLabel(1, true)).toBe("1 game");
    expect(gameCountLabel(13, true)).toBe("13 games");
    expect(gameCountLabel(1, false)).toBe("1+ games");
  });

  it("groups by year only once the first game is more than a year old", () => {
    expect(groupsByYear("2026-08-05", "2027-08-05")).toBe(false); // exactly a year
    expect(groupsByYear("2026-08-04", "2027-08-05")).toBe(true);
    expect(groupsByYear(null, "2027-08-05")).toBe(false);
    expect(groupsByYear("not-a-date", "2027-08-05")).toBe(false);
  });

  it("opens only the newest year, month and week", () => {
    const years = groupGameHistory([game("2027-01-04"), game("2026-12-28"), game("2026-12-01")], { byYear: true, moreToLoad: false });
    expect([...defaultOpenGroupKeys(years)]).toEqual(["y2027", "m2027-01", "w2027-01-04"]);
    expect(defaultOpenGroupKeys([]).size).toBe(0);
  });
});
