import { beforeEach, describe, expect, it, vi } from "vitest";

// Pick 'Em plan Phase 4b: the Pick 'Em Prize tiebreaker — which game is the question
// (lib/pickemPrizeTiebreaker.ts) and the route players save a guess through
// (app/api/pickem/prize-tiebreaker). Provider, database and session are stubbed.

const state = vi.hoisted(() => ({
  providerCalls: [] as Array<{ keys: string[]; from: string; to: string }>,
  gamesByDay: {} as Record<string, unknown[]>,
  prizes: [] as Array<Record<string, unknown>>,
  session: { userId: "player-1" as string | null, forbidden: false },
  upserts: [] as Array<Record<string, unknown>>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/pickem", () => ({
  listPickEmProviderGames: vi.fn(async (keys: string[], from: string, to: string) => {
    state.providerCalls.push({ keys, from, to });
    return state.gamesByDay[from.slice(0, 10)] ?? [];
  }),
}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
        upsert: (row: Record<string, unknown>) => {
          state.upserts.push(row);
          return chain;
        },
        single: async () => ({
          data: { ...state.upserts[state.upserts.length - 1], user_id: "player-1" },
          error: null,
        }),
      };
      return chain;
    },
  },
}));
vi.mock("@/lib/challengeCampaigns", () => ({ listActivePickEmPrizeCampaigns: vi.fn(async () => state.prizes) }));
vi.mock("@/lib/timezone", () => ({ getVenueTimezone: vi.fn(async () => "America/New_York") }));
vi.mock("@/lib/serverSession", () => ({ resolveRequestUserId: vi.fn(() => state.session) }));
vi.mock("@/lib/venuePresence", () => ({
  maybeRequireActiveVenuePresence: vi.fn(async () => null),
  venuePresenceErrorResponse: vi.fn(() => null),
}));

import { GET, POST } from "@/app/api/pickem/prize-tiebreaker/route";
import {
  PICKEM_PRIZE_TIEBREAKER_LOCKED_MESSAGE,
  clearPickEmPrizeTiebreakerCache,
  findPickEmPrizeTiebreakerGame,
  lastPickEmPrizeGame,
  savePickEmPrizeGuess,
} from "@/lib/pickemPrizeTiebreaker";

const game = (id: string, startsAt: string, extra: Record<string, unknown> = {}) => ({
  id,
  sportKey: "americanfootball_ncaaf",
  homeTeam: "Home",
  awayTeam: "Away",
  startsAt,
  homeScore: null,
  awayScore: null,
  isFinal: false,
  ...extra,
});

beforeEach(() => {
  state.providerCalls = [];
  state.gamesByDay = {};
  state.prizes = [];
  state.session = { userId: "player-1", forbidden: false };
  state.upserts = [];
  clearPickEmPrizeTiebreakerCache();
  vi.useRealTimers();
});

describe("the tiebreaker game", () => {
  it("is the latest start, ties by game id", () => {
    expect(
      lastPickEmPrizeGame([game("b", "2026-11-08T03:30:00Z"), game("a", "2026-11-08T03:30:00Z"), game("c", "2026-11-08T00:00:00Z")])?.id,
    ).toBe("a");
    expect(lastPickEmPrizeGame([game("x", "not a date")])).toBeNull();
  });

  it("is on the period's last day with games in its score leagues, stepping back", async () => {
    // Saturday prize over Nov 1–7 (a range): Nov 7 has nothing, Nov 6 does. Day boundaries are New York midnights.
    state.gamesByDay["2026-11-06"] = [game("fri-late", "2026-11-07T03:00:00Z"), game("fri-early", "2026-11-07T00:00:00Z")];
    const found = await findPickEmPrizeTiebreakerGame({
      scope: { sports: ["ncaaf", "mma"], leagues: [] },
      period: { startDate: "2026-11-01", endDate: "2026-11-07" },
      timeZone: "America/New_York",
      nowMs: Date.parse("2026-11-06T12:00:00Z"),
    });
    expect(found).toMatchObject({ gameId: "fri-late", isLocked: false, isFinal: false });
    expect(state.providerCalls.map((call) => [call.keys, call.from])).toEqual([
      [["americanfootball_ncaaf"], "2026-11-07T05:00:00.000Z"],
      [["americanfootball_ncaaf"], "2026-11-06T05:00:00.000Z"],
    ]);
    // MMA has no score, so it is never asked.
  });

  it("an MMA/tennis-only scope has no tiebreaker game, without asking the provider", async () => {
    expect(
      await findPickEmPrizeTiebreakerGame({
        scope: { sports: ["mma"], leagues: [] },
        period: { startDate: "2026-11-07", endDate: "2026-11-07" },
        timeZone: "America/New_York",
      }),
    ).toBeNull();
    expect(state.providerCalls).toEqual([]);
  });

  it("refuses a guess out of range or once the game has started, before touching the database", async () => {
    const base = {
      challengeId: "c1",
      periodStart: new Date("2026-11-07T05:00:00Z"),
      userId: "player-1",
      venueId: "venue-a",
      game: { gameId: "g", sportKey: "americanfootball_ncaaf", startsAt: "2026-11-08T03:30:00Z" },
      nowMs: Date.parse("2026-11-07T20:00:00Z"),
    };
    await expect(savePickEmPrizeGuess({ ...base, predictedTotal: 401 })).rejects.toThrow(/0 to 400/);
    await expect(savePickEmPrizeGuess({ ...base, predictedTotal: 12.5 })).rejects.toThrow(/whole number/);
    await expect(savePickEmPrizeGuess({ ...base, predictedTotal: 50, nowMs: Date.parse("2026-11-08T03:30:00Z") })).rejects.toThrow(
      PICKEM_PRIZE_TIEBREAKER_LOCKED_MESSAGE,
    );
    expect(state.upserts).toEqual([]);
  });
});

const mostRight = {
  id: "c-most",
  rewardDefinitionId: "pickem_challenge",
  winCondition: "game_winner",
  pickemTiers: null,
  pickemScope: { sports: ["ncaaf"], leagues: [] },
  pickemWindow: { kind: "weekday", weekday: "sat" },
};

const post = (body: Record<string, unknown>) =>
  POST(new Request("http://x/api/pickem/prize-tiebreaker", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/pickem/prize-tiebreaker", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-07T20:00:00Z")); // Saturday 3pm in New York
    state.gamesByDay["2026-11-07"] = [game("sat-late", "2026-11-08T03:30:00Z")];
  });

  it("saves the signed-in player's guess on today's game", async () => {
    state.prizes = [mostRight];
    const response = await post({ venueId: "venue-a", campaignId: "c-most", predictedTotal: 51 });
    expect(response.status).toBe(200);
    expect(state.upserts[0]).toMatchObject({
      challenge_id: "c-most",
      period_start: "2026-11-07T05:00:00.000Z",
      user_id: "player-1",
      venue_id: "venue-a",
      game_id: "sat-late",
      sport_key: "americanfootball_ncaaf",
      predicted_total: 51,
    });
  });

  it("refuses a forged player, no session, another kind of prize, and a day the prize doesn't run", async () => {
    state.prizes = [mostRight, { ...mostRight, id: "c-target", winCondition: "points_threshold" }];
    state.session = { userId: null, forbidden: true };
    expect((await post({ venueId: "venue-a", campaignId: "c-most", predictedTotal: 51 })).status).toBe(403);
    state.session = { userId: null, forbidden: false };
    expect((await post({ venueId: "venue-a", campaignId: "c-most", predictedTotal: 51 })).status).toBe(401);
    state.session = { userId: "player-1", forbidden: false };
    expect((await post({ venueId: "venue-a", campaignId: "c-target", predictedTotal: 51 })).status).toBe(404);
    state.prizes = [{ ...mostRight, pickemWindow: { kind: "weekday", weekday: "sun" } }];
    expect((await post({ venueId: "venue-a", campaignId: "c-most", predictedTotal: 51 })).status).toBe(404);
    expect(state.upserts).toEqual([]);
  });

  it("answers 409 once the game has started and 400 for a bad total", async () => {
    state.prizes = [mostRight];
    expect((await post({ venueId: "venue-a", campaignId: "c-most", predictedTotal: -3 })).status).toBe(400);
    vi.setSystemTime(new Date("2026-11-08T03:31:00Z")); // still Saturday in New York, game started
    clearPickEmPrizeTiebreakerCache();
    expect((await post({ venueId: "venue-a", campaignId: "c-most", predictedTotal: 51 })).status).toBe(409);
  });

  it("GET returns the game and only the player's own guess", async () => {
    state.prizes = [mostRight];
    const response = await GET(new Request("http://x/api/pickem/prize-tiebreaker?venueId=venue-a&campaignId=c-most"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, game: { gameId: "sat-late", isLocked: false }, guess: null });
  });
});
