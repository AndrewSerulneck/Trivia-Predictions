import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Phase 3 of docs/prop-bingo-nfl-plan.md — the player-prop consensus half, tested as pure math
// plus one fetch-level pass. The board-assembly half lives in
// tests/lib.sportsBingo.nfl-prop-mix.test.ts.

type PropRow = {
  game_id?: number | string;
  player_id?: number | string;
  vendor?: string;
  prop_type?: string;
  line_value?: number | string | null;
  market?: { type?: string; over_odds?: number | string; under_odds?: number | string; odds?: number | string } | null;
};

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function bdlList(data: unknown[]): Response {
  return jsonResponse({ data, meta: { next_cursor: null } });
}

function overUnder(vendor: string, line: number, overOdds: number, underOdds: number, propType = "rushing_yards"): PropRow {
  return {
    game_id: 1,
    player_id: 490,
    vendor,
    prop_type: propType,
    line_value: String(line),
    market: { type: "over_under", over_odds: overOdds, under_odds: underOdds },
  };
}

async function importOdds() {
  return import("@/lib/sportsBingoOdds");
}

describe("NFL player-prop consensus", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.BALLDONTLIE_API_KEY = "test-bdl-key";
    delete process.env.BINGO_NFL_MILESTONE_DEVIG_FACTOR;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("de-vigs the two-way price rather than using the raw implied odds", async () => {
    const { computeNFLPlayerPropMarkets, NFL_CORE_OVER_UNDER_PROP_TYPES } = await importOdds();
    // -115/-115 implies 0.535 on each side; the honest number is exactly 0.5.
    const markets = computeNFLPlayerPropMarkets(
      [overUnder("fanduel", 85.5, -115, -115)],
      NFL_CORE_OVER_UNDER_PROP_TYPES
    );
    expect(markets).toHaveLength(1);
    expect(markets[0].probability).toBeCloseTo(0.5, 6);
    // The MLB path's raw-implied number would have been ~0.535 — deliberately not what we do here.
    expect(markets[0].probability).toBeLessThan(0.52);
  });

  it("picks the modal line and prices only the books quoting it", async () => {
    const { computeNFLPlayerPropMarkets, NFL_CORE_OVER_UNDER_PROP_TYPES } = await importOdds();
    const markets = computeNFLPlayerPropMarkets(
      [
        overUnder("fanduel", 85.5, -110, -110),
        overUnder("draftkings", 85.5, -120, 100),
        overUnder("betmgm", 85.5, -105, -115),
        // One book way off the market. It must not move the line, and its price must not be
        // blended into the consensus for a line nobody else is quoting.
        overUnder("betrivers", 99.5, 250, -320),
      ],
      NFL_CORE_OVER_UNDER_PROP_TYPES
    );

    expect(markets).toHaveLength(1);
    expect(markets[0].line).toBe(85.5);
    expect(markets[0].vendorCount).toBe(3);
    expect(markets[0].probability).toBeGreaterThan(0.45);
    expect(markets[0].probability).toBeLessThan(0.55);
  });

  it("keeps prediction markets out of the line vote when a real book quoted the prop", async () => {
    const { computeNFLPlayerPropMarkets, NFL_CORE_OVER_UNDER_PROP_TYPES } = await importOdds();
    const markets = computeNFLPlayerPropMarkets(
      [
        overUnder("fanduel", 60.5, -110, -110),
        { ...overUnder("kalshi", 74.5, -110, -110) },
        { ...overUnder("polymarket", 74.5, -110, -110) },
      ],
      NFL_CORE_OVER_UNDER_PROP_TYPES
    );
    // Two unranked vendors outnumber the one book, but only ranked books get a vote on the line.
    expect(markets[0].line).toBe(60.5);
  });

  it("shaves the book's hold off a one-sided milestone price", async () => {
    const { computeNFLPlayerPropMarkets, NFL_CORE_MILESTONE_PROP_TYPES, NFL_MILESTONE_DEVIG_FACTOR } =
      await importOdds();
    const markets = computeNFLPlayerPropMarkets(
      [
        {
          game_id: 1,
          player_id: 77,
          vendor: "draftkings",
          prop_type: "anytime_td",
          line_value: "0.5",
          market: { type: "milestone", odds: -110 },
        },
      ],
      NFL_CORE_MILESTONE_PROP_TYPES
    );
    expect(markets).toHaveLength(1);
    expect(markets[0].marketType).toBe("milestone");
    // A milestone market quotes one side only, so there is no complement to normalize against —
    // the flat factor is the whole correction, and it must actually be applied.
    expect(markets[0].probability).toBeCloseTo((110 / 210) * NFL_MILESTONE_DEVIG_FACTOR, 6);
    expect(markets[0].probability).toBeLessThan(110 / 210);
  });

  it("drops prop types outside the allowlist", async () => {
    const { computeNFLPlayerPropMarkets, NFL_CORE_OVER_UNDER_PROP_TYPES } = await importOdds();
    const markets = computeNFLPlayerPropMarkets(
      [
        // Phase 0 §3 dropped this one: `/nfl/v1/stats` has no longest-completion field at all.
        overUnder("fanduel", 41.5, -110, -110, "longest_pass"),
        // Half/quarter splits need play-by-play, not the box score.
        overUnder("fanduel", 120.5, -110, -110, "passing_yards_1h"),
        overUnder("fanduel", 65.5, -110, -110, "rushing_yards"),
      ],
      NFL_CORE_OVER_UNDER_PROP_TYPES
    );
    expect(markets.map((market) => market.propType)).toEqual(["rushing_yards"]);
  });

  it("ignores rows with no usable price or line", async () => {
    const { computeNFLPlayerPropMarkets, NFL_CORE_OVER_UNDER_PROP_TYPES } = await importOdds();
    const markets = computeNFLPlayerPropMarkets(
      [
        { ...overUnder("fanduel", 85.5, -110, -110), line_value: null },
        { ...overUnder("draftkings", 85.5, -110, -110), market: { type: "over_under" } },
        // A one-sided over/under still carries the full vig, so it is not usable either.
        { ...overUnder("betmgm", 85.5, -110, -110), market: { type: "over_under", over_odds: -110 } },
      ],
      NFL_CORE_OVER_UNDER_PROP_TYPES
    );
    expect(markets).toHaveLength(0);
  });

  it("joins player names, drops props it cannot name, and caches both calls", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/nfl/v1/odds/player_props")) {
        return Promise.resolve(
          bdlList([
            overUnder("fanduel", 85.5, -110, -110),
            overUnder("draftkings", 85.5, -110, -110),
            { ...overUnder("fanduel", 45.5, -110, -110, "receiving_yards"), player_id: 999 },
          ])
        );
      }
      if (url.includes("/nfl/v1/players")) {
        // 999 is deliberately absent from the roster response.
        return Promise.resolve(bdlList([{ id: 490, first_name: "Saquon", last_name: "Barkley" }]));
      }
      return Promise.resolve(bdlList([]));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchNFLPlayerPropMarkets } = await importOdds();
    const markets = await fetchNFLPlayerPropMarkets("1");
    expect(markets).toHaveLength(1);
    expect(markets[0].playerName).toBe("Saquon Barkley");

    const propCalls = () => fetchMock.mock.calls.filter((call) => String(call[0]).includes("player_props")).length;
    expect(propCalls()).toBe(1);
    await fetchNFLPlayerPropMarkets("1");
    expect(propCalls()).toBe(1);
  });

  it("returns an empty list when the books have posted nothing, rather than throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.reject(new Error("provider down")))
    );
    const { fetchNFLPlayerPropMarkets } = await importOdds();
    await expect(fetchNFLPlayerPropMarkets("424129")).resolves.toEqual([]);
  });
});

describe("NFL team/game/quarter probability model", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.BALLDONTLIE_API_KEY = "test-bdl-key";
  });

  const consensus = (homeSpread: number, total: number) => ({
    homeSpread,
    total,
    homeWinProb: null,
    vendorCount: 8,
  });

  it("moves quarter squares with the market rather than holding a league constant", async () => {
    const { buildNFLMarketModel } = await importOdds();
    const shootout = buildNFLMarketModel(consensus(-7, 54));
    const slog = buildNFLMarketModel(consensus(-7, 37));

    // The same 7-point favorite is far likelier to score every quarter in a 54-point game.
    expect(shootout.scoresEveryQuarter("home")).toBeGreaterThan(slog.scoresEveryQuarter("home") + 0.1);
    expect(shootout.quarterPointsAtLeast("home", 14)).toBeGreaterThan(slog.quarterPointsAtLeast("home", 14));
    // And a scoreless quarter is a low-total signature.
    expect(slog.anyQuarterScoreless()).toBeGreaterThan(shootout.anyQuarterScoreless());
  });

  it("keeps halftime leads consistent: two sides plus a real tie band", async () => {
    const { buildNFLMarketModel } = await importOdds();
    const model = buildNFLMarketModel(consensus(-6.5, 47));
    const home = model.leadsAtHalftime("home");
    const away = model.leadsAtHalftime("away");
    expect(home).toBeGreaterThan(away);
    // Halftime ties are common; a model that leaves no room for them is wrong.
    const tie = 1 - home - away;
    expect(tie).toBeGreaterThan(0.05);
    expect(tie).toBeLessThan(0.2);
  });

  it("prices the margin bands as complements of one interval", async () => {
    const { buildNFLMarketModel } = await importOdds();
    const model = buildNFLMarketModel(consensus(-3, 45));
    // A wider band must be more likely, and the two-tailed band must be the interval's complement.
    expect(model.marginAbsAtMost(7.5)).toBeGreaterThan(model.marginAbsAtMost(3.5));
    expect(model.marginAbsAtLeast(7.5)).toBeLessThan(model.marginAbsAtLeast(3.5));
    // The two are complements of the same interval, except that "at most" carries the 1.25 key-
    // number boost and "at least" deliberately does not. Checked at 10.5, where neither side is
    // near the 0.05/0.95 clamp that would mask the identity.
    expect(model.marginAbsAtMost(10.5) / 1.25 + model.marginAbsAtLeast(10.5)).toBeCloseTo(1, 6);
  });

  it("lands overtime near the observed ~6.5% league rate", async () => {
    const { buildNFLMarketModel } = await importOdds();
    const pickEm = buildNFLMarketModel(consensus(0, 45)).overtime();
    expect(pickEm).toBeGreaterThan(0.05);
    expect(pickEm).toBeLessThan(0.09);
    // A blowout line makes overtime less likely, not equally likely.
    expect(buildNFLMarketModel(consensus(-14, 45)).overtime()).toBeLessThan(pickEm);
  });

  it("beats independence on 'both teams score 20+', which is a correlated event", async () => {
    const { buildNFLMarketModel } = await importOdds();
    const model = buildNFLMarketModel(consensus(-3, 48));
    const independent = model.teamTotalOver("home", 19.5) * model.teamTotalOver("away", 19.5);
    expect(model.bothTeamsScoreAtLeast(19.5)).toBeGreaterThan(independent);
  });

  it("shades play-by-play base rates by the total in the right direction", async () => {
    const { shadeByTotal, NFL_LONG_TOUCHDOWN_BASE, NFL_FIRST_SCORE_IS_FIELD_GOAL_BASE } = await importOdds();
    expect(shadeByTotal(NFL_LONG_TOUCHDOWN_BASE, 54, 1)).toBeGreaterThan(NFL_LONG_TOUCHDOWN_BASE);
    expect(shadeByTotal(NFL_FIRST_SCORE_IS_FIELD_GOAL_BASE, 54, -1)).toBeLessThan(
      NFL_FIRST_SCORE_IS_FIELD_GOAL_BASE
    );
  });
});
