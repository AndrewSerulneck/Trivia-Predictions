// Venue TV sports feed fixes (docs/fire-tv-app-plan.md Phase CR1.4: F15, F17, F18, F20).
// The real BallDontLie client runs against a stubbed fetch, so "did every request answer" is tested end to end.
// Pick 'Em callers pass no failure flag; their behaviour is pinned in tests/lib.pickem-nhl-start-time.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.BALLDONTLIE_API_KEY = "test-key";
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/challengeCampaigns", () => ({ applyChallengeCampaignPoints: vi.fn() }));
vi.mock("@/lib/venueGameSettings", () => ({
  DEFAULT_CFB_PICKEM_SCORING_MODE: "spread",
  getVenueNFLPickEmScoringMode: vi.fn(() => Promise.resolve("standard")),
  getVenueCollegeFootballPickEmScoringMode: vi.fn(() => Promise.resolve("spread")),
}));

import { listPickEmTvFeedGames } from "@/lib/pickem";
import { nextTvSportsRefreshMs, TV_SPORTS_EMPTY_REFRESH_MS, TV_SPORTS_NO_REPLY_REFRESH_MS } from "@/lib/tvSportsSnapshot";

const now = Date.parse("2026-11-24T20:00:00.000Z");
const FROM = "2026-11-24T08:00:00.000Z";
const TO = "2026-11-26T02:00:00.000Z";

type Reply = { status: number; body?: unknown } | "network-error";
/** path → reply; `dates[]` → reply for one day; anything unlisted answers 200 with an empty list. */
let replies: Record<string, Reply> = {};
const requested: string[] = [];

beforeEach(() => {
  replies = {};
  requested.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input);
      requested.push(`${url.pathname}?${url.searchParams.toString()}`);
      const reply = replies[`${url.pathname}@${url.searchParams.get("dates[]") ?? ""}`] ?? replies[url.pathname];
      if (reply === "network-error") throw new TypeError("fetch failed");
      const { status, body } = reply ?? { status: 200, body: { data: [], meta: { next_cursor: null } } };
      return new Response(JSON.stringify(body ?? {}), { status, headers: { "Content-Type": "application/json" } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const list = (data: unknown[]) => ({ status: 200, body: { data, meta: { next_cursor: null } } });

describe("F15: an empty league is an answer, not a failure", () => {
  it("every request answers 200 with no games → ok, next refresh in 6 h", async () => {
    const result = await listPickEmTvFeedGames("baseball_mlb", FROM, TO);
    expect(requested.length).toBeGreaterThan(0);
    expect(result).toEqual({ ok: true, games: [] });
    expect(nextTvSportsRefreshMs("baseball_mlb", result, now)).toBe(now + TV_SPORTS_EMPTY_REFRESH_MS);
  });

  it("one day's request failing (5xx) → not ok, 30-minute retry", async () => {
    replies["/mlb/v1/games@2026-11-25"] = { status: 503 };
    const result = await listPickEmTvFeedGames("baseball_mlb", FROM, TO);
    expect(result.ok).toBe(false);
    expect(nextTvSportsRefreshMs("baseball_mlb", result, now)).toBe(now + TV_SPORTS_NO_REPLY_REFRESH_MS);
  });

  it("a network error, a failed soccer teams list, or a failed UFC events list → not ok", async () => {
    replies["/nba/v1/games"] = "network-error";
    expect((await listPickEmTvFeedGames("basketball_nba", FROM, TO)).ok).toBe(false);

    replies = { "/epl/v2/teams": { status: 500 } };
    expect((await listPickEmTvFeedGames("soccer_epl", FROM, TO)).ok).toBe(false);

    replies = { "/mma/v1/events": { status: 429 } };
    expect((await listPickEmTvFeedGames("mma_ufc", FROM, TO)).ok).toBe(false);
  });

  it("a failed request that still let some games through keeps them, but is not ok", async () => {
    replies["/nhl/v1/games@2026-11-24"] = list([
      {
        id: 1,
        game_date: "2026-11-24",
        start_time_utc: "2026-11-25T00:00:00.000Z",
        home_team: { id: 1, full_name: "New Jersey Devils", tricode: "NJD" },
        away_team: { id: 9, full_name: "Columbus Blue Jackets", tricode: "CBJ" },
        game_state: "FUT",
        status_state: "scheduled",
        postseason: false,
      },
    ]);
    replies["/nhl/v1/games@2026-11-25"] = { status: 502 };
    const result = await listPickEmTvFeedGames("icehockey_nhl", FROM, TO);
    expect(result.ok).toBe(false);
    expect(result.games.map((game) => game.startsAt)).toEqual(["2026-11-25T00:00:00.000Z"]);
  });
});

describe("F17: the TV never shows a made-up noon start", () => {
  it("skips a tennis match whose only date is the tournament's start_date; keeps one with a scheduled_time", async () => {
    const player = (id: number, name: string) => ({ id, full_name: name });
    replies["/atp/v1/matches"] = list([
      { id: 10, player1: player(1, "Jannik Sinner"), player2: player(2, "Carlos Alcaraz"), tournament: { start_date: "2026-11-24" } },
      {
        id: 11,
        player1: player(3, "Novak Djokovic"),
        player2: player(4, "Alexander Zverev"),
        scheduled_time: "2026-11-24T21:30:00.000Z",
        tournament: { start_date: "2026-11-24" },
      },
    ]);
    const result = await listPickEmTvFeedGames("tennis_atp", FROM, TO);
    expect(result.ok).toBe(true);
    expect(result.games.map((game) => [game.feedGameKey, game.startsAt])).toEqual([
      ["/atp/v1/matches#11", "2026-11-24T21:30:00.000Z"],
    ]);
  });

  it("keeps leagues whose only start field is a full ISO `date` (NFL, MLB, soccer); skips an NBA game with no time yet", async () => {
    replies["/nfl/v1/games@2026-11-24"] = list([
      {
        id: 20,
        date: "2026-11-24T23:15:00.000Z",
        status: "Scheduled",
        home_team: { id: 1, full_name: "Detroit Lions", abbreviation: "DET" },
        visitor_team: { id: 2, full_name: "Green Bay Packers", abbreviation: "GB" },
      },
    ]);
    expect((await listPickEmTvFeedGames("americanfootball_nfl", FROM, TO)).games.map((game) => game.startsAt)).toEqual([
      "2026-11-24T23:15:00.000Z",
    ]);

    replies["/nba/v1/games@2026-11-24"] = list([
      {
        id: 30,
        date: "2026-11-24",
        datetime: null,
        status: "Scheduled",
        home_team: { id: 3, abbreviation: "BKN", full_name: "Brooklyn Nets" },
        visitor_team: { id: 20, abbreviation: "NYK", full_name: "New York Knicks" },
      },
    ]);
    expect(await listPickEmTvFeedGames("basketball_nba", FROM, TO)).toEqual({ ok: true, games: [] });
  });

  it("keeps a UFC fight on its event's timestamp", async () => {
    replies["/mma/v1/events"] = list([{ id: 5, date: "2026-11-24T22:00:00.000Z" }]);
    replies["/mma/v1/fights"] = list([
      {
        id: 50,
        event: { id: 5, date: "2026-11-24T22:00:00.000Z" },
        fighter1: { id: 1, name: "Jon Jones" },
        fighter2: { id: 2, name: "Tom Aspinall" },
      },
    ]);
    const result = await listPickEmTvFeedGames("mma_ufc", FROM, TO);
    expect(result.ok).toBe(true);
    expect(result.games.map((game) => game.startsAt)).toEqual(["2026-11-24T22:00:00.000Z"]);
  });
});

describe("F18: hockey overtime labels", () => {
  const labelFor = async (overrides: Record<string, unknown>) => {
    replies["/nhl/v1/games@2026-11-24"] = list([
      {
        id: 40,
        game_date: "2026-11-24",
        start_time_utc: "2026-11-24T23:00:00.000Z",
        home_team: { id: 1, full_name: "New Jersey Devils", tricode: "NJD" },
        away_team: { id: 9, full_name: "Columbus Blue Jackets", tricode: "CBJ" },
        home_score: 2,
        away_score: 2,
        game_state: "LIVE",
        status_state: "in_progress",
        in_intermission: false,
        postseason: false,
        ...overrides,
      },
    ]);
    return (await listPickEmTvFeedGames("icehockey_nhl", FROM, TO)).games[0]?.periodLabel ?? null;
  };

  it("regular season: OT, then a shootout with no clock", async () => {
    expect(await labelFor({ period: 4, time_remaining: "03:10" })).toBe("OT 3:10");
    expect(await labelFor({ period: 5, time_remaining: "00:00" })).toBe("SO");
  });

  it("playoffs: period 5 is double overtime, 6 triple", async () => {
    expect(await labelFor({ period: 4, time_remaining: "12:00", postseason: true })).toBe("OT 12:00");
    expect(await labelFor({ period: 5, time_remaining: "06:07", postseason: true })).toBe("2OT 6:07");
    expect(await labelFor({ period: 6, time_remaining: "19:59", postseason: true })).toBe("3OT 19:59");
    expect(await labelFor({ period: 5, time_remaining: "00:00", in_intermission: true, postseason: true })).toBe("2OT");
  });
});

describe("F20: the usage counter records bytes, not characters", () => {
  it("counts a non-ASCII team name by its UTF-8 size", async () => {
    vi.resetModules();
    const count = vi.fn();
    vi.doMock("@/lib/venueScreenUsageCounter", () => ({ countVenueScreenStateRequest: count }));
    vi.doMock("@/lib/venueScreen", () => ({ getVenueScreenState: vi.fn(async () => ({ mode: "idle", team: "Atlético" })) }));
    vi.doMock("@/lib/venueScreenDebug", () => ({ applyVenueScreenDebugMode: (state: unknown) => state }));
    const { GET } = await import("@/app/api/venue-screen/state/route");
    const response = await GET(new Request("https://example.test/api/venue-screen/state?venueId=v1"));
    const body = await response.text();
    expect(body.length).not.toBe(Buffer.byteLength(body));
    expect(count).toHaveBeenCalledWith(expect.objectContaining({ mode: "idle", bytes: Buffer.byteLength(body) }));
  });
});
