import { describe, expect, it, vi } from "vitest";
import { addDays } from "@/lib/results/rewardPlacement";
import {
  MAX_EMPTY_JUMPS,
  REWARD_WINDOW_DAYS,
  buildResultsTimelinePage,
  mergeGamePages,
  type ResultsGameSource,
  type ResultsRewardSource,
} from "@/lib/results/timeline";
import type { ResultsGameRow, ResultsRewardItem, ResultsTimelinePage } from "@/lib/results/types";

// docs/partner-results-page-plan.md §5a: the page merge. A paging bug here would silently hide
// results, so besides the single rules, every scenario is walked page by page and checked to show
// every game and reward exactly once, newest first, with no page splitting a date.

const TODAY = "2026-10-16";

const game = (competitionId: string, date: string, n = 0): ResultsGameRow => ({
  competitionId,
  gameKey: `${competitionId}-${date}-${n}`,
  date,
  startsAt: null,
  title: competitionId,
  playerCount: 3,
  inProgress: false,
  winners: ["a"],
  topScore: 10,
});

const reward = (date: string, id = "r"): ResultsRewardItem => ({
  rewardId: id,
  name: id,
  howWon: "Reach 100 points",
  cycleStart: `${date}T04:00:00Z`,
  cycleLabel: date,
  date,
  attach: { kind: "day", date },
  winners: [],
  note: null,
});

/** A source over a fixed list, paged like the live_trivia_occurrence_summaries RPC (whole dates). */
const fixtureSource = (id: string, all: ResultsGameRow[], firstGameDate?: string): ResultsGameSource & { calls: number } => {
  const sorted = [...all].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const source = {
    id,
    calls: 0,
    listGames: async ({ before, limit, withFirstGameDate }: { before: string | null; limit: number; withFirstGameDate: boolean }) => {
      source.calls += 1;
      const older = sorted.filter((row) => before === null || row.date < before);
      const cut = older[limit - 1]?.date;
      const games = cut === undefined ? older : older.filter((row) => row.date >= cut);
      const page = { games, exhausted: games.length < limit };
      return withFirstGameDate ? { ...page, firstGameDate: firstGameDate ?? null } : page;
    },
  };
  return source;
};

/** Rewards over a fixed list. `overEstimate` makes boundBefore answer `lo` whenever anything is older than lo + 7 days. */
const fixtureRewards = (all: ResultsRewardItem[], options: { overEstimate?: boolean } = {}) => {
  const reads: Array<{ lo: string; hi: string }> = [];
  const source: ResultsRewardSource = {
    read: async ({ lo, hi }) => {
      reads.push({ lo, hi });
      return all.filter((item) => item.date >= lo && item.date < hi).sort((a, b) => (a.date < b.date ? 1 : -1));
    },
    boundBefore: async (lo) => {
      if (options.overEstimate && all.some((item) => item.date < addDays(lo, 7))) return lo;
      const older = all.filter((item) => item.date < lo).map((item) => item.date);
      if (older.length === 0) return null;
      const newest = older.reduce((max, date) => (date > max ? date : max));
      return addDays(newest, 1);
    },
  };
  return { source, reads };
};

/** Walk every page; assert the invariants; return what was shown. */
const walk = async (sources: ResultsGameSource[], rewards: ResultsRewardSource, limit = 5) => {
  const pages: ResultsTimelinePage[] = [];
  let before: string | null = null;
  for (let i = 0; i < 200; i += 1) {
    const page: ResultsTimelinePage = await buildResultsTimelinePage({ sources, rewards, before, today: TODAY, limit });
    pages.push(page);
    for (const row of [...page.games, ...page.rewards]) {
      // Every item is inside the page's range [nextBefore, before).
      if (before !== null) expect(row.date < before).toBe(true);
      if (page.nextBefore !== null) expect(row.date >= page.nextBefore).toBe(true);
    }
    if (page.nextBefore === null) break;
    if (before !== null) expect(page.nextBefore < before).toBe(true);
    before = page.nextBefore;
  }
  const games = pages.flatMap((page) => page.games);
  const shownRewards = pages.flatMap((page) => page.rewards);
  return { pages, games, rewards: shownRewards };
};

const keys = (rows: ResultsGameRow[]) => rows.map((row) => row.gameKey).sort();
const datesDesc = (rows: Array<{ date: string }>) => rows.every((row, i) => i === 0 || rows[i - 1].date >= row.date);

describe("mergeGamePages", () => {
  it("keeps only dates every unfinished source has fully returned", () => {
    const merged = mergeGamePages(
      [
        { games: [game("a", "2026-10-10"), game("a", "2026-10-01")], exhausted: false },
        { games: [game("b", "2026-10-12"), game("b", "2026-10-05")], exhausted: false },
      ],
      { before: null, limit: 20 },
    );
    // Source b may have games between Oct 1 and Oct 5 it hasn't returned yet.
    expect(merged.completeFrom).toBe("2026-10-05");
    expect(merged.games.map((row) => row.date)).toEqual(["2026-10-12", "2026-10-10", "2026-10-05"]);
  });

  it("lets an exhausted source bound nothing", () => {
    const merged = mergeGamePages(
      [
        { games: [game("a", "2026-10-10")], exhausted: true },
        { games: [game("b", "2026-09-01")], exhausted: true },
      ],
      { before: null, limit: 20 },
    );
    expect(merged.completeFrom).toBeNull();
    expect(merged.games).toHaveLength(2);
  });

  it("trims to the limit across sources without splitting the last date", () => {
    const merged = mergeGamePages(
      [
        { games: [game("a", "2026-10-10"), game("a", "2026-10-09"), game("a", "2026-10-08")], exhausted: true },
        { games: [game("b", "2026-10-09"), game("b", "2026-10-08", 1)], exhausted: true },
      ],
      { before: null, limit: 3 },
    );
    expect(merged.games.map((row) => row.date)).toEqual(["2026-10-10", "2026-10-09", "2026-10-09"]);
    expect(merged.completeFrom).toBe("2026-10-09");
  });

  it("treats a source claiming more games but returning none as exhausted (never pages forever)", () => {
    const merged = mergeGamePages([{ games: [], exhausted: false }], { before: null, limit: 20 });
    expect(merged.completeFrom).toBeNull();
  });
});

describe("buildResultsTimelinePage", () => {
  it("returns one empty last page for a venue with nothing", async () => {
    const { source } = fixtureRewards([]);
    const page = await buildResultsTimelinePage({ sources: [fixtureSource("a", [])], rewards: source, before: null, today: TODAY });
    expect(page).toEqual({ games: [], rewards: [], nextBefore: null, firstGameDate: null });
  });

  it("sends the first game date with the first page only (earliest across sources)", async () => {
    const { source } = fixtureRewards([]);
    const sources = [fixtureSource("a", [game("a", "2026-10-10")], "2025-03-01"), fixtureSource("b", [game("b", "2026-10-11")], "2024-06-01")];
    const first = await buildResultsTimelinePage({ sources, rewards: source, before: null, today: TODAY });
    expect(first.firstGameDate).toBe("2024-06-01");
    const later = await buildResultsTimelinePage({ sources, rewards: source, before: "2026-10-10", today: TODAY });
    expect(later).not.toHaveProperty("firstGameDate");
  });

  it("reads rewards for the page's range only, never wider than the window", async () => {
    const games = Array.from({ length: 12 }, (_, i) => game("a", addDays(TODAY, -i)));
    const { source, reads } = fixtureRewards([reward("2026-10-12"), reward("2026-09-01")]);
    const page = await buildResultsTimelinePage({ sources: [fixtureSource("a", games)], rewards: source, before: null, today: TODAY, limit: 5 });
    // Dense games end the page at the 5th game's date.
    expect(page.nextBefore).toBe("2026-10-12");
    expect(page.rewards.map((item) => item.date)).toEqual(["2026-10-12"]);
    expect(reads[0].lo).toBe("2026-10-12");
    for (const read of reads) expect(Date.parse(read.hi) - Date.parse(read.lo)).toBeLessThanOrEqual(REWARD_WINDOW_DAYS * 86_400_000);
  });

  it("keeps paging rewards after the games run out (an NFL-only stretch)", async () => {
    const rewards = [reward("2026-10-13", "nfl"), reward("2025-12-30", "nfl"), reward("2025-01-07", "nfl")];
    const { source } = fixtureRewards(rewards);
    const shown = await walk([fixtureSource("a", [game("a", "2026-10-09")])], source);
    expect(shown.rewards.map((item) => item.date)).toEqual(["2026-10-13", "2025-12-30", "2025-01-07"]);
    expect(shown.games.map((row) => row.date)).toEqual(["2026-10-09"]);
    // Empty stretches are jumped over, not shown as empty pages.
    expect(shown.pages.every((page) => page.games.length + page.rewards.length > 0)).toBe(true);
  });

  it("jumps over an empty stretch to older games when the games are sparse", async () => {
    const games = [game("a", "2026-10-14"), game("a", "2025-02-01"), game("a", "2024-11-20")];
    const { source } = fixtureRewards([]);
    const shown = await walk([fixtureSource("a", games)], source, 2);
    expect(keys(shown.games)).toEqual(keys(games));
    expect(shown.pages.every((page) => page.games.length > 0)).toBe(true);
  });

  it("hands back an empty page with a cursor after MAX_EMPTY_JUMPS over-estimated jumps, and still finishes", async () => {
    // A bound that always over-estimates forces window-by-window steps.
    const far = addDays(TODAY, -REWARD_WINDOW_DAYS * (MAX_EMPTY_JUMPS + 3));
    const { source } = fixtureRewards([reward(far)], { overEstimate: true });
    const read = vi.spyOn(source, "read");
    const first = await buildResultsTimelinePage({ sources: [fixtureSource("a", [])], rewards: source, before: null, today: TODAY });
    expect(read).toHaveBeenCalledTimes(MAX_EMPTY_JUMPS);
    expect(first.rewards).toEqual([]);
    expect(first.nextBefore).not.toBeNull();
    const shown = await walk([fixtureSource("a", [])], source);
    expect(shown.rewards.map((item) => item.date)).toEqual([far]);
  });

  it("shows everything exactly once, newest first, across two competitions and rewards", async () => {
    const trivia: ResultsGameRow[] = [];
    const cup: ResultsGameRow[] = [];
    // Trivia Wed/Fri for ~5 months, two games on some Fridays; Test Cup sparse, sharing some dates.
    for (let i = 0; i < 150; i += 1) {
      const date = addDays(TODAY, -i);
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      if (weekday === 3) trivia.push(game("live_trivia", date));
      if (weekday === 5) {
        trivia.push(game("live_trivia", date));
        if (i % 3 === 0) trivia.push(game("live_trivia", date, 1));
      }
      if (i % 11 === 0) cup.push(game("test_cup", date));
    }
    const rewards = [
      ...trivia.filter((_, i) => i % 4 === 0).map((row) => ({ ...reward(row.date, "night"), attach: { kind: "game" as const, competitionId: row.competitionId, gameKey: row.gameKey } })),
      reward(addDays(TODAY, -200), "old"),
      reward(addDays(TODAY, -400), "older"),
    ];
    const { source } = fixtureRewards(rewards);
    const shown = await walk([fixtureSource("live_trivia", trivia), fixtureSource("test_cup", cup)], source, 7);
    expect(keys(shown.games)).toEqual(keys([...trivia, ...cup]));
    expect(shown.rewards).toHaveLength(rewards.length);
    expect(datesDesc(shown.games)).toBe(true);
    expect(datesDesc(shown.rewards)).toBe(true);
    // No date is split across pages.
    const pageOfDate = new Map<string, number>();
    shown.pages.forEach((page, index) => {
      for (const row of page.games) {
        expect(pageOfDate.get(row.date) ?? index).toBe(index);
        pageOfDate.set(row.date, index);
      }
    });
  });

  it("never loses a reward when boundBefore over-estimates", async () => {
    const rewards = [reward("2026-10-01"), reward("2026-06-15"), reward("2026-06-14"), reward("2025-01-01")];
    const { source } = fixtureRewards(rewards, { overEstimate: true });
    const shown = await walk([fixtureSource("a", [game("a", "2026-10-02"), game("a", "2026-06-14")])], source, 1);
    expect(shown.rewards.map((item) => item.date)).toEqual(["2026-10-01", "2026-06-15", "2026-06-14", "2025-01-01"]);
    expect(shown.games).toHaveLength(2);
  });

  it("ignores a malformed cursor (first page)", async () => {
    const { source } = fixtureRewards([]);
    const page = await buildResultsTimelinePage({ sources: [fixtureSource("a", [game("a", "2026-10-10")])], rewards: source, before: "garbage", today: TODAY });
    expect(page.games).toHaveLength(1);
    expect(page).toHaveProperty("firstGameDate");
  });

  it("still shows a game dated a day ahead of the venue (a schedule in a zone further east)", async () => {
    const { source } = fixtureRewards([]);
    const page = await buildResultsTimelinePage({ sources: [fixtureSource("a", [game("a", addDays(TODAY, 1))])], rewards: source, before: null, today: TODAY });
    expect(page.games).toHaveLength(1);
  });
});
