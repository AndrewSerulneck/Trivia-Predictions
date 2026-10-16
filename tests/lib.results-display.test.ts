import { describe, expect, it } from "vitest";
import {
  defaultOpenResultsKeys,
  groupCountLabel,
  groupResultsTimeline,
  matchesPlayerSearch,
  rewardWinnersLine,
  scoreLabel,
} from "@/lib/results/resultsDisplay";
import type { ResultsGameRow, ResultsRewardItem } from "@/lib/results/types";

// docs/partner-results-page-plan.md §4: the timeline is Year → Month → Week → Day, each reward sits on
// the card / day / week the server placed it on, and nothing is ever dropped.

const game = (date: string, key = date): ResultsGameRow => ({
  competitionId: "test_cup",
  gameKey: `cup:${key}`,
  date,
  startsAt: null,
  title: "Cup night",
  playerCount: 4,
  inProgress: false,
  winners: ["ace"],
  topScore: 30,
});

const reward = (date: string, attach: ResultsRewardItem["attach"], rewardId = "r1"): ResultsRewardItem => ({
  rewardId,
  name: "Prize",
  howWon: "Winner of the game",
  cycleStart: `${date}T00:00:00Z`,
  cycleLabel: date,
  date,
  attach,
  winners: [{ place: null, username: "ace", points: 30 }],
  note: null,
});

const flatGames = (years: ReturnType<typeof groupResultsTimeline>) =>
  years.flatMap((y) => y.months).flatMap((m) => m.weeks).flatMap((w) => w.days).flatMap((d) => d.entries);

describe("groupResultsTimeline", () => {
  it("nests month → Monday–Sunday week → day, newest first, cutting weeks at month edges", () => {
    const years = groupResultsTimeline(
      { games: [game("2026-10-16"), game("2026-10-13"), game("2026-10-01"), game("2026-09-30")], rewards: [] },
      { byYear: false, completeFrom: null },
    );
    const months = years[0].months;
    expect(months.map((m) => m.label)).toEqual(["October 2026", "September 2026"]);
    expect(months[0].weeks.map((w) => w.label)).toEqual(["Oct 12 – 18", "Oct 1 – 4"]);
    expect(months[0].weeks[0].days.map((d) => d.date)).toEqual(["2026-10-16", "2026-10-13"]);
    expect(months[1].weeks.map((w) => w.label)).toEqual(["Sep 28 – 30"]);
  });

  it("puts a game-attached reward on that game's card, and counts it", () => {
    const g = game("2026-10-16");
    const r = reward("2026-10-16", { kind: "game", competitionId: g.competitionId, gameKey: g.gameKey });
    const years = groupResultsTimeline({ games: [g], rewards: [r] }, { byYear: false, completeFrom: null });
    const [entry] = flatGames(years);
    expect(entry).toMatchObject({ kind: "game", rewards: [{ rewardId: "r1" }] });
    expect(years[0].months[0].weeks[0].rewardCount).toBe(1);
  });

  it("puts a week reward after the days of its week, and a reward-only week still appears", () => {
    const week = reward("2026-10-18", { kind: "week", weekStart: "2026-10-12" });
    const years = groupResultsTimeline({ games: [game("2026-10-13")], rewards: [week] }, { byYear: false, completeFrom: null });
    const w = years[0].months[0].weeks[0];
    expect(w.days).toHaveLength(1);
    expect(w.weekRewards).toEqual([week]);

    const onlyReward = groupResultsTimeline(
      { games: [], rewards: [reward("2026-09-06", { kind: "week", weekStart: "2026-08-31" })] },
      { byYear: false, completeFrom: null },
    );
    expect(onlyReward[0].months[0].weeks[0]).toMatchObject({ gameCount: 0, rewardCount: 1, days: [] });
    expect(groupCountLabel(onlyReward[0].months[0].weeks[0])).toBe("1 reward");
  });

  it("never drops a reward whose game is not on the page: it becomes a row on its day", () => {
    const orphan = reward("2026-10-15", { kind: "game", competitionId: "test_cup", gameKey: "cup:gone" });
    const day = reward("2026-10-15", { kind: "day", date: "2026-10-15" }, "r2");
    const entries = flatGames(groupResultsTimeline({ games: [game("2026-10-15")], rewards: [orphan, day] }, { byYear: false, completeFrom: null }));
    expect(entries.map((e) => e.kind)).toEqual(["game", "reward", "reward"]);
  });

  it("marks a group partial only when it starts before the page's lower bound", () => {
    const years = groupResultsTimeline(
      { games: [game("2026-10-16"), game("2026-10-06")], rewards: [] },
      { byYear: false, completeFrom: "2026-10-06" },
    );
    const weeks = years[0].months[0].weeks;
    expect(weeks.map((w) => w.complete)).toEqual([true, false]); // Oct 5–11 starts before Oct 6
    expect(years[0].months[0].complete).toBe(false);
    expect(groupCountLabel(weeks[1])).toBe("1+ games");
    expect(groupCountLabel(weeks[0])).toBe("1 game");
  });

  it("labels months without the year under a year heading, and opens only the newest of each level", () => {
    const years = groupResultsTimeline({ games: [game("2027-01-04"), game("2026-12-30")], rewards: [] }, { byYear: true, completeFrom: null });
    expect(years.map((y) => y.label)).toEqual(["2027", "2026"]);
    expect(years[0].months[0].label).toBe("January");
    expect([...defaultOpenResultsKeys(years)]).toEqual(["y2027", "m2027-01", "w2027-01-04"]);
  });
});

describe("labels", () => {
  it("formats scores, reward winners and the player search", () => {
    expect(scoreLabel(1240, "pts")).toBe("1,240 pts");
    expect(
      rewardWinnersLine({
        winners: [
          { place: 1, username: "bobby_t", points: 100 },
          { place: 2, username: null, points: 80 },
        ],
        note: null,
      }),
    ).toBe("1st bobby_t · 2nd Deleted player");
    expect(rewardWinnersLine({ winners: [], note: "Nobody scored this week." })).toBe("Nobody scored this week.");
    expect(rewardWinnersLine({ winners: [], note: null })).toBe("No winner");
    expect(matchesPlayerSearch("Bobby_T", "  bob ")).toBe(true);
    expect(matchesPlayerSearch("kate99", "bob")).toBe(false);
    expect(matchesPlayerSearch(null, "deleted")).toBe(true);
    expect(matchesPlayerSearch("anyone", "")).toBe(true);
  });
});
