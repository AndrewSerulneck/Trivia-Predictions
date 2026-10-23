import { describe, expect, it } from "vitest";
import { todayWinPointsOf } from "@/components/pickem/PickEmGameList";

type Game = Parameters<typeof todayWinPointsOf>[0][number];

const game = (overrides: Partial<Game>): Game =>
  ({
    id: "g",
    userPickStatus: "won",
    userPickRewardPoints: 10,
    ...overrides,
  }) as Game;

describe("todayWinPointsOf (Phase 9f.6)", () => {
  it("shows a won game's own pick value, not 10 per game", () => {
    expect(todayWinPointsOf([game({ id: "a", userPickRewardPoints: 20 })])).toBe(20);
  });

  it("sums mixed values across won games and ignores the rest", () => {
    expect(
      todayWinPointsOf([
        game({ id: "a", userPickRewardPoints: 20 }),
        game({ id: "b", userPickRewardPoints: 10 }),
        game({ id: "c", userPickStatus: "lost", userPickRewardPoints: 30 }),
        game({ id: "d", userPickStatus: "pending", userPickRewardPoints: 5 }),
      ])
    ).toBe(30);
  });

  it("falls back to 10 when a won pick has no stored value", () => {
    expect(todayWinPointsOf([game({ id: "a", userPickRewardPoints: undefined })])).toBe(10);
  });

  it("is 0 when nothing was won today", () => {
    expect(todayWinPointsOf([game({ userPickStatus: "lost" })])).toBe(0);
  });
});
