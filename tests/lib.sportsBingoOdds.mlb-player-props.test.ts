import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Phase 9d of docs/prop-bingo-nfl-plan.md — the MLB player-prop repair.
//
// Phase 7's handoff note 4 recorded that MLB named-player squares were absent from every production
// board and attributed it to "`/mlb/v1/player_props` 404s". Probed live on 2026-08-17, four bugs
// were stacked: a route that does not exist, the wrong query parameter, a completely different row
// schema than the parser expected, and no player object to name anybody from. Every test below pins
// one of those, so none of them can come back quietly.

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

/** A row in the shape `/mlb/v1/odds/player_props` really returns — captured from a live game. */
function overUnder(vendor: string, propType: string, line: number, overOdds: number, underOdds: number): PropRow {
  return {
    game_id: 5059654,
    player_id: 825,
    vendor,
    prop_type: propType,
    line_value: String(line),
    market: { type: "over_under", over_odds: overOdds, under_odds: underOdds },
  };
}

function milestone(vendor: string, propType: string, line: number, odds: number, playerId = 825): PropRow {
  return {
    game_id: 5059654,
    player_id: playerId,
    vendor,
    prop_type: propType,
    line_value: String(line),
    market: { type: "milestone", odds },
  };
}

const playerRow = (id: number, first: string, last: string, team = "Atlanta Braves") => ({
  id,
  first_name: first,
  last_name: last,
  team: { display_name: team, name: team.split(" ").pop() },
});

async function importOdds() {
  return import("@/lib/sportsBingoOdds");
}

describe("MLB prop-type mapping — what we offer is what we can settle", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.BALLDONTLIE_API_KEY = "test-bdl-key";
  });

  it("maps balldontlie's vocabulary onto the internal market keys", async () => {
    const { MLB_PROP_TYPE_TO_MARKET_KEY } = await importOdds();
    // The old parser matched `market_key` against `player_hits` etc. directly, which the feed never
    // emits — this table is the translation that was missing.
    expect(MLB_PROP_TYPE_TO_MARKET_KEY.get("hits")).toBe("player_hits");
    expect(MLB_PROP_TYPE_TO_MARKET_KEY.get("home_runs")).toBe("player_home_runs");
    expect(MLB_PROP_TYPE_TO_MARKET_KEY.get("rbis")).toBe("player_rbis");
    expect(MLB_PROP_TYPE_TO_MARKET_KEY.get("runs_scored")).toBe("player_runs");
    expect(MLB_PROP_TYPE_TO_MARKET_KEY.get("pitcher_strikeouts")).toBe("player_strikeouts_pitcher");
  });

  it("excludes prop types no MLB box score can grade", async () => {
    const { MLB_CORE_PROP_TYPES } = await importOdds();
    // All of these are posted on a live game (measured 2026-08-17) and all are combos or
    // derivatives — offered-then-voided is worse than never offered.
    for (const propType of ["total_bases", "hits_runs_rbis", "singles", "doubles", "first_home_run", "outs"]) {
      expect(MLB_CORE_PROP_TYPES.has(propType), `${propType} should not be offered`).toBe(false);
    }
  });

  it("keeps the offered set and the settlement set the same object, so they cannot drift", async () => {
    const { MLB_CORE_PLAYER_PROP_MARKET_KEYS, MLB_PROP_TYPE_TO_MARKET_KEY } = await importOdds();
    expect([...MLB_CORE_PLAYER_PROP_MARKET_KEYS].sort()).toEqual([...new Set(MLB_PROP_TYPE_TO_MARKET_KEY.values())].sort());
  });
});

describe("MLB player-prop consensus math", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.BALLDONTLIE_API_KEY = "test-bdl-key";
    delete process.env.BINGO_MLB_MILESTONE_DEVIG_FACTOR;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("de-vigs a two-way price instead of shipping the book's hold — the Phase 2 note 2 bug", async () => {
    const { fetchMLBPlayerPropMarkets } = await importOdds();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/mlb/v1/odds/player_props")) {
        // -115/-115 implies 0.535 each side; the honest number is exactly 0.5.
        return bdlList([overUnder("fanduel", "hits", 0.5, -115, -115)]);
      }
      return bdlList([playerRow(825, "Ozzie", "Albies")]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const markets = await fetchMLBPlayerPropMarkets("5059654");
    expect(markets).toHaveLength(1);
    expect(markets[0].probability).toBeCloseTo(0.5, 6);
    // The old raw-implied path would have priced this square at ~0.535.
    expect(markets[0].probability).toBeLessThan(0.52);
  });

  it("takes the modal line and prices only the books quoting it", async () => {
    const { fetchMLBPlayerPropMarkets } = await importOdds();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/mlb/v1/odds/player_props")) {
          return bdlList([
            overUnder("fanduel", "hits", 0.5, -110, -110),
            overUnder("draftkings", "hits", 0.5, -120, 100),
            overUnder("caesars", "hits", 1.5, 250, -320), // off-market line, must not win
          ]);
        }
        return bdlList([playerRow(825, "Ozzie", "Albies")]);
      })
    );

    const markets = await fetchMLBPlayerPropMarkets("5059654");
    expect(markets).toHaveLength(1);
    expect(markets[0].line).toBe(0.5);
    expect(markets[0].vendorCount).toBe(2);
  });

  it("applies the milestone de-vig factor to a one-sided price", async () => {
    const { fetchMLBPlayerPropMarkets, MLB_MILESTONE_DEVIG_FACTOR } = await importOdds();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/mlb/v1/odds/player_props")) {
          return bdlList([milestone("fanduel", "home_runs", 0.5, 490)]);
        }
        return bdlList([playerRow(825, "Ozzie", "Albies")]);
      })
    );

    const markets = await fetchMLBPlayerPropMarkets("5059654");
    // +490 implies 1/5.9 = 0.1695 before the hold is taken out.
    const raw = 100 / (490 + 100);
    expect(markets[0].marketType).toBe("milestone");
    expect(markets[0].probability).toBeCloseTo(raw * MLB_MILESTONE_DEVIG_FACTOR, 5);
    // Less aggressive than NFL's anytime-TD factor, because an MLB milestone is one side of a real
    // two-way market rather than one runner in a 30-way field.
    expect(MLB_MILESTONE_DEVIG_FACTOR).toBeGreaterThan(0.92);
  });

  it("prefers a real two-way de-vig over a milestone quote on the same market", async () => {
    const { fetchMLBPlayerPropMarkets } = await importOdds();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/mlb/v1/odds/player_props")) {
          // Exactly the split observed live: FanDuel posts `hits 0.5` as a milestone while Fanatics
          // posts the same market two-way.
          return bdlList([
            milestone("fanduel", "hits", 0.5, -210),
            overUnder("fanatics", "hits", 0.5, -215, 160),
          ]);
        }
        return bdlList([playerRow(825, "Ozzie", "Albies")]);
      })
    );

    const markets = await fetchMLBPlayerPropMarkets("5059654");
    expect(markets[0].marketType).toBe("over_under");
  });
});

describe("fetchMLBPlayerPropMarkets — the route, the parameter and the name join", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.BALLDONTLIE_API_KEY = "test-bdl-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls /mlb/v1/odds/player_props with a scalar game_id", async () => {
    const { fetchMLBPlayerPropMarkets } = await importOdds();
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url.includes("player_props")) return bdlList([overUnder("fanduel", "hits", 0.5, -110, -110)]);
        return bdlList([playerRow(825, "Ozzie", "Albies")]);
      })
    );

    await fetchMLBPlayerPropMarkets("5059654");
    const propsUrl = urls.find((url) => url.includes("player_props"))!;
    // `/mlb/v1/player_props` is a hard 404 ("Route not found") and `game_ids[]` is rejected with
    // `400 game_id must be an integer`. Both were the shipped behavior before this phase.
    expect(propsUrl).toContain("/mlb/v1/odds/player_props");
    expect(propsUrl).not.toContain("/mlb/v1/player_props?");
    expect(propsUrl).toContain("game_id=5059654");
    expect(propsUrl).not.toContain("game_ids");
  });

  it("joins player names off /mlb/v1/players and carries the team through", async () => {
    const { fetchMLBPlayerPropMarkets } = await importOdds();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("player_props")) return bdlList([overUnder("fanduel", "hits", 0.5, -110, -110)]);
        return bdlList([playerRow(825, "Ozzie", "Albies", "Atlanta Braves")]);
      })
    );

    const markets = await fetchMLBPlayerPropMarkets("5059654");
    // Prop rows carry only `player_id` — without this join every square would read "Player 825".
    expect(markets[0].playerName).toBe("Ozzie Albies");
    // MLB renders the team as `display_name`; NFL uses `full_name`. Both are read.
    expect(markets[0].teamName).toBe("Atlanta Braves");
  });

  it("drops a prop it cannot name rather than shipping a numbered square", async () => {
    const { fetchMLBPlayerPropMarkets } = await importOdds();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("player_props")) {
          return bdlList([
            overUnder("fanduel", "hits", 0.5, -110, -110),
            milestone("fanduel", "home_runs", 0.5, 400, 999999),
          ]);
        }
        return bdlList([playerRow(825, "Ozzie", "Albies")]);
      })
    );

    const markets = await fetchMLBPlayerPropMarkets("5059654");
    expect(markets).toHaveLength(1);
    expect(markets.every((market) => market.playerName.length > 0)).toBe(true);
  });

  it("returns [] on a provider failure rather than throwing", async () => {
    const { fetchMLBPlayerPropMarkets } = await importOdds();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response));
    // A feed failure must degrade to today's behavior — `buildMLBPlayerPropCandidates` falls back to
    // the historical-stats path — never to a broken board.
    await expect(fetchMLBPlayerPropMarkets("5059654")).resolves.toEqual([]);
  });

  it("returns [] for an empty game id without calling the provider", async () => {
    const { fetchMLBPlayerPropMarkets } = await importOdds();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchMLBPlayerPropMarkets("")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches per game, so a slate does not re-ask for the same game", async () => {
    const { fetchMLBPlayerPropMarkets } = await importOdds();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("player_props")) return bdlList([overUnder("fanduel", "hits", 0.5, -110, -110)]);
      return bdlList([playerRow(825, "Ozzie", "Albies")]);
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchMLBPlayerPropMarkets("5059654");
    const afterFirst = fetchMock.mock.calls.length;
    await fetchMLBPlayerPropMarkets("5059654");
    expect(fetchMock.mock.calls.length).toBe(afterFirst);
  });

  it("does not let one sport's player-id memo answer for the other", async () => {
    // Ids are only unique within a sport: BDL player 490 is a real NFL player and a real MLB player.
    // A shared profile cache would name one of them after the other.
    const odds = await importOdds();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/nfl/v1/players")) return bdlList([{ id: 490, first_name: "Nfl", last_name: "Player" }]);
        if (url.includes("/mlb/v1/players")) return bdlList([{ id: 490, first_name: "Mlb", last_name: "Player" }]);
        return bdlList([]);
      })
    );

    const nfl = await odds.resolveNFLPlayerProfiles([490]);
    const mlb = await odds.resolveMLBPlayerProfiles([490]);
    expect(nfl.get(490)?.name).toBe("Nfl Player");
    expect(mlb.get(490)?.name).toBe("Mlb Player");
  });
});
