import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

/**
 * Phase 8 of docs/billing-code-review-fixes-plan.md — an unfinished signup must
 * leave NO trace.
 *
 * A billing_subscriptions row is the record of a partner who PAYS us, so it may
 * only be CREATED for a subscription Stripe reports as paid-for (`active` or
 * `trialing`). A signup that is interrupted — card declined at the last step, tab
 * closed, 3-D Secure abandoned — writes nothing, so the partner's next visit gets
 * the normal "No subscription yet" screen instead of a `past_due` row with no card
 * behind it to "update".
 *
 * The gate is on CREATION ONLY. Once a row tracks a subscription, every later
 * state change is mirrored verbatim — including a renewal going `past_due`, which
 * is what makes `past_due` mean exactly one thing: an established subscriber whose
 * card failed.
 *
 * It also must not reintroduce the bug the stale-event guard is careful about
 * (tests/api.webhooks.stripe-stale-guard.test.ts): a legitimate first sync
 * arriving as customer.subscription.updated because checkout.session.completed was
 * missed or reordered is `active`, so it still creates the row.
 */

type Row = {
  stripe_subscription_id: string | null;
  welcome_email_sent_at: string | null;
} | null;

const state = vi.hoisted(() => ({ row: null as Row }));

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  retrieve: vi.fn(),
  upsert: vi.fn(),
  sendWelcomeEmail: vi.fn(),
}));

vi.mock("@/lib/stripe", async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    stripe: {
      webhooks: { constructEvent: mocks.constructEvent },
      subscriptions: { retrieve: mocks.retrieve },
    },
    getStripeWebhookSecret: () => "whsec_test",
  };
});

vi.mock("@/lib/email/sendWelcomeEmail", () => ({
  sendWelcomeEmail: (...args: unknown[]) => mocks.sendWelcomeEmail(...args),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data:
              table === "billing_subscriptions"
                ? state.row
                : table === "venues"
                  ? { name: "Test Venue" }
                  : { name: "Owner", email: "owner@example.test" },
          })),
        })),
      })),
      upsert: vi.fn(async (payload: Record<string, unknown>) => {
        mocks.upsert(payload);
        // Mirror reality: after a successful write the row exists on the next read.
        state.row = {
          stripe_subscription_id: payload.stripe_subscription_id as string,
          welcome_email_sent_at: null,
        };
        return { error: null };
      }),
      update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
    })),
  },
}));

import { POST } from "@/app/api/webhooks/stripe/route";

const makeSub = (id: string, status: string): Stripe.Subscription =>
  ({
    id,
    metadata: { venueId: "venue-1", ownerId: "owner-1" },
    customer: "cus_1",
    status,
    cancel_at_period_end: false,
    // Explicitly empty so the discount resolver never reaches back to Stripe.
    discounts: [],
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

/** A completed Checkout Session pointing at `subscriptionId`. */
const checkoutCompleted = (subscriptionId: string) => ({
  type: "checkout.session.completed",
  data: { object: { subscription: subscriptionId } },
});

const subscriptionEvent = (type: string, sub: Stripe.Subscription) => ({
  type,
  data: { object: sub },
});

describe("POST /api/webhooks/stripe — an unfinished signup leaves no trace", () => {
  beforeEach(() => {
    state.row = null;
    mocks.constructEvent.mockReset();
    mocks.retrieve.mockReset();
    mocks.upsert.mockReset();
    mocks.sendWelcomeEmail.mockReset().mockResolvedValue(true);
  });

  describe("checkout.session.completed", () => {
    it("writes no row and sends no welcome email when the payment never settled", async () => {
      const sub = makeSub("sub_unpaid", "incomplete");
      mocks.retrieve.mockResolvedValue(sub);
      mocks.constructEvent.mockReturnValue(checkoutCompleted("sub_unpaid"));

      const response = await POST(webhookRequest());

      expect(response.status).toBe(200);
      expect(mocks.upsert).not.toHaveBeenCalled();
      expect(mocks.sendWelcomeEmail).not.toHaveBeenCalled();
      expect(state.row).toBeNull();
    });

    it("writes the row and sends the welcome email once the payment succeeded", async () => {
      const sub = makeSub("sub_paid", "active");
      mocks.retrieve.mockResolvedValue(sub);
      mocks.constructEvent.mockReturnValue(checkoutCompleted("sub_paid"));

      const response = await POST(webhookRequest());

      expect(response.status).toBe(200);
      expect(mocks.upsert).toHaveBeenCalledTimes(1);
      const [payload] = mocks.upsert.mock.calls[0] as [{ status: string; stripe_subscription_id: string }];
      expect(payload.stripe_subscription_id).toBe("sub_paid");
      expect(payload.status).toBe("active");
      expect(mocks.sendWelcomeEmail).toHaveBeenCalledTimes(1);
    });

    it("does not overwrite an existing offline grant with an unpaid attempt", async () => {
      // The offline row is tokenless, so the unpaid subscription is not the one it
      // tracks — the creation gate applies and the grant survives untouched.
      state.row = { stripe_subscription_id: null, welcome_email_sent_at: null };
      mocks.retrieve.mockResolvedValue(makeSub("sub_unpaid", "incomplete"));
      mocks.constructEvent.mockReturnValue(checkoutCompleted("sub_unpaid"));

      const response = await POST(webhookRequest());

      expect(response.status).toBe(200);
      expect(mocks.upsert).not.toHaveBeenCalled();
      expect(state.row).toEqual({ stripe_subscription_id: null, welcome_email_sent_at: null });
    });
  });

  describe("customer.subscription.updated — creation", () => {
    it("writes no row for an incomplete subscription we do not already track", async () => {
      mocks.constructEvent.mockReturnValue(
        subscriptionEvent("customer.subscription.updated", makeSub("sub_unpaid", "incomplete"))
      );

      const response = await POST(webhookRequest());

      expect(response.status).toBe(200);
      expect(mocks.upsert).not.toHaveBeenCalled();
    });

    it("writes no row for an incomplete_expired subscription", async () => {
      mocks.constructEvent.mockReturnValue(
        subscriptionEvent("customer.subscription.updated", makeSub("sub_expired", "incomplete_expired"))
      );

      const response = await POST(webhookRequest());

      expect(response.status).toBe(200);
      expect(mocks.upsert).not.toHaveBeenCalled();
    });

    it("STILL creates the row for an active subscription with no row yet (missed checkout.session.completed)", async () => {
      mocks.constructEvent.mockReturnValue(
        subscriptionEvent("customer.subscription.updated", makeSub("sub_first", "active"))
      );

      const response = await POST(webhookRequest());

      expect(response.status).toBe(200);
      expect(mocks.upsert).toHaveBeenCalledTimes(1);
      const [payload] = mocks.upsert.mock.calls[0] as [{ stripe_subscription_id: string }];
      expect(payload.stripe_subscription_id).toBe("sub_first");
    });

    it("creates the row for a trialing subscription — an established agreement", async () => {
      mocks.constructEvent.mockReturnValue(
        subscriptionEvent("customer.subscription.updated", makeSub("sub_trial", "trialing"))
      );

      const response = await POST(webhookRequest());

      expect(response.status).toBe(200);
      expect(mocks.upsert).toHaveBeenCalledTimes(1);
      const [payload] = mocks.upsert.mock.calls[0] as [{ status: string }];
      expect(payload.status).toBe("active");
    });
  });

  describe("customer.subscription.updated — updates are never gated", () => {
    it("mirrors a renewal going past_due on an established row", async () => {
      state.row = { stripe_subscription_id: "sub_established", welcome_email_sent_at: "2026-01-01T00:00:00Z" };
      mocks.constructEvent.mockReturnValue(
        subscriptionEvent("customer.subscription.updated", makeSub("sub_established", "past_due"))
      );

      const response = await POST(webhookRequest());

      expect(response.status).toBe(200);
      expect(mocks.upsert).toHaveBeenCalledTimes(1);
      const [payload] = mocks.upsert.mock.calls[0] as [{ status: string }];
      expect(payload.status).toBe("past_due");
    });

    it("mirrors a deletion on an established row", async () => {
      state.row = { stripe_subscription_id: "sub_established", welcome_email_sent_at: "2026-01-01T00:00:00Z" };
      mocks.constructEvent.mockReturnValue(
        subscriptionEvent("customer.subscription.deleted", makeSub("sub_established", "canceled"))
      );

      const response = await POST(webhookRequest());

      expect(response.status).toBe(200);
      expect(mocks.upsert).toHaveBeenCalledTimes(1);
      const [payload] = mocks.upsert.mock.calls[0] as [{ status: string }];
      expect(payload.status).toBe("cancelled");
    });

    it("invents no row from a deletion for a subscription we never tracked", async () => {
      mocks.constructEvent.mockReturnValue(
        subscriptionEvent("customer.subscription.deleted", makeSub("sub_never_ours", "canceled"))
      );

      const response = await POST(webhookRequest());

      expect(response.status).toBe(200);
      expect(mocks.upsert).not.toHaveBeenCalled();
    });
  });
});
