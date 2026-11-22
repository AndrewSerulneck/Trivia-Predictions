// Game ranking for the venue TV (docs/fire-tv-app-plan.md D18, Phase 9 step 4).
import { describe, expect, it } from "vitest";
import {
  classifyTvGame,
  leagueWeightAt,
  localPartsOf,
  rankTvPickEmLeaders,
  rankTvSportsGames,
  TV_PICKEM_BOARD_SIZE,
  TV_SPORTS_MAX_GAMES,
  TV_TICKER_MAX_GAMES,
  tvTickerGames,
  type TvSportsGameInput,
  type TvVenuePickCount,
} from "@/lib/tvSportsRelevance";

const TZ = "America/New_York";
const MIN = 60_000;
const HOUR = 60 * MIN;
// Sunday 2026-11-22, 3:00 PM New York (20:00 UTC).
const sundayAfternoon = Date.parse("2026-11-22T20:00:00.000Z");
// Tuesday 2026-11-24, 8:00 PM New York.
const tuesdayNight = Date.parse("2026-11-25T01:00:00.000Z");

let n = 0;
const g = (sportKey: string, startMs: number, extra: Partial<TvSportsGameInput> = {}): TvSportsGameInput => ({
  key: `game-${(n += 1)}`,
  sportKey,
  league: sportKey,
  homeTeam: "Home",
  awayTeam: "Away",
  homeAbbr: "HOM",
  awayAbbr: "AWY",
  startsAt: new Date(startMs).toISOString(),
  isFinal: false,
  finalSeenAt: null,
  homeScore: startMs <= sundayAfternoon ? 7 : null,
  awayScore: startMs <= sundayAfternoon ? 3 : null,
  periodLabel: "Q2",
  isPostseason: null,
  ...extra,
});
const rank = (games: TvSportsGameInput[], nowMs: number, counts: Record<string, TvVenuePickCount> | null = {}) =>
  rankTvSportsGames({ games, pickCounts: counts ? new Map(Object.entries(counts)) : null, timeZone: TZ, nowMs });

describe("local day and time", () => {
  it("reads the venue's zone", () => {
    expect(localPartsOf(sundayAfternoon, TZ)).toEqual({ dayKey: "2026-11-22", weekday: 0, hour: 15 });
    expect(localPartsOf(sundayAfternoon, "America/Los_Angeles")).toEqual({ dayKey: "2026-11-22", weekday: 0, hour: 12 });
    // A bad zone falls back to New York instead of throwing.
    expect(localPartsOf(sundayAfternoon, "Not/AZone").hour).toBe(15);
  });
});

describe("league weights (D18 starting values)", () => {
  const sat1pm = Date.parse("2026-11-21T18:00:00.000Z");
  it("NFL leads Sunday afternoon and Monday/Thursday nights", () => {
    expect(leagueWeightAt("americanfootball_nfl", sundayAfternoon, TZ)).toBeGreaterThan(leagueWeightAt("basketball_nba", sundayAfternoon, TZ));
    const mondayNight = Date.parse("2026-11-24T01:15:00.000Z");
    expect(leagueWeightAt("nfl", mondayNight, TZ)).toBe(10);
  });
  it("college football leads Saturdays", () => {
    expect(leagueWeightAt("americanfootball_ncaaf", sat1pm, TZ)).toBeGreaterThan(leagueWeightAt("americanfootball_nfl", sat1pm, TZ));
  });
  it("NBA and NHL lead weeknights; soccer weekend mornings; UFC Saturday nights", () => {
    expect(leagueWeightAt("basketball_nba", tuesdayNight, TZ)).toBeGreaterThan(leagueWeightAt("soccer_epl", tuesdayNight, TZ));
    expect(leagueWeightAt("icehockey_nhl", tuesdayNight, TZ)).toBeGreaterThan(leagueWeightAt("tennis_atp", tuesdayNight, TZ));
    const satMorning = Date.parse("2026-11-21T15:00:00.000Z");
    expect(leagueWeightAt("soccer_epl", satMorning, TZ)).toBe(6);
    const satNight = Date.parse("2026-11-22T03:00:00.000Z");
    expect(leagueWeightAt("mma_ufc", satNight, TZ)).toBe(7);
  });
});

describe("status", () => {
  it("live > starting within 2 h > final within the hour > later today; tomorrow and old finals drop", () => {
    const now = sundayAfternoon;
    expect(classifyTvGame(g("nba", now - HOUR), now, TZ)?.bucket).toBe("live");
    expect(classifyTvGame(g("nba", now + 2 * HOUR), now, TZ)?.bucket).toBe("soon");
    expect(classifyTvGame(g("nba", now + 2 * HOUR + 1), now, TZ)?.bucket).toBe("later");
    expect(classifyTvGame(g("nba", now + 10 * HOUR), now, TZ)).toBeNull(); // 1 AM Monday: tomorrow
    const finalAt = (seenAgoMs: number) => g("nba", now - 3 * HOUR, { isFinal: true, finalSeenAt: new Date(now - seenAgoMs).toISOString() });
    expect(classifyTvGame(finalAt(59 * MIN), now, TZ)?.bucket).toBe("final");
    expect(classifyTvGame(finalAt(61 * MIN), now, TZ)).toBeNull();
    expect(classifyTvGame(g("nba", now - 3 * HOUR, { isFinal: true, finalSeenAt: null }), now, TZ)).toBeNull();
  });
  it("trusts the feed's own state over the clock when it gives one", () => {
    const now = sundayAfternoon;
    // Feed says live before the listed start (an early puck drop): live.
    expect(classifyTvGame(g("icehockey_nhl", now + 10 * MIN, { feedState: "live" }), now, TZ)?.status).toBe("live");
    // Past the listed start but the feed says not begun (a delay): starting soon, not live.
    expect(classifyTvGame(g("icehockey_nhl", now - 10 * MIN, { feedState: "scheduled" }), now, TZ)).toEqual({ status: "scheduled", bucket: "soon" });
    // No state from the feed: the clock decides.
    expect(classifyTvGame(g("icehockey_nhl", now - 10 * MIN, { feedState: null }), now, TZ)?.status).toBe("live");
    // A delayed game shows no score yet.
    const delayed = rank([g("icehockey_nhl", now - 10 * MIN, { feedState: "scheduled", homeScore: 0, awayScore: 0 })], now)[0];
    expect(delayed).toMatchObject({ status: "scheduled", homeScore: null, awayScore: null });
  });

  it("a live game started over 8 hours ago is stale and dropped", () => {
    expect(classifyTvGame(g("nba", sundayAfternoon - 8 * HOUR - 1), sundayAfternoon, TZ)).toBeNull();
  });
});

describe("rankTvSportsGames", () => {
  it("puts NFL first on a Sunday afternoon", () => {
    const now = sundayAfternoon;
    const nba = g("basketball_nba", now - 30 * MIN, { league: "NBA" });
    const nfl = g("americanfootball_nfl", now - 30 * MIN, { league: "NFL" });
    const nhl = g("icehockey_nhl", now - 30 * MIN, { league: "NHL" });
    expect(rank([nba, nhl, nfl], now).map((game) => game.league)).toEqual(["NFL", "NBA", "NHL"]);
  });

  it("puts NBA and NHL over soccer and tennis on a weeknight", () => {
    const now = tuesdayNight;
    const games = [
      g("soccer_epl", now - 30 * MIN, { league: "EPL" }),
      g("tennis_atp", now - 30 * MIN, { league: "ATP" }),
      g("icehockey_nhl", now - 30 * MIN, { league: "NHL" }),
      g("basketball_nba", now - 30 * MIN, { league: "NBA" }),
    ];
    expect(rank(games, now).map((game) => game.league).slice(0, 2)).toEqual(["NBA", "NHL"]);
  });

  it("this venue's picks are the strongest signal", () => {
    const now = sundayAfternoon;
    const nfl = g("americanfootball_nfl", now - 30 * MIN, { league: "NFL" });
    const nba = g("basketball_nba", now - 30 * MIN, { league: "NBA" });
    expect(rank([nfl, nba], now, { [nba.key]: { home: 5, away: 2 } })[0].league).toBe("NBA");
  });

  it("live beats starting soon, which beats later today", () => {
    const now = tuesdayNight - 3 * HOUR; // 5 PM
    const later = g("basketball_nba", now + 5 * HOUR, { key: "later" });
    const soon = g("basketball_nba", now + HOUR, { key: "soon" });
    const live = g("basketball_nba", now - HOUR, { key: "live" });
    expect(rank([later, soon, live], now).map((game) => game.key)).toEqual(["live", "soon", "later"]);
  });

  it("boosts a postseason game only when the feed marks it", () => {
    const now = tuesdayNight;
    const a = g("basketball_nba", now - 30 * MIN, { key: "a" });
    const b = g("basketball_nba", now - 30 * MIN, { key: "b", isPostseason: true });
    expect(rank([a, b], now)[0].key).toBe("b");
    expect(rank([a, { ...b, isPostseason: null }], now)[0].key).toBe("a"); // tie → earlier start, then key
  });

  it("missing data is unknown, never zero", () => {
    const now = sundayAfternoon;
    const scheduled = g("americanfootball_nfl", now + HOUR, { homeScore: 0, awayScore: 0 });
    const live = g("americanfootball_nfl", now - HOUR, { homeScore: null, awayScore: 3 });
    const ranked = rank([scheduled, live], now, null);
    const byKey = new Map(ranked.map((game) => [game.key, game]));
    expect(byKey.get(scheduled.key)).toMatchObject({ status: "scheduled", homeScore: null, awayScore: null, periodLabel: null, picks: null, homePickPct: null });
    expect(byKey.get(live.key)).toMatchObject({ status: "live", homeScore: null, awayScore: 3, picks: null });
    // Known picks: 0 is a real count; the split needs at least one pick.
    expect(rank([live], now, {})[0]).toMatchObject({ picks: 0, homePickPct: null });
    expect(rank([live], now, { [live.key]: { home: 1, away: 3 } })[0]).toMatchObject({ picks: 4, homePickPct: 25 });
  });

  it("caps the games sent to the TV and drops duplicates", () => {
    const now = tuesdayNight;
    const games = Array.from({ length: 30 }, (_, index) => g("basketball_nba", now - index * MIN));
    expect(rank(games, now)).toHaveLength(TV_SPORTS_MAX_GAMES);
    expect(TV_SPORTS_MAX_GAMES).toBe(16);
    const one = g("basketball_nba", now - MIN);
    expect(rank([one, one, { ...one }], now)).toHaveLength(1);
  });
});

describe("board and ticker", () => {
  const ranked = rank(Array.from({ length: 16 }, (_, index) => g("basketball_nba", tuesdayNight - (index + 1) * MIN)), tuesdayNight);
  it("the ticker skips the board's games while the board is on screen (D15)", () => {
    const board = ranked.slice(0, TV_PICKEM_BOARD_SIZE).map((game) => game.key);
    const onBoardSlide = tvTickerGames(ranked, true).map((game) => game.key);
    expect(onBoardSlide.some((key) => board.includes(key))).toBe(false);
    expect(onBoardSlide).toHaveLength(TV_TICKER_MAX_GAMES);
    expect(tvTickerGames(ranked, false).slice(0, TV_PICKEM_BOARD_SIZE).map((game) => game.key)).toEqual(board);
    expect(tvTickerGames(ranked, false)).toHaveLength(TV_TICKER_MAX_GAMES);
  });
});

describe("rankTvPickEmLeaders", () => {
  it("ranks today's record, wins then fewest losses; pending and pushes don't count", () => {
    const picks = [
      ...Array.from({ length: 3 }, () => ({ userId: "a", username: "Ann", status: "won" })),
      { userId: "a", username: "Ann", status: "lost" },
      ...Array.from({ length: 3 }, () => ({ userId: "b", username: "Bo", status: "won" })),
      { userId: "c", username: "Cy", status: "pending" },
      { userId: "d", username: null, status: "lost" },
      { userId: "e", username: "Ed", status: "push" },
    ];
    expect(rankTvPickEmLeaders(picks)).toEqual([
      { rank: 1, username: "Bo", wins: 3, losses: 0 },
      { rank: 2, username: "Ann", wins: 3, losses: 1 },
      { rank: 3, username: "Player", wins: 0, losses: 1 },
    ]);
  });
  it("is null when nobody has a settled pick", () => {
    expect(rankTvPickEmLeaders([{ userId: "c", username: "Cy", status: "pending" }])).toBeNull();
    expect(rankTvPickEmLeaders([])).toBeNull();
  });
});
