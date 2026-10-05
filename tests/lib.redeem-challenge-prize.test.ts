import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// docs/reward-live-redemption-plan.md Phase 1, bug 2: redeemChallengePrize() read the oldest
// unredeemed coupon, then UPDATEd it with no `prize_redeemed_at is null` guard, so two
// simultaneous taps both succeeded. It now makes ONE call to the redeem_challenge_prize RPC,
// whose conditional UPDATE is the once-only guarantee. The RPC's SQL is verified for real in
// isolated Postgres by scripts/test-reward-redeem-once.cjs; here a fake RPC with the same
// contract checks the TypeScript side: the arguments, the outcome mapping, that nothing else
// writes, and that a missing RPC fails CLOSED.

type Coupon = {
  id: string;
  challenge_id: string | null;
  winner_user_id: string;
  venue_id: string;
  cycle_start: string;
  prize_expires_at: string | null;
  prize_redeemed_at: string | null;
  redeemed_method: string | null;
};

const fake = vi.hoisted(() => {
  const state = {
    coupons: [] as Coupon[],
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    fromCalls: [] as string[],
    rpcError: null as { code?: string; message?: string } | null,
    rpcData: undefined as unknown,
  };

  // Mirrors redeem_challenge_prize's contract (see the migration). The `await` between the
  // read and the conditional write lets concurrent calls interleave exactly where the old
  // read-then-update raced.
  const redeem = async (args: Record<string, unknown>) => {
    const now = Date.now();
    const matches = (c: Coupon) =>
      c.challenge_id === args.p_challenge_id &&
      c.winner_user_id === args.p_user_id &&
      (args.p_venue_id == null || c.venue_id === args.p_venue_id) &&
      (args.p_redemption_id == null || c.id === args.p_redemption_id);
    const eligible = (c: Coupon) =>
      !c.prize_redeemed_at && (!c.prize_expires_at || new Date(c.prize_expires_at).getTime() > now);
    const mine = state.coupons.filter(matches).sort((a, b) => a.cycle_start.localeCompare(b.cycle_start));
    const target = mine.find(eligible);
    await Promise.resolve();
    if (target) {
      if (eligible(target)) {
        target.prize_redeemed_at = new Date(now).toISOString();
        target.redeemed_method = String(args.p_method);
        return [{ outcome: "redeemed", redemption_id: target.id, redeemed_at: target.prize_redeemed_at, cycle_start: target.cycle_start }];
      }
      return [{ outcome: "already_redeemed", redemption_id: target.id, redeemed_at: target.prize_redeemed_at, cycle_start: target.cycle_start }];
    }
    const unredeemed = mine.find((c) => !c.prize_redeemed_at);
    if (unredeemed) return [{ outcome: "expired", redemption_id: unredeemed.id, redeemed_at: null, cycle_start: unredeemed.cycle_start }];
    const redeemed = mine.find((c) => c.prize_redeemed_at);
    if (redeemed) return [{ outcome: "already_redeemed", redemption_id: redeemed.id, redeemed_at: redeemed.prize_redeemed_at, cycle_start: redeemed.cycle_start }];
    return [{ outcome: "not_found", redemption_id: null, redeemed_at: null, cycle_start: null }];
  };

  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      if (state.rpcError) return { data: null, error: state.rpcError };
      if (state.rpcData !== undefined) return { data: state.rpcData, error: null };
      return { data: await redeem(args), error: null };
    },
    from: (table: string) => {
      state.fromCalls.push(table);
      throw new Error(`unexpected table access: ${table}`);
    },
  };
  return { state, client };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: fake.client }));
vi.mock("@/lib/venuePresence", () => ({
  maybeRequireActiveVenuePresence: async () => undefined,
  venuePresenceErrorResponse: () => null,
}));

import { PrizeRedeemUnavailableError, redeemChallengePrize } from "@/lib/challengeCampaigns";
import { POST as REDEEM } from "@/app/api/prizes/redeem-challenge/route";

const GUEST = "11111111-1111-1111-1111-111111111111";
const REWARD = "c0c0c0c0-0000-0000-0000-000000000000";
const inAWeek = () => new Date(Date.now() + 7 * 86_400_000).toISOString();

const coupon = (overrides: Partial<Coupon> = {}): Coupon => {
  const row: Coupon = {
    id: `r-${fake.state.coupons.length + 1}`,
    challenge_id: REWARD,
    winner_user_id: GUEST,
    venue_id: "venue-a",
    cycle_start: "2026-10-01T00:00:00+00:00",
    prize_expires_at: inAWeek(),
    prize_redeemed_at: null,
    redeemed_method: null,
    ...overrides,
  };
  fake.state.coupons.push(row);
  return row;
};

const params = { userId: GUEST, venueId: "venue-a", challengeId: REWARD };

beforeEach(() => {
  fake.state.coupons = [];
  fake.state.rpcCalls = [];
  fake.state.fromCalls = [];
  fake.state.rpcError = null;
  fake.state.rpcData = undefined;
  delete process.env.SESSION_SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("redeemChallengePrize", () => {
  it("makes exactly one RPC call — venue-scoped, guest_confirm, the named coupon — and no table writes", async () => {
    const row = coupon();
    const result = await redeemChallengePrize({ ...params, redemptionId: row.id });
    expect(result.redeemed).toBe(true);
    expect(fake.state.rpcCalls).toEqual([
      {
        name: "redeem_challenge_prize",
        args: {
          p_challenge_id: REWARD,
          p_user_id: GUEST,
          p_venue_id: "venue-a",
          p_method: "guest_confirm",
          p_redemption_id: row.id,
        },
      },
    ]);
    // The old path read challenge_campaigns (and gated on the legacy prize_type, refusing every
    // new-model reward) and then wrote with a plain UPDATE. Neither happens any more.
    expect(fake.state.fromCalls).toEqual([]);
    expect(row.redeemed_method).toBe("guest_confirm");
  });

  it("passes a null coupon id when none is given (pre-Phase-1 client → oldest eligible)", async () => {
    coupon();
    await redeemChallengePrize(params);
    expect(fake.state.rpcCalls[0].args.p_redemption_id).toBeNull();
  });

  it("two concurrent redeems of one coupon: exactly one redeemed:true", async () => {
    const row = coupon();
    const results = await Promise.all([
      redeemChallengePrize({ ...params, redemptionId: row.id }),
      redeemChallengePrize({ ...params, redemptionId: row.id }),
    ]);
    expect(results.filter((r) => r.redeemed)).toHaveLength(1);
    expect(results.filter((r) => !r.redeemed)).toHaveLength(1);
  });

  it("refuses an expired coupon and leaves it untouched", async () => {
    const row = coupon({ prize_expires_at: new Date(Date.now() - 60_000).toISOString() });
    await expect(redeemChallengePrize(params)).rejects.toThrow("This prize has expired.");
    expect(row.prize_redeemed_at).toBeNull();
  });

  it("refuses a coupon that is not this guest's", async () => {
    coupon({ winner_user_id: "someone-else" });
    await expect(redeemChallengePrize(params)).rejects.toThrow("No redemption record found for this prize.");
  });

  it("treats a malformed id (Postgres 22P02) as not found", async () => {
    fake.state.rpcError = { code: "22P02", message: "invalid input syntax for type uuid" };
    await expect(redeemChallengePrize(params)).rejects.toThrow("No redemption record found for this prize.");
  });

  it("fails CLOSED when the RPC is missing (code deployed before the migration)", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fake.state.rpcError = { code: "PGRST202", message: "Could not find the function public.redeem_challenge_prize" };
    await expect(redeemChallengePrize(params)).rejects.toBeInstanceOf(PrizeRedeemUnavailableError);
    expect(errorLog).toHaveBeenCalledWith("[RewardRedeem] rpc-missing", { code: "PGRST202" });
    // No fallback to the old unguarded UPDATE.
    expect(fake.state.fromCalls).toEqual([]);
  });

  it("fails closed on any other RPC error and on a malformed result", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    fake.state.rpcError = { code: "57014", message: "statement timeout" };
    await expect(redeemChallengePrize(params)).rejects.toBeInstanceOf(PrizeRedeemUnavailableError);
    fake.state.rpcError = null;
    fake.state.rpcData = [];
    await expect(redeemChallengePrize(params)).rejects.toBeInstanceOf(PrizeRedeemUnavailableError);
  });
});

describe("POST /api/prizes/redeem-challenge — once-only end to end", () => {
  const request = (redemptionId?: string) =>
    new Request("http://x/api/prizes/redeem-challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, redemptionId }),
    });

  it("two simultaneous taps: one 200, one 409 already_redeemed", async () => {
    const row = coupon();
    const responses = await Promise.all([REDEEM(request(row.id)), REDEEM(request(row.id))]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it("a double tap never spills onto the guest's NEXT coupon for the same reward", async () => {
    const first = coupon({ cycle_start: "2026-10-01T00:00:00+00:00" });
    const next = coupon({ cycle_start: "2026-10-08T00:00:00+00:00" });
    const responses = await Promise.all([REDEEM(request(first.id)), REDEEM(request(first.id))]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(next.prize_redeemed_at).toBeNull();
  });

  it("expired → 400; RPC missing → 503", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    coupon({ prize_expires_at: new Date(Date.now() - 60_000).toISOString() });
    expect((await REDEEM(request())).status).toBe(400);
    fake.state.rpcError = { code: "PGRST202", message: "Could not find the function" };
    expect((await REDEEM(request())).status).toBe(503);
  });
});
