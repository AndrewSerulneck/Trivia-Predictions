import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ listGames: vi.fn() }));

vi.mock("@/lib/sportsBingo", () => ({ listSportsBingoGames: mocks.listGames }));

import {
  normalizeSportsBingoTimezoneOffset,
  requireSportsBingoCreationGame,
  resolveSportsBingoCreationAvailability,
} from "@/lib/sportsBingoAvailability";

const game = (sportKey: string, id = `${sportKey}-game`) => ({
  id,
  sportKey,
  homeTeam: "Home",
  awayTeam: "Away",
  startsAt: "2026-09-13T23:00:00.000Z",
  gameLabel: "Away vs. Home",
  isLocked: false,
});

describe("Sports Bingo creation availability", () => {
  beforeEach(() => {
    mocks.listGames.mockReset();
  });

  it("evaluates the shared four-league catalog exactly once with one time and normalized timezone", async () => {
    mocks.listGames.mockImplementation(async (params: { sportKey: string }) => [game(params.sportKey)]);

    const result = await resolveSportsBingoCreationAvailability({
      tzOffsetMinutes: "9999",
      evaluationTimeMs: Date.parse("2026-09-13T16:00:00.000Z"),
    });

    expect(result.tzOffsetMinutes).toBe(840);
    expect(result.leagues).toHaveLength(4);
    expect(result.leagues.every((league) => league.games.length === 1)).toBe(true);
    expect(mocks.listGames).toHaveBeenCalledTimes(4);
    for (const [params] of mocks.listGames.mock.calls as Array<[Record<string, unknown>]>) {
      expect(params).toMatchObject({
        includeLocked: false,
        tzOffsetMinutes: 840,
        evaluationTimeMs: Date.parse("2026-09-13T16:00:00.000Z"),
      });
    }
  });

  it("retains verified games while marking only the failed league incomplete", async () => {
    mocks.listGames.mockImplementation(
      async (params: { sportKey: string; failure: { failed: boolean } }) => {
        if (params.sportKey === "baseball_mlb") {
          params.failure.failed = true;
          return [];
        }
        return params.sportKey === "basketball_nba" ? [game(params.sportKey)] : [];
      }
    );

    const result = await resolveSportsBingoCreationAvailability();
    expect(result.incomplete).toBe(true);
    expect(result.allFailed).toBe(false);
    expect(result.leagues.find((league) => league.sportKey === "basketball_nba")?.games).toHaveLength(1);
    expect(result.leagues.find((league) => league.sportKey === "baseball_mlb")?.complete).toBe(false);
  });

  it("rejects unsupported leagues before calling the provider", async () => {
    await expect(
      resolveSportsBingoCreationAvailability({ sportKeys: ["hockey_nhl"] })
    ).rejects.toMatchObject({ code: "unsupported_league" });
    expect(mocks.listGames).not.toHaveBeenCalled();
  });

  it("distinguishes a verified stale game from an unverified provider result", async () => {
    mocks.listGames.mockResolvedValueOnce([]);
    await expect(
      requireSportsBingoCreationGame({ sportKey: "basketball_nba", gameId: "gone" })
    ).rejects.toMatchObject({ code: "game_unavailable" });

    mocks.listGames.mockImplementationOnce(async (params: { failure: { failed: boolean } }) => {
      params.failure.failed = true;
      return [];
    });
    await expect(
      requireSportsBingoCreationGame({ sportKey: "basketball_nba", gameId: "unknown" })
    ).rejects.toMatchObject({ code: "provider_unavailable" });
  });

  it("normalizes invalid offsets to UTC and clamps both extremes", () => {
    expect(normalizeSportsBingoTimezoneOffset("nope")).toBe(0);
    expect(normalizeSportsBingoTimezoneOffset(900)).toBe(840);
    expect(normalizeSportsBingoTimezoneOffset(-900)).toBe(-840);
  });
});
