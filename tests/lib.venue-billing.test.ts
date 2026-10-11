import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * lib/venueBilling.ts — "which bill covers this venue?" (multi-venue billing Phase 1).
 *
 * An in-memory model of the two tables, with the query shapes the resolver uses. Each case is a
 * situation Phase 3+ will create (a venue added to a chain, a removed venue, a venue whose own
 * old bill lapsed before it joined a chain) or a failure the destructive callers must see.
 */

vi.mock("server-only", () => ({}));

type Bill = { id: string; venue_id: string; status: string; amount_cents?: number };
type Membership = { venue_id: string; subscription_id: string; removed_at: string | null };

const db = vi.hoisted(() => ({
  bills: [] as Bill[],
  memberships: [] as Membership[],
  billingError: null as { message: string } | null,
  membershipError: null as { code?: string; message: string } | null,
  calls: [] as string[],
}));

vi.mock("@/lib/supabaseAdmin", () => {
  const from = (table: string) => {
    const filters: Array<{ op: string; column: string; value: unknown }> = [];
    let selected = "";
    const rows = (): Array<Record<string, unknown>> => {
      const source: Array<Record<string, unknown>> =
        table === "billing_subscriptions" ? db.bills : table === "billing_subscription_venues" ? db.memberships : [];
      return source.filter((row) =>
        filters.every((f) =>
          f.op === "eq" ? row[f.column] === f.value : (f.value as unknown[]).includes(row[f.column])
        )
      );
    };
    const error = () => (table === "billing_subscriptions" ? db.billingError : db.membershipError);
    const builder = {
      select: (columns: string) => {
        selected = columns;
        db.calls.push(`${table}:${columns}`);
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters.push({ op: "eq", column, value });
        return builder;
      },
      in: (column: string, value: unknown[]) => {
        filters.push({ op: "in", column, value });
        return builder;
      },
      returns: async () => (error() ? { data: null, error: error() } : { data: rows(), error: null }),
      maybeSingle: async () => (error() ? { data: null, error: error() } : { data: rows()[0] ?? null, error: null }),
      get selected() {
        return selected;
      },
    };
    return builder;
  };
  return { supabaseAdmin: { from } };
});

import {
  __resetVenueBillingWarningsForTests,
  billedVenueCount,
  isMissingMembershipTable,
  loadBillingForVenue,
  loadBillingForVenues,
  venueIdsEverBilled,
  venueIdsOnBill,
  withResolverColumns,
} from "@/lib/venueBilling";

const anchor = (id: string, venue: string, status = "active"): Bill => ({ id, venue_id: venue, status });
const member = (venue: string, bill: string, removedAt: string | null = null): Membership => ({
  venue_id: venue,
  subscription_id: bill,
  removed_at: removedAt,
});

beforeEach(() => {
  db.bills = [];
  db.memberships = [];
  db.billingError = null;
  db.membershipError = null;
  db.calls = [];
  __resetVenueBillingWarningsForTests();
});

describe("withResolverColumns", () => {
  it("adds id, venue_id and status when missing, keeping the caller's columns first", () => {
    expect(withResolverColumns("stripe_customer_id")).toBe("stripe_customer_id, id, venue_id, status");
    expect(withResolverColumns("id, venue_id, status, amount_cents")).toBe("id, venue_id, status, amount_cents");
  });
});

describe("loadBillingForVenue", () => {
  it("today's case: a venue's own live bill, with NO membership read (the pre-Phase-1 query only)", async () => {
    db.bills = [anchor("bill-p", "pacific")];
    db.memberships = [member("pacific", "bill-p")];

    const result = await loadBillingForVenue<Bill>("pacific", "amount_cents");

    expect(result).toEqual({ ok: true, row: expect.objectContaining({ id: "bill-p" }) });
    expect(db.calls.some((c) => c.startsWith("billing_subscription_venues"))).toBe(false);
  });

  it("a venue added to a chain resolves to the chain's bill (whose venue_id is the anchor)", async () => {
    db.bills = [anchor("bill-p", "pacific")];
    db.memberships = [member("pacific", "bill-p"), member("second", "bill-p")];

    const result = await loadBillingForVenue<Bill>("second", "amount_cents");

    expect(result).toEqual({ ok: true, row: expect.objectContaining({ id: "bill-p", venue_id: "pacific" }) });
  });

  it("a removed venue is no longer covered", async () => {
    db.bills = [anchor("bill-p", "pacific")];
    db.memberships = [member("second", "bill-p", "2026-11-01T00:00:00Z")];

    expect(await loadBillingForVenue<Bill>("second", "")).toEqual({ ok: true, row: null });
  });

  it("a venue whose own old bill lapsed and which now sits on a live chain resolves to the chain", async () => {
    db.bills = [anchor("bill-old", "second", "cancelled"), anchor("bill-p", "pacific")];
    db.memberships = [member("second", "bill-p")];

    const result = await loadBillingForVenue<Bill>("second", "");
    expect(result).toEqual({ ok: true, row: expect.objectContaining({ id: "bill-p" }) });
  });

  it("a cancelled own bill with nothing else stays the answer (today's 'cancelled' state)", async () => {
    db.bills = [anchor("bill-g", "garden", "cancelled")];
    db.memberships = [member("garden", "bill-g")];

    const result = await loadBillingForVenue<Bill>("garden", "");
    expect(result).toEqual({ ok: true, row: expect.objectContaining({ id: "bill-g", status: "cancelled" }) });
  });

  it("no bill anywhere → row null", async () => {
    expect(await loadBillingForVenue<Bill>("nowhere", "")).toEqual({ ok: true, row: null });
  });

  it("returns ok:false on a billing read error", async () => {
    db.billingError = { message: "boom" };
    expect(await loadBillingForVenue<Bill>("pacific", "")).toEqual({ ok: false, error: "billing-read-failed: boom" });
  });

  it("returns ok:false on a membership read error (never 'no bill')", async () => {
    db.membershipError = { message: "timeout" };
    const result = await loadBillingForVenue<Bill>("second", "");
    expect(result.ok).toBe(false);
  });

  it("falls back to anchors only when the membership table does not exist yet (deploy skew), warning once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    db.membershipError = { code: "PGRST205", message: "Could not find the table 'public.billing_subscription_venues'" };

    expect(await loadBillingForVenue<Bill>("nowhere", "")).toEqual({ ok: true, row: null });
    expect(await loadBillingForVenue<Bill>("nowhere-2", "")).toEqual({ ok: true, row: null });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("[VenueBilling] membership-table-missing");
    warn.mockRestore();
  });
});

describe("loadBillingForVenues", () => {
  it("maps every covered venue to its bill and leaves uncovered venues out", async () => {
    db.bills = [anchor("bill-p", "pacific"), anchor("bill-c", "carrabbas"), anchor("bill-old", "x", "cancelled")];
    db.memberships = [
      member("pacific", "bill-p"),
      member("second", "bill-p"),
      member("gone", "bill-p", "2026-10-01T00:00:00Z"),
      member("x", "bill-c"),
    ];

    const result = await loadBillingForVenues<Bill>(["pacific", "second", "gone", "carrabbas", "x", "hightop-test"], "");
    if (!result.ok) throw new Error(result.error);

    expect(Object.fromEntries([...result.byVenue].map(([venue, bill]) => [venue, bill.id]))).toEqual({
      pacific: "bill-p",
      second: "bill-p",
      carrabbas: "bill-c",
      x: "bill-c",
    });
  });

  it("an empty list reads nothing", async () => {
    const result = await loadBillingForVenues<Bill>([], "");
    expect(result.ok && result.byVenue.size).toBe(0);
    expect(db.calls).toEqual([]);
  });
});

describe("venueIdsEverBilled (the sweep / pending-signup proof)", () => {
  it("counts an anchor in ANY status and a membership even after removal", async () => {
    db.bills = [anchor("bill-g", "garden", "cancelled")];
    db.memberships = [member("second", "bill-p", "2026-10-01T00:00:00Z")];

    const result = await venueIdsEverBilled(["garden", "second", "never"]);
    expect(result.ok && [...result.venueIds].sort()).toEqual(["garden", "second"]);
  });

  it("fails closed on either read error", async () => {
    db.billingError = { message: "boom" };
    expect((await venueIdsEverBilled(["a"])).ok).toBe(false);
    db.billingError = null;
    db.membershipError = { message: "boom" };
    expect((await venueIdsEverBilled(["a"])).ok).toBe(false);
  });
});

describe("venueIdsOnBill / billedVenueCount", () => {
  it("lists the anchor first, then current members; removed ones only on request", async () => {
    db.bills = [anchor("bill-p", "pacific")];
    db.memberships = [
      member("pacific", "bill-p"),
      member("zeta", "bill-p"),
      member("alpha", "bill-p"),
      member("gone", "bill-p", "2026-10-01T00:00:00Z"),
    ];

    expect(await venueIdsOnBill("bill-p")).toEqual({
      ok: true,
      anchorVenueId: "pacific",
      venueIds: ["pacific", "alpha", "zeta"],
    });
    expect(await venueIdsOnBill("bill-p", { includeRemoved: true })).toEqual({
      ok: true,
      anchorVenueId: "pacific",
      venueIds: ["pacific", "alpha", "gone", "zeta"],
    });
    expect(await billedVenueCount("bill-p")).toEqual({ ok: true, count: 3 });
  });

  it("counts a bill with no membership rows (pre-migration) as its anchor alone", async () => {
    db.bills = [anchor("bill-c", "carrabbas")];
    expect(await billedVenueCount("bill-c")).toEqual({ ok: true, count: 1 });
  });

  it("an unknown bill covers nothing", async () => {
    expect(await venueIdsOnBill("nope")).toEqual({ ok: true, anchorVenueId: null, venueIds: [] });
  });
});

describe("isMissingMembershipTable", () => {
  it("recognises Postgres and PostgREST missing-table errors only", () => {
    expect(isMissingMembershipTable({ code: "42P01", message: "relation does not exist" })).toBe(true);
    expect(isMissingMembershipTable({ code: "PGRST205", message: "x" })).toBe(true);
    expect(
      isMissingMembershipTable({ message: 'relation "public.billing_subscription_venues" does not exist' })
    ).toBe(true);
    expect(isMissingMembershipTable({ code: "57014", message: "statement timeout" })).toBe(false);
    expect(isMissingMembershipTable(null)).toBe(false);
  });
});
