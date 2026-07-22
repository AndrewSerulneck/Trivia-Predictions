import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Fake chainable Supabase query builder ───────────────────────────────────
// Mirrors the reusable pattern in tests/lib.category-blitz-continuous-engine.test.ts:
// an in-memory table store with enough of the query-builder surface
// (select/eq/in/is/order/limit/returns/maybeSingle, plain-await via `then`,
// update/upsert) for getChallengeCampaignSnapshotForUser's read path.
type Row = Record<string, unknown>;

// Per-table .from() call counter — lets a test assert the query fan-out no longer
// scales with campaign count / historical cycle count (Phase 5 batching).
let fromCallCounts: Record<string, number> = {};

function createFakeSupabase(store: Record<string, Row[]>) {
  class Builder {
    private filters: Array<(row: Row) => boolean> = [];

    constructor(private table: string) {}

    select(_cols?: string) {
      return this;
    }
    eq(col: string, val: unknown) {
      this.filters.push((r) => r[col] === val);
      return this;
    }
    in(col: string, vals: unknown[]) {
      this.filters.push((r) => vals.includes(r[col]));
      return this;
    }
    is(col: string, val: null) {
      this.filters.push((r) => (r[col] ?? null) === val);
      return this;
    }
    order(_col: string, _opts?: { ascending?: boolean; nullsFirst?: boolean }) {
      return this;
    }
    limit(_n: number) {
      return this;
    }
    // Minimal PostgREST `.or("col.op.val,col.op.val")` support — only the
    // operators listChallengeCampaigns actually emits (array overlap `ov` and
    // `eq`), just enough for the venue_ids-scoping test below.
    or(expr: string) {
      const clauses = expr.split(",").map((clause) => {
        const [col, op, rawVal] = clause.split(".");
        return (r: Row) => {
          const arr = Array.isArray(r[col]) ? (r[col] as unknown[]) : [];
          if (op === "ov") {
            const val = rawVal.replace(/^\{|\}$/g, "");
            return arr.includes(val);
          }
          if (op === "eq") {
            const val = rawVal.replace(/^\{|\}$/g, "");
            return val === "" ? arr.length === 0 : arr.length === 1 && arr[0] === val;
          }
          return false;
        };
      });
      this.filters.push((r) => clauses.some((clause) => clause(r)));
      return this;
    }
    returns<T>() {
      return this as unknown as T;
    }

    private filtered(): Row[] {
      return (store[this.table] ?? []).filter((r) => this.filters.every((f) => f(r)));
    }

    async maybeSingle() {
      const rows = this.filtered();
      return { data: rows[0] ?? null, error: null };
    }

    then(resolve: (v: { data: Row[]; error: null }) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve({ data: this.filtered(), error: null }).then(resolve, reject);
    }

    upsert(_payload: Row, _opts?: Record<string, unknown>) {
      return Promise.resolve({ data: null, error: null });
    }

    update(payload: Row) {
      const table = this.table;
      const filters = this.filters;
      return {
        eq: (col: string, val: unknown) => {
          const rows = (store[table] ?? []).filter(
            (r) => filters.every((f) => f(r)) && r[col] === val
          );
          for (const row of rows) Object.assign(row, payload);
          return Promise.resolve({ data: null, error: null });
        },
      };
    }
  }

  return {
    from: (table: string) => {
      fromCallCounts[table] = (fromCallCounts[table] ?? 0) + 1;
      return new Builder(table);
    },
  };
}

let store: Record<string, Row[]>;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({
  get supabaseAdmin() {
    return createFakeSupabase(store);
  },
}));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => {}) }));

import { getChallengeCampaignSnapshotForUser, listChallengeCampaignWinsForUser } from "@/lib/challengeCampaigns";

const VENUE_ID = "venue-1";
const NOW_ISO = "2026-07-20T18:00:00.000Z"; // Monday
const EPOCH_ISO = new Date(0).toISOString();

function campaignRow(overrides: Row = {}): Row {
  return {
    id: "camp-1",
    created_at: "2026-07-01T00:00:00.000Z",
    name: "Live Trivia Challenge",
    image_url: null,
    image_scale: null,
    image_focus_x: null,
    image_focus_y: null,
    image_fit: null,
    rules: "Earn 500 points in Live Trivia",
    venue_ids: [VENUE_ID],
    schedule_type: "single_day",
    active_days: [],
    start_date: null,
    start_time: null,
    end_day: null,
    end_time: null,
    end_date: null,
    game_types: ["live-trivia"],
    point_multiplier: 1,
    points_required_to_win: 500,
    recurring_type: "none",
    display_order: null,
    challenge_mode: "progress",
    leaderboard_display_limit: 10,
    leaderboard_tiebreaker: "first_to_score",
    winner_user_id: null,
    prize_type: "free_appetizer",
    prize_gift_certificate_amount: null,
    is_active: true,
    created_by_owner_id: null,
    winner_quota: 2,
    reward_definition_id: "live_trivia_challenge",
    prize_kind: null,
    prize_menu_item: null,
    prize_menu_item_name: null,
    prize_discount_kind: null,
    prize_discount_value: null,
    ...overrides,
  };
}

beforeEach(() => {
  store = {
    challenge_campaigns: [campaignRow()],
    users: [
      { id: "u1", username: "alice" },
      { id: "u2", username: "bob" },
      { id: "u3", username: "carol" },
    ],
    challenge_campaign_progress: [],
    venues: [{ id: VENUE_ID, timezone: "America/New_York" }],
    challenge_cycle_winners: [],
    challenge_campaign_redemptions: [],
  };
  fromCallCounts = {};
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW_ISO));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getChallengeCampaignSnapshotForUser — multi-winner card state (Phase 6)", () => {
  it("gauge state: no winners yet, viewer has not won, quota remaining > 0", async () => {
    store.challenge_campaign_progress.push({
      id: "p1",
      challenge_id: "camp-1",
      user_id: "u3",
      venue_id: VENUE_ID,
      points_earned: 200,
      updated_at: NOW_ISO,
    });

    const [card] = await getChallengeCampaignSnapshotForUser({ userId: "u3", venueId: VENUE_ID });

    expect(card.viewerWon).toBe(false);
    expect(card.quotaRemaining).toBe(2);
    expect(card.winnerUsernames).toEqual([]);
    expect(card.progressPoints).toBe(200);
  });

  it("you-won state: viewer is among the current cycle's winners", async () => {
    store.challenge_cycle_winners.push({
      id: "w1",
      challenge_id: "camp-1",
      cycle_start: EPOCH_ISO,
      winner_user_id: "u1",
      venue_id: VENUE_ID,
      points_earned: 600,
      finalized_at: "2026-07-20T10:00:00.000Z",
      prize_type: "free_appetizer",
    });

    const [card] = await getChallengeCampaignSnapshotForUser({ userId: "u1", venueId: VENUE_ID });

    expect(card.viewerWon).toBe(true);
    expect(card.quotaRemaining).toBe(1); // quota 2, 1 winner so far
    expect(card.winnerUsernames).toEqual(["alice"]);
  });

  it("quota-exhausted congrats state: quota filled by others, viewer did not win", async () => {
    store.challenge_cycle_winners.push(
      {
        id: "w1",
        challenge_id: "camp-1",
        cycle_start: EPOCH_ISO,
        winner_user_id: "u1",
        venue_id: VENUE_ID,
        points_earned: 600,
        finalized_at: "2026-07-20T09:00:00.000Z",
        prize_type: "free_appetizer",
      },
      {
        id: "w2",
        challenge_id: "camp-1",
        cycle_start: EPOCH_ISO,
        winner_user_id: "u2",
        venue_id: VENUE_ID,
        points_earned: 550,
        finalized_at: "2026-07-20T11:00:00.000Z",
        prize_type: "free_appetizer",
      }
    );

    const [card] = await getChallengeCampaignSnapshotForUser({ userId: "u3", venueId: VENUE_ID });

    expect(card.viewerWon).toBe(false);
    expect(card.quotaRemaining).toBe(0);
    // Oldest-first ordering by finalized_at.
    expect(card.winnerUsernames).toEqual(["alice", "bob"]);
  });

  it("prizeClaimedAt reflects the viewer's OWN redemption row for the current cycle only", async () => {
    store.challenge_cycle_winners.push({
      id: "w1",
      challenge_id: "camp-1",
      cycle_start: EPOCH_ISO,
      winner_user_id: "u1",
      venue_id: VENUE_ID,
      points_earned: 600,
      finalized_at: "2026-07-20T09:00:00.000Z",
      prize_type: "free_appetizer",
    });
    store.challenge_campaign_redemptions.push({
      challenge_id: "camp-1",
      winner_user_id: "u1",
      venue_id: VENUE_ID,
      cycle_start: EPOCH_ISO,
      claimed_at: "2026-07-20T12:00:00.000Z",
      prize_expires_at: "2026-07-27T00:00:00.000Z",
      prize_redeemed_at: null,
    });

    const [card] = await getChallengeCampaignSnapshotForUser({ userId: "u1", venueId: VENUE_ID });
    expect(card.prizeClaimedAt).toBe("2026-07-20T12:00:00.000Z");

    const [otherViewerCard] = await getChallengeCampaignSnapshotForUser({ userId: "u2", venueId: VENUE_ID });
    expect(otherViewerCard.prizeClaimedAt).toBeNull();
  });

  it("batched resolution: multiple campaigns with DIFFERENT cycle starts resolve correctly in one snapshot call, ignoring prior-cycle history", async () => {
    // Venue tz is America/New_York (EDT = UTC-4 in July), so this Monday's weekly
    // cycle start is 2026-07-20T00:00 ET = 2026-07-20T04:00:00.000Z.
    const CAMP2_CYCLE = "2026-07-20T04:00:00.000Z";
    store.challenge_campaigns = [
      campaignRow({ id: "camp-1", winner_quota: 2 }), // one-time (epoch cycle)
      campaignRow({ id: "camp-2", recurring_type: "weekly", active_days: ["mon"], winner_quota: 1 }),
    ];
    store.challenge_cycle_winners.push(
      // camp-1 current cycle (epoch): u1 (alice) won.
      { id: "w1", challenge_id: "camp-1", cycle_start: EPOCH_ISO, winner_user_id: "u1", venue_id: VENUE_ID, points_earned: 600, finalized_at: "2026-07-20T10:00:00.000Z", prize_type: "free_appetizer" },
      // camp-2 current week: u2 (bob) won.
      { id: "w2", challenge_id: "camp-2", cycle_start: CAMP2_CYCLE, winner_user_id: "u2", venue_id: VENUE_ID, points_earned: 600, finalized_at: "2026-07-20T11:00:00.000Z", prize_type: "free_appetizer" },
      // camp-2 PRIOR weeks — must be ignored (unbounded history that the old code pulled).
      { id: "w3", challenge_id: "camp-2", cycle_start: "2026-07-13T04:00:00.000Z", winner_user_id: "u3", venue_id: VENUE_ID, points_earned: 600, finalized_at: "2026-07-13T11:00:00.000Z", prize_type: "free_appetizer" },
      { id: "w4", challenge_id: "camp-2", cycle_start: "2026-07-06T04:00:00.000Z", winner_user_id: "u1", venue_id: VENUE_ID, points_earned: 600, finalized_at: "2026-07-06T11:00:00.000Z", prize_type: "free_appetizer" }
    );

    const cards = await getChallengeCampaignSnapshotForUser({ userId: "u1", venueId: VENUE_ID });
    const camp1 = cards.find((c) => c.id === "camp-1")!;
    const camp2 = cards.find((c) => c.id === "camp-2")!;

    // camp-1: u1 is the current (only) winner.
    expect(camp1.viewerWon).toBe(true);
    expect(camp1.winnerUsernames).toEqual(["alice"]);
    expect(camp1.quotaRemaining).toBe(1);

    // camp-2: current week's winner is bob; u1's win was a PRIOR week → not viewerWon.
    expect(camp2.viewerWon).toBe(false);
    expect(camp2.winnerUsernames).toEqual(["bob"]);
    expect(camp2.quotaRemaining).toBe(0);
  });

  it("fan-out does not scale with campaign count or cycle history: challenge_cycle_winners is read exactly once", async () => {
    store.challenge_campaigns = [
      campaignRow({ id: "camp-1" }),
      campaignRow({ id: "camp-2", recurring_type: "weekly", active_days: ["mon"], winner_quota: 1 }),
      campaignRow({ id: "camp-3", recurring_type: "weekly", active_days: ["mon"], winner_quota: 3 }),
    ];
    // Pile on historical rows across many cycles — the old per-campaign
    // listChallengeCycleWinners() would have pulled all of these.
    for (let week = 0; week < 10; week++) {
      const iso = new Date(Date.UTC(2026, 4, 4 + week * 7)).toISOString();
      store.challenge_cycle_winners.push(
        { id: `h2-${week}`, challenge_id: "camp-2", cycle_start: iso, winner_user_id: "u1", venue_id: VENUE_ID, points_earned: 600, finalized_at: iso, prize_type: "free_appetizer" },
        { id: `h3-${week}`, challenge_id: "camp-3", cycle_start: iso, winner_user_id: "u2", venue_id: VENUE_ID, points_earned: 600, finalized_at: iso, prize_type: "free_appetizer" }
      );
    }

    await getChallengeCampaignSnapshotForUser({ userId: "u3", venueId: VENUE_ID });

    // One batched read regardless of 3 campaigns × 10+ historical cycles.
    expect(fromCallCounts.challenge_cycle_winners).toBe(1);
  });

  it("recurring campaign resets the winner list per weekly cycle (not the epoch sentinel)", async () => {
    store.challenge_campaigns = [campaignRow({ recurring_type: "weekly", active_days: ["monday"], winner_quota: 1 })];
    // A win recorded in a PRIOR week's cycle must not count toward this week's quota.
    store.challenge_cycle_winners.push({
      id: "w-prior-week",
      challenge_id: "camp-1",
      cycle_start: "2026-07-13T00:00:00.000Z",
      winner_user_id: "u1",
      venue_id: VENUE_ID,
      points_earned: 600,
      finalized_at: "2026-07-13T09:00:00.000Z",
      prize_type: "free_appetizer",
    });

    const [card] = await getChallengeCampaignSnapshotForUser({ userId: "u2", venueId: VENUE_ID });

    expect(card.viewerWon).toBe(false);
    expect(card.quotaRemaining).toBe(1);
    expect(card.winnerUsernames).toEqual([]);
  });
});

describe("getChallengeCampaignSnapshotForUser — game-winner rewards", () => {
  // A "game_winner" reward is keyed on the Live Trivia occurrence's own start
  // instant by the resolver cron, never on a computed cycle anchor. Resolving it
  // like a points-threshold reward matched zero rows, so a real winner's card sat
  // on "In Progress" forever while their coupon existed in the database.
  const GAME_START = "2026-07-19T23:00:00.000Z";
  const EARLIER_GAME_START = "2026-07-18T23:00:00.000Z";

  function gameWinnerRow(overrides: Row = {}): Row {
    return campaignRow({
      win_condition: "game_winner",
      points_required_to_win: 1,
      winner_quota: 1,
      rules: "Win the Live Trivia game",
      ...overrides,
    });
  }

  it("recognizes the winner of the most recent game, despite the occurrence-keyed cycle", async () => {
    store.challenge_campaigns = [gameWinnerRow()];
    store.challenge_cycle_winners.push({
      id: "w1",
      challenge_id: "camp-1",
      cycle_start: GAME_START,
      winner_user_id: "u1",
      venue_id: VENUE_ID,
      points_earned: 120,
      finalized_at: "2026-07-20T00:05:00.000Z",
      prize_type: "free_appetizer",
    });

    const [card] = await getChallengeCampaignSnapshotForUser({ userId: "u1", venueId: VENUE_ID });

    expect(card.viewerWon).toBe(true);
    expect(card.quotaRemaining).toBe(0);
    expect(card.winnerUsernames).toEqual(["alice"]);
  });

  it("shows a non-winner that the prize is claimed rather than still in progress", async () => {
    store.challenge_campaigns = [gameWinnerRow()];
    store.challenge_cycle_winners.push({
      id: "w1",
      challenge_id: "camp-1",
      cycle_start: GAME_START,
      winner_user_id: "u1",
      venue_id: VENUE_ID,
      points_earned: 120,
      finalized_at: "2026-07-20T00:05:00.000Z",
      prize_type: "free_appetizer",
    });

    const [card] = await getChallengeCampaignSnapshotForUser({ userId: "u3", venueId: VENUE_ID });

    expect(card.viewerWon).toBe(false);
    expect(card.quotaRemaining).toBe(0);
    expect(card.winnerUsernames).toEqual(["alice"]);
  });

  it("resolves only the LATEST game's winners, not every game in history", async () => {
    // A recurring game-winner reward accumulates one cycle per game played.
    store.challenge_campaigns = [gameWinnerRow({ recurring_type: "weekly", active_days: ["mon"] })];
    store.challenge_cycle_winners.push(
      { id: "w-old", challenge_id: "camp-1", cycle_start: EARLIER_GAME_START, winner_user_id: "u2", venue_id: VENUE_ID, points_earned: 90, finalized_at: "2026-07-19T00:05:00.000Z", prize_type: "free_appetizer" },
      { id: "w-new", challenge_id: "camp-1", cycle_start: GAME_START, winner_user_id: "u1", venue_id: VENUE_ID, points_earned: 120, finalized_at: "2026-07-20T00:05:00.000Z", prize_type: "free_appetizer" }
    );

    const winnerCard = (await getChallengeCampaignSnapshotForUser({ userId: "u1", venueId: VENUE_ID }))[0];
    const priorWinnerCard = (await getChallengeCampaignSnapshotForUser({ userId: "u2", venueId: VENUE_ID }))[0];

    expect(winnerCard.viewerWon).toBe(true);
    expect(winnerCard.winnerUsernames).toEqual(["alice"]);
    // Last week's winner does not still read as a winner this week.
    expect(priorWinnerCard.viewerWon).toBe(false);
  });

  it("reads as a fresh, unwon reward before any game has resolved it", async () => {
    store.challenge_campaigns = [gameWinnerRow()];

    const [card] = await getChallengeCampaignSnapshotForUser({ userId: "u1", venueId: VENUE_ID });

    expect(card.viewerWon).toBe(false);
    expect(card.quotaRemaining).toBe(1);
    expect(card.winnerUsernames).toEqual([]);
  });

  it("resolves the viewer's claimed-at for an occurrence-keyed redemption", async () => {
    store.challenge_campaigns = [gameWinnerRow()];
    store.challenge_cycle_winners.push({
      id: "w1",
      challenge_id: "camp-1",
      cycle_start: GAME_START,
      winner_user_id: "u1",
      venue_id: VENUE_ID,
      points_earned: 120,
      finalized_at: "2026-07-20T00:05:00.000Z",
      prize_type: "free_appetizer",
    });
    store.challenge_campaign_redemptions.push({
      challenge_id: "camp-1",
      winner_user_id: "u1",
      venue_id: VENUE_ID,
      cycle_start: GAME_START,
      claimed_at: "2026-07-20T01:00:00.000Z",
      prize_expires_at: "2026-07-27T00:00:00.000Z",
      prize_redeemed_at: null,
    });

    const [card] = await getChallengeCampaignSnapshotForUser({ userId: "u1", venueId: VENUE_ID });

    expect(card.prizeClaimedAt).toBe("2026-07-20T01:00:00.000Z");
  });

  it("leaves the batched read untouched for venues with no game-winner reward", async () => {
    store.challenge_campaigns = [campaignRow({ id: "camp-1" }), campaignRow({ id: "camp-2" })];

    await getChallengeCampaignSnapshotForUser({ userId: "u3", venueId: VENUE_ID });

    expect(fromCallCounts.challenge_cycle_winners).toBe(1);
  });
});

describe("listChallengeCampaignWinsForUser — one-time reward epoch handling", () => {
  // Postgres/PostgREST renders timestamptz as "+00:00"-offset text (no
  // milliseconds), never as a JS Date's toISOString() ("...Z", millisecond
  // padded) — even for the exact same instant. A naive string comparison
  // against `new Date(0).toISOString()` would fail to recognize this as the
  // epoch sentinel.
  const POSTGRES_EPOCH = "1970-01-01T00:00:00+00:00";

  it("treats a Postgres-style epoch cycle_start as a one-time reward (cycleStart null)", async () => {
    store.challenge_campaign_redemptions.push({
      challenge_id: "camp-1",
      winner_user_id: "u1",
      venue_id: VENUE_ID,
      cycle_start: POSTGRES_EPOCH,
      claimed_at: "2026-07-20T12:00:00.000Z",
      prize_expires_at: "2026-07-27T00:00:00.000Z",
      prize_redeemed_at: null,
    });

    const [win] = await listChallengeCampaignWinsForUser({ userId: "u1", venueId: VENUE_ID });

    expect(win.cycleStart).toBeNull();
  });

  it("keeps a real recurring cycle_start intact (not mistaken for the epoch sentinel)", async () => {
    store.challenge_campaigns = [campaignRow({ recurring_type: "weekly", active_days: ["monday"], winner_quota: 1 })];
    store.challenge_campaign_redemptions.push({
      challenge_id: "camp-1",
      winner_user_id: "u1",
      venue_id: VENUE_ID,
      cycle_start: "2026-07-13T00:00:00+00:00",
      claimed_at: "2026-07-13T12:00:00.000Z",
      prize_expires_at: "2026-07-20T00:00:00.000Z",
      prize_redeemed_at: null,
    });

    const [win] = await listChallengeCampaignWinsForUser({ userId: "u1", venueId: VENUE_ID });

    expect(win.cycleStart).toBe("2026-07-13T00:00:00+00:00");
  });
});
