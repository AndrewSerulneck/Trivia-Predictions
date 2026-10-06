import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// docs/pos-rewards-integration-plan.md Phase 2d — menu-item prizes as ready-made Square
// discounts: the pure name/terms builder (lib/pos/squareDiscountSpec.ts), Square's catalog
// calls (lib/pos/square.ts), the find-or-create service and wallet tagging
// (lib/pos/squareDiscounts.ts), the route's limiter order, and a reconnect keeping its location
// (lib/pos/squareConnection.ts). Real lib code against an in-memory stand-in for the tables;
// Square is a stubbed `fetch`.

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const rpcCalls: Array<Record<string, unknown>> = [];

type Filter = (row: Row) => boolean;
const query = (table: string) => {
  const filters: Filter[] = [];
  let op: "select" | "insert" | "update" = "select";
  let payload: Row | null = null;
  const rows = () => (db[table] ??= []);
  const run = () => {
    if (op === "insert") {
      const row = { id: `${table}-${rows().length + 1}`, ...payload };
      rows().push(row);
      return { data: [row], error: null };
    }
    const matched = rows().filter((row) => filters.every((f) => f(row)));
    if (op === "update") matched.forEach((row) => Object.assign(row, payload));
    return { data: matched.map((row) => ({ ...row })), error: null };
  };
  const builder = {
    select: () => builder,
    insert: (value: Row) => ((op = "insert"), (payload = value), builder),
    update: (value: Row) => ((op = "update"), (payload = value), builder),
    eq: (col: string, value: unknown) => (filters.push((row) => row[col] === value), builder),
    neq: (col: string, value: unknown) => (filters.push((row) => row[col] !== value), builder),
    in: (col: string, values: unknown[]) => (filters.push((row) => values.includes(row[col])), builder),
    returns: () => builder,
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    then: (resolve: (value: { data: Row[]; error: unknown }) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return builder;
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (table: string) => query(table),
    rpc: async (_name: string, params: Record<string, unknown>) => {
      rpcCalls.push(params);
      return { data: [{ allowed: true, retry_after_seconds: 0 }], error: null };
    },
  },
}));

import { encryptPosToken, posTokenContext } from "@/lib/pos/crypto";
import { createSquareDiscount, findSquareDiscountByName } from "@/lib/pos/square";
import { SQUARE_OAUTH_SCOPES } from "@/lib/pos/squareConfig";
import { saveSquareConnection } from "@/lib/pos/squareConnection";
import { squareDiscountSpec, type SquareDiscountPrize } from "@/lib/pos/squareDiscountSpec";
import { attachSquareDiscountStates, ensureSquarePrizeDiscount } from "@/lib/pos/squareDiscounts";
import { hashRequesterIp, rateLimitSquareDiscount } from "@/lib/rateLimit";
import type { ChallengeCampaignWin } from "@/types";

const RID = "22222222-2222-2222-2222-222222222222";
const ALL_SCOPES = [...SQUARE_OAUTH_SCOPES];
const OLD_SCOPES = ["MERCHANT_PROFILE_READ", "GIFTCARDS_READ", "GIFTCARDS_WRITE"];

type SquareCall = { url: string; body: Record<string, unknown> | null };
const squareCalls: SquareCall[] = [];
let squareReply: (call: SquareCall) => { status: number; body: unknown } = () => ({ status: 200, body: {} });

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const call = { url: String(input), body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null };
  squareCalls.push(call);
  const { status, body } = squareReply(call);
  return new Response(JSON.stringify(body), { status });
});

const discountObject = (id: string, name: string, extra: Row = {}) => ({ id, type: "DISCOUNT", discount_data: { name }, ...extra });

const connection = (overrides: Row = {}): Row => ({
  id: "conn-1",
  venue_id: "venue-1",
  provider: "square",
  environment: "sandbox",
  merchant_id: "M1",
  location_id: "L1",
  access_token_enc: encryptPosToken("AT", posTokenContext("venue-1", "square", "access_token")),
  refresh_token_enc: null,
  token_expires_at: "2099-01-01T00:00:00.000Z",
  status: "active",
  scopes: ALL_SCOPES,
  ...overrides,
});

const coupon = (overrides: Row = {}): Row => ({
  id: RID,
  challenge_id: null,
  winner_user_id: "user-1",
  venue_id: "venue-1",
  prize_redeemed_at: null,
  prize_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  prize_type: null,
  prize_kind: "menu_item",
  prize_menu_item: "appetizer",
  prize_menu_item_name: null,
  prize_discount_kind: "percent",
  prize_discount_value: 50,
  prize_pos_value_cents: 1200,
  ...overrides,
});

beforeEach(() => {
  for (const key of Object.keys(db)) delete db[key];
  rpcCalls.length = 0;
  squareCalls.length = 0;
  squareReply = () => ({ status: 200, body: {} });
  vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "true");
  vi.stubEnv("SQUARE_ENVIRONMENT", "sandbox");
  vi.stubEnv("SQUARE_APPLICATION_ID", "app");
  vi.stubEnv("SQUARE_APPLICATION_SECRET", "secret");
  vi.stubEnv("POS_TOKEN_KEY", Buffer.alloc(32, 7).toString("base64"));
  vi.stubEnv("SESSION_SECRET", "test-secret");
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("squareDiscountSpec — one discount per prize, named by its terms", () => {
  const prize = (overrides: Partial<SquareDiscountPrize>): SquareDiscountPrize => ({
    prizeKind: "menu_item",
    prizeMenuItem: "appetizer",
    prizeMenuItemName: null,
    prizeDiscountKind: "percent",
    prizeDiscountValue: 50,
    prizePosValueCents: null,
    ...overrides,
  });

  it("percent off with a cap: Square applies the percentage and stops at the cap", () => {
    expect(squareDiscountSpec(prize({ prizePosValueCents: 1200 }))).toEqual({
      name: "Hightop prize: 50% off Appetizer (max $12)",
      kind: "FIXED_PERCENTAGE",
      amountCents: null,
      percentage: "50",
      maxCents: 1200,
    });
    expect(squareDiscountSpec(prize({ prizePosValueCents: 1250 }))?.name).toBe("Hightop prize: 50% off Appetizer (max $12.50)");
  });

  it("percent off without a cap (Andrew: the cap is optional) has no limit", () => {
    expect(squareDiscountSpec(prize({}))).toMatchObject({ name: "Hightop prize: 50% off Appetizer", maxCents: null });
  });

  it("100% reads as free; dollar off is a fixed amount", () => {
    expect(squareDiscountSpec(prize({ prizeDiscountValue: 100, prizeMenuItem: "dessert", prizePosValueCents: 900 }))?.name).toBe(
      "Hightop prize: free Dessert (max $9)",
    );
    expect(squareDiscountSpec(prize({ prizeDiscountKind: "dollar", prizeDiscountValue: 5, prizeMenuItem: "entree" }))).toEqual({
      name: "Hightop prize: $5 off Entrée",
      kind: "FIXED_AMOUNT",
      amountCents: 500,
      percentage: null,
      maxCents: null,
    });
    // A cap means nothing on a dollar prize: the dollar amount IS the limit.
    expect(squareDiscountSpec(prize({ prizeDiscountKind: "dollar", prizeDiscountValue: 7.5, prizePosValueCents: 300 }))?.name).toBe(
      "Hightop prize: $7.50 off Appetizer",
    );
  });

  it("uses the partner's own item name for 'other', tidied and shortened", () => {
    const long = `  Big   ${"x".repeat(80)}`;
    const name = squareDiscountSpec(prize({ prizeMenuItem: "other", prizeMenuItemName: long }))?.name ?? "";
    expect(name.startsWith("Hightop prize: 50% off Big x")).toBe(true);
    expect(name.length).toBeLessThanOrEqual(120);
    expect(squareDiscountSpec(prize({ prizeMenuItem: "other", prizeMenuItemName: "  " }))?.name).toBe("Hightop prize: 50% off Menu Item");
  });

  it("is null for gift cards and for prizes missing their terms; ignores a bad cap", () => {
    expect(squareDiscountSpec(prize({ prizeKind: "gift_card" }))).toBeNull();
    expect(squareDiscountSpec(prize({ prizeDiscountValue: null }))).toBeNull();
    expect(squareDiscountSpec(prize({ prizeDiscountValue: 0 }))).toBeNull();
    expect(squareDiscountSpec(prize({ prizeDiscountKind: null }))).toBeNull();
    expect(squareDiscountSpec(prize({ prizePosValueCents: 0 }))?.maxCents).toBeNull();
    expect(squareDiscountSpec(prize({ prizeDiscountValue: 150 }))?.percentage).toBe("100");
  });
});

describe("Square catalog calls", () => {
  const creds = { connectionId: "c", venueId: "v", provider: "square" as const, environment: "sandbox" as const, merchantId: "M", locationId: "L1", accessToken: "AT", scopes: ALL_SCOPES };

  it("searches DISCOUNTs by exact name and ignores deleted or differently named results", async () => {
    squareReply = () => ({
      status: 200,
      body: { objects: [discountObject("D0", "Hightop prize: x", { is_deleted: true }), discountObject("D1", "Other"), discountObject("D2", "HIGHTOP PRIZE: X")] },
    });
    expect(await findSquareDiscountByName(creds, "Hightop prize: x")).toEqual({ id: "D2", name: "HIGHTOP PRIZE: X" });
    expect(squareCalls[0].url).toBe("https://connect.squareupsandbox.com/v2/catalog/search");
    expect(squareCalls[0].body).toMatchObject({
      object_types: ["DISCOUNT"],
      include_deleted_objects: false,
      query: { exact_query: { attribute_name: "name", attribute_value: "Hightop prize: x" } },
    });
    squareReply = () => ({ status: 200, body: {} });
    expect(await findSquareDiscountByName(creds, "Hightop prize: x")).toBeNull();
  });

  it("creates a capped percentage discount at every location; a dollar discount carries its amount", async () => {
    squareReply = () => ({ status: 200, body: { catalog_object: discountObject("NEW", "Hightop prize: 50% off Appetizer (max $12)") } });
    const spec = squareDiscountSpec({ prizeKind: "menu_item", prizeMenuItem: "appetizer", prizeMenuItemName: null, prizeDiscountKind: "percent", prizeDiscountValue: 50, prizePosValueCents: 1200 })!;
    expect(await createSquareDiscount(creds, spec, "key-1")).toEqual({ id: "NEW", name: "Hightop prize: 50% off Appetizer (max $12)" });
    expect(squareCalls[0].url).toBe("https://connect.squareupsandbox.com/v2/catalog/object");
    expect(squareCalls[0].body).toEqual({
      idempotency_key: "key-1",
      object: {
        type: "DISCOUNT",
        id: "#hightop-prize",
        present_at_all_locations: true,
        discount_data: {
          name: "Hightop prize: 50% off Appetizer (max $12)",
          discount_type: "FIXED_PERCENTAGE",
          percentage: "50",
          maximum_amount_money: { amount: 1200, currency: "USD" },
          pin_required: false,
        },
      },
    });

    const dollar = squareDiscountSpec({ prizeKind: "menu_item", prizeMenuItem: "entree", prizeMenuItemName: null, prizeDiscountKind: "dollar", prizeDiscountValue: 5, prizePosValueCents: null })!;
    await createSquareDiscount(creds, dollar, "key-2");
    expect((squareCalls[1].body?.object as Row).discount_data).toEqual({
      name: "Hightop prize: $5 off Entrée",
      discount_type: "FIXED_AMOUNT",
      amount_money: { amount: 500, currency: "USD" },
      pin_required: false,
    });
  });
});

describe("ensureSquarePrizeDiscount", () => {
  const call = () => ensureSquarePrizeDiscount({ userId: "user-1", venueId: "venue-1", redemptionId: RID });
  const searchCalls = () => squareCalls.filter((c) => c.url.endsWith("/v2/catalog/search"));
  const createCalls = () => squareCalls.filter((c) => c.url.endsWith("/v2/catalog/object"));

  it("returns the existing discount's name without creating one", async () => {
    db.pos_connections = [connection()];
    db.challenge_campaign_redemptions = [coupon()];
    squareReply = (c) => (c.url.endsWith("/search") ? { status: 200, body: { objects: [discountObject("D1", "Hightop prize: 50% off Appetizer (max $12)")] } } : { status: 500, body: {} });
    expect(await call()).toEqual({ ok: true, discount: { name: "Hightop prize: 50% off Appetizer (max $12)" } });
    expect(searchCalls()).toHaveLength(1);
    expect(createCalls()).toHaveLength(0);
  });

  it("creates it when missing (first use, or the partner deleted it), with a fresh key each time", async () => {
    db.pos_connections = [connection()];
    db.challenge_campaign_redemptions = [coupon()];
    squareReply = (c) =>
      c.url.endsWith("/search") ? { status: 200, body: {} } : { status: 200, body: { catalog_object: discountObject("NEW", String(((c.body?.object as Row).discount_data as Row).name)) } };
    expect(await call()).toEqual({ ok: true, discount: { name: "Hightop prize: 50% off Appetizer (max $12)" } });
    await call();
    const keys = createCalls().map((c) => c.body?.idempotency_key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("uses the LIVE reward's terms when it still exists, as the wallet shows them", async () => {
    db.pos_connections = [connection()];
    db.challenge_campaign_redemptions = [coupon({ challenge_id: "camp-1" })];
    db.challenge_campaigns = [
      { id: "camp-1", prize_type: null, prize_kind: "menu_item", prize_menu_item: "entree", prize_menu_item_name: null, prize_discount_kind: "percent", prize_discount_value: 25, prize_pos_value_cents: null },
    ];
    squareReply = () => ({ status: 200, body: {} });
    await call();
    expect((searchCalls()[0].body?.query as { exact_query: Row }).exact_query.attribute_value).toBe("Hightop prize: 25% off Entrée");
  });

  it("legacy free-appetizer coupons map to a free appetizer", async () => {
    db.pos_connections = [connection()];
    db.challenge_campaign_redemptions = [
      coupon({ prize_kind: null, prize_type: "free_appetizer", prize_menu_item: null, prize_discount_kind: null, prize_discount_value: null, prize_pos_value_cents: null }),
    ];
    await call();
    expect((searchCalls()[0].body?.query as { exact_query: Row }).exact_query.attribute_value).toBe("Hightop prize: free Appetizer");
  });

  it("refuses without touching Square: someone else's coupon, redeemed, expired, gift card, old grant, flag off", async () => {
    db.pos_connections = [connection()];
    db.challenge_campaign_redemptions = [coupon({ winner_user_id: "someone-else" })];
    expect(await call()).toMatchObject({ ok: false, code: "not_found" });
    db.challenge_campaign_redemptions = [coupon({ prize_redeemed_at: "2026-10-01T00:00:00Z" })];
    expect(await call()).toMatchObject({ ok: false, code: "already_redeemed" });
    db.challenge_campaign_redemptions = [coupon({ prize_expires_at: "2020-01-01T00:00:00Z" })];
    expect(await call()).toMatchObject({ ok: false, code: "expired" });
    db.challenge_campaign_redemptions = [coupon({ prize_kind: "gift_card", prize_menu_item: null, prize_discount_kind: null, prize_discount_value: null })];
    expect(await call()).toMatchObject({ ok: false, code: "not_eligible" });
    db.challenge_campaign_redemptions = [coupon()];
    db.pos_connections = [connection({ scopes: OLD_SCOPES })];
    expect(await call()).toMatchObject({ ok: false, code: "not_eligible" });
    vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "");
    db.pos_connections = [connection()];
    expect(await call()).toMatchObject({ ok: false, code: "not_eligible" });
    expect(squareCalls).toHaveLength(0);
  });

  it("a Square failure is a square_error, never a crash", async () => {
    db.pos_connections = [connection()];
    db.challenge_campaign_redemptions = [coupon()];
    squareReply = () => ({ status: 500, body: {} });
    expect(await call()).toMatchObject({ ok: false, code: "square_error" });
    squareReply = (c) => (c.url.endsWith("/search") ? { status: 200, body: {} } : { status: 400, body: { errors: [{ code: "BAD" }] } });
    expect(await call()).toMatchObject({ ok: false, code: "square_error" });
  });
});

describe("attachSquareDiscountStates", () => {
  const win = (overrides: Partial<ChallengeCampaignWin>): ChallengeCampaignWin => ({
    redemptionId: RID,
    challengeId: "chal-1",
    venueId: "venue-1",
    challengeName: "Trivia",
    challengeRules: "",
    winnerUserId: "user-1",
    prizeKind: "menu_item",
    prizeMenuItem: "appetizer",
    prizeDiscountKind: "percent",
    prizeDiscountValue: 50,
    prizeExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    prizeRedeemedAt: null,
    ...overrides,
  });

  it("tags only unredeemed, unexpired menu-item coupons, and only with the catalog scopes", async () => {
    db.pos_connections = [connection()];
    const result = await attachSquareDiscountStates(
      [
        win({ redemptionId: "fresh" }),
        win({ redemptionId: "redeemed", prizeRedeemedAt: "2026-10-01T00:00:00Z" }),
        win({ redemptionId: "expired", prizeExpiresAt: "2020-01-01T00:00:00Z" }),
        win({ redemptionId: "gift", prizeKind: "gift_card", prizeDiscountKind: null, prizeDiscountValue: null }),
      ],
      "venue-1",
    );
    expect(result.map((w) => [w.redemptionId, w.squareDiscount ?? null])).toEqual([
      ["fresh", true],
      ["redeemed", null],
      ["expired", null],
      ["gift", null],
    ]);
    expect(squareCalls).toHaveLength(0);

    db.pos_connections = [connection({ scopes: OLD_SCOPES })];
    expect((await attachSquareDiscountStates([win({})], "venue-1"))[0].squareDiscount).toBeUndefined();
    db.pos_connections = [connection({ location_id: null })];
    expect((await attachSquareDiscountStates([win({})], "venue-1"))[0].squareDiscount).toBeUndefined();
    db.pos_connections = [connection({ environment: "production" })];
    expect((await attachSquareDiscountStates([win({})], "venue-1"))[0].squareDiscount).toBeUndefined();
  });

  it("reads nothing with the flag off or with no menu-item coupon", async () => {
    vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "");
    const wins = [win({})];
    expect(await attachSquareDiscountStates(wins, "venue-1")).toBe(wins);
    vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "true");
    const gifts = [win({ prizeKind: "gift_card" })];
    expect(await attachSquareDiscountStates(gifts, "venue-1")).toBe(gifts);
  });
});

describe("Discount route rate limit (rateLimitSquareDiscount)", () => {
  it("checks the user's own bucket first, then the IP's", async () => {
    const request = new Request("http://localhost/api/prizes/square-discount", { headers: { "x-forwarded-for": "1.1.1.1" } });
    expect(await rateLimitSquareDiscount(request, "user-1")).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(rpcCalls.map((c) => c.p_ip_hash)).toEqual([
      hashRequesterIp("squareDiscountUser", "", "user-1"),
      hashRequesterIp("squareDiscountIp", "1.1.1.1"),
    ]);
    expect(rpcCalls[0]).toMatchObject({ p_window_seconds: 3600, p_max: 30 });
    expect(rpcCalls[1]).toMatchObject({ p_window_seconds: 3600, p_max: 300 });
  });
});

describe("saveSquareConnection — reconnecting once for the catalog scopes", () => {
  const tokens = { accessToken: "AT2", refreshToken: "RT2", expiresAt: "2026-11-05T00:00:00Z", merchantId: "M1" };
  const save = (extra: { locationId?: string | null; eligibleLocationIds?: string[]; merchantId?: string }) =>
    saveSquareConnection({
      venueId: "venue-1",
      ownerId: "owner-1",
      environment: "sandbox",
      tokens: { ...tokens, merchantId: extra.merchantId ?? "M1" },
      merchantName: "Pub",
      locationId: extra.locationId ?? null,
      eligibleLocationIds: extra.eligibleLocationIds,
    });

  it("records every scope and keeps the chosen location of the same Square account", async () => {
    db.pos_connections = [connection({ location_id: "L2", scopes: OLD_SCOPES })];
    expect(await save({ eligibleLocationIds: ["L1", "L2"] })).toEqual({ ok: true, locationId: "L2" });
    expect(db.pos_connections[0]).toMatchObject({ location_id: "L2", scopes: ALL_SCOPES, status: "active" });
  });

  it("asks again when the location is no longer eligible or the account changed", async () => {
    db.pos_connections = [connection({ location_id: "L2" })];
    expect(await save({ eligibleLocationIds: ["L1"] })).toEqual({ ok: true, locationId: null });
    db.pos_connections = [connection({ location_id: "L2" })];
    expect(await save({ eligibleLocationIds: ["L2"], merchantId: "OTHER" })).toEqual({ ok: true, locationId: null });
  });

  it("a single-location account still uses that location", async () => {
    db.pos_connections = [];
    expect(await save({ locationId: "L9", eligibleLocationIds: ["L9"] })).toEqual({ ok: true, locationId: "L9" });
    expect(db.pos_connections[0]).toMatchObject({ venue_id: "venue-1", location_id: "L9", scopes: ALL_SCOPES });
  });
});
