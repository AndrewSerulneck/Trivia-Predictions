import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const NOW = Date.parse("2026-09-13T12:00:00.000Z");

const listResponse = (data: unknown[]): Response =>
  ({ ok: true, status: 200, json: async () => ({ data, meta: { next_cursor: null } }) }) as Response;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Bingo availability catalog reuse", () => {
  it("builds each league catalog once, then serves game selection without another provider request", async () => {
    const providerFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/nfl/v1/odds")) {
        return listResponse(
          ["fanduel", "draftkings"].map((vendor) => ({
            game_id: 901,
            vendor,
            spread_home_value: -3.5,
            total_value: 44.5,
            moneyline_home_odds: -165,
            moneyline_away_odds: 145,
          }))
        );
      }
      return listResponse([
        {
          id: 901,
          date: "2026-09-13T18:00:00.000Z",
          datetime: "2026-09-13T18:00:00.000Z",
          status: "Scheduled",
          home_team: { id: 1, full_name: "Home Team" },
          visitor_team: { id: 2, full_name: "Away Team" },
          away_team: { id: 2, full_name: "Away Team" },
        },
      ]);
    });
    vi.stubGlobal("fetch", providerFetch);

    const [{ GET: getLeagues }, { GET: getGames }] = await Promise.all([
      import("@/app/api/bingo/leagues/route"),
      import("@/app/api/bingo/games/route"),
    ]);

    const started = process.hrtime.bigint();
    const leaguesResponse = await getLeagues(
      new Request("http://localhost/api/bingo/leagues?tzOffsetMinutes=0")
    );
    const afterLeagues = providerFetch.mock.calls.length;
    const gamesResponse = await getGames(
      new Request("http://localhost/api/bingo/games?sportKey=basketball_nba&tzOffsetMinutes=0")
    );
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;

    expect(leaguesResponse.status).toBe(200);
    expect(gamesResponse.status).toBe(200);
    // Three UTC dates in the 36-hour window x four leagues, plus one slate-wide NFL odds call.
    expect(afterLeagues).toBe(13);
    expect(providerFetch).toHaveBeenCalledTimes(afterLeagues);
    expect(elapsedMs).toBeLessThan(1_000);
  });
});
