import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

/**
 * Phase 4 of the offline-billing review fixes: the Stripe webhook must not let a
 * stale customer.subscription.updated/.deleted event clobber a newer state.
 * Stripe retries for ~3 days, so a late event for an old, already-replaced
 * subscription can arrive after the venue was re-granted offline access (token
 * nulled) or moved to a new card subscription (different id). upsertSubscription
 * only applies such events when sub.id matches the venue's CURRENT
 * stripe_subscription_id; otherwise it skips and the route returns 200.
 */

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  upsert: vi.fn(),
  existingRow: null as { stripe_subscription_id: string | null } | null,
}));

vi.mock("@/lib/stripe", async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    stripe: {
      webhooks: { constructEvent: mocks.constructEvent },
      subscriptions: { retrieve: vi.fn() },
    },
    getStripeWebhookSecret: () => "whsec_test",
  };
});

vi.mock("@/lib/email/sendWelcomeEmail", () => ({
  sendWelcomeEmail: vi.fn(async () => true),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: mocks.existingRow })),
        })),
      })),
      upsert: vi.fn((...args: unknown[]) => {
        mocks.upsert(...args);
        return Promise.resolve({ error: null });
      }),
    })),
  },
}));

import { POST } from "@/app/api/webhooks/stripe/route";

const makeSub = (id: string): Stripe.Subscription =>
  ({
    id,
    metadata: { venueId: "venue-1", ownerId: "owner-1" },
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: false,
    items: {
      data: [
        {
          price: { id: "price_1", nickname: "monthly", unit_amount: 10000 },
          current_period_start: 1_700_000_000,
          current_period_end: 1_702_600_000,
        },
      ],
    },
  }) as unknown as Stripe.Subscription;

const webhookRequest = () =>
  new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "sig_test" },
    body: "{}",
  });

describe("POST /api/webhooks/stripe — stale-event guard", () => {
  beforeEach(() => {
    mocks.constructEvent.mockReset();
    mocks.upsert.mockReset();
    mocks.existingRow = null;
  });

  it("ignores a subscription.deleted for an id that no longer matches an offline row", async () => {
    // The venue was re-granted offline access: stripe_subscription_id is null.
    mocks.existingRow = { stripe_subscription_id: null };
    mocks.constructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: makeSub("sub_old") },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("ignores a subscription.updated whose id differs from the current subscription", async () => {
    // The venue moved to a new card subscription; the old one still emits events.
    mocks.existingRow = { stripe_subscription_id: "sub_new" };
    mocks.constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: makeSub("sub_old") },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("applies a subscription.updated whose id matches the current subscription", async () => {
    mocks.existingRow = { stripe_subscription_id: "sub_current" };
    mocks.constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: makeSub("sub_current") },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    const [payload] = mocks.upsert.mock.calls[0] as [{ venue_id: string; stripe_subscription_id: string }];
    expect(payload.venue_id).toBe("venue-1");
    expect(payload.stripe_subscription_id).toBe("sub_current");
  });

  it("applies a subscription.updated when no billing_subscriptions row exists yet (first sync, not stale)", async () => {
    // checkout.session.completed hasn't landed yet (or was missed) — there is no
    // row to compare against. Absence must not be treated as "stale"; the event
    // carries full venueId/ownerId metadata and should still create the row.
    mocks.existingRow = null;
    mocks.constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: makeSub("sub_first") },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    const [payload] = mocks.upsert.mock.calls[0] as [{ venue_id: string; stripe_subscription_id: string }];
    expect(payload.venue_id).toBe("venue-1");
    expect(payload.stripe_subscription_id).toBe("sub_first");
  });
});
