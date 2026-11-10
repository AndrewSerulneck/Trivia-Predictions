import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import oddsFixture from "@/tests/fixtures/pickem-ncaaf/odds-2026-10-31.json";
import saturday from "@/tests/fixtures/pickem-ncaaf/games-2026-10-24.json";
import liveSample from "@/tests/fixtures/pickem-ncaaf/games-2026-10-31-sample.json";

// Pick 'Em Phase 3 (docs/pickem-college-football-and-prize-plan.md): College Football spreads.
// The odds fixture is a real /ncaaf/v1/odds response captured 2026-10-31 (deeplinks removed) for
// that day's 43 FBS games. The database is an in-memory stand-in whose two RPCs follow the SQL in
// 20261031191250_pickem_college_football_spreads.sql (that SQL itself: npm run test:pickem-lines-sql).

vi.mock("server-only", () => ({}));

type MockRow = Record<string, unknown>;

const store = vi.hoisted(() => ({
  tables: {} as Record<string, MockRow[]>,
  fetchBallDontLieList: vi.fn(),
  collegeMode: "spread" as "spread" | "standard",
  collegeModeFails: false,
  collegeModeGate: null as Promise<void> | null,
  pickWindows: {} as Record<string, unknown>,
  tablesOpened: [] as string[],
  lockFails: false,
  freezeFails: false,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  checkPickLimit: vi.fn(
    (_params: unknown): Promise<{ ok: true } | { ok: false; message: string }> => Promise.resolve({ ok: true }),
  ),
}));

// The Pick 'Em Prize pick limit (Phase 4a) has its own tests (tests/lib.pickem-prizes.test.ts); here
// only that a new pick asks it and a side switch never does.
vi.mock("@/lib/pickemPrizeLimit", () => ({ checkPickEmPrizePickLimit: store.checkPickLimit }));

vi.mock("@/lib/balldontlie", () => ({ fetchBallDontLieList: store.fetchBallDontLieList }));

vi.mock("@/lib/venueGameSettings", () => ({
  DEFAULT_CFB_PICKEM_SCORING_MODE: "spread",
  getVenueNFLPickEmScoringMode: vi.fn(() => Promise.resolve("standard")),
  // The pick's one fresh settings read (away-mode plan B1): the college rule and the pick windows.
  // The list's DISPLAY read too (30 s cache, B2), which is where the gate holds it.
  getVenueGameSettings: vi.fn((venueId: string) =>
    store.collegeModeGate
      ? store.collegeModeGate.then(() => ({
          venueId,
          nflPickEmScoringMode: "standard",
          cfbPickEmScoringMode: store.collegeMode,
          pickWindows: store.pickWindows,
          createdAt: null,
          updatedAt: null,
        }))
      : store.collegeModeFails
      ? Promise.reject(new Error("settings down"))
      : Promise.resolve({
          venueId,
          nflPickEmScoringMode: "standard",
          cfbPickEmScoringMode: store.collegeMode,
          pickWindows: store.pickWindows,
          createdAt: null,
          updatedAt: null,
        })
  ),
  getVenueCollegeFootballPickEmScoringMode: vi.fn(() =>
    store.collegeModeGate
      ? store.collegeModeGate.then(() => store.collegeMode)
      : store.collegeModeFails ? Promise.reject(new Error("settings down")) : Promise.resolve(store.collegeMode)
  ),
}));

vi.mock("@/lib/pickemPoints", () => ({
  PICKEM_POINTS_PER_CORRECT_PICK: 10,
  payPickEmPoints: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/supabaseAdmin", () => {
  const nowIso = () => new Date().toISOString();
  const createBuilder = (table: string) => {
    const filters: Array<(row: MockRow) => boolean> = [];
    let patch: MockRow | null = null;
    let insertRows: MockRow[] | null = null;
    let deleting = false;
    const currentRows = () => (store.tables[table] ??= []);
    const filteredRows = () => currentRows().filter((row) => filters.every((filter) => filter(row)));
    const run = (): { data: MockRow[]; error: null } => {
      if (insertRows) {
        const rows = insertRows.map((row, index) => ({ id: `new-${currentRows().length + index}`, created_at: nowIso(), updated_at: nowIso(), ...row }));
        currentRows().push(...rows);
        return { data: rows, error: null };
      }
      if (deleting) {
        const rows = filteredRows();
        store.tables[table] = currentRows().filter((row) => !rows.includes(row));
        return { data: rows, error: null };
      }
      if (patch) {
        const rows = filteredRows();
        for (const row of rows) Object.assign(row, patch);
        return { data: rows, error: null };
      }
      return { data: filteredRows(), error: null };
    };
    const compare = (column: string, test: (a: string, b: string) => boolean) => (value: unknown) => {
      filters.push((row) => test(String(row[column] ?? ""), String(value ?? "")));
      return builder;
    };
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      },
      neq: (column: string, value: unknown) => {
        filters.push((row) => row[column] !== value);
        return builder;
      },
      is: (column: string, value: unknown) => {
        filters.push((row) => (row[column] ?? null) === value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      lte: (column: string, value: unknown) => compare(column, (a, b) => a <= b)(value),
      gte: (column: string, value: unknown) => compare(column, (a, b) => a >= b)(value),
      order: () => builder,
      limit: () => builder,
      returns: () => builder,
      update: (value: MockRow) => {
        patch = value;
        return builder;
      },
      delete: () => {
        deleting = true;
        return builder;
      },
      insert: (value: MockRow | MockRow[]) => {
        insertRows = Array.isArray(value) ? value : [value];
        return builder;
      },
      maybeSingle: () => Promise.resolve({ data: run().data[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: run().data[0] ?? null, error: null }),
      then: (
        onfulfilled?: ((value: { data: MockRow[]; error: null }) => unknown) | null,
        onrejected?: ((reason: unknown) => unknown) | null
      ) => Promise.resolve(run()).then(onfulfilled, onrejected),
    };
    return builder;
  };

  // The two line RPCs, as the migration writes them.
  const rpc = (name: string, args: Record<string, unknown>) => {
    store.rpcCalls.push({ name, args });
    const lines = (store.tables.pickem_game_lines ??= []);
    const nowMs = Date.now();
    if (name === "upsert_pickem_game_lines") {
      const written: MockRow[] = [];
      for (const input of args.p_rows as MockRow[]) {
        if (Date.parse(String(input.starts_at)) <= nowMs) continue;
        const existing = lines.find((row) => row.sport_key === input.sport_key && row.game_id === input.game_id);
        if (existing) {
          if (existing.locked_at || Date.parse(String(existing.starts_at)) <= nowMs) continue;
          Object.assign(existing, {
            home_spread: input.home_spread,
            away_spread: input.away_spread,
            source_vendor: input.source_vendor,
            fetched_at: input.fetched_at,
            updated_at: nowIso(),
          });
          written.push(existing);
        } else {
          const row = { ...input, locked_at: null, updated_at: nowIso() };
          lines.push(row);
          written.push(row);
        }
      }
      return Promise.resolve({ data: written, error: null });
    }
    if (name === "lock_pickem_game_lines") {
      if (store.lockFails) return Promise.resolve({ data: null, error: { message: "function missing" } });
      const ids = args.p_game_ids as string[];
      const rows = lines.filter((row) => row.sport_key === args.p_sport_key && ids.includes(String(row.game_id)));
      for (const row of rows) {
        if (!row.locked_at && Date.parse(String(row.starts_at)) <= nowMs) row.locked_at = row.starts_at;
      }
      return Promise.resolve({ data: rows, error: null });
    }
    // B3's insert-once freeze, as 20261110014242_pickem_venue_frozen_lines.sql writes it.
    if (name === "freeze_pickem_venue_lines") {
      if (store.freezeFails) return Promise.resolve({ data: null, error: { message: "freeze down" } });
      const frozen = (store.tables.pickem_venue_frozen_lines ??= []);
      const inputs = args.p_rows as MockRow[];
      for (const input of inputs) {
        if (Date.parse(String(input.starts_at)) <= nowMs) continue;
        const has = frozen.some((row) => row.venue_id === args.p_venue_id && row.sport_key === input.sport_key && row.game_id === input.game_id);
        if (!has) frozen.push({ venue_id: args.p_venue_id, ...input, frozen_at: nowIso() });
      }
      const data = frozen.filter(
        (row) => row.venue_id === args.p_venue_id && inputs.some((input) => input.sport_key === row.sport_key && input.game_id === row.game_id)
      );
      return Promise.resolve({ data, error: null });
    }
    return Promise.resolve({ data: [], error: null });
  };

  return { supabaseAdmin: { from: (table: string) => {
        store.tablesOpened.push(table);
        return createBuilder(table);
      },
      rpc } };
});

import { bestSpreadLinesByGame, formatSpreadLine, type BDLSpreadOddsRow } from "@/lib/spreadLines";
import {
  COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS,
  COLLEGE_FOOTBALL_SPREAD_COPY,
  collegeFootballSpreadLineGate,
} from "@/lib/pickemCollegeFootball";
import { PICKEM_LINE_REFRESH_MS, resetPickEmLineFetchMemo } from "@/lib/pickemGameLines";
import {
  clearCollegeScoringModeDisplayCache,
  clearPickEmPick,
  listPickEmGames,
  settlePendingPickEmPicks,
  submitPickEmPick,
} from "@/lib/pickem";
import { isPickEmPickWindowClosedError } from "@/lib/pickemPickWindowGate";

type Game = (typeof liveSample)[number];
const odds = oddsFixture.odds as BDLSpreadOddsRow[];
const EASTERN = 240; // getTimezoneOffset() in EDT
const ECU_TEMPLE = 457403; // pre, 19:00Z; FanDuel ECU -5.5
const USF_UAB = 457404; // 16:00Z; FanDuel USF -17.5
const ODU_MARSHALL = 458445; // 17:00Z; given no odds below = "Line coming soon"

const oddsCalls = () => store.fetchBallDontLieList.mock.calls.filter(([path]) => path === "/ncaaf/v1/odds");
const rpcNamed = (name: string) => store.rpcCalls.filter((call) => call.name === name);

function mockProvider(params: { games: unknown[]; oddsRows: BDLSpreadOddsRow[] }) {
  store.fetchBallDontLieList.mockImplementation((path: string, query: URLSearchParams) => {
    if (path === "/ncaaf/v1/odds") {
      const ids = new Set(query.getAll("game_ids[]").map(Number));
      return Promise.resolve(params.oddsRows.filter((row) => ids.has(Number(row.game_id))));
    }
    if (path === "/ncaaf/v1/games") {
      return Promise.resolve(query.get("dates[]") === "2026-10-31" ? params.games : []);
    }
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  clearCollegeScoringModeDisplayCache();
  vi.clearAllMocks();
  resetPickEmLineFetchMemo();
  store.tables = { pickem_picks: [], pickem_game_lines: [], notifications: [], pickem_venue_frozen_lines: [] };
  store.collegeMode = "spread";
  store.collegeModeFails = false;
  store.collegeModeGate = null;
  store.pickWindows = {};
  store.tablesOpened = [];
  store.lockFails = false;
  store.freezeFails = false;
  store.rpcCalls = [];
  store.checkPickLimit.mockResolvedValue({ ok: true });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-31T15:00:00.000Z")); // 11 am Eastern, before every kickoff
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the shared spread-line rule (lib/spreadLines.ts)", () => {
  it("keeps one line per game from the captured odds: FanDuel first", () => {
    const best = bestSpreadLinesByGame(odds, [String(ECU_TEMPLE), String(ODU_MARSHALL)]);
    expect(best.get(String(ECU_TEMPLE))).toMatchObject({ vendor: "fanduel", homeSpread: -5.5, awaySpread: 5.5 });
    expect(best.get(String(ODU_MARSHALL))).toMatchObject({ vendor: "fanduel", homeSpread: 17.5, awaySpread: -17.5 });
    // Ids not asked for are dropped; a row with no spread is never a line.
    expect(best.has(String(USF_UAB))).toBe(false);
    expect(bestSpreadLinesByGame([{ game_id: 1, vendor: "fanduel", spread_home_value: null, spread_away_value: null }], ["1"]).size).toBe(0);
  });

  it("falls back to the next sportsbook when FanDuel has no line", () => {
    const rows = odds.filter((row) => Number(row.game_id) === ECU_TEMPLE && row.vendor !== "fanduel");
    expect(bestSpreadLinesByGame(rows, [String(ECU_TEMPLE)]).get(String(ECU_TEMPLE))).toMatchObject({ vendor: "draftkings", homeSpread: -4.5 });
  });

  it("formats lines with a real minus sign, and PK for zero", () => {
    expect(formatSpreadLine(-13.5)).toBe("−13.5");
    expect(formatSpreadLine(7)).toBe("+7");
    expect(formatSpreadLine(0)).toBe("PK");
    expect(formatSpreadLine(null)).toBeNull();
  });

  it("is the one vendor rule: NFL Pick 'Em uses it and keeps no list of its own", () => {
    const nfl = readFileSync("lib/nflPickEm.ts", "utf8");
    expect(nfl).toContain('from "@/lib/spreadLines"');
    expect(nfl).not.toMatch(/"fanduel"/);
    const lines = readFileSync("lib/pickemGameLines.ts", "utf8");
    expect(lines).toContain('from "@/lib/spreadLines"');
    expect(lines).not.toMatch(/"fanduel"/);
  });
});

describe("collegeFootballSpreadLineGate", () => {
  const kickoff = Date.parse("2026-10-24T19:30:00.000Z");
  it("grades with a locked line, waits without one, cancels 48 hours after kickoff", () => {
    expect(collegeFootballSpreadLineGate({ hasLockedLine: true, startsAtMs: kickoff, nowMs: kickoff + 4 * 3600_000 })).toBe("grade");
    expect(collegeFootballSpreadLineGate({ hasLockedLine: false, startsAtMs: kickoff, nowMs: kickoff + 4 * 3600_000 })).toBe("wait");
    expect(collegeFootballSpreadLineGate({ hasLockedLine: false, startsAtMs: kickoff, nowMs: kickoff + COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS })).toBe("cancel");
  });
});

describe("the College Football games list in spread mode", () => {
  const oddsWithoutOdu = odds.filter((row) => Number(row.game_id) !== ODU_MARSHALL);
  const list = () => listPickEmGames({ sportSlug: "ncaaf", date: "2026-10-31", tzOffsetMinutes: EASTERN, venueId: "venue-1" });

  it("shows each game's line, and 'Line coming soon' where there is none yet", async () => {
    mockProvider({ games: liveSample, oddsRows: oddsWithoutOdu });

    const result = await list();

    expect(result.collegeScoring).toEqual({ mode: "spread", linesUnavailable: false });
    const ecu = result.games.find((game) => game.id.startsWith(`${ECU_TEMPLE}__`));
    expect(ecu).toMatchObject({ scoringMode: "spread", homeSpread: -5.5, awaySpread: 5.5, lineComingSoon: false });
    const odu = result.games.find((game) => game.id.startsWith(`${ODU_MARSHALL}__`));
    expect(odu).toMatchObject({ scoringMode: "spread", homeSpread: null, awaySpread: null, lineComingSoon: true });

    // One odds call for the day's games, then one write of the lines found (only games not started).
    expect(oddsCalls()).toHaveLength(1);
    const written = rpcNamed("upsert_pickem_game_lines");
    expect(written).toHaveLength(1);
    expect((written[0].args.p_rows as MockRow[]).map((row) => row.provider_game_id).sort()).toEqual(
      [String(ECU_TEMPLE), String(USF_UAB)].sort()
    );
    expect(store.tables.pickem_game_lines.find((row) => row.provider_game_id === String(ECU_TEMPLE))).toMatchObject({
      sport_key: "americanfootball_ncaaf",
      source_vendor: "fanduel",
      home_spread: -5.5,
      locked_at: null,
    });
  });

  it("asks the provider at most once per 10 minutes", async () => {
    mockProvider({ games: liveSample, oddsRows: oddsWithoutOdu });
    await list();
    await list();
    vi.setSystemTime(Date.now() + PICKEM_LINE_REFRESH_MS - 1000);
    await list();
    expect(oddsCalls()).toHaveLength(1);

    vi.setSystemTime(Date.now() + 2000);
    await list();
    expect(oddsCalls()).toHaveLength(2);
  });

  it("does not ask the provider while every game still to start has a fresh line (shared across servers)", async () => {
    mockProvider({ games: liveSample, oddsRows: odds });
    await list();
    expect(oddsCalls()).toHaveLength(1);
    resetPickEmLineFetchMemo(); // another server instance
    await list();
    expect(oddsCalls()).toHaveLength(1);
  });

  it("never fetches or writes a line for a game that has started; the saved line stays as it was", async () => {
    mockProvider({ games: liveSample, oddsRows: odds });
    await list();
    vi.setSystemTime(new Date("2026-10-31T19:30:00.000Z")); // every game has kicked off
    store.rpcCalls = [];

    const result = await list();

    expect(oddsCalls()).toHaveLength(1);
    expect(rpcNamed("upsert_pickem_game_lines")).toHaveLength(0);
    const ecu = result.games.find((game) => game.id.startsWith(`${ECU_TEMPLE}__`));
    expect(ecu).toMatchObject({ isLocked: true, homeSpread: -5.5, lineComingSoon: false });
    const odu = result.games.find((game) => game.id.startsWith(`${ODU_MARSHALL}__`));
    expect(odu).toMatchObject({ isLocked: true, lineComingSoon: false });
  });

  it("in pick-the-winner mode shows no lines and never asks for odds", async () => {
    store.collegeMode = "standard";
    mockProvider({ games: liveSample, oddsRows: odds });

    const result = await list();

    expect(result.collegeScoring?.mode).toBe("standard");
    expect(result.games.every((game) => game.scoringMode === "standard" && game.homeSpread === undefined)).toBe(true);
    expect(oddsCalls()).toHaveLength(0);
  });

  it("a provider failure keeps the games and reports lines unavailable", async () => {
    store.fetchBallDontLieList.mockImplementation((path: string, query: URLSearchParams) =>
      path === "/ncaaf/v1/odds"
        ? Promise.reject(new Error("provider down"))
        : Promise.resolve(query.get("dates[]") === "2026-10-31" ? liveSample : [])
    );

    const result = await list();

    expect(result.games.length).toBeGreaterThan(0);
    expect(result.collegeScoring).toEqual({ mode: "spread", linesUnavailable: true });
    expect(result.games.every((game) => game.lineComingSoon === true)).toBe(true);
  });
});

describe("the games list display reads (7.5.4)", () => {
  const list = () => listPickEmGames({ sportSlug: "ncaaf", date: "2026-10-31", tzOffsetMinutes: EASTERN, venueId: "venue-1" });

  it("reads the venue's college rule once within 30 seconds, and again after", async () => {
    // One cached settings read serves the college rule and the pick windows (B2).
    const { getVenueGameSettings } = await import("@/lib/venueGameSettings");
    const read = vi.mocked(getVenueGameSettings);
    mockProvider({ games: liveSample, oddsRows: odds });
    read.mockClear();
    await list();
    await list();
    expect(read).toHaveBeenCalledTimes(1);

    store.collegeMode = "standard"; // the partner switched; the display catches up after the cache
    vi.setSystemTime(new Date("2026-10-31T15:00:31.000Z"));
    const later = await list();
    expect(read).toHaveBeenCalledTimes(2);
    expect(later.collegeScoring?.mode).toBe("standard");
  });

  it("starts today's summary while the lines step is still waiting (the reads run together)", async () => {
    mockProvider({ games: liveSample, oddsRows: odds });
    let release: () => void = () => {};
    store.collegeModeGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = listPickEmGames({ sportSlug: "ncaaf", date: "2026-10-31", tzOffsetMinutes: EASTERN, venueId: "venue-1", userId: "user-1" });
    await vi.waitFor(() => expect(store.tablesOpened).toContain("pickem_picks"));
    // The rule read has not answered, yet the summary's picks read is already open.
    const opened = store.tablesOpened.filter((name) => name === "pickem_picks").length;
    expect(opened).toBeGreaterThanOrEqual(2); // the list's own picks read + today's summary
    release();
    const result = await pending;
    expect(result.collegeScoring?.mode).toBe("spread");
    expect(result.games.length).toBeGreaterThan(0);
  });

  it("does not cache a failed rule read", async () => {
    mockProvider({ games: liveSample, oddsRows: odds });
    store.collegeModeFails = true;
    expect((await list()).collegeScoring?.mode).toBe("spread");
    store.collegeModeFails = false;
    store.collegeMode = "standard";
    expect((await list()).collegeScoring?.mode).toBe("standard");
  });
});

describe("making a college pick stamps the venue's rule", () => {
  const ecuGame = (liveSample as Game[]).find((game) => game.id === ECU_TEMPLE)!;
  const submit = (pickTeam = ecuGame.home_team.full_name) =>
    listPickEmGames({ sportSlug: "ncaaf", date: "2026-10-31", tzOffsetMinutes: EASTERN, skipLines: true }).then((list) => {
      const game = list.games.find((entry) => entry.id.startsWith(`${ECU_TEMPLE}__`))!;
      return submitPickEmPick({
        userId: "user-1",
        venueId: "venue-1",
        sportSlug: "ncaaf",
        gameId: game.id,
        pickTeam,
        date: "2026-10-31",
        tzOffsetMinutes: EASTERN,
      });
    });

  it("refuses a spread pick while the game has no line", async () => {
    mockProvider({ games: liveSample, oddsRows: [] });
    await expect(submit()).rejects.toThrow(COLLEGE_FOOTBALL_SPREAD_COPY.noLineYet);
    expect(store.tables.pickem_picks).toHaveLength(0);
    // The pick check reads the saved line; it never asks the provider.
    expect(oddsCalls()).toHaveLength(0);
  });

  it("stamps 'spread' once the game has a line", async () => {
    mockProvider({ games: liveSample, oddsRows: odds });
    await listPickEmGames({ sportSlug: "ncaaf", date: "2026-10-31", tzOffsetMinutes: EASTERN, venueId: "venue-1" });

    const pick = await submit();

    expect(pick.scoringMode).toBe("spread");
    expect(store.tables.pickem_picks[0]).toMatchObject({ scoring_mode: "spread", sport_slug: "ncaaf" });
  });

  it("stamps 'standard' in pick-the-winner mode without needing a line", async () => {
    store.collegeMode = "standard";
    mockProvider({ games: liveSample, oddsRows: [] });

    const pick = await submit();

    expect(pick.scoringMode).toBe("standard");
  });

  it("switching sides keeps the rule the pick was made under", async () => {
    store.collegeMode = "standard";
    mockProvider({ games: liveSample, oddsRows: [] });
    await submit();
    store.collegeMode = "spread"; // the partner switched to spread after the pick

    const changed = await submit(ecuGame.visitor_team.full_name);

    expect(changed).toMatchObject({ scoringMode: "standard", selectedSide: "away" });
  });

  it("a new pick asks the Pick 'Em Prize limit; a refusal saves nothing; switching sides never asks", async () => {
    store.collegeMode = "standard";
    mockProvider({ games: liveSample, oddsRows: [] });
    store.checkPickLimit.mockResolvedValueOnce({ ok: false, message: "you've already used all 20" });
    await expect(submit()).rejects.toThrow("you've already used all 20");
    expect(store.tables.pickem_picks).toHaveLength(0);

    await submit();
    expect(store.checkPickLimit).toHaveBeenCalledTimes(2);
    expect(store.checkPickLimit.mock.calls[1][0]).toMatchObject({
      userId: "user-1",
      venueId: "venue-1",
      game: { sportSlug: "ncaaf", sportKey: "americanfootball_ncaaf" },
    });

    store.checkPickLimit.mockResolvedValue({ ok: false, message: "you've already used all 20" });
    const changed = await submit(ecuGame.visitor_team.full_name);
    expect(changed.selectedSide).toBe("away");
    expect(store.checkPickLimit).toHaveBeenCalledTimes(2);
  });

  it("refuses rather than guesses when the venue's rule can't be read", async () => {
    store.collegeModeFails = true;
    mockProvider({ games: liveSample, oddsRows: odds });
    await expect(submit()).rejects.toThrow("couldn't load this bar's Pick 'Em rules");
    expect(store.tables.pickem_picks).toHaveLength(0);
  });

  it("reads the bar's settings once per pick, fresh, for both the rule and the window", async () => {
    const settingsModule = await import("@/lib/venueGameSettings");
    store.collegeMode = "standard";
    mockProvider({ games: liveSample, oddsRows: [] });
    vi.mocked(settingsModule.getVenueGameSettings).mockClear();
    vi.mocked(settingsModule.getVenueCollegeFootballPickEmScoringMode).mockClear();

    await submit();

    expect(settingsModule.getVenueGameSettings).toHaveBeenCalledTimes(1);
    expect(settingsModule.getVenueCollegeFootballPickEmScoringMode).not.toHaveBeenCalled();
  });
});

describe("a College Football pick window (away-mode plan B1)", () => {
  // Saturday 2026-10-31, 11 am Eastern. ECU-Temple kicks off 3 pm Eastern the same day.
  const ecuGame = (liveSample as Game[]).find((game) => game.id === ECU_TEMPLE)!;
  const ecuGameId = () =>
    listPickEmGames({ sportSlug: "ncaaf", date: "2026-10-31", tzOffsetMinutes: EASTERN, skipLines: true }).then(
      (list) => list.games.find((entry) => entry.id.startsWith(`${ECU_TEMPLE}__`))!.id
    );
  const submit = async (pickTeam = ecuGame.home_team.full_name) =>
    submitPickEmPick({
      userId: "user-1",
      venueId: "venue-1",
      sportSlug: "ncaaf",
      gameId: await ecuGameId(),
      pickTeam,
      date: "2026-10-31",
      tzOffsetMinutes: EASTERN,
    });
  const monToWed = { ncaaf: { openDay: "mon", openTime: "00:00", closeDay: "wed", closeTime: "23:59" } };
  const thuToSat = { ncaaf: { openDay: "thu", openTime: "00:00", closeDay: "sat", closeTime: "23:59" } };

  beforeEach(() => {
    store.collegeMode = "standard";
    mockProvider({ games: liveSample, oddsRows: [] });
  });

  it("refuses a pick once the game's window has closed", async () => {
    store.pickWindows = monToWed; // Saturday's game was covered by Mon-Wed; it is closed now
    const refusal = await submit().catch((error: unknown) => error);
    expect(isPickEmPickWindowClosedError(refusal)).toBe(true);
    expect((refusal as Error).message).toBe("Picks closed.");
    expect(store.tables.pickem_picks).toHaveLength(0);
  });

  it("allows a pick inside the window, and no window at all is today's behaviour", async () => {
    store.pickWindows = thuToSat;
    await expect(submit()).resolves.toMatchObject({ selectedSide: "home" });

    store.tables.pickem_picks = [];
    store.pickWindows = {};
    await expect(submit()).resolves.toMatchObject({ selectedSide: "home" });
  });

  it("changing or clearing a pick follows the same window", async () => {
    store.pickWindows = thuToSat;
    await submit();
    store.pickWindows = monToWed; // the partner moved the window; this game's is now closed

    await expect(submit(ecuGame.visitor_team.full_name)).rejects.toThrow("Picks closed.");
    await expect(clearPickEmPick({ userId: "user-1", gameId: await ecuGameId() })).rejects.toThrow("Picks closed.");
    expect(store.tables.pickem_picks).toHaveLength(1);
    expect(store.tables.pickem_picks[0]).toMatchObject({ selected_side: "home" });

    store.pickWindows = thuToSat;
    await expect(clearPickEmPick({ userId: "user-1", gameId: await ecuGameId() })).resolves.toEqual({ cleared: true });
  });

  it("another sport's window doesn't touch College Football", async () => {
    store.pickWindows = { nba: monToWed.ncaaf, nfl: monToWed.ncaaf };
    await expect(submit()).resolves.toMatchObject({ selectedSide: "home" });
  });
});

describe("pick ahead (away-mode plan B2)", () => {
  // Thursday 2026-10-29, noon Eastern: Saturday's games are two days ahead.
  const THURSDAY_NOON = "2026-10-29T16:00:00.000Z";
  const ecuGame = (liveSample as Game[]).find((game) => game.id === ECU_TEMPLE)!;
  const saturday = (venueId?: string) =>
    listPickEmGames({ sportSlug: "ncaaf", date: "2026-10-31", tzOffsetMinutes: EASTERN, venueId, ...(venueId ? {} : { skipLines: true }) });
  const submitSaturday = async () =>
    submitPickEmPick({
      userId: "user-1",
      venueId: "venue-1",
      sportSlug: "ncaaf",
      gameId: (await saturday()).games.find((entry) => entry.id.startsWith(`${ECU_TEMPLE}__`))!.id,
      pickTeam: ecuGame.home_team.full_name,
      date: "2026-10-31",
      tzOffsetMinutes: EASTERN,
    });
  const monToWed = { ncaaf: { openDay: "mon", openTime: "00:00", closeDay: "wed", closeTime: "23:59" } };
  const thuToSat = { ncaaf: { openDay: "thu", openTime: "00:00", closeDay: "sat", closeTime: "23:59" } };

  beforeEach(() => {
    store.collegeMode = "standard";
    mockProvider({ games: liveSample, oddsRows: [] });
    vi.setSystemTime(new Date(THURSDAY_NOON));
  });

  it("without a window a sport stays today-only: no reach, no line, and a Saturday pick is refused", async () => {
    const list = await saturday("venue-1");
    expect(list.pickAheadThrough).toBeUndefined();
    expect(list.pickWindow).toBeUndefined();
    expect(list.games.every((game) => game.pickWindowMessage === undefined)).toBe(true);
    await expect(submitSaturday()).rejects.toThrow("You can only place picks for today.");
  });

  it("an open window lets players pick Saturday's games on Thursday, and says when picks close", async () => {
    store.pickWindows = thuToSat;
    const list = await saturday("venue-1");
    expect(list.pickWindow).toMatchObject({ isOpen: true, line: "Picks close Sat 11:59 PM" });
    // Open now: the reach stops where this window's games end (next Thu 12:00 AM EST opens the next one).
    // The list maps days with the phone's CURRENT offset (EDT, 240) and clocks fall back on Nov 1, so that
    // instant (Thu 05:00Z) reads as Thu 1 AM: the reach is Thu Nov 5, whose games show "Picks open …".
    expect(list.pickAheadThrough).toBe("2026-11-05");
    expect(list.games.every((game) => game.pickWindowMessage === undefined)).toBe(true);

    await expect(submitSaturday()).resolves.toMatchObject({ selectedSide: "home" });
  });

  it("a shut window marks the games, reaches a full week, and still refuses the pick", async () => {
    store.pickWindows = monToWed; // Saturday's window was Mon-Wed: closed on Thursday
    const list = await saturday("venue-1");
    expect(list.pickWindow).toMatchObject({ isOpen: false, line: "Picks closed" });
    expect(list.pickAheadThrough).toBe("2026-11-05");
    const notStarted = list.games.filter((game) => !game.isLocked);
    expect(notStarted.length).toBeGreaterThan(0);
    expect(notStarted.every((game) => game.pickWindowMessage === "Picks closed")).toBe(true);

    const refusal = await submitSaturday().catch((error: unknown) => error);
    expect(isPickEmPickWindowClosedError(refusal)).toBe(true);
  });

  it("before a window opens, the games say when it does", async () => {
    store.pickWindows = { ncaaf: { openDay: "fri", openTime: "18:00", closeDay: "sat", closeTime: "12:00" } };
    vi.setSystemTime(new Date("2026-10-30T16:00:00.000Z")); // Fri noon: opens at 6 PM today
    const list = await saturday("venue-1");
    expect(list.pickWindow).toMatchObject({ isOpen: false, line: "Picks open Fri 6:00 PM" });
  });

  it("the window rides the list's one cached settings read, and the pick check (skipLines) adds none", async () => {
    const settingsModule = await import("@/lib/venueGameSettings");
    store.pickWindows = thuToSat;
    vi.mocked(settingsModule.getVenueGameSettings).mockClear();
    await saturday("venue-1");
    await saturday("venue-1");
    expect(settingsModule.getVenueGameSettings).toHaveBeenCalledTimes(1);
    const check = await saturday();
    expect(check.pickWindow).toBeUndefined();
    expect(settingsModule.getVenueGameSettings).toHaveBeenCalledTimes(1);
  });

  it("an empty future day makes no debug probe calls to the provider", async () => {
    store.pickWindows = thuToSat;
    const before = store.fetchBallDontLieList.mock.calls.length;
    const list = await listPickEmGames({ sportSlug: "ncaaf", date: "2026-11-02", tzOffsetMinutes: EASTERN, venueId: "venue-1" });
    expect(list.games).toHaveLength(0);
    expect(list.debug).toBeUndefined();
    expect(store.fetchBallDontLieList.mock.calls.length - before).toBeGreaterThan(0); // the day's own games read
  });
});

describe("pick ahead is decided before the provider call (away-mode plan R9)", () => {
  const THURSDAY_NOON = "2026-10-29T16:00:00.000Z"; // Saturday is two days ahead
  const thuToSat = { ncaaf: { openDay: "thu", openTime: "00:00", closeDay: "sat", closeTime: "23:59" } };
  const clamped = (venueId = "venue-1") =>
    listPickEmGames({ sportSlug: "ncaaf", date: "2026-10-31", tzOffsetMinutes: EASTERN, venueId, clampToPickAhead: true });

  beforeEach(() => {
    store.collegeMode = "standard";
    mockProvider({ games: liveSample, oddsRows: [] });
    vi.setSystemTime(new Date(THURSDAY_NOON));
  });

  it("a sport with no window and a future date: the provider is asked for today only, and date says so", async () => {
    const list = await clamped();
    expect(list.date).toBe("2026-10-29");
    expect(JSON.stringify(store.fetchBallDontLieList.mock.calls)).not.toContain("2026-10-31");
  });

  it("a sport with a window, within reach: the future day is served", async () => {
    store.pickWindows = thuToSat;
    const list = await clamped();
    expect(list.date).toBe("2026-10-31");
    expect(list.games.length).toBeGreaterThan(0);
  });

  it("a day past the reach is served as today", async () => {
    store.pickWindows = thuToSat;
    const list = await listPickEmGames({
      sportSlug: "ncaaf",
      date: "2026-11-06",
      tzOffsetMinutes: EASTERN,
      venueId: "venue-1",
      clampToPickAhead: true,
    });
    expect(list.date).toBe("2026-10-29");
  });

  it("without the flag (the pick check) a future day is never clamped", async () => {
    const list = await listPickEmGames({ sportSlug: "ncaaf", date: "2026-10-31", tzOffsetMinutes: EASTERN, skipLines: true });
    expect(list.date).toBe("2026-10-31");
    expect(list.games.length).toBeGreaterThan(0);
  });

  it("only the games route sets the flag", () => {
    expect(readFileSync("app/api/pickem/games/route.ts", "utf8")).toContain("clampToPickAhead: true");
    const pickem = readFileSync("lib/pickem.ts", "utf8");
    expect(pickem).not.toMatch(/skipLines: true,\s*clampToPickAhead/);
    expect(pickem.match(/clampToPickAhead: true/g)).toBeNull();
  });
});

describe("frozen lines at a bar with a pick window (away-mode plan B3)", () => {
  // Thursday 2026-10-29, noon Eastern; Saturday's games are covered by a Thu–Sat window, open now.
  const THURSDAY_NOON = "2026-10-29T16:00:00.000Z";
  const thuToSat = { ncaaf: { openDay: "thu", openTime: "00:00", closeDay: "sat", closeTime: "23:59" } };
  const ecuGame = (liveSample as Game[]).find((game) => game.id === ECU_TEMPLE)!;
  const saturday = (venueId?: string) =>
    listPickEmGames({ sportSlug: "ncaaf", date: "2026-10-31", tzOffsetMinutes: EASTERN, venueId });
  const ecuOf = (games: Awaited<ReturnType<typeof saturday>>["games"]) =>
    games.find((game) => game.id.startsWith(`${ECU_TEMPLE}__`))!;
  const submitEcu = async (venueId = "venue-1", pickTeam = ecuGame.home_team.full_name) =>
    submitPickEmPick({
      userId: "user-1",
      venueId,
      sportSlug: "ncaaf",
      gameId: ecuOf((await listPickEmGames({ sportSlug: "ncaaf", date: "2026-10-31", tzOffsetMinutes: EASTERN, skipLines: true })).games).id,
      pickTeam,
      date: "2026-10-31",
      tzOffsetMinutes: EASTERN,
    });
  const frozenRows = () => store.tables.pickem_venue_frozen_lines;
  const moveGlobalEcuLine = (homeSpread: number) => {
    const row = store.tables.pickem_game_lines.find((entry) => entry.provider_game_id === String(ECU_TEMPLE))!;
    Object.assign(row, { home_spread: homeSpread, away_spread: -homeSpread, updated_at: new Date().toISOString() });
  };

  beforeEach(() => {
    mockProvider({ games: liveSample, oddsRows: odds });
    vi.setSystemTime(new Date(THURSDAY_NOON));
    store.pickWindows = thuToSat;
  });

  it("freezes each line the first time it is shown inside the open window; a later move never shows", async () => {
    const first = await saturday("venue-1");
    expect(ecuOf(first.games)).toMatchObject({ homeSpread: -5.5, awaySpread: 5.5 });
    expect(frozenRows().find((row) => String(row.game_id).startsWith(`${ECU_TEMPLE}__`))).toMatchObject({
      venue_id: "venue-1",
      sport_key: "americanfootball_ncaaf",
      home_spread: -5.5,
      source_vendor: "fanduel",
    });
    expect(rpcNamed("freeze_pickem_venue_lines")).toHaveLength(1);

    moveGlobalEcuLine(-9);
    const second = await saturday("venue-1");
    expect(ecuOf(second.games)).toMatchObject({ homeSpread: -5.5, awaySpread: 5.5 });
    // Everything shown is frozen already: no second write.
    expect(rpcNamed("freeze_pickem_venue_lines")).toHaveLength(1);

    // Another bar freezes its own line when it first shows the game.
    expect(ecuOf((await saturday("venue-2")).games)).toMatchObject({ homeSpread: -9 });
  });

  it("a pick records the bar's frozen line, freezing it if the list didn't", async () => {
    await saturday(); // the global lines only (no venue, no window): nothing frozen
    expect(frozenRows()).toHaveLength(0);

    await submitEcu();
    expect(store.tables.pickem_picks[0]).toMatchObject({ scoring_mode: "spread", home_spread: -5.5, away_spread: 5.5 });
    expect(frozenRows()).toHaveLength(1);

    // The global line moves; switching sides keeps the frozen number, and asks no freeze (R8).
    moveGlobalEcuLine(-9);
    const freezes = rpcNamed("freeze_pickem_venue_lines").length;
    await submitEcu("venue-1", ecuGame.visitor_team.full_name);
    expect(rpcNamed("freeze_pickem_venue_lines")).toHaveLength(freezes);
    expect(store.tables.pickem_picks).toHaveLength(1);
    expect(store.tables.pickem_picks[0]).toMatchObject({ selected_side: "away", home_spread: -5.5, away_spread: 5.5 });

    // The player's own pending pick shows the line it recorded.
    const list = await listPickEmGames({ sportSlug: "ncaaf", date: "2026-10-31", tzOffsetMinutes: EASTERN, venueId: "venue-1", userId: "user-1" });
    expect(ecuOf(list.games)).toMatchObject({ homeSpread: -5.5 });
  });

  it("a game whose window hasn't opened shows the global line and freezes nothing", async () => {
    store.pickWindows = { ncaaf: { openDay: "fri", openTime: "18:00", closeDay: "sat", closeTime: "23:59" } };
    const list = await saturday("venue-1");
    expect(ecuOf(list.games)).toMatchObject({ homeSpread: -5.5, pickWindowMessage: "Picks open Fri 6:00 PM" });
    expect(frozenRows()).toHaveLength(0);
    expect(rpcNamed("freeze_pickem_venue_lines")).toHaveLength(0);
  });

  it("without a window nothing is frozen or recorded (today's behaviour)", async () => {
    store.pickWindows = {};
    vi.setSystemTime(new Date("2026-10-31T15:00:00.000Z")); // Saturday: a today-only pick
    await saturday("venue-1");
    await submitEcu();
    expect(store.tables.pickem_picks[0]).toMatchObject({ scoring_mode: "spread" });
    expect(store.tables.pickem_picks[0].home_spread ?? null).toBeNull();
    expect(store.tables.pickem_picks[0].away_spread ?? null).toBeNull();
    expect(frozenRows()).toHaveLength(0);
    expect(rpcNamed("freeze_pickem_venue_lines")).toHaveLength(0);
  });

  it("a failed freeze keeps the list on the global lines and refuses the pick, saving nothing", async () => {
    store.freezeFails = true;
    const list = await saturday("venue-1");
    expect(list.collegeScoring).toEqual({ mode: "spread", linesUnavailable: true });
    expect(ecuOf(list.games)).toMatchObject({ homeSpread: -5.5 });

    await expect(submitEcu()).rejects.toThrow("We couldn't load this game's line. Please try again.");
    expect(store.tables.pickem_picks).toHaveLength(0);
  });

  describe("the line shown is the line the pick is graded by (away-mode plan R2)", () => {
    const forUser = (userId: string) =>
      listPickEmGames({ sportSlug: "ncaaf", date: "2026-10-31", tzOffsetMinutes: EASTERN, venueId: "venue-1", userId });
    // A pick made at 10 AM Saturday, before the partner turned the window on: no line on the row.
    const pickBeforeTheWindow = async () => {
      store.pickWindows = {};
      vi.setSystemTime(new Date("2026-10-31T15:00:00.000Z"));
      await saturday("venue-1"); // loads the global line (-5.5); nothing frozen without a window
      await submitEcu();
      expect(store.tables.pickem_picks[0].home_spread ?? null).toBeNull();
      expect(frozenRows()).toHaveLength(0);
      store.pickWindows = thuToSat;
      vi.setSystemTime(new Date("2026-10-31T15:01:00.000Z")); // past the 30 s Game Settings display cache
      await saturday("venue-1"); // the bar freezes ECU -5.5
      expect(frozenRows().find((row) => String(row.game_id).startsWith(`${ECU_TEMPLE}__`))).toMatchObject({ home_spread: -5.5 });
      moveGlobalEcuLine(-9);
    };

    it("a pick made before the window shows the global line settlement will use, never the frozen line", async () => {
      await pickBeforeTheWindow();
      expect(ecuOf((await forUser("user-1")).games)).toMatchObject({ homeSpread: -9, awaySpread: 9 });
      // Someone with no pick sees the bar's frozen line.
      expect(ecuOf((await forUser("user-2")).games)).toMatchObject({ homeSpread: -5.5, awaySpread: 5.5 });
    });

    // R8 (third review, finding 1): a pick's line is set when it is made; a side switch never changes it.
    it("switching sides keeps the pick on the global line: the update writes no line and freezes nothing (R8)", async () => {
      await pickBeforeTheWindow();
      const freezes = rpcNamed("freeze_pickem_venue_lines").length;
      await submitEcu("venue-1", ecuGame.visitor_team.full_name);
      expect(store.tables.pickem_picks).toHaveLength(1);
      expect(store.tables.pickem_picks[0]).toMatchObject({ selected_side: "away", scoring_mode: "spread" });
      expect(store.tables.pickem_picks[0].home_spread ?? null).toBeNull();
      expect(store.tables.pickem_picks[0].away_spread ?? null).toBeNull();
      expect(rpcNamed("freeze_pickem_venue_lines")).toHaveLength(freezes);
      // The number on screen doesn't jump: still the global line settlement grades it by.
      expect(ecuOf((await forUser("user-1")).games)).toMatchObject({ homeSpread: -9, awaySpread: 9 });
    });

    it("clearing a pick and making it again is a new pick: it takes the bar's frozen line (R8)", async () => {
      await pickBeforeTheWindow();
      const gameId = String(store.tables.pickem_picks[0].game_id);
      await expect(clearPickEmPick({ userId: "user-1", gameId })).resolves.toEqual({ cleared: true });
      // With the pick cleared, the list shows the frozen line...
      expect(ecuOf((await forUser("user-1")).games)).toMatchObject({ homeSpread: -5.5 });
      // ...and the new pick records it.
      await submitEcu("venue-1", ecuGame.visitor_team.full_name);
      expect(store.tables.pickem_picks[0]).toMatchObject({ selected_side: "away", home_spread: -5.5, away_spread: 5.5 });
      expect(ecuOf((await forUser("user-1")).games)).toMatchObject({ homeSpread: -5.5 });
    });

    it("a side switch with the settings read down keeps its stamp and the global line, freezing nothing (R8)", async () => {
      await pickBeforeTheWindow();
      const freezes = rpcNamed("freeze_pickem_venue_lines").length;
      store.collegeModeFails = true;
      await submitEcu("venue-1", ecuGame.visitor_team.full_name);
      expect(store.tables.pickem_picks[0]).toMatchObject({ selected_side: "away", scoring_mode: "spread" });
      expect(store.tables.pickem_picks[0].home_spread ?? null).toBeNull();
      expect(rpcNamed("freeze_pickem_venue_lines")).toHaveLength(freezes);
    });

    it("a graded pick shows the line it was graded by", async () => {
      await pickBeforeTheWindow();
      Object.assign(store.tables.pickem_picks[0], { status: "lost", home_spread: -7, away_spread: 7 });
      expect(ecuOf((await forUser("user-1")).games)).toMatchObject({ homeSpread: -7, awaySpread: 7 });
    });
  });

  it("pick-the-winner mode freezes nothing", async () => {
    store.collegeMode = "standard";
    await saturday("venue-1");
    await submitEcu();
    expect(store.tables.pickem_picks[0]).toMatchObject({ scoring_mode: "standard" });
    expect(store.tables.pickem_picks[0].home_spread ?? null).toBeNull();
    expect(rpcNamed("freeze_pickem_venue_lines")).toHaveLength(0);
  });
});

describe("settling college spread picks", () => {
  // Boston College 49 at Georgia Tech 27, final (Sat Oct 24). Home = Georgia Tech.
  type SatGame = (typeof saturday)[number];
  const game = (saturday as SatGame[]).find((entry) => entry.id === 457383)!;
  const gameId = `${game.id}__${game.date}__x__y`;
  const pick = (id: string, side: "home" | "away", scoringMode: "spread" | "standard" | null = "spread"): MockRow => ({
    id,
    user_id: `user-${id}`,
    venue_id: "venue-1",
    sport_slug: "ncaaf",
    sport_key: "americanfootball_ncaaf",
    league: "College Football",
    game_id: gameId,
    home_team_id: String(game.home_team.id),
    away_team_id: String(game.visitor_team.id),
    selected_team_id: String(side === "home" ? game.home_team.id : game.visitor_team.id),
    winning_team_id: null,
    game_label: "BC at GT",
    home_team: game.home_team.full_name,
    away_team: game.visitor_team.full_name,
    starts_at: game.date,
    selected_team: side === "home" ? game.home_team.full_name : game.visitor_team.full_name,
    selected_side: side,
    status: "pending",
    home_score: null,
    away_score: null,
    created_at: "2026-10-24T12:00:00.000Z",
    updated_at: "2026-10-24T12:00:00.000Z",
    resolved_at: null,
    reward_points: 10,
    reward_claimed_at: null,
    scoring_mode: scoringMode,
    home_spread: null,
    away_spread: null,
  });
  const line = (homeSpread: number): MockRow => ({
    sport_key: "americanfootball_ncaaf",
    game_id: gameId,
    provider_game_id: String(game.id),
    starts_at: game.date,
    home_team: game.home_team.full_name,
    away_team: game.visitor_team.full_name,
    home_spread: homeSpread,
    away_spread: -homeSpread,
    source_vendor: "fanduel",
    fetched_at: "2026-10-24T18:00:00.000Z",
    locked_at: null,
    updated_at: "2026-10-24T18:00:00.000Z",
  });
  const settleAt = async (iso: string) => {
    store.fetchBallDontLieList.mockResolvedValue(saturday);
    vi.setSystemTime(new Date(iso));
    return settlePendingPickEmPicks();
  };

  it("grades against the line locked at kickoff: Georgia Tech +20.5 loses by 22, so Boston College covers", async () => {
    store.tables.pickem_picks = [pick("bc", "away"), pick("gt", "home")];
    store.tables.pickem_game_lines = [line(20.5)];

    const result = await settleAt("2026-10-25T12:00:00.000Z");

    expect(result).toMatchObject({ settledCount: 2, won: 1, lost: 1 });
    expect(store.tables.pickem_picks[0]).toMatchObject({ status: "won", scoring_mode: "spread", home_spread: 20.5, away_spread: -20.5 });
    expect(store.tables.pickem_picks[1]).toMatchObject({ status: "lost", scoring_mode: "spread" });
    // Locked by settlement (one call for the run), never fetched or re-written.
    expect(store.tables.pickem_game_lines[0].locked_at).toBe(game.date);
    expect(rpcNamed("lock_pickem_game_lines")).toEqual([
      { name: "lock_pickem_game_lines", args: { p_sport_key: "americanfootball_ncaaf", p_game_ids: [gameId] } },
    ]);
    expect(rpcNamed("upsert_pickem_game_lines")).toHaveLength(0);
    expect(oddsCalls()).toHaveLength(0);
  });

  it("an underdog that covers wins (Georgia Tech +24), and an integer line that lands is a push (+22)", async () => {
    store.tables.pickem_picks = [pick("gt", "home")];
    store.tables.pickem_game_lines = [line(24)];
    await settleAt("2026-10-25T12:00:00.000Z");
    expect(store.tables.pickem_picks[0].status).toBe("won");

    store.tables.pickem_picks = [pick("bc", "away"), pick("gt", "home")];
    store.tables.pickem_game_lines = [line(22)];
    const result = await settleAt("2026-10-25T12:00:00.000Z");
    expect(result.push).toBe(2);
    expect(store.tables.pickem_picks.map((row) => row.status)).toEqual(["push", "push"]);
  });

  it("a pick that recorded its bar's frozen line (B3) is graded by it, not the kickoff lock", async () => {
    // Frozen at Georgia Tech +24; the global line moved to +20.5 by kickoff. GT loses by 22: covers +24.
    const recorded = (id: string, side: "home" | "away") => ({ ...pick(id, side), home_spread: 24, away_spread: -24 });
    store.tables.pickem_picks = [recorded("gt", "home"), recorded("bc", "away"), pick("bc-global", "away")];
    store.tables.pickem_game_lines = [line(20.5)];

    const result = await settleAt("2026-10-25T12:00:00.000Z");

    expect(result).toMatchObject({ settledCount: 3, won: 2, lost: 1 });
    expect(store.tables.pickem_picks[0]).toMatchObject({ status: "won", home_spread: 24, away_spread: -24 });
    expect(store.tables.pickem_picks[1]).toMatchObject({ status: "lost", home_spread: 24 });
    // A pick without a recorded line is graded by the kickoff lock, as before.
    expect(store.tables.pickem_picks[2]).toMatchObject({ status: "won", home_spread: 20.5 });
    // Only that pick's game is asked of the lock.
    expect(rpcNamed("lock_pickem_game_lines")).toHaveLength(1);
  });

  it("a recorded line grades even when the kickoff lock fails, and needs no lock", async () => {
    store.tables.pickem_picks = [{ ...pick("gt", "home"), home_spread: 24, away_spread: -24 }];
    store.lockFails = true;

    const result = await settleAt("2026-10-25T12:00:00.000Z");

    expect(result).toMatchObject({ settledCount: 1, won: 1 });
    expect(rpcNamed("lock_pickem_game_lines")).toHaveLength(0);
  });

  it("a pick stamped 'standard' is graded on the winner, even with a line saved", async () => {
    store.tables.pickem_picks = [pick("gt", "home", "standard")];
    store.tables.pickem_game_lines = [line(24)];

    await settleAt("2026-10-25T12:00:00.000Z");

    expect(store.tables.pickem_picks[0]).toMatchObject({ status: "lost", scoring_mode: "standard", home_spread: null });
  });

  it("with no line, waits; 48 hours after kickoff, cancels", async () => {
    store.tables.pickem_picks = [pick("bc", "away")];

    const early = await settleAt("2026-10-25T12:00:00.000Z");
    expect(early.settledCount).toBe(0);
    expect(store.tables.pickem_picks[0].status).toBe("pending");

    const late = await settleAt(new Date(Date.parse(game.date) + COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS + 60_000).toISOString());
    expect(late.settledCount).toBe(1);
    expect(store.tables.pickem_picks[0]).toMatchObject({ status: "canceled", scoring_mode: "spread", winning_team_id: null });
  });

  it("a cancelled game is cancelled, never graded 0 + line vs 0 (Phase 7.3, F3)", async () => {
    // Home Georgia Tech -7: on the old rule every away picker "covered" a game that was never played.
    const cancelled = { ...game, status: "post", status_state: "canceled", home_score: 0, away_score: 0 };
    store.tables.pickem_picks = [pick("bc", "away"), pick("gt", "home")];
    store.tables.pickem_game_lines = [line(-7)];
    store.fetchBallDontLieList.mockResolvedValue([cancelled]);
    vi.setSystemTime(new Date(Date.parse(game.date) + 3600_000));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await settlePendingPickEmPicks();

    expect(result).toMatchObject({ settledCount: 2, won: 0, lost: 0, push: 0 });
    expect(store.tables.pickem_picks.map((row) => [row.status, row.scoring_mode, row.winning_team_id])).toEqual([
      ["canceled", "spread", null],
      ["canceled", "spread", null],
    ]);
    warn.mockRestore();
  });

  it("a postponed game cancels its spread picks even when the line lock fails", async () => {
    const postponed = { ...game, status: "pre", status_state: "postponed", home_score: null, away_score: null };
    store.tables.pickem_picks = [pick("bc", "away")];
    store.tables.pickem_game_lines = [line(-7)];
    store.lockFails = true;
    store.fetchBallDontLieList.mockResolvedValue([postponed]);
    vi.setSystemTime(new Date(Date.parse(game.date) + 3600_000));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await settlePendingPickEmPicks();

    expect(result.settledCount).toBe(1);
    expect(store.tables.pickem_picks[0]).toMatchObject({ status: "canceled", winning_team_id: null });
    warn.mockRestore();
  });

  it("a failed line lock leaves picks pending, even past 48 hours (an outage never cancels picks)", async () => {
    store.tables.pickem_picks = [pick("bc", "away")];
    store.tables.pickem_game_lines = [line(20.5)];
    store.lockFails = true;

    const result = await settleAt(new Date(Date.parse(game.date) + COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS + 60_000).toISOString());

    expect(result.settledCount).toBe(0);
    expect(store.tables.pickem_picks[0].status).toBe("pending");
  });

  it("only college spread picks touch the line lock", async () => {
    store.tables.pickem_picks = [pick("gt", "home", "standard")];
    await settleAt("2026-10-25T12:00:00.000Z");
    expect(rpcNamed("lock_pickem_game_lines")).toHaveLength(0);
  });
});

describe("the player screen", () => {
  const source = readFileSync("components/pickem/PickEmGameList.tsx", "utf8");
  it("pick ahead (B2): the arrows reach the server's pickAheadThrough, and a shut window blocks the buttons", () => {
    expect(source).toContain("payload.pickAheadThrough");
    expect(source).toContain("disabled={selectedDate >= lastReachableDate}");
    expect(source).toContain("const isLiveListDay = isViewingToday || isPickAheadDay;");
    expect(source).toContain("!isLiveListDay");
    expect(source).toContain("baseDisabled || windowShut ||");
    expect(source).toContain('data-testid="pickem-pick-window"');
  });
  it("shows the line on each team button, the explainer, and 'Line coming soon' from the shared copy", () => {
    expect(source).toContain("formatSpreadLine(game.awaySpread)");
    expect(source).toContain("formatSpreadLine(game.homeSpread)");
    expect(source).toContain("COLLEGE_FOOTBALL_SPREAD_COPY.explainer");
    expect(source).toContain("COLLEGE_FOOTBALL_SPREAD_COPY.lineComingSoon");
    expect(source).toContain("COLLEGE_FOOTBALL_SPREAD_COPY.noLineYet");
  });
});
