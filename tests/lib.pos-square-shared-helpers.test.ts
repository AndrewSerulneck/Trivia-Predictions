import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// docs/square-review-fixes-plan.md Phase R3 — the shared helpers: the one coupon loader (#7), the
// one-read wallet connection loader and its use by both attach functions (#6), the two-tier user→IP
// limiter and the owner POS guard (#9). Behaviour of the callers is pinned by their own suites.

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const reads: string[] = [];
const rpcCalls: Array<Record<string, unknown>> = [];
let rpcAllowed: boolean[] = [];
let failTable: { table: string; code: string } | null = null;

const query = (table: string) => {
  const filters: Array<(row: Row) => boolean> = [];
  const run = () => {
    reads.push(table);
    if (failTable?.table === table) return { data: null, error: { code: failTable.code, message: "boom" } };
    return { data: (db[table] ?? []).filter((row) => filters.every((f) => f(row))).map((row) => ({ ...row })), error: null };
  };
  const builder = {
    select: () => builder,
    eq: (col: string, value: unknown) => (filters.push((row) => row[col] === value), builder),
    in: (col: string, values: unknown[]) => (filters.push((row) => values.includes(row[col])), builder),
    returns: () => builder,
    maybeSingle: async () => {
      const result = run();
      return { data: result.data?.[0] ?? null, error: result.error };
    },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return builder;
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (table: string) => query(table),
    rpc: async (_name: string, params: Record<string, unknown>) => {
      rpcCalls.push(params);
      const allowed = rpcAllowed.length ? rpcAllowed.shift()! : true;
      return { data: [{ allowed, retry_after_seconds: allowed ? 0 : 30 }], error: null };
    },
  },
}));

const authMock = vi.hoisted(() => ({ requireOwnerAuth: vi.fn() }));
vi.mock("@/lib/requireOwnerAuth", () => ({ requireOwnerAuth: authMock.requireOwnerAuth }));

import { guardOwnerPosVenue } from "@/lib/pos/ownerPosGuard";
import { isCouponExpired, loadOwnedCoupon } from "@/lib/pos/squareCoupon";
import { attachSquareDiscountStates } from "@/lib/pos/squareDiscounts";
import { attachSquareGiftCardStates } from "@/lib/pos/squareGiftCards";
import { SQUARE_OAUTH_SCOPES } from "@/lib/pos/squareConfig";
import { readSquareWalletConnection, squareWalletConnectionLoader } from "@/lib/pos/squareWalletConnection";
import { hashRequesterIp, rateLimitUserThenIp } from "@/lib/rateLimit";
import type { ChallengeCampaignWin } from "@/types";

const RID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  for (const key of Object.keys(db)) delete db[key];
  reads.length = 0;
  rpcCalls.length = 0;
  rpcAllowed = [];
  failTable = null;
  vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "true");
  vi.stubEnv("SQUARE_ENVIRONMENT", "sandbox");
  vi.stubEnv("SQUARE_APPLICATION_ID", "app");
  vi.stubEnv("SQUARE_APPLICATION_SECRET", "secret");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("loadOwnedCoupon", () => {
  const load = () =>
    loadOwnedCoupon<{ id: string; winner_user_id: string; venue_id: string }>({
      userId: "user-1",
      venueId: "venue-1",
      redemptionId: RID,
      columns: "id, winner_user_id, venue_id",
      readFailedLog: "coupon-read-failed",
    });

  it("returns the guest's own coupon at this venue", async () => {
    db.challenge_campaign_redemptions = [{ id: RID, winner_user_id: "user-1", venue_id: "venue-1" }];
    expect(await load()).toEqual({ ok: true, coupon: { id: RID, winner_user_id: "user-1", venue_id: "venue-1" } });
  });

  it("reads someone else's coupon, another venue's coupon and a missing one all as not_found", async () => {
    expect(await load()).toEqual({ ok: false, code: "not_found" });
    db.challenge_campaign_redemptions = [{ id: RID, winner_user_id: "someone-else", venue_id: "venue-1" }];
    expect(await load()).toEqual({ ok: false, code: "not_found" });
    db.challenge_campaign_redemptions = [{ id: RID, winner_user_id: "user-1", venue_id: "venue-2" }];
    expect(await load()).toEqual({ ok: false, code: "not_found" });
  });

  it("treats a malformed id (22P02) as not_found, any other read error as unavailable (and logs it)", async () => {
    failTable = { table: "challenge_campaign_redemptions", code: "22P02" };
    expect(await load()).toEqual({ ok: false, code: "not_found" });
    expect(console.error).not.toHaveBeenCalled();
    failTable = { table: "challenge_campaign_redemptions", code: "XX000" };
    expect(await load()).toEqual({ ok: false, code: "unavailable" });
    expect(console.error).toHaveBeenCalledWith("[PosSquare] coupon-read-failed", "boom");
  });
});

describe("isCouponExpired", () => {
  it("is true only for an expiry in the past", () => {
    expect(isCouponExpired({ prize_expires_at: null })).toBe(false);
    expect(isCouponExpired({ prize_expires_at: new Date(Date.now() + 60_000).toISOString() })).toBe(false);
    expect(isCouponExpired({ prize_expires_at: new Date(Date.now() - 60_000).toISOString() })).toBe(true);
  });
});

describe("the wallet's one pos_connections read", () => {
  const connectionRow = (): Row => ({
    id: "conn-1",
    venue_id: "venue-1",
    provider: "square",
    environment: "sandbox",
    status: "active",
    location_id: "L1",
    scopes: [...SQUARE_OAUTH_SCOPES],
  });
  const giftWin = (): ChallengeCampaignWin =>
    ({ redemptionId: "r-gift", challengeId: "c1", prizeKind: "gift_card", prizeType: "gift_certificate", prizeRedeemedAt: null, prizeExpiresAt: null }) as unknown as ChallengeCampaignWin;
  const menuWin = (): ChallengeCampaignWin =>
    ({ redemptionId: "r-menu", challengeId: "c2", prizeKind: "menu_item", prizeMenuItem: "appetizer", prizeDiscountKind: "percent", prizeDiscountValue: 50, prizeRedeemedAt: null, prizeExpiresAt: null }) as unknown as ChallengeCampaignWin;

  it("reads nothing until somebody asks, and only once however many do", async () => {
    const load = squareWalletConnectionLoader("venue-1");
    expect(reads).toEqual([]);
    db.pos_connections = [connectionRow()];
    const first = await load();
    const second = await load();
    expect(reads).toEqual(["pos_connections"]);
    expect(first).toBe(second);
    expect(first).toMatchObject({ ok: true, connection: { id: "conn-1", location_id: "L1" } });
  });

  it("answers 'no connection' without a read while the flag is off, and { ok: false } on a read error", async () => {
    vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "false");
    expect(await readSquareWalletConnection("venue-1")).toEqual({ ok: true, connection: null });
    expect(reads).toEqual([]);
    vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "true");
    failTable = { table: "pos_connections", code: "XX000" };
    expect(await readSquareWalletConnection("venue-1")).toEqual({ ok: false });
  });

  it("a venue holding both coupon kinds pays for ONE connection read; both coupons get their badge", async () => {
    db.pos_connections = [connectionRow()];
    const load = squareWalletConnectionLoader("venue-1");
    const wins = [giftWin(), menuWin()];
    const afterGift = await attachSquareGiftCardStates(wins, "venue-1", load);
    const afterBoth = await attachSquareDiscountStates(afterGift, "venue-1", load);
    expect(reads.filter((table) => table === "pos_connections")).toHaveLength(1);
    expect(afterBoth[0].squareGiftCard).toBe("available");
    expect(afterBoth[1].squareDiscount).toBe(true);
  });

  it("nothing to attach means no connection read at all", async () => {
    db.pos_connections = [connectionRow()];
    const load = squareWalletConnectionLoader("venue-1");
    const plain = [{ redemptionId: "r-x", challengeId: "c3", prizeKind: "free_item", prizeRedeemedAt: null } as unknown as ChallengeCampaignWin];
    expect(await attachSquareGiftCardStates(plain, "venue-1", load)).toBe(plain);
    expect(await attachSquareDiscountStates(plain, "venue-1", load)).toBe(plain);
    expect(reads).toEqual([]);
  });

  it("a failed connection read leaves both lists untouched", async () => {
    failTable = { table: "pos_connections", code: "XX000" };
    const load = squareWalletConnectionLoader("venue-1");
    const wins = [giftWin(), menuWin()];
    expect(await attachSquareGiftCardStates(wins, "venue-1", load)).toBe(wins);
    expect(await attachSquareDiscountStates(wins, "venue-1", load)).toBe(wins);
    expect(reads.filter((table) => table === "pos_connections")).toHaveLength(1);
  });
});

describe("rateLimitUserThenIp", () => {
  const request = () => new Request("http://localhost/x", { headers: { "x-forwarded-for": "1.1.1.1" } });

  it("claims the user's bucket first and the IP's second", async () => {
    expect(await rateLimitUserThenIp(request(), "user-1", "squareGiftCardUser", "squareGiftCardIp")).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(rpcCalls.map((c) => c.p_ip_hash)).toEqual([
      hashRequesterIp("squareGiftCardUser", "", "user-1"),
      hashRequesterIp("squareGiftCardIp", "1.1.1.1"),
    ]);
  });

  it("a denied user never touches the shared IP bucket", async () => {
    rpcAllowed = [false];
    const result = await rateLimitUserThenIp(request(), "user-1", "squareDiscountUser", "squareDiscountIp");
    expect(result.allowed).toBe(false);
    expect(rpcCalls).toHaveLength(1);
  });
});

describe("guardOwnerPosVenue", () => {
  const request = new Request("http://localhost/api/owner/pos");
  const body = async (response: Response) => ({ status: response.status, json: await response.json() });

  it("404s with the flag off, before any auth check", async () => {
    vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "false");
    const result = await guardOwnerPosVenue(request, "venue-1");
    expect("response" in result && (await body(result.response))).toEqual({ status: 404, json: { ok: false, error: "Not found." } });
    expect(authMock.requireOwnerAuth).not.toHaveBeenCalled();
  });

  it("passes through the response requireOwnerAuth throws", async () => {
    const thrown = new Response("no", { status: 401 });
    authMock.requireOwnerAuth.mockRejectedValueOnce(thrown);
    const result = await guardOwnerPosVenue(request, "venue-1");
    expect("response" in result && result.response).toBe(thrown);
  });

  it("400s without a venue and 403s for a venue the owner doesn't hold", async () => {
    authMock.requireOwnerAuth.mockResolvedValue({ ownerId: "o1", venueIds: ["venue-1"] });
    const missing = await guardOwnerPosVenue(request, "");
    expect("response" in missing && (await body(missing.response))).toEqual({ status: 400, json: { ok: false, error: "venueId is required." } });
    const foreign = await guardOwnerPosVenue(request, "venue-9");
    expect("response" in foreign && (await body(foreign.response))).toEqual({
      status: 403,
      json: { ok: false, error: "You do not have access to this venue." },
    });
  });

  it("returns the owner's auth for their own venue", async () => {
    authMock.requireOwnerAuth.mockResolvedValue({ ownerId: "o1", venueIds: ["venue-1"] });
    expect(await guardOwnerPosVenue(request, "venue-1")).toEqual({ auth: { ownerId: "o1", venueIds: ["venue-1"] } });
  });
});
