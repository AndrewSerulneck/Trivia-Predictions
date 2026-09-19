import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveAvailability: vi.fn(),
}));

vi.mock("@/lib/sportsBingoAvailability", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sportsBingoAvailability")>(
    "@/lib/sportsBingoAvailability"
  );
  return { ...actual, resolveSportsBingoCreationAvailability: mocks.resolveAvailability };
});

import { GET } from "@/app/api/bingo/leagues/route";

const league = (sportKey: string, label: string, gameCount: number, complete = true) => ({
  sportKey,
  label,
  emoji: label === "MLB" ? "⚾" : label === "NFL" ? "🏈" : "🏀",
  games: Array.from({ length: gameCount }, (_, index) => ({ id: `${sportKey}-${index}` })),
  complete,
});

describe("GET /api/bingo/leagues", () => {
  beforeEach(() => {
    mocks.resolveAvailability.mockReset();
  });

  it("returns only leagues with at least one verified eligible game", async () => {
    mocks.resolveAvailability.mockResolvedValue({
      evaluatedAt: "2026-09-13T16:00:00.000Z",
      tzOffsetMinutes: 240,
      incomplete: false,
      allFailed: false,
      leagues: [
        league("basketball_nba", "NBA", 1),
        league("basketball_wnba", "WNBA", 0),
        league("americanfootball_nfl", "NFL", 1),
        league("baseball_mlb", "MLB", 0),
      ],
    });

    const response = await GET(new Request("http://localhost/api/bingo/leagues?tzOffsetMinutes=240"));
    const body = (await response.json()) as { ok: boolean; leagues: Array<{ key: string }> };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.leagues.map((item) => item.key)).toEqual(["basketball_nba", "americanfootball_nfl"]);
    expect(mocks.resolveAvailability).toHaveBeenCalledWith({
      tzOffsetMinutes: "240",
      evaluationTimeMs: expect.any(Number),
    });
  });

  it("keeps verified leagues and reports an incomplete partial-provider result", async () => {
    mocks.resolveAvailability.mockResolvedValue({
      evaluatedAt: "2026-09-13T16:00:00.000Z",
      tzOffsetMinutes: 240,
      incomplete: true,
      allFailed: false,
      leagues: [league("basketball_nba", "NBA", 1), league("baseball_mlb", "MLB", 0, false)],
    });

    const response = await GET(new Request("http://localhost/api/bingo/leagues?tzOffsetMinutes=240"));
    const body = (await response.json()) as {
      ok: boolean;
      incomplete: boolean;
      warning: string;
      leagues: Array<{ key: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.incomplete).toBe(true);
    expect(body.warning).toMatch(/could not be checked/i);
    expect(body.leagues.map((item) => item.key)).toEqual(["basketball_nba"]);
  });

  it("distinguishes a successful empty day from provider failure", async () => {
    mocks.resolveAvailability.mockResolvedValueOnce({
      evaluatedAt: "2026-09-13T16:00:00.000Z",
      tzOffsetMinutes: 0,
      incomplete: false,
      allFailed: false,
      leagues: [league("basketball_nba", "NBA", 0)],
    });
    const emptyResponse = await GET(new Request("http://localhost/api/bingo/leagues"));
    const emptyBody = (await emptyResponse.json()) as { ok: boolean; leagues: unknown[]; incomplete: boolean };
    expect(emptyResponse.status).toBe(200);
    expect(emptyBody).toMatchObject({ ok: true, leagues: [], incomplete: false });

    mocks.resolveAvailability.mockResolvedValueOnce({
      evaluatedAt: "2026-09-13T16:00:00.000Z",
      tzOffsetMinutes: 0,
      incomplete: true,
      allFailed: true,
      leagues: [league("basketball_nba", "NBA", 0, false)],
    });
    const failedResponse = await GET(new Request("http://localhost/api/bingo/leagues"));
    const failedBody = (await failedResponse.json()) as { ok: boolean; error: string };
    expect(failedResponse.status).toBe(503);
    expect(failedBody.ok).toBe(false);
    expect(failedBody.error).toMatch(/could not check/i);
  });

  it("does not consult obsolete Bingo flags", async () => {
    vi.stubEnv("NEXT_PUBLIC_BINGO_SEASON_GATING_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_BINGO_NFL_ENABLED", "false");
    mocks.resolveAvailability.mockResolvedValue({
      evaluatedAt: "2026-09-13T16:00:00.000Z",
      tzOffsetMinutes: 0,
      incomplete: false,
      allFailed: false,
      leagues: [league("americanfootball_nfl", "NFL", 1)],
    });

    const response = await GET(new Request("http://localhost/api/bingo/leagues"));
    const body = (await response.json()) as { leagues: Array<{ key: string }> };
    expect(body.leagues.map((item) => item.key)).toEqual(["americanfootball_nfl"]);
  });
});
