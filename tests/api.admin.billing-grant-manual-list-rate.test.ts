import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 1 of docs/billing-code-review-fixes-plan.md — grant-manual writes TWO
 * different numbers and must not conflate them:
 *
 *   billing_subscriptions.amount_cents → the venue's LIST rate, before any
 *     discount. Every reader (notably the owner page's effectiveAmountCents)
 *     subtracts the discount mirror from it. Writing an already-discounted
 *     number here makes the partner's page discount it a second time.
 *   billing_invoices.amount_cents → what the check was actually for. The
 *     partner sees this in their payment history, so it must be the real
 *     collected amount, not the list rate.
 */

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  invoiceInsert: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({
  requireAdminAuth: vi.fn(async () => ({ ok: true, authUserId: "admin-1", adminUsername: "admin" })),
}));

vi.mock("@/lib/billing", () => ({
  cancelSubscription: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === "billing_subscriptions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: null })),
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
        return {
          insert: vi.fn((...args: unknown[]) => {
            mocks.invoiceInsert(...args);
            return Promise.resolve({ error: null });
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  },
}));

import { POST } from "@/app/api/admin/billing/route";

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

const upsertedRow = () => (mocks.upsert.mock.calls[0][0] as { amount_cents: number });
const insertedInvoice = () => (mocks.invoiceInsert.mock.calls[0][0] as { amount_cents: number });

describe("POST /api/admin/billing — grant-manual list rate vs. amount received", () => {
  beforeEach(() => {
    mocks.upsert.mockReset();
    mocks.invoiceInsert.mockReset();
  });

  it("stores the list rate on the subscription and the collected amount on the invoice", async () => {
    const response = await POST(
      grantRequest({
        action: "grant-manual",
        venueId: "venue-1",
        paidThroughDate: futureDate(),
        amountDollars: 100, // list rate
        amountReceivedDollars: 75, // what the check was for, after a 25% deal
        memo: "Check #1234",
      })
    );

    expect(response.status).toBe(200);
    expect(upsertedRow().amount_cents).toBe(10000);
    expect(insertedInvoice().amount_cents).toBe(7500);
  });

  it("defaults the invoice to the list rate when no separate amount is sent", async () => {
    const response = await POST(
      grantRequest({
        action: "grant-manual",
        venueId: "venue-2",
        paidThroughDate: futureDate(),
        amountDollars: 100,
      })
    );

    expect(response.status).toBe(200);
    expect(upsertedRow().amount_cents).toBe(10000);
    expect(insertedInvoice().amount_cents).toBe(10000);
  });

  /**
   * The bug this phase fixes: the discounted number must never reach
   * amount_cents, because the owner page will discount it again.
   */
  it("never folds the discount into the subscription rate", async () => {
    await POST(
      grantRequest({
        action: "grant-manual",
        venueId: "venue-3",
        paidThroughDate: futureDate(),
        amountDollars: 100,
        amountReceivedDollars: 75,
      })
    );

    expect(upsertedRow().amount_cents).not.toBe(7500);
  });

  it("clamps a negative received amount to zero rather than crediting the partner", async () => {
    await POST(
      grantRequest({
        action: "grant-manual",
        venueId: "venue-4",
        paidThroughDate: futureDate(),
        amountDollars: 100,
        amountReceivedDollars: -50,
      })
    );

    expect(insertedInvoice().amount_cents).toBe(0);
  });

  it("handles a fully comped grant (rate on record, nothing collected)", async () => {
    await POST(
      grantRequest({
        action: "grant-manual",
        venueId: "venue-5",
        paidThroughDate: futureDate(),
        amountDollars: 100,
        amountReceivedDollars: 0,
      })
    );

    expect(upsertedRow().amount_cents).toBe(10000);
    expect(insertedInvoice().amount_cents).toBe(0);
  });
});
