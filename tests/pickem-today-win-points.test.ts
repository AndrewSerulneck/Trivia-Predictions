import { describe, expect, it } from "vitest";
import { newlyWonPointsOf, todayWinPointsOf } from "@/components/pickem/PickEmGameList";

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

describe("newlyWonPointsOf (the '+10' when a pick is PAID on screen; Phase 7.5.2, F19)", () => {
  const before = (games: Game[]) => new Map(games.map((g) => [g.id, g]));
  const PAID = "2026-11-01T20:00:00.000Z";

  it("counts only won picks whose payment landed since the last load", () => {
    const previous = before([
      game({ id: "a", userPickStatus: "pending", userPickRewardClaimedAt: null }),
      game({ id: "b", userPickStatus: "won", userPickRewardClaimedAt: PAID }),
      game({ id: "c", userPickStatus: "pending", userPickRewardClaimedAt: null }),
    ]);
    expect(
      newlyWonPointsOf(previous, [
        game({ id: "a", userPickStatus: "won", userPickRewardClaimedAt: PAID }),
        game({ id: "b", userPickStatus: "won", userPickRewardClaimedAt: PAID }),
        game({ id: "c", userPickStatus: "lost", userPickRewardClaimedAt: null }),
      ])
    ).toBe(10);
  });

  it("a won but unpaid pick shows no '+10'", () => {
    const previous = before([game({ id: "a", userPickStatus: "pending", userPickRewardClaimedAt: null })]);
    expect(newlyWonPointsOf(previous, [game({ id: "a", userPickStatus: "won", userPickRewardClaimedAt: null })])).toBe(0);
  });

  it("won, then paid on a later load: '+10' exactly once", () => {
    const unpaid = game({ id: "a", userPickStatus: "won", userPickRewardClaimedAt: null });
    const paid = game({ id: "a", userPickStatus: "won", userPickRewardClaimedAt: PAID });
    expect(newlyWonPointsOf(before([game({ id: "a", userPickStatus: "pending", userPickRewardClaimedAt: null })]), [unpaid])).toBe(0);
    expect(newlyWonPointsOf(before([unpaid]), [paid])).toBe(10);
    expect(newlyWonPointsOf(before([paid]), [paid])).toBe(0);
  });

  it("is 0 on a first load or a different list, even for a paid pick (no previous row for the game)", () => {
    expect(newlyWonPointsOf(new Map(), [game({ id: "a", userPickRewardClaimedAt: PAID })])).toBe(0);
    expect(
      newlyWonPointsOf(before([game({ id: "x", userPickStatus: "pending" })]), [game({ id: "a", userPickRewardClaimedAt: PAID })])
    ).toBe(0);
  });
});
