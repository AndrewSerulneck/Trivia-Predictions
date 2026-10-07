import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// docs/pos-rewards-integration-plan.md Phase 2 — the Square gift card service
// (lib/pos/squareGiftCards.ts) and the webhook recorder (lib/pos/squareWebhook.ts), against an
// in-memory stand-in for the three tables they touch. Square and the redeem RPC are mocked.

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
// Tables whose next selects fail, as a PostgREST read error would.
const failingReads = new Set<string>();

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
    if (op === "select" && failingReads.has(table)) return { data: [], error: { message: "read failed" } };
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
const CREDS = { connectionId: "conn-1", venueId: "venue-1", provider: "square", environment: "sandbox", merchantId: "M", locationId: "L1", accessToken: "AT", scopes: [] as string[] };

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
  failingReads.clear();
  for (const key of Object.keys(db)) delete db[key];
  vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "true");
  vi.stubEnv("SQUARE_ENVIRONMENT", "sandbox");
  vi.stubEnv("SQUARE_APPLICATION_ID", "app");
  vi.stubEnv("SQUARE_APPLICATION_SECRET", "secret");
  db.challenge_campaign_redemptions = [coupon()];
  mocks.loadSquareCredentials.mockReset().mockResolvedValue({ ok: true, credentials: CREDS });
  mocks.prepareReward.mockReset().mockResolvedValue({ ok: true, externalRef: "gftc:1", amountCents: 0, detail: { location_id: "L1", currency: "USD" } });
  mocks.applyReward.mockReset().mockResolvedValue({ ok: true, externalRef: "gftc:1", amountCents: 2500, detail: { balance_cents: 2500 } });
  mocks.retrieveSquareGiftCard.mockReset().mockResolvedValue({ id: "gftc:1", gan: "7783320012345678", state: "ACTIVE", balanceCents: 2500, currency: "USD" });
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

  describe("Review fix R1 (#1): a claim that landed is always fundable", () => {
    const claimThenThrow = (error: Error) =>
      mocks.redeemChallengePrize.mockImplementationOnce(async () => {
        const row = db.challenge_campaign_redemptions[0];
        row.prize_redeemed_at = new Date().toISOString();
        row.redeemed_method = "pos_square";
        throw error;
      });

    it("the claim RPC commits, then throws: the guest still gets a funded card, and the ledger never says failed", async () => {
      claimThenThrow(new Error("fetch failed: socket hang up"));
      const result = await open();
      expect(result.ok).toBe(true);
      expect(mocks.applyReward).toHaveBeenCalledTimes(1);
      expect(ledger()).toMatchObject({ status: "succeeded", external_ref: "gftc:1" });
    });

    it("same, when the RPC error is the 'unavailable' kind", async () => {
      const { PrizeRedeemUnavailableError } = await import("@/lib/challengeCampaigns");
      claimThenThrow(new PrizeRedeemUnavailableError());
      expect((await open()).ok).toBe(true);
      expect(ledger()).toMatchObject({ status: "succeeded" });
    });

    it("a claim error on a coupon still unredeemed records the failure and leaves the coupon alone", async () => {
      mocks.redeemChallengePrize.mockRejectedValueOnce(new Error("This prize has expired."));
      expect(await open()).toMatchObject({ ok: false, code: "expired" });
      expect(mocks.applyReward).not.toHaveBeenCalled();
      expect(db.challenge_campaign_redemptions[0].prize_redeemed_at).toBeNull();
      expect(ledger()).toMatchObject({ status: "failed" });
    });

    it("a `failed` ledger row on a coupon we claimed (pos_square) resumes and funds — no new card, no second claim", async () => {
      db.challenge_campaign_redemptions = [coupon({ prize_redeemed_at: "2026-10-05T00:00:00Z", redeemed_method: "pos_square" })];
      db.pos_reward_applications = [
        { id: "led-1", idempotency_key: squareApplyKey(RID), redemption_id: RID, provider: "square", action: "apply", status: "failed", external_ref: "gftc:1", external_detail: { currency: "USD" }, amount_cents: 2500, error_message: "claim failed" },
      ];
      const result = await open();
      expect(result.ok).toBe(true);
      expect(mocks.prepareReward).not.toHaveBeenCalled();
      expect(mocks.redeemChallengePrize).not.toHaveBeenCalled();
      expect(mocks.applyReward).toHaveBeenCalledWith(expect.objectContaining({ preparedRef: "gftc:1", idempotencyKey: squareApplyKey(RID) }));
      expect(ledger()).toMatchObject({ status: "succeeded", error_message: null });
    });

    it("a lost_to_guest_confirm row is still refused (another method won)", async () => {
      db.challenge_campaign_redemptions = [coupon({ prize_redeemed_at: "2026-10-05T00:00:00Z", redeemed_method: "guest_confirm" })];
      db.pos_reward_applications = [
        { id: "led-1", idempotency_key: squareApplyKey(RID), redemption_id: RID, provider: "square", action: "apply", status: "failed", external_ref: "gftc:1", external_detail: { currency: "USD" }, error_message: "lost_to_guest_confirm" },
      ];
      expect(await open()).toMatchObject({ ok: false, code: "already_redeemed" });
      expect(mocks.applyReward).not.toHaveBeenCalled();
      expect(ledger()).toMatchObject({ status: "failed" });
    });

    it("resuming never funds a card whose saved currency isn't USD", async () => {
      db.challenge_campaign_redemptions = [coupon({ prize_redeemed_at: "2026-10-05T00:00:00Z", redeemed_method: "pos_square" })];
      db.pos_reward_applications = [
        { id: "led-1", idempotency_key: squareApplyKey(RID), redemption_id: RID, provider: "square", action: "apply", status: "pending", external_ref: "gftc:1", external_detail: { currency: "CAD" } },
      ];
      expect(await open()).toMatchObject({ ok: false, code: "square_error" });
      expect(mocks.applyReward).not.toHaveBeenCalled();
    });
  });

  describe("Phase 2c: the card's own currency is checked before the coupon is claimed", () => {
    it("a non-USD card claims nothing and funds nothing; the guest keeps the normal coupon", async () => {
      mocks.prepareReward.mockResolvedValue({ ok: true, externalRef: "gftc:1", amountCents: 0, detail: { location_id: "L1", currency: "CAD" } });
      expect(await open()).toMatchObject({ ok: false, code: "not_eligible" });
      expect(mocks.redeemChallengePrize).not.toHaveBeenCalled();
      expect(mocks.applyReward).not.toHaveBeenCalled();
      expect(db.challenge_campaign_redemptions[0].prize_redeemed_at).toBeNull();
      expect(ledger()).toMatchObject({ status: "failed", error_message: "currency_not_supported:CAD" });
      // Tapping again re-checks from the ledger: no second card, no Square call, still refused.
      mocks.prepareReward.mockClear();
      expect(await open()).toMatchObject({ ok: false, code: "not_eligible" });
      expect(mocks.prepareReward).not.toHaveBeenCalled();
      expect(mocks.retrieveSquareGiftCard).not.toHaveBeenCalled();
    });

    it("funds in USD, the prize currency", async () => {
      await open();
      expect(mocks.applyReward).toHaveBeenCalledWith(expect.objectContaining({ value: expect.objectContaining({ currency: "USD" }) }));
      expect(ledger()).toMatchObject({ currency: "USD" });
    });

    it("a card prepared before Phase 2c (no saved currency) is read once from Square, then claimed", async () => {
      mocks.prepareReward.mockResolvedValue({ ok: true, externalRef: "gftc:1", amountCents: 0, detail: { location_id: "L1" } });
      expect((await open()).ok).toBe(true);
      expect(mocks.retrieveSquareGiftCard.mock.invocationCallOrder[0]).toBeLessThan(mocks.redeemChallengePrize.mock.invocationCallOrder[0]);
      expect(ledger().external_detail).toMatchObject({ currency: "USD" });
    });

    it("if that read fails, nothing is claimed", async () => {
      mocks.prepareReward.mockResolvedValue({ ok: true, externalRef: "gftc:1", amountCents: 0, detail: { location_id: "L1" } });
      mocks.retrieveSquareGiftCard.mockResolvedValueOnce({ ok: false, code: "network", message: "down", retryable: true });
      expect(await open()).toMatchObject({ ok: false, code: "square_error" });
      expect(mocks.redeemChallengePrize).not.toHaveBeenCalled();
    });
  });
});

// docs/square-scannable-prizes-plan.md Phase S2 — a dollar-off menu prize the partner set to
// "Scannable gift card" becomes a Square gift card for its dollar value, decided and priced from
// the coupon's OWN award-time snapshot (never the live reward).
describe("Phase S2: scannable dollar-off menu prizes", () => {
  const menuCoupon = (overrides: Row = {}): Row =>
    coupon({
      prize_kind: "menu_item",
      prize_gift_certificate_amount: null,
      prize_discount_kind: "dollar",
      prize_discount_value: 5,
      prize_pos_delivery: "gift_card",
      ...overrides,
    });

  beforeEach(() => {
    mocks.applyReward.mockResolvedValue({ ok: true, externalRef: "gftc:1", amountCents: 500, detail: { balance_cents: 500 } });
    mocks.retrieveSquareGiftCard.mockResolvedValue({ id: "gftc:1", gan: "7783320012345678", state: "ACTIVE", balanceCents: 500, currency: "USD" });
  });

  it("creates, claims (pos_square) and funds a card for the dollar value, in the load-bearing order", async () => {
    db.challenge_campaign_redemptions = [menuCoupon()];
    expect(await open()).toEqual({ ok: true, giftCard: { gan: "7783 3200 1234 5678", amountCents: 500, balanceCents: 500, state: "ACTIVE" } });
    const order = [mocks.prepareReward, mocks.redeemChallengePrize, mocks.applyReward].map((fn) => fn.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(mocks.redeemChallengePrize).toHaveBeenCalledWith(expect.objectContaining({ method: "pos_square", redemptionId: RID }));
    expect(mocks.applyReward).toHaveBeenCalledWith(expect.objectContaining({ value: expect.objectContaining({ amountCents: 500, currency: "USD" }) }));
    expect(ledger()).toMatchObject({ status: "succeeded", amount_cents: 500, external_ref: "gftc:1" });
  });

  it("prices from the coupon, never the live reward (which may have changed since the win)", async () => {
    db.challenge_campaign_redemptions = [menuCoupon({ prize_discount_value: 7.5 })];
    mocks.applyReward.mockImplementationOnce(async (input: { value: { amountCents: number } }) => ({
      ok: true,
      externalRef: "gftc:1",
      amountCents: input.value.amountCents,
      detail: { balance_cents: input.value.amountCents },
    }));
    db.challenge_campaigns = [
      { id: "chal-1", prize_kind: "menu_item", prize_type: null, prize_gift_certificate_amount: 99, prize_discount_kind: "dollar", prize_discount_value: 50, prize_pos_delivery: null },
    ];
    expect((await open()).ok).toBe(true);
    expect(mocks.applyReward).toHaveBeenCalledWith(expect.objectContaining({ value: expect.objectContaining({ amountCents: 750 }) }));
    expect(ledger()).toMatchObject({ amount_cents: 750 });
  });

  it("resumes a claimed scannable coupon at the same amount, without a new card or a second claim", async () => {
    db.challenge_campaign_redemptions = [menuCoupon()];
    mocks.applyReward.mockResolvedValueOnce({ ok: false, code: "network", message: "down", retryable: true });
    expect(await open()).toMatchObject({ ok: false, code: "square_error" });
    expect((await open()).ok).toBe(true);
    expect(mocks.prepareReward).toHaveBeenCalledTimes(1);
    expect(mocks.redeemChallengePrize).toHaveBeenCalledTimes(1);
    expect(mocks.applyReward.mock.calls.map(([input]) => (input as { value: { amountCents: number } }).value.amountCents)).toEqual([500, 500]);
  });

  it("a discount-delivered dollar prize (null or 'discount') is never a card — even if the live reward now says scannable", async () => {
    db.challenge_campaigns = [
      { id: "chal-1", prize_kind: "menu_item", prize_type: null, prize_gift_certificate_amount: null, prize_discount_kind: "dollar", prize_discount_value: 5, prize_pos_delivery: "gift_card" },
    ];
    for (const delivery of [null, "discount"]) {
      db.challenge_campaign_redemptions = [menuCoupon({ prize_pos_delivery: delivery })];
      expect(await open()).toMatchObject({ ok: false, code: "not_eligible" });
    }
    expect(mocks.loadSquareCredentials).not.toHaveBeenCalled();
    expect(mocks.prepareReward).not.toHaveBeenCalled();
    expect(mocks.redeemChallengePrize).not.toHaveBeenCalled();
    expect(db.pos_reward_applications ?? []).toHaveLength(0);
  });

  it("a forged 'gift_card' on a percent-off or free-item prize is never a card", async () => {
    for (const overrides of [
      { prize_discount_kind: "percent", prize_discount_value: 50 },
      { prize_discount_kind: "percent", prize_discount_value: 100 },
      { prize_discount_kind: null, prize_discount_value: null },
    ]) {
      db.challenge_campaign_redemptions = [menuCoupon(overrides)];
      expect(await open()).toMatchObject({ ok: false, code: "not_eligible" });
    }
    expect(mocks.prepareReward).not.toHaveBeenCalled();
    expect(mocks.redeemChallengePrize).not.toHaveBeenCalled();
  });

  it("a scannable coupon with no usable dollar value is refused before any Square call", async () => {
    for (const value of [null, 0, -5]) {
      db.challenge_campaign_redemptions = [menuCoupon({ prize_discount_value: value })];
      expect(await open()).toMatchObject({ ok: false, code: "not_eligible" });
    }
    expect(mocks.loadSquareCredentials).not.toHaveBeenCalled();
    expect(mocks.prepareReward).not.toHaveBeenCalled();
  });

  it("the coupon read asks for the delivery and the dollar terms", () => {
    const source = readFileSync(join(__dirname, "..", "lib/pos/squareGiftCards.ts"), "utf8");
    const columns = /const COUPON_COLUMNS =\s*"([^"]+)"/.exec(source)?.[1] ?? "";
    for (const column of ["prize_kind", "prize_discount_kind", "prize_discount_value", "prize_pos_delivery"]) {
      expect(columns.split(", ")).toContain(column);
    }
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
      // R1 #1: claimed by us but never funded (even marked failed) → resumable, so "issued".
      { redemption_id: "stuck", provider: "square", action: "apply", status: "failed", external_ref: "gftc:d", external_detail: {} },
      // Left pending, then redeemed the normal way → not a Square card.
      { redemption_id: "pending-lost", provider: "square", action: "apply", status: "pending", external_ref: "gftc:e", external_detail: {} },
    ];
    db.challenge_campaign_redemptions = [
      { id: "lost", redeemed_method: "guest_confirm" },
      { id: "stuck", redeemed_method: "pos_square" },
      { id: "pending-lost", redeemed_method: "guest_confirm" },
    ];
    const redeemed = "2026-10-01T00:00:00Z";
    const result = await attachSquareGiftCardStates(
      [
        win({ redemptionId: "fresh" }),
        win({ redemptionId: "issued", prizeRedeemedAt: redeemed }),
        win({ redemptionId: "used", prizeRedeemedAt: redeemed }),
        win({ redemptionId: "lost", prizeRedeemedAt: redeemed }),
        win({ redemptionId: "stuck", prizeRedeemedAt: redeemed }),
        win({ redemptionId: "pending-lost", prizeRedeemedAt: redeemed }),
        win({ redemptionId: "expired", prizeExpiresAt: "2020-01-01T00:00:00Z" }),
        win({ redemptionId: "menu", prizeKind: "menu_item" }),
      ],
      "venue-1",
    );
    expect(result.map((w) => w.squareGiftCard ?? null)).toEqual(["available", "issued", "used", null, "issued", null, null, null]);
  });

  it("Phase S2: a scannable dollar menu coupon is offered as a card; discount-delivered or forged ones are not", async () => {
    db.pos_connections = [{ id: "conn-1", venue_id: "venue-1", provider: "square", status: "active", location_id: "L1", environment: "sandbox" }];
    db.pos_reward_applications = [
      { redemption_id: "scan-issued", provider: "square", action: "apply", status: "succeeded", external_ref: "gftc:s", external_detail: { balance_cents: 200 } },
    ];
    const menu = { prizeKind: "menu_item", prizeDiscountKind: "dollar", prizeDiscountValue: 5 } as const;
    const result = await attachSquareGiftCardStates(
      [
        win({ ...menu, redemptionId: "scan", prizePosDelivery: "gift_card" }),
        win({ ...menu, redemptionId: "scan-issued", prizePosDelivery: "gift_card", prizeRedeemedAt: "2026-10-01T00:00:00Z" }),
        win({ ...menu, redemptionId: "discount", prizePosDelivery: "discount" }),
        win({ ...menu, redemptionId: "legacy", prizePosDelivery: null }),
        win({ ...menu, redemptionId: "percent", prizeDiscountKind: "percent", prizePosDelivery: "gift_card" }),
      ],
      "venue-1",
    );
    expect(result.map((w) => [w.redemptionId, w.squareGiftCard ?? null])).toEqual([
      ["scan", "available"],
      ["scan-issued", "issued"],
      ["discount", null],
      ["legacy", null],
      ["percent", null],
    ]);
  });

  it("Phase S2: a wallet with only discount-delivered menu coupons reads nothing", async () => {
    const wins = [win({ prizeKind: "menu_item", prizeDiscountKind: "dollar", prizePosDelivery: null })];
    expect(await attachSquareGiftCardStates(wins, "venue-1")).toBe(wins);
  });

  // R4 review: if the coupon-method read fails, a claimed-but-unfunded coupon must keep its
  // resume button (the pre-R1 ledger-only rule); the tap itself re-checks the method.
  it("falls back to the ledger alone when the coupon-method read fails", async () => {
    db.pos_connections = [{ id: "conn-1", venue_id: "venue-1", provider: "square", status: "active", location_id: "L1", environment: "sandbox" }];
    db.pos_reward_applications = [
      { redemption_id: "pending", provider: "square", action: "apply", status: "pending", external_ref: "gftc:a", external_detail: {} },
      { redemption_id: "failed", provider: "square", action: "apply", status: "failed", external_ref: "gftc:b", external_detail: {} },
    ];
    failingReads.add("challenge_campaign_redemptions");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const redeemed = "2026-10-01T00:00:00Z";
    const result = await attachSquareGiftCardStates(
      [win({ redemptionId: "pending", prizeRedeemedAt: redeemed }), win({ redemptionId: "failed", prizeRedeemedAt: redeemed })],
      "venue-1",
    );
    expect(result.map((w) => w.squareGiftCard ?? null)).toEqual(["issued", null]);
    expect(error).toHaveBeenCalledWith("[PosSquare] wallet-coupon-read-failed", "read failed");
    error.mockRestore();
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
