import { beforeEach, describe, expect, it, vi } from "vitest";

// Pick 'Em plan Phase 7.5.1 (finding F12): the admin "settle game" action only grades. The money
// moves in pay_pickem_points, which stamps reward_claimed_at, so the cron's next run can't pay the
// same win again (the old path credited users.points directly and left the stamp null: 20, not 10).
// Spread picks can't be graded from a winning team alone, so they stay pending.

vi.mock("server-only", () => ({}));

type MockRow = Record<string, unknown>;

const store = vi.hoisted(() => ({
  tables: {} as Record<string, MockRow[]>,
  nflModes: {} as Record<string, "standard" | "spread" | Error>,
  rpcError: null as { message: string } | null,
  usersWrites: 0,
}));

vi.mock("@/lib/venueGameSettings", () => ({
  DEFAULT_CFB_PICKEM_SCORING_MODE: "spread",
  getVenueNFLPickEmScoringMode: vi.fn((venueId: string) => {
    const mode = store.nflModes[venueId] ?? "standard";
    return mode instanceof Error ? Promise.reject(mode) : Promise.resolve(mode);
  }),
  getVenueCollegeFootballPickEmScoringMode: vi.fn(() => Promise.resolve("spread")),
}));

vi.mock("@/lib/challengeCampaigns", () => ({
  applyChallengeCampaignPoints: vi.fn(),
}));

vi.mock("@/lib/balldontlie", () => ({
  fetchBallDontLieList: vi.fn(() => Promise.resolve([])),
}));

vi.mock("@/lib/polymarket", () => ({
  getPredictionMarketById: vi.fn(),
  listResolvedPredictionOutcomes: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => {
  const createBuilder = (table: string) => {
    const filters: Array<(row: MockRow) => boolean> = [];
    let patch: MockRow | null = null;
    const orderBy: string[] = [];
    let limitTo: number | null = null;

    const at = (value: unknown) => Date.parse(String(value ?? ""));
    // Timestamps compare as instants, anything else (ids) as text.
    const compare = (a: unknown, b: unknown) => {
      const iso = /^\d{4}-\d{2}-\d{2}T/;
      if (iso.test(String(a)) && iso.test(String(b))) return Date.parse(String(a)) - Date.parse(String(b));
      return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
    };
    const filteredRows = () => {
      const rows = (store.tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
      rows.sort((a, b) => {
        for (const column of orderBy) {
          const cmp = compare(a[column], b[column]);
          if (cmp !== 0) return cmp;
        }
        return 0;
      });
      return limitTo === null ? rows : rows.slice(0, limitTo);
    };
    const resolve = () => {
      if (patch) {
        if (table === "users") store.usersWrites += 1;
        const rows = filteredRows();
        for (const row of rows) Object.assign(row, patch);
        return Promise.resolve({ data: rows.map((row) => ({ ...row })), error: null });
      }
      return Promise.resolve({ data: filteredRows().map((row) => ({ ...row })), error: null });
    };

    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      lte: (column: string, value: unknown) => {
        filters.push((row) => at(row[column]) <= at(value));
        return builder;
      },
      lt: (column: string, value: unknown) => {
        filters.push((row) => at(row[column]) < at(value));
        return builder;
      },
      order: (column: string) => {
        orderBy.push(column);
        return builder;
      },
      limit: (count: number) => {
        limitTo = count;
        return builder;
      },
      update: (value: MockRow) => {
        patch = value;
        return builder;
      },
      then: (
        onfulfilled?: ((value: { data: MockRow[] | null; error: { message: string } | null }) => unknown) | null,
        onrejected?: ((reason: unknown) => unknown) | null
      ) => resolve().then(onfulfilled, onrejected),
    };
    return builder;
  };

  // pay_pickem_points as the migration writes it: stamp every won, unpaid pick once, +10 each.
  const rpc = vi.fn((name: string, args: { p_user_id: string | null; p_limit: number }) => {
    if (name !== "pay_pickem_points") {
      return Promise.resolve({ data: null, error: { message: `unexpected rpc ${name}` } });
    }
    if (store.rpcError) return Promise.resolve({ data: null, error: store.rpcError });
    const due = (store.tables.pickem_picks ?? [])
      .filter(
        (pick) =>
          pick.status === "won" &&
          pick.reward_claimed_at === null &&
          (!args.p_user_id || pick.user_id === args.p_user_id)
      )
      .slice(0, args.p_limit);
    const paidAt = new Date().toISOString();
    for (const pick of due) {
      pick.reward_claimed_at = paidAt;
      const user = (store.tables.users ?? []).find((row) => row.id === pick.user_id);
      if (user) user.points = Number(user.points) + 10;
    }
    return Promise.resolve({
      data: due.map((pick) => ({
        pick_id: pick.id,
        user_id: pick.user_id,
        venue_id: pick.venue_id,
        sport_slug: pick.sport_slug,
        starts_at: pick.starts_at,
        resolved_at: pick.resolved_at,
        points_awarded: 10,
      })),
      error: null,
    });
  });

  return {
    supabaseAdmin: {
      from: (table: string) => createBuilder(table),
      rpc,
    },
  };
});

import { settleAdminPickEmGame } from "@/lib/admin";
import { settlePendingPickEmPicks } from "@/lib/pickem";

const GAME_ID = "game-1";
const HOME = "team-home";
const AWAY = "team-away";

const pick = (overrides: MockRow = {}): MockRow => ({
  id: "pick",
  user_id: "user-a",
  venue_id: "venue-1",
  sport_slug: "nba",
  sport_key: "basketball_nba",
  league: "NBA",
  game_id: GAME_ID,
  home_team_id: HOME,
  away_team_id: AWAY,
  selected_team_id: HOME,
  winning_team_id: null,
  game_label: "Away at Home",
  home_team: "Home",
  away_team: "Away",
  starts_at: "2026-10-31T23:00:00.000Z",
  selected_team: "Home",
  selected_side: "home",
  status: "pending",
  home_score: null,
  away_score: null,
  created_at: "2026-10-31T12:00:00.000Z",
  updated_at: "2026-10-31T12:00:00.000Z",
  resolved_at: null,
  reward_points: 10,
  reward_claimed_at: null,
  scoring_mode: null,
  home_spread: null,
  away_spread: null,
  ...overrides,
});

const rowById = (id: string) => store.tables.pickem_picks.find((row) => row.id === id)!;
const pointsOf = (userId: string) => Number(store.tables.users.find((row) => row.id === userId)!.points);

beforeEach(() => {
  store.nflModes = {};
  store.rpcError = null;
  store.usersWrites = 0;
  store.tables = {
    users: [
      { id: "user-a", points: 100 },
      { id: "user-b", points: 100 },
      { id: "user-c", points: 100 },
    ],
    pickem_picks: [],
  };
});

describe("settleAdminPickEmGame", () => {
  it("pays each admin-settled win exactly once across the admin call and the next cron run", async () => {
    store.tables.pickem_picks = [
      pick({ id: "a-win", user_id: "user-a" }),
      pick({ id: "b-loss", user_id: "user-b", selected_team_id: AWAY, selected_side: "away" }),
      pick({ id: "c-nfl-win", user_id: "user-c", sport_slug: "nfl", sport_key: "americanfootball_nfl", venue_id: "venue-nfl" }),
    ];
    store.nflModes = { "venue-nfl": "standard" };

    const result = await settleAdminPickEmGame({ gameId: GAME_ID, winningTeamId: HOME });

    expect(result).toEqual({
      affectedPicks: 3,
      winners: 2,
      losers: 1,
      spreadPicksLeft: 0,
      scoringModeUnresolvedLeft: 0,
      picksPaid: 2,
      pointsPaid: 20,
      payoutError: null,
    });
    expect(store.usersWrites).toBe(0);
    expect(rowById("a-win")).toMatchObject({ status: "won", winning_team_id: HOME, reward_points: 10 });
    expect(rowById("a-win").reward_claimed_at).not.toBeNull();
    expect(rowById("b-loss")).toMatchObject({ status: "lost", reward_claimed_at: null });
    // NFL picks are stamped with the venue's rule at settlement, as the cron stamps them.
    expect(rowById("c-nfl-win")).toMatchObject({ status: "won", scoring_mode: "standard" });
    expect(rowById("a-win").scoring_mode).toBeNull();

    const cron = await settlePendingPickEmPicks();
    expect(cron.payout?.picksPaid).toBe(0);

    expect(pointsOf("user-a")).toBe(110);
    expect(pointsOf("user-b")).toBe(100);
    expect(pointsOf("user-c")).toBe(110);
  });

  it("leaves spread picks and unreadable-rule NFL picks pending for automatic grading", async () => {
    store.tables.pickem_picks = [
      pick({ id: "cfb-spread", sport_slug: "ncaaf", sport_key: "americanfootball_ncaaf", scoring_mode: "spread" }),
      pick({ id: "cfb-winner", sport_slug: "ncaaf", sport_key: "americanfootball_ncaaf", scoring_mode: "standard" }),
      pick({ id: "nfl-spread", sport_slug: "nfl", sport_key: "americanfootball_nfl", venue_id: "venue-spread" }),
      pick({ id: "nfl-unread", sport_slug: "nfl", sport_key: "americanfootball_nfl", venue_id: "venue-broken" }),
    ];
    store.nflModes = { "venue-spread": "spread", "venue-broken": new Error("read failed") };

    const result = await settleAdminPickEmGame({ gameId: GAME_ID, winningTeamId: HOME });

    expect(result).toMatchObject({
      affectedPicks: 1,
      winners: 1,
      losers: 0,
      spreadPicksLeft: 2,
      scoringModeUnresolvedLeft: 1,
      picksPaid: 1,
      pointsPaid: 10,
    });
    expect(rowById("cfb-spread").status).toBe("pending");
    expect(rowById("nfl-spread").status).toBe("pending");
    expect(rowById("nfl-unread").status).toBe("pending");
    // A college winner-mode pick keeps the rule it was made under.
    expect(rowById("cfb-winner")).toMatchObject({ status: "won", scoring_mode: "standard" });
  });

  it("keeps the grades and reports a failed payment instead of throwing", async () => {
    store.tables.pickem_picks = [pick({ id: "a-win" })];
    store.rpcError = { message: "boom" };

    const result = await settleAdminPickEmGame({ gameId: GAME_ID, winningTeamId: HOME });

    expect(result).toMatchObject({ winners: 1, picksPaid: 0, pointsPaid: 0, payoutError: "boom" });
    expect(rowById("a-win")).toMatchObject({ status: "won", reward_claimed_at: null });
    expect(pointsOf("user-a")).toBe(100);
    expect(store.usersWrites).toBe(0);
  });

  it("grades nothing that is no longer pending", async () => {
    store.tables.pickem_picks = [pick({ id: "already", status: "won", reward_claimed_at: "2026-10-31T23:59:00.000Z" })];

    const result = await settleAdminPickEmGame({ gameId: GAME_ID, winningTeamId: AWAY });

    expect(result).toMatchObject({ affectedPicks: 0, winners: 0, losers: 0, picksPaid: 0 });
    expect(rowById("already")).toMatchObject({ status: "won" });
    expect(pointsOf("user-a")).toBe(100);
  });
});
