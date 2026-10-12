import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InMemoryDb, Row } from "@/tests/helpers/inMemorySupabase";

/**
 * Multi-venue billing Phase 5 — Remove at end of month, Undo, the daily removal job, and "Add back"
 * (docs/multi-venue-volume-billing-plan.md §4.4), end to end.
 *
 * The remove route, the add route, the billing GET and the daily cron run against ONE in-memory
 * database and ONE simulated Stripe subscription. The three RPCs are JS ports of
 * supabase/migrations/20261011210033_venue_bill_changes.sql (whose SQL is proven on PGlite by
 * scripts/test-multi-venue-billing-sql.cjs). Stripe: `proration_behavior: "none"` applies the new
 * quantity at once; an add (`always_invoice` + `pending_if_incomplete`) pays or declines per `paymentMode`.
 */

const ANCHOR = "venue-anchor";
const SECOND = "venue-second";
const THIRD = "venue-third";
const OWNER = "owner-1";
const BILL = "bill-1";
const SUB = "sub_1";
const ITEM = "si_1";
const NOW_S = Math.floor(Date.now() / 1000);
const PERIOD_END_S = NOW_S + 20 * 86400;
const PERIOD_END_ISO = new Date(PERIOD_END_S * 1000).toISOString();

const h = vi.hoisted(() => {
  const state = {
    flag: true,
    ownerId: "owner-1" as string | null,
    db: null as unknown as InMemoryDb,
    paymentMode: "succeed" as "succeed" | "decline",
    updateError: null as null | Record<string, unknown>,
    subscription: {} as Record<string, unknown>,
    invoices: new Map<string, Record<string, unknown>>(),
    replays: new Map<string, unknown>(),
    invoiceCounter: 0,
  };
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const fns = {
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
vi.mock("@/lib/multiVenueBilling", async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return { ...actual, isMultiVenueBillingEnabled: () => h.state.flag };
});
vi.mock("@/lib/stripe", async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    stripe: {
      subscriptions: { retrieve: h.fns.subscriptionsRetrieve, update: h.fns.subscriptionsUpdate },
      invoices: {
        retrieve: h.fns.invoicesRetrieve,
        voidInvoice: h.fns.invoicesVoid,
        createPreview: h.fns.invoicesPreview,
        list: vi.fn(async () => ({ data: [] })),
      },
    },
  };
});
vi.mock("@/lib/requireOwnerAuth", () => ({
  requireOwnerAuth: vi.fn(async () => {
    if (!h.state.ownerId) throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const venueIds = (h.state.db.tables.venue_owner_venues as Row[])
      .filter((row) => row.owner_id === h.state.ownerId)
      .map((row) => String(row.venue_id));
    return { ownerId: h.state.ownerId, venueIds };
  }),
}));
vi.mock("@/lib/rateLimit", async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return { ...actual, rateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })) };
});
vi.mock("@/lib/admin", () => ({ createAdminVenue: h.fns.createAdminVenue }));
vi.mock("@/lib/email/sendVenueAddedEmail", () => ({ sendVenueAddedEmail: h.fns.sendVenueAddedEmail }));
vi.mock("@/lib/venueVisibilitySync", () => ({
  reconcileLapsedVenues: vi.fn(async () => ({ stub: true })),
  repairMissedVenueReveals: vi.fn(async () => ({ stub: true })),
}));
vi.mock("@/lib/cronAuth", () => ({ isCronAuthorized: () => true }));

import { createInMemoryDb } from "@/tests/helpers/inMemorySupabase";
import { POST as removePOST } from "@/app/api/owner/venues/remove/route";
import { POST as addPOST } from "@/app/api/owner/venues/add/route";
import { GET as billingGET } from "@/app/api/owner/billing/route";
import { POST as cronPOST } from "@/app/api/cron/billing/route";
import { VENUE_ADDITION_LEASE_MS } from "@/lib/venueAddition";
import { billedVenueCount, venueIdsOnBill } from "@/lib/venueBilling";
import { applyDueVenueRemovals, reconcileStaleVenueChanges } from "@/lib/venueRemoval";
import { CUSTOM_PER_VENUE_LOOKUP_PREFIX, GRADUATED_PRICE_LOOKUP_KEY, nextVenuePriceCents } from "@/lib/venuePricing";

// --- RPC ports -------------------------------------------------------------------------------------

const tbl = (db: InMemoryDb, name: string) => db.tables[name] as Row[];
const billed = (row: Row) => !row.removed_at && !row.remove_at;

const claimVenueBillChange = (args: Row, db: InMemoryDb) => {
  const key = String(args.p_idempotency_key ?? "").trim();
  const venue = String(args.p_venue_id ?? "").trim();
  const action = args.p_action;
  const removeAt = args.p_remove_at as string | null;
  if (!key || !venue || !args.p_owner_id || !args.p_subscription_id || (action !== "remove" && action !== "undo")) {
    return { data: [{ outcome: "invalid" }], error: null };
  }
  if (action === "remove" && (!removeAt || Date.parse(removeAt) <= Date.now())) return { data: [{ outcome: "invalid" }], error: null };
  const bill = tbl(db, "billing_subscriptions").find((row) => row.id === args.p_subscription_id);
  if (!bill) return { data: [{ outcome: "no_bill" }], error: null };
  if (bill.owner_id !== args.p_owner_id) return { data: [{ outcome: "not_owner" }], error: null };
  const changes = tbl(db, "billing_venue_changes");
  const shape = (outcome: string, row: Row) => ({ data: [{ outcome, change_id: row.id }], error: null });
  const existing = changes.find((row) => row.idempotency_key === key);
  if (existing) {
    if (existing.subscription_id !== bill.id || existing.owner_id !== args.p_owner_id || existing.venue_id !== venue || existing.action !== action) {
      return { data: [{ outcome: "key_conflict", change_id: null }], error: null };
    }
    return shape("existing", existing);
  }
  if (tbl(db, "billing_venue_additions").some((row) => row.subscription_id === bill.id && ["pending", "requires_action"].includes(String(row.status)))) {
    return { data: [{ outcome: "busy_addition" }], error: null };
  }
  const busy = changes.find((row) => row.subscription_id === bill.id && row.status === "pending");
  if (busy) return shape("busy_change", busy);
  const members = tbl(db, "billing_subscription_venues");
  const member = members.find((row) => row.venue_id === venue && row.subscription_id === bill.id && !row.removed_at);
  if (!member) return { data: [{ outcome: "not_on_bill" }], error: null };
  const count = members.filter((row) => row.subscription_id === bill.id && billed(row)).length;
  const stamp = new Date().toISOString();
  const base = { id: crypto.randomUUID(), idempotency_key: key, owner_id: args.p_owner_id, subscription_id: bill.id, venue_id: venue, action, status: "pending", failure_reason: null, created_at: stamp, updated_at: stamp };
  let row: Row;
  if (action === "remove") {
    if (member.remove_at) return { data: [{ outcome: "already_leaving" }], error: null };
    if (count < 2) return { data: [{ outcome: "last_venue" }], error: null };
    let newAnchor: string | null = null;
    if (bill.venue_id === venue) {
      const candidate = members
        .filter((m) => m.subscription_id === bill.id && billed(m) && m.venue_id !== venue)
        .filter((m) => !tbl(db, "billing_subscriptions").some((b) => b.venue_id === m.venue_id))
        .sort((a, b) => String(a.added_at).localeCompare(String(b.added_at)) || String(a.venue_id).localeCompare(String(b.venue_id)))[0];
      if (!candidate) return { data: [{ outcome: "no_new_anchor" }], error: null };
      newAnchor = String(candidate.venue_id);
    }
    row = { ...base, quantity_before: count, quantity_after: count - 1, remove_at: removeAt, new_anchor_venue_id: newAnchor };
  } else {
    if (!member.remove_at) return { data: [{ outcome: "not_leaving" }], error: null };
    if (Date.parse(String(member.remove_at)) <= Date.now()) return { data: [{ outcome: "too_late" }], error: null };
    row = { ...base, quantity_before: count, quantity_after: count + 1, remove_at: null, new_anchor_venue_id: null };
  }
  changes.push(row);
  return shape("claimed", row);
};

const finishVenueBillChange = (args: Row, db: InMemoryDb) => {
  const row = tbl(db, "billing_venue_changes").find((r) => r.id === args.p_change_id);
  if (!row) return { data: [{ outcome: "not_found" }], error: null };
  if (row.status !== "pending") return { data: [{ outcome: "already", change_status: row.status }], error: null };
  row.updated_at = new Date().toISOString();
  if (args.p_outcome === "failed") {
    row.status = "failed";
    row.failure_reason = args.p_failure_reason ?? "failed";
    return { data: [{ outcome: "failed", change_status: "failed" }], error: null };
  }
  let drift: string | null = null;
  const member = tbl(db, "billing_subscription_venues").find((m) => m.venue_id === row.venue_id && m.subscription_id === row.subscription_id && !m.removed_at);
  if (row.action === "remove") {
    if (member && !member.remove_at) member.remove_at = row.remove_at;
    else drift = "membership-not-billed";
    if (row.new_anchor_venue_id) {
      const bill = tbl(db, "billing_subscriptions").find((b) => b.id === row.subscription_id && b.venue_id === row.venue_id);
      if (bill) bill.venue_id = row.new_anchor_venue_id;
    }
  } else if (member && member.remove_at) member.remove_at = null;
  else drift = "membership-not-leaving";
  row.status = "done";
  row.failure_reason = drift;
  return { data: [{ outcome: drift ? "drift" : "done", change_status: "done" }], error: null };
};

const claimVenueAddition = (args: Row, db: InMemoryDb) => {
  const key = String(args.p_idempotency_key ?? "").trim();
  const bill = tbl(db, "billing_subscriptions").find((row) => row.id === args.p_subscription_id);
  if (!bill) return { data: [{ outcome: "no_bill" }], error: null };
  if (bill.owner_id !== args.p_owner_id) return { data: [{ outcome: "not_owner" }], error: null };
  const ledger = tbl(db, "billing_venue_additions");
  const shape = (outcome: string, row: Row) => ({ data: [{ outcome, addition_id: row.id, addition_status: row.status }], error: null });
  const existing = ledger.find((row) => row.idempotency_key === key);
  if (existing) return shape("existing", existing);
  if (tbl(db, "billing_venue_changes").some((row) => row.subscription_id === bill.id && row.status === "pending")) {
    return { data: [{ outcome: "busy", addition_id: null }], error: null };
  }
  const busy = ledger.find((row) => row.subscription_id === bill.id && ["pending", "requires_action"].includes(String(row.status)));
  if (busy) return shape("busy", busy);
  const count = tbl(db, "billing_subscription_venues").filter((row) => row.subscription_id === bill.id && billed(row)).length;
  const stamp = new Date().toISOString();
  const row: Row = {
    id: crypto.randomUUID(), idempotency_key: key, owner_id: args.p_owner_id, subscription_id: bill.id, venue_id: null,
    venue_name: String(args.p_venue_name ?? "").trim() || null, status: "pending", stripe_invoice_id: null,
    quantity_before: count, quantity_after: count + 1, amount_due_cents: null, failure_reason: null,
    venue_added_email_sent_at: null, created_at: stamp, updated_at: stamp,
  };
  ledger.push(row);
  return shape("claimed", row);
};

// --- Fixture ---------------------------------------------------------------------------------------

const venue = (id: string, name: string, extra: Row = {}): Row => ({
  id, name, latitude: 40, longitude: -74, hidden: false, self_serve_created_at: null, rehidden_at: null, ...extra,
});

const freshDb = () =>
  createInMemoryDb(
    {
      venues: [venue(ANCHOR, "Anchor Bar"), venue(SECOND, "Second Bar", { self_serve_created_at: "2026-10-01T00:00:00Z" }), venue(THIRD, "Third Bar")],
      venue_owners: [{ id: OWNER, name: "Pat", email: "pat@example.com" }],
      venue_owner_venues: [ANCHOR, SECOND, THIRD].map((id) => ({ id: `link-${id}`, owner_id: OWNER, venue_id: id })),
      billing_subscriptions: [
        {
          id: BILL, venue_id: ANCHOR, owner_id: OWNER, status: "active", billing_method: "stripe", stripe_subscription_id: SUB,
          cancel_at_period_end: false, amount_cents: 25000, quantity: 3, plan_type: "monthly",
          current_period_start: null, current_period_end: PERIOD_END_ISO, created_at: "2026-09-01T00:00:00Z",
          discount_label: null, discount_percent_off: null, discount_amount_off_cents: null, discount_ends_at: null,
        },
      ],
      billing_subscription_venues: [
        { id: "m-anchor", subscription_id: BILL, venue_id: ANCHOR, role: "anchor", added_at: "2026-09-01T00:00:00Z", remove_at: null, removed_at: null },
        { id: "m-second", subscription_id: BILL, venue_id: SECOND, role: "added", added_at: "2026-10-01T00:00:00Z", remove_at: null, removed_at: null },
        { id: "m-third", subscription_id: BILL, venue_id: THIRD, role: "admin", added_at: "2026-10-02T00:00:00Z", remove_at: null, removed_at: null },
      ],
      billing_venue_additions: [],
      billing_venue_changes: [],
      billing_invoices: [],
    },
    {
      billing_venue_additions: { unique: ["idempotency_key"], timestamps: true },
      billing_venue_changes: { unique: ["idempotency_key"], timestamps: true },
      billing_subscription_venues: { unique: ["venue_id"] },
      venue_owner_venues: { unique: ["venue_id"] },
    },
    [
      { table: "venue_owner_venues", column: "venue_id", references: { table: "venues", column: "id" }, onDelete: "cascade" },
      { table: "billing_subscription_venues", column: "venue_id", references: { table: "venues", column: "id" }, onDelete: "cascade" },
    ],
    {
      claim_venue_bill_change: claimVenueBillChange,
      finish_venue_bill_change: finishVenueBillChange,
      claim_venue_addition: claimVenueAddition,
    }
  );

const freshSubscription = () => ({
  id: SUB, object: "subscription", status: "active", customer: "cus_1", cancel_at_period_end: false, cancel_at: null,
  collection_method: "charge_automatically", schedule: null, pending_update: null as null | Row,
  metadata: { venueId: ANCHOR, ownerId: OWNER }, latest_invoice: "in_previous", discounts: [],
  items: {
    data: [
      {
        id: ITEM, quantity: 3, current_period_start: NOW_S - 10 * 86400, current_period_end: PERIOD_END_S,
        price: { id: "price_graduated", lookup_key: GRADUATED_PRICE_LOOKUP_KEY, billing_scheme: "tiered", tiers_mode: "graduated", unit_amount: null },
      },
    ],
  },
});

const subItem = () => (h.state.subscription.items as { data: Row[] }).data[0];

/**
 * What the quote would have said this venue costs: the next band on the graduated Price, or the flat
 * amount of a `custom_monthly_` Price. Read at call time, as a client that just quoted would send it.
 */
const quotedNow = (): number => {
  const item = subItem();
  const price = item.price as Row;
  return String(price.lookup_key ?? "").startsWith(CUSTOM_PER_VENUE_LOOKUP_PREFIX) && typeof price.unit_amount === "number"
    ? price.unit_amount
    : nextVenuePriceCents(item.quantity as number);
};

const installStripe = () => {
  h.fns.subscriptionsRetrieve.mockImplementation(async () => h.clone(h.state.subscription));
  h.fns.subscriptionsUpdate.mockImplementation(
    async (_id: string, params: { items: Array<{ quantity: number }>; proration_behavior: string; metadata?: Row }, options: { idempotencyKey: string }) => {
      const replay = h.state.replays.get(options.idempotencyKey);
      if (replay) return h.clone(replay);
      if (h.state.updateError) throw Object.assign(new Error(String(h.state.updateError.message ?? "stripe error")), h.state.updateError);
      const quantity = params.items[0].quantity;
      if (params.proration_behavior === "none") {
        subItem().quantity = quantity;
        if (params.metadata) h.state.subscription.metadata = { ...(h.state.subscription.metadata as Row), ...params.metadata };
        const response = h.clone(h.state.subscription);
        h.state.replays.set(options.idempotencyKey, response);
        return h.clone(response);
      }
      // An add: prorated invoice, pending_if_incomplete.
      h.state.invoiceCounter += 1;
      const declined = h.state.paymentMode === "decline";
      const invoice = {
        id: `in_add_${h.state.invoiceCounter}`, object: "invoice", status: declined ? "open" : "paid", amount_due: 3750,
        amount_paid: declined ? 0 : 3750, billing_reason: "subscription_update", hosted_invoice_url: "https://invoice.stripe.com/i/x",
        payments: { data: [{ created: NOW_S, payment: { type: "payment_intent", payment_intent: { id: "pi", status: declined ? "requires_payment_method" : "succeeded", last_payment_error: declined ? { code: "card_declined" } : null } } }] },
      };
      h.state.invoices.set(invoice.id, invoice);
      h.state.subscription.latest_invoice = invoice.id;
      if (declined) h.state.subscription.pending_update = { subscription_items: [{ id: ITEM, quantity }] };
      else subItem().quantity = quantity;
      const response = { ...h.clone(h.state.subscription), latest_invoice: h.clone(invoice) };
      h.state.replays.set(options.idempotencyKey, response);
      return h.clone(response);
    }
  );
  h.fns.invoicesRetrieve.mockImplementation(async (id: string) => h.clone(h.state.invoices.get(id)));
  h.fns.invoicesVoid.mockImplementation(async (id: string) => {
    const invoice = h.state.invoices.get(id) as Row;
    invoice.status = "void";
    h.state.subscription.pending_update = null;
    return h.clone(invoice);
  });
  h.fns.invoicesPreview.mockImplementation(async () => ({ amount_due: 3750, lines: { data: [{ amount: 3750, parent: { subscription_item_details: { proration: true } } }] } }));
};

const post = async (handler: (r: Request) => Promise<Response>, url: string, body: Row) => {
  const response = await handler(new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  return { status: response.status, json: (await response.json()) as Row };
};
let keyCounter = 0;
const nextKey = () => `change-key-${String(++keyCounter).padStart(4, "0")}`;
const remove = (venueId: string, extra: Row = {}) =>
  post(removePOST, "http://localhost/api/owner/venues/remove", { venueId, idempotencyKey: nextKey(), ...extra });
const undo = (venueId: string, extra: Row = {}) => remove(venueId, { action: "undo", ...extra });
const member = (venueId: string) => tbl(h.state.db, "billing_subscription_venues").find((row) => row.venue_id === venueId) as Row;
const venueRow = (venueId: string) => tbl(h.state.db, "venues").find((row) => row.id === venueId) as Row;
const anchorVenue = () => (tbl(h.state.db, "billing_subscriptions")[0] as Row).venue_id;
const stripeQuantity = () => subItem().quantity;
/** Move a membership's leave date into the past (the paid period ended). */
const expire = (venueId: string) => {
  member(venueId).remove_at = new Date(Date.now() - 60_000).toISOString();
};

beforeEach(() => {
  vi.clearAllMocks();
  h.state.flag = true;
  h.state.ownerId = OWNER;
  h.state.db = freshDb();
  h.state.paymentMode = "succeed";
  h.state.updateError = null;
  h.state.subscription = freshSubscription();
  h.state.invoices = new Map();
  h.state.replays = new Map();
  h.state.invoiceCounter = 0;
  installStripe();
});

// --- Tests -----------------------------------------------------------------------------------------

describe("Remove at end of month", () => {
  it("lowers Stripe's quantity with no proration and schedules the venue to leave at the period end", async () => {
    const { status, json } = await remove(SECOND);
    expect(status).toBe(200);
    expect(json.change).toEqual({ action: "remove", venueId: SECOND, removeAt: PERIOD_END_ISO, billedVenueCount: 2 });
    const [, params, options] = h.fns.subscriptionsUpdate.mock.calls[0];
    expect(params).toEqual({ items: [{ id: ITEM, quantity: 2 }], proration_behavior: "none" });
    expect(String(options.idempotencyKey)).toMatch(/^venue-change:owner-1:/);
    expect(stripeQuantity()).toBe(2);
    expect(member(SECOND).remove_at).toBe(PERIOD_END_ISO);
    expect(member(SECOND).removed_at).toBeNull();
    // Still live for players until the period ends; still covered, no longer billed.
    expect(venueRow(SECOND).hidden).toBe(false);
    expect(await billedVenueCount(BILL)).toEqual({ ok: true, count: 2 });
    const covered = await venueIdsOnBill(BILL);
    expect(covered.ok ? covered.venueIds : []).toContain(SECOND);
    expect(h.fns.invoicesPreview).not.toHaveBeenCalled();
  });

  it("the same key twice is one change", async () => {
    const first = await remove(SECOND, { idempotencyKey: "same-key-0001" });
    const second = await remove(SECOND, { idempotencyKey: "same-key-0001" });
    expect(first.json.change).toEqual(second.json.change);
    expect(h.fns.subscriptionsUpdate).toHaveBeenCalledTimes(1);
    expect(tbl(h.state.db, "billing_venue_changes")).toHaveLength(1);
  });

  it("removing the anchor moves the bill's anchor (database AND Stripe metadata) to another billed venue", async () => {
    const { status, json } = await remove(ANCHOR);
    expect(status).toBe(200);
    expect(json.change).toMatchObject({ action: "remove", venueId: ANCHOR, billedVenueCount: 2 });
    expect(h.fns.subscriptionsUpdate.mock.calls[0][1]).toEqual({
      items: [{ id: ITEM, quantity: 2 }],
      proration_behavior: "none",
      metadata: { venueId: SECOND },
    });
    expect(anchorVenue()).toBe(SECOND);
    expect((h.state.subscription.metadata as Row).venueId).toBe(SECOND);
    expect(member(ANCHOR).remove_at).toBe(PERIOD_END_ISO);
  });

  it("refuses the last billed venue (Cancel is that path), already-leaving venues, and venues not on the bill", async () => {
    expect((await remove(SECOND)).status).toBe(200);
    expect((await remove(SECOND)).json.code).toBe("already_leaving");
    expect((await remove(THIRD)).status).toBe(200);
    const last = await remove(ANCHOR);
    expect(last.status).toBe(409);
    expect(last.json.code).toBe("last_venue");
    expect(stripeQuantity()).toBe(1);
    expect((await remove("venue-not-mine")).json.code).toBe("forbidden");
  });

  it("refuses while an add is in flight, and an add is refused while a change is in flight", async () => {
    tbl(h.state.db, "billing_venue_additions").push({ id: "a1", idempotency_key: "k", subscription_id: BILL, owner_id: OWNER, status: "requires_action", updated_at: new Date().toISOString(), created_at: new Date().toISOString() });
    const blocked = await remove(SECOND);
    expect(blocked.json.code).toBe("addition_in_progress");
    expect(h.fns.subscriptionsUpdate).not.toHaveBeenCalled();

    tbl(h.state.db, "billing_venue_additions").length = 0;
    tbl(h.state.db, "billing_venue_changes").push({ id: "c1", idempotency_key: "c", subscription_id: BILL, owner_id: OWNER, venue_id: THIRD, action: "remove", status: "pending", quantity_before: 3, quantity_after: 2, updated_at: new Date().toISOString(), created_at: new Date().toISOString() });
    expect((await remove(SECOND)).json.code).toBe("change_in_progress");
  });

  it("refuses a pending Stripe update or a quantity that disagrees, recording the refusal", async () => {
    subItem().quantity = 4;
    const drift = await remove(SECOND);
    expect(drift.json.code).toBe("billing_state");
    expect(h.fns.subscriptionsUpdate).not.toHaveBeenCalled();
    expect(tbl(h.state.db, "billing_venue_changes")[0]).toMatchObject({ status: "failed", failure_reason: "refused:billing_state" });
    expect(member(SECOND).remove_at).toBeNull();
  });

  // Phase 6.1 (review fix #1): the change is checked against Stripe as it is AFTER the claim, never
  // the pre-claim read — simulates an add, an admin swap or a renewal landing in between.
  it.each([
    ["the quantity moved (an add finished)", () => (subItem().quantity = 4)],
    ["the period renewed (remove_at would be wrong)", () => (subItem().current_period_end = Number(subItem().current_period_end) + 30 * 86400)],
    ["a pending update appeared", () => (h.state.subscription.pending_update = { expires_at: 1 })],
  ])("re-reads Stripe after the claim and refuses when %s", async (_label, mutate) => {
    let calls = 0;
    h.fns.subscriptionsRetrieve.mockImplementation(async () => {
      const copy = h.clone(h.state.subscription);
      calls += 1;
      if (calls === 1) mutate();
      return copy;
    });

    const result = await remove(SECOND);

    expect(result.status).toBe(409);
    expect(result.json.code).toBe("billing_state");
    expect(h.fns.subscriptionsRetrieve).toHaveBeenCalledTimes(2);
    expect(h.fns.subscriptionsUpdate).not.toHaveBeenCalled();
    expect(tbl(h.state.db, "billing_venue_changes")[0]).toMatchObject({ status: "failed", failure_reason: "refused:billing_state" });
    expect(member(SECOND).remove_at).toBeNull();
  });

  it("Phase 6.1: an admin price swap on the ledger blocks a remove, and is never settled as a Remove / Undo", async () => {
    const stale = new Date(Date.now() - VENUE_ADDITION_LEASE_MS - 60_000).toISOString();
    tbl(h.state.db, "billing_venue_changes").push({
      id: "price-1",
      idempotency_key: "bill-price:x",
      subscription_id: BILL,
      owner_id: OWNER,
      venue_id: null,
      action: "price",
      price_id: "price_custom_9000",
      status: "pending",
      quantity_before: null,
      quantity_after: null,
      updated_at: stale,
      created_at: stale,
    });
    // The Remove / Undo reconciler skips it (its own settler, lib/billingCustomPrice.ts, owns it).
    const reconciled = await reconcileStaleVenueChanges();
    expect(reconciled).toMatchObject({ scanned: 0, done: 0, failed: 0 });
    expect(tbl(h.state.db, "billing_venue_changes")[0]).toMatchObject({ status: "pending", action: "price" });
    expect(h.fns.subscriptionsUpdate).not.toHaveBeenCalled();
  });

  it("refuses offline, cancelling, unknown-price bills; the flag off is a 404", async () => {
    (tbl(h.state.db, "billing_subscriptions")[0] as Row).billing_method = "offline";
    expect((await remove(SECOND)).json.code).toBe("offline_bill");
    (tbl(h.state.db, "billing_subscriptions")[0] as Row).billing_method = "stripe";
    (tbl(h.state.db, "billing_subscriptions")[0] as Row).cancel_at_period_end = true;
    expect((await remove(SECOND)).json.code).toBe("cancel_scheduled");
    (tbl(h.state.db, "billing_subscriptions")[0] as Row).cancel_at_period_end = false;
    // A hand-built price we can't count venues on needs a person (a per-venue custom rate does not —
    // see the next test).
    Object.assign(subItem().price as Row, { id: "price_other_tiers", lookup_key: null });
    expect((await remove(SECOND)).json.code).toBe("billing_state");
    // Phase 6.2: a flat Price an admin pasted by hand (not `custom_monthly_`) says why — a custom rate.
    Object.assign(subItem().price as Row, {
      id: "price_pasted_8000",
      lookup_key: null,
      billing_scheme: "per_unit",
      tiers_mode: null,
      unit_amount: 8000,
      currency: "usd",
      recurring: { interval: "month", interval_count: 1 },
    });
    const pasted = await remove(SECOND);
    expect(pasted.status).toBe(409);
    expect(pasted.json.code).toBe("custom_rate");
    h.state.flag = false;
    expect((await remove(SECOND)).status).toBe(404);
  });

  it("Phase 6: a negotiated per-venue rate removes like the bands (quantity −1, no proration)", async () => {
    Object.assign(subItem().price as Row, {
      id: "price_custom_9000",
      lookup_key: "custom_monthly_9000",
      billing_scheme: "per_unit",
      tiers_mode: null,
      unit_amount: 9000,
      currency: "usd",
      recurring: { interval: "month", interval_count: 1 },
    });
    const result = await remove(SECOND);
    expect(result.status).toBe(200);
    expect(h.fns.subscriptionsUpdate.mock.calls[0][1]).toMatchObject({ proration_behavior: "none" });
    expect(member(SECOND).remove_at).toBe(PERIOD_END_ISO);
  });

  it("a definite Stripe rejection changes nothing; an ambiguous one is settled from Stripe's quantity after the lease", async () => {
    h.state.updateError = { type: "StripeInvalidRequestError", statusCode: 400, code: "resource_missing", message: "nope" };
    const rejected = await remove(SECOND);
    expect(rejected.json.code).toBe("change_failed");
    expect(member(SECOND).remove_at).toBeNull();

    // Ambiguous, and Stripe DID apply it.
    h.state.updateError = { type: "StripeConnectionError", message: "socket hang up" };
    const ambiguous = await remove(SECOND);
    expect(ambiguous.status).toBe(503);
    expect(ambiguous.json.code).toBe("change_unconfirmed");
    const pending = tbl(h.state.db, "billing_venue_changes").find((row) => row.status === "pending") as Row;
    expect(pending).toBeTruthy();
    subItem().quantity = 2; // it landed at Stripe
    // Inside the lease nothing settles it; afterwards the cron does.
    expect((await reconcileStaleVenueChanges()).scanned).toBe(0);
    const later = Date.now() + VENUE_ADDITION_LEASE_MS + 1000;
    expect(await reconcileStaleVenueChanges({ nowMs: later })).toMatchObject({ scanned: 1, done: 1 });
    expect(member(SECOND).remove_at).toBe(PERIOD_END_ISO);
  });

  it("an ambiguous change that never reached Stripe is settled as failed", async () => {
    h.state.updateError = { type: "StripeAPIError", statusCode: 500, message: "boom" };
    await remove(SECOND);
    const later = Date.now() + VENUE_ADDITION_LEASE_MS + 1000;
    expect(await reconcileStaleVenueChanges({ nowMs: later })).toMatchObject({ scanned: 1, failed: 1 });
    expect(member(SECOND).remove_at).toBeNull();
    expect(stripeQuantity()).toBe(3);
  });
});

describe("Undo", () => {
  it("puts a leaving venue back with no proration (the month is already paid)", async () => {
    await remove(SECOND);
    const { status, json } = await undo(SECOND);
    expect(status).toBe(200);
    expect(json.change).toEqual({ action: "undo", venueId: SECOND, removeAt: null, billedVenueCount: 3 });
    expect(h.fns.subscriptionsUpdate.mock.calls[1][1]).toEqual({ items: [{ id: ITEM, quantity: 3 }], proration_behavior: "none" });
    expect(stripeQuantity()).toBe(3);
    expect(member(SECOND).remove_at).toBeNull();
  });

  it("is refused for a venue that isn't leaving, and once the period has ended (that's a paid Add back)", async () => {
    expect((await undo(SECOND)).json.code).toBe("not_leaving");
    await remove(SECOND);
    expire(SECOND);
    expect((await undo(SECOND)).json.code).toBe("too_late");
  });
});

describe("the daily removal job", () => {
  it("hides a venue whose paid period has ended, stamps removed_at and rehidden_at, and leaves others alone", async () => {
    await remove(SECOND);
    await remove(THIRD);
    expire(SECOND);
    const response = await cronPOST(new Request("http://localhost/api/cron/billing"));
    const json = (await response.json()) as Row;
    expect(json.venueRemovals).toMatchObject({ due: 1, removed: 1, hidden: 1, skipped: 0 });
    expect(member(SECOND).removed_at).toBeTruthy();
    expect(venueRow(SECOND)).toMatchObject({ hidden: true });
    expect(venueRow(SECOND).rehidden_at).toBeTruthy();
    // Still the partner's venue (linked), just off the bill.
    expect(tbl(h.state.db, "venue_owner_venues").some((row) => row.venue_id === SECOND)).toBe(true);
    // Not yet due: untouched.
    expect(member(THIRD).removed_at).toBeNull();
    expect(venueRow(THIRD).hidden).toBe(false);
    // A second run is a no-op.
    expect(await applyDueVenueRemovals()).toMatchObject({ due: 0, removed: 0 });
  });

  it("dry run reports without writing", async () => {
    await remove(SECOND);
    expire(SECOND);
    expect(await applyDueVenueRemovals({ dryRun: true })).toMatchObject({ dryRun: true, due: 1, removed: 0 });
    expect(member(SECOND).removed_at).toBeNull();
    expect(venueRow(SECOND).hidden).toBe(false);
  });

  it("never hides a venue that is still a live bill's anchor (drift) — it is logged for an admin", async () => {
    member(ANCHOR).remove_at = new Date(Date.now() - 60_000).toISOString();
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await applyDueVenueRemovals()).toMatchObject({ due: 1, removed: 0, skipped: 1 });
    expect(venueRow(ANCHOR).hidden).toBe(false);
    expect(errors.mock.calls.some((call) => String(call[0]).includes("removal-blocked-anchor"))).toBe(true);
    errors.mockRestore();
  });
});

describe("Add back (a paid add of a venue that left the bill)", () => {
  const addBack = (venueId: string, extra: Row = {}) =>
    post(addPOST, "http://localhost/api/owner/venues/add", { idempotencyKey: nextKey(), venueId: ANCHOR, readdVenueId: venueId, quotedVenueCents: quotedNow(), ...extra });

  const removeAndExpire = async (venueId: string) => {
    await remove(venueId);
    expire(venueId);
    await applyDueVenueRemovals();
  };

  it("charges like any add, puts the membership back and un-hides the venue — no new venue is created", async () => {
    await removeAndExpire(THIRD); // admin-made (no self-serve stamp): only rehidden_at can un-hide it
    subItem().quantity = 2; // Stripe renewed without it
    expect(venueRow(THIRD).hidden).toBe(true);

    const { status, json } = await addBack(THIRD);
    expect(status).toBe(200);
    expect(json).toMatchObject({ status: "paid", venueId: THIRD });
    expect(h.fns.createAdminVenue).not.toHaveBeenCalled();
    const [, params] = h.fns.subscriptionsUpdate.mock.calls.at(-1) as [string, Row];
    expect(params).toMatchObject({ items: [{ id: ITEM, quantity: 3 }], proration_behavior: "always_invoice", payment_behavior: "pending_if_incomplete" });
    expect(member(THIRD)).toMatchObject({ remove_at: null, removed_at: null, subscription_id: BILL });
    expect(venueRow(THIRD)).toMatchObject({ hidden: false, rehidden_at: null });
    expect(await billedVenueCount(BILL)).toEqual({ ok: true, count: 3 });
  });

  it("works in the gap between the period ending and the cron noticing", async () => {
    await remove(SECOND);
    expire(SECOND);
    subItem().quantity = 2;
    const { json } = await addBack(SECOND);
    expect(json.status).toBe("paid");
    expect(member(SECOND)).toMatchObject({ remove_at: null, removed_at: null });
    // The cron then finds nothing due.
    expect(await applyDueVenueRemovals()).toMatchObject({ due: 0 });
    expect(venueRow(SECOND).hidden).toBe(false);
  });

  it("an Add back whose quoted price no longer matches is refused quote_changed — nothing charged (Phase 6.5)", async () => {
    await removeAndExpire(SECOND);
    subItem().quantity = 2;
    // Quoted as venue #3 ($60) — but the bill is now on a $90 negotiated per-venue rate.
    const quoted = quotedNow();
    Object.assign(subItem().price as Row, {
      id: "price_custom_9000",
      lookup_key: "custom_monthly_9000",
      billing_scheme: "per_unit",
      tiers_mode: null,
      unit_amount: 9000,
      currency: "usd",
      recurring: { interval: "month", interval_count: 1 },
    });
    const updatesBefore = h.fns.subscriptionsUpdate.mock.calls.length;
    const { status, json } = await addBack(SECOND, { quotedVenueCents: quoted });
    expect(status).toBe(409);
    expect(json.code).toBe("quote_changed");
    expect(h.fns.subscriptionsUpdate.mock.calls.length).toBe(updatesBefore);
    expect(member(SECOND).removed_at).toBeTruthy();
  });

  it("a declined Add back keeps the partner's venue (never deleted) and leaves it off the bill", async () => {
    await removeAndExpire(SECOND); // self-serve-stamped AND hidden: exactly what the add cleanup could delete
    subItem().quantity = 2;
    h.state.paymentMode = "decline";
    const { status, json } = await addBack(SECOND);
    expect(status).toBe(402);
    expect(json.code).toBe("card_declined");
    expect(venueRow(SECOND)).toBeTruthy();
    expect(member(SECOND).removed_at).toBeTruthy();
    expect(venueRow(SECOND).hidden).toBe(true);
  });

  it("a venue still leaving is an Undo, a billed one is already yours, another owner's is forbidden", async () => {
    await remove(SECOND);
    expect((await addBack(SECOND)).json.code).toBe("readd_use_undo");
    expect((await addBack(THIRD)).json.code).toBe("venue_already_yours");
    expect((await addBack("venue-elsewhere")).json.code).toBe("forbidden");
    expect(h.fns.subscriptionsUpdate).toHaveBeenCalledTimes(1); // only the Remove
  });
});

describe("GET /api/owner/billing account view", () => {
  const read = async () => {
    const response = await billingGET(new Request("http://localhost/api/owner/billing"));
    return (await response.json()) as { subscriptions: Row[] };
  };

  it("lists the bill's venues with their state, the band line and the next renewal's total", async () => {
    await remove(SECOND);
    await remove(THIRD);
    expire(THIRD);
    await applyDueVenueRemovals();
    const { subscriptions } = await read();
    expect(subscriptions).toHaveLength(1);
    const account = subscriptions[0].account as Row;
    expect(account.billedVenueCount).toBe(1);
    expect(account.breakdown).toEqual([{ venues: 1, unitAmountCents: 10000, subtotalCents: 10000 }]);
    expect(account.nextMonthlyListCents).toBe(10000);
    expect(account.venues).toEqual([
      { id: ANCHOR, name: "Anchor Bar", state: "billed", isAnchor: true, removeAt: null },
      { id: SECOND, name: "Second Bar", state: "leaving", isAnchor: false, removeAt: PERIOD_END_ISO },
      { id: THIRD, name: "Third Bar", state: "removed", isAnchor: false, removeAt: expect.any(String) },
    ]);
  });

  it("with the flag off the response has no account (today's shape)", async () => {
    h.state.flag = false;
    const { subscriptions } = await read();
    expect(subscriptions[0]).not.toHaveProperty("account");
  });
});
