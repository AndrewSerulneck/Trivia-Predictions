import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Phase 5 of docs/prop-bingo-code-review-fix-plan.md — request volume and cache-failure semantics.
//
// Two separate bugs live here, and only the first is about cost:
//
//  1. `hasUpcomingGamesInWindow` walked its window one day at a time — 15 sequential round trips
//     per league, up to 60 per picker load across four leagues — even though `dates[]` repeats and
//     the question it answers ("any game at all?") is a single existence check.
//
//  2. **A failed fetch was cached as a successful empty result.** `fetchBallDontLieList` degrades a
//     provider outage to `[]` on purpose, so "this league has no games" and "the provider was down"
//     arrived at the callers as the same value and were cached for the same 6 or 24 hours. One bad
//     provider minute could therefore mark a league out of season for six hours, or strip the star
//     tilt off every board for a day. That is correctness, not perf.
//
// The fix threads a `BallDontLieFailureBox` out of the HTTP client so the two cases can be told
// apart, and gives failures a ~5 minute negative TTL instead of the full one.

type FetchCall = { url: string };

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function bdlList(data: unknown[]): Response {
  return jsonResponse({ data, meta: { next_cursor: null } });
}

function failedResponse(): Response {
  return { ok: false, status: 503, json: async () => ({}) } as Response;
}

const NFL_GAME = {
  id: 771001,
  date: new Date().toISOString(),
  home_team: { id: 1, full_name: "Seattle Seahawks" },
  visitor_team: { id: 2, full_name: "Arizona Cardinals" },
  status: "Scheduled",
};

function installFetchMock(handler: (url: string) => Response): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      calls.push({ url });
      return Promise.resolve(handler(url));
    })
  );
  return { calls };
}

describe("hasUpcomingGamesInWindow — one request, not one per day", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T18:00:00.000Z"));
    process.env.BALLDONTLIE_API_KEY = "test-bdl-key";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("asks the whole window in a single call, as repeated dates[] params", async () => {
    const { calls } = installFetchMock(() => bdlList([NFL_GAME]));
    const { hasUpcomingGamesInWindow } = await import("@/lib/sportsBingo");

    expect(await hasUpcomingGamesInWindow("americanfootball_nfl", 14)).toBe(true);

    // The whole point of the phase: 15 days, one round trip.
    expect(calls).toHaveLength(1);
    const query = new URL(calls[0].url).searchParams;
    expect(query.getAll("dates[]")).toHaveLength(15);
    expect(query.get("per_page")).toBe("1");
    // `start_date`/`end_date` are silently ignored by these endpoints — see
    // `buildBallDontLieDatesQuery`'s comment and Phase 2 of the fix plan.
    expect(query.get("start_date")).toBeNull();
    expect(query.get("end_date")).toBeNull();
    expect(calls[0].url).toContain("/nfl/v1/games");
  });

  it("still answers false when the window really is empty, and caches that answer", async () => {
    const { calls } = installFetchMock(() => bdlList([]));
    const { hasUpcomingGamesInWindow } = await import("@/lib/sportsBingo");

    expect(await hasUpcomingGamesInWindow("americanfootball_nfl", 14)).toBe(false);
    expect(calls).toHaveLength(1);

    // A real "no games" answer keeps the full 6h TTL: half an hour later, still no request.
    vi.advanceTimersByTime(30 * 60_000);
    expect(await hasUpcomingGamesInWindow("americanfootball_nfl", 14)).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("does not cache a provider failure as a six-hour 'out of season'", async () => {
    const { calls } = installFetchMock(() => failedResponse());
    const { hasUpcomingGamesInWindow } = await import("@/lib/sportsBingo");

    expect(await hasUpcomingGamesInWindow("americanfootball_nfl", 14)).toBe(false);
    expect(calls).toHaveLength(1);

    // Inside the negative TTL the failure is still held, so an outage cannot become a storm.
    vi.advanceTimersByTime(60_000);
    expect(await hasUpcomingGamesInWindow("americanfootball_nfl", 14)).toBe(false);
    expect(calls).toHaveLength(1);

    // Past it, the league gets asked again — the bug was that it would not be, for six hours.
    vi.advanceTimersByTime(5 * 60_000);
    installFetchMock(() => bdlList([NFL_GAME]));
    expect(await hasUpcomingGamesInWindow("americanfootball_nfl", 14)).toBe(true);
  });

  it("keeps caching an unsupported league at the full TTL — no request, no failure", async () => {
    const { calls } = installFetchMock(() => bdlList([]));
    const { hasUpcomingGamesInWindow } = await import("@/lib/sportsBingo");

    expect(await hasUpcomingGamesInWindow("underwater_basketweaving", 14)).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("star-index caches distinguish 'no rows' from 'feed down'", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T18:00:00.000Z"));
    process.env.BALLDONTLIE_API_KEY = "test-bdl-key";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("NFL: an empty-but-successful pull is cached for the full 24h", async () => {
    const { resolveNFLStarIndex } = await import("@/lib/sportsBingoNflStars");
    const fetchSeasonStats = vi.fn().mockResolvedValue([]);

    await resolveNFLStarIndex(new Date(), fetchSeasonStats);
    expect(fetchSeasonStats).toHaveBeenCalledTimes(2); // current + prior season

    vi.advanceTimersByTime(60 * 60_000);
    await resolveNFLStarIndex(new Date(), fetchSeasonStats);
    expect(fetchSeasonStats).toHaveBeenCalledTimes(2);
  });

  it("NFL: a failed pull is re-asked minutes later, not a day later", async () => {
    const { resolveNFLStarIndex } = await import("@/lib/sportsBingoNflStars");
    const failing = vi
      .fn()
      .mockImplementation(async (_season: number, options?: { failure?: { failed: boolean } }) => {
        if (options?.failure) {
          options.failure.failed = true;
        }
        return [];
      });

    const degraded = await resolveNFLStarIndex(new Date(), failing);
    // The degradation itself is unchanged and deliberate: empty maps, no tilt, never a throw.
    expect(degraded.current.size).toBe(0);
    expect(degraded.prior.size).toBe(0);
    expect(failing).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(60_000);
    await resolveNFLStarIndex(new Date(), failing);
    expect(failing).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(5 * 60_000);
    await resolveNFLStarIndex(new Date(), failing);
    expect(failing).toHaveBeenCalledTimes(4);
  });

  it("MLB: an empty-but-successful pull is cached for the full 24h", async () => {
    const { resolveMLBStarIndex } = await import("@/lib/sportsBingoMlbStars");
    const fetchSeasonStats = vi.fn().mockResolvedValue([]);

    await resolveMLBStarIndex(new Date(), fetchSeasonStats);
    expect(fetchSeasonStats).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(60 * 60_000);
    await resolveMLBStarIndex(new Date(), fetchSeasonStats);
    expect(fetchSeasonStats).toHaveBeenCalledTimes(2);
  });

  it("MLB: a failed pull is re-asked minutes later, not a day later", async () => {
    const { resolveMLBStarIndex } = await import("@/lib/sportsBingoMlbStars");
    const failing = vi
      .fn()
      .mockImplementation(async (_season: number, options?: { failure?: { failed: boolean } }) => {
        if (options?.failure) {
          options.failure.failed = true;
        }
        return [];
      });

    await resolveMLBStarIndex(new Date(), failing);
    expect(failing).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(60_000);
    await resolveMLBStarIndex(new Date(), failing);
    expect(failing).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(5 * 60_000);
    await resolveMLBStarIndex(new Date(), failing);
    expect(failing).toHaveBeenCalledTimes(4);
  });

  it("reports a non-2xx page through the failure box without changing what it returns", async () => {
    installFetchMock(() => failedResponse());
    const { fetchBallDontLieList } = await import("@/lib/ballDontLieClient");
    const failure = { failed: false };
    const rows = await fetchBallDontLieList("/nfl/v1/season_stats", new URLSearchParams(), { failure });
    expect(rows).toEqual([]);
    expect(failure.failed).toBe(true);
  });

  it("leaves the failure box alone when the provider genuinely answers with no rows", async () => {
    installFetchMock(() => bdlList([]));
    const { fetchBallDontLieList } = await import("@/lib/ballDontLieClient");
    const failure = { failed: false };
    const rows = await fetchBallDontLieList("/nfl/v1/season_stats", new URLSearchParams(), { failure });
    expect(rows).toEqual([]);
    expect(failure.failed).toBe(false);
  });
});
