import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { GET } from "@/app/api/bingo/leagues/route";

describe("GET /api/bingo/leagues", () => {
  beforeEach(() => {
    mocks.resolveLeagueSeasonStatus.mockReset();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports every league in-season and skips the resolver when season gating is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_BINGO_SEASON_GATING_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_BINGO_NFL_ENABLED", "");

    const response = await GET();
    const body = (await response.json()) as {
      ok: boolean;
      leagues: Array<{ key: string; status: string; resumesLabel?: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.leagues.find((l) => l.key === "basketball_nba")?.status).toBe("in_season");
    expect(body.leagues.find((l) => l.key === "americanfootball_nfl")?.status).toBe("coming_soon");
    expect(mocks.resolveLeagueSeasonStatus).not.toHaveBeenCalled();
  });

  it("consults the resolver per league when season gating is on", async () => {
    vi.stubEnv("NEXT_PUBLIC_BINGO_SEASON_GATING_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_BINGO_NFL_ENABLED", "");
    mocks.resolveLeagueSeasonStatus.mockImplementation(async (sportKey: string) =>
      sportKey === "basketball_nba" ? { status: "in_season" } : { status: "out_of_season", resumesLabel: "Returns May 2027" }
    );

    const response = await GET();
    const body = (await response.json()) as {
      ok: boolean;
      leagues: Array<{ key: string; status: string; resumesLabel?: string }>;
    };

    expect(body.leagues.find((l) => l.key === "basketball_nba")?.status).toBe("in_season");
    expect(body.leagues.find((l) => l.key === "baseball_mlb")?.status).toBe("out_of_season");
    expect(body.leagues.find((l) => l.key === "baseball_mlb")?.resumesLabel).toBe("Returns May 2027");
    // NFL is gated separately on NEXT_PUBLIC_BINGO_NFL_ENABLED, so the season resolver is never
    // even asked about it while that flag is off.
    expect(mocks.resolveLeagueSeasonStatus).not.toHaveBeenCalledWith("americanfootball_nfl");
  });

  it("keeps NFL reported as coming-soon (not out-of-season) even mid-season until NEXT_PUBLIC_BINGO_NFL_ENABLED flips", async () => {
    vi.stubEnv("NEXT_PUBLIC_BINGO_SEASON_GATING_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_BINGO_NFL_ENABLED", "");
    mocks.resolveLeagueSeasonStatus.mockResolvedValue({ status: "in_season" });

    const response = await GET();
    const body = (await response.json()) as {
      leagues: Array<{ key: string; status: string; resumesLabel?: string; note?: string }>;
    };

    const nfl = body.leagues.find((l) => l.key === "americanfootball_nfl");
    expect(nfl?.status).toBe("coming_soon");
    expect(nfl?.note).toBe("Coming soon");
    expect(nfl?.resumesLabel).toBeUndefined();
  });

  it("consults the real season resolver for NFL once NEXT_PUBLIC_BINGO_NFL_ENABLED is on", async () => {
    vi.stubEnv("NEXT_PUBLIC_BINGO_SEASON_GATING_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_BINGO_NFL_ENABLED", "true");
    mocks.resolveLeagueSeasonStatus.mockResolvedValue({ status: "in_season" });

    const response = await GET();
    const body = (await response.json()) as { leagues: Array<{ key: string; status: string }> };

    expect(body.leagues.find((l) => l.key === "americanfootball_nfl")?.status).toBe("in_season");
    expect(mocks.resolveLeagueSeasonStatus).toHaveBeenCalledWith("americanfootball_nfl");
  });

  it("returns 500 on an unexpected error", async () => {
    vi.stubEnv("NEXT_PUBLIC_BINGO_SEASON_GATING_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_BINGO_NFL_ENABLED", "true");
    mocks.resolveLeagueSeasonStatus.mockRejectedValue(new Error("boom"));

    const response = await GET();
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("boom");
  });
});
