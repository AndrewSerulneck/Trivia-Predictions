import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChallengeCampaign } from "@/types";

// ── In-memory DB + captured side-effects ────────────────────────────────────
type CycleWinnerRow = {
  challenge_id: string;
  cycle_start: string;
  winner_user_id: string;
  venue_id: string;
  points_earned: number;
  prize_type: string | null;
  prize_gift_certificate_amount: number | null;
};
type RedemptionRow = {
  challenge_id: string;
  winner_user_id: string;
  venue_id: string;
  cycle_start: string;
  prize_expires_at: string;
};
type NotificationRow = { userId: string; message: string; type: string; linkUrl?: string };

const store = vi.hoisted(() => ({
  cycleWinners: [] as CycleWinnerRow[],
  redemptions: [] as RedemptionRow[],
  notifications: [] as NotificationRow[],
}));

// Fake award_cycle_winner RPC — a faithful JS mirror of the SQL in
// supabase/migrations/20260720150000_rewards_atomic_redemption.sql:
// count-then-insert capped at p_winner_quota (unique(challenge_id, cycle_start,
// winner_user_id) enforced by the dup check) AND, in the SAME call, an atomic
// redemption-coupon mint when the user just won and p_prize_expires_at is
// non-null (unique(challenge_id, winner_user_id, cycle_start) enforced by the
// dup check). JS is single-threaded and the fake performs its read+inserts with
// no intervening await, so awaited/Promise.all'd calls are serialized — exactly
// the invariant the advisory lock provides in Postgres. Returns the RPC's table
// shape: [{ won, exhausted }].
const rpc = vi.hoisted(() =>
  vi.fn(async (fn: string, args: Record<string, unknown>) => {
    if (fn !== "award_cycle_winner") throw new Error(`unexpected rpc: ${fn}`);
    const challengeId = args.p_challenge_id as string;
    const cycleStart = args.p_cycle_start as string;
    const userId = args.p_winner_user_id as string;
    const quota = Math.max(1, Math.round(Number(args.p_winner_quota ?? 1)));
    const prizeExpiresAt = (args.p_prize_expires_at as string | null) ?? null;

    const rows = store.cycleWinners.filter(
      (r) => r.challenge_id === challengeId && r.cycle_start === cycleStart
    );
    const count = rows.length;

    if (count >= quota) {
      return { data: [{ won: false, exhausted: true }], error: null };
    }
    if (rows.some((r) => r.winner_user_id === userId)) {
      // on conflict do nothing → 0 rows inserted → not a fresh win.
      return { data: [{ won: false, exhausted: count >= quota }], error: null };
    }
    store.cycleWinners.push({
      challenge_id: challengeId,
      cycle_start: cycleStart,
      winner_user_id: userId,
      venue_id: args.p_venue_id as string,
      points_earned: Number(args.p_points_earned ?? 0),
      prize_type: (args.p_prize_type as string | null) ?? null,
      prize_gift_certificate_amount: (args.p_prize_gift_certificate_amount as number | null) ?? null,
    });
    // Atomic coupon mint — same call as the ledger insert. Only on a fresh win
    // for a prize-bearing reward (signalled by a non-null expiry). on-conflict
    // (challenge, user, cycle) do nothing.
    if (prizeExpiresAt !== null) {
      const dup = store.redemptions.some(
        (r) =>
          r.challenge_id === challengeId &&
          r.winner_user_id === userId &&
          r.cycle_start === cycleStart
      );
      if (!dup) {
        store.redemptions.push({
          challenge_id: challengeId,
          winner_user_id: userId,
          venue_id: args.p_venue_id as string,
          cycle_start: cycleStart,
          prize_expires_at: prizeExpiresAt,
        });
      }
    }
    return { data: [{ won: true, exhausted: count + 1 >= quota }], error: null };
  })
);

// awardCycleWinner no longer performs any separate supabaseAdmin.from() write —
// the redemption coupon is minted inside the RPC (above). This fake exists only
// to catch a regression: if the redemption mint ever moves back out of the
// atomic RPC into a separate call, this throws and the test fails loudly.
const from = vi.hoisted(() =>
  vi.fn((table: string) => {
    throw new Error(`unexpected non-atomic supabaseAdmin.from(${table}) call`);
  })
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { rpc, from } }));
vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(async (n: NotificationRow) => {
    store.notifications.push(n);
  }),
}));

import { awardCycleWinner, campaignHasPrize } from "@/lib/challengeCampaigns";

const EPOCH = new Date(0);
const NOW = new Date("2026-07-20T12:00:00.000Z");

function makeCampaign(overrides: Partial<ChallengeCampaign> = {}): ChallengeCampaign {
  return {
    id: "camp-1",
    createdAt: NOW.toISOString(),
    name: "Live Trivia Challenge",
    rules: "Earn 500 points in Live Trivia",
    venueIds: ["venue-1"],
    scheduleType: "single_day",
    activeDays: [],
    gameTypes: ["live-trivia"],
    challengeMode: "progress",
    leaderboardDisplayLimit: 10,
    leaderboardTiebreaker: "first_to_score",
    pointMultiplier: 1,
    pointsRequiredToWin: 500,
    recurringType: "weekly",
    winnerUserId: null,
    prizeType: "free_appetizer",
    prizeGiftCertificateAmount: null,
    winnerQuota: 1,
    isActive: true,
    ...overrides,
  };
}

async function cross(campaign: ChallengeCampaign, userId: string, quota: number, cycleStart = EPOCH) {
  return awardCycleWinner({
    campaign,
    userId,
    venueId: "venue-1",
    cycleStart,
    pointsEarned: 600,
    winnerQuota: quota,
    now: NOW,
  });
}

beforeEach(() => {
  store.cycleWinners.length = 0;
  store.redemptions.length = 0;
  store.notifications.length = 0;
  rpc.mockClear();
  from.mockClear();
});

describe("campaignHasPrize", () => {
  it("is true for a legacy prizeType, true for a new-model prizeKind, false for neither", () => {
    expect(campaignHasPrize({ prizeType: "free_appetizer", prizeKind: null })).toBe(true);
    expect(campaignHasPrize({ prizeType: null, prizeKind: "menu_item" })).toBe(true);
    expect(campaignHasPrize({ prizeType: null, prizeKind: null })).toBe(false);
  });
});

describe("awardCycleWinner — quota boundary", () => {
  it("awards exactly winner_quota winners, then reports the cycle exhausted", async () => {
    const campaign = makeCampaign({ winnerQuota: 3 });

    const r1 = await cross(campaign, "u1", 3);
    const r2 = await cross(campaign, "u2", 3);
    const r3 = await cross(campaign, "u3", 3);
    const r4 = await cross(campaign, "u4", 3);
    const r5 = await cross(campaign, "u5", 3);

    expect(r1).toEqual({ won: true, exhausted: false });
    expect(r2).toEqual({ won: true, exhausted: false });
    expect(r3).toEqual({ won: true, exhausted: true }); // quota reached on the 3rd
    expect(r4).toEqual({ won: false, exhausted: true });
    expect(r5).toEqual({ won: false, exhausted: true });

    expect(store.cycleWinners).toHaveLength(3);
    expect(store.cycleWinners.map((r) => r.winner_user_id)).toEqual(["u1", "u2", "u3"]);
    // A prize-bearing reward mints one coupon + one notification per winner.
    expect(store.redemptions).toHaveLength(3);
    expect(store.notifications).toHaveLength(3);
  });
});

describe("awardCycleWinner — atomic coupon mint (Phase 4 fix)", () => {
  it("mints the redemption coupon inside the RPC, with no separate from() write", async () => {
    const campaign = makeCampaign({ winnerQuota: 1 });

    const r = await cross(campaign, "u1", 1);

    expect(r).toEqual({ won: true, exhausted: true });
    // Ledger row + coupon row both exist after the single RPC call...
    expect(store.cycleWinners).toHaveLength(1);
    expect(store.redemptions).toHaveLength(1);
    expect(store.redemptions[0]).toMatchObject({
      challenge_id: "camp-1",
      winner_user_id: "u1",
      cycle_start: EPOCH.toISOString(),
    });
    expect(store.redemptions[0].prize_expires_at).toEqual(expect.any(String));
    // ...and awardCycleWinner never took a separate, non-atomic write path.
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("passes a non-null p_prize_expires_at for a prize reward, null otherwise", async () => {
    await cross(makeCampaign({ prizeType: "free_appetizer", winnerQuota: 1 }), "u1", 1);
    const prizeArgs = rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(prizeArgs.p_prize_expires_at).toEqual(expect.any(String));

    store.cycleWinners.length = 0;
    store.redemptions.length = 0;
    await cross(makeCampaign({ prizeType: null, prizeKind: null, winnerQuota: 1 }), "u2", 1);
    const noPrizeArgs = rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(noPrizeArgs.p_prize_expires_at).toBeNull();
    expect(store.redemptions).toHaveLength(0);
  });
});

describe("awardCycleWinner — duplicate win", () => {
  it("a user who re-crosses the same cycle does not win twice or double-mint", async () => {
    const campaign = makeCampaign({ winnerQuota: 3 });

    const first = await cross(campaign, "u1", 3);
    const again = await cross(campaign, "u1", 3);
    const third = await cross(campaign, "u1", 3);

    expect(first).toEqual({ won: true, exhausted: false });
    expect(again).toEqual({ won: false, exhausted: false }); // still room, but no re-win
    expect(third).toEqual({ won: false, exhausted: false });

    expect(store.cycleWinners).toHaveLength(1);
    expect(store.redemptions).toHaveLength(1);
    expect(store.notifications).toHaveLength(1);
  });
});

describe("awardCycleWinner — concurrent crossings never over-award", () => {
  it("fires 5 distinct users at a quota-2 cycle concurrently; exactly 2 win", async () => {
    const campaign = makeCampaign({ winnerQuota: 2 });

    const results = await Promise.all(
      ["u1", "u2", "u3", "u4", "u5"].map((u) => cross(campaign, u, 2))
    );

    expect(results.filter((r) => r.won)).toHaveLength(2);
    expect(store.cycleWinners).toHaveLength(2);
    expect(store.redemptions).toHaveLength(2);
    // Every non-winner is turned away with the cycle marked exhausted — no
    // over-award past the quota under concurrent crossings.
    expect(results.filter((r) => !r.won).every((r) => r.exhausted)).toBe(true);
  });
});

describe("awardCycleWinner — recurring quota resets per cycle", () => {
  it("a prior winner may win again in a later cycle", async () => {
    const campaign = makeCampaign({ winnerQuota: 1 });
    const cycleA = new Date("2026-07-13T00:00:00.000Z");
    const cycleB = new Date("2026-07-20T00:00:00.000Z");

    const a = await cross(campaign, "u1", 1, cycleA);
    const bBlockedNewUser = await cross(campaign, "u2", 1, cycleA); // cycle A already full
    const b = await cross(campaign, "u1", 1, cycleB); // fresh cycle → u1 wins again

    expect(a).toEqual({ won: true, exhausted: true });
    expect(bBlockedNewUser).toEqual({ won: false, exhausted: true });
    expect(b).toEqual({ won: true, exhausted: true });

    expect(store.cycleWinners).toHaveLength(2);
    expect(store.redemptions).toHaveLength(2);
  });
});

describe("awardCycleWinner — prize gate (Phase 3 fix)", () => {
  it("mints a coupon for a new-model prizeKind reward with prizeType = null", async () => {
    const campaign = makeCampaign({ prizeType: null, prizeKind: "menu_item", winnerQuota: 1 });

    const r = await cross(campaign, "u1", 1);

    expect(r.won).toBe(true);
    expect(store.redemptions).toHaveLength(1);
    expect(store.notifications).toHaveLength(1);
  });

  it("records the winner but mints no coupon when the reward has no prize", async () => {
    const campaign = makeCampaign({ prizeType: null, prizeKind: null, winnerQuota: 1 });

    const r = await cross(campaign, "u1", 1);

    expect(r.won).toBe(true);
    expect(store.cycleWinners).toHaveLength(1);
    expect(store.redemptions).toHaveLength(0);
    expect(store.notifications).toHaveLength(0);
  });
});
