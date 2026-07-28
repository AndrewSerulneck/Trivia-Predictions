import { describe, it, expect, beforeEach, vi } from "vitest";
import { syncNFLWeeks } from "@/lib/nflPickEm";

// Regression coverage for the sync bugs found while investigating why
// nfl_pickem_weeks was empty in production (docs/nfl-pickem-week1-early-access-plan.md):
//   1. The query sent "seasons" instead of "seasons[]" — balldontlie silently
//      returns zero games for the unbracketed key, so the sync always no-opped.
//   2. Week numbers were recomputed from a hardcoded "first Thursday in
//      September" anchor instead of trusting balldontlie's own `week` field,
//      which mislabels seasons whose real Week 1 starts later in September.
//   3. week_start_date was derived from weekGames[0] (arbitrary API order)
//      instead of from the games' own kickoffs.

type MockBDLGame = {
  id: number;
  date: string;
  week: number;
  status: string;
  home_team: { id: number; full_name: string };
  visitor_team: { id: number; full_name: string };
};

const state = vi.hoisted(() => ({
  upserted: [] as Array<Record<string, unknown>>,
  lastQuery: null as URLSearchParams | null,
  gamesToReturn: [] as MockBDLGame[],
}));

vi.mock("@/lib/balldontlie", () => ({
  fetchBallDontLieList: vi.fn((_path: string, query: URLSearchParams) => {
    state.lastQuery = query;
    return Promise.resolve(state.gamesToReturn);
  }),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: () => ({
      upsert: (row: Record<string, unknown>) => {
        state.upserted.push(row);
        return {
          select: () => ({
            single: () =>
              Promise.resolve({ data: { id: `row-${state.upserted.length}`, ...row }, error: null }),
          }),
        };
      },
    }),
  },
}));

const game = (params: {
  id: number;
  date: string;
  week: number;
  home?: string;
  away?: string;
}): MockBDLGame => ({
  id: params.id,
  date: params.date,
  week: params.week,
  status: "scheduled",
  home_team: { id: params.id * 10 + 1, full_name: params.home ?? "Home Team" },
  visitor_team: { id: params.id * 10 + 2, full_name: params.away ?? "Away Team" },
});

beforeEach(() => {
  state.upserted = [];
  state.lastQuery = null;
  state.gamesToReturn = [];
});

describe("syncNFLWeeks", () => {
  it("queries balldontlie with bracket-style array params", async () => {
    state.gamesToReturn = [game({ id: 1, date: "2026-09-10T00:20:00.000Z", week: 1 })];

    await syncNFLWeeks(2026);

    expect(state.lastQuery?.get("seasons[]")).toBe("2026");
    expect(state.lastQuery?.has("seasons")).toBe(false);
  });

  it("groups games by balldontlie's own week field rather than a recomputed anchor", async () => {
    // 2026's real Week 1 opener is Sept 10 — later than the hardcoded
    // "first Thursday in September" anchor (Sept 3) calculateNFLWeekNumber
    // used to key off, which would have mislabeled this game "Week 2".
    state.gamesToReturn = [
      game({ id: 1, date: "2026-09-10T00:20:00.000Z", week: 1, home: "Seahawks", away: "Patriots" }),
    ];

    const weeks = await syncNFLWeeks(2026);

    expect(weeks).toHaveLength(1);
    expect(weeks[0].weekNumber).toBe(1);
  });

  it("locks a week with no Thursday game at its first kickoff instead of leaving thursday_kickoff null", async () => {
    state.gamesToReturn = [
      game({ id: 1, date: "2026-09-14T17:00:00.000Z", week: 2 }), // Sunday early slate
      game({ id: 2, date: "2026-09-14T20:25:00.000Z", week: 2 }),
    ];

    await syncNFLWeeks(2026);

    expect(state.upserted).toHaveLength(1);
    expect(state.upserted[0].thursday_kickoff).toBe("2026-09-14T17:00:00.000Z");
  });

  it("derives week_start_date from the games themselves, not API return order", async () => {
    state.gamesToReturn = [
      game({ id: 2, date: "2026-09-13T17:00:00.000Z", week: 1 }), // returned first, kicks off later
      game({ id: 1, date: "2026-09-10T00:20:00.000Z", week: 1 }), // returned second, but the real opener
    ];

    await syncNFLWeeks(2026);

    expect(state.upserted).toHaveLength(1);
    expect(state.upserted[0].week_start_date).toBe("2026-09-10");
  });

  it("returns weeks sorted by week number regardless of grouping order", async () => {
    state.gamesToReturn = [
      game({ id: 3, date: "2026-09-20T17:00:00.000Z", week: 2 }),
      game({ id: 1, date: "2026-09-10T00:20:00.000Z", week: 1 }),
    ];

    const weeks = await syncNFLWeeks(2026);

    expect(weeks.map((week) => week.weekNumber)).toEqual([1, 2]);
  });

  it("ignores games with a missing or invalid week number rather than crashing", async () => {
    state.gamesToReturn = [
      game({ id: 1, date: "2026-09-10T00:20:00.000Z", week: 1 }),
      { ...game({ id: 2, date: "2026-09-11T00:00:00.000Z", week: 1 }), week: undefined as unknown as number },
    ];

    const weeks = await syncNFLWeeks(2026);

    expect(weeks).toHaveLength(1);
    expect(state.upserted[0].games_count).toBe(1);
  });
});

// Finding 6 (docs/nfl-pickem-code-review-fixes-plan.md): getThursdayOfWeek walks
// BACKWARD to the most recent Thursday, so a Wednesday game resolves to the
// PREVIOUS week's Thursday — six days early. Anchoring on the earliest kickoff
// therefore let one Wednesday opener drag a whole week back seven days, on top
// of the real previous week. 2026 dates: Dec 3/10/17/24 are Thursdays.
describe("syncNFLWeeks week anchoring", () => {
  const christmasWeek = [
    game({ id: 1, date: "2026-12-23T21:30:00.000Z", week: 17 }), // Wednesday opener
    game({ id: 2, date: "2026-12-25T01:15:00.000Z", week: 17 }), // Thu night (Fri in UTC)
    game({ id: 3, date: "2026-12-27T18:00:00.000Z", week: 17 }), // Sunday
    game({ id: 4, date: "2026-12-27T21:25:00.000Z", week: 17 }), // Sunday
    game({ id: 5, date: "2026-12-29T01:15:00.000Z", week: 17 }), // MNF (Tue in UTC)
  ];

  it("anchors on the Thursday the week's games actually belong to, not a Wednesday opener's", async () => {
    state.gamesToReturn = christmasWeek;

    await syncNFLWeeks(2026);

    expect(state.upserted).toHaveLength(1);
    // The Wednesday game's own Thursday is 2026-12-17 — a week early.
    expect(state.upserted[0].week_start_date).toBe("2026-12-24");
    expect(state.upserted[0].week_end_date).toBe("2026-12-28");
  });

  it("keeps a Wednesday-opener week from landing on top of the previous week", async () => {
    state.gamesToReturn = [
      game({ id: 10, date: "2026-12-18T01:15:00.000Z", week: 16 }), // Thu night
      game({ id: 11, date: "2026-12-20T18:00:00.000Z", week: 16 }), // Sunday
      ...christmasWeek,
    ];

    await syncNFLWeeks(2026);

    const starts = state.upserted.map((row) => row.week_start_date).sort();
    expect(starts).toEqual(["2026-12-17", "2026-12-24"]);
  });

  it("aborts without writing anything when two weeks resolve to overlapping spans", async () => {
    // A corrupt feed: week 5's games are scheduled on week 4's weekend, so both
    // weeks resolve to the same Thursday and would own the same picks.
    state.gamesToReturn = [
      game({ id: 20, date: "2026-10-04T17:00:00.000Z", week: 4 }),
      game({ id: 21, date: "2026-10-04T20:25:00.000Z", week: 4 }),
      game({ id: 22, date: "2026-10-04T17:00:00.000Z", week: 5 }),
      game({ id: 23, date: "2026-10-04T20:25:00.000Z", week: 5 }),
    ];

    await expect(syncNFLWeeks(2026)).rejects.toThrow(/overlapping spans/i);
    expect(state.upserted).toEqual([]);
  });
});
