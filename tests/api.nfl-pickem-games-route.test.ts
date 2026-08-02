import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getNFLWeekById: vi.fn(),
  isNFLWeekLocked: vi.fn(),
  isNFLWeekOpenForPicks: vi.fn(),
  isPreseasonPreviewWeek: vi.fn(),
  listNFLPickEmGames: vi.fn(),
  listNFLWeeks: vi.fn(),
  resolveRequestUserId: vi.fn(),
  getVenueNFLPickEmScoringMode: vi.fn(),
}));

vi.mock("@/lib/nflPickEm", () => ({
  getNFLWeekById: mocks.getNFLWeekById,
  isNFLWeekLocked: mocks.isNFLWeekLocked,
  isNFLWeekOpenForPicks: mocks.isNFLWeekOpenForPicks,
  isPreseasonPreviewWeek: mocks.isPreseasonPreviewWeek,
  listNFLPickEmGames: mocks.listNFLPickEmGames,
  listNFLWeeks: mocks.listNFLWeeks,
}));

vi.mock("@/lib/serverSession", () => ({
  resolveRequestUserId: mocks.resolveRequestUserId,
}));

vi.mock("@/lib/venueGameSettings", () => ({
  getVenueNFLPickEmScoringMode: mocks.getVenueNFLPickEmScoringMode,
}));

import { GET } from "@/app/api/nfl-pickem/games/route";

describe("NFL Pick 'Em games route scoring mode", () => {
  beforeEach(() => {
    mocks.getNFLWeekById.mockReset();
    mocks.isNFLWeekLocked.mockReset();
    mocks.isNFLWeekOpenForPicks.mockReset();
    mocks.isPreseasonPreviewWeek.mockReset();
    mocks.listNFLPickEmGames.mockReset();
    mocks.listNFLWeeks.mockReset();
    mocks.resolveRequestUserId.mockReset();
    mocks.getVenueNFLPickEmScoringMode.mockReset();

    mocks.resolveRequestUserId.mockReturnValue({ forbidden: false, userId: "user-1" });
    mocks.getNFLWeekById.mockResolvedValue({
      id: "week-1",
      season: 2026,
      weekNumber: 1,
      weekStartDate: "2026-09-10",
      weekEndDate: "2026-09-14",
      thursdayKickoff: "2026-09-10T20:20:00.000Z",
      status: "open",
    });
    mocks.isNFLWeekOpenForPicks.mockReturnValue(true);
    mocks.isNFLWeekLocked.mockReturnValue(false);
    mocks.listNFLPickEmGames.mockResolvedValue({
      week: {
        id: "week-1",
        weekNumber: 1,
        weekStartDate: "2026-09-10",
        weekEndDate: "2026-09-14",
        thursdayKickoff: "2026-09-10T20:20:00.000Z",
        status: "open",
      },
      games: [
        {
          id: "game-1",
          homeTeam: "Bills",
          awayTeam: "Jets",
          startsAt: "2026-09-10T20:20:00.000Z",
          isLocked: false,
          status: "scheduled",
          homeScore: null,
          awayScore: null,
          winnerTeam: null,
          homeSpread: -3.5,
          awaySpread: 3.5,
          isThursdayGame: true,
          isSundayGame: false,
          isMondayGame: false,
          dayGroupKey: "2026-09-10",
          dayGroupLabel: "Thursday Night Football",
          isThursdayNightSection: true,
        },
      ],
      userSummary: undefined,
    });
  });

  it("defaults to standard mode when venueId is omitted and does not expose spreads", async () => {
    const response = await GET(new Request("http://localhost/api/nfl-pickem/games?weekId=week-1"));
    const body = (await response.json()) as {
      ok: boolean;
      scoringMode: string;
      games: Array<{ homeSpread?: number | null; awaySpread?: number | null }>;
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.scoringMode).toBe("standard");
    expect(body.games[0].homeSpread).toBeUndefined();
    expect(body.games[0].awaySpread).toBeUndefined();
    expect(mocks.getVenueNFLPickEmScoringMode).not.toHaveBeenCalled();
  });

  it("returns stored spreads when the venue is in spread mode", async () => {
    mocks.getVenueNFLPickEmScoringMode.mockResolvedValue("spread");

    const response = await GET(
      new Request("http://localhost/api/nfl-pickem/games?weekId=week-1&venueId=venue-1"),
    );
    const body = (await response.json()) as {
      ok: boolean;
      scoringMode: string;
      games: Array<{ homeSpread?: number | null; awaySpread?: number | null }>;
    };

    expect(response.status).toBe(200);
    expect(body.scoringMode).toBe("spread");
    expect(body.games[0].homeSpread).toBe(-3.5);
    expect(body.games[0].awaySpread).toBe(3.5);
    expect(mocks.getVenueNFLPickEmScoringMode).toHaveBeenCalledWith("venue-1");
  });

  it("keeps stored spreads hidden when the venue is in standard mode", async () => {
    mocks.getVenueNFLPickEmScoringMode.mockResolvedValue("standard");

    const response = await GET(
      new Request("http://localhost/api/nfl-pickem/games?weekId=week-1&venueId=venue-1"),
    );
    const body = (await response.json()) as {
      ok: boolean;
      scoringMode: string;
      games: Array<{ homeSpread?: number | null; awaySpread?: number | null }>;
    };

    expect(response.status).toBe(200);
    expect(body.scoringMode).toBe("standard");
    expect(body.games[0].homeSpread).toBeUndefined();
    expect(body.games[0].awaySpread).toBeUndefined();
    expect(mocks.getVenueNFLPickEmScoringMode).toHaveBeenCalledWith("venue-1");
  });
});
