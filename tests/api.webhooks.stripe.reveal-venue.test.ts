import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

/**
 * Partner Self-Serve Signup — Phase 6. The Stripe webhook reveals a self-serve
 * venue on first paid activation.
 *
 * POST /api/owner/signup creates its venue with `hidden = true` (Checkout needs a
 * venueId, so the row must exist before anyone has paid) and stamps
 * `self_serve_created_at` in the same insert. `maybeRevealVenue` is the only
 * thing that ever flips it visible.
 *
 * What this file pins:
 *   - a first sync flips hidden false, under BOTH the `hidden = true` and the
 *     `self_serve_created_at is not null` predicates;
 *   - a retry / later state change is a no-op (idempotence);
 *   - the stamp guard is present, because without it the same update matches the
 *     two Category Blitz global rooms, which are hidden and stamp-null;
 *   - a reveal failure never fails the webhook, and never blocks the welcome
 *     email that follows it.
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
  revealedRows: [] as Array<{ id: string }>,
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
 * The venues UPDATE is a filter chain that is finally awaited on `.returns()`,
 * so the builder has to record every filter and stay thenable. Recording the
 * filters (rather than just the payload) is the point: the `self_serve_created_at`
 * guard is a filter, and a test that only checked `{ hidden: false }` would pass
 * with the guard deleted.
 */
const makeUpdateBuilder = (table: string, payload: Record<string, unknown>) => {
  const call: UpdateCall = { table, payload, filters: [] };
  const settle = async () => {
    if (table !== "venues") return { data: [], error: null };
    if (state.venueUpdateThrows) throw new Error("connection reset");
    mocks.update(call);
    if (state.venueUpdateError) return { data: null, error: state.venueUpdateError };
    return { data: state.revealedRows, error: null };
  };
  const builder: Record<string, unknown> = {};
  // `or` joined this list in Phase 3 of the review-fixes plan, which added the
  // (0, 0) placeholder clause to the reveal predicate. Widening the harness's
  // op list is the only change made here — every assertion below predates it.
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

const makeSub = (id: string, status: string, metadata?: Record<string, string>): Stripe.Subscription =>
  ({
    id,
    metadata: metadata ?? { venueId: "the-corner-tap", ownerId: "owner-1" },
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

const webhookRequest = () =>
  new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "sig_test" },
    body: "{}",
  });

const checkoutCompleted = (subscriptionId: string) => ({
  type: "checkout.session.completed",
  data: { object: { subscription: subscriptionId } },
});

const subscriptionUpdated = (sub: Stripe.Subscription) => ({
  type: "customer.subscription.updated",
  data: { object: sub },
});

const venueUpdates = () => mocks.update.mock.calls.map(([call]) => call).filter((c) => c.table === "venues");

describe("POST /api/webhooks/stripe — revealing a self-serve venue", () => {
  beforeEach(() => {
    state.row = null;
    state.revealedRows = [{ id: "the-corner-tap" }];
    state.venueUpdateError = null;
    state.venueUpdateThrows = false;
    mocks.constructEvent.mockReset();
    mocks.retrieve.mockReset();
    mocks.upsert.mockReset();
    mocks.update.mockReset();
    mocks.sendWelcomeEmail.mockReset().mockResolvedValue(true);
    mocks.invoicesList.mockReset().mockResolvedValue({ data: [] });
  });

  it("unhides the venue on the first paid sync", async () => {
    mocks.retrieve.mockResolvedValue(makeSub("sub_paid", "active"));
    mocks.constructEvent.mockReturnValue(checkoutCompleted("sub_paid"));

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    const updates = venueUpdates();
    expect(updates).toHaveLength(1);
    // `rehidden_at: null` joined the payload in Phase 9 (lapsed-venue re-hide):
    // this follower is also the RESTORE half, so a resubscriber arriving here
    // must not stay marked "we hid this". Whatever un-hides a venue clears the
    // stamp. See tests/api.webhooks.stripe.rehide-venue.test.ts.
    expect(updates[0].payload).toEqual({ hidden: false, rehidden_at: null });
  });

  it("scopes the update to the subscription's own venue id", async () => {
    mocks.retrieve.mockResolvedValue(makeSub("sub_paid", "active"));
    mocks.constructEvent.mockReturnValue(checkoutCompleted("sub_paid"));

    await POST(webhookRequest());

    const eqFilters = venueUpdates()[0].filters.filter((f) => f.op === "eq");
    expect(eqFilters).toContainEqual({ op: "eq", args: ["id", "the-corner-tap"] });
  });

  it("only matches a row that is currently hidden, so a retry is a no-op", async () => {
    mocks.retrieve.mockResolvedValue(makeSub("sub_paid", "active"));
    mocks.constructEvent.mockReturnValue(checkoutCompleted("sub_paid"));

    await POST(webhookRequest());

    const eqFilters = venueUpdates()[0].filters.filter((f) => f.op === "eq");
    expect(eqFilters).toContainEqual({ op: "eq", args: ["hidden", true] });
  });

  it("KEEPS the self_serve_created_at guard — without it this reveals the Category Blitz global rooms", () => {
    // Production carries two hidden venues that are NOT self-serve signups:
    // `category-blitz-global-room` and `hc-cbz-live`, both stamp-null (verified
    // 2026-09-07). A plain `hidden = true` predicate would match them.
    const source = readWebhookSource();
    expect(source).toContain('.not("self_serve_created_at", "is", null)');
  });

  it("KEEPS the (0, 0) placeholder clause — a global room is never revealable", async () => {
    // Phase 3 of docs/self-serve-signup-review-fixes-plan.md. Defence in depth on
    // top of the stamp guard above: both Category Blitz global rooms sit at
    // exactly (0, 0), and "a venue at (0, 0) is NEVER revealable" is a standing
    // rule. Expressed as NOT(lat = 0 AND lng = 0) rather than two `.neq` filters,
    // which would also exclude a real venue on the equator or prime meridian.
    mocks.retrieve.mockResolvedValue(makeSub("sub_paid", "active"));
    mocks.constructEvent.mockReturnValue(checkoutCompleted("sub_paid"));

    await POST(webhookRequest());

    expect(venueUpdates()[0].filters).toContainEqual({
      op: "or",
      args: ["latitude.neq.0,longitude.neq.0"],
    });
  });

  it("does not run on a later state change once the subscription is already tracked", async () => {
    // Established row: not a first sync, so no follower runs.
    state.row = { stripe_subscription_id: "sub_paid", welcome_email_sent_at: "2026-09-01T00:00:00Z" };
    mocks.constructEvent.mockReturnValue(subscriptionUpdated(makeSub("sub_paid", "past_due")));

    await POST(webhookRequest());

    expect(venueUpdates()).toHaveLength(0);
  });

  it("does not run for a subscription that never settled", async () => {
    mocks.retrieve.mockResolvedValue(makeSub("sub_unpaid", "incomplete"));
    mocks.constructEvent.mockReturnValue(checkoutCompleted("sub_unpaid"));

    await POST(webhookRequest());

    expect(venueUpdates()).toHaveLength(0);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("does nothing when the subscription carries no venueId", async () => {
    mocks.retrieve.mockResolvedValue(makeSub("sub_paid", "active", { ownerId: "owner-1" }));
    mocks.constructEvent.mockReturnValue(checkoutCompleted("sub_paid"));

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(venueUpdates()).toHaveLength(0);
  });

  it("still sends the welcome email when the reveal errors", async () => {
    state.venueUpdateError = { message: "permission denied" };
    mocks.retrieve.mockResolvedValue(makeSub("sub_paid", "active"));
    mocks.constructEvent.mockReturnValue(checkoutCompleted("sub_paid"));

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.sendWelcomeEmail).toHaveBeenCalledTimes(1);
  });

  it("returns 200 when the reveal throws — a cosmetic failure must not make Stripe retry billing sync", async () => {
    state.venueUpdateThrows = true;
    mocks.retrieve.mockResolvedValue(makeSub("sub_paid", "active"));
    mocks.constructEvent.mockReturnValue(checkoutCompleted("sub_paid"));

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.sendWelcomeEmail).toHaveBeenCalledTimes(1);
  });

  it("runs BEFORE the welcome email, so the venue is live before the partner is told it is", () => {
    const source = readWebhookSource();
    const followerBody = source.slice(source.indexOf("async function runFirstSyncFollowers"));
    expect(followerBody.indexOf("maybeRevealVenue(sub)")).toBeLessThan(
      followerBody.indexOf("maybeSendWelcomeEmail(sub)")
    );
  });
});

function readWebhookSource(): string {
  return readFileSync(path.resolve(process.cwd(), "app/api/webhooks/stripe/route.ts"), "utf8");
}
