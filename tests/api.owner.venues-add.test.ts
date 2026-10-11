import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Row } from "@/tests/helpers/inMemorySupabase";

/**
 * Multi-venue billing Phase 3 — "Add a venue" backend, end to end
 * (docs/multi-venue-volume-billing-plan.md §4.3 and the Phase 3 test list in §5).
 *
 * The add route, the quote route, the Stripe webhook and the daily reconciler all run against ONE
 * in-memory database and ONE simulated Stripe subscription, so they can race each other exactly
 * as they do in production. Stripe's `pending_if_incomplete` semantics are simulated: the new
 * quantity applies only when the prorated invoice is paid; a decline or 3-D Secure leaves a
 * `pending_update` and an open invoice; voiding the invoice discards the update.
 */

const ANCHOR = "venue-anchor";
const OWNER = "owner-1";
const BILL = "bill-1";
const SUB = "sub_1";
const ITEM = "si_1";
const NOW_S = Math.floor(Date.now() / 1000);

type SimInvoice = {
  id: string;
  object: "invoice";
  status: "open" | "paid" | "void";
  amount_due: number;
  amount_paid: number;
  billing_reason: string;
  hosted_invoice_url: string;
  description: string;
  created: number;
  status_transitions: { paid_at: number | null };
  parent: { subscription_details: { subscription: string } };
  payments: { data: Array<{ created: number; payment: { type: "payment_intent"; payment_intent: Row } }> };
  pendingQuantity: number;
};

type PaymentMode = "succeed" | "decline" | "requires_action" | "connection_error" | "card_error" | "applied_then_connection_error";

const h = vi.hoisted(() => {
  const state = {
    ownerId: "owner-1" as string | null,
    rateLimitAllowed: true,
    db: null as unknown as import("@/tests/helpers/inMemorySupabase").InMemoryDb,
    paymentMode: "succeed" as string,
    voidFails: false,
    subscription: {} as Record<string, unknown>,
    invoices: new Map<string, Record<string, unknown>>(),
    replays: new Map<string, unknown>(),
    invoiceCounter: 0,
    // Called inside subscriptions.update before it returns — lets a test deliver a webhook mid-request.
    duringUpdate: null as null | (() => Promise<void>),
  };
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const fns = {
    constructEvent: vi.fn(),
    subscriptionsRetrieve: vi.fn(),
    subscriptionsUpdate: vi.fn(),
    invoicesRetrieve: vi.fn(),
    invoicesVoid: vi.fn(),
    invoicesPreview: vi.fn(),
    createAdminVenue: vi.fn(),
    sendVenueAddedEmail: vi.fn(async () => true),
  };
  return { state, clone, fns };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabaseAdmin", () => ({
  get supabaseAdmin() {
    return h.state.db.client;
  },
}));

vi.mock("@/lib/stripe", async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    stripe: {
      webhooks: { constructEvent: h.fns.constructEvent },
      subscriptions: { retrieve: h.fns.subscriptionsRetrieve, update: h.fns.subscriptionsUpdate },
      invoices: {
        retrieve: h.fns.invoicesRetrieve,
        voidInvoice: h.fns.invoicesVoid,
        createPreview: h.fns.invoicesPreview,
        list: vi.fn(async () => ({ data: [] })),
      },
    },
    getStripeWebhookSecret: () => "whsec_test",
  };
});

vi.mock("@/lib/requireOwnerAuth", () => ({
  requireOwnerAuth: vi.fn(async () => {
    if (!h.state.ownerId) {
      throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    const venueIds = (h.state.db.tables.venue_owner_venues as Row[])
      .filter((row) => row.owner_id === h.state.ownerId)
      .map((row) => String(row.venue_id))
      .filter((id) => (h.state.db.tables.venues as Row[]).some((venue) => venue.id === id));
    return { ownerId: h.state.ownerId, venueIds };
  }),
}));

vi.mock("@/lib/rateLimit", async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    rateLimit: vi.fn(async () =>
      h.state.rateLimitAllowed ? { allowed: true, retryAfterSeconds: 0 } : { allowed: false, retryAfterSeconds: 120 }
    ),
  };
});

vi.mock("@/lib/admin", () => ({ createAdminVenue: h.fns.createAdminVenue }));
vi.mock("@/lib/email/sendVenueAddedEmail", () => ({ sendVenueAddedEmail: h.fns.sendVenueAddedEmail }));
vi.mock("@/lib/email/sendWelcomeEmail", () => ({ sendWelcomeEmail: vi.fn(async () => false) }));

import { createInMemoryDb } from "@/tests/helpers/inMemorySupabase";
import { POST as addPOST } from "@/app/api/owner/venues/add/route";
import { GET as quoteGET } from "@/app/api/owner/venues/add/quote/route";
import { POST as webhookPOST } from "@/app/api/webhooks/stripe/route";
import { VENUE_ADDITION_LEASE_MS, reconcileStaleVenueAdditions } from "@/lib/venueAddition";
import { venueIdsEverBilled } from "@/lib/venueBilling";
import { GRADUATED_PRICE_LOOKUP_KEY } from "@/lib/venuePricing";

// --- Fixture ---------------------------------------------------------------------------------------

const claimVenueAdditionRpc = (args: Row, db: import("@/tests/helpers/inMemorySupabase").InMemoryDb) => {
  // A JS port of supabase/migrations/20261011153607_venue_addition_claim.sql (whose SQL is proven
  // on PGlite by scripts/test-multi-venue-billing-sql.cjs). Synchronous = atomic, like the lock.
  const key = String(args.p_idempotency_key ?? "").trim();
  const ownerId = args.p_owner_id;
  const billId = args.p_subscription_id;
  if (!key || !ownerId || !billId) return { data: [{ outcome: "invalid" }], error: null };
  const bill = (db.tables.billing_subscriptions as Row[]).find((row) => row.id === billId);
  if (!bill) return { data: [{ outcome: "no_bill" }], error: null };
  if (bill.owner_id !== ownerId) return { data: [{ outcome: "not_owner" }], error: null };
  const ledger = db.tables.billing_venue_additions as Row[];
  const shape = (outcome: string, row: Row) => ({
    data: [
      {
        outcome,
        addition_id: row.id,
        addition_status: row.status,
        addition_venue_id: row.venue_id ?? null,
        addition_invoice_id: row.stripe_invoice_id ?? null,
        addition_quantity_before: row.quantity_before,
        addition_quantity_after: row.quantity_after,
      },
    ],
    error: null,
  });
  const existing = ledger.find((row) => row.idempotency_key === key);
  if (existing) {
    if (existing.subscription_id !== billId || existing.owner_id !== ownerId) {
      return { data: [{ outcome: "key_conflict", addition_id: null }], error: null };
    }
    return shape("existing", existing);
  }
  const busy = ledger.find((row) => row.subscription_id === billId && ["pending", "requires_action"].includes(String(row.status)));
  if (busy) return shape("busy", busy);
  const count = (db.tables.billing_subscription_venues as Row[]).filter(
    (row) => row.subscription_id === billId && !row.removed_at && !row.remove_at
  ).length;
  if (count < 1) return { data: [{ outcome: "no_bill" }], error: null };
  const stamp = new Date().toISOString();
  const row: Row = {
    id: crypto.randomUUID(),
    idempotency_key: key,
    owner_id: ownerId,
    subscription_id: billId,
    venue_id: null,
    venue_name: String(args.p_venue_name ?? "").trim() || null,
    status: "pending",
    stripe_invoice_id: null,
    quantity_before: count,
    quantity_after: count + 1,
    amount_due_cents: null,
    failure_reason: null,
    venue_added_email_sent_at: null,
    created_at: stamp,
    updated_at: stamp,
  };
  ledger.push(row);
  return shape("claimed", row);
};

const freshDb = () =>
  createInMemoryDb(
    {
      venues: [
        {
          id: ANCHOR,
          name: "Anchor Bar",
          address: "1 Main St, Springfield, NJ",
          street: "1 Main St",
          city: "Springfield",
          state: "NJ",
          latitude: 40.0,
          longitude: -74.0,
          hidden: false,
          self_serve_created_at: "2026-09-01T00:00:00.000Z",
          checkout_started_at: "2026-09-01T00:00:00.000Z",
          rehidden_at: null,
        },
      ],
      venue_owners: [{ id: OWNER, name: "Pat", email: "pat@example.com" }],
      venue_owner_venues: [{ id: "link-anchor", owner_id: OWNER, venue_id: ANCHOR }],
      billing_subscriptions: [
        {
          id: BILL,
          venue_id: ANCHOR,
          owner_id: OWNER,
          status: "active",
          billing_method: "stripe",
          stripe_subscription_id: SUB,
          stripe_customer_id: "cus_1",
          cancel_at_period_end: false,
          amount_cents: 10000,
          quantity: 1,
          discount_label: null,
          discount_percent_off: null,
          discount_amount_off_cents: null,
        },
      ],
      billing_subscription_venues: [
        { id: "m-anchor", subscription_id: BILL, venue_id: ANCHOR, role: "anchor", removed_at: null, remove_at: null },
      ],
      billing_venue_additions: [],
      billing_invoices: [],
    },
    {
      billing_venue_additions: { unique: ["idempotency_key"], timestamps: true },
      billing_subscription_venues: { unique: ["venue_id"] },
      venue_owner_venues: { unique: ["venue_id"] },
      billing_invoices: { unique: ["stripe_invoice_id"] },
    },
    [
      { table: "venue_owner_venues", column: "venue_id", references: { table: "venues", column: "id" }, onDelete: "cascade" },
      { table: "billing_subscription_venues", column: "venue_id", references: { table: "venues", column: "id" }, onDelete: "cascade" },
      { table: "billing_venue_additions", column: "venue_id", references: { table: "venues", column: "id" }, onDelete: "set null" },
    ],
    { claim_venue_addition: claimVenueAdditionRpc }
  );

const freshSubscription = () => ({
  id: SUB,
  object: "subscription",
  status: "active",
  customer: "cus_1",
  cancel_at_period_end: false,
  cancel_at: null,
  collection_method: "charge_automatically",
  schedule: null,
  pending_update: null as null | Row,
  metadata: { venueId: ANCHOR, ownerId: OWNER },
  latest_invoice: "in_previous",
  discounts: [],
  items: {
    data: [
      {
        id: ITEM,
        quantity: 1,
        current_period_start: NOW_S - 10 * 86400,
        current_period_end: NOW_S + 20 * 86400,
        price: {
          id: "price_graduated",
          lookup_key: GRADUATED_PRICE_LOOKUP_KEY,
          billing_scheme: "tiered",
          tiers_mode: "graduated",
          unit_amount: null,
          nickname: null,
        },
      },
    ],
  },
});

const subItem = () => (h.state.subscription.items as { data: Array<Row> }).data[0];

const makeInvoice = (pendingQuantity: number, intent: Row): SimInvoice => {
  h.state.invoiceCounter += 1;
  return {
    id: `in_add_${h.state.invoiceCounter}`,
    object: "invoice",
    status: "open",
    amount_due: 3750,
    amount_paid: 0,
    billing_reason: "subscription_update",
    hosted_invoice_url: `https://invoice.stripe.com/i/in_add_${h.state.invoiceCounter}`,
    description: "Proration",
    created: NOW_S,
    status_transitions: { paid_at: null },
    parent: { subscription_details: { subscription: SUB } },
    payments: { data: [{ created: NOW_S, payment: { type: "payment_intent", payment_intent: intent } }] },
    pendingQuantity,
  };
};

/** Stripe paying an open invoice later (3-D Secure completed on the hosted page): the pending update applies. */
const payInvoice = (invoiceId: string) => {
  const invoice = h.state.invoices.get(invoiceId) as unknown as SimInvoice;
  invoice.status = "paid";
  invoice.amount_paid = invoice.amount_due;
  invoice.status_transitions.paid_at = NOW_S;
  subItem().quantity = invoice.pendingQuantity;
  h.state.subscription.pending_update = null;
};

/** Stripe's 23-hour expiry: the invoice is voided and the pending update discarded. */
const expireInvoice = (invoiceId: string) => {
  const invoice = h.state.invoices.get(invoiceId) as unknown as SimInvoice;
  invoice.status = "void";
  h.state.subscription.pending_update = null;
};

const installStripe = () => {
  h.fns.subscriptionsRetrieve.mockImplementation(async (_id: string, options?: { expand?: string[] }) => {
    const copy = h.clone(h.state.subscription);
    if (options?.expand?.includes("latest_invoice")) {
      const invoice = h.state.invoices.get(String(copy.latest_invoice));
      if (invoice) copy.latest_invoice = h.clone(invoice);
    }
    return copy;
  });

  h.fns.subscriptionsUpdate.mockImplementation(
    async (_id: string, params: { items: Array<{ quantity: number }> }, options: { idempotencyKey: string }) => {
      const replay = h.state.replays.get(options.idempotencyKey);
      if (replay) return h.clone(replay);
      const mode = h.state.paymentMode as PaymentMode;
      if (mode === "connection_error") {
        throw Object.assign(new Error("socket hang up"), { type: "StripeConnectionError" });
      }
      if (mode === "card_error") {
        throw Object.assign(new Error("Your card was declined."), {
          type: "StripeCardError",
          statusCode: 402,
          code: "card_declined",
          decline_code: "generic_decline",
        });
      }
      const quantity = params.items[0].quantity;
      const intentStatus =
        mode === "decline" ? "requires_payment_method" : mode === "requires_action" ? "requires_action" : "succeeded";
      const invoice = makeInvoice(quantity, {
        id: `pi_${h.state.invoiceCounter + 1}`,
        status: intentStatus,
        last_payment_error: mode === "decline" ? { code: "card_declined", decline_code: "insufficient_funds" } : null,
      });
      h.state.invoices.set(invoice.id, invoice as unknown as Record<string, unknown>);
      h.state.subscription.latest_invoice = invoice.id;
      if (mode === "succeed" || mode === "applied_then_connection_error") {
        payInvoice(invoice.id);
      } else {
        h.state.subscription.pending_update = { expires_at: NOW_S + 23 * 3600, subscription_items: [{ id: ITEM, quantity }] };
      }
      if (h.state.duringUpdate) await h.state.duringUpdate();
      if (mode === "applied_then_connection_error") {
        throw Object.assign(new Error("socket hang up after apply"), { type: "StripeConnectionError" });
      }
      const response = { ...h.clone(h.state.subscription), latest_invoice: h.clone(h.state.invoices.get(invoice.id)) };
      h.state.replays.set(options.idempotencyKey, response);
      return h.clone(response);
    }
  );

  h.fns.invoicesRetrieve.mockImplementation(async (id: string) => {
    const invoice = h.state.invoices.get(id);
    if (!invoice) throw Object.assign(new Error("No such invoice"), { type: "StripeInvalidRequestError", statusCode: 404 });
    return h.clone(invoice);
  });

  h.fns.invoicesVoid.mockImplementation(async (id: string) => {
    if (h.state.voidFails) throw Object.assign(new Error("Stripe down"), { type: "StripeAPIError", statusCode: 500 });
    const invoice = h.state.invoices.get(id) as unknown as SimInvoice;
    invoice.status = "void";
    h.state.subscription.pending_update = null;
    return h.clone(invoice);
  });

  h.fns.invoicesPreview.mockImplementation(async () => ({
    amount_due: 3750,
    lines: {
      data: [
        { amount: -3333, parent: { subscription_item_details: { proration: true } } },
        { amount: 7083, parent: { subscription_item_details: { proration: true } } },
      ],
    },
  }));
};

const body = (overrides: Row = {}): Row => ({
  idempotencyKey: "confirm-aaaaaaaa",
  venueName: "Second Bar",
  street: "200 Main St",
  city: "Springfield",
  state: "nj",
  zipCode: "07001",
  placeId: "",
  latitude: 40.1,
  longitude: -74.1,
  radius: 150,
  ...overrides,
});

const add = async (overrides: Row = {}) => {
  const response = await addPOST(
    new Request("http://localhost/api/owner/venues/add", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body(overrides)),
    })
  );
  return { status: response.status, json: (await response.json()) as Row };
};

const quote = async (query = "") => {
  const response = await quoteGET(new Request(`http://localhost/api/owner/venues/add/quote${query}`));
  return { status: response.status, json: (await response.json()) as Row };
};

const deliverInvoicePaid = async (invoiceId: string, billingReason = "subscription_update") => {
  const invoice = { ...h.clone(h.state.invoices.get(invoiceId) ?? { id: invoiceId }), billing_reason: billingReason };
  h.fns.constructEvent.mockReturnValue({ type: "invoice.paid", data: { object: invoice } });
  return webhookPOST(
    new Request("http://localhost/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": "sig" }, body: "{}" })
  );
};

const table = (name: string) => h.state.db.tables[name] as Row[];
const ledger = () => table("billing_venue_additions");
const venueById = (id: string) => table("venues").find((row) => row.id === id);
const memberships = () => table("billing_subscription_venues");
const afterLease = () => Date.now() + VENUE_ADDITION_LEASE_MS + 60_000;

beforeEach(() => {
  process.env.NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED = "true";
  h.state.ownerId = OWNER;
  h.state.rateLimitAllowed = true;
  h.state.db = freshDb();
  h.state.paymentMode = "succeed";
  h.state.voidFails = false;
  h.state.subscription = freshSubscription();
  h.state.invoices = new Map();
  h.state.replays = new Map();
  h.state.invoiceCounter = 0;
  h.state.duringUpdate = null;
  for (const fn of Object.values(h.fns)) fn.mockReset();
  h.fns.sendVenueAddedEmail.mockImplementation(async () => true);
  h.fns.createAdminVenue.mockImplementation(async (input: Row) => {
    const base = `venue-${String(input.name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    let id = base;
    let suffix = 2;
    while (venueById(id)) id = `${base}-${suffix++}`;
    table("venues").push({
      id,
      name: input.name,
      address: `${String(input.street)}, ${String(input.city)}, ${String(input.state)}`,
      street: input.street,
      city: input.city,
      state: input.state,
      latitude: input.latitude,
      longitude: input.longitude,
      radius: input.radius,
      hidden: input.hidden ?? false,
      self_serve_created_at: input.selfServeCreatedAt ?? null,
      checkout_started_at: input.checkoutStartedAt ?? null,
      rehidden_at: null,
    });
    return { id };
  });
  installStripe();
});

// --- Tests -----------------------------------------------------------------------------------------

describe("flag and gate", () => {
  it("404s both routes when NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED is off, touching nothing", async () => {
    process.env.NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED = "";
    expect((await add()).status).toBe(404);
    expect((await quote()).status).toBe(404);
    expect(h.state.db.fromCalls).toEqual([]);
    expect(h.fns.subscriptionsRetrieve).not.toHaveBeenCalled();
  });

  it("passes a signed-out request's 401 straight through", async () => {
    h.state.ownerId = null;
    expect((await add()).status).toBe(401);
  });

  it("is rate limited per owner", async () => {
    h.state.rateLimitAllowed = false;
    const result = await add();
    expect(result.status).toBe(429);
    expect(result.json.code).toBe("rate_limited");
    expect(h.fns.subscriptionsUpdate).not.toHaveBeenCalled();
  });
});

describe("GET /api/owner/venues/add/quote", () => {
  it("prices the 2nd venue at $75 and takes 'charged today' from Stripe's own preview", async () => {
    table("billing_subscriptions")[0].discount_percent_off = 20;
    table("billing_subscriptions")[0].discount_label = "20% off";

    const result = await quote(`?venueId=${ANCHOR}`);

    expect(result.status).toBe(200);
    expect(result.json.quote).toMatchObject({
      currentVenueCount: 1,
      venueNumber: 2,
      thisVenueCents: 7500,
      newMonthlyListCents: 17500,
      newMonthlyTotalCents: 14000,
      dueTodayCents: 3750,
      discountLabel: "20% off",
    });
    const preview = h.fns.invoicesPreview.mock.calls[0][0] as Row;
    expect(preview).toMatchObject({
      subscription: SUB,
      subscription_details: { items: [{ id: ITEM, quantity: 2 }], proration_behavior: "always_invoice" },
    });
    // Read-only: nothing written, nothing charged.
    expect(ledger()).toHaveLength(0);
    expect(h.fns.subscriptionsUpdate).not.toHaveBeenCalled();
  });

  it("refuses a check-billed (offline) account before calling Stripe", async () => {
    Object.assign(table("billing_subscriptions")[0], { billing_method: "offline", stripe_subscription_id: null });
    const result = await quote();
    expect(result.status).toBe(409);
    expect(result.json.code).toBe("offline_bill");
    expect(h.fns.subscriptionsRetrieve).not.toHaveBeenCalled();
  });
});

describe("POST /api/owner/venues/add — paid", () => {
  it("charges the prorated band price, then puts the venue on the bill and makes it live", async () => {
    const result = await add({ prorationDate: NOW_S - 30, venueId: ANCHOR });

    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({ ok: true, status: "paid", chargedTodayCents: 3750 });
    const venueId = String(result.json.venueId);

    // Created hidden + stamped in one insert, then revealed.
    expect(h.fns.createAdminVenue).toHaveBeenCalledTimes(1);
    const created = h.fns.createAdminVenue.mock.calls[0][0] as Row;
    expect(created).toMatchObject({ name: "Second Bar", state: "NJ", hidden: true, radius: 150 });
    expect(created.selfServeCreatedAt).toEqual(expect.any(String));
    expect(created.checkoutStartedAt).toEqual(created.selfServeCreatedAt);
    expect(venueById(venueId)).toMatchObject({ hidden: false, rehidden_at: null });
    expect(table("venue_owner_venues").some((row) => row.owner_id === OWNER && row.venue_id === venueId)).toBe(true);

    // The one Stripe write: quantity n + 1, prorated, applied only if paid, keyed on the ledger.
    expect(h.fns.subscriptionsUpdate).toHaveBeenCalledTimes(1);
    const [subId, params, options] = h.fns.subscriptionsUpdate.mock.calls[0] as [string, Row, Row];
    expect(subId).toBe(SUB);
    expect(params).toMatchObject({
      items: [{ id: ITEM, quantity: 2 }],
      proration_behavior: "always_invoice",
      payment_behavior: "pending_if_incomplete",
      proration_date: NOW_S - 30,
    });
    expect(options.idempotencyKey).toBe(`venue-add:${OWNER}:confirm-aaaaaaaa`);

    expect(memberships().find((row) => row.venue_id === venueId)).toMatchObject({ subscription_id: BILL, role: "added" });
    expect(ledger()).toHaveLength(1);
    expect(ledger()[0]).toMatchObject({
      status: "paid",
      venue_id: venueId,
      quantity_before: 1,
      quantity_after: 2,
      amount_due_cents: 3750,
      stripe_invoice_id: "in_add_1",
      idempotency_key: `venue-add:${OWNER}:confirm-aaaaaaaa`,
    });

    expect(h.fns.sendVenueAddedEmail).toHaveBeenCalledTimes(1);
    expect(h.fns.sendVenueAddedEmail).toHaveBeenCalledWith({
      toEmail: "pat@example.com",
      ownerName: "Pat",
      venueName: "Second Bar",
      venueCount: 2,
      thisVenueCents: 7500,
      newMonthlyTotalCents: 17500,
      chargedTodayCents: 3750,
    });
    expect(ledger()[0].venue_added_email_sent_at).toEqual(expect.any(String));
  });

  it("ignores a stale or future prorationDate rather than letting the client shrink the charge", async () => {
    await add({ prorationDate: NOW_S - 86400 * 9 });
    expect((h.fns.subscriptionsUpdate.mock.calls[0][1] as Row).proration_date).toBeUndefined();
  });

  it("converges when the invoice.paid webhook lands while the route is still mid-request", async () => {
    h.state.duringUpdate = async () => {
      const invoiceId = String(h.state.subscription.latest_invoice);
      expect((await deliverInvoicePaid(invoiceId)).status).toBe(200);
    };

    const result = await add();

    expect(result.status).toBe(200);
    // ...and a late duplicate delivery afterwards changes nothing.
    expect((await deliverInvoicePaid(String(ledger()[0].stripe_invoice_id))).status).toBe(200);
    expect(memberships().filter((row) => row.role === "added")).toHaveLength(1);
    expect(ledger()[0].status).toBe("paid");
    expect(h.fns.sendVenueAddedEmail).toHaveBeenCalledTimes(1);
    expect(table("billing_invoices")).toHaveLength(1);
  });

  it("releases the email stamp when the send fails, so a later completion can retry it", async () => {
    h.fns.sendVenueAddedEmail.mockImplementation(async () => false);
    await add();
    expect(ledger()[0]).toMatchObject({ status: "paid", venue_added_email_sent_at: null });

    h.fns.sendVenueAddedEmail.mockImplementation(async () => true);
    await deliverInvoicePaid(String(ledger()[0].stripe_invoice_id));
    expect(h.fns.sendVenueAddedEmail).toHaveBeenCalledTimes(2);
    expect(ledger()[0].venue_added_email_sent_at).toEqual(expect.any(String));
  });
});

describe("POST /api/owner/venues/add — declined", () => {
  it("voids the invoice, deletes the hidden venue and tells the partner to update their card", async () => {
    h.state.paymentMode = "decline";

    const result = await add();

    expect(result.status).toBe(402);
    expect(result.json.code).toBe("card_declined");
    expect(h.fns.invoicesVoid).toHaveBeenCalledWith("in_add_1");
    expect(h.state.subscription.pending_update).toBeNull();
    expect(subItem().quantity).toBe(1);
    expect(table("venues").map((row) => row.id)).toEqual([ANCHOR]);
    expect(table("venue_owner_venues")).toHaveLength(1);
    expect(memberships()).toHaveLength(1);
    expect(ledger()[0]).toMatchObject({ status: "failed", venue_id: null, failure_reason: "card_declined: insufficient_funds" });
    expect(h.fns.sendVenueAddedEmail).not.toHaveBeenCalled();

    // Re-sending the same confirm answers the same way and never charges again.
    const again = await add();
    expect(again.status).toBe(402);
    expect(h.fns.subscriptionsUpdate).toHaveBeenCalledTimes(1);
  });

  it("treats a thrown StripeCardError the same way", async () => {
    h.state.paymentMode = "card_error";
    const result = await add();
    expect(result.status).toBe(402);
    expect(table("venues").map((row) => row.id)).toEqual([ANCHOR]);
    expect(ledger()[0].status).toBe("failed");
  });

  it("keeps the (hidden, sweepable) venue when the invoice can't be voided — it could still be paid", async () => {
    h.state.paymentMode = "decline";
    h.state.voidFails = true;

    const result = await add();

    expect(result.status).toBe(402);
    const row = ledger()[0];
    expect(row.status).toBe("failed");
    expect(String(row.failure_reason)).toContain("void-failed");
    expect(venueById(String(row.venue_id))).toMatchObject({ hidden: true });

    // If the partner pays that invoice after all, they get the venue.
    payInvoice(String(row.stripe_invoice_id));
    await deliverInvoicePaid(String(row.stripe_invoice_id));
    expect(ledger()[0].status).toBe("paid");
    expect(venueById(String(row.venue_id))).toMatchObject({ hidden: false });
  });
});

describe("POST /api/owner/venues/add — 3-D Secure", () => {
  it("waits on Stripe's hosted page, then the invoice.paid webhook finishes the add", async () => {
    h.state.paymentMode = "requires_action";

    const first = await add();

    expect(first.status).toBe(202);
    expect(first.json).toMatchObject({ status: "requires_action", hostedInvoiceUrl: "https://invoice.stripe.com/i/in_add_1" });
    const row = ledger()[0];
    expect(row.status).toBe("requires_action");
    const venueId = String(row.venue_id);

    // While waiting: invisible, NOT on any bill, and carrying both stamps — so if this flow ever
    // lost track of it, the abandoned-signup sweep (7-day tier) would reap it.
    expect(venueById(venueId)).toMatchObject({ hidden: true });
    expect(venueById(venueId)?.self_serve_created_at).toEqual(expect.any(String));
    expect(venueById(venueId)?.checkout_started_at).toEqual(expect.any(String));
    const billed = await venueIdsEverBilled([venueId]);
    expect(billed.ok && billed.venueIds.has(venueId)).toBe(false);
    // ...and not the partner's yet: no venue_owner_venues link until it is paid for.
    expect(table("venue_owner_venues").some((link) => link.venue_id === venueId)).toBe(false);
    expect(h.fns.sendVenueAddedEmail).not.toHaveBeenCalled();

    // A poll with the same confirm re-reads Stripe and still says "finish on Stripe's page".
    const poll = await add();
    expect(poll.status).toBe(202);
    expect(poll.json.hostedInvoiceUrl).toBe("https://invoice.stripe.com/i/in_add_1");

    // Another add meanwhile is refused — and is pointed at the unfinished payment, already at the
    // quote (the review screen), before the partner presses Pay.
    const other = await add({ idempotencyKey: "confirm-bbbbbbbb", latitude: 40.2, longitude: -74.2 });
    expect(other.status).toBe(409);
    expect(other.json).toMatchObject({ code: "addition_in_progress", hostedInvoiceUrl: "https://invoice.stripe.com/i/in_add_1" });
    const blockedQuote = await quote();
    expect(blockedQuote.status).toBe(409);
    expect(blockedQuote.json).toMatchObject({ code: "addition_in_progress", hostedInvoiceUrl: "https://invoice.stripe.com/i/in_add_1" });
    expect(h.fns.invoicesPreview).not.toHaveBeenCalled();

    // The partner completes 3-D Secure; Stripe applies the quantity and sends invoice.paid.
    payInvoice(String(row.stripe_invoice_id));
    expect((await deliverInvoicePaid(String(row.stripe_invoice_id))).status).toBe(200);

    expect(ledger()[0].status).toBe("paid");
    expect(venueById(venueId)).toMatchObject({ hidden: false });
    expect(memberships().find((m) => m.venue_id === venueId)).toMatchObject({ role: "added" });
    expect(table("venue_owner_venues").filter((link) => link.venue_id === venueId)).toEqual([
      expect.objectContaining({ owner_id: OWNER }),
    ]);
    expect(h.fns.sendVenueAddedEmail).toHaveBeenCalledTimes(1);

    const after = await add();
    expect(after.status).toBe(200);
    expect(after.json).toMatchObject({ status: "paid", venueId });
    expect(h.fns.subscriptionsUpdate).toHaveBeenCalledTimes(1);
  });

  it("an abandoned 3-D Secure is cleaned up once Stripe voids it, and the address can be added again", async () => {
    h.state.paymentMode = "requires_action";
    await add();
    const stuck = ledger()[0];
    expireInvoice(String(stuck.stripe_invoice_id));

    const settled = await reconcileStaleVenueAdditions({ nowMs: afterLease() });

    expect(settled).toMatchObject({ scanned: 1, failed: 1 });
    expect(ledger()[0]).toMatchObject({ status: "failed", failure_reason: "invoice-void", venue_id: null });
    expect(table("venues").map((row) => row.id)).toEqual([ANCHOR]);

    h.state.paymentMode = "succeed";
    const retry = await add({ idempotencyKey: "confirm-cccccccc" });
    expect(retry.status).toBe(200);
    expect(subItem().quantity).toBe(2);
  });

  it("the daily reconciler completes a paid 3-D Secure whose webhook never arrived", async () => {
    h.state.paymentMode = "requires_action";
    await add();
    payInvoice(String(ledger()[0].stripe_invoice_id));

    const settled = await reconcileStaleVenueAdditions({ nowMs: afterLease() });

    expect(settled).toMatchObject({ scanned: 1, paid: 1 });
    expect(ledger()[0].status).toBe("paid");
    expect(venueById(String(ledger()[0].venue_id))).toMatchObject({ hidden: false });
  });
});

describe("POST /api/owner/venues/add — concurrency and idempotency", () => {
  it("a double-tap (same key, at once) creates one venue and charges once", async () => {
    const [a, b] = await Promise.all([add(), add()]);

    expect(h.fns.createAdminVenue).toHaveBeenCalledTimes(1);
    expect(h.fns.subscriptionsUpdate).toHaveBeenCalledTimes(1);
    expect(ledger()).toHaveLength(1);
    expect([a.status, b.status].sort()).toEqual([200, 202]);
    expect([a.json.status, b.json.status].sort()).toEqual(["paid", "processing"]);

    const later = await add();
    expect(later.json).toMatchObject({ status: "paid", venueId: ledger()[0].venue_id });
    expect(h.fns.subscriptionsUpdate).toHaveBeenCalledTimes(1);
  });

  it("two different adds at once: one proceeds, the other is told one is already in progress", async () => {
    const [a, b] = await Promise.all([
      add({ idempotencyKey: "confirm-11111111" }),
      add({ idempotencyKey: "confirm-22222222", venueName: "Third Bar", latitude: 40.3, longitude: -74.3 }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect([a.json.code, b.json.code]).toContain("addition_in_progress");
    expect(h.fns.subscriptionsUpdate).toHaveBeenCalledTimes(1);
    expect(subItem().quantity).toBe(2);
  });

  it("the next add is priced off the new count (3rd venue, quantity 2 → 3)", async () => {
    await add();
    const third = await add({ idempotencyKey: "confirm-33333333", venueName: "Third Bar", latitude: 40.3, longitude: -74.3 });
    expect(third.status).toBe(200);
    expect((h.fns.subscriptionsUpdate.mock.calls[1][1] as Row).items).toEqual([{ id: ITEM, quantity: 3 }]);
    expect(ledger()[1]).toMatchObject({ quantity_before: 2, quantity_after: 3 });
  });
});

describe("POST /api/owner/venues/add — Stripe answers ambiguously", () => {
  it("leaves the add pending; if Stripe never applied it, the reconciler fails it and removes the venue", async () => {
    h.state.paymentMode = "connection_error";

    const result = await add();

    expect(result.status).toBe(503);
    expect(result.json.code).toBe("payment_unconfirmed");
    expect(ledger()[0].status).toBe("pending");
    const venueId = String(ledger()[0].venue_id);
    expect(venueById(venueId)).toMatchObject({ hidden: true });

    // Inside the lease the same confirm is "still processing", never a second charge.
    const poll = await add();
    expect(poll.json.status).toBe("processing");

    const settled = await reconcileStaleVenueAdditions({ nowMs: afterLease() });
    expect(settled.failed).toBe(1);
    expect(ledger()[0]).toMatchObject({ status: "failed", failure_reason: "stripe-update-not-applied" });
    expect(venueById(venueId)).toBeUndefined();
  });

  it("…and if Stripe did apply it (paid), the reconciler completes it", async () => {
    h.state.paymentMode = "applied_then_connection_error";

    expect((await add()).status).toBe(503);
    const settled = await reconcileStaleVenueAdditions({ nowMs: afterLease() });

    expect(settled.paid).toBe(1);
    expect(ledger()[0]).toMatchObject({ status: "paid", stripe_invoice_id: "in_add_1" });
    expect(venueById(String(ledger()[0].venue_id))).toMatchObject({ hidden: false });
    expect(h.fns.sendVenueAddedEmail).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/owner/venues/add — refusals (nothing created, nothing charged)", () => {
  const expectNothingHappened = () => {
    expect(h.fns.createAdminVenue).not.toHaveBeenCalled();
    expect(h.fns.subscriptionsUpdate).not.toHaveBeenCalled();
    expect(table("venues").map((row) => row.id)).toEqual(expect.arrayContaining([ANCHOR]));
  };

  it.each([
    ["past_due", { status: "past_due" }, "bill_not_active"],
    ["cancelled", { status: "cancelled" }, "bill_not_active"],
    ["cancel scheduled", { cancel_at_period_end: true }, "cancel_scheduled"],
    ["check-billed", { billing_method: "offline", stripe_subscription_id: null }, "offline_bill"],
  ])("an unhealthy bill (%s) is refused", async (_label, patch, code) => {
    Object.assign(table("billing_subscriptions")[0], patch);
    const result = await add();
    expect(result.status).toBe(409);
    expect(result.json.code).toBe(code);
    expectNothingHappened();
    expect(ledger()).toHaveLength(0);
  });

  it.each([
    ["Stripe says cancel_at_period_end", () => (h.state.subscription.cancel_at_period_end = true), "cancel_scheduled"],
    ["Stripe says past_due", () => (h.state.subscription.status = "past_due"), "bill_not_active"],
    [
      "a negotiated custom rate",
      () => Object.assign(subItem().price as Row, { id: "price_custom", lookup_key: "custom_monthly_9000", billing_scheme: "per_unit" }),
      "custom_rate",
    ],
    [
      "still on the flat $100 price",
      () => Object.assign(subItem().price as Row, { id: "price_flat", lookup_key: null, billing_scheme: "per_unit" }),
      "billing_state",
    ],
    ["a subscription schedule", () => (h.state.subscription.schedule = "sub_sched_1"), "billing_state"],
  ])("a bill Stripe can't add to (%s) is refused", async (_label, mutate, code) => {
    mutate();
    const result = await add();
    expect(result.status).toBe(409);
    expect(result.json.code).toBe(code);
    expectNothingHappened();
  });

  it("someone else's pending update on the subscription is never overwritten", async () => {
    h.state.subscription.pending_update = { expires_at: NOW_S + 3600, subscription_items: [] };
    const result = await add();
    expect(result.json.code).toBe("billing_state");
    expectNothingHappened();
    expect(ledger()[0]).toMatchObject({ status: "failed", failure_reason: "refused:billing_state" });
  });

  it("refuses when Stripe's quantity disagrees with the venues on the bill (drift is never 'fixed')", async () => {
    subItem().quantity = 2;
    const result = await add();
    expect(result.status).toBe(409);
    expect(result.json.code).toBe("billing_state");
    expectNothingHappened();
  });

  it("refuses a partner with no bill, and a bill that belongs to another owner", async () => {
    h.state.db.tables.billing_subscriptions = [];
    h.state.db.tables.billing_subscription_venues = [];
    expect((await add()).json.code).toBe("no_bill");

    h.state.db = freshDb();
    table("billing_subscriptions")[0].owner_id = "owner-2";
    const other = await add();
    expect(other.status).toBe(403);
    expect(other.json.code).toBe("not_bill_owner");
    expectNothingHappened();
  });

  it.each([
    ["another partner's venue", { hidden: false, self_serve_created_at: null }, "owner-2", "venue_exists"],
    ["the partner's own venue", { hidden: false, self_serve_created_at: null }, OWNER, "venue_already_yours"],
    ["an admin-hidden venue / internal room", { hidden: true, self_serve_created_at: null }, null, "venue_unavailable"],
  ])("a duplicate address (%s) is refused", async (_label, shape, linkedOwner, code) => {
    table("venues").push({ id: "venue-there", name: "Already There", latitude: 40.1001, longitude: -74.1001, ...shape });
    if (linkedOwner) table("venue_owner_venues").push({ id: "link-there", owner_id: linkedOwner, venue_id: "venue-there" });

    const result = await add();

    expect(result.status).toBe(409);
    expect(result.json.code).toBe(code);
    expect(result.json.venue).toMatchObject({ id: "venue-there", name: "Already There" });
    expectNothingHappened();
    expect(ledger()[0]).toMatchObject({ status: "failed", failure_reason: `refused:${code}` });
    // ...and re-sending that same confirm gives the same answer.
    expect((await add()).json.code).toBe(code);
  });

  it("refuses the (0, 0) placeholder point", async () => {
    const result = await add({ latitude: 0, longitude: 0 });
    expect(result.status).toBe(400);
    expectNothingHappened();
  });

  it("applies signup's address and geofence rules verbatim", async () => {
    const radius = await add({ radius: 500 });
    expect(radius.status).toBe(400);
    expect(radius.json.error).toBe("The geofence must be between 50 and 200 m.");

    const street = await add({ street: "" });
    expect(street.status).toBe(400);
    expect(street.json.error).toBe("Add a street, city, state and ZIP so players see where this is.");

    const pin = await add({ latitude: null, longitude: null });
    expect(pin.status).toBe(400);
    expectNothingHappened();
  });

  it("requires a well-formed idempotency key", async () => {
    for (const idempotencyKey of [undefined, "", "short", "has spaces in it!!"]) {
      expect((await add({ idempotencyKey })).status).toBe(400);
    }
    expectNothingHappened();
  });

  it("refuses a venueId the partner does not hold", async () => {
    const result = await add({ venueId: "venue-not-mine" });
    expect(result.status).toBe(403);
    expectNothingHappened();
  });
});

describe("Stripe webhook — only an add's invoice reaches the add ledger", () => {
  it("a monthly renewal's invoice.paid never queries billing_venue_additions", async () => {
    h.state.invoices.set("in_renewal", { id: "in_renewal", status: "paid", amount_paid: 10000, parent: { subscription_details: { subscription: SUB } } });
    const before = h.state.db.fromCalls.length;
    expect((await deliverInvoicePaid("in_renewal", "subscription_cycle")).status).toBe(200);
    expect(h.state.db.fromCalls.slice(before)).not.toContain("billing_venue_additions");
  });
});

describe("pure helpers", () => {
  it("prorationDueCents: an always_invoice preview's amount_due, or just its proration lines if Stripe ever adds more", async () => {
    const { prorationDueCents } = await import("@/lib/venueAddition");
    const proration = (amount: number) => ({ amount, parent: { subscription_item_details: { proration: true } } });
    const regular = (amount: number) => ({ amount, parent: { subscription_item_details: { proration: false } } });
    const shape = (amountDue: number, lines: Row[]) =>
      ({ amount_due: amountDue, lines: { data: lines } }) as unknown as Parameters<typeof prorationDueCents>[0];

    // Shape verified live 2026-10-11 (read-only preview, Pacific Street): two proration lines.
    expect(prorationDueCents(shape(2268, [proration(-3024), proration(5292)]))).toBe(2268);
    expect(prorationDueCents(shape(19768, [proration(-3024), proration(5292), regular(10000), regular(7500)]))).toBe(2268);
    expect(prorationDueCents(shape(0, []))).toBe(0);
  });

  it("acceptableProrationDate: only recent, in-period, not-future quote timestamps", async () => {
    const { acceptableProrationDate } = await import("@/lib/venueAddition");
    const nowMs = NOW_S * 1000;
    const periodStart = NOW_S - 10 * 86400;
    expect(acceptableProrationDate(NOW_S - 60, periodStart, nowMs)).toBe(NOW_S - 60);
    expect(acceptableProrationDate(NOW_S + 30, periodStart, nowMs)).toBe(NOW_S + 30);
    expect(acceptableProrationDate(NOW_S + 3600, periodStart, nowMs)).toBeNull();
    expect(acceptableProrationDate(NOW_S - 16 * 60, periodStart, nowMs)).toBeNull();
    expect(acceptableProrationDate(NOW_S - 60, NOW_S, nowMs)).toBeNull();
    expect(acceptableProrationDate("123", periodStart, nowMs)).toBeNull();
    expect(acceptableProrationDate(NOW_S + 0.5, periodStart, nowMs)).toBeNull();
  });

  it("classifyInvoice: paid / void / 3-D Secure / declined / no attempt", async () => {
    const { classifyInvoice } = await import("@/lib/venueAddition");
    const invoice = (status: string, intent: Row | null) =>
      ({
        status,
        amount_due: 3750,
        amount_paid: status === "paid" ? 3750 : 0,
        hosted_invoice_url: "https://invoice.stripe.com/i/x",
        payments: { data: intent ? [{ created: 1, payment: { type: "payment_intent", payment_intent: intent } }] : [] },
      }) as unknown as Parameters<typeof classifyInvoice>[0];

    expect(classifyInvoice(invoice("paid", null))).toEqual({ kind: "paid", amountPaidCents: 3750 });
    expect(classifyInvoice(invoice("void", null))).toEqual({ kind: "void" });
    expect(classifyInvoice(invoice("uncollectible", null))).toEqual({ kind: "void" });
    expect(classifyInvoice(invoice("open", { status: "requires_action" }))).toMatchObject({
      kind: "requires_action",
      hostedInvoiceUrl: "https://invoice.stripe.com/i/x",
    });
    expect(
      classifyInvoice(invoice("open", { status: "requires_payment_method", last_payment_error: { decline_code: "expired_card" } }))
    ).toMatchObject({ kind: "declined", reason: "expired_card" });
    expect(classifyInvoice(invoice("open", null))).toMatchObject({ kind: "declined", reason: "no_payment_attempt" });
    expect(classifyInvoice(invoice("draft", null))).toMatchObject({ kind: "unknown" });
  });

  it("additionIdempotencyKey scopes the client's key to the owner", async () => {
    const { additionIdempotencyKey, isValidClientKey } = await import("@/lib/venueAddition");
    expect(additionIdempotencyKey("owner-a", "k-12345678")).not.toBe(additionIdempotencyKey("owner-b", "k-12345678"));
    expect(isValidClientKey(crypto.randomUUID())).toBe(true);
    expect(isValidClientKey("x".repeat(65))).toBe(false);
  });
});

describe("addVenueToBill (lib/venueBilling.ts) — the only writer of non-anchor membership rows", () => {
  it("inserts once, is a no-op on repeat, and never moves or revives a venue", async () => {
    const { addVenueToBill } = await import("@/lib/venueBilling");
    table("venues").push({ id: "venue-x" }, { id: "venue-y" }, { id: "venue-z" });

    expect(await addVenueToBill(BILL, "venue-x", "added")).toEqual({ ok: true, inserted: true });
    expect(await addVenueToBill(BILL, "venue-x", "added")).toEqual({ ok: true, inserted: false });
    expect(memberships().filter((row) => row.venue_id === "venue-x")).toHaveLength(1);

    memberships().push({ id: "m-y", subscription_id: "bill-other", venue_id: "venue-y", role: "anchor", removed_at: null });
    expect(await addVenueToBill(BILL, "venue-y", "added")).toEqual({ ok: false, error: "venue-on-another-bill" });

    memberships().push({ id: "m-z", subscription_id: BILL, venue_id: "venue-z", role: "added", removed_at: "2026-10-01T00:00:00Z" });
    expect(await addVenueToBill(BILL, "venue-z", "added")).toEqual({ ok: false, error: "venue-removed-from-bill" });
  });
});
