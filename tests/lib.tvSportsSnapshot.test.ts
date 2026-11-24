// The venue TV's shared sports copy (docs/fire-tv-app-plan.md Phase 9, D27): refresh cadence, the claim, the join key.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const listPickEmTvFeedGames = vi.fn();
vi.mock("@/lib/pickem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pickem")>();
  return { ...actual, listPickEmTvFeedGames: (...args: unknown[]) => listPickEmTvFeedGames(...args) };
});

type Call = { table: string; op: string; args: unknown[] };
const calls: Call[] = [];
let claimed: string[] = [];
let finalSeenReadError: { message: string } | null = null;
const builder = (table: string) => {
  const chain: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => {
    calls.push({ table, op, args });
    return chain;
  };
  for (const op of ["select", "in", "not", "lt", "gte", "order", "limit", "eq", "returns"]) chain[op] = record(op);
  chain.upsert = (...args: unknown[]) => {
    calls.push({ table, op: "upsert", args });
    return Promise.resolve({ error: null });
  };
  chain.delete = () => {
    calls.push({ table, op: "delete", args: [] });
    return chain;
  };
  chain.then = (resolve: (value: unknown) => unknown) =>
    resolve(
      table === "tv_sports_games" && calls.some((call) => call.table === table && call.op === "not") && finalSeenReadError
        ? { data: null, error: finalSeenReadError }
        : { data: [], error: null },
    );
  return chain;
};
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    rpc: (name: string, args: unknown) => {
      calls.push({ table: "rpc", op: name, args: [args] });
      return Promise.resolve({ data: claimed, error: null });
    },
    from: (table: string) => builder(table),
  },
}));

import { pickEmFeedGameKey } from "@/lib/pickem";
import {
  nextTvSportsRefreshMs,
  refreshTvSportsIfDue,
  TV_SPORT_KEYS,
  TV_SPORTS_EMPTY_REFRESH_MS,
  TV_SPORTS_LATER_HORIZON_MS,
  TV_SPORTS_LATER_REFRESH_MS,
  TV_SPORTS_LIVE_REFRESH_MS,
  TV_SPORTS_NO_REPLY_REFRESH_MS,
  TV_SPORTS_SLOW_FEED_REFRESH_MS,
} from "@/lib/tvSportsSnapshot";

const now = Date.parse("2026-11-22T20:00:00.000Z");
const HOUR = 60 * 60_000;
const at = (offsetMs: number, isFinal = false) => ({ startsAt: new Date(now + offsetMs).toISOString(), isFinal });

beforeEach(() => {
  calls.length = 0;
  claimed = [];
  finalSeenReadError = null;
  listPickEmTvFeedGames.mockReset();
});

describe("pickEmFeedGameKey", () => {
  it("joins NFL Pick 'Em and the other leagues' game ids on feed + provider id", () => {
    // NFL Pick 'Em ids put away before home; Pick 'Em's put home first. Both start with the provider id.
    const nflPick = pickEmFeedGameKey("nfl", "1392356__2026-11-15T18:00:00.000Z__Minnesota Vikings__Green Bay Packers");
    const nflFeed = pickEmFeedGameKey("americanfootball_nfl", "1392356");
    expect(nflPick).toBe("/nfl/v1/games#1392356");
    expect(nflFeed).toBe(nflPick);
    expect(pickEmFeedGameKey("nba", "77__x__a__b")).toBe(pickEmFeedGameKey("basketball_nba", "77"));
    // Same id, different sport: different games.
    expect(pickEmFeedGameKey("basketball_nba", "77")).not.toBe(pickEmFeedGameKey("icehockey_nhl", "77"));
    expect(pickEmFeedGameKey("no_such_sport", "1")).toBeNull();
    expect(pickEmFeedGameKey("nba", "")).toBeNull();
  });
});

describe("nextTvSportsRefreshMs", () => {
  it("2 min while a game is live or starts within 2 h", () => {
    expect(nextTvSportsRefreshMs("basketball_nba", { ok: true, games: [at(-HOUR)] }, now)).toBe(now + TV_SPORTS_LIVE_REFRESH_MS);
    expect(nextTvSportsRefreshMs("basketball_nba", { ok: true, games: [at(2 * HOUR)] }, now)).toBe(now + TV_SPORTS_LIVE_REFRESH_MS);
    expect(TV_SPORTS_LIVE_REFRESH_MS).toBe(2 * 60_000);
  });
  it("a game the feed calls live keeps the 2-minute pace even when its listed start is hours away", () => {
    expect(
      nextTvSportsRefreshMs("icehockey_nhl", { ok: true, games: [{ ...at(5 * HOUR), feedState: "live" }] }, now),
    ).toBe(now + TV_SPORTS_LIVE_REFRESH_MS);
  });
  it("10 min for the slow feeds (MMA, tennis)", () => {
    expect(nextTvSportsRefreshMs("mma_ufc", { ok: true, games: [at(-HOUR)] }, now)).toBe(now + TV_SPORTS_SLOW_FEED_REFRESH_MS);
    expect(nextTvSportsRefreshMs("tennis_wta", { ok: true, games: [at(HOUR)] }, now)).toBe(now + TV_SPORTS_SLOW_FEED_REFRESH_MS);
  });
  it("15 min with games later, 6 h with none or only finals, 30 min when the feed said nothing", () => {
    expect(nextTvSportsRefreshMs("basketball_nba", { ok: true, games: [at(5 * HOUR)] }, now)).toBe(now + TV_SPORTS_LATER_REFRESH_MS);
    expect(nextTvSportsRefreshMs("basketball_nba", { ok: true, games: [at(-3 * HOUR, true)] }, now)).toBe(now + TV_SPORTS_EMPTY_REFRESH_MS);
    expect(nextTvSportsRefreshMs("basketball_nba", { ok: true, games: [] }, now)).toBe(now + TV_SPORTS_EMPTY_REFRESH_MS);
    expect(nextTvSportsRefreshMs("basketball_nba", { ok: false, games: [] }, now)).toBe(now + TV_SPORTS_NO_REPLY_REFRESH_MS);
    // A "live" game from 9 hours ago is stale, not busy.
    expect(nextTvSportsRefreshMs("basketball_nba", { ok: true, games: [at(-9 * HOUR)] }, now)).toBe(now + TV_SPORTS_EMPTY_REFRESH_MS);
  });
});

describe("nextTvSportsRefreshMs: later games hold the 15-minute pace only within 18 h (CR1.4, F15)", () => {
  it("a game 17 h out → 15 min; 19 h out → 6 h (a 6 h wait still reaches it 13 h early)", () => {
    expect(TV_SPORTS_LATER_HORIZON_MS).toBe(18 * HOUR);
    expect(nextTvSportsRefreshMs("americanfootball_nfl", { ok: true, games: [at(17 * HOUR)] }, now)).toBe(
      now + TV_SPORTS_LATER_REFRESH_MS,
    );
    expect(nextTvSportsRefreshMs("americanfootball_nfl", { ok: true, games: [at(19 * HOUR)] }, now)).toBe(
      now + TV_SPORTS_EMPTY_REFRESH_MS,
    );
  });
});

const nbaGame = (overrides: Record<string, unknown> = {}) => ({
  feedGameKey: "/nba/v1/games#1",
  sportKey: "basketball_nba",
  league: "NBA",
  homeTeam: "Boston Celtics",
  awayTeam: "Los Angeles Lakers",
  homeAbbr: "BOS",
  awayAbbr: "LAL",
  startsAt: new Date(now - 3 * HOUR).toISOString(),
  isFinal: true,
  homeScore: 110,
  awayScore: 100,
  periodLabel: "Final",
  isPostseason: null,
  feedState: "final",
  ...overrides,
});

describe("refreshTvSportsIfDue: final_seen_at (CR1.4, F22)", () => {
  it("a failed read of stored finals leaves final_seen_at out of the write, and is logged", async () => {
    claimed = ["basketball_nba"];
    finalSeenReadError = { message: "timeout" };
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    listPickEmTvFeedGames.mockResolvedValue({ ok: true, games: [nbaGame()] });
    await refreshTvSportsIfDue(now);
    const rows = calls.find((call) => call.table === "tv_sports_games" && call.op === "upsert")?.args[0] as Array<
      Record<string, unknown>
    >;
    expect(rows[0].is_final).toBe(true);
    expect("final_seen_at" in rows[0]).toBe(false);
    expect(error).toHaveBeenCalledWith("[tv-sports] final-seen-read-failed", "timeout");
    error.mockRestore();
  });

  it("reads stored finals for every league it writes, including one with a failed request", async () => {
    claimed = ["basketball_nba"];
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    listPickEmTvFeedGames.mockResolvedValue({ ok: false, games: [nbaGame()] });
    await refreshTvSportsIfDue(now);
    const readIn = calls.find(
      (call, index) => call.table === "tv_sports_games" && call.op === "in" && calls[index - 1]?.op === "select",
    );
    expect(readIn?.args).toEqual(["sport_key", ["basketball_nba"]]);
    const rows = calls.find((call) => call.table === "tv_sports_games" && call.op === "upsert")?.args[0] as Array<
      Record<string, unknown>
    >;
    expect(rows[0].final_seen_at).toBe(new Date(now).toISOString());
  });
});

describe("refreshTvSportsIfDue", () => {
  it("claims every TV league in one call and fetches nothing when none is due", async () => {
    const report = await refreshTvSportsIfDue(now);
    expect(report).toEqual({ claimed: [], written: 0, failed: [] });
    expect(calls.filter((call) => call.table === "rpc")).toHaveLength(1);
    expect(calls[0].args[0]).toEqual({ p_sport_keys: [...TV_SPORT_KEYS], p_lease_seconds: 120 });
    expect(listPickEmTvFeedGames).not.toHaveBeenCalled();
    expect(TV_SPORT_KEYS.some((key) => key.includes("ncaab"))).toBe(false); // D19
  });

  it("fetches only the claimed leagues, writes their games, and keeps a failed league's old rows", async () => {
    claimed = ["basketball_nba", "icehockey_nhl"];
    listPickEmTvFeedGames.mockImplementation(async (sportKey: string) =>
      sportKey === "basketball_nba"
        ? {
            ok: true,
            games: [
              {
                feedGameKey: "/nba/v1/games#1",
                sportKey,
                league: "NBA",
                homeTeam: "Boston Celtics",
                awayTeam: "Los Angeles Lakers",
                homeAbbr: "BOS",
                awayAbbr: "LAL",
                startsAt: new Date(now - HOUR).toISOString(),
                isFinal: false,
                homeScore: 50,
                awayScore: 48,
                periodLabel: "Q3",
                isPostseason: null,
                feedState: "live",
              },
            ],
          }
        : { ok: false, games: [] },
    );
    const report = await refreshTvSportsIfDue(now);
    expect(listPickEmTvFeedGames).toHaveBeenCalledTimes(2);
    expect(report).toEqual({ claimed: ["basketball_nba", "icehockey_nhl"], written: 1, failed: ["icehockey_nhl"] });

    const gameUpsert = calls.find((call) => call.table === "tv_sports_games" && call.op === "upsert");
    expect((gameUpsert?.args[0] as Array<Record<string, unknown>>)[0]).toMatchObject({
      feed_game_key: "/nba/v1/games#1",
      final_seen_at: null,
      feed_state: "live",
      home_score: 50,
    });
    // The ghost delete names only the league that answered.
    const ghostDeleteIn = calls.find(
      (call, index) => call.table === "tv_sports_games" && call.op === "in" && calls[index - 1]?.op === "delete",
    );
    expect(ghostDeleteIn?.args).toEqual(["sport_key", ["basketball_nba"]]);
    const due = calls.find((call) => call.table === "tv_sports_refresh" && call.op === "upsert");
    expect(due?.args[0]).toEqual([
      { sport_key: "basketball_nba", due_at: new Date(now + TV_SPORTS_LIVE_REFRESH_MS).toISOString() },
      { sport_key: "icehockey_nhl", due_at: new Date(now + TV_SPORTS_NO_REPLY_REFRESH_MS).toISOString() },
    ]);
  });
});
