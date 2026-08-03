import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Round 4 code review Phase 7: POST /api/admin/billing grant-manual must
 * validate paidThroughDate BEFORE either Stripe mutation (force-cancel,
 * discount detach) — not after. A malformed or past date must 400 with no
 * Stripe call made at all, so an admin's typo can't irreversibly detach a
 * live coupon or schedule a cancellation before the request is even valid.
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

/** A row with both a live Stripe sub and a discount, so both mutations are reachable. */
const LIVE_DISCOUNTED_SUB: ExistingSub = {
  id: "sub-1",
  stripe_subscription_id: "sub_stripe_1",
  status: "past_due",
  stripe_coupon_id: "hc-pct-25-forever",
  discount_percent_off: 25,
};

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

const pastDate = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
};

describe("POST /api/admin/billing — grant-manual validates before mutating Stripe", () => {
  beforeEach(() => {
    mocks.upsert.mockReset();
    mocks.cancelSubscription.mockReset();
    mocks.cancelSubscription.mockResolvedValue({ ok: true, mode: "stripe" });
    mocks.removeDiscountFromSubscription.mockReset();
    mocks.removeDiscountFromSubscription.mockResolvedValue({ ok: true, mode: "stripe" });
  });

  it("400s a malformed paidThroughDate without cancelling or detaching at Stripe", async () => {
    setExistingSub(LIVE_DISCOUNTED_SUB);

    const response = await POST(
      grantRequest({
        action: "grant-manual",
        venueId: "venue-1",
        paidThroughDate: "not-a-date",
        amountDollars: 100,
        force: true,
      })
    );
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(mocks.cancelSubscription).not.toHaveBeenCalled();
    expect(mocks.removeDiscountFromSubscription).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("400s a past paidThroughDate without cancelling or detaching at Stripe", async () => {
    setExistingSub(LIVE_DISCOUNTED_SUB);

    const response = await POST(
      grantRequest({
        action: "grant-manual",
        venueId: "venue-1",
        paidThroughDate: pastDate(),
        amountDollars: 100,
        force: true,
      })
    );
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(mocks.cancelSubscription).not.toHaveBeenCalled();
    expect(mocks.removeDiscountFromSubscription).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("happy path with a discounted card row still detaches, then converts", async () => {
    setExistingSub(LIVE_DISCOUNTED_SUB);

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
    expect(mocks.cancelSubscription).toHaveBeenCalled();
    expect(mocks.removeDiscountFromSubscription).toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalled();
  });
});
