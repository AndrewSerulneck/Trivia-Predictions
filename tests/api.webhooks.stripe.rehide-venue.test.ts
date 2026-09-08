import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

/**
 * Lapsed Venue Re-Hide — docs/lapsed-venue-rehide-plan.md Phase 2, sequenced as
 * Phase 9 of docs/self-serve-signup-review-fixes-plan.md.
 *
 * When a self-serve partner stops paying, `maybeRehideVenue` takes their venue
 * back out of the player join list. It is the exact mirror of `maybeRevealVenue`
 * — same guards, same idempotence contract, same never-throws contract — and it
 * hangs off the upsert RESULT rather than the raw event, so it inherits the
 * stale-subscription-id guard for free.
 *
 * What this file pins, in rough order of what would hurt most if it broke:
 *
 *   - **The three "no action" decisions**, which are the entire product
 *     judgment and are all just Stripe's own semantics left alone: a scheduled
 *     cancellation waits for period end, a declined card (`past_due`) is a retry
 *     and not a departure, and a retry that succeeds changes nothing.
 *   - The `self_serve_created_at` and (0, 0) guards, without which this hides
 *     admin-managed venues and stamps `rehidden_at` on a Category Blitz global
 *     room — which `shouldRestoreVenue` would then happily publish to players.
 *   - `rehidden_at` written in the same statement as `hidden`. Hiding without
 *     stamping makes the hide permanent; the stamp is the only thing separating
 *     "we hid this because they lapsed" from "an admin hid this on purpose".
 *   - VENUE_REHIDE_ENABLED off (the default) = fully inert.
 *   - A failure never fails the webhook.
 */

type Row = {
  stripe_subscription_id: string | null;
  welcome_email_sent_at: string | null;
} | null;

type UpdateCall = {
  table: string;
  payload: Record<string, unknown>;
  filters: Array<{ op: string; args: unknown[] }>;
};

const state = vi.hoisted(() => ({
  row: null as Row,
  /** Rows the venues UPDATE ... .select() reports as changed. */
  changedRows: [] as Array<{ id: string }>,
  venueUpdateError: null as { message: string } | null,
  venueUpdateThrows: false,
}));

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  retrieve: vi.fn(),
  upsert: vi.fn(),
  sendWelcomeEmail: vi.fn(),
  invoicesList: vi.fn(),
  update: vi.fn<(call: UpdateCall) => void>(),
}));

vi.mock("@/lib/stripe", async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    stripe: {
      webhooks: { constructEvent: mocks.constructEvent },
      subscriptions: { retrieve: mocks.retrieve },
      invoices: { list: mocks.invoicesList },
    },
    getStripeWebhookSecret: () => "whsec_test",
  };
});

vi.mock("@/lib/email/sendWelcomeEmail", () => ({
  sendWelcomeEmail: (...args: unknown[]) => mocks.sendWelcomeEmail(...args),
}));

/**
 * The venues UPDATE is a filter chain awaited on `.returns()`, so the builder
 * records every filter and stays thenable. Recording the FILTERS (not just the
 * payload) is the point: the provenance and placeholder guards are filters, and
 * a test that only checked `{ hidden: true }` would pass with both deleted.
 */
const makeUpdateBuilder = (table: string, payload: Record<string, unknown>) => {
  const call: UpdateCall = { table, payload, filters: [] };
  const settle = async () => {
    if (table !== "venues") return { data: [], error: null };
    if (state.venueUpdateThrows) throw new Error("connection reset");
    mocks.update(call);
    if (state.venueUpdateError) return { data: null, error: state.venueUpdateError };
    return { data: state.changedRows, error: null };
  };
  const builder: Record<string, unknown> = {};
  for (const op of ["eq", "not", "select", "in", "lt", "gte", "or"]) {
    builder[op] = (...args: unknown[]) => {
      call.filters.push({ op, args });
      return builder;
    };
  }
  builder.returns = () => settle();
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    settle().then(resolve, reject);
  return builder;
};

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
                  ? { name: "The Corner Tap" }
                  : { name: "Owner", email: "owner@example.test" },
          })),
        })),
      })),
      upsert: vi.fn(async (payload: Record<string, unknown>) => {
        mocks.upsert(payload);
        state.row = {
          stripe_subscription_id: payload.stripe_subscription_id as string,
          welcome_email_sent_at: null,
        };
        return { error: null };
      }),
      update: vi.fn((payload: Record<string, unknown>) => makeUpdateBuilder(table, payload)),
    })),
  },
}));

import { POST } from "@/app/api/webhooks/stripe/route";

const makeSub = (
  id: string,
  status: string,
  overrides: Partial<{ metadata: Record<string, string>; cancel_at_period_end: boolean }> = {}
): Stripe.Subscription =>
  ({
    id,
    metadata: overrides.metadata ?? { venueId: "the-corner-tap", ownerId: "owner-1" },
    customer: "cus_1",
    status,
    cancel_at_period_end: overrides.cancel_at_period_end ?? false,
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

const subscriptionUpdated = (sub: Stripe.Subscription) => ({
  type: "customer.subscription.updated",
  data: { object: sub },
});

const subscriptionDeleted = (sub: Stripe.Subscription) => ({
  type: "customer.subscription.deleted",
  data: { object: sub },
});

const checkoutCompleted = (subscriptionId: string) => ({
  type: "checkout.session.completed",
  data: { object: { subscription: subscriptionId } },
});

const venueUpdates = () => mocks.update.mock.calls.map(([call]) => call).filter((c) => c.table === "venues");

/** The venue already tracks this subscription, so nothing is a first sync. */
const alreadyTracking = (subscriptionId: string) => {
  state.row = { stripe_subscription_id: subscriptionId, welcome_email_sent_at: "2026-09-01T00:00:00Z" };
};

describe("POST /api/webhooks/stripe — re-hiding a lapsed self-serve venue", () => {
  beforeEach(() => {
    state.row = null;
    state.changedRows = [{ id: "the-corner-tap" }];
    state.venueUpdateError = null;
    state.venueUpdateThrows = false;
    mocks.constructEvent.mockReset();
    mocks.retrieve.mockReset();
    mocks.upsert.mockReset();
    mocks.update.mockReset();
    mocks.sendWelcomeEmail.mockReset().mockResolvedValue(true);
    mocks.invoicesList.mockReset().mockResolvedValue({ data: [] });
    process.env.VENUE_REHIDE_ENABLED = "1";
  });

  afterEach(() => {
    delete process.env.VENUE_REHIDE_ENABLED;
  });

  describe("the flag", () => {
    it("does nothing at all when VENUE_REHIDE_ENABLED is unset — off is fully inert", async () => {
      delete process.env.VENUE_REHIDE_ENABLED;
      alreadyTracking("sub_paid");
      mocks.constructEvent.mockReturnValue(subscriptionDeleted(makeSub("sub_paid", "canceled")));

      const response = await POST(webhookRequest());

      expect(response.status).toBe(200);
      expect(venueUpdates()).toHaveLength(0);
      // The billing mirror is still synced — the flag gates the venue's
      // visibility, never the money.
      expect(mocks.upsert).toHaveBeenCalledTimes(1);
      expect(mocks.upsert.mock.calls[0][0]).toMatchObject({ status: "cancelled" });
    });

    it("is read at request time, so it flips without a redeploy", async () => {
      // No NEXT_PUBLIC_ prefix means no build-time inlining. Proven by flipping
      // it inside a single test run: the same event does nothing, then hides.
      alreadyTracking("sub_paid");
      mocks.constructEvent.mockReturnValue(subscriptionDeleted(makeSub("sub_paid", "canceled")));

      delete process.env.VENUE_REHIDE_ENABLED;
      await POST(webhookRequest());
      expect(venueUpdates()).toHaveLength(0);

      process.env.VENUE_REHIDE_ENABLED = "1";
      await POST(webhookRequest());
      expect(venueUpdates()).toHaveLength(1);
    });
  });

  describe("the three no-action decisions — Stripe's semantics, left alone", () => {
    it("does NOT hide a scheduled cancellation: they paid through the period, they keep it", async () => {
      // Stripe keeps the subscription `active` with cancel_at_period_end until
      // the period really ends, and only THEN fires .deleted. Hiding here is the
      // single worst bug this feature could have.
      alreadyTracking("sub_paid");
      mocks.constructEvent.mockReturnValue(
        subscriptionUpdated(makeSub("sub_paid", "active", { cancel_at_period_end: true }))
      );

      await POST(webhookRequest());

      expect(mocks.upsert.mock.calls[0][0]).toMatchObject({ status: "active", cancel_at_period_end: true });
      expect(venueUpdates()).toHaveLength(0);
    });

    it("does NOT hide on a declined card — past_due is a retry, not a departure", async () => {
      alreadyTracking("sub_paid");
      mocks.constructEvent.mockReturnValue(subscriptionUpdated(makeSub("sub_paid", "past_due")));

      await POST(webhookRequest());

      expect(mocks.upsert.mock.calls[0][0]).toMatchObject({ status: "past_due" });
      expect(venueUpdates()).toHaveLength(0);
    });

    it("does nothing when a failed payment later retries successfully", async () => {
      alreadyTracking("sub_paid");
      mocks.constructEvent.mockReturnValue(subscriptionUpdated(makeSub("sub_paid", "past_due")));
      await POST(webhookRequest());
      mocks.constructEvent.mockReturnValue(subscriptionUpdated(makeSub("sub_paid", "active")));
      await POST(webhookRequest());

      // They were never hidden, so there is nothing to restore.
      expect(venueUpdates()).toHaveLength(0);
    });

    it("does NOT hide on `unpaid`, which our mirror still calls past_due", async () => {
      alreadyTracking("sub_paid");
      mocks.constructEvent.mockReturnValue(subscriptionUpdated(makeSub("sub_paid", "unpaid")));

      await POST(webhookRequest());

      expect(venueUpdates()).toHaveLength(0);
    });
  });

  describe("hiding", () => {
    it("hides the venue when the subscription is deleted", async () => {
      alreadyTracking("sub_paid");
      mocks.constructEvent.mockReturnValue(subscriptionDeleted(makeSub("sub_paid", "canceled")));

      const response = await POST(webhookRequest());

      expect(response.status).toBe(200);
      expect(venueUpdates()).toHaveLength(1);
    });

    it("stamps rehidden_at in the SAME write as hidden", async () => {
      // Without the stamp the hide is permanent: shouldRestoreVenue only ever
      // restores what carries it.
      alreadyTracking("sub_paid");
      mocks.constructEvent.mockReturnValue(subscriptionDeleted(makeSub("sub_paid", "canceled")));

      await POST(webhookRequest());

      const payload = venueUpdates()[0].payload;
      expect(payload.hidden).toBe(true);
      expect(typeof payload.rehidden_at).toBe("string");
      expect(Number.isNaN(Date.parse(payload.rehidden_at as string))).toBe(false);
    });

    it.each([
      ["canceled", "customer.subscription.updated after Stripe exhausted its retries"],
      ["incomplete_expired", "a subscription that timed out"],
      ["paused", "a paused subscription, which our mirror folds into cancelled"],
    ])("hides on a dead status reached via .updated: %s (%s)", async (stripeStatus) => {
      alreadyTracking("sub_paid");
      mocks.constructEvent.mockReturnValue(subscriptionUpdated(makeSub("sub_paid", stripeStatus)));

      await POST(webhookRequest());

      expect(mocks.upsert.mock.calls[0][0]).toMatchObject({ status: "cancelled" });
      expect(venueUpdates()).toHaveLength(1);
      expect(venueUpdates()[0].payload).toMatchObject({ hidden: true });
    });

    it("scopes the update to the subscription's own venue id", async () => {
      alreadyTracking("sub_paid");
      mocks.constructEvent.mockReturnValue(subscriptionDeleted(makeSub("sub_paid", "canceled")));

      await POST(webhookRequest());

      expect(venueUpdates()[0].filters).toContainEqual({ op: "eq", args: ["id", "the-corner-tap"] });
    });

    it("only matches a currently-VISIBLE row, so a Stripe retry is a no-op", async () => {
      alreadyTracking("sub_paid");
      mocks.constructEvent.mockReturnValue(subscriptionDeleted(makeSub("sub_paid", "canceled")));

      await POST(webhookRequest());

      expect(venueUpdates()[0].filters).toContainEqual({ op: "eq", args: ["hidden", false] });
    });

    it("KEEPS the self_serve_created_at guard — admin-managed venues are never auto-hidden", async () => {
      // Same load-bearing clause as maybeRevealVenue. Admin-activated venues get
      // a REPORT from the daily reconciler, never an automatic hide, and the two
      // Category Blitz global rooms are stamp-null.
      alreadyTracking("sub_paid");
      mocks.constructEvent.mockReturnValue(subscriptionDeleted(makeSub("sub_paid", "canceled")));

      await POST(webhookRequest());

      expect(venueUpdates()[0].filters).toContainEqual({
        op: "not",
        args: ["self_serve_created_at", "is", null],
      });
    });

    it("KEEPS the (0, 0) clause — a placeholder must never be stamped rehidden_at", async () => {
      // Doubly load-bearing on the hide side: this write STAMPS rehidden_at, and
      // shouldRestoreVenue restores anything carrying that stamp without
      // re-checking provenance. Expressed as NOT(lat = 0 AND lng = 0), not two
      // `.neq` filters, which would also exclude a real venue on the equator or
      // the prime meridian.
      alreadyTracking("sub_paid");
      mocks.constructEvent.mockReturnValue(subscriptionDeleted(makeSub("sub_paid", "canceled")));

      await POST(webhookRequest());

      expect(venueUpdates()[0].filters).toContainEqual({
        op: "or",
        args: ["latitude.neq.0,longitude.neq.0"],
      });
    });
  });

  describe("what it refuses to act on", () => {
    it("ignores a STALE event for a subscription the venue has already replaced", async () => {
      // The venue moved to a new card subscription (or back to an offline grant).
      // Stripe retries for ~3 days, so a late .deleted for the OLD subscription
      // must not revoke a venue that is currently paying. Inherited for free by
      // hanging off the upsert result rather than the raw event.
      alreadyTracking("sub_new");
      mocks.constructEvent.mockReturnValue(subscriptionDeleted(makeSub("sub_old", "canceled")));

      await POST(webhookRequest());

      expect(mocks.upsert).not.toHaveBeenCalled();
      expect(venueUpdates()).toHaveLength(0);
    });

    it("ignores a cancelled subscription that was never tracked — the creation gate wrote nothing", async () => {
      // An unfinished signup that expired. No row was ever created, so there is
      // no lapse: /api/cron/signup-sweep owns the abandoned-signup case.
      state.row = null;
      mocks.constructEvent.mockReturnValue(subscriptionUpdated(makeSub("sub_never", "canceled")));

      await POST(webhookRequest());

      expect(mocks.upsert).not.toHaveBeenCalled();
      expect(venueUpdates()).toHaveLength(0);
    });

    it("does nothing when the subscription carries no venueId", async () => {
      alreadyTracking("sub_paid");
      mocks.constructEvent.mockReturnValue(
        subscriptionDeleted(makeSub("sub_paid", "canceled", { metadata: { ownerId: "owner-1" } }))
      );

      const response = await POST(webhookRequest());

      expect(response.status).toBe(200);
      expect(venueUpdates()).toHaveLength(0);
    });

    it("never runs from checkout.session.completed — that path only ever writes a paid subscription", async () => {
      mocks.retrieve.mockResolvedValue(makeSub("sub_paid", "active"));
      mocks.constructEvent.mockReturnValue(checkoutCompleted("sub_paid"));

      await POST(webhookRequest());

      // The reveal fires there; nothing hides.
      const updates = venueUpdates();
      expect(updates).toHaveLength(1);
      expect(updates[0].payload).toMatchObject({ hidden: false });
    });
  });

  describe("never fails the webhook", () => {
    it("returns 200 when the hide errors", async () => {
      state.venueUpdateError = { message: "permission denied" };
      alreadyTracking("sub_paid");
      mocks.constructEvent.mockReturnValue(subscriptionDeleted(makeSub("sub_paid", "canceled")));

      const response = await POST(webhookRequest());

      expect(response.status).toBe(200);
      // The mirror write already committed; a cosmetic failure must not make
      // Stripe retry the whole event and re-drive billing sync.
      expect(mocks.upsert).toHaveBeenCalledTimes(1);
    });

    it("returns 200 when the hide throws", async () => {
      state.venueUpdateThrows = true;
      alreadyTracking("sub_paid");
      mocks.constructEvent.mockReturnValue(subscriptionDeleted(makeSub("sub_paid", "canceled")));

      const response = await POST(webhookRequest());

      expect(response.status).toBe(200);
    });

    it("is silent when the predicate matches no row", async () => {
      state.changedRows = [];
      alreadyTracking("sub_paid");
      mocks.constructEvent.mockReturnValue(subscriptionDeleted(makeSub("sub_paid", "canceled")));

      const response = await POST(webhookRequest());

      expect(response.status).toBe(200);
    });
  });

  describe("the restore half", () => {
    it("clears rehidden_at when a resubscriber's venue is revealed", async () => {
      // A partner who lapsed and comes back arrives as a FIRST SYNC of a new
      // subscription id, which matches maybeRevealVenue's predicate. Un-hiding
      // without clearing the stamp leaves a visible venue still marked "we hid
      // this" — stale provenance the reconciler and the admin badge both read.
      state.row = null;
      mocks.retrieve.mockResolvedValue(makeSub("sub_second", "active"));
      mocks.constructEvent.mockReturnValue(checkoutCompleted("sub_second"));

      await POST(webhookRequest());

      expect(venueUpdates()[0].payload).toEqual({ hidden: false, rehidden_at: null });
    });
  });

  // The static guards for `maybeRehideVenue` (no current_period_end, asks
  // lib/venueVisibility for the billing half, hangs off the upsert result, never
  // deletes a billing_subscriptions row) live in
  // `tests/venue-rehide-contract.test.ts` alongside the rest of the re-hide
  // contract. Do not re-add a second copy here.
});
