import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 4 of the resubscribe-loops-to-dashboard fix (docs/resubscribe-fix-plan.md).
 *
 * Cancel is a SCHEDULED cancel: status stays 'active' with cancel_at_period_end
 * true until the paid period actually elapses. That makes three distinct billing
 * states, each with exactly one correct action:
 *
 *   | state                              | resume | checkout |
 *   |------------------------------------|--------|----------|
 *   | active                             |  n/a   |   409    |  (nothing to do)
 *   | active + cancelAtPeriodEnd         |  200   |   409    |  (resume_instead)
 *   | cancelled                          |  409   |   200    |  (checkout_instead)
 *   | past_due                           |  ---   |   409    |  (fix_payment)
 *   | past_due + cancelAtPeriodEnd       |  ---   |   409    |  (resume_instead)
 *
 * `past_due` (added by docs/billing-guard-phase2.md) is the state the original
 * `status === "active"` guards missed: the subscription is still LIVE at Stripe
 * — the card declined and Stripe is retrying — so Checkout must refuse it too.
 * The resume side of those two rows lands in Phase 4 and is not asserted here.
 *
 * The bug this locks down: checkout must NOT be reachable from the middle row —
 * a Checkout session there mints a SECOND Stripe subscription on the same
 * customer (double billing + a venue_id-unique upsert collision in the webhook).
 */

type SubRow = {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  /** NOT NULL DEFAULT 'stripe' in the DB — never undefined on a real row. */
  billing_method: string;
};

const state = vi.hoisted(() => ({ row: null as SubRow | null }));

const mocks = vi.hoisted(() => ({
  stripeUpdate: vi.fn(),
  stripeRetrieve: vi.fn(),
  checkoutCreate: vi.fn(),
  dbUpdate: vi.fn((_payload: Record<string, unknown>) => undefined),
}));

vi.mock("@/lib/requireOwnerAuth", () => ({
  requireOwnerAuth: vi.fn(async () => ({ ownerId: "owner-1", venueIds: ["venue-1"] })),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    subscriptions: { update: mocks.stripeUpdate, retrieve: mocks.stripeRetrieve },
    checkout: { sessions: { create: mocks.checkoutCreate } },
  },
  getStripePriceId: () => "price_test_123",
  OFFLINE_BILLING_METHOD: "offline",
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: state.row, error: null })) })),
      })),
      update: vi.fn((payload: Record<string, unknown>) => {
        mocks.dbUpdate(payload);
        return { eq: vi.fn(async () => ({ error: null })) };
      }),
    })),
  },
}));

import { POST as checkout } from "@/app/api/owner/billing/checkout/route";
import { POST as resume } from "@/app/api/owner/billing/subscription/route";

const ACTIVE: SubRow = {
  id: "sub-1",
  status: "active",
  cancel_at_period_end: false,
  stripe_subscription_id: "sub_stripe_1",
  stripe_customer_id: "cus_1",
  billing_method: "stripe",
};
const SCHEDULED_CANCEL: SubRow = { ...ACTIVE, cancel_at_period_end: true };
const CANCELLED: SubRow = { ...ACTIVE, status: "cancelled" };
const PAST_DUE: SubRow = { ...ACTIVE, status: "past_due" };
const PAST_DUE_SCHEDULED_CANCEL: SubRow = { ...PAST_DUE, cancel_at_period_end: true };

const post = (path: string) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ venueId: "venue-1" }),
  });

const readJson = async (response: Response) =>
  (await response.json()) as { ok: boolean; error?: string; code?: string; url?: string };

describe("owner billing — resume vs. checkout state matrix", () => {
  beforeEach(() => {
    state.row = null;
    mocks.stripeUpdate.mockReset().mockResolvedValue({});
    // Default: Stripe agrees with the mirror. The self-heal tests below override
    // this to make the two disagree.
    mocks.stripeRetrieve
      .mockReset()
      .mockImplementation(async () => ({ status: state.row?.status === "cancelled" ? "canceled" : "active" }));
    mocks.checkoutCreate.mockReset().mockResolvedValue({ url: "https://checkout.stripe.test/session" });
    mocks.dbUpdate.mockReset();
  });

  describe("status: active (no scheduled cancel)", () => {
    beforeEach(() => {
      state.row = ACTIVE;
    });

    it("refuses checkout — the venue already has an active subscription", async () => {
      const response = await checkout(post("/api/owner/billing/checkout"));

      expect(response.status).toBe(409);
      expect((await readJson(response)).error).toContain("already has an active subscription");
      expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    });
  });

  describe("status: active + cancelAtPeriodEnd (still inside the paid period)", () => {
    beforeEach(() => {
      state.row = SCHEDULED_CANCEL;
    });

    it("refuses checkout with code 'resume_instead' — never mints a second subscription", async () => {
      const response = await checkout(post("/api/owner/billing/checkout"));
      const body = await readJson(response);

      expect(response.status).toBe(409);
      expect(body.code).toBe("resume_instead");
      expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    });

    it("permits resume, un-scheduling the existing subscription in place", async () => {
      const response = await resume(post("/api/owner/billing/subscription"));

      expect(response.status).toBe(200);
      expect((await readJson(response)).ok).toBe(true);
      expect(mocks.stripeUpdate).toHaveBeenCalledWith("sub_stripe_1", { cancel_at_period_end: false });
      expect(mocks.dbUpdate).toHaveBeenCalledWith({ cancel_at_period_end: false });
      expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    });
  });

  describe("status: cancelled (paid period elapsed)", () => {
    beforeEach(() => {
      state.row = CANCELLED;
    });

    it("permits checkout — this is the real 'Resubscribe' path", async () => {
      const response = await checkout(post("/api/owner/billing/checkout"));
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect(body.url).toBe("https://checkout.stripe.test/session");
      // Reuses the existing Stripe customer rather than orphaning it.
      expect(mocks.checkoutCreate).toHaveBeenCalledWith(
        expect.objectContaining({ customer: "cus_1", allow_promotion_codes: true })
      );
    });

    it("refuses resume with code 'checkout_instead' and never calls Stripe", async () => {
      const response = await resume(post("/api/owner/billing/subscription"));
      const body = await readJson(response);

      expect(response.status).toBe(409);
      expect(body.code).toBe("checkout_instead");
      expect(mocks.stripeUpdate).not.toHaveBeenCalled();
      expect(mocks.dbUpdate).not.toHaveBeenCalled();
    });
  });

  describe("status: past_due (card declined, Stripe still retrying)", () => {
    beforeEach(() => {
      state.row = PAST_DUE;
    });

    it("refuses checkout with code 'fix_payment' — a second subscription would double-bill", async () => {
      const response = await checkout(post("/api/owner/billing/checkout"));
      const body = await readJson(response);

      expect(response.status).toBe(409);
      expect(body.code).toBe("fix_payment");
      expect(body.error).toContain("payment failed");
      expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    });
  });

  describe("status: past_due + cancelAtPeriodEnd", () => {
    beforeEach(() => {
      state.row = PAST_DUE_SCHEDULED_CANCEL;
    });

    it("refuses checkout with code 'resume_instead' — still live at Stripe", async () => {
      const response = await checkout(post("/api/owner/billing/checkout"));
      const body = await readJson(response);

      expect(response.status).toBe(409);
      expect(body.code).toBe("resume_instead");
      expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    });

    it("permits resume — still live at Stripe, only un-schedules the cancel", async () => {
      const response = await resume(post("/api/owner/billing/subscription"));

      expect(response.status).toBe(200);
      expect((await readJson(response)).ok).toBe(true);
      expect(mocks.stripeUpdate).toHaveBeenCalledWith("sub_stripe_1", { cancel_at_period_end: false });
      expect(mocks.dbUpdate).toHaveBeenCalledWith({ cancel_at_period_end: false });
      expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    });
  });

  describe("tokenless row (offline/check billing — nothing exists at Stripe)", () => {
    it("permits checkout even when status is 'active'", async () => {
      state.row = { ...ACTIVE, stripe_subscription_id: null, stripe_customer_id: null };

      const response = await checkout(post("/api/owner/billing/checkout"));

      expect(response.status).toBe(200);
      expect(mocks.checkoutCreate).toHaveBeenCalled();
    });
  });

  /**
   * The tokenless case above is why this one exists: `no_stripe_object` reads as
   * "safe to check out", which is right for a stripe-billed row whose Stripe
   * object never materialized, but wrong for a check payer who is already being
   * billed offline. Those two are distinguished only by billing_method.
   *
   * An offline row is only ever 'active' or 'cancelled' — grant-manual creates it
   * active with every processor id nulled, and the cron expiry sweep flips it
   * straight to 'cancelled' when the paid-through date lapses. It never goes
   * past_due, so those are the only two states worth asserting.
   */
  describe("billing_method: offline (admin-granted check payer)", () => {
    it("refuses checkout with code 'offline_billing' while still billing", async () => {
      state.row = { ...ACTIVE, stripe_subscription_id: null, stripe_customer_id: null, billing_method: "offline" };

      const response = await checkout(post("/api/owner/billing/checkout"));
      const body = await readJson(response);

      expect(response.status).toBe(409);
      expect(body.code).toBe("offline_billing");
      expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    });

    it("permits checkout once the offline row is cancelled", async () => {
      state.row = {
        ...CANCELLED,
        stripe_subscription_id: null,
        stripe_customer_id: null,
        billing_method: "offline",
      };

      const response = await checkout(post("/api/owner/billing/checkout"));

      expect(response.status).toBe(200);
      expect(mocks.checkoutCreate).toHaveBeenCalled();
    });
  });

  /**
   * Phase 3 (docs/billing-guard-phase3.md): the row is only a MIRROR of Stripe.
   * When the webhook missed an event, the mirror must not be the last word.
   */
  describe("stale mirror — self-heal against Stripe", () => {
    it("allows checkout and corrects the row when Stripe says the 'active' subscription is canceled", async () => {
      state.row = ACTIVE;
      mocks.stripeRetrieve.mockResolvedValue({ status: "canceled" });

      const response = await checkout(post("/api/owner/billing/checkout"));

      expect(mocks.stripeRetrieve).toHaveBeenCalledWith("sub_stripe_1");
      // The discount mirror dies with the subscription: the owner UI renders the
      // discount block whenever it is populated, so a leftover coupon would price
      // a dead subscription next to "Resubscribe".
      expect(mocks.dbUpdate).toHaveBeenCalledWith({
        status: "cancelled",
        cancel_at_period_end: false,
        stripe_coupon_id: null,
        discount_label: null,
        discount_percent_off: null,
        discount_amount_off_cents: null,
        discount_ends_at: null,
      });
      expect(response.status).toBe(200);
      expect(mocks.checkoutCreate).toHaveBeenCalled();
    });

    it("unblocks checkout on resource_missing but does NOT write it back to the mirror", async () => {
      // `resource_missing` also fires on a wrong-mode id (test id, live key), so
      // it is not proof the subscription is gone — it must never overwrite a
      // possibly-live row to 'cancelled'.
      state.row = PAST_DUE;
      mocks.stripeRetrieve.mockRejectedValue(
        Object.assign(new Error("No such subscription: sub_stripe_1"), { code: "resource_missing" })
      );

      const response = await checkout(post("/api/owner/billing/checkout"));

      expect(response.status).toBe(200);
      expect(mocks.dbUpdate).not.toHaveBeenCalled();
      expect(mocks.checkoutCreate).toHaveBeenCalled();
    });

    it("keeps refusing when Stripe is unreachable — an outage must not reopen double billing", async () => {
      state.row = ACTIVE;
      mocks.stripeRetrieve.mockRejectedValue(new Error("connection error"));

      const response = await checkout(post("/api/owner/billing/checkout"));

      expect(response.status).toBe(409);
      expect(mocks.dbUpdate).not.toHaveBeenCalled();
      expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    });

    it("refuses checkout when the row says 'cancelled' but Stripe has it merely paused", async () => {
      state.row = CANCELLED;
      mocks.stripeRetrieve.mockResolvedValue({ status: "paused" });

      const response = await checkout(post("/api/owner/billing/checkout"));
      const body = await readJson(response);

      expect(response.status).toBe(409);
      expect(body.code).toBe("stripe_live");
      expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    });

    it("refuses checkout when the row says 'cancelled' and Stripe is unreachable", async () => {
      // The other half of the outage guard: a mirror-'cancelled' row may really
      // be `paused` (live) at Stripe, so allowing here would double-bill.
      state.row = CANCELLED;
      mocks.stripeRetrieve.mockRejectedValue(new Error("connection error"));

      const response = await checkout(post("/api/owner/billing/checkout"));
      const body = await readJson(response);

      expect(response.status).toBe(409);
      expect(body.code).toBe("stripe_unreachable");
      expect(mocks.dbUpdate).not.toHaveBeenCalled();
      expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    });

    it("allows checkout when the row says 'cancelled' and Stripe agrees it is canceled", async () => {
      state.row = CANCELLED;
      mocks.stripeRetrieve.mockResolvedValue({ status: "canceled" });

      const response = await checkout(post("/api/owner/billing/checkout"));

      expect(response.status).toBe(200);
      expect(mocks.checkoutCreate).toHaveBeenCalled();
    });

    it("routes resume to 'checkout_instead' when Stripe says the mirrored live subscription is gone", async () => {
      state.row = SCHEDULED_CANCEL;
      mocks.stripeRetrieve.mockResolvedValue({ status: "canceled" });

      const response = await resume(post("/api/owner/billing/subscription"));
      const body = await readJson(response);

      expect(response.status).toBe(409);
      expect(body.code).toBe("checkout_instead");
      expect(mocks.stripeUpdate).not.toHaveBeenCalled();
      expect(mocks.dbUpdate).not.toHaveBeenCalled();
    });

    it("still attempts resume when Stripe is unreachable — nothing safe to conclude", async () => {
      state.row = SCHEDULED_CANCEL;
      mocks.stripeRetrieve.mockRejectedValue(new Error("connection error"));

      const response = await resume(post("/api/owner/billing/subscription"));

      expect(response.status).toBe(200);
      expect(mocks.stripeUpdate).toHaveBeenCalledWith("sub_stripe_1", { cancel_at_period_end: false });
    });

    it("does not call Stripe for a tokenless row — there is nothing to reconcile", async () => {
      state.row = { ...CANCELLED, stripe_subscription_id: null };

      const response = await checkout(post("/api/owner/billing/checkout"));

      expect(response.status).toBe(200);
      expect(mocks.stripeRetrieve).not.toHaveBeenCalled();
    });
  });

  /**
   * Phase 9 (docs/billing-discount-phase9.md): a discount is a mirror-only
   * decoration (docs/billing-discount-phase1.md's additive columns) that the
   * checkout route doesn't even select — it must have zero effect on the
   * hardened "live at Stripe" guard from billing-guard-hardening-plan.md.
   */
  describe("discounted subscription — discount must not weaken the live-at-Stripe guard", () => {
    it("still refuses checkout for an active, discounted subscription", async () => {
      state.row = {
        ...ACTIVE,
        stripe_coupon_id: "hc-pct-25-forever",
        discount_label: "25% off forever",
      } as SubRow;

      const response = await checkout(post("/api/owner/billing/checkout"));

      expect(response.status).toBe(409);
      expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    });
  });

  describe("no subscription row at all", () => {
    it("permits checkout (first-time subscribe)", async () => {
      const response = await checkout(post("/api/owner/billing/checkout"));

      expect(response.status).toBe(200);
      expect(mocks.checkoutCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: undefined }));
    });

    it("404s resume — there is nothing to resume", async () => {
      const response = await resume(post("/api/owner/billing/subscription"));

      expect(response.status).toBe(404);
      expect(mocks.stripeUpdate).not.toHaveBeenCalled();
    });
  });
});
