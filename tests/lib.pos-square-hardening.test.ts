import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// docs/pos-rewards-integration-plan.md Phase 2c — production hardening of the Square track:
// the oauth.authorization.revoked webhook, Disconnect when two venues share one Square account,
// giving back an ineligible grant, the dashboard nudge, the admin stuck-claim list + Retry
// funding, and the gift card route's rate limiter. Real lib code against an in-memory stand-in
// for the tables; Square is a stubbed `fetch`.

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const rpcCalls: Array<Record<string, unknown>> = [];
let rpcAllowed: (params: Record<string, unknown>) => boolean = () => true;

type Filter = (row: Row) => boolean;
const query = (table: string) => {
  const filters: Filter[] = [];
  let op: "select" | "update" = "select";
  let payload: Row | null = null;
  let limit = Infinity;
  let sort: { col: string; ascending: boolean } | null = null;
  // `challenge_campaign_redemptions!inner(...)`: attach each row's coupon, drop rows without one.
  let embedCoupon = false;
  const rows = () => (db[table] ??= []);
  const withEmbed = (row: Row): Row =>
    embedCoupon
      ? { ...row, challenge_campaign_redemptions: (db.challenge_campaign_redemptions ?? []).find((c) => c.id === row.redemption_id) ?? null }
      : row;
  const run = () => {
    let matched = rows()
      .map(withEmbed)
      .filter((row) => (!embedCoupon || row.challenge_campaign_redemptions) && filters.every((f) => f(row)));
    // Without an embed, `matched` holds the stored rows themselves.
    if (op === "update") matched.forEach((row) => Object.assign(row, payload));
    if (sort) {
      const { col, ascending } = sort;
      matched = [...matched].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (ascending ? 1 : -1));
    }
    return { data: matched.slice(0, limit).map((row) => ({ ...row })), error: null };
  };
  const field = (row: Row, col: string): unknown => {
    const [head, tail] = col.split(".");
    return tail ? (row[head] as Row | null)?.[tail] : row[col];
  };
  const builder = {
    select: (columns?: string) => ((embedCoupon = String(columns ?? "").includes("challenge_campaign_redemptions!inner")), builder),
    update: (value: Row) => ((op = "update"), (payload = value), builder),
    eq: (col: string, value: unknown) => (filters.push((row) => field(row, col) === value), builder),
    neq: (col: string, value: unknown) => (filters.push((row) => row[col] !== value), builder),
    not: (col: string, operator: string, value: unknown) => {
      if (operator !== "is" || value !== null) throw new Error(`mock: unsupported not(${col}, ${operator})`);
      filters.push((row) => field(row, col) !== null && field(row, col) !== undefined);
      return builder;
    },
    lt: (col: string, value: string) => (filters.push((row) => String(row[col]) < value), builder),
    gte: (col: string, value: string) => (filters.push((row) => String(row[col]) >= value), builder),
    in: (col: string, values: unknown[]) => (filters.push((row) => values.includes(row[col])), builder),
    order: (col: string, options?: { ascending?: boolean }) => ((sort = { col, ascending: options?.ascending !== false }), builder),
    limit: (n: number) => ((limit = n), builder),
    returns: () => builder,
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    then: (resolve: (value: { data: Row[]; error: unknown }) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return builder;
};

const mocks = vi.hoisted(() => ({ openSquareGiftCard: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (table: string) => query(table),
    rpc: async (_name: string, params: Record<string, unknown>) => {
      rpcCalls.push(params);
      return { data: [{ allowed: rpcAllowed(params), retry_after_seconds: 600 }], error: null };
    },
  },
}));
vi.mock("@/lib/challengeCampaigns", () => ({ PrizeRedeemUnavailableError: class extends Error {}, redeemChallengePrize: vi.fn() }));
vi.mock("@/lib/pos/squareGiftCards", () => ({ openSquareGiftCard: mocks.openSquareGiftCard }));

import { venuesNeedingPosAttention } from "@/lib/pos/connections";
import { encryptPosToken, posTokenContext } from "@/lib/pos/crypto";
import { discardSquareGrant, disconnectSquare, markSquareMerchantRevoked } from "@/lib/pos/squareConnection";
import { classifyStuckSquareClaim, listStuckSquareClaims, retrySquareFunding } from "@/lib/pos/squareStuckClaims";
import { recordSquareRevocation } from "@/lib/pos/squareWebhook";
import { hashRequesterIp, rateLimitSquareGiftCard } from "@/lib/rateLimit";

const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
const revokeCalls = () => fetchMock.mock.calls.filter((call) => String((call as unknown[])[0]).endsWith("/oauth2/revoke"));

const connection = (overrides: Row = {}): Row => {
  const venueId = String(overrides.venue_id ?? "venue-1");
  return {
    id: `conn-${venueId}`,
    venue_id: venueId,
    provider: "square",
    environment: "sandbox",
    merchant_id: "M1",
    location_id: "L1",
    access_token_enc: encryptPosToken("AT", posTokenContext(venueId, "square", "access_token")),
    refresh_token_enc: null,
    token_expires_at: "2099-01-01T00:00:00.000Z",
    status: "active",
    connected_at: "2026-10-06T12:00:00.000Z",
    ...overrides,
  };
};

beforeEach(() => {
  for (const key of Object.keys(db)) delete db[key];
  rpcCalls.length = 0;
  rpcAllowed = () => true;
  vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "true");
  vi.stubEnv("SQUARE_ENVIRONMENT", "sandbox");
  vi.stubEnv("SQUARE_APPLICATION_ID", "app");
  vi.stubEnv("SQUARE_APPLICATION_SECRET", "secret");
  vi.stubEnv("POS_TOKEN_KEY", Buffer.alloc(32, 7).toString("base64"));
  vi.stubEnv("SESSION_SECRET", "test-secret");
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  mocks.openSquareGiftCard.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("oauth.authorization.revoked → markSquareMerchantRevoked", () => {
  const event = (revokedAt = "2026-10-06T13:00:00.123456789Z", merchant = "M1") => ({
    merchant_id: merchant,
    created_at: "2026-10-06T13:00:05Z",
    data: { object: { revocation: { revoked_at: revokedAt, revoker_type: "MERCHANT" } } },
  });

  it("puts every live row for that merchant, connected before the revocation, on 'Reconnect needed' with tokens wiped", async () => {
    db.pos_connections = [connection(), connection({ venue_id: "venue-2", status: "error" })];
    expect(await recordSquareRevocation(event())).toEqual({ ok: true, changed: 2 });
    for (const row of db.pos_connections) {
      expect(row.status).toBe("error");
      expect(row.access_token_enc).toBe("revoked");
      expect(row.refresh_token_enc).toBeNull();
      expect(String(row.last_error)).toContain("MERCHANT");
    }
  });

  it("never touches a reconnect made after the revocation, a revoked row, another merchant or the other environment", async () => {
    db.pos_connections = [
      connection({ id: "old", status: "revoked", access_token_enc: "revoked" }),
      connection({ id: "reconnect", connected_at: "2026-10-06T13:00:01.000Z" }),
      connection({ id: "other-merchant", venue_id: "venue-2", merchant_id: "M2" }),
      connection({ id: "production", venue_id: "venue-3", environment: "production" }),
    ];
    const before = JSON.stringify(db.pos_connections);
    expect(await recordSquareRevocation(event())).toEqual({ ok: true, changed: 0 });
    expect(JSON.stringify(db.pos_connections)).toBe(before);
  });

  it("is idempotent: a repeated event changes nothing", async () => {
    db.pos_connections = [connection()];
    expect(await recordSquareRevocation(event())).toEqual({ ok: true, changed: 1 });
    const after = JSON.stringify(db.pos_connections);
    expect(await recordSquareRevocation(event())).toEqual({ ok: true, changed: 0 });
    expect(JSON.stringify(db.pos_connections)).toBe(after);
  });

  it("skips (200, no write) without a merchant, without SQUARE_ENVIRONMENT, or without a time", async () => {
    db.pos_connections = [connection()];
    expect(await recordSquareRevocation({ ...event(), merchant_id: "" })).toMatchObject({ changed: 0, skipped: "no_merchant" });
    expect(await recordSquareRevocation({ merchant_id: "M1", data: {} })).toMatchObject({ changed: 0, skipped: "no_time" });
    vi.stubEnv("SQUARE_ENVIRONMENT", "");
    expect(await recordSquareRevocation(event())).toMatchObject({ changed: 0, skipped: "no_environment" });
    expect(db.pos_connections[0].status).toBe("active");
  });

  it("falls back to the event time when Square omits revoked_at", async () => {
    db.pos_connections = [connection()];
    expect(await markSquareMerchantRevoked({ merchantId: "M1", environment: "sandbox", revokedAt: "2026-10-06T11:00:00.000Z", revokerType: null })).toEqual({ ok: true, changed: 0 });
    expect(await recordSquareRevocation({ merchant_id: "M1", created_at: "2026-10-06T13:00:00Z", data: {} })).toEqual({ ok: true, changed: 1 });
  });
});

describe("Disconnect when one Square account serves two venues", () => {
  it("wipes this venue's row but does NOT revoke at Square (RevokeToken would end the other venue's tokens too)", async () => {
    db.pos_connections = [connection(), connection({ venue_id: "venue-2" })];
    expect(await disconnectSquare("venue-1")).toEqual({ ok: true, revokedAtSquare: false });
    expect(revokeCalls()).toHaveLength(0);
    expect(db.pos_connections[0]).toMatchObject({ status: "revoked", access_token_enc: "revoked" });
    expect(db.pos_connections[1]).toMatchObject({ status: "active" });
  });

  it("revokes at Square when it is the merchant's only connected venue", async () => {
    db.pos_connections = [connection(), connection({ venue_id: "venue-2", status: "revoked" })];
    expect(await disconnectSquare("venue-1")).toEqual({ ok: true, revokedAtSquare: true });
    expect(revokeCalls()).toHaveLength(1);
  });

  it("disconnecting a row Square already revoked makes no Square call", async () => {
    db.pos_connections = [connection({ status: "error", access_token_enc: "revoked" })];
    expect(await disconnectSquare("venue-1")).toEqual({ ok: true, revokedAtSquare: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.pos_connections[0].status).toBe("revoked");
  });

  it("discardSquareGrant gives an unusable grant back, unless another venue uses that merchant", async () => {
    const config = { environment: "sandbox" as const, applicationId: "app", applicationSecret: "secret" };
    await discardSquareGrant({ config, accessToken: "AT2", merchantId: "M1", venueId: "venue-9" });
    expect(revokeCalls()).toHaveLength(1);
    db.pos_connections = [connection()];
    await discardSquareGrant({ config, accessToken: "AT2", merchantId: "M1", venueId: "venue-9" });
    expect(revokeCalls()).toHaveLength(1);
  });

  // Review fix R2 (#2): RevokeToken ends every token for the merchant, so a refused RECONNECT
  // must not revoke — it would kill the venue's own working connection.
  it("discardSquareGrant never revokes when this venue already holds a connection to that merchant", async () => {
    const config = { environment: "sandbox" as const, applicationId: "app", applicationSecret: "secret" };
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    db.pos_connections = [connection({ venue_id: "venue-9" })];
    await discardSquareGrant({ config, accessToken: "AT2", merchantId: "M1", venueId: "venue-9" });
    expect(revokeCalls()).toHaveLength(0);
    expect(info).toHaveBeenCalledWith("[PosSquare] discard-skipped-own-connection", { venueId: "venue-9" });
    // An `error` row of its own (e.g. waiting on a reconnect) is still a connection we leave alone.
    db.pos_connections = [connection({ venue_id: "venue-9", status: "error" })];
    await discardSquareGrant({ config, accessToken: "AT2", merchantId: "M1", venueId: "venue-9" });
    expect(revokeCalls()).toHaveLength(0);
    info.mockRestore();
  });

  // R4 review: a row Square already revoked (tokens wiped) holds nothing RevokeToken could end,
  // so a refused reconnect after it is given back, not left live at Square.
  it("discardSquareGrant revokes when the venue's own row is one Square already revoked (token wiped)", async () => {
    const config = { environment: "sandbox" as const, applicationId: "app", applicationSecret: "secret" };
    db.pos_connections = [connection({ venue_id: "venue-9", status: "error", access_token_enc: "revoked" })];
    await discardSquareGrant({ config, accessToken: "AT2", merchantId: "M1", venueId: "venue-9" });
    expect(revokeCalls()).toHaveLength(1);
  });

  it("discardSquareGrant still revokes when the venue's only rows are revoked, for another merchant, or another environment", async () => {
    const config = { environment: "sandbox" as const, applicationId: "app", applicationSecret: "secret" };
    db.pos_connections = [
      connection({ venue_id: "venue-9", status: "revoked" }),
      connection({ venue_id: "venue-9", merchant_id: "M2" }),
      connection({ venue_id: "venue-9", environment: "production" }),
      connection({ venue_id: "venue-2", status: "error" }),
    ];
    await discardSquareGrant({ config, accessToken: "AT2", merchantId: "M1", venueId: "venue-9" });
    expect(revokeCalls()).toHaveLength(1);
  });
});

describe("Dashboard nudge (venuesNeedingPosAttention)", () => {
  it("lists venues whose connection needs attention: error rows and other-environment rows", async () => {
    db.pos_connections = [
      connection({ venue_id: "ok" }),
      connection({ venue_id: "err", status: "error" }),
      connection({ venue_id: "wrong-env", environment: "production" }),
      connection({ venue_id: "gone", status: "revoked" }),
      connection({ venue_id: "not-mine", status: "error" }),
    ];
    expect((await venuesNeedingPosAttention(["ok", "err", "wrong-env", "gone"])).sort()).toEqual(["err", "wrong-env"]);
  });

  // Review fix R2 (#5): the nudge's copy says "Square", so only Square rows may raise it.
  it("ignores another provider's error row", async () => {
    db.pos_connections = [connection({ venue_id: "clover-err", provider: "clover", status: "error" })];
    expect(await venuesNeedingPosAttention(["clover-err"])).toEqual([]);
  });

  it("asks nothing with the flag off or no venues", async () => {
    db.pos_connections = [connection({ status: "error" })];
    expect(await venuesNeedingPosAttention([])).toEqual([]);
    vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "");
    expect(await venuesNeedingPosAttention(["venue-1"])).toEqual([]);
  });
});

describe("Admin stuck-claim list + Retry funding", () => {
  const OLD = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const ledger = (id: string, overrides: Row = {}): Row => ({
    id: `ledger-${id}`,
    idempotency_key: `${id}:square:apply`,
    redemption_id: id,
    venue_id: "venue-1",
    provider: "square",
    action: "apply",
    status: "pending",
    external_ref: `gftc:${id}`,
    amount_cents: 2500,
    error_code: "network",
    error_message: "Square unreachable",
    created_at: OLD,
    updated_at: OLD,
    ...overrides,
  });
  const coupon = (id: string, overrides: Row = {}): Row => ({
    id,
    winner_user_id: "user-1",
    venue_id: "venue-1",
    prize_redeemed_at: null,
    redeemed_method: null,
    ...overrides,
  });

  it("classifies: claimed-unfunded needs action; unclaimed and lost don't", () => {
    expect(classifyStuckSquareClaim({ external_ref: "g" }, { prize_redeemed_at: "t", redeemed_method: "pos_square" })).toBe("claimed_unfunded");
    expect(classifyStuckSquareClaim({ external_ref: "g" }, { prize_redeemed_at: null, redeemed_method: null })).toBe("unclaimed");
    expect(classifyStuckSquareClaim({ external_ref: "g" }, { prize_redeemed_at: "t", redeemed_method: "guest_confirm" })).toBe("lost");
    expect(classifyStuckSquareClaim({ external_ref: null }, null)).toBe("unclaimed");
  });

  it("lists only unfinished rows older than 15 minutes, with no card id, number or token", async () => {
    db.pos_reward_applications = [
      ledger("a"),
      ledger("b", { status: "succeeded" }),
      ledger("c", { created_at: new Date().toISOString() }),
      ledger("d", { status: "failed", error_code: "invalid", error_message: "lost_to_guest_confirm" }),
    ];
    db.challenge_campaign_redemptions = [
      coupon("a", { prize_redeemed_at: OLD, redeemed_method: "pos_square" }),
      coupon("d", { prize_redeemed_at: OLD, redeemed_method: "guest_confirm" }),
    ];
    db.venues = [{ id: "venue-1", name: "Pacific Street" }];
    const { claims, needsAction } = await listStuckSquareClaims();
    expect(claims.map((claim) => [claim.redemptionId, claim.kind])).toEqual([["a", "claimed_unfunded"], ["d", "lost"]]);
    expect(needsAction).toEqual({ count: 1, capped: false });
    expect(claims[0]).toMatchObject({ venueName: "Pacific Street", amountCents: 2500, errorCode: "network" });
    expect(JSON.stringify(claims)).not.toMatch(/gftc:|external_ref|challenge_campaign_redemptions/);
  });

  it("R1 #3: 60 harmless rows newer than a claimed-unfunded one never push it out of view or out of the count", async () => {
    const OLDER = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const harmless = Array.from({ length: 60 }, (_, i) =>
      ledger(`h${i}`, { created_at: new Date(Date.now() - (20 + i) * 60 * 1000).toISOString(), external_ref: i % 2 ? null : `gftc:h${i}` }),
    );
    db.pos_reward_applications = [...harmless, ledger("stuck", { created_at: OLDER, status: "failed", error_message: "claim failed" })];
    db.challenge_campaign_redemptions = [
      ...harmless.map((row) => coupon(String(row.redemption_id))),
      coupon("stuck", { prize_redeemed_at: OLDER, redeemed_method: "pos_square" }),
    ];
    const { claims, needsAction } = await listStuckSquareClaims();
    expect(claims[0]).toMatchObject({ redemptionId: "stuck", kind: "claimed_unfunded", status: "failed" });
    expect(needsAction).toEqual({ count: 1, capped: false });
    // The harmless rest: newest 50 only, never duplicated.
    expect(claims).toHaveLength(51);
    expect(claims.filter((claim) => claim.redemptionId === "stuck")).toHaveLength(1);
    expect(claims[1].redemptionId).toBe("h0");
  });

  it("R1 #3: harmless rows older than 14 days age out of view; need-action rows never do", async () => {
    const ANCIENT = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    db.pos_reward_applications = [ledger("old-harmless", { created_at: ANCIENT }), ledger("old-stuck", { created_at: ANCIENT })];
    db.challenge_campaign_redemptions = [coupon("old-harmless"), coupon("old-stuck", { prize_redeemed_at: ANCIENT, redeemed_method: "pos_square" })];
    const { claims } = await listStuckSquareClaims();
    expect(claims.map((claim) => claim.redemptionId)).toEqual(["old-stuck"]);
  });

  it("R4 review: the need-action count agrees with the badges (a pos_square method without a redeemed time is not counted)", async () => {
    db.pos_reward_applications = [ledger("odd")];
    db.challenge_campaign_redemptions = [coupon("odd", { prize_redeemed_at: null, redeemed_method: "pos_square" })];
    const { claims, needsAction } = await listStuckSquareClaims();
    expect(needsAction).toEqual({ count: 0, capped: false });
    expect(claims.map((claim) => [claim.redemptionId, claim.kind])).toEqual([["odd", "unclaimed"]]);
  });

  it("R1 #3: says 100+ when the need-action read hits its limit", async () => {
    db.pos_reward_applications = Array.from({ length: 101 }, (_, i) => ledger(`s${i}`));
    db.challenge_campaign_redemptions = Array.from({ length: 101 }, (_, i) => coupon(`s${i}`, { prize_redeemed_at: OLD, redeemed_method: "pos_square" }));
    const { needsAction } = await listStuckSquareClaims();
    expect(needsAction).toEqual({ count: 100, capped: true });
  });

  it("retries only a claimed-but-unfunded coupon, as its winner, and drops the card number", async () => {
    db.pos_reward_applications = [ledger("a"), ledger("u")];
    db.challenge_campaign_redemptions = [coupon("a", { prize_redeemed_at: OLD, redeemed_method: "pos_square" }), coupon("u")];
    mocks.openSquareGiftCard.mockResolvedValue({ ok: true, giftCard: { gan: "7783 0000 1111 2222", amountCents: 2500, balanceCents: 2500, state: "ACTIVE" } });
    const ok = await retrySquareFunding("a");
    expect(ok).toEqual({ ok: true });
    expect(JSON.stringify(ok)).not.toContain("7783");
    expect(mocks.openSquareGiftCard).toHaveBeenCalledWith({ userId: "user-1", venueId: "venue-1", redemptionId: "a" });

    mocks.openSquareGiftCard.mockClear();
    // An untouched coupon must never be turned into a Square card by an admin.
    expect(await retrySquareFunding("u")).toMatchObject({ ok: false, status: 409 });
    expect(await retrySquareFunding("missing")).toMatchObject({ ok: false, status: 404 });
    expect(mocks.openSquareGiftCard).not.toHaveBeenCalled();

    mocks.openSquareGiftCard.mockResolvedValue({ ok: false, code: "square_error", message: "Couldn't reach Square" });
    expect(await retrySquareFunding("a")).toEqual({ ok: false, status: 502, error: "Couldn't reach Square" });
  });

  it("R1 #1: retries a claimed coupon whose ledger row was wrongly marked failed; still refuses a lost one", async () => {
    db.pos_reward_applications = [
      ledger("f", { status: "failed", error_message: "claim failed" }),
      ledger("l", { status: "failed", error_message: "lost_to_guest_confirm" }),
    ];
    db.challenge_campaign_redemptions = [
      coupon("f", { prize_redeemed_at: OLD, redeemed_method: "pos_square" }),
      coupon("l", { prize_redeemed_at: OLD, redeemed_method: "guest_confirm" }),
    ];
    mocks.openSquareGiftCard.mockResolvedValue({ ok: true, giftCard: { gan: "7783 0000 1111 2222", amountCents: 2500, balanceCents: 2500, state: "ACTIVE" } });
    expect(await retrySquareFunding("f")).toEqual({ ok: true });
    expect(mocks.openSquareGiftCard).toHaveBeenCalledWith({ userId: "user-1", venueId: "venue-1", redemptionId: "f" });
    mocks.openSquareGiftCard.mockClear();
    expect(await retrySquareFunding("l")).toMatchObject({ ok: false, status: 409 });
    expect(mocks.openSquareGiftCard).not.toHaveBeenCalled();
  });
});

describe("Gift card route rate limit (rateLimitSquareGiftCard)", () => {
  const request = (ip: string) => new Request("http://localhost/api/prizes/square-gift-card", { headers: { "x-forwarded-for": ip } });

  it("checks the user's own bucket (not tied to the IP) first, then the IP's", async () => {
    expect(await rateLimitSquareGiftCard(request("1.1.1.1"), "user-1")).toEqual({ allowed: true, retryAfterSeconds: 0 });
    await rateLimitSquareGiftCard(request("2.2.2.2"), "user-1");
    expect(rpcCalls.map((call) => call.p_ip_hash)).toEqual([
      hashRequesterIp("squareGiftCardUser", "", "user-1"),
      hashRequesterIp("squareGiftCardIp", "1.1.1.1"),
      hashRequesterIp("squareGiftCardUser", "", "user-1"),
      hashRequesterIp("squareGiftCardIp", "2.2.2.2"),
    ]);
    expect(rpcCalls[0]).toMatchObject({ p_window_seconds: 3600, p_max: 30 });
    expect(rpcCalls[1]).toMatchObject({ p_window_seconds: 3600, p_max: 300 });
  });

  it("a user over their limit is stopped without spending the bar's shared IP slot", async () => {
    rpcAllowed = (params) => params.p_max !== 30;
    expect(await rateLimitSquareGiftCard(request("1.1.1.1"), "user-1")).toEqual({ allowed: false, retryAfterSeconds: 600 });
    expect(rpcCalls).toHaveLength(1);
  });
});
