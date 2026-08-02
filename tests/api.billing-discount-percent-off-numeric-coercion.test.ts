import { describe, expect, it, vi } from "vitest";

/**
 * Phase 3 of docs/billing-code-review-fixes-plan.md — discount_percent_off
 * widened from integer to numeric(5,2). supabase-js can return a numeric
 * column as a string; both read sites (owner + admin listings) must coerce it
 * to a real number before it reaches lib/billingDisplay.ts's arithmetic or the
 * admin UI, rather than passing "12.50" through untouched.
 */

vi.mock("@/lib/requireOwnerAuth", () => ({
  requireOwnerAuth: vi.fn(async () => ({ venueIds: ["venue-1"] })),
}));

vi.mock("@/lib/adminAuth", () => ({
  requireAdminAuth: vi.fn(async () => ({ ok: true, authUserId: "admin-1", adminUsername: "admin" })),
}));

vi.mock("@/lib/billing", () => ({
  cancelSubscription: vi.fn(),
}));

const ownerSub = {
  id: "sub-1",
  venue_id: "venue-1",
  plan_type: "subscription",
  billing_method: "stripe",
  amount_cents: 10000,
  status: "active",
  current_period_start: null,
  current_period_end: null,
  cancel_at_period_end: false,
  created_at: "2026-01-01T00:00:00.000Z",
  discount_label: "12.5% off forever",
  // Simulates supabase-js returning a numeric(5,2) column as a string.
  discount_percent_off: "12.50",
  discount_amount_off_cents: null,
  discount_ends_at: null,
};

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === "billing_subscriptions") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({ returns: vi.fn(() => Promise.resolve({ data: [ownerSub], error: null })) })),
            eq: vi.fn(() => ({
              limit: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: null })) })),
            })),
          })),
        };
      }
      if (table === "billing_invoices") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({ returns: vi.fn(() => Promise.resolve({ data: [], error: null })) })),
              })),
            })),
          })),
        };
      }
      if (table === "venue_owner_venues") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: [] })),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  },
}));

describe("GET /api/owner/billing — discount_percent_off numeric coercion", () => {
  it("coerces a stringly-typed numeric(5,2) value to a real number", async () => {
    const { GET } = await import("@/app/api/owner/billing/route");
    const response = await GET(new Request("http://localhost/api/owner/billing"));
    const body = (await response.json()) as {
      ok: boolean;
      subscriptions: Array<{ discount: { percentOff: number } | null }>;
    };

    expect(response.status).toBe(200);
    expect(body.subscriptions[0].discount?.percentOff).toBe(12.5);
    expect(typeof body.subscriptions[0].discount?.percentOff).toBe("number");
  });
});
