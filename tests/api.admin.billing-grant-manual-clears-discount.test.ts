import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 2 of docs/billing-code-review-fixes-plan.md — grant-manual nulls every
 * processor id when converting a venue to offline billing, but previously left
 * discount_* populated. A Stripe coupon's label/percent then survived the
 * conversion and kept mispricing the owner page (effectiveAmountCents). This
 * covers both halves of the fix: the Stripe-side coupon is detached, and the
 * upsert payload clears the mirror regardless of what the detach call does.
 */

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  cancelSubscription: vi.fn(),
  removeDiscountFromSubscription: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({
  requireAdminAuth: vi.fn(async () => ({ ok: true, authUserId: "admin-1", adminUsername: "admin" })),
}));

vi.mock("@/lib/billing", () => ({
  cancelSubscription: mocks.cancelSubscription,
}));

vi.mock("@/lib/billingDiscounts", async (importOriginal) => ({
  // hasDiscountMirror/removalIsMootAtStripe are pure predicates — use the real
  // ones so this suite exercises the same skip logic the route ships with.
  ...(await importOriginal<typeof import("@/lib/billingDiscounts")>()),
  removeDiscountFromSubscription: mocks.removeDiscountFromSubscription,
  CLEARED_MIRROR: {
    stripe_coupon_id: null,
    discount_label: null,
    discount_percent_off: null,
    discount_amount_off_cents: null,
    discount_ends_at: null,
  },
}));

type ExistingSub = {
  id: string;
  billing_method: string;
  stripe_subscription_id: string | null;
  status: string;
  amount_cents: number;
  current_period_end: string | null;
  // Round-2 finding 1: the route now reads the mirror to decide whether the
  // detach is worth attempting, so a row without these is a row with no
  // discount — and correctly skips the Stripe call these tests assert on.
  stripe_coupon_id: string | null;
  discount_label: string | null;
  discount_percent_off: number | null;
  discount_amount_off_cents: number | null;
  discount_ends_at: string | null;
};

const A_DISCOUNT = {
  stripe_coupon_id: "hc-pct-25-forever",
  discount_label: "25% off",
  discount_percent_off: 25,
  discount_amount_off_cents: null,
  discount_ends_at: null,
} as const;

vi.mock("@/lib/supabaseAdmin", () => {
  let existingSub: ExistingSub | null = null;
  return {
    supabaseAdmin: {
      from: vi.fn((table: string) => {
        if (table === "billing_subscriptions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: existingSub })),
              })),
            })),
            upsert: vi.fn((...args: unknown[]) => {
              mocks.upsert(...args);
              return {
                select: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: { id: "sub-new" }, error: null })),
                })),
              };
            }),
          };
        }
        if (table === "venue_owner_venues") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve({ data: { owner_id: "owner-1" } })),
                })),
              })),
            })),
          };
        }
        if (table === "billing_invoices") {
          return { insert: vi.fn(() => Promise.resolve({ error: null })) };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
      __setExistingSub: (row: ExistingSub | null) => {
        existingSub = row;
      },
    },
  };
});

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { POST } from "@/app/api/admin/billing/route";

const setExistingSub = (row: ExistingSub | null) => {
  (supabaseAdmin as unknown as { __setExistingSub: (r: ExistingSub | null) => void }).__setExistingSub(row);
};

const grantRequest = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/admin/billing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const futureDate = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
};

const upsertedRow = () =>
  mocks.upsert.mock.calls[0][0] as {
    discount_label: string | null;
    discount_percent_off: number | null;
    discount_amount_off_cents: number | null;
    discount_ends_at: string | null;
    stripe_coupon_id: string | null;
  };

describe("POST /api/admin/billing — grant-manual clears the discount mirror", () => {
  beforeEach(() => {
    mocks.upsert.mockReset();
    mocks.cancelSubscription.mockReset();
    mocks.removeDiscountFromSubscription.mockReset();
    mocks.removeDiscountFromSubscription.mockResolvedValue({ ok: true, mode: "stripe" });
  });

  it("detaches the Stripe coupon and nulls every discount_* column on the upsert", async () => {
    const existing: ExistingSub = {
      id: "sub-1",
      billing_method: "stripe",
      stripe_subscription_id: "sub_stripe_1",
      status: "past_due",
      amount_cents: 10000,
      current_period_end: null,
      ...A_DISCOUNT,
    };
    setExistingSub(existing);
    mocks.cancelSubscription.mockResolvedValue({ ok: true, mode: "stripe" });

    const response = await POST(
      grantRequest({
        action: "grant-manual",
        venueId: "venue-1",
        paidThroughDate: futureDate(),
        amountDollars: 100,
        force: true,
      })
    );
    const body = (await response.json()) as { ok: boolean };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.removeDiscountFromSubscription).toHaveBeenCalledWith(existing);

    const row = upsertedRow();
    expect(row.discount_label).toBeNull();
    expect(row.discount_percent_off).toBeNull();
    expect(row.discount_amount_off_cents).toBeNull();
    expect(row.discount_ends_at).toBeNull();
    expect(row.stripe_coupon_id).toBeNull();
  });

  it("still clears the mirror in the upsert for a row with no discount to detach", async () => {
    const existing: ExistingSub = {
      id: "sub-2",
      billing_method: "stripe",
      stripe_subscription_id: "sub_stripe_2",
      status: "past_due",
      amount_cents: 10000,
      current_period_end: null,
      stripe_coupon_id: null,
      discount_label: null,
      discount_percent_off: null,
      discount_amount_off_cents: null,
      discount_ends_at: null,
    };
    setExistingSub(existing);
    mocks.cancelSubscription.mockResolvedValue({ ok: true, mode: "stripe" });

    await POST(
      grantRequest({
        action: "grant-manual",
        venueId: "venue-2",
        paidThroughDate: futureDate(),
        amountDollars: 100,
        force: true,
      })
    );

    // Nothing to detach, so the helper is skipped — but the upsert still nulls
    // the mirror, which is what this half of the round-1 fix guarantees.
    expect(mocks.removeDiscountFromSubscription).not.toHaveBeenCalled();
    const row = upsertedRow();
    expect(row.discount_label).toBeNull();
    expect(row.discount_percent_off).toBeNull();
  });

  it("does not call the removal helper when there is no existing Stripe subscription", async () => {
    setExistingSub(null);

    const response = await POST(
      grantRequest({
        action: "grant-manual",
        venueId: "venue-3",
        paidThroughDate: futureDate(),
        amountDollars: 100,
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.removeDiscountFromSubscription).not.toHaveBeenCalled();
    expect(upsertedRow().discount_label).toBeNull();
  });
});
