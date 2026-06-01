import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  buildChallengeLeaderboardSnapshot,
  compareChallengeLeaderboardRows,
  pickLeaderboardWinner,
} from "@/lib/challengeCampaigns";

describe("challenge leaderboard ranking", () => {
  it("returns top 10 ordered entries", () => {
    const rows = Array.from({ length: 13 }).map((_, index) => ({
      userId: `u${index + 1}`,
      username: `player_${index + 1}`,
      pointsEarned: 130 - index,
      updatedAt: `2026-06-01T00:${String(index).padStart(2, "0")}:00.000Z`,
    }));

    const snapshot = buildChallengeLeaderboardSnapshot(rows, {
      displayLimit: 10,
      tiebreaker: "first_to_score",
      viewerUserId: "u12",
    });

    expect(snapshot.topEntries).toHaveLength(10);
    expect(snapshot.topEntries[0]?.userId).toBe("u1");
    expect(snapshot.topEntries[9]?.userId).toBe("u10");
    expect(snapshot.viewer).toMatchObject({
      userId: "u12",
      rank: 12,
      points: 119,
      inTop: false,
    });
  });

  it("applies first_to_score tie-breaker before userId fallback", () => {
    const a = {
      userId: "u-z",
      username: "z",
      pointsEarned: 100,
      updatedAt: "2026-06-01T00:10:00.000Z",
    };
    const b = {
      userId: "u-a",
      username: "a",
      pointsEarned: 100,
      updatedAt: "2026-06-01T00:12:00.000Z",
    };
    expect(compareChallengeLeaderboardRows(a, b, "first_to_score")).toBeLessThan(0);

    const c = {
      userId: "u-b",
      username: "b",
      pointsEarned: 100,
      updatedAt: "2026-06-01T00:12:00.000Z",
    };
    expect(compareChallengeLeaderboardRows(b, c, "first_to_score")).toBeLessThan(0);
  });

  it("applies latest_activity tie-breaker", () => {
    const earlier = {
      userId: "u-earlier",
      username: "earlier",
      pointsEarned: 200,
      updatedAt: "2026-06-01T00:05:00.000Z",
    };
    const later = {
      userId: "u-later",
      username: "later",
      pointsEarned: 200,
      updatedAt: "2026-06-01T00:15:00.000Z",
    };

    expect(compareChallengeLeaderboardRows(earlier, later, "latest_activity")).toBeGreaterThan(0);

    const winner = pickLeaderboardWinner([earlier, later], "latest_activity");
    expect(winner?.userId).toBe("u-later");
  });

  it("selects deterministic winner for first_to_score ties", () => {
    const winner = pickLeaderboardWinner(
      [
        {
          userId: "u-b",
          username: "b",
          pointsEarned: 300,
          updatedAt: "2026-06-01T01:00:00.000Z",
        },
        {
          userId: "u-a",
          username: "a",
          pointsEarned: 300,
          updatedAt: "2026-06-01T01:00:00.000Z",
        },
      ],
      "first_to_score"
    );
    expect(winner?.userId).toBe("u-a");
  });

  it("returns viewer with zero points when viewer has no progress yet", () => {
    const snapshot = buildChallengeLeaderboardSnapshot(
      [
        {
          userId: "u1",
          username: "player_1",
          pointsEarned: 50,
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
      {
        displayLimit: 10,
        tiebreaker: "first_to_score",
        viewerUserId: "u-missing",
      }
    );

    expect(snapshot.viewer).toEqual({
      rank: null,
      userId: "u-missing",
      username: null,
      points: 0,
      inTop: false,
    });
  });

  it("returns empty topEntries and null winner when there are no rows", () => {
    const snapshot = buildChallengeLeaderboardSnapshot([], {
      displayLimit: 10,
      tiebreaker: "first_to_score",
    });
    expect(snapshot.topEntries).toHaveLength(0);
    expect(snapshot.viewer).toBeNull();

    const winner = pickLeaderboardWinner([], "first_to_score");
    expect(winner).toBeNull();
  });

  it("marks viewer as inTop when they appear in the top N", () => {
    const rows = [
      { userId: "u1", username: "alpha", pointsEarned: 100, updatedAt: "2026-06-01T00:00:00.000Z" },
      { userId: "u2", username: "beta",  pointsEarned: 80,  updatedAt: "2026-06-01T00:01:00.000Z" },
      { userId: "u3", username: "gamma", pointsEarned: 60,  updatedAt: "2026-06-01T00:02:00.000Z" },
    ];

    const snapshot = buildChallengeLeaderboardSnapshot(rows, {
      displayLimit: 10,
      tiebreaker: "first_to_score",
      viewerUserId: "u2",
    });

    expect(snapshot.viewer).toMatchObject({ userId: "u2", rank: 2, inTop: true });
  });

  it("respects a custom displayLimit smaller than the row count", () => {
    const rows = Array.from({ length: 8 }).map((_, i) => ({
      userId: `u${i + 1}`,
      username: `p${i + 1}`,
      pointsEarned: 80 - i * 5,
      updatedAt: "2026-06-01T00:00:00.000Z",
    }));

    const snapshot = buildChallengeLeaderboardSnapshot(rows, {
      displayLimit: 3,
      tiebreaker: "first_to_score",
      viewerUserId: "u6",
    });

    expect(snapshot.topEntries).toHaveLength(3);
    expect(snapshot.viewer).toMatchObject({ rank: 6, inTop: false });
  });

  it("uses lexical userId as final tie-breaker when points and timestamp are identical", () => {
    const rows = [
      { userId: "u-charlie", username: "c", pointsEarned: 50, updatedAt: "2026-06-01T12:00:00.000Z" },
      { userId: "u-alice",   username: "a", pointsEarned: 50, updatedAt: "2026-06-01T12:00:00.000Z" },
      { userId: "u-bob",     username: "b", pointsEarned: 50, updatedAt: "2026-06-01T12:00:00.000Z" },
    ];

    const snapshot = buildChallengeLeaderboardSnapshot(rows, {
      displayLimit: 10,
      tiebreaker: "first_to_score",
    });

    expect(snapshot.topEntries[0]?.userId).toBe("u-alice");
    expect(snapshot.topEntries[1]?.userId).toBe("u-bob");
    expect(snapshot.topEntries[2]?.userId).toBe("u-charlie");

    const winner = pickLeaderboardWinner(rows, "first_to_score");
    expect(winner?.userId).toBe("u-alice");
  });
});
