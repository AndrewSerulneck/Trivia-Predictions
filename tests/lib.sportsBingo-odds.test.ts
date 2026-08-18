import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Phase 2 of docs/prop-bingo-nfl-plan.md — NFL core squares off real market numbers.
// Covers the four things the plan names: consensus math, de-vigging, the missing-odds fallback,
// and a game no sportsbook has priced.

type OddsRow = {
  game_id: string | number;
  vendor: string;
  spread_home_value?: number | string | null;
  spread_away_value?: number | string | null;
  moneyline_home_odds?: number | string | null;
  moneyline_away_odds?: number | string | null;
  total_value?: number | string | null;
};

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function bdlList(data: unknown[]): Response {
  return jsonResponse({ data, meta: { next_cursor: null } });
}

async function importOdds() {
  return import("@/lib/sportsBingoOdds");
}

describe("sportsBingoOdds — de-vigging", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.BALLDONTLIE_API_KEY = "test-bdl-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("strips the hold from a two-way moneyline so the two sides sum to 1", async () => {
    const { deVigTwoWay, impliedProbabilityFromAmericanOdds } = await importOdds();

    // -150 / +130 is a ~4.3% hold: raw implieds are 0.600 and 0.435.
    const rawHome = impliedProbabilityFromAmericanOdds(-150)!;
    const rawAway = impliedProbabilityFromAmericanOdds(130)!;
    expect(rawHome + rawAway).toBeGreaterThan(1);

    const home = deVigTwoWay(-150, 130)!;
    const away = deVigTwoWay(130, -150)!;
    expect(home + away).toBeCloseTo(1, 10);
    expect(home).toBeCloseTo(rawHome / (rawHome + rawAway), 10);
    // De-vigging must pull the favorite DOWN from its raw (juiced) implied probability.
    expect(home).toBeLessThan(rawHome);
  });

  it("returns null for a one-sided price rather than passing the full vig through", async () => {
    const { deVigTwoWay } = await importOdds();
    expect(deVigTwoWay(-150, null)).toBeNull();
    expect(deVigTwoWay(null, 130)).toBeNull();
    expect(deVigTwoWay(0, 0)).toBeNull();
  });

  it("leaves an already-fair symmetric price alone", async () => {
    const { deVigTwoWay } = await importOdds();
    expect(deVigTwoWay(-182, 182)).toBeCloseTo(0.645, 2);
    expect(deVigTwoWay(100, -100)).toBeCloseTo(0.5, 10);
  });
});

describe("sportsBingoOdds — vendor consensus", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.BALLDONTLIE_API_KEY = "test-bdl-key";
  });

  it("takes the median across sportsbooks, not the mean, so one outlier book can't drag it", async () => {
    const { computeNFLOddsConsensus } = await importOdds();

    const rows: OddsRow[] = [
      { game_id: "1", vendor: "fanduel", spread_home_value: -3, total_value: 44.5, moneyline_home_odds: -160, moneyline_away_odds: 136 },
      { game_id: "1", vendor: "draftkings", spread_home_value: -3.5, total_value: 45, moneyline_home_odds: -165, moneyline_away_odds: 140 },
      { game_id: "1", vendor: "betmgm", spread_home_value: -3.5, total_value: 45.5, moneyline_home_odds: -155, moneyline_away_odds: 132 },
      // Stale/fat-fingered book: a mean would move ~1.5 points, a median moves nothing.
      { game_id: "1", vendor: "caesars", spread_home_value: -10, total_value: 52, moneyline_home_odds: -400, moneyline_away_odds: 320 },
    ];

    const consensus = computeNFLOddsConsensus(rows).get("1")!;
    expect(consensus.homeSpread).toBe(-3.5);
    expect(consensus.total).toBe(45.25);
    expect(consensus.vendorCount).toBe(4);
    // The three sane books de-vig to ~0.585-0.599. The mean of all four is ~0.637 (the -400
    // outlier alone), the median is ~0.596 — that gap is the whole reason this is a median.
    expect(consensus.homeWinProb).toBeGreaterThan(0.58);
    expect(consensus.homeWinProb).toBeLessThan(0.61);
  });

  it("excludes prediction markets when real sportsbooks are present, and uses them otherwise", async () => {
    const { computeNFLOddsConsensus } = await importOdds();

    const withBooks: OddsRow[] = [
      { game_id: "1", vendor: "fanduel", spread_home_value: -3, total_value: 44 },
      { game_id: "1", vendor: "kalshi", spread_home_value: -9, total_value: 60 },
      { game_id: "1", vendor: "polymarket", spread_home_value: -9, total_value: 60 },
    ];
    const booked = computeNFLOddsConsensus(withBooks).get("1")!;
    expect(booked.homeSpread).toBe(-3);
    expect(booked.total).toBe(44);

    // Nothing but prediction markets is still better than league averages — fall back to them.
    const predictionOnly: OddsRow[] = [
      { game_id: "2", vendor: "kalshi", spread_home_value: -6.5, total_value: 47 },
      { game_id: "2", vendor: "polymarket", spread_home_value: -6.5, total_value: 47 },
    ];
    const fallback = computeNFLOddsConsensus(predictionOnly).get("2")!;
    expect(fallback.homeSpread).toBe(-6.5);
  });

  it("derives a missing spread side from its negation and drops absurd values", async () => {
    const { computeNFLOddsConsensus } = await importOdds();

    const consensus = computeNFLOddsConsensus([
      { game_id: "1", vendor: "fanduel", spread_away_value: 6.5, total_value: 41.5 },
      // 200-point total and a 99-point spread are provider junk, not a market.
      { game_id: "1", vendor: "draftkings", spread_home_value: -99, total_value: 200 },
    ]).get("1")!;

    expect(consensus.homeSpread).toBe(-6.5);
    expect(consensus.total).toBe(41.5);
  });

  it("skips a game the books priced only halfway", async () => {
    const { computeNFLOddsConsensus } = await importOdds();

    // Spread but no total: mixing a real spread with the fictional 45-point league-average total
    // is exactly the failure this phase exists to remove, so the game gets no model at all.
    const spreadOnly = computeNFLOddsConsensus([{ game_id: "1", vendor: "fanduel", spread_home_value: -3 }]);
    expect(spreadOnly.has("1")).toBe(false);

    // A moneyline alone is likewise not enough to anchor the scoring model.
    const mlOnly = computeNFLOddsConsensus([
      { game_id: "2", vendor: "fanduel", moneyline_home_odds: -150, moneyline_away_odds: 130 },
    ]);
    expect(mlOnly.has("2")).toBe(false);
  });

  it("keeps a game whose books quoted no moneyline, with a null homeWinProb", async () => {
    const { computeNFLOddsConsensus } = await importOdds();
    const consensus = computeNFLOddsConsensus([
      { game_id: "1", vendor: "fanduel", spread_home_value: -3.5, total_value: 45 },
    ]).get("1")!;
    expect(consensus.homeWinProb).toBeNull();
  });
});

describe("sportsBingoOdds — fetchNFLOddsConsensus", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.BALLDONTLIE_API_KEY = "test-bdl-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("makes one slate-wide call and joins the result back by game id", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("/nfl/v1/odds");
      return Promise.resolve(
        bdlList([
          { game_id: 111, vendor: "fanduel", spread_home_value: -3.5, total_value: 45 },
          { game_id: 222, vendor: "fanduel", spread_home_value: 6.5, total_value: 41 },
          // A game we didn't ask about must not leak into the result.
          { game_id: 999, vendor: "fanduel", spread_home_value: -1.5, total_value: 50 },
        ])
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchNFLOddsConsensus } = await importOdds();
    const consensus = await fetchNFLOddsConsensus(["111", "222", "333"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestedUrl).toContain("game_ids%5B%5D=111");
    expect(requestedUrl).toContain("game_ids%5B%5D=222");
    expect([...consensus.keys()].sort()).toEqual(["111", "222"]);
    expect(consensus.get("222")?.homeSpread).toBe(6.5);
  });

  it("returns an empty map on a provider failure instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) } as Response)
    );
    const { fetchNFLOddsConsensus } = await importOdds();
    await expect(fetchNFLOddsConsensus(["111"])).resolves.toEqual(new Map());
  });

  it("does not call the provider at all for an empty slate", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { fetchNFLOddsConsensus } = await importOdds();
    await expect(fetchNFLOddsConsensus([])).resolves.toEqual(new Map());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sportsBingoOdds — NFL scoring model", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.BALLDONTLIE_API_KEY = "test-bdl-key";
  });

  it("derives coherent margin, total and team-total probabilities from a real market", async () => {
    const { buildNFLMarketModel } = await importOdds();

    // Home favored by 3.5, total 45 -> implied 24.25 / 20.75.
    const model = buildNFLMarketModel({ homeSpread: -3.5, total: 45, homeWinProb: 0.62, vendorCount: 8 });

    expect(model.favorite).toBe("home");
    expect(model.expectedHomeMargin).toBe(3.5);
    expect(model.impliedHomeTotal).toBeCloseTo(24.25, 6);
    expect(model.impliedAwayTotal).toBeCloseTo(20.75, 6);

    // The de-vigged moneyline is the authority on the win square, not the normal approximation.
    expect(model.winProbability("home")).toBe(0.62);
    expect(model.winProbability("away")).toBeCloseTo(0.38, 10);

    // At the spread itself the favorite should be near a coin flip.
    expect(model.marginMoreThan("home", 3.5)).toBeCloseTo(0.5, 2);
    // Laying more points is strictly harder; taking fewer, strictly easier.
    expect(model.marginMoreThan("home", 10.5)).toBeLessThan(model.marginMoreThan("home", 3.5));
    expect(model.marginMoreThan("home", 0.5)).toBeGreaterThan(model.marginMoreThan("home", 3.5));
    // The underdog winning by more than the same number is much less likely.
    expect(model.marginMoreThan("away", 3.5)).toBeLessThan(model.marginMoreThan("home", 3.5) - 0.15);

    // Half-point lines mean no push: "favorite by more than L" and "underdog within L" partition.
    const homeBy7 = model.marginMoreThan("home", 7.5);
    const awayWithin7 = 1 - homeBy7;
    expect(homeBy7 + awayWithin7).toBeCloseTo(1, 10);

    // Total sits at the market number.
    expect(model.gameTotalOver(45)).toBeCloseTo(0.5, 6);
    expect(model.gameTotalOver(51.5)).toBeLessThan(0.35);
    expect(model.gameTotalOver(38.5)).toBeGreaterThan(0.65);

    // Team totals sit at their implied numbers, and the favorite's is the higher one.
    expect(model.teamTotalOver("home", model.impliedHomeTotal)).toBeCloseTo(0.5, 6);
    expect(model.teamTotalOver("home", 24.5)).toBeGreaterThan(model.teamTotalOver("away", 24.5));
  });

  it("moves with the market instead of producing one board for every game", async () => {
    const { buildNFLMarketModel } = await importOdds();

    const blowout = buildNFLMarketModel({ homeSpread: -13.5, total: 51, homeWinProb: 0.85, vendorCount: 8 });
    const coinFlip = buildNFLMarketModel({ homeSpread: -1, total: 38.5, homeWinProb: 0.53, vendorCount: 8 });

    expect(blowout.marginMoreThan("home", 7.5)).toBeGreaterThan(coinFlip.marginMoreThan("home", 7.5) + 0.2);
    expect(blowout.gameTotalOver(45)).toBeGreaterThan(coinFlip.gameTotalOver(45) + 0.3);
    expect(coinFlip.favorite).toBe("home");
    expect(buildNFLMarketModel({ homeSpread: 2.5, total: 44, homeWinProb: null, vendorCount: 3 }).favorite).toBe("away");
  });

  it("falls back to the normal model for the win square when no book quoted a moneyline", async () => {
    const { buildNFLMarketModel } = await importOdds();
    const model = buildNFLMarketModel({ homeSpread: -3.5, total: 45, homeWinProb: null, vendorCount: 2 });
    // P(margin > 0) with mean 3.5 and sigma 13.5.
    expect(model.winProbability("home")).toBeGreaterThan(0.55);
    expect(model.winProbability("home")).toBeLessThan(0.65);
    expect(model.winProbability("home") + model.winProbability("away")).toBeCloseTo(1, 10);
  });

  it("keeps the three sigmas mutually consistent", async () => {
    const { NFL_GAME_TOTAL_SIGMA, NFL_MARGIN_SIGMA, NFL_TEAM_TOTAL_SIGMA } = await importOdds();
    // Var(A+B) + Var(A-B) = 2(Var(A) + Var(B)) holds for any correlation, so this identity is
    // what stops the three distributions from describing three different games.
    expect(NFL_GAME_TOTAL_SIGMA ** 2 + NFL_MARGIN_SIGMA ** 2).toBeCloseTo(4 * NFL_TEAM_TOTAL_SIGMA ** 2, 6);
  });
});
