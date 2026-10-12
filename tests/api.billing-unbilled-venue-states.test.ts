import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Multi-venue billing Phase 6.3 (review #2, #4) — removed and comped venues are not "no bill".
 *
 *   - `unbilledVenueStates` (lib/venueBilling.ts) tells removed / comped / unbilled apart.
 *   - The admin list shows a removed venue as removed, never "Comped (free)".
 *   - Checkout refuses `on_partner_bill` for a comped venue, a removed venue, and a second venue of
 *     a partner who already pays — before any Stripe call — and still allows a partner whose only
 *     bill is cancelled, and a first venue.
 *   - The owner Billing GET lists comped venues (shown "Included on your account at no charge").
 *
 * One in-memory database, with the query shapes those modules use.
 */

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  errors: {} as Record<string, { code?: string; message: string } | null>,
  owner: { ownerId: "owner-1", venueIds: ["venue-a", "venue-b"] },
  writes: [] as Array<{ table: string; op: string; row: Row }>,
}));

const stripeMocks = vi.hoisted(() => ({
  retrieve: vi.fn(),
  cancel: vi.fn(),
  list: vi.fn(),
  checkoutCreate: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => {
  const from = (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let limit = Infinity;
    const rows = () => (db.tables[table] ?? []).filter((row) => filters.every((keep) => keep(row))).slice(0, limit);
    const result = () => {
      const error = db.errors[table] ?? null;
      return error ? { data: null, error } : { data: rows(), error: null };
    };
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      },
      neq: (column: string, value: unknown) => {
        filters.push((row) => row[column] !== value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      order: () => builder,
      limit: (n: number) => {
        limit = n;
        return builder;
      },
      returns: async () => result(),
      maybeSingle: async () => {
        const error = db.errors[table] ?? null;
        return error ? { data: null, error } : { data: rows()[0] ?? null, error: null };
      },
      update: () => ({ eq: async () => ({ error: null }) }),
      upsert: (row: Row) => {
        db.writes.push({ table, op: "upsert", row });
        return { select: () => ({ single: async () => ({ data: { id: `upserted-${String(row.venue_id)}` }, error: null }) }) };
      },
      insert: async (row: Row) => {
        db.writes.push({ table, op: "insert", row });
        return { error: null };
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return builder;
  };
  return { supabaseAdmin: { from } };
});

vi.mock("@/lib/requireOwnerAuth", () => ({
  requireOwnerAuth: vi.fn(async () => db.owner),
}));

vi.mock("@/lib/adminAuth", () => ({
  requireAdminAuth: vi.fn(async () => ({ ok: true, authUserId: "admin-1", adminUsername: "admin" })),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    subscriptions: { retrieve: stripeMocks.retrieve, cancel: stripeMocks.cancel, list: stripeMocks.list },
    checkout: { sessions: { create: stripeMocks.checkoutCreate } },
  },
  getCheckoutPriceId: () => "price_graduated",
  getStripePriceId: () => "price_list",
  getStripeGraduatedPriceId: () => "price_graduated",
  OFFLINE_BILLING_METHOD: "offline",
}));

import { unbilledVenueStates } from "@/lib/venueBilling";
import { POST as checkout } from "@/app/api/owner/billing/checkout/route";
import { GET as adminList, POST as adminPost } from "@/app/api/admin/billing/route";
import { GET as ownerBilling } from "@/app/api/owner/billing/route";
import { ADMIN_GRANT_ON_PARTNER_BILL_MESSAGES, COMPED_VENUE_LABEL, ON_PARTNER_BILL_MESSAGES } from "@/lib/multiVenueBilling";

const bill = (id: string, venue: string, owner: string, status = "active", extra: Row = {}): Row => ({
  id,
  venue_id: venue,
  owner_id: owner,
  status,
  plan_type: "monthly",
  billing_method: "stripe",
  amount_cents: 10000,
  stripe_subscription_id: `sub_${id}`,
  stripe_customer_id: `cus_${owner}`,
  cancel_at_period_end: false,
  stripe_price_id: "price_graduated",
  quantity: 1,
  current_period_start: null,
  current_period_end: "2026-11-11T00:00:00Z",
  created_at: "2026-09-01T00:00:00Z",
  discount_label: null,
  discount_percent_off: null,
  discount_amount_off_cents: null,
  discount_ends_at: null,
  stripe_coupon_id: null,
  ...extra,
});

const member = (venue: string, billId: string, removedAt: string | null = null, removeAt: string | null = null): Row => ({
  venue_id: venue,
  subscription_id: billId,
  role: "added",
  added_at: "2026-10-01T00:00:00Z",
  remove_at: removeAt ?? removedAt,
  removed_at: removedAt,
});

const link = (owner: string, venue: string, name: string): Row => ({
  owner_id: owner,
  venue_id: venue,
  venue_owners: { email: `${owner}@example.com`, name: owner },
  venues: { id: venue, name, display_name: null },
});

const venueRow = (id: string, name: string): Row => ({ id, name });

/** Owner-1 pays for Pacific (venue-a) on bill-a. */
const pacificPaying = () => {
  db.tables.billing_subscriptions = [bill("bill-a", "venue-a", "owner-1")];
  db.tables.billing_subscription_venues = [{ ...member("venue-a", "bill-a"), role: "anchor" }];
  db.tables.venue_owner_venues = [link("owner-1", "venue-a", "Pacific"), link("owner-1", "venue-b", "Bravo")];
  db.tables.venues = [venueRow("venue-a", "Pacific"), venueRow("venue-b", "Bravo")];
};

const checkoutFor = (venueId: string) =>
  checkout(
    new Request("http://localhost/api/owner/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ venueId }),
    })
  );

const stripeCalls = () =>
  stripeMocks.retrieve.mock.calls.length +
  stripeMocks.cancel.mock.calls.length +
  stripeMocks.list.mock.calls.length +
  stripeMocks.checkoutCreate.mock.calls.length;

beforeEach(() => {
  db.tables = { billing_subscriptions: [], billing_subscription_venues: [], venue_owner_venues: [], venues: [], billing_invoices: [] };
  db.errors = {};
  db.writes = [];
  db.owner = { ownerId: "owner-1", venueIds: ["venue-a", "venue-b"] };
  stripeMocks.retrieve.mockReset().mockResolvedValue({ status: "canceled" });
  stripeMocks.cancel.mockReset().mockResolvedValue({ status: "canceled" });
  stripeMocks.list.mockReset().mockReturnValue({ autoPagingToArray: vi.fn().mockResolvedValue([]) });
  stripeMocks.checkoutCreate.mockReset().mockResolvedValue({ url: "https://checkout.stripe.test/s" });
});

describe("unbilledVenueStates", () => {
  const owners = new Map([
    ["venue-a", "owner-1"],
    ["venue-b", "owner-1"],
  ]);

  it("leaves out a venue a live bill covers; a never-billed venue of a paying partner is comped", async () => {
    pacificPaying();
    const result = await unbilledVenueStates(["venue-a", "venue-b"], owners);
    expect(result.ok && Array.from(result.byVenue.entries())).toEqual([["venue-b", { kind: "comped", ownerBillId: "bill-a" }]]);
  });

  it("a venue taken off the bill is removed (with the bill's anchor), never comped", async () => {
    pacificPaying();
    db.tables.billing_subscription_venues.push(member("venue-b", "bill-a", "2026-10-01T00:00:00Z"));
    const result = await unbilledVenueStates(["venue-b"], owners);
    expect(result.ok && result.byVenue.get("venue-b")).toEqual({
      kind: "removed",
      subscriptionId: "bill-a",
      anchorVenueId: "venue-a",
      removedAt: "2026-10-01T00:00:00Z",
      ownerBillId: "bill-a",
    });
  });

  it("a venue still set to leave (remove_at only) is covered — the resolver's answer", async () => {
    pacificPaying();
    db.tables.billing_subscription_venues.push(member("venue-b", "bill-a", null, "2026-11-11T00:00:00Z"));
    const result = await unbilledVenueStates(["venue-b"], owners);
    expect(result.ok && result.byVenue.size).toBe(0);
  });

  it("a venue whose own bill was cancelled is unbilled, carrying the partner's other live bill", async () => {
    pacificPaying();
    db.tables.billing_subscriptions.push(bill("bill-b", "venue-b", "owner-1", "cancelled"));
    db.tables.billing_subscription_venues.push({ ...member("venue-b", "bill-b"), role: "anchor" });
    const result = await unbilledVenueStates(["venue-b"], owners);
    expect(result.ok && result.byVenue.get("venue-b")).toEqual({ kind: "unbilled", ownerBillId: "bill-a" });
  });

  it("no live bill anywhere = plain unbilled; another partner's bill does not count", async () => {
    db.tables.billing_subscriptions = [bill("bill-x", "venue-x", "owner-2")];
    const result = await unbilledVenueStates(["venue-b"], owners);
    expect(result.ok && result.byVenue.get("venue-b")).toEqual({ kind: "unbilled", ownerBillId: null });
  });

  it("a missing membership table reads as no rows; any other read error is ok:false", async () => {
    pacificPaying();
    db.errors.billing_subscription_venues = { code: "42P01", message: "relation billing_subscription_venues does not exist" };
    const missing = await unbilledVenueStates(["venue-b"], owners);
    expect(missing.ok && missing.byVenue.get("venue-b")?.kind).toBe("comped");

    db.errors.billing_subscription_venues = { message: "timeout" };
    expect((await unbilledVenueStates(["venue-b"], owners)).ok).toBe(false);
  });
});

describe("POST /api/owner/billing/checkout — one bill per partner", () => {
  it("refuses a comped venue with on_partner_bill, before any Stripe call", async () => {
    pacificPaying();
    const response = await checkoutFor("venue-b");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "on_partner_bill", error: ON_PARTNER_BILL_MESSAGES.comped });
    expect(stripeCalls()).toBe(0);
  });

  it("refuses a venue removed from the partner's bill (Add it back instead)", async () => {
    pacificPaying();
    db.tables.billing_subscription_venues.push(member("venue-b", "bill-a", "2026-10-01T00:00:00Z"));
    const response = await checkoutFor("venue-b");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "on_partner_bill", error: ON_PARTNER_BILL_MESSAGES.removed });
    expect(stripeCalls()).toBe(0);
  });

  it("refuses a second venue whose own old bill is cancelled while the partner pays for another", async () => {
    pacificPaying();
    db.tables.billing_subscriptions.push(bill("bill-b", "venue-b", "owner-1", "cancelled"));
    db.tables.billing_subscription_venues.push({ ...member("venue-b", "bill-b"), role: "anchor" });
    const response = await checkoutFor("venue-b");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "on_partner_bill", error: ON_PARTNER_BILL_MESSAGES.shared });
    expect(stripeCalls()).toBe(0);
  });

  it("refuses when this venue's own 'active' bill is dead at Stripe but the partner pays for another", async () => {
    pacificPaying();
    db.tables.billing_subscriptions.push(bill("bill-b", "venue-b", "owner-1", "active"));
    db.tables.billing_subscription_venues.push({ ...member("venue-b", "bill-b"), role: "anchor" });
    const response = await checkoutFor("venue-b");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "on_partner_bill" });
    expect(stripeMocks.list).not.toHaveBeenCalled();
    expect(stripeMocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it("still allows a partner whose only bill is cancelled (Resubscribe)", async () => {
    db.tables.billing_subscriptions = [bill("bill-a", "venue-a", "owner-1", "cancelled")];
    db.tables.billing_subscription_venues = [{ ...member("venue-a", "bill-a"), role: "anchor" }];
    db.owner = { ownerId: "owner-1", venueIds: ["venue-a"] };
    const response = await checkoutFor("venue-a");
    expect(await response.json()).toMatchObject({ ok: true, url: "https://checkout.stripe.test/s" });
  });

  it("still allows a first venue with no bill anywhere (signup)", async () => {
    db.owner = { ownerId: "owner-1", venueIds: ["venue-a"] };
    const response = await checkoutFor("venue-a");
    expect(await response.json()).toMatchObject({ ok: true });
    expect(stripeMocks.checkoutCreate).toHaveBeenCalledTimes(1);
  });

  it("fails closed (503, no Stripe call) when the membership read errors", async () => {
    db.owner = { ownerId: "owner-1", venueIds: ["venue-a"] };
    db.errors.billing_subscription_venues = { message: "timeout" };
    const response = await checkoutFor("venue-a");
    expect(response.status).toBe(503);
    expect(stripeCalls()).toBe(0);
  });
});

describe("GET /api/admin/billing — removed is not comped", () => {
  const list = async () =>
    (await (await adminList(new Request("http://localhost/api/admin/billing"))).json()) as {
      partners: Array<{ venueId: string; comped: boolean; removedFrom: { anchorVenueId: string | null; removedAt: string | null } | null }>;
    };

  it("a never-billed venue of a paying partner is comped", async () => {
    pacificPaying();
    const bravo = (await list()).partners.find((p) => p.venueId === "venue-b");
    expect(bravo).toMatchObject({ comped: true, removedFrom: null });
  });

  it("a venue taken off the bill is removed (from Pacific's bill), never comped", async () => {
    pacificPaying();
    db.tables.billing_subscription_venues.push(member("venue-b", "bill-a", "2026-10-01T00:00:00Z"));
    const bravo = (await list()).partners.find((p) => p.venueId === "venue-b");
    expect(bravo).toMatchObject({
      comped: false,
      removedFrom: { anchorVenueId: "venue-a", removedAt: "2026-10-01T00:00:00Z" },
    });
  });
});

describe("GET /api/owner/billing — comped venues", () => {
  it("lists a comped venue by name; none for a partner whose venues are all billed", async () => {
    pacificPaying();
    const body = (await (await ownerBilling(new Request("http://localhost/api/owner/billing"))).json()) as {
      compedVenues: Array<{ id: string; name: string }>;
    };
    expect(body.compedVenues).toEqual([{ id: "venue-b", name: "Bravo" }]);
    expect(COMPED_VENUE_LABEL).toBe("Included on your account at no charge");

    db.owner = { ownerId: "owner-1", venueIds: ["venue-a"] };
    const single = (await (await ownerBilling(new Request("http://localhost/api/owner/billing"))).json()) as {
      compedVenues: unknown[];
    };
    expect(single.compedVenues).toEqual([]);
  });

  it("a removed venue is not listed as comped", async () => {
    pacificPaying();
    db.tables.billing_subscription_venues.push(member("venue-b", "bill-a", "2026-10-01T00:00:00Z"));
    const body = (await (await ownerBilling(new Request("http://localhost/api/owner/billing"))).json()) as {
      compedVenues: unknown[];
    };
    expect(body.compedVenues).toEqual([]);
  });
});

// --- Phase 6.4 (review #6, #7): names and options never come from the search-filtered list ---------

describe("GET /api/admin/billing — anchor names do not depend on the search box (Phase 6.4, #6)", () => {
  const search = async (term: string) =>
    (await (await adminList(new Request(`http://localhost/api/admin/billing?search=${term}`))).json()) as {
      partners: Array<{
        venueId: string;
        bill: { anchorVenueName: string | null } | null;
        removedFrom: { anchorVenueName: string | null } | null;
      }>;
    };

  it("a billed venue still carries its anchor's name when the search hides the anchor row", async () => {
    pacificPaying();
    db.tables.billing_subscription_venues.push(member("venue-b", "bill-a"));
    const { partners } = await search("bravo");
    expect(partners.map((p) => p.venueId)).toEqual(["venue-b"]);
    expect(partners[0].bill?.anchorVenueName).toBe("Pacific");
  });

  it("a removed venue still names the bill it left when the search hides the anchor row", async () => {
    pacificPaying();
    db.tables.billing_subscription_venues.push(member("venue-b", "bill-a", "2026-10-01T00:00:00Z"));
    const { partners } = await search("bravo");
    expect(partners).toHaveLength(1);
    expect(partners[0].removedFrom?.anchorVenueName).toBe("Pacific");
  });
});

describe("GET /api/admin/billing?resource=attach-options (Phase 6.4, #6 and #7)", () => {
  const options = async () =>
    (await (await adminList(new Request("http://localhost/api/admin/billing?resource=attach-options"))).json()) as {
      ok: boolean;
      venues: Array<{ id: string; name: string; ownerId: string | null }>;
      owners: Array<{ id: string; email: string; name: string }>;
    };
  const real = (id: string, name: string, extra: Row = {}): Row => ({ id, name, hidden: false, latitude: 40.1, longitude: -74.1, ...extra });

  const seed = () => {
    pacificPaying();
    db.tables.venues = [
      real("venue-a", "Pacific"),
      real("venue-b", "Bravo"),
      real("venue-c", "Charlie"),
      real("venue-d", "Delta (hidden)", { hidden: true }),
      real("venue-room", "Global room", { latitude: 0, longitude: 0 }),
    ];
    db.tables.venue_owners = [
      { id: "owner-1", email: "andrew@example.com", name: "Andrew" },
      { id: "owner-3", email: "newcomer@example.com", name: "Newcomer" },
    ];
  };

  it("offers unlinked venues and COMPED linked venues (tagged with their partner), nothing else", async () => {
    seed();
    const body = await options();
    expect(body.ok).toBe(true);
    // Pacific is billed, Delta is hidden, the room is a (0,0) placeholder: none are offered.
    expect(body.venues).toEqual([
      { id: "venue-b", name: "Bravo", ownerId: "owner-1" },
      { id: "venue-c", name: "Charlie", ownerId: null },
    ]);
  });

  it("a venue removed from a bill is not offered (the partner's Add back, or support)", async () => {
    seed();
    db.tables.billing_subscription_venues.push(member("venue-b", "bill-a", "2026-10-01T00:00:00Z"));
    expect((await options()).venues.map((v) => v.id)).toEqual(["venue-c"]);
  });

  it("returns EVERY partner account, including one with no venues yet", async () => {
    seed();
    expect((await options()).owners.map((o) => o.id)).toEqual(["owner-1", "owner-3"]);
  });

  it("a failed classifier read is a 500, never an empty list that hides comped venues", async () => {
    seed();
    db.errors.billing_subscription_venues = { code: "XX000", message: "boom" };
    const response = await adminList(new Request("http://localhost/api/admin/billing?resource=attach-options"));
    expect(response.status).toBe(500);
  });
});

describe("POST /api/admin/billing grant-manual — never a second bill for a partner (Phase 6.5)", () => {
  const grant = (venueId: string) =>
    adminPost(
      new Request("http://localhost/api/admin/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "grant-manual", venueId, paidThroughDate: "2099-12-31", amountDollars: 100 }),
      })
    );
  const billWrites = () => db.writes.filter((write) => write.table === "billing_subscriptions");
  const list = async () =>
    (await (await adminList(new Request("http://localhost/api/admin/billing"))).json()) as {
      partners: Array<{ venueId: string; grantOfflineBlocked: boolean }>;
    };

  it("refuses a comped venue (the partner already pays) — nothing written", async () => {
    pacificPaying();
    const response = await grant("venue-b");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "on_partner_bill", error: ADMIN_GRANT_ON_PARTNER_BILL_MESSAGES.comped });
    expect(billWrites()).toEqual([]);
    expect(stripeCalls()).toBe(0);
  });

  it("refuses a venue removed from the partner's bill", async () => {
    pacificPaying();
    db.tables.billing_subscription_venues.push(member("venue-b", "bill-a", "2026-10-01T00:00:00Z"));
    const response = await grant("venue-b");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "on_partner_bill", error: ADMIN_GRANT_ON_PARTNER_BILL_MESSAGES.removed });
    expect(billWrites()).toEqual([]);
  });

  it("refuses a venue whose own old bill is cancelled while the partner pays on another venue's bill", async () => {
    pacificPaying();
    db.tables.billing_subscriptions.push(bill("bill-b", "venue-b", "owner-1", "cancelled"));
    db.tables.billing_subscription_venues.push({ ...member("venue-b", "bill-b"), role: "anchor" });
    const response = await grant("venue-b");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "on_partner_bill", error: ADMIN_GRANT_ON_PARTNER_BILL_MESSAGES.shared });
    expect(billWrites()).toEqual([]);
  });

  it("allows a partner's first bill (no bill anywhere)", async () => {
    db.tables.venue_owner_venues = [link("owner-1", "venue-a", "Pacific")];
    const response = await grant("venue-a");
    expect(await response.json()).toMatchObject({ ok: true });
    expect(billWrites()).toHaveLength(1);
  });

  it("allows it when the partner's only other bill is cancelled", async () => {
    pacificPaying();
    db.tables.billing_subscriptions[0].status = "cancelled";
    const response = await grant("venue-b");
    expect(await response.json()).toMatchObject({ ok: true });
    expect(billWrites()).toHaveLength(1);
  });

  it("allows renewing (Extend) the venue's own live offline bill", async () => {
    db.tables.billing_subscriptions = [
      bill("bill-a", "venue-a", "owner-1", "active", { billing_method: "offline", stripe_subscription_id: null, stripe_customer_id: null }),
    ];
    db.tables.billing_subscription_venues = [{ ...member("venue-a", "bill-a"), role: "anchor" }];
    db.tables.venue_owner_venues = [link("owner-1", "venue-a", "Pacific")];
    const response = await grant("venue-a");
    expect(await response.json()).toMatchObject({ ok: true });
    expect(billWrites()).toHaveLength(1);
  });

  it("fails closed (500, nothing written) when the state read errors", async () => {
    pacificPaying();
    db.errors.billing_subscription_venues = { message: "timeout" };
    const response = await grant("venue-b");
    expect(response.status).toBe(500);
    expect(billWrites()).toEqual([]);
  });

  it("the admin list flags exactly those rows, so the Grant button is disabled there", async () => {
    pacificPaying();
    const partners = (await list()).partners;
    expect(partners.find((p) => p.venueId === "venue-a")?.grantOfflineBlocked).toBe(false);
    expect(partners.find((p) => p.venueId === "venue-b")?.grantOfflineBlocked).toBe(true);
  });
});
