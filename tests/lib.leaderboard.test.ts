import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type MockResponse = { data: unknown; error: Error | null; count?: number | null };

const mocks = vi.hoisted(() => ({
  responses: new Map<string, MockResponse>(),
  fromCalls: [] as string[],
  setResponse(table: string, data: unknown, error: Error | null = null) {
    this.responses.set(table, { data, error });
  },
  reset() {
    this.responses.clear();
    this.fromCalls.length = 0;
  },
}));

class MockQuery {
  private response: MockResponse;

  constructor(private table: string) {
    this.response = mocks.responses.get(table) ?? { data: [], error: null };
  }

  select() {
    return this;
  }

  abortSignal() {
    return this;
  }

  eq() {
    return this;
  }

  gt() {
    return this;
  }

  gte() {
    return this;
  }

  in() {
    return this;
  }

  limit() {
    return this;
  }

  lte() {
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.response);
  }

  order() {
    return this;
  }

  then<TResult1 = MockResponse, TResult2 = never>(
    onfulfilled?: ((value: MockResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.response).then(onfulfilled, onrejected);
  }
}

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from(table: string) {
      mocks.fromCalls.push(table);
      return new MockQuery(table);
    },
  },
}));

import {
  getLeaderboardSnapshotForVenue,
  parseLeaderboardGameFilter,
} from "@/lib/leaderboard";

const USERS = [
  { id: "u-alpha", username: "Alpha", venue_id: "venue-1", points: 50 },
  { id: "u-beta", username: "Beta", venue_id: "venue-1", points: 30 },
  { id: "u-charlie", username: "Charlie", venue_id: "venue-1", points: 10 },
];

describe("leaderboard filtering", () => {
  beforeEach(() => {
    mocks.reset();
    mocks.setResponse("users", USERS);
    mocks.setResponse("venues", { timezone: "UTC" });
    mocks.setResponse("trivia_answers", []);
    mocks.setResponse("live_showdown_answers", []);
    mocks.setResponse("scategories_submissions", []);
    mocks.setResponse("sports_bingo_cards", []);
    mocks.setResponse("pickem_daily_snapshots", []);
    mocks.setResponse("fantasy_entries", []);
    mocks.setResponse("user_predictions", []);
    mocks.setResponse("nfl_pickem_weeks", { id: "week-1", week_start_date: "2024-09-05" });
    mocks.setResponse("nfl_pickem_user_weeks", []);
  });

  it("parses valid game filters and defaults invalid values to all", () => {
    expect(parseLeaderboardGameFilter("pickem")).toBe("pickem");
    expect(parseLeaderboardGameFilter("nfl-pickem")).toBe("nfl-pickem");
    expect(parseLeaderboardGameFilter("unknown-game")).toBe("all");
    expect(parseLeaderboardGameFilter(null)).toBe("all");
  });

  it("aggregates all-time scores from only the selected non-NFL game", async () => {
    mocks.setResponse("trivia_answers", [
      { user_id: "u-alpha" },
      { user_id: "u-alpha" },
      { user_id: "u-beta" },
    ]);
    mocks.setResponse("pickem_daily_snapshots", [
      { user_id: "u-charlie", collected_points: 300 },
    ]);

    const snapshot = await getLeaderboardSnapshotForVenue({
      venueId: "venue-1",
      userId: "u-beta",
      game: "speed-trivia",
      timeframe: "all-time",
    });

    expect(snapshot.entries).toEqual([
      { userId: "u-alpha", username: "Alpha", venueId: "venue-1", points: 4, rank: 1 },
      { userId: "u-beta", username: "Beta", venueId: "venue-1", points: 2, rank: 2 },
    ]);
    expect(snapshot.currentUserRank).toBe(2);
    expect(mocks.fromCalls).toContain("trivia_answers");
    expect(mocks.fromCalls).not.toContain("pickem_daily_snapshots");
  });

  it("aggregates all selected sources for all-games timeframe leaderboards", async () => {
    mocks.setResponse("trivia_answers", [{ user_id: "u-alpha" }]);
    mocks.setResponse("live_showdown_answers", [{ user_id: "u-beta", points_awarded: 6 }]);
    mocks.setResponse("scategories_submissions", [{ user_id: "u-alpha", points_awarded: 5 }]);
    mocks.setResponse("sports_bingo_cards", [{ user_id: "u-charlie", reward_points: 20 }]);
    mocks.setResponse("pickem_daily_snapshots", [{ user_id: "u-beta", collected_points: 10 }]);
    mocks.setResponse("fantasy_entries", [{ user_id: "u-alpha", reward_points: 8 }]);
    mocks.setResponse("user_predictions", [{ user_id: "u-charlie", points: 3 }]);

    const snapshot = await getLeaderboardSnapshotForVenue({
      venueId: "venue-1",
      userId: "u-alpha",
      game: "all",
      timeframe: "today",
    });

    expect(snapshot.entries).toEqual([
      { userId: "u-charlie", username: "Charlie", venueId: "venue-1", points: 23, rank: 1 },
      { userId: "u-beta", username: "Beta", venueId: "venue-1", points: 16, rank: 2 },
      { userId: "u-alpha", username: "Alpha", venueId: "venue-1", points: 15, rank: 3 },
    ]);
    expect(snapshot.currentUserRank).toBe(3);
    expect(mocks.fromCalls).toEqual(
      expect.arrayContaining([
        "trivia_answers",
        "live_showdown_answers",
        "scategories_submissions",
        "sports_bingo_cards",
        "pickem_daily_snapshots",
        "fantasy_entries",
        "user_predictions",
      ])
    );
  });

  it("uses NFL weekly summaries for NFL Pick 'Em leaderboards", async () => {
    mocks.setResponse("nfl_pickem_weeks", { id: "week-1", week_start_date: "2024-09-05" });
    mocks.setResponse("nfl_pickem_user_weeks", [
      { user_id: "u-beta", venue_id: "venue-1", total_points: 70 },
      { user_id: "u-alpha", venue_id: "venue-1", total_points: 90 },
    ]);

    const snapshot = await getLeaderboardSnapshotForVenue({
      venueId: "venue-1",
      userId: "u-beta",
      game: "nfl-pickem",
      nflWeekId: "week-1",
    });

    expect(snapshot.entries).toEqual([
      { userId: "u-alpha", username: "Alpha", venueId: "venue-1", points: 90, rank: 1 },
      { userId: "u-beta", username: "Beta", venueId: "venue-1", points: 70, rank: 2 },
    ]);
    expect(snapshot.currentUserRank).toBe(2);
  });

  it("returns no NFL leaderboard rows for future weeks", async () => {
    mocks.setResponse("nfl_pickem_weeks", { id: "future-week", week_start_date: "2999-09-05" });
    mocks.setResponse("nfl_pickem_user_weeks", [
      { user_id: "u-alpha", venue_id: "venue-1", total_points: 90 },
    ]);

    const snapshot = await getLeaderboardSnapshotForVenue({
      venueId: "venue-1",
      userId: "u-alpha",
      game: "nfl-pickem",
      nflWeekId: "future-week",
    });

    expect(snapshot.entries).toEqual([]);
    expect(snapshot.currentUserRank).toBeNull();
  });
});
