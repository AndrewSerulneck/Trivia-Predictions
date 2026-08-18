import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasUpcomingGamesInWindow: vi.fn(),
}));

vi.mock("@/lib/sportsBingo", () => ({
  hasUpcomingGamesInWindow: mocks.hasUpcomingGamesInWindow,
}));

import { resolveLeagueSeasonStatus } from "@/lib/leagueSeasonStatus";

describe("resolveLeagueSeasonStatus", () => {
  beforeEach(() => {
    mocks.hasUpcomingGamesInWindow.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is in-season when the live feed has games in the lookahead window", async () => {
    mocks.hasUpcomingGamesInWindow.mockResolvedValue(true);

    const info = await resolveLeagueSeasonStatus("basketball_nba");

    expect(info.status).toBe("in_season");
    expect(mocks.hasUpcomingGamesInWindow).toHaveBeenCalledWith("basketball_nba", 14);
  });

  it("falls back to the calendar when the live feed is empty", async () => {
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
    mocks.hasUpcomingGamesInWindow.mockResolvedValue(false);

    const info = await resolveLeagueSeasonStatus("basketball_nba");

    expect(info.status).toBe("in_season");
  });

  it("falls back to the calendar on a feed error (empty result), never declaring a league dead", async () => {
    vi.setSystemTime(new Date("2026-08-16T12:00:00.000Z"));
    mocks.hasUpcomingGamesInWindow.mockResolvedValue(false);

    const info = await resolveLeagueSeasonStatus("basketball_nba");

    expect(info.status).toBe("out_of_season");
    expect(info.resumesLabel).toBe("Returns October 2026");
  });

  it("reports NFL out of season with no preseason branch, off-season", async () => {
    vi.setSystemTime(new Date("2026-08-16T12:00:00.000Z"));
    mocks.hasUpcomingGamesInWindow.mockResolvedValue(false);

    const info = await resolveLeagueSeasonStatus("americanfootball_nfl");

    expect(info.status).toBe("out_of_season");
    expect(info.resumesLabel).toBe("Returns September 2026");
  });

  it("reports NFL in-season once the live feed picks up the regular season (e.g. Week 1 games 25 days out)", async () => {
    vi.setSystemTime(new Date("2026-08-16T12:00:00.000Z"));
    mocks.hasUpcomingGamesInWindow.mockResolvedValue(true);

    const info = await resolveLeagueSeasonStatus("americanfootball_nfl");

    expect(info.status).toBe("in_season");
  });

  it("treats NFL as in-season through the calendar window across the New Year wrap (regular season + postseason)", async () => {
    vi.setSystemTime(new Date("2027-01-20T12:00:00.000Z"));
    mocks.hasUpcomingGamesInWindow.mockResolvedValue(false);

    const info = await resolveLeagueSeasonStatus("americanfootball_nfl");

    expect(info.status).toBe("in_season");
  });

  it("fails open (in-season) for a league with no calendar entry", async () => {
    mocks.hasUpcomingGamesInWindow.mockResolvedValue(false);

    const info = await resolveLeagueSeasonStatus("icehockey_nhl");

    expect(info.status).toBe("in_season");
  });
});
