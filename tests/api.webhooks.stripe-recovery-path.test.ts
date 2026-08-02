import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

/**
 * Round-2 review finding 2 (docs/billing-review-round2-plan.md Phase 2) — the
 * recovery path must not lose the welcome email or the first invoice.
 *
 * Phase 8's creation gate is right: an unpaid attempt writes nothing. But the
 * recovery path it deliberately preserves was one-sided. When a signup needs a
 * second step (3-D Secure, or any card that settles after the session closes):
 *
 *   1. checkout.session.completed arrives while the subscription is `incomplete`
 *      → correctly no row, and correctly no welcome email.
 *   2. invoice.paid may arrive next → recordInvoice resolves rows BY
 *      stripe_subscription_id, finds none, and returns. Stripe never replays it.
 *   3. customer.subscription.updated arrives `active` → the row is created (the
 *      intended recovery), but the welcome email was wired to the checkout event
 *      alone, so it never fired.
 *
 * Net result for a partner who completed 3-D Secure: a correct `active` row, no
 * welcome email ever, and a payment history permanently missing its first charge.
 * Both silent. Both fixed by hanging the followers off the WRITE rather than the
 * event type.
 */

type Row = {
  stripe_subscription_id: string | null;
  welcome_email_sent_at: string | null;
  amount_cents: number;
  venue_id: string;
  id: string;
} | null;

const state = vi.hoisted(() => ({ row: null as Row }));

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  subRetrieve: vi.fn(),
  invoicesList: vi.fn(),
  subsUpsert: vi.fn(),
  invoiceUpsert: vi.fn(),
  sendWelcomeEmail: vi.fn(),
}));

vi.mock("@/lib/stripe", async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    stripe: {
      webhooks: { constructEvent: mocks.constructEvent },
      subscriptions: { retrieve: mocks.subRetrieve },
      invoices: { list: mocks.invoicesList },
    },
    getStripeWebhookSecret: () => "whsec_test",
  };
});

vi.mock("@/lib/email/sendWelcomeEmail", () => ({
  sendWelcomeEmail: (...args: unknown[]) => mocks.sendWelcomeEmail(...args),
}));

vi.mock("@/lib/supabaseAdmin", () => {
  /**
   * A select chain that honours its .eq() filter, because both halves of this
   * fix turn on WHICH lookup finds the row: maybeSendWelcomeEmail resolves by
   * venue_id, recordInvoice by stripe_subscription_id. A mock that returns the
   * row unconditionally would make the invoice test pass before the fix.
   */
  const selectChain = (table: string) => {
    let column: string | null = null;
    let value: string | null = null;
    const chain = {
      select: () => chain,
      eq: (col: string, val: string) => {
        column = col;
        value = val;
        return chain;
      },
      maybeSingle: async () => {
        if (table === "venues") return { data: { name: "Test Venue" } };
        if (table === "venue_owners") return { data: { name: "Owner", email: "owner@example.test" } };
        const row = state.row;
        if (!row) return { data: null };
        if (column === "stripe_subscription_id" && row.stripe_subscription_id !== value) {
          return { data: null };
        }
        if (column === "venue_id" && row.venue_id !== value) return { data: null };
        return { data: row };
      },
    };
    return chain;
  };

  return {
    supabaseAdmin: {
      from: vi.fn((table: string) => ({
        select: () => selectChain(table),
        upsert: vi.fn(async (payload: Record<string, unknown>) => {
          if (table === "billing_invoices") {
            mocks.invoiceUpsert(payload);
            return { error: null };
          }
          mocks.subsUpsert(payload);
          // Mirror reality: after a successful write the row exists on the next read.
          state.row = {
            id: "row-1",
            venue_id: payload.venue_id as string,
            stripe_subscription_id: payload.stripe_subscription_id as string,
            welcome_email_sent_at: (payload.welcome_email_sent_at as string | null) ?? null,
            amount_cents: payload.amount_cents as number,
          };
          return { error: null };
        }),
        update: vi.fn((payload: Record<string, unknown>) => ({
          eq: vi.fn(async () => {
            if (table === "billing_subscriptions" && state.row && "welcome_email_sent_at" in payload) {
              state.row.welcome_email_sent_at = payload.welcome_email_sent_at as string;
            }
            return { error: null };
          }),
        })),
      })),
    },
  };
});

import { POST } from "@/app/api/webhooks/stripe/route";

const makeSub = (id: string, status: string): Stripe.Subscription =>
  ({
    id,
    metadata: { venueId: "venue-1", ownerId: "owner-1" },
    customer: "cus_1",
    status,
    cancel_at_period_end: false,
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

const paidInvoice = (id: string, subscriptionId: string) =>
  ({
    id,
    status: "paid",
    amount_paid: 10000,
    amount_due: 10000,
    description: "Subscription",
    created: 1_700_000_000,
    status_transitions: { paid_at: 1_700_000_100 },
    parent: { subscription_details: { subscription: subscriptionId } },
  }) as unknown as Stripe.Invoice;

const post = () =>
  POST(
    new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "sig_test" },
      body: "{}",
    })
  );

const checkoutCompleted = (subscriptionId: string) => ({
  type: "checkout.session.completed",
  data: { object: { subscription: subscriptionId } },
});

const subscriptionEvent = (type: string, sub: Stripe.Subscription) => ({ type, data: { object: sub } });

const invoiceEvent = (invoice: Stripe.Invoice) => ({ type: "invoice.paid", data: { object: invoice } });

describe("POST /api/webhooks/stripe — the 3-D Secure recovery path", () => {
  beforeEach(() => {
    state.row = null;
    mocks.constructEvent.mockReset();
    mocks.subRetrieve.mockReset();
    mocks.subsUpsert.mockReset();
    mocks.invoiceUpsert.mockReset();
    mocks.sendWelcomeEmail.mockReset().mockResolvedValue(true);
    mocks.invoicesList.mockReset().mockResolvedValue({ data: [] });
  });

  it("sends the welcome email exactly once when the row is born on customer.subscription.updated", async () => {
    // Step 1: the session completes while the payment is still authenticating.
    mocks.subRetrieve.mockResolvedValue(makeSub("sub_3ds", "incomplete"));
    mocks.constructEvent.mockReturnValue(checkoutCompleted("sub_3ds"));
    expect((await post()).status).toBe(200);
    expect(mocks.subsUpsert).not.toHaveBeenCalled();
    expect(mocks.sendWelcomeEmail).not.toHaveBeenCalled();

    // Step 2: authentication succeeds and Stripe reports the subscription active.
    mocks.constructEvent.mockReturnValue(
      subscriptionEvent("customer.subscription.updated", makeSub("sub_3ds", "active"))
    );
    expect((await post()).status).toBe(200);

    expect(mocks.subsUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.sendWelcomeEmail).toHaveBeenCalledTimes(1);
  });

  it("does not re-send the welcome email on a following customer.subscription.updated", async () => {
    mocks.subRetrieve.mockResolvedValue(makeSub("sub_ok", "active"));
    mocks.constructEvent.mockReturnValue(checkoutCompleted("sub_ok"));
    await post();
    expect(mocks.sendWelcomeEmail).toHaveBeenCalledTimes(1);

    // Same subscription, already tracked — not a first sync, so no follower runs.
    mocks.constructEvent.mockReturnValue(
      subscriptionEvent("customer.subscription.updated", makeSub("sub_ok", "active"))
    );
    await post();

    expect(mocks.sendWelcomeEmail).toHaveBeenCalledTimes(1);
  });

  it("does not welcome anyone on customer.subscription.deleted", async () => {
    state.row = {
      id: "row-1",
      venue_id: "venue-1",
      stripe_subscription_id: "sub_gone",
      // Already null, as the delete branch itself sets it — so only the
      // event-type guard stands between a cancellation and a welcome email.
      welcome_email_sent_at: null,
      amount_cents: 10000,
    };
    mocks.constructEvent.mockReturnValue(
      subscriptionEvent("customer.subscription.deleted", makeSub("sub_gone", "canceled"))
    );

    expect((await post()).status).toBe(200);
    expect(mocks.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it("recovers an invoice.paid that arrived before the row existed", async () => {
    // Step 1: the invoice lands first. No row tracks this subscription yet, so
    // it is dropped — and Stripe never replays it.
    mocks.constructEvent.mockReturnValue(invoiceEvent(paidInvoice("in_first", "sub_3ds")));
    expect((await post()).status).toBe(200);
    expect(mocks.invoiceUpsert).not.toHaveBeenCalled();

    // Step 2: the row is created. The backfill reads the subscription's invoices
    // back from Stripe, so the first charge is not lost.
    mocks.invoicesList.mockResolvedValue({ data: [paidInvoice("in_first", "sub_3ds")] });
    mocks.constructEvent.mockReturnValue(
      subscriptionEvent("customer.subscription.updated", makeSub("sub_3ds", "active"))
    );
    expect((await post()).status).toBe(200);

    expect(mocks.invoicesList).toHaveBeenCalledWith(
      expect.objectContaining({ subscription: "sub_3ds" })
    );
    expect(mocks.invoiceUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.invoiceUpsert.mock.calls[0][0]).toMatchObject({
      stripe_invoice_id: "in_first",
      status: "paid",
      amount_cents: 10000,
      venue_id: "venue-1",
    });
  });

  it("backfills only settled invoices, and is bounded", async () => {
    mocks.invoicesList.mockResolvedValue({
      data: [
        paidInvoice("in_paid", "sub_new"),
        { ...paidInvoice("in_open", "sub_new"), status: "open" } as unknown as Stripe.Invoice,
      ],
    });
    mocks.subRetrieve.mockResolvedValue(makeSub("sub_new", "active"));
    mocks.constructEvent.mockReturnValue(checkoutCompleted("sub_new"));

    await post();

    expect(mocks.invoiceUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.invoiceUpsert.mock.calls[0][0]).toMatchObject({ stripe_invoice_id: "in_paid" });
    expect(mocks.invoicesList.mock.calls[0][0]).toMatchObject({ limit: 10 });
  });

  it("still 200s and writes nothing for an invoice.paid we track nothing about", async () => {
    // Deliberately not a retry storm: recordInvoice must not 500 here, or a
    // genuinely-unmatchable invoice would retry for three days.
    state.row = {
      id: "row-1",
      venue_id: "venue-1",
      stripe_subscription_id: "sub_ours",
      welcome_email_sent_at: "2026-01-01T00:00:00Z",
      amount_cents: 10000,
    };
    mocks.constructEvent.mockReturnValue(invoiceEvent(paidInvoice("in_stranger", "sub_someone_else")));

    expect((await post()).status).toBe(200);
    expect(mocks.invoiceUpsert).not.toHaveBeenCalled();
  });

  it("does not fail the webhook when Stripe is unreachable for the backfill", async () => {
    // The billing row was just written correctly; a failed best-effort read must
    // not 500 and make Stripe retry the whole event.
    mocks.invoicesList.mockRejectedValue(new Error("stripe down"));
    mocks.subRetrieve.mockResolvedValue(makeSub("sub_new", "active"));
    mocks.constructEvent.mockReturnValue(checkoutCompleted("sub_new"));

    expect((await post()).status).toBe(200);
    expect(mocks.subsUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.sendWelcomeEmail).toHaveBeenCalledTimes(1);
  });

  it("welcomes a resubscriber, whose row already exists", async () => {
    // The delete branch clears welcome_email_sent_at on purpose so a fresh
    // subscription is treated as first-time activation again. Gating the email on
    // "the row was CREATED" rather than "first sync for this subscription" would
    // have silently broken this.
    state.row = {
      id: "row-1",
      venue_id: "venue-1",
      stripe_subscription_id: "sub_old",
      welcome_email_sent_at: null,
      amount_cents: 10000,
    };
    mocks.subRetrieve.mockResolvedValue(makeSub("sub_new", "active"));
    mocks.constructEvent.mockReturnValue(checkoutCompleted("sub_new"));

    await post();

    expect(mocks.sendWelcomeEmail).toHaveBeenCalledTimes(1);
  });
});
