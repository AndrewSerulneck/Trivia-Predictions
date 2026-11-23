import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import saturday from "@/tests/fixtures/pickem-ncaaf/games-2026-10-24.json";

// Fire TV plan N2 (docs/fire-tv-app-plan.md, D33): Pick 'Em reads a game's real start time first in every league.
// NHL rows carry a date-only `game_date` ahead of `start_time_utc`; before N2 every NHL game started (and locked)
// at 12:00Z, which is 7 AM New York. Every other league's start time and game id must not move: their ids are
// what picks are stored under, so those expectations are literal strings.
// Settlement's "scheduled" guard is tested in tests/lib.pickem-stale-pending.test.ts.

vi.mock("server-only", () => ({}));

const store = vi.hoisted(() => ({
  rowsByPath: {} as Record<string, Array<Record<string, unknown>>>,
  fetchBallDontLieList: vi.fn(),
}));

vi.mock("@/lib/balldontlie", () => ({ fetchBallDontLieList: store.fetchBallDontLieList }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/challengeCampaigns", () => ({ applyChallengeCampaignPoints: vi.fn() }));
vi.mock("@/lib/venueGameSettings", () => ({
  DEFAULT_CFB_PICKEM_SCORING_MODE: "spread",
  getVenueNFLPickEmScoringMode: vi.fn(() => Promise.resolve("standard")),
  getVenueCollegeFootballPickEmScoringMode: vi.fn(() => Promise.resolve("spread")),
}));

import { listPickEmGames, listPickEmProviderGames, listPickEmTvFeedGames } from "@/lib/pickem";

const team = (id: number, fullName: string, tricode: string) => ({ id, full_name: fullName, tricode });
const NJD = team(1, "New Jersey Devils", "NJD");
const CBJ = team(9, "Columbus Blue Jackets", "CBJ");
const SEA = team(55, "Seattle Kraken", "SEA");
const ANA = team(24, "Anaheim Ducks", "ANA");

// Real rows from /nhl/v1/games (2026-11-22 and 2026-11-23), cut to the fields Pick 'Em reads.
const nhlFinal = {
  id: 3328421,
  season: 2026,
  game_date: "2026-11-22",
  start_time_utc: "2026-11-22T17:30:00.000Z",
  home_team: team(61, "New York Rangers", "NYR"),
  away_team: team(18, "Carolina Hurricanes", "CAR"),
  home_score: 2,
  away_score: 5,
  game_state: "OFF",
  status_state: "final",
  period: 3,
  time_remaining: "00:00",
  in_intermission: false,
  postseason: false,
};
const nhlScheduled = {
  id: 3328426,
  season: 2026,
  game_date: "2026-11-23",
  start_time_utc: "2026-11-24T00:00:00.000Z",
  home_team: NJD,
  away_team: CBJ,
  home_score: 0,
  away_score: 0,
  game_state: "FUT",
  status_state: "scheduled",
  time_remaining: "00:00",
  postseason: false,
};
const nhlLate = {
  ...nhlScheduled,
  id: 3328431,
  start_time_utc: "2026-11-24T02:40:00.000Z",
  home_team: SEA,
  away_team: ANA,
};
const live = (overrides: Record<string, unknown>) => ({
  ...nhlScheduled,
  home_score: 1,
  away_score: 1,
  game_state: "LIVE",
  status_state: "in_progress",
  ...overrides,
});

const NHL_ID = "3328426__2026-11-24T00:00:00.000Z__newjerseydevils__columbusbluejackets";

const rowsFor = (path: string) => store.rowsByPath[path] ?? [];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  store.rowsByPath = {};
  store.fetchBallDontLieList.mockImplementation((path: string) => Promise.resolve(rowsFor(path)));
});

afterEach(() => {
  vi.useRealTimers();
});

const at = (iso: string) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
};

describe("NHL games start at the real puck-drop", () => {
  it("uses start_time_utc, not game_date at noon, for startsAt and the game id", async () => {
    store.rowsByPath["/nhl/v1/games"] = [nhlFinal, nhlScheduled];

    const games = await listPickEmProviderGames(["icehockey_nhl"], "2026-11-22T00:00:00.000Z", "2026-11-25T00:00:00.000Z");

    expect(games.map(({ id, startsAt }) => ({ id, startsAt }))).toEqual([
      {
        id: "3328421__2026-11-22T17:30:00.000Z__newyorkrangers__carolinahurricanes",
        startsAt: "2026-11-22T17:30:00.000Z",
      },
      { id: NHL_ID, startsAt: "2026-11-24T00:00:00.000Z" },
    ]);
  });

  it("an evening game is open at 11 AM New York and locks at puck-drop", async () => {
    store.rowsByPath["/nhl/v1/games"] = [nhlFinal, nhlScheduled, nhlLate];
    const list = () => listPickEmGames({ sportSlug: "nhl", date: "2026-11-23", tzOffsetMinutes: 300, skipLines: true });

    at("2026-11-23T16:00:00.000Z");
    const morning = await list();
    // Only the venue's local day (New York): yesterday's afternoon game is not listed.
    expect(morning.games.map((game) => game.id)).toEqual([
      NHL_ID,
      "3328431__2026-11-24T02:40:00.000Z__seattlekraken__anaheimducks",
    ]);
    expect(morning.games.map((game) => [game.isLocked, game.status])).toEqual([
      [false, "scheduled"],
      [false, "scheduled"],
    ]);

    at("2026-11-23T23:59:59.000Z");
    expect((await list()).games[0]?.isLocked).toBe(false);

    at("2026-11-24T00:00:00.000Z");
    const dropped = await list();
    expect(dropped.games.map((game) => [game.id, game.isLocked])).toEqual([
      [NHL_ID, true],
      ["3328431__2026-11-24T02:40:00.000Z__seattlekraken__anaheimducks", false],
    ]);
  });
});

describe("NHL period labels", () => {
  const labelFor = async (row: Record<string, unknown>) => {
    store.rowsByPath["/nhl/v1/games"] = [row];
    at("2026-11-24T01:00:00.000Z");
    const result = await listPickEmGames({ sportSlug: "nhl", date: "2026-11-23", tzOffsetMinutes: 300, skipLines: true });
    return result.games[0]?.periodLabel ?? null;
  };

  it("shows the hockey period and clock, never baseball innings", async () => {
    expect(await labelFor(live({ period: 2, time_remaining: "09:22", in_intermission: false }))).toBe("P2 9:22");
    expect(await labelFor(live({ period: 2, time_remaining: "00:00", in_intermission: true }))).toBe("Int 2");
    expect(await labelFor(live({ period: 4, time_remaining: "03:10", in_intermission: false }))).toBe("OT 3:10");
    expect(await labelFor(live({ period: 5, time_remaining: "00:00", in_intermission: false }))).toBe("SO 0:00");
    expect(await labelFor(nhlScheduled)).toBeNull();
  });

  it("the venue TV's label is unchanged", async () => {
    store.rowsByPath["/nhl/v1/games"] = [live({ period: 2, time_remaining: "09:22", in_intermission: false })];

    const { games } = await listPickEmTvFeedGames("icehockey_nhl", "2026-11-23T00:00:00.000Z", "2026-11-25T00:00:00.000Z");

    expect(games.map((game) => [game.startsAt, game.periodLabel, game.feedState])).toEqual([
      ["2026-11-24T00:00:00.000Z", "P2 9:22", "live"],
    ]);
  });
});

// One real-shaped row per league (start fields from the N1 handoff §5 item 1). These ids are what players' picks are
// stored under: if one of these fails, a league's ids moved and existing picks would stop matching their games.
describe("every other league's start time and game id are unchanged", () => {
  const cases: Array<{
    name: string;
    sportKey: string;
    path: string;
    rows: Array<Record<string, unknown>>;
    extra?: Record<string, Array<Record<string, unknown>>>;
    window: [string, string];
    expected: Array<{ id: string; startsAt: string }>;
  }> = [
    {
      name: "NBA: datetime, ahead of the date-only date",
      sportKey: "basketball_nba",
      path: "/nba/v1/games",
      rows: [
        {
          id: 18447001,
          date: "2026-11-22",
          datetime: "2026-11-23T00:30:00.000Z",
          status: "Final",
          period: 4,
          time: "Final",
          home_team_score: 112,
          visitor_team_score: 104,
          home_team: { id: 2, abbreviation: "BOS", full_name: "Boston Celtics" },
          visitor_team: { id: 14, abbreviation: "LAL", full_name: "Los Angeles Lakers" },
        },
        {
          // A game with no time yet: falls back to the date at noon, as before.
          id: 18447002,
          date: "2026-11-24",
          datetime: null,
          status: "Scheduled",
          period: 0,
          home_team_score: 0,
          visitor_team_score: 0,
          home_team: { id: 3, abbreviation: "BKN", full_name: "Brooklyn Nets" },
          visitor_team: { id: 20, abbreviation: "NYK", full_name: "New York Knicks" },
        },
      ],
      window: ["2026-11-22T00:00:00.000Z", "2026-11-25T00:00:00.000Z"],
      expected: [
        { id: "18447001__2026-11-23T00:30:00.000Z__bostonceltics__losangeleslakers", startsAt: "2026-11-23T00:30:00.000Z" },
        { id: "18447002__2026-11-24T12:00:00.000Z__brooklynnets__newyorkknicks", startsAt: "2026-11-24T12:00:00.000Z" },
      ],
    },
    {
      name: "WNBA: full ISO date",
      sportKey: "basketball_wnba",
      path: "/wnba/v1/games",
      rows: [
        {
          id: 501,
          date: "2026-07-12T23:00:00.000Z",
          status: "post",
          home_team: { id: 1, abbreviation: "LV", full_name: "Las Vegas Aces" },
          visitor_team: { id: 2, abbreviation: "NY", full_name: "New York Liberty" },
        },
      ],
      window: ["2026-07-12T00:00:00.000Z", "2026-07-14T00:00:00.000Z"],
      expected: [{ id: "501__2026-07-12T23:00:00.000Z__lasvegasaces__newyorkliberty", startsAt: "2026-07-12T23:00:00.000Z" }],
    },
    {
      name: "MLB: full ISO date",
      sportKey: "baseball_mlb",
      path: "/mlb/v1/games",
      rows: [
        {
          id: 9001,
          date: "2026-07-12T17:35:00.000Z",
          status: "STATUS_FINAL",
          home_team_name: "New York Yankees",
          away_team_name: "Boston Red Sox",
          home_team_data: { runs: 5 },
          away_team_data: { runs: 3 },
        },
      ],
      window: ["2026-07-12T00:00:00.000Z", "2026-07-14T00:00:00.000Z"],
      expected: [{ id: "9001__2026-07-12T17:35:00.000Z__newyorkyankees__bostonredsox", startsAt: "2026-07-12T17:35:00.000Z" }],
    },
    {
      name: "NFL: full ISO date",
      sportKey: "americanfootball_nfl",
      path: "/nfl/v1/games",
      rows: [
        {
          id: 7001,
          date: "2026-11-22T18:00:00.000Z",
          status: "Final",
          home_team_score: 24,
          visitor_team_score: 20,
          home_team: { id: 16, abbreviation: "KC", full_name: "Kansas City Chiefs" },
          visitor_team: { id: 30, abbreviation: "SEA", full_name: "Seattle Seahawks" },
        },
      ],
      window: ["2026-11-22T00:00:00.000Z", "2026-11-24T00:00:00.000Z"],
      expected: [{ id: "7001__2026-11-22T18:00:00.000Z__kansascitychiefs__seattleseahawks", startsAt: "2026-11-22T18:00:00.000Z" }],
    },
    {
      name: "College Football: full ISO date (real fixture row)",
      sportKey: "americanfootball_ncaaf",
      path: "/ncaaf/v1/games",
      rows: (saturday as Array<Record<string, unknown>>).filter((game) => game.id === 457383),
      window: ["2026-10-24T00:00:00.000Z", "2026-10-26T00:00:00.000Z"],
      expected: [
        {
          id: "457383__2026-10-24T19:30:00.000Z__georgiatechyellowjackets__bostoncollegeeagles",
          startsAt: "2026-10-24T19:30:00.000Z",
        },
      ],
    },
    {
      name: "ATP: scheduled_time, ahead of the tournament's date-only start",
      sportKey: "tennis_atp",
      path: "/atp/v1/matches",
      rows: [
        {
          id: 3001,
          scheduled_time: "2026-11-20T13:00:00.000Z",
          tournament: { id: 1, name: "ATP Finals", start_date: "2026-11-16" },
          player1: { id: 11, full_name: "Jannik Sinner" },
          player2: { id: 12, full_name: "Carlos Alcaraz" },
        },
      ],
      window: ["2026-11-20T00:00:00.000Z", "2026-11-22T00:00:00.000Z"],
      expected: [{ id: "3001__2026-11-20T13:00:00.000Z__janniksinner__carlosalcaraz", startsAt: "2026-11-20T13:00:00.000Z" }],
    },
    {
      name: "EPL: full ISO date, team names from the teams list",
      sportKey: "soccer_epl",
      path: "/epl/v2/matches",
      rows: [{ id: 4001, date: "2026-11-22T15:00:00.000Z", home_team_id: 10, away_team_id: 11, status: "FT" }],
      extra: {
        "/epl/v2/teams": [
          { id: 10, name: "Arsenal" },
          { id: 11, name: "Chelsea" },
        ],
      },
      window: ["2026-11-22T00:00:00.000Z", "2026-11-24T00:00:00.000Z"],
      expected: [{ id: "4001__2026-11-22T15:00:00.000Z__arsenal__chelsea", startsAt: "2026-11-22T15:00:00.000Z" }],
    },
    {
      name: "FIFA World Cup: datetime",
      sportKey: "soccer_fifa_world_cup",
      path: "/fifa/worldcup/v1/matches",
      rows: [
        {
          id: 6001,
          datetime: "2026-06-14T19:00:00.000Z",
          home_team: { id: 1, name: "United States" },
          away_team: { id: 2, name: "Mexico" },
        },
      ],
      window: ["2026-06-14T00:00:00.000Z", "2026-06-16T00:00:00.000Z"],
      expected: [{ id: "6001__2026-06-14T19:00:00.000Z__unitedstates__mexico", startsAt: "2026-06-14T19:00:00.000Z" }],
    },
  ];

  it.each(cases)("$name", async ({ sportKey, path, rows, extra, window, expected }) => {
    store.rowsByPath = { [path]: rows, ...(extra ?? {}) };

    const games = await listPickEmProviderGames([sportKey], window[0], window[1]);

    expect(games.map(({ id, startsAt }) => ({ id, startsAt }))).toEqual(expected);
  });
});
