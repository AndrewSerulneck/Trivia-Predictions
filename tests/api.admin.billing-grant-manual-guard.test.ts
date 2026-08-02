import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 3 of the offline-billing review fixes: POST /api/admin/billing
 * grant-manual must refuse to convert a venue with a live Stripe subscription
 * (status active or past_due) to offline billing — that would null out
 * stripe_subscription_id/customer_id/price_id and orphan a subscription that's
 * still in dunning, which Stripe would keep collecting on and the app could no
 * longer cancel or reconcile. The client only disables the button for an
 * *active* card, so a past_due card sub can still reach this endpoint — the
 * server guard is the real fix.
 */

type RemoveDiscountResult =
  | { ok: true; mode: "stripe" | "local" }
  | { ok: false; status: number; error: string };

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  cancelSubscription: vi.fn(),
  removeDiscountFromSubscription: vi.fn<() => Promise<RemoveDiscountResult>>(async () => ({
    ok: true,
    mode: "stripe",
  })),
}));

vi.mock("@/lib/adminAuth", () => ({
  requireAdminAuth: vi.fn(async () => ({ ok: true, authUserId: "admin-1", adminUsername: "admin" })),
}));

vi.mock("@/lib/billing", () => ({
  cancelSubscription: mocks.cancelSubscription,
}));

vi.mock("@/lib/billingDiscounts", async (importOriginal) => ({
  // Keep the real pure predicates (hasDiscountMirror, removalIsMootAtStripe);
  // only the Stripe-touching removal helper is stubbed.
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
  billing_method?: string;
  stripe_subscription_id: string | null;
  status: string;
  amount_cents?: number;
  current_period_end?: string | null;
  stripe_coupon_id?: string | null;
  discount_label?: string | null;
  discount_percent_off?: number | null;
  discount_amount_off_cents?: number | null;
  discount_ends_at?: string | null;
};

/** The route only attempts a detach for a row that actually records a discount. */
const A_DISCOUNT = { stripe_coupon_id: "hc-pct-25-forever", discount_percent_off: 25 } as const;

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
      // Test hook to seed the "existing subscription" the route will read.
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

describe("POST /api/admin/billing — grant-manual Stripe-orphan guard", () => {
  beforeEach(() => {
    mocks.upsert.mockReset();
    mocks.cancelSubscription.mockReset();
    mocks.removeDiscountFromSubscription.mockReset();
    mocks.removeDiscountFromSubscription.mockResolvedValue({ ok: true, mode: "stripe" });
  });

  it("refuses with 409 for a past_due Stripe row, without mutating the DB", async () => {
    setExistingSub({ id: "sub-1", stripe_subscription_id: "sub_stripe_1", status: "past_due" });

    const response = await POST(
      grantRequest({
        action: "grant-manual",
        venueId: "venue-1",
        paidThroughDate: futureDate(),
        amountDollars: 100,
      })
    );
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/live Stripe subscription/i);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.cancelSubscription).not.toHaveBeenCalled();
  });

  it("refuses with 409 for an active Stripe row", async () => {
    setExistingSub({ id: "sub-2", stripe_subscription_id: "sub_stripe_2", status: "active" });

    const response = await POST(
      grantRequest({
        action: "grant-manual",
        venueId: "venue-2",
        paidThroughDate: futureDate(),
        amountDollars: 100,
      })
    );

    expect(response.status).toBe(409);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("allows grant-manual for a venue with no existing Stripe subscription", async () => {
    setExistingSub(null);

    const response = await POST(
      grantRequest({
        action: "grant-manual",
        venueId: "venue-3",
        paidThroughDate: futureDate(),
        amountDollars: 100,
      })
    );
    const body = (await response.json()) as { ok: boolean };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.upsert).toHaveBeenCalled();
  });

  it("with force:true, cancels the Stripe subscription then converts to offline", async () => {
    setExistingSub({ id: "sub-4", stripe_subscription_id: "sub_stripe_4", status: "past_due", ...A_DISCOUNT });
    mocks.cancelSubscription.mockResolvedValue({ ok: true, mode: "stripe" });

    const response = await POST(
      grantRequest({
        action: "grant-manual",
        venueId: "venue-4",
        paidThroughDate: futureDate(),
        amountDollars: 100,
        force: true,
      })
    );
    const body = (await response.json()) as { ok: boolean };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.cancelSubscription).toHaveBeenCalledWith({
      id: "sub-4",
      stripe_subscription_id: "sub_stripe_4",
      status: "past_due",
      ...A_DISCOUNT,
    });
    expect(mocks.removeDiscountFromSubscription).toHaveBeenCalledWith({
      id: "sub-4",
      stripe_subscription_id: "sub_stripe_4",
      status: "past_due",
      ...A_DISCOUNT,
    });
    expect(mocks.upsert).toHaveBeenCalled();
  });

  it("refuses with 502 if detaching the Stripe coupon fails, without mutating the DB", async () => {
    setExistingSub({ id: "sub-5", stripe_subscription_id: "sub_stripe_5", status: "past_due", ...A_DISCOUNT });
    mocks.cancelSubscription.mockResolvedValue({ ok: true, mode: "stripe" });
    mocks.removeDiscountFromSubscription.mockResolvedValue({
      ok: false,
      status: 502,
      error: "Failed to remove discount.",
    });

    const response = await POST(
      grantRequest({
        action: "grant-manual",
        venueId: "venue-5",
        paidThroughDate: futureDate(),
        amountDollars: 100,
        force: true,
      })
    );
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(502);
    expect(body.ok).toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
