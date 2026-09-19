import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const NOW = Date.parse("2026-09-13T12:00:00.000Z");

const listResponse = (data: unknown[], ok = true, status = 200): Response =>
  ({ ok, status, json: async () => ({ data, meta: { next_cursor: null } }) }) as Response;

const scheduledGame = (id: number, startsAt: string, status = "Scheduled") => ({
  id,
  date: startsAt,
  datetime: startsAt,
  status,
  home_team: { id: 1, full_name: "Home Team" },
  visitor_team: { id: 2, full_name: "Away Team" },
  away_team: { id: 2, full_name: "Away Team" },
});

const nflOdds = (gameId: number) =>
  ["fanduel", "draftkings"].map((vendor) => ({
    game_id: gameId,
    vendor,
    spread_home_value: -3.5,
    total_value: 44.5,
    moneyline_home_odds: -165,
    moneyline_away_odds: 145,
  }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("listSportsBingoGames creation predicate", () => {
  it.each([
    ["basketball_nba", "/nba/v1/games"],
    ["basketball_wnba", "/wnba/v1/games"],
    ["americanfootball_nfl", "/nfl/v1/games"],
    ["baseball_mlb", "/mlb/v1/games"],
  ])("shows %s with one boardable unlocked local-day game", async (sportKey, gamePath) => {
    const row = scheduledGame(101, "2026-09-13T18:00:00.000Z");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes(gamePath)) return listResponse([row]);
        if (url.includes("/nfl/v1/odds")) return listResponse(nflOdds(101));
        return listResponse([]);
      })
    );

    const { listSportsBingoGames } = await import("@/lib/sportsBingo");
    const games = await listSportsBingoGames({ sportKey, tzOffsetMinutes: 0, evaluationTimeMs: NOW });
    expect(games.map((game) => game.id)).toEqual(["101"]);
  });

  it.each(["basketball_nba", "basketball_wnba", "americanfootball_nfl", "baseball_mlb"])(
    "hides %s when it has zero eligible games",
    async (sportKey) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(listResponse([])));
      const { listSportsBingoGames } = await import("@/lib/sportsBingo");
      await expect(
        listSportsBingoGames({ sportKey, tzOffsetMinutes: 0, evaluationTimeMs: NOW })
      ).resolves.toEqual([]);
    }
  );

  it.each([
    ["locked at the exact kickoff boundary", scheduledGame(201, "2026-09-13T12:00:00.000Z")],
    ["cancelled", scheduledGame(202, "2026-09-13T18:00:00.000Z", "Cancelled")],
    ["final", scheduledGame(203, "2026-09-13T18:00:00.000Z", "Final")],
    ["wrong local day", scheduledGame(204, "2026-09-14T18:00:00.000Z")],
  ])("hides a %s game", async (_label, row) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(listResponse([row])));
    const { listSportsBingoGames } = await import("@/lib/sportsBingo");
    await expect(
      listSportsBingoGames({ sportKey: "basketball_nba", tzOffsetMinutes: 0, evaluationTimeMs: NOW })
    ).resolves.toEqual([]);
  });

  it("applies the browser timezone at the UTC midnight boundary", async () => {
    const boundaryNow = Date.parse("2026-09-13T23:30:00.000Z");
    vi.setSystemTime(boundaryNow);
    const row = scheduledGame(301, "2026-09-14T00:30:00.000Z");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(listResponse([row])));
    const { listSportsBingoGames } = await import("@/lib/sportsBingo");

    const eastern = await listSportsBingoGames({
      sportKey: "basketball_nba",
      tzOffsetMinutes: 240,
      evaluationTimeMs: boundaryNow,
    });
    const utc = await listSportsBingoGames({
      sportKey: "basketball_nba",
      tzOffsetMinutes: 0,
      evaluationTimeMs: boundaryNow,
    });
    expect(eastern).toHaveLength(1);
    expect(utc).toHaveLength(0);
  });

  it("returns verified partial rows and marks a later provider-page failure", async () => {
    const row = scheduledGame(401, "2026-09-13T18:00:00.000Z");
    let gameRequests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (!String(input).includes("/nba/v1/games")) return listResponse([]);
        gameRequests += 1;
        return gameRequests === 1 ? listResponse([row]) : listResponse([], false, 503);
      })
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { listSportsBingoGames } = await import("@/lib/sportsBingo");
    const failure = { failed: false };
    const games = await listSportsBingoGames({
      sportKey: "basketball_nba",
      tzOffsetMinutes: 0,
      evaluationTimeMs: NOW,
      failure,
    });

    expect(games.map((game) => game.id)).toEqual(["401"]);
    expect(failure.failed).toBe(true);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("hides an NFL game that has no boardable odds-backed candidates", async () => {
    const row = scheduledGame(501, "2026-09-13T18:00:00.000Z");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes("/nfl/v1/games") ? listResponse([row]) : listResponse([])
      )
    );
    const { listSportsBingoGames } = await import("@/lib/sportsBingo");
    await expect(
      listSportsBingoGames({ sportKey: "americanfootball_nfl", tzOffsetMinutes: 0, evaluationTimeMs: NOW })
    ).resolves.toEqual([]);
  });
});
