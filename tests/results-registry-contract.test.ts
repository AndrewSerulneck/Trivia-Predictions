import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// docs/partner-results-page-plan.md §5c: proves the "add a competition" seam. Adding one must be
// one entry in lib/results/competitions.ts + one adapter file + one line in
// lib/results/adapters/index.ts, and nothing else. A fixture competition ("Test Cup", defined in
// this file only) runs through the shared timeline with no change to it; the generic core and the
// Results UI never name a competition id.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: null }));
vi.mock("@/lib/liveShowdownEngine", () => ({
  enumerateScheduleOccurrences: () => [],
  loadLiveTriviaSchedulesForVenues: async () => [],
}));
vi.mock("@/lib/liveTriviaWeekTotals", () => ({
  LiveTriviaWeekTotalsMissingError: class extends Error {},
  loadLiveTriviaWeekTotals: async () => [],
}));

import { RESULTS_ADAPTERS, getResultsAdapter, listResultsAdapters } from "@/lib/results/adapters";
import { RESULTS_COMPETITIONS, getResultsCompetition, isResultsCompetitionId } from "@/lib/results/competitions";
import { placeRewards } from "@/lib/results/rewardPlacement";
import { buildResultsTimelinePage, type ResultsRewardSource } from "@/lib/results/timeline";
import type { ResultsAdapter, ResultsGameRow } from "@/lib/results/types";

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

const filesUnder = (dir: string): string[] => {
  const abs = path.join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap((name) => {
    const rel = path.join(dir, name);
    return statSync(path.join(ROOT, rel)).isDirectory() ? filesUnder(rel) : [rel];
  });
};

/** The fixture competition. Its id is deliberately not in the registry. */
const TEST_CUP = "test_cup";
const cupGame = (date: string): ResultsGameRow => ({
  competitionId: TEST_CUP,
  gameKey: `cup:${date}`,
  date,
  startsAt: `${date}T23:00:00.000Z`,
  title: "Test Cup",
  playerCount: 2,
  inProgress: false,
  winners: ["ace"],
  topScore: 3,
});
const testCupAdapter: ResultsAdapter = {
  id: TEST_CUP,
  listGames: async ({ before }) => ({
    games: ["2026-10-15", "2026-10-08"].filter((date) => before === null || date < before).map(cupGame),
    exhausted: true,
  }),
  getStandings: async ({ gameKey }) => ({
    game: cupGame(gameKey.slice(4)),
    standings: [
      { rank: 1, username: "ace", score: 3, entry: "tok-ace" },
      { rank: 2, username: null, score: 1, entry: null },
    ],
  }),
  getBreakdown: async () => ({ rows: [{ group: "Match 1", label: "Leg 1", detail: "Bullseye", outcome: "right", points: 3 }], total: 3 }),
};

describe("Results registry ↔ adapters", () => {
  it("has exactly one adapter per registered competition, keyed by its own id", () => {
    expect(Object.keys(RESULTS_ADAPTERS).sort()).toEqual(RESULTS_COMPETITIONS.map((competition) => competition.id).sort());
    for (const [id, adapter] of Object.entries(RESULTS_ADAPTERS)) expect(adapter.id).toBe(id);
    expect(new Set(RESULTS_COMPETITIONS.map((competition) => competition.id)).size).toBe(RESULTS_COMPETITIONS.length);
    expect(listResultsAdapters()).toHaveLength(RESULTS_COMPETITIONS.length);
  });

  it("an adapter offers a breakdown exactly when the registry says it has one", () => {
    for (const competition of RESULTS_COMPETITIONS) {
      const adapter = getResultsAdapter(competition.id);
      expect(adapter).not.toBeNull();
      expect(Boolean(adapter?.getBreakdown), competition.id).toBe(competition.hasBreakdown);
    }
  });

  it("refuses ids that aren't registered", () => {
    for (const id of [TEST_CUP, "", "__proto__", "constructor", "toString"]) {
      expect(isResultsCompetitionId(id)).toBe(false);
      expect(getResultsAdapter(id)).toBeNull();
      expect(getResultsCompetition(id)).toBeNull();
    }
  });
});

describe("a new competition needs no change to the shared code", () => {
  it("runs a fixture competition through the timeline next to the registered ones", async () => {
    const rewards: ResultsRewardSource = { read: async () => [], boundBefore: async () => null };
    const page = await buildResultsTimelinePage({
      sources: [...listResultsAdapters(), testCupAdapter].map((adapter) => ({
        id: adapter.id,
        listGames: ({ before, limit, withFirstGameDate }) => adapter.listGames({ venueId: "v", before, limit, nowMs: 0, withFirstGameDate }),
      })),
      rewards,
      before: null,
      today: "2026-10-16",
    });
    expect(page.games.map((game) => [game.competitionId, game.date])).toEqual([
      [TEST_CUP, "2026-10-15"],
      [TEST_CUP, "2026-10-08"],
    ]);
    expect(page.nextBefore).toBeNull();
  });

  it("puts a daily reward on a fixture competition's game card", () => {
    const [item] = placeRewards({
      ledger: [{ challengeId: "d", cycleStart: "2026-10-15T04:00:00Z", finalizedAt: "2026-10-16T01:00:00Z", place: null, username: "ace", points: 120 }],
      settlements: [],
      campaigns: [
        {
          id: "d",
          name: "Daily",
          winCondition: "points_threshold",
          rewardDefinitionId: null,
          recurringType: "daily",
          scheduleType: "recurring",
          activeDays: [],
          pointsRequiredToWin: 100,
          placePrizes: null,
          winnerQuota: 1,
          gameWinnerSlots: null,
        },
      ],
      venueTimeZone: "America/New_York",
      games: [cupGame("2026-10-15")],
      currentYear: 2026,
    });
    expect(item.attach).toEqual({ kind: "game", competitionId: TEST_CUP, gameKey: "cup:2026-10-15" });
  });

  it("standings and breakdown use only the shared shapes", async () => {
    const detail = await testCupAdapter.getStandings({ venueId: "v", gameKey: "cup:2026-10-15", nowMs: 0 });
    expect(detail.standings[0]).toEqual({ rank: 1, username: "ace", score: 3, entry: "tok-ace" });
    const breakdown = await testCupAdapter.getBreakdown?.({ venueId: "v", gameKey: "cup:2026-10-15", entry: "tok-ace", nowMs: 0 });
    expect(breakdown?.total).toBe(breakdown?.rows.reduce((sum, row) => sum + row.points, 0));
  });

  it("the generic core and the Results UI never name a competition id", () => {
    const ids = RESULTS_COMPETITIONS.map((competition) => competition.id);
    const generic = [
      "lib/results/types.ts",
      "lib/results/timeline.ts",
      "lib/results/ownerResults.ts",
      "lib/results/entryToken.ts",
      "lib/results/pathParams.ts",
      ...filesUnder("app/api/owner/results"),
      ...filesUnder("components/owner/results"),
    ];
    for (const file of generic) {
      const source = read(file);
      for (const id of ids) expect(source.includes(`"${id}"`), `${file} names "${id}"`).toBe(false);
    }
  });
});
