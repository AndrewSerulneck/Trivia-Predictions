import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 2 of docs/prop-bingo-code-review-fix-plan.md — the `start_date`/`end_date` grading substrate.
//
// The bug these tests exist to catch: `getNFLGameStatsSnapshot` and `getScoresBySportKey` sent
// `start_date`/`end_date` to `/nfl/v1/games` and `/mlb/v1/games`. Those endpoints do not error on
// the date-range form and do not honour it either — they return the *oldest* rows in the archive
// (2002 for NFL, 2000 spring training for MLB) as though no filter had been applied. Every NFL card
// therefore matched no game, every NFL square stayed pending, and the board voided at
// BINGO_FORCE_FINALIZE_AFTER_START_MS.
//
// Every other balldontlie test in this suite stubs `fetch` with a URL-substring match that ignores
// the query string entirely, which is exactly why 200 green tests never noticed. The double here is
// deliberately **param-faithful**: it reproduces the live API's real filtering semantics, verified
// against the live endpoints on 2026-08-17 (see docs/prop-bingo-code-review-fix-plan.md's Phase 2
// notes). Send the wrong params and it hands back the archive fixture, same as production would.

import archiveFixture from "./fixtures/balldontlie-date-range-ignored.json";

type Row = Record<string, unknown>;

const store = vi.hoisted(() => ({
  db: { sports_bingo_cards: [] as Row[], sports_bingo_squares: [] as Row[], notifications: [] as Row[] },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/challengeCampaigns", () => ({ applyChallengeCampaignPoints: vi.fn() }));

vi.mock("@/lib/supabaseAdmin", async () => {
  const { createSupabaseAdminDouble } = await import("./helpers/bingoSupabaseDouble");
  return { supabaseAdmin: createSupabaseAdminDouble(store.db as unknown as Record<string, Record<string, unknown>[]>) };
});

// --- the games each league's card points at ----------------------------------------------------

const KICKOFF = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const TODAY_KEY = KICKOFF.slice(0, 10);

const NFL_GAME_ID = "424129";
const NFL_HOME = "Philadelphia Eagles";
const NFL_AWAY = "Dallas Cowboys";

const NBA_GAME_ID = "1038211";
const NBA_HOME = "Boston Celtics";
const NBA_AWAY = "Miami Heat";

const MLB_GAME_ID = "5059537";
const MLB_HOME = "Arizona Diamondbacks";
const MLB_AWAY = "Los Angeles Dodgers";

// Shapes copied from live responses: NFL and NBA `/games` rows carry `visitor_team` +
// `home_team_score`; MLB's carry `away_team` + `home_team_data` instead (see the MLB note in the
// "does not regress the other leagues" block below).
const NFL_GAME: Row = {
  id: Number(NFL_GAME_ID),
  date: KICKOFF,
  season: 2026,
  week: 3,
  status: "Final",
  status_state: "final",
  home_team: { id: 1, full_name: NFL_HOME },
  visitor_team: { id: 2, full_name: NFL_AWAY },
  home_team_score: 27,
  visitor_team_score: 20,
  home_team_q1: 7,
  home_team_q2: 3,
  home_team_q3: 0,
  home_team_q4: 17,
  home_team_ot: null,
  visitor_team_q1: 7,
  visitor_team_q2: 6,
  visitor_team_q3: 7,
  visitor_team_q4: 0,
  visitor_team_ot: null,
};

const NFL_STATS: Row[] = [
  {
    player: { id: 11, first_name: "Jalen", last_name: "Hurts" },
    team: { id: 1, full_name: NFL_HOME },
    passing_yards: 264,
    passing_touchdowns: 2,
    passing_attempts: 31,
    passing_completions: 22,
  },
];

const NBA_GAME: Row = {
  id: Number(NBA_GAME_ID),
  date: TODAY_KEY,
  status: "Final",
  home_team: { id: 2, full_name: NBA_HOME },
  visitor_team: { id: 16, full_name: NBA_AWAY },
  home_team_score: 112,
  visitor_team_score: 104,
};

const MLB_GAME: Row = {
  id: Number(MLB_GAME_ID),
  date: KICKOFF,
  season: 2026,
  status: "STATUS_FINAL",
  status_state: "final",
  home_team_name: MLB_HOME,
  away_team_name: MLB_AWAY,
  home_team: { id: 29, display_name: MLB_HOME, name: "Diamondbacks" },
  away_team: { id: 19, display_name: MLB_AWAY, name: "Dodgers" },
  home_team_data: { runs: 1, hits: 7 },
  away_team_data: { runs: 2, hits: 6 },
};

// --- the param-faithful provider double --------------------------------------------------------

type RequestRecord = { path: string; params: URLSearchParams };

let requests: RequestRecord[] = [];

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function bdlList(data: unknown[]): Response {
  return jsonResponse({ data, meta: { next_cursor: null } });
}

function requestedDays(params: URLSearchParams): string[] {
  return params.getAll("dates[]");
}

function rowDayKey(row: Row): string {
  return String(row.date ?? "").slice(0, 10);
}

/**
 * Filters a `/games` payload the way `/nfl/v1/games` and `/mlb/v1/games` actually do:
 * `dates[]` selects, and `start_date`/`end_date` are **ignored** — a query carrying only the range
 * form comes back as the oldest rows in the archive, which is what `archiveFixture` holds.
 */
function serveDateIgnoringGames(params: URLSearchParams, rows: Row[], archive: Row[]): Response {
  const days = requestedDays(params);
  if (days.length === 0) {
    return bdlList(archive);
  }
  return bdlList(rows.filter((row) => days.includes(rowDayKey(row))));
}

/** `/nba/v1/games` and `/wnba/v1/games` honour both forms — verified live, identical result sets. */
function serveDateHonouringGames(params: URLSearchParams, rows: Row[]): Response {
  const days = requestedDays(params);
  if (days.length > 0) {
    return bdlList(rows.filter((row) => days.includes(rowDayKey(row))));
  }
  const start = params.get("start_date");
  const end = params.get("end_date");
  if (!start || !end) {
    return bdlList(rows);
  }
  return bdlList(rows.filter((row) => rowDayKey(row) >= start && rowDayKey(row) <= end));
}

function installProviderDouble(): void {
  requests = [];
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const path = url.pathname;
    requests.push({ path, params: url.searchParams });

    if (path === "/nfl/v1/games") {
      return Promise.resolve(
        serveDateIgnoringGames(url.searchParams, [NFL_GAME], archiveFixture.nfl.rows as Row[])
      );
    }
    if (path === "/mlb/v1/games") {
      return Promise.resolve(
        serveDateIgnoringGames(url.searchParams, [MLB_GAME], archiveFixture.mlb.rows as Row[])
      );
    }
    if (path === "/nba/v1/games") {
      return Promise.resolve(serveDateHonouringGames(url.searchParams, [NBA_GAME]));
    }
    if (path === "/nfl/v1/stats") {
      const gameIds = url.searchParams.getAll("game_ids[]");
      return Promise.resolve(bdlList(gameIds.includes(NFL_GAME_ID) ? NFL_STATS : []));
    }
    return Promise.resolve(bdlList([]));
  });
  vi.stubGlobal("fetch", fetchMock);
}

// --- card seeding ------------------------------------------------------------------------------

let squareSequence = 0;

type SeedOptions = { cardId: string; sportKey: string; gameId: string; home: string; away: string };

function seedCard(options: SeedOptions, resolvers: unknown[]): void {
  store.db.sports_bingo_cards.push({
    id: options.cardId,
    user_id: "user-1",
    venue_id: "venue-1",
    game_id: options.gameId,
    game_label: `${options.away} @ ${options.home}`,
    sport_key: options.sportKey,
    home_team: options.home,
    away_team: options.away,
    starts_at: KICKOFF,
    status: "active",
    board_probability: 0.25,
    reward_points: 50,
    reward_claimed_at: null,
    near_win_notified_at: null,
    won_notified_at: null,
    won_line: null,
    settled_at: null,
    created_at: KICKOFF,
    updated_at: null,
    last_cron_processed_at: null,
  });

  resolvers.forEach((resolver, position) => {
    squareSequence += 1;
    store.db.sports_bingo_squares.push({
      id: `square-${squareSequence}`,
      card_id: options.cardId,
      square_index: position,
      label: "square",
      resolver,
      probability: 0.4,
      is_free: false,
      status: "pending",
      created_at: KICKOFF,
      resolved_at: null,
    });
  });
}

function squareStatus(cardId: string, index: number): string {
  const row = store.db.sports_bingo_squares.find(
    (square) => square.card_id === cardId && square.square_index === index
  );
  return String(row?.status ?? "missing");
}

async function runRefresh(sportKey: string, gameId: string): Promise<void> {
  const { refreshSportsBingoProgress } = await import("@/lib/sportsBingo");
  await refreshSportsBingoProgress({ sportKey, gameId, bypassCache: true });
}

function gameRequests(path: string): RequestRecord[] {
  return requests.filter((entry) => entry.path === path);
}

beforeEach(() => {
  vi.resetModules();
  squareSequence = 0;
  store.db.sports_bingo_cards = [];
  store.db.sports_bingo_squares = [];
  store.db.notifications = [];
  process.env.BALLDONTLIE_API_KEY = "test-bdl-key";
  installProviderDouble();
});

describe("the archive fixture reproduces the failing shape", () => {
  it("is what the live API returns when a /games endpoint is given start_date/end_date", () => {
    const nflRows = archiveFixture.nfl.rows as Row[];
    const mlbRows = archiveFixture.mlb.rows as Row[];

    expect(nflRows.length).toBeGreaterThan(0);
    expect(mlbRows.length).toBeGreaterThan(0);
    // The window asked for was in 2025/2026; every row came back from the start of the archive.
    expect(archiveFixture.nfl.requestedWindow.startsWith("2025")).toBe(true);
    expect(nflRows.every((row) => rowDayKey(row).startsWith("2002"))).toBe(true);
    expect(archiveFixture.mlb.requestedWindow.startsWith("2026")).toBe(true);
    expect(mlbRows.every((row) => rowDayKey(row).startsWith("2000"))).toBe(true);
  });

  it("holds no game any current card could match", () => {
    const nflTeams = (archiveFixture.nfl.rows as Row[]).flatMap((row) => [
      String((row.home_team as Row | undefined)?.full_name ?? ""),
      String((row.visitor_team as Row | undefined)?.full_name ?? ""),
    ]);
    expect(nflTeams).not.toContain(NFL_HOME);
    expect(nflTeams).not.toContain(NFL_AWAY);
    expect((archiveFixture.nfl.rows as Row[]).map((row) => String(row.id))).not.toContain(NFL_GAME_ID);
  });
});

describe("NFL grading substrate", () => {
  const NFL_CARD = { cardId: "card-nfl", sportKey: "americanfootball_nfl", gameId: NFL_GAME_ID, home: NFL_HOME, away: NFL_AWAY };

  it("queries /nfl/v1/games with dates[] and never with start_date/end_date", async () => {
    seedCard(NFL_CARD, [{ kind: "moneyline", team: "home" }]);

    await runRefresh("americanfootball_nfl", NFL_GAME_ID);

    const calls = gameRequests("/nfl/v1/games");
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.params.get("start_date")).toBeNull();
      expect(call.params.get("end_date")).toBeNull();
      expect(call.params.getAll("dates[]")).toContain(TODAY_KEY);
    }
  });

  it("resolves the box-score snapshot, so NFL squares settle instead of hanging pending", async () => {
    seedCard(NFL_CARD, [
      { kind: "moneyline", team: "home" },
      { kind: "player_prop", marketKey: "passing_yards", player: "Jalen Hurts", line: 249.5, direction: "over" },
      { kind: "nfl_team_leads_at_halftime", team: "home" },
    ]);

    await runRefresh("americanfootball_nfl", NFL_GAME_ID);

    // Eagles 27-20 wins; Hurts threw 264 (over 249.5); at the half it was 10-13, so the Eagles
    // did NOT lead — a real miss, which is only reachable at all once the snapshot resolves.
    expect(squareStatus("card-nfl", 0)).toBe("hit");
    expect(squareStatus("card-nfl", 1)).toBe("hit");
    expect(squareStatus("card-nfl", 2)).toBe("miss");
  });

  it("regression: the start_date/end_date form leaves every NFL square pending", async () => {
    // Same board, but the provider is asked the way the pre-fix code asked. This is the failure the
    // 200-test suite could not see: no error, no empty payload — just 2002 games that match nothing.
    seedCard(NFL_CARD, [
      { kind: "moneyline", team: "home" },
      { kind: "player_prop", marketKey: "passing_yards", player: "Jalen Hurts", line: 249.5, direction: "over" },
    ]);

    const legacyQuery = new URLSearchParams({
      per_page: "100",
      start_date: TODAY_KEY,
      end_date: TODAY_KEY,
    });
    const legacyPayload = (await (
      await fetch(`https://api.balldontlie.io/nfl/v1/games?${legacyQuery.toString()}`)
    ).json()) as { data: Row[] };

    expect(legacyPayload.data.length).toBeGreaterThan(0);
    expect(legacyPayload.data.map((row) => String(row.id))).not.toContain(NFL_GAME_ID);
    expect(legacyPayload.data.some((row) => rowDayKey(row) === TODAY_KEY)).toBe(false);
    expect(squareStatus("card-nfl", 0)).toBe("pending");
    expect(squareStatus("card-nfl", 1)).toBe("pending");
  });
});

describe("the shared score lookup does not regress the other leagues", () => {
  it("still settles a basketball card, whose endpoint honoured both forms", async () => {
    seedCard(
      { cardId: "card-nba", sportKey: "basketball_nba", gameId: NBA_GAME_ID, home: NBA_HOME, away: NBA_AWAY },
      [{ kind: "moneyline", team: "home" }]
    );

    await runRefresh("basketball_nba", NBA_GAME_ID);

    const calls = gameRequests("/nba/v1/games");
    expect(calls.some((call) => call.params.getAll("dates[]").includes(TODAY_KEY))).toBe(true);
    expect(squareStatus("card-nba", 0)).toBe("hit");
  });

  it("queries /mlb/v1/games with dates[] from every call site", async () => {
    seedCard(
      { cardId: "card-mlb", sportKey: "baseball_mlb", gameId: MLB_GAME_ID, home: MLB_HOME, away: MLB_AWAY },
      [{ kind: "moneyline", team: "home" }]
    );

    await runRefresh("baseball_mlb", MLB_GAME_ID);

    // Two independent call sites hit this path — `getScoresBySportKey` and
    // `getMLBGamePlayerStatsSnapshot` — and both must use the honoured form.
    const calls = gameRequests("/mlb/v1/games");
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const call of calls) {
      expect(call.params.get("start_date")).toBeNull();
      expect(call.params.get("end_date")).toBeNull();
      expect(call.params.getAll("dates[]")).toContain(TODAY_KEY);
    }
  });

  it("selects the in-window MLB game rather than the 2000 archive", async () => {
    seedCard(
      { cardId: "card-mlb", sportKey: "baseball_mlb", gameId: MLB_GAME_ID, home: MLB_HOME, away: MLB_AWAY },
      [{ kind: "moneyline", team: "home" }]
    );

    await runRefresh("baseball_mlb", MLB_GAME_ID);

    // Replay the exact query the code emitted through the same param-faithful provider: it must
    // come back with today's game, not the spring-training rows the range form returns.
    const emitted = gameRequests("/mlb/v1/games")[0];
    const replayed = (await (
      await fetch(`https://api.balldontlie.io/mlb/v1/games?${emitted.params.toString()}`)
    ).json()) as { data: Row[] };

    expect(replayed.data.map((row) => String(row.id))).toContain(MLB_GAME_ID);
    expect(replayed.data.every((row) => rowDayKey(row) === TODAY_KEY)).toBe(true);
  });
});
