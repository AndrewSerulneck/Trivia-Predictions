import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

/**
 * Regression for a defect found during the billing-open-issues Phase 10 live
 * verification (docs/billing-run-log.md): under API version 2026-06-24,
 * `invoice.subscription` is undefined — the id moved to
 * `invoice.parent.subscription_details.subscription`. recordInvoice silently
 * dropped every invoice.paid/invoice.payment_failed event as a result, so
 * billing_invoices was never written for any Stripe-billed partner.
 */

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  upsert: vi.fn(),
  subscriptionRow: null as { id: string; venue_id: string } | null,
}));

vi.mock("@/lib/stripe", async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    stripe: { webhooks: { constructEvent: mocks.constructEvent } },
    getStripeWebhookSecret: () => "whsec_test",
  };
});

vi.mock("@/lib/email/sendWelcomeEmail", () => ({
  sendWelcomeEmail: vi.fn(async () => true),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === "billing_subscriptions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: mocks.subscriptionRow })),
            })),
          })),
        };
      }
      return {
        upsert: vi.fn((payload: unknown) => {
          mocks.upsert(payload);
          return Promise.resolve({ error: null });
        }),
      };
    }),
  },
}));

import { POST } from "@/app/api/webhooks/stripe/route";

const webhookRequest = () =>
  new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "sig_test" },
    body: "{}",
  });

const baseInvoice = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "in_1",
    amount_paid: 10000,
    amount_due: 0,
    description: null,
    status_transitions: { paid_at: 1_700_000_000 },
    created: 1_699_999_000,
    ...overrides,
  }) as unknown as Stripe.Invoice;

describe("POST /api/webhooks/stripe — invoiceSubscriptionId field-shape", () => {
  beforeEach(() => {
    mocks.constructEvent.mockReset();
    mocks.upsert.mockReset();
    mocks.subscriptionRow = { id: "row-1", venue_id: "venue-1" };
  });

  it("resolves the subscription id from the current (2026-06-24+) nested shape", async () => {
    mocks.constructEvent.mockReturnValue({
      type: "invoice.paid",
      data: {
        object: baseInvoice({
          parent: { subscription_details: { subscription: "sub_current" } },
        }),
      },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ subscription_id: "row-1", venue_id: "venue-1" }),
    );
  });

  it("falls back to the legacy invoice.subscription field on older API versions", async () => {
    mocks.constructEvent.mockReturnValue({
      type: "invoice.paid",
      data: { object: baseInvoice({ subscription: "sub_legacy" }) },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ subscription_id: "row-1", venue_id: "venue-1" }),
    );
  });

  it("writes nothing when neither shape carries a subscription id", async () => {
    mocks.constructEvent.mockReturnValue({
      type: "invoice.paid",
      data: { object: baseInvoice() },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
