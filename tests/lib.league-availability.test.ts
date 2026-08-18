import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  hasUpcomingGamesInWindow: vi.fn(),
}));

vi.mock("@/lib/sportsBingo", () => ({
  hasUpcomingGamesInWindow: mocks.hasUpcomingGamesInWindow,
}));

// Phase 2 of docs/prop-bingo-nfl-plan.md: NEXT_PUBLIC_BINGO_NFL_ENABLED is the single activation
// switch for NFL, and `resolveLeagueBlockReason` is the one place that enforces it — so the
// picker, /api/bingo/games and board creation cannot drift apart. Phase 1 gated the picker only;
// this closes the deep-link path a scripted client could POST to directly.

describe("resolveLeagueBlockReason", () => {
  beforeEach(() => {
    mocks.hasUpcomingGamesInWindow.mockReset();
    mocks.hasUpcomingGamesInWindow.mockResolvedValue(true);
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("blocks NFL while the activation flag is off, even mid-season", async () => {
    vi.stubEnv("NEXT_PUBLIC_BINGO_NFL_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_BINGO_SEASON_GATING_ENABLED", "true");
    const { resolveLeagueBlockReason } = await import("@/lib/leagueSeasonStatus");

    await expect(resolveLeagueBlockReason("americanfootball_nfl")).resolves.toBe("NFL Sports Bingo is coming soon.");
    // The NFL gate is independent of season gating — turning season gating off must not open it.
    vi.stubEnv("NEXT_PUBLIC_BINGO_SEASON_GATING_ENABLED", "");
    await expect(resolveLeagueBlockReason("americanfootball_nfl")).resolves.toBe("NFL Sports Bingo is coming soon.");
  });

  it("lets NFL through on its real season status once the flag is on", async () => {
    vi.stubEnv("NEXT_PUBLIC_BINGO_NFL_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_BINGO_SEASON_GATING_ENABLED", "true");
    const { resolveLeagueBlockReason } = await import("@/lib/leagueSeasonStatus");

    await expect(resolveLeagueBlockReason("americanfootball_nfl")).resolves.toBeNull();
  });

  it("still blocks NFL out of season once the flag is on", async () => {
    vi.stubEnv("NEXT_PUBLIC_BINGO_NFL_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_BINGO_SEASON_GATING_ENABLED", "true");
    mocks.hasUpcomingGamesInWindow.mockResolvedValue(false);
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
    const { resolveLeagueBlockReason } = await import("@/lib/leagueSeasonStatus");

    const reason = await resolveLeagueBlockReason("americanfootball_nfl");
    expect(reason).toContain("out of season");
    vi.useRealTimers();
  });

  // Regression for the code-review fix: the out-of-season message must render a display name,
  // never echo the caller-supplied sportKey verbatim — SportsBingoSelectBoard renders this string
  // straight into the UI, so a raw internal key (or attacker-supplied junk) must never appear.
  it("never echoes the raw sportKey in the out-of-season message", async () => {
    vi.stubEnv("NEXT_PUBLIC_BINGO_SEASON_GATING_ENABLED", "true");
    mocks.hasUpcomingGamesInWindow.mockResolvedValue(false);
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
    const { resolveLeagueBlockReason } = await import("@/lib/leagueSeasonStatus");

    const reason = await resolveLeagueBlockReason("baseball_mlb");
    expect(reason).not.toContain("baseball_mlb");
    expect(reason).toContain("MLB is out of season");
    vi.useRealTimers();
  });

  it("never blocks a non-NFL league on the NFL flag", async () => {
    vi.stubEnv("NEXT_PUBLIC_BINGO_NFL_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_BINGO_SEASON_GATING_ENABLED", "true");
    const { resolveLeagueBlockReason } = await import("@/lib/leagueSeasonStatus");

    await expect(resolveLeagueBlockReason("basketball_nba")).resolves.toBeNull();
    await expect(resolveLeagueBlockReason("baseball_mlb")).resolves.toBeNull();
  });
});
