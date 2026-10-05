import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// docs/pos-rewards-integration-plan.md Phase 2 — the Square gift card service
// (lib/pos/squareGiftCards.ts) and the webhook recorder (lib/pos/squareWebhook.ts), against an
// in-memory stand-in for the three tables they touch. Square and the redeem RPC are mocked.

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};

// A tiny PostgREST look-alike: select/insert/update with eq/neq/in filters, maybeSingle/single.
type Filter = (row: Row) => boolean;
const query = (table: string) => {
  const filters: Filter[] = [];
  let op: "select" | "insert" | "update" = "select";
  let payload: Row | null = null;
  const rows = () => (db[table] ??= []);
  const run = (): { data: Row[]; error: { code?: string; message: string } | null } => {
    if (op === "insert") {
      const key = payload?.idempotency_key;
      if (key && rows().some((row) => row.idempotency_key === key)) return { data: [], error: { code: "23505", message: "duplicate" } };
      const row = { id: `${table}-${rows().length + 1}`, external_ref: null, external_detail: {}, ...payload };
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
    maybeSingle: async () => {
      const { data, error } = run();
      return { data: data[0] ?? null, error };
    },
    single: async () => {
      const { data, error } = run();
      return { data: data[0] ?? null, error: error ?? (data[0] ? null : { message: "no row" }) };
    },
    then: (resolve: (value: { data: Row[]; error: unknown }) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return builder;
};

const mocks = vi.hoisted(() => ({
  redeemChallengePrize: vi.fn(),
  prepareReward: vi.fn(),
  applyReward: vi.fn(),
  retrieveSquareGiftCard: vi.fn(),
  loadSquareCredentials: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (table: string) => query(table) } }));
vi.mock("@/lib/challengeCampaigns", () => {
  class PrizeRedeemUnavailableError extends Error {}
  return { PrizeRedeemUnavailableError, redeemChallengePrize: mocks.redeemChallengePrize };
});
vi.mock("@/lib/pos/registry", () => ({
  getPosAdapter: () => ({ provider: "square", prepareReward: mocks.prepareReward, applyReward: mocks.applyReward }),
}));
vi.mock("@/lib/pos/square", () => ({ retrieveSquareGiftCard: mocks.retrieveSquareGiftCard }));
vi.mock("@/lib/pos/squareConnection", () => ({ loadSquareCredentials: mocks.loadSquareCredentials }));

import { attachSquareGiftCardStates, openSquareGiftCard, squareApplyKey } from "@/lib/pos/squareGiftCards";
import { recordSquareGiftCardActivity } from "@/lib/pos/squareWebhook";
import type { ChallengeCampaignWin } from "@/types";

const RID = "11111111-1111-1111-1111-111111111111";
const CREDS = { connectionId: "conn-1", venueId: "venue-1", provider: "square", environment: "sandbox", merchantId: "M", locationId: "L1", accessToken: "AT" };

const coupon = (overrides: Row = {}): Row => ({
  id: RID,
  challenge_id: "chal-1",
  winner_user_id: "user-1",
  venue_id: "venue-1",
  prize_redeemed_at: null,
  redeemed_method: null,
  prize_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  prize_kind: "gift_card",
  prize_type: null,
  prize_gift_certificate_amount: 25,
  ...overrides,
});

const open = () => openSquareGiftCard({ userId: "user-1", venueId: "venue-1", redemptionId: RID });
const ledger = () => (db.pos_reward_applications ?? [])[0];

beforeEach(() => {
  for (const key of Object.keys(db)) delete db[key];
  vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "true");
  vi.stubEnv("SQUARE_ENVIRONMENT", "sandbox");
  vi.stubEnv("SQUARE_APPLICATION_ID", "app");
  vi.stubEnv("SQUARE_APPLICATION_SECRET", "secret");
  db.challenge_campaign_redemptions = [coupon()];
  mocks.loadSquareCredentials.mockReset().mockResolvedValue({ ok: true, credentials: CREDS });
  mocks.prepareReward.mockReset().mockResolvedValue({ ok: true, externalRef: "gftc:1", amountCents: 0, detail: { location_id: "L1" } });
  mocks.applyReward.mockReset().mockResolvedValue({ ok: true, externalRef: "gftc:1", amountCents: 2500, detail: { balance_cents: 2500 } });
  mocks.retrieveSquareGiftCard.mockReset().mockResolvedValue({ id: "gftc:1", gan: "7783320012345678", state: "ACTIVE", balanceCents: 2500 });
  mocks.redeemChallengePrize.mockReset().mockImplementation(async () => {
    const row = db.challenge_campaign_redemptions[0];
    if (row.prize_redeemed_at) return { redeemed: false, redeemedAt: row.prize_redeemed_at };
    row.prize_redeemed_at = new Date().toISOString();
    row.redeemed_method = "pos_square";
    return { redeemed: true, redeemedAt: row.prize_redeemed_at };
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("openSquareGiftCard", () => {
  it("does nothing at all with the flag off", async () => {
    vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "");
    expect(await open()).toMatchObject({ ok: false, code: "not_eligible" });
    expect(mocks.loadSquareCredentials).not.toHaveBeenCalled();
  });

  it("treats someone else's coupon, or another venue's, as not found", async () => {
    db.challenge_campaign_redemptions = [coupon({ winner_user_id: "user-2" })];
    expect(await open()).toMatchObject({ ok: false, code: "not_found" });
    db.challenge_campaign_redemptions = [coupon({ venue_id: "venue-2" })];
    expect(await open()).toMatchObject({ ok: false, code: "not_found" });
    expect(mocks.prepareReward).not.toHaveBeenCalled();
  });

  it("only takes gift card prizes", async () => {
    db.challenge_campaign_redemptions = [coupon({ prize_kind: "menu_item" })];
    expect(await open()).toMatchObject({ ok: false, code: "not_eligible" });
  });

  it("happy path: ledger row → prepare → claim (pos_square) → fund → show", async () => {
    const result = await open();
    expect(result).toEqual({ ok: true, giftCard: { gan: "7783 3200 1234 5678", amountCents: 2500, balanceCents: 2500, state: "ACTIVE" } });

    const order = [mocks.prepareReward, mocks.redeemChallengePrize, mocks.applyReward, mocks.retrieveSquareGiftCard].map(
      (fn) => fn.mock.invocationCallOrder[0],
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(mocks.redeemChallengePrize).toHaveBeenCalledWith({ userId: "user-1", venueId: "venue-1", challengeId: "chal-1", redemptionId: RID, method: "pos_square" });
    expect(mocks.applyReward).toHaveBeenCalledWith(expect.objectContaining({ preparedRef: "gftc:1", idempotencyKey: squareApplyKey(RID), value: expect.objectContaining({ amountCents: 2500 }) }));

    expect(ledger()).toMatchObject({ idempotency_key: `${RID}:square:apply`, status: "succeeded", external_ref: "gftc:1", amount_cents: 2500, actor: "guest", provider: "square" });
    // The ledger holds the card's ID, never its number.
    expect(JSON.stringify(db.pos_reward_applications)).not.toContain("7783320012345678");
  });

  it("refuses when Confirm Redemption won the race — and never funds the card", async () => {
    mocks.redeemChallengePrize.mockImplementation(async () => {
      const row = db.challenge_campaign_redemptions[0];
      row.prize_redeemed_at = new Date().toISOString();
      row.redeemed_method = "guest_confirm";
      return { redeemed: false, redeemedAt: row.prize_redeemed_at };
    });
    expect(await open()).toMatchObject({ ok: false, code: "already_redeemed" });
    expect(mocks.applyReward).not.toHaveBeenCalled();
    expect(ledger()).toMatchObject({ status: "failed", error_message: "lost_to_guest_confirm" });
  });

  it("refuses a coupon already redeemed the normal way, before touching Square", async () => {
    db.challenge_campaign_redemptions = [coupon({ prize_redeemed_at: "2026-10-01T00:00:00Z", redeemed_method: "guest_confirm" })];
    expect(await open()).toMatchObject({ ok: false, code: "already_redeemed" });
    expect(mocks.prepareReward).not.toHaveBeenCalled();
  });

  it("refuses an expired coupon", async () => {
    db.challenge_campaign_redemptions = [coupon({ prize_expires_at: "2020-01-01T00:00:00Z" })];
    expect(await open()).toMatchObject({ ok: false, code: "expired" });
    expect(mocks.prepareReward).not.toHaveBeenCalled();
  });

  it("a failed fund leaves the coupon claimed and resumes on the next tap without re-creating or re-claiming", async () => {
    mocks.applyReward.mockResolvedValueOnce({ ok: false, code: "network", message: "down", retryable: true });
    expect(await open()).toMatchObject({ ok: false, code: "square_error" });
    expect(ledger()).toMatchObject({ status: "pending", external_ref: "gftc:1", error_code: "network" });

    const second = await open();
    expect(second.ok).toBe(true);
    expect(mocks.prepareReward).toHaveBeenCalledTimes(1);
    expect(mocks.redeemChallengePrize).toHaveBeenCalledTimes(1);
    expect(mocks.applyReward).toHaveBeenCalledTimes(2);
    expect(ledger()).toMatchObject({ status: "succeeded" });
  });

  it("a failed create claims nothing", async () => {
    mocks.prepareReward.mockResolvedValueOnce({ ok: false, code: "provider_error", message: "500", retryable: true });
    expect(await open()).toMatchObject({ ok: false, code: "square_error" });
    expect(mocks.redeemChallengePrize).not.toHaveBeenCalled();
    expect(db.challenge_campaign_redemptions[0].prize_redeemed_at).toBeNull();
  });

  it("showing an issued card again costs one Square read and no writes to Square", async () => {
    await open();
    for (const fn of [mocks.prepareReward, mocks.applyReward, mocks.redeemChallengePrize, mocks.retrieveSquareGiftCard]) fn.mockClear();
    const again = await open();
    expect(again.ok).toBe(true);
    expect(mocks.retrieveSquareGiftCard).toHaveBeenCalledTimes(1);
    expect(mocks.prepareReward).not.toHaveBeenCalled();
    expect(mocks.applyReward).not.toHaveBeenCalled();
    expect(mocks.redeemChallengePrize).not.toHaveBeenCalled();
  });

  it("says not eligible when the venue's Square isn't usable", async () => {
    mocks.loadSquareCredentials.mockResolvedValue({ ok: false, reason: "needs_location" });
    expect(await open()).toMatchObject({ ok: false, code: "not_eligible" });
  });
});

describe("attachSquareGiftCardStates", () => {
  const win = (overrides: Partial<ChallengeCampaignWin>): ChallengeCampaignWin => ({
    redemptionId: RID,
    challengeId: "chal-1",
    venueId: "venue-1",
    challengeName: "Trivia",
    challengeRules: "",
    winnerUserId: "user-1",
    prizeKind: "gift_card",
    prizeExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    prizeRedeemedAt: null,
    ...overrides,
  });

  it("adds nothing (and reads nothing) with the flag off", async () => {
    vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "");
    const wins = [win({})];
    expect(await attachSquareGiftCardStates(wins, "venue-1")).toBe(wins);
  });

  it("adds nothing without an active Square connection that has a location", async () => {
    db.pos_connections = [{ id: "conn-1", venue_id: "venue-1", provider: "square", status: "active", location_id: null, environment: "sandbox" }];
    const result = await attachSquareGiftCardStates([win({})], "venue-1");
    expect(result[0].squareGiftCard).toBeUndefined();
  });

  it("ignores a connection made in the other Square environment (a sandbox test row on a live server)", async () => {
    vi.stubEnv("SQUARE_ENVIRONMENT", "production");
    db.pos_connections = [{ id: "conn-1", venue_id: "venue-1", provider: "square", status: "active", location_id: "L1", environment: "sandbox" }];
    const result = await attachSquareGiftCardStates([win({})], "venue-1");
    expect(result[0].squareGiftCard).toBeUndefined();
  });

  it("marks available / issued / used, and leaves other prizes alone", async () => {
    db.pos_connections = [{ id: "conn-1", venue_id: "venue-1", provider: "square", status: "active", location_id: "L1", environment: "sandbox" }];
    db.pos_reward_applications = [
      { redemption_id: "issued", provider: "square", action: "apply", status: "succeeded", external_ref: "gftc:a", external_detail: { balance_cents: 900 } },
      { redemption_id: "used", provider: "square", action: "apply", status: "succeeded", external_ref: "gftc:b", external_detail: { balance_cents: 0 } },
      { redemption_id: "lost", provider: "square", action: "apply", status: "failed", external_ref: "gftc:c", external_detail: {} },
    ];
    const redeemed = "2026-10-01T00:00:00Z";
    const result = await attachSquareGiftCardStates(
      [
        win({ redemptionId: "fresh" }),
        win({ redemptionId: "issued", prizeRedeemedAt: redeemed }),
        win({ redemptionId: "used", prizeRedeemedAt: redeemed }),
        win({ redemptionId: "lost", prizeRedeemedAt: redeemed }),
        win({ redemptionId: "expired", prizeExpiresAt: "2020-01-01T00:00:00Z" }),
        win({ redemptionId: "menu", prizeKind: "menu_item" }),
      ],
      "venue-1",
    );
    expect(result.map((w) => w.squareGiftCard ?? null)).toEqual(["available", "issued", "used", null, null, null]);
  });
});

describe("recordSquareGiftCardActivity (webhook)", () => {
  beforeEach(() => {
    db.pos_reward_applications = [
      { id: "led-1", redemption_id: RID, provider: "square", action: "apply", status: "succeeded", external_ref: "gftc:1", external_detail: { balance_cents: 2500 } },
    ];
    db.challenge_campaign_redemptions = [coupon({ prize_redeemed_at: "2026-10-05T00:00:00Z", redeemed_method: "pos_square" })];
  });

  it("ignores gift cards that aren't ours (the partner's own sales)", async () => {
    expect(await recordSquareGiftCardActivity({ id: "a", type: "REDEEM", gift_card_id: "gftc:someone-else" })).toEqual({ ok: true, matched: false });
  });

  it("records the balance and the first spend on our card, without re-claiming a claimed coupon", async () => {
    const result = await recordSquareGiftCardActivity({
      id: "act-1",
      type: "REDEEM",
      gift_card_id: "gftc:1",
      created_at: "2026-10-05T14:00:00Z",
      gift_card_balance_money: { amount: 1500 },
    });
    expect(result).toEqual({ ok: true, matched: true });
    expect(ledger().external_detail).toMatchObject({ balance_cents: 1500, last_activity_type: "REDEEM", first_redeemed_at: "2026-10-05T14:00:00Z" });
    expect(mocks.redeemChallengePrize).not.toHaveBeenCalled();
  });

  it("never lets an older or repeated event overwrite a newer one", async () => {
    await recordSquareGiftCardActivity({ id: "act-2", type: "REDEEM", gift_card_id: "gftc:1", created_at: "2026-10-05T15:00:00Z", gift_card_balance_money: { amount: 0 } });
    const stale = await recordSquareGiftCardActivity({ id: "act-1", type: "REDEEM", gift_card_id: "gftc:1", created_at: "2026-10-05T14:00:00Z", gift_card_balance_money: { amount: 1500 } });
    expect(stale).toEqual({ ok: true, matched: true, skipped: "stale" });
    expect(ledger().external_detail).toMatchObject({ balance_cents: 0 });
    expect(await recordSquareGiftCardActivity({ id: "act-2", type: "REDEEM", gift_card_id: "gftc:1", created_at: "2026-10-05T15:00:00Z" })).toEqual({
      ok: true,
      matched: true,
      skipped: "stale",
    });
  });

  it("backstop: a spend on a card whose coupon is somehow unclaimed claims it via the RPC", async () => {
    db.challenge_campaign_redemptions = [coupon()];
    await recordSquareGiftCardActivity({ id: "act-1", type: "REDEEM", gift_card_id: "gftc:1", created_at: "2026-10-05T14:00:00Z" });
    expect(mocks.redeemChallengePrize).toHaveBeenCalledWith(expect.objectContaining({ redemptionId: RID, method: "pos_square" }));
  });
});
