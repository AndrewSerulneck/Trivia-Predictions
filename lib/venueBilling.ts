import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * "Which bill covers this venue?" — the ONE home of that question
 * (docs/multi-venue-volume-billing-plan.md §4.2, Phase 1).
 *
 * A bill is a `billing_subscriptions` row. Its `venue_id` is the ANCHOR venue (the venue the bill
 * was opened for, NOT NULL UNIQUE, unchanged since 2026-06). Since Phase 1 a bill can also cover
 * other venues, listed in `billing_subscription_venues` (one row per venue, `venue_id` UNIQUE, so
 * a venue is on at most one bill). A trigger gives every bill its own anchor membership row.
 *
 * Every venue-keyed read of `billing_subscriptions` goes through this file; a contract test
 * (tests/venue-billing-resolver-contract.test.ts) fails on a new `.eq("venue_id", …)` /
 * `.in("venue_id", …)` read of that table anywhere else. Writes are keyed by the row's `id`.
 *
 * RESOLUTION RULE, per venue (written once, here):
 *   1. The venue's own anchor bill, if it exists and is not `cancelled`.
 *   2. Otherwise the bill its ACTIVE membership row (removed_at null) points at, if that bill is
 *      not `cancelled` — e.g. a venue whose own old bill lapsed and which now sits on a chain.
 *   3. Otherwise whichever exists: the anchor bill first (today's answer), then the membership's.
 * Rule 1 is why the membership table is only read when it can change the answer — which, while
 * every bill has one venue, is never; so Phase 1 changes no answer anywhere.
 *
 * DEPLOY-SKEW SAFE: if the membership table does not exist yet (code deployed before the migration
 * is applied), reads log `[VenueBilling] membership-table-missing` once and fall back to anchors
 * only — exactly the pre-Phase-1 answer. Every OTHER read error is returned as `ok: false`, and
 * every caller that deletes or reveals something on the answer fails CLOSED on it.
 */

export const BILLING_MEMBERSHIP_TABLE = "billing_subscription_venues";

/** The columns every resolved row must carry; appended to the caller's select when missing. */
const REQUIRED_COLUMNS = ["id", "venue_id", "status"] as const;

/** The fields the resolver itself reads off a `billing_subscriptions` row. */
export type ResolvableBillRow = { id: string; venue_id: string; status: string };

type MembershipRow = {
  venue_id: string;
  subscription_id: string;
  removed_at: string | null;
};

type QueryError = { code?: string; message?: string } | null;

export type VenueBillingMap<Row> = { ok: true; byVenue: Map<string, Row> } | { ok: false; error: string };
export type VenueBillingOne<Row> = { ok: true; row: Row | null } | { ok: false; error: string };
export type VenueIdSetResult = { ok: true; venueIds: Set<string> } | { ok: false; error: string };

/** Adds `id, venue_id, status` to a select list that lacks them. Keeps the caller's order. */
export const withResolverColumns = (columns: string): string => {
  const present = new Set(
    columns
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
  );
  const missing = REQUIRED_COLUMNS.filter((c) => !present.has(c));
  return missing.length === 0 ? columns : [columns, ...missing].filter((c) => c.trim()).join(", ");
};

const isCancelled = (row: ResolvableBillRow | null | undefined): boolean => row?.status === "cancelled";

let warnedMissingTable = false;

/** True for "relation does not exist" (Postgres 42P01) or PostgREST's schema-cache miss. */
export const isMissingMembershipTable = (error: QueryError): boolean => {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = error.message ?? "";
  return (
    message.includes(BILLING_MEMBERSHIP_TABLE) &&
    (message.includes("does not exist") || message.includes("Could not find"))
  );
};

const noteMissingTable = (): void => {
  if (warnedMissingTable) return;
  warnedMissingTable = true;
  console.warn(
    `[VenueBilling] membership-table-missing — ${BILLING_MEMBERSHIP_TABLE} is not in the database yet; ` +
      "resolving bills by anchor venue only (apply 20261011134820_multi_venue_billing.sql)"
  );
};

/** Test hook: reset the once-per-process warning. */
export const __resetVenueBillingWarningsForTests = (): void => {
  warnedMissingTable = false;
};

const isMembershipRow = (row: unknown): row is MembershipRow =>
  typeof row === "object" &&
  row !== null &&
  typeof (row as MembershipRow).venue_id === "string" &&
  typeof (row as MembershipRow).subscription_id === "string";

/**
 * Membership rows for these venues. `activeOnly` drops rows a venue was removed from.
 * A missing table is "no rows"; any other error is returned.
 */
async function readMemberships(
  venueIds: string[],
  activeOnly: boolean
): Promise<{ ok: true; rows: MembershipRow[] } | { ok: false; error: string }> {
  if (!supabaseAdmin) return { ok: false, error: "supabase-admin-unconfigured" };
  if (venueIds.length === 0) return { ok: true, rows: [] };

  const { data, error } = await supabaseAdmin
    .from(BILLING_MEMBERSHIP_TABLE)
    .select("venue_id, subscription_id, removed_at")
    .in("venue_id", venueIds)
    .returns<MembershipRow[]>();

  if (error) {
    if (isMissingMembershipTable(error)) {
      noteMissingTable();
      return { ok: true, rows: [] };
    }
    return { ok: false, error: `membership-read-failed: ${error.message ?? "unknown"}` };
  }

  const rows = (Array.isArray(data) ? data : []).filter(isMembershipRow);
  return { ok: true, rows: activeOnly ? rows.filter((row) => !row.removed_at) : rows };
}

/**
 * The bill covering each venue, as `venue id → row`. `columns` is the caller's
 * `billing_subscriptions` select list (`id, venue_id, status` are added if absent).
 *
 * NOTE `row.venue_id` is the bill's ANCHOR venue, which for a venue on a chain is a different
 * venue. Key on the map, never on `row.venue_id`, when you mean "this venue".
 */
export async function loadBillingForVenues<Row extends ResolvableBillRow>(
  venueIds: readonly string[],
  columns: string
): Promise<VenueBillingMap<Row>> {
  if (!supabaseAdmin) return { ok: false, error: "supabase-admin-unconfigured" };
  const ids = Array.from(new Set(venueIds.filter((id) => typeof id === "string" && id.trim() !== "")));
  const byVenue = new Map<string, Row>();
  if (ids.length === 0) return { ok: true, byVenue };

  const select = withResolverColumns(columns);

  const anchors = await supabaseAdmin
    .from("billing_subscriptions")
    .select(select)
    .in("venue_id", ids)
    .returns<Row[]>();
  if (anchors.error) return { ok: false, error: `billing-read-failed: ${anchors.error.message}` };

  const anchorByVenue = new Map<string, Row>();
  for (const row of anchors.data ?? []) {
    if (ids.includes(row.venue_id)) anchorByVenue.set(row.venue_id, row);
  }

  // Rule 1: a live anchor is the answer, and needs no membership read.
  const undecided = ids.filter((id) => {
    const anchor = anchorByVenue.get(id);
    return !anchor || isCancelled(anchor);
  });

  const memberships = await readMemberships(undecided, true);
  if (!memberships.ok) return memberships;

  // Bills a membership points at that we have not loaded yet.
  const loadedById = new Map<string, Row>();
  for (const row of anchorByVenue.values()) loadedById.set(row.id, row);
  const missingBillIds = Array.from(
    new Set(memberships.rows.map((m) => m.subscription_id).filter((id) => !loadedById.has(id)))
  );
  if (missingBillIds.length > 0) {
    const bills = await supabaseAdmin
      .from("billing_subscriptions")
      .select(select)
      .in("id", missingBillIds)
      .returns<Row[]>();
    if (bills.error) return { ok: false, error: `billing-read-failed: ${bills.error.message}` };
    for (const row of bills.data ?? []) loadedById.set(row.id, row);
  }

  const memberBillByVenue = new Map<string, Row>();
  for (const membership of memberships.rows) {
    const bill = loadedById.get(membership.subscription_id);
    if (bill) memberBillByVenue.set(membership.venue_id, bill);
  }

  for (const id of ids) {
    const resolved = pickBill(anchorByVenue.get(id) ?? null, memberBillByVenue.get(id) ?? null);
    if (resolved) byVenue.set(id, resolved);
  }
  return { ok: true, byVenue };
}

/** The resolution rule (module header), on one venue's two candidates. */
const pickBill = <Row extends ResolvableBillRow>(anchor: Row | null, member: Row | null): Row | null => {
  if (anchor && !isCancelled(anchor)) return anchor;
  if (member && !isCancelled(member)) return member;
  return anchor ?? member;
};

/**
 * The bill covering one venue, or `row: null` when no bill does.
 *
 * Shaped as `.eq("venue_id").maybeSingle()` + (only when needed) one membership read, so the
 * common single-venue path issues exactly the query it issued before Phase 1.
 */
export async function loadBillingForVenue<Row extends ResolvableBillRow>(
  venueId: string,
  columns: string
): Promise<VenueBillingOne<Row>> {
  if (!supabaseAdmin) return { ok: false, error: "supabase-admin-unconfigured" };
  const id = venueId.trim();
  if (!id) return { ok: true, row: null };

  const select = withResolverColumns(columns);

  const anchor = await supabaseAdmin
    .from("billing_subscriptions")
    .select(select)
    .eq("venue_id", id)
    .maybeSingle<Row>();
  if (anchor.error) return { ok: false, error: `billing-read-failed: ${anchor.error.message}` };
  const anchorRow = anchor.data ?? null;
  if (anchorRow && !isCancelled(anchorRow)) return { ok: true, row: anchorRow };

  const memberships = await readMemberships([id], true);
  if (!memberships.ok) return memberships;
  const membership = memberships.rows.find((m) => m.venue_id === id) ?? null;
  if (!membership || (anchorRow && membership.subscription_id === anchorRow.id)) {
    return { ok: true, row: anchorRow };
  }

  const bill = await supabaseAdmin
    .from("billing_subscriptions")
    .select(select)
    .eq("id", membership.subscription_id)
    .maybeSingle<Row>();
  if (bill.error) return { ok: false, error: `billing-read-failed: ${bill.error.message}` };

  return { ok: true, row: pickBill(anchorRow, bill.data ?? null) };
}

/**
 * Venues (of these) that have EVER been on a bill — anchor of any `billing_subscriptions` row in
 * any status, or a membership row, removed or not.
 *
 * This is the "never paid, ever" proof the destructive paths need (pending-signup clause 3, the
 * abandoned-signup sweep): a venue that was ever billed is never swept, even after it was taken
 * off its bill, because a cancelled or removed venue keeps its rows precisely as that proof.
 */
export async function venueIdsEverBilled(venueIds: readonly string[]): Promise<VenueIdSetResult> {
  if (!supabaseAdmin) return { ok: false, error: "supabase-admin-unconfigured" };
  const ids = Array.from(new Set(venueIds.filter((id) => typeof id === "string" && id.trim() !== "")));
  const billed = new Set<string>();
  if (ids.length === 0) return { ok: true, venueIds: billed };

  const anchors = await supabaseAdmin
    .from("billing_subscriptions")
    .select("venue_id")
    .in("venue_id", ids)
    .returns<{ venue_id: string }[]>();
  if (anchors.error) return { ok: false, error: `billing-read-failed: ${anchors.error.message}` };
  for (const row of anchors.data ?? []) {
    if (ids.includes(row.venue_id)) billed.add(row.venue_id);
  }

  const remaining = ids.filter((id) => !billed.has(id));
  const memberships = await readMemberships(remaining, false);
  if (!memberships.ok) return memberships;
  for (const row of memberships.rows) {
    if (remaining.includes(row.venue_id)) billed.add(row.venue_id);
  }

  return { ok: true, venueIds: billed };
}

/**
 * Every venue currently on a bill (anchor first, then the others by venue id). Used to count
 * venues for pricing (Phase 3) and to act on a whole bill. Removed venues are left out unless
 * `includeRemoved` — which the admin venue delete needs, because a removed venue's history row
 * still blocks deleting the anchor (ON DELETE RESTRICT, see the Phase 1 migration).
 */
export async function venueIdsOnBill(
  subscriptionId: string,
  options: { includeRemoved?: boolean } = {}
): Promise<{ ok: true; anchorVenueId: string | null; venueIds: string[] } | { ok: false; error: string }> {
  if (!supabaseAdmin) return { ok: false, error: "supabase-admin-unconfigured" };

  const bill = await supabaseAdmin
    .from("billing_subscriptions")
    .select("id, venue_id")
    .eq("id", subscriptionId)
    .maybeSingle<{ id: string; venue_id: string }>();
  if (bill.error) return { ok: false, error: `billing-read-failed: ${bill.error.message}` };
  if (!bill.data) return { ok: true, anchorVenueId: null, venueIds: [] };

  const anchorVenueId = bill.data.venue_id;
  const members = await supabaseAdmin
    .from(BILLING_MEMBERSHIP_TABLE)
    .select("venue_id, subscription_id, removed_at")
    .eq("subscription_id", subscriptionId)
    .returns<MembershipRow[]>();

  let others: string[] = [];
  if (members.error) {
    if (!isMissingMembershipTable(members.error)) {
      return { ok: false, error: `membership-read-failed: ${members.error.message ?? "unknown"}` };
    }
    noteMissingTable();
  } else {
    others = (Array.isArray(members.data) ? members.data : [])
      .filter(isMembershipRow)
      .filter((m) => (options.includeRemoved || !m.removed_at) && m.venue_id !== anchorVenueId)
      .map((m) => m.venue_id)
      .sort();
  }

  // The anchor is always on its own bill (plan §4.4: re-anchor before removing it).
  return { ok: true, anchorVenueId, venueIds: [anchorVenueId, ...others] };
}

/** How many venues a bill currently covers (≥ 1 for any existing bill). */
export async function billedVenueCount(
  subscriptionId: string
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const result = await venueIdsOnBill(subscriptionId);
  if (!result.ok) return result;
  return { ok: true, count: result.venueIds.length };
}

export type AddVenueToBillResult =
  | { ok: true; inserted: boolean }
  | { ok: false; error: string };

/**
 * Put a venue on a bill — the ONLY writer of non-anchor membership rows (anchor rows come from the
 * database trigger; see the Phase 1 migration). Multi-venue billing Phase 3 calls it once a
 * partner's "Add a venue" charge has succeeded (`role: "added"`); Phase 6's admin attach will pass
 * `"admin"`.
 *
 * Idempotent, because the route and the Stripe webhook can both complete the same add:
 *   - no row yet → inserted (`inserted: true`);
 *   - already ACTIVE on this bill → nothing to do (`inserted: false`);
 *   - on ANOTHER bill, or taken off this one → `ok: false`. A venue is on at most one bill
 *     (venue_id UNIQUE), and moving one between bills or putting a removed one back is not this
 *     function's call (Phase 5 / 6).
 */
export async function addVenueToBill(
  subscriptionId: string,
  venueId: string,
  role: "added" | "admin"
): Promise<AddVenueToBillResult> {
  if (!supabaseAdmin) return { ok: false, error: "supabase-admin-unconfigured" };
  const billId = subscriptionId.trim();
  const id = venueId.trim();
  if (!billId || !id) return { ok: false, error: "membership-args-missing" };

  const inserted = await supabaseAdmin
    .from(BILLING_MEMBERSHIP_TABLE)
    .upsert(
      { subscription_id: billId, venue_id: id, role, added_at: new Date().toISOString() },
      { onConflict: "venue_id", ignoreDuplicates: true }
    )
    .select("id")
    .returns<{ id: string }[]>();
  if (inserted.error) {
    return { ok: false, error: `membership-write-failed: ${inserted.error.message ?? "unknown"}` };
  }
  if ((inserted.data ?? []).length > 0) return { ok: true, inserted: true };

  // A row already holds this venue. Fine only if it is this bill's, and active.
  const existing = await supabaseAdmin
    .from(BILLING_MEMBERSHIP_TABLE)
    .select("venue_id, subscription_id, removed_at")
    .eq("venue_id", id)
    .maybeSingle<MembershipRow>();
  if (existing.error) {
    return { ok: false, error: `membership-read-failed: ${existing.error.message ?? "unknown"}` };
  }
  const row = existing.data;
  if (row && row.subscription_id === billId && !row.removed_at) return { ok: true, inserted: false };
  return {
    ok: false,
    error: row ? (row.subscription_id === billId ? "venue-removed-from-bill" : "venue-on-another-bill") : "membership-missing",
  };
}
