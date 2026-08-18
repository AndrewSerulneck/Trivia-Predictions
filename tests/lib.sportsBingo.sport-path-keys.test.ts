import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Guard for Phase B of docs/prop-bingo-out-of-scope-followup-plan.md: SPORT_PATH_BY_KEY
// (lib/sportsBingo.ts) and the leagues route's LEAGUES list drifted apart once already (NHL +
// six soccer keys were unreachable dead weight in the path table). This asserts the two stay in
// lockstep — adding a league to the picker without a path (or vice versa) fails CI instead of
// silently drifting again.

const mocks = vi.hoisted(() => ({
  resolveLeagueSeasonStatus: vi.fn(),
}));

vi.mock("@/lib/leagueSeasonStatus", async () => {
  const actual = await vi.importActual<typeof import("@/lib/leagueSeasonStatus")>("@/lib/leagueSeasonStatus");
  return {
    ...actual,
    resolveLeagueSeasonStatus: mocks.resolveLeagueSeasonStatus,
  };
});

import { SPORT_PATH_BY_KEY } from "@/lib/sportsBingo";
import { GET } from "@/app/api/bingo/leagues/route";

describe("Sports Bingo league keys stay in sync", () => {
  beforeEach(() => {
    mocks.resolveLeagueSeasonStatus.mockReset();
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_BINGO_SEASON_GATING_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_BINGO_NFL_ENABLED", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("SPORT_PATH_BY_KEY has exactly the leagues route's keys, no more, no fewer", async () => {
    const response = await GET();
    const body = (await response.json()) as { leagues: Array<{ key: string }> };
    const routeKeys = body.leagues.map((l) => l.key).sort();

    expect(Object.keys(SPORT_PATH_BY_KEY).sort()).toEqual(routeKeys);
  });
});
