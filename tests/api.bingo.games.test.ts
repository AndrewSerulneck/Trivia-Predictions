import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolveAvailability: vi.fn() }));

vi.mock("@/lib/sportsBingoAvailability", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sportsBingoAvailability")>(
    "@/lib/sportsBingoAvailability"
  );
  return { ...actual, resolveSportsBingoCreationAvailability: mocks.resolveAvailability };
});

import { SportsBingoAvailabilityError } from "@/lib/sportsBingoAvailability";
import { GET } from "@/app/api/bingo/games/route";

const game = {
  id: "game-1",
  sportKey: "basketball_nba",
  homeTeam: "Boston Celtics",
  awayTeam: "New York Knicks",
  startsAt: "2026-09-13T23:30:00.000Z",
  gameLabel: "New York Knicks vs. Boston Celtics",
  isLocked: false,
};

describe("GET /api/bingo/games", () => {
  beforeEach(() => {
    mocks.resolveAvailability.mockReset();
  });

  it("uses the shared unlocked/local-day creation result", async () => {
    mocks.resolveAvailability.mockResolvedValue({
      evaluatedAt: "2026-09-13T16:00:00.000Z",
      tzOffsetMinutes: 240,
      incomplete: false,
      allFailed: false,
      leagues: [{ sportKey: "basketball_nba", label: "NBA", emoji: "🏀", games: [game], complete: true }],
    });

    const response = await GET(
      new Request("http://localhost/api/bingo/games?sportKey=basketball_nba&includeLocked=true&tzOffsetMinutes=240")
    );
    const body = (await response.json()) as { ok: boolean; games: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.games).toHaveLength(1);
    expect(mocks.resolveAvailability).toHaveBeenCalledWith({
      sportKeys: ["basketball_nba"],
      tzOffsetMinutes: "240",
      evaluationTimeMs: expect.any(Number),
    });
  });

  it("returns verified games with an incomplete warning", async () => {
    mocks.resolveAvailability.mockResolvedValue({
      evaluatedAt: "2026-09-13T16:00:00.000Z",
      tzOffsetMinutes: 0,
      incomplete: true,
      allFailed: false,
      leagues: [{ sportKey: "basketball_nba", label: "NBA", emoji: "🏀", games: [game], complete: false }],
    });

    const response = await GET(new Request("http://localhost/api/bingo/games?sportKey=basketball_nba"));
    const body = (await response.json()) as { ok: boolean; incomplete: boolean; warning: string };
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.incomplete).toBe(true);
    expect(body.warning).toMatch(/could not be checked/i);
  });

  it("returns 503 when no game can be verified during a provider failure", async () => {
    mocks.resolveAvailability.mockResolvedValue({
      evaluatedAt: "2026-09-13T16:00:00.000Z",
      tzOffsetMinutes: 0,
      incomplete: true,
      allFailed: true,
      leagues: [{ sportKey: "basketball_nba", label: "NBA", emoji: "🏀", games: [], complete: false }],
    });

    const response = await GET(new Request("http://localhost/api/bingo/games?sportKey=basketball_nba"));
    expect(response.status).toBe(503);
  });

  it("rejects an unsupported league", async () => {
    mocks.resolveAvailability.mockRejectedValue(
      new SportsBingoAvailabilityError("unsupported_league", "That Sports Bingo league is not supported.")
    );
    const response = await GET(new Request("http://localhost/api/bingo/games?sportKey=hockey_nhl"));
    expect(response.status).toBe(400);
  });
});
