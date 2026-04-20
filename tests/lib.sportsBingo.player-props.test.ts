import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type MockResponsePayload = {
  status?: number;
  ok?: boolean;
  body: unknown;
};

function jsonResponse(payload: MockResponsePayload): Response {
  const { status = 200, ok = true, body } = payload;
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("sports bingo player props ingestion", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ODDS_API_KEY = "test-odds-key";
    process.env.ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back regions and ingests event player props for NBA", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          body: [
            {
              id: "nba-evt-1",
              sport_key: "basketball_nba",
              commence_time: "2030-01-01T22:00:00Z",
              home_team: "Boston Celtics",
              away_team: "New York Knicks",
              bookmakers: [],
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          body: {
            id: "nba-evt-1",
            bookmakers: [],
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          body: {
            id: "nba-evt-1",
            bookmakers: [
              {
                title: "DraftKings",
                markets: [
                  {
                    key: "player_points",
                    outcomes: [
                      { name: "Over", description: "Jayson Tatum", point: 28.5, price: -115 },
                      { name: "Under", description: "Jayson Tatum", point: 28.5, price: -105 },
                      { name: "Over", description: "Jalen Brunson", point: 27.5, price: -110 },
                      { name: "Under", description: "Jalen Brunson", point: 27.5, price: -110 },
                      { name: "Over", description: "Kristaps Porzingis", point: 19.5, price: -108 },
                      { name: "Under", description: "Kristaps Porzingis", point: 19.5, price: -112 },
                      { name: "Over", description: "Josh Hart", point: 14.5, price: -102 },
                      { name: "Under", description: "Josh Hart", point: 14.5, price: -118 },
                    ],
                  },
                ],
              },
            ],
          },
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const { generateSportsBingoBoard } = await import("@/lib/sportsBingo");

    const board = await generateSportsBingoBoard({
      gameId: "nba-evt-1",
      sportKey: "basketball_nba",
    });

    const eventCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes("/sports/basketball_nba/events/nba-evt-1/odds"));

    expect(eventCalls).toHaveLength(2);
    expect(eventCalls[0]).toContain("regions=us");
    expect(eventCalls[1]).toContain("regions=us%2Ceu%2Cuk");
    expect(board.squares.some((square) => square.label.includes("will record"))).toBe(true);
  });

  it("requests NFL player prop market keys for NFL games", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          body: [
            {
              id: "nfl-evt-1",
              sport_key: "americanfootball_nfl",
              commence_time: "2030-01-02T18:00:00Z",
              home_team: "Buffalo Bills",
              away_team: "New York Jets",
              bookmakers: [],
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          body: {
            id: "nfl-evt-1",
            bookmakers: [],
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          body: {
            id: "nfl-evt-1",
            bookmakers: [],
          },
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const { generateSportsBingoBoard } = await import("@/lib/sportsBingo");

    await generateSportsBingoBoard({
      gameId: "nfl-evt-1",
      sportKey: "americanfootball_nfl",
    });

    const eventCall = (fetchMock.mock.calls
      .map((call) => String(call[0]))
      .find((url) => url.includes("/sports/americanfootball_nfl/events/nfl-evt-1/odds") && url.includes("regions=us"))) ?? "";

    expect(eventCall).toContain("player_pass_tds");
    expect(eventCall).toContain("player_reception_yds");
    expect(eventCall).not.toContain("player_points");
  });
});
