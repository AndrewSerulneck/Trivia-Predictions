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

/** A venue's membership row with its removal schedule (Phase 5). */
export type BillMembership = {
  venue_id: string;
  subscription_id: string;
  role: string;
  added_at: string | null;
  /** Set by Remove: the end of the paid period the venue stops being billed at. */
  remove_at: string | null;
  /** Set by the daily cron once `remove_at` has passed and the venue was taken off. */
  removed_at: string | null;
};

const MEMBERSHIP_COLUMNS = "venue_id, subscription_id, role, added_at, remove_at, removed_at";

/**
 * Is this membership BILLED — on the bill and on its next renewal? Neither taken off nor scheduled
 * to leave. The same rule as `claim_venue_addition` / `claim_venue_bill_change` in SQL; Stripe's
 * quantity must equal the number of billed rows.
 */
export const isBilledMembership = (row: Pick<BillMembership, "remove_at" | "removed_at">): boolean =>
  !row.removed_at && !row.remove_at;

/**
 * Has this membership left its bill — taken off by the cron, or past its `remove_at` and waiting for
 * the cron to notice (the period renewed without it either way)?
 */
export const hasLeftBill = (row: Pick<BillMembership, "remove_at" | "removed_at">, nowMs: number): boolean =>
  Boolean(row.removed_at) || (row.remove_at !== null && Date.parse(row.remove_at) <= nowMs);

/** One venue's membership row (any state), or null. A missing table is "none". */
export async function billMembershipOf(
  venueId: string
): Promise<{ ok: true; row: BillMembership | null } | { ok: false; error: string }> {
  if (!supabaseAdmin) return { ok: false, error: "supabase-admin-unconfigured" };
  const { data, error } = await supabaseAdmin
    .from(BILLING_MEMBERSHIP_TABLE)
    .select(MEMBERSHIP_COLUMNS)
    .eq("venue_id", venueId)
    .maybeSingle<BillMembership>();
  if (error) {
    if (isMissingMembershipTable(error)) {
      noteMissingTable();
      return { ok: true, row: null };
    }
    return { ok: false, error: `membership-read-failed: ${error.message ?? "unknown"}` };
  }
  return { ok: true, row: data ?? null };
}

/** Every membership row of a bill, any state (the Billing page's account view). */
export async function billMemberships(
  subscriptionId: string
): Promise<{ ok: true; rows: BillMembership[] } | { ok: false; error: string }> {
  if (!supabaseAdmin) return { ok: false, error: "supabase-admin-unconfigured" };
  const { data, error } = await supabaseAdmin
    .from(BILLING_MEMBERSHIP_TABLE)
    .select(MEMBERSHIP_COLUMNS)
    .eq("subscription_id", subscriptionId)
    .returns<BillMembership[]>();
  if (error) {
    if (isMissingMembershipTable(error)) {
      noteMissingTable();
      return { ok: true, rows: [] };
    }
    return { ok: false, error: `membership-read-failed: ${error.message ?? "unknown"}` };
  }
  return { ok: true, rows: Array.isArray(data) ? data : [] };
}

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
 * Why a venue that NO live bill covers is in that state (Phase 6.3, review #2 and #4):
 *   - `removed`  — it was on a bill and was taken off it (Phase 5's Remove; its membership row keeps
 *                  `removed_at`). `anchorVenueId` is that bill's anchor today (null if unreadable).
 *   - `comped`   — it was never on any bill, and its partner has a live bill for another venue: the
 *                  admin gave it free (Phase 6 "Free (comped)"), or it is a partner's internal venue.
 *   - `lapsed`   — (Phase 6.6) not removed, but its only bill history is on cancelled ("dead") bills,
 *                  and its partner has a live bill elsewhere — e.g. its own bill was cancelled and the
 *                  partner now pays on another venue's. It can REJOIN that bill (Add back; `rejoinStateOf`).
 *   - `unbilled` — anything else. `ownerBillId` is set when the partner still has a live bill that
 *                  does not cover this venue.
 * A removed or comped venue is NOT "no bill": Checkout must not open a second subscription for it.
 */
export type UnbilledVenueState =
  | { kind: "removed"; subscriptionId: string; anchorVenueId: string | null; removedAt: string | null; ownerBillId: string | null }
  | { kind: "comped"; ownerBillId: string }
  | { kind: "lapsed"; fromBillId: string; ownerBillId: string }
  | { kind: "unbilled"; ownerBillId: string | null };

type StateBillRow = { id: string; venue_id: string; status: string; owner_id: string | null };

/**
 * `unbilledVenueStates(venueIds, ownerIdByVenue)` — the state of each of these venues that no live
 * (non-`cancelled`) bill covers; a venue a live bill covers is left out of the map. `ownerIdByVenue`
 * is the partner each venue is linked to (`venue_owner_venues`).
 *
 * Reads, all bounded by the input: memberships of these venues (ANY state — a removed row is the
 * evidence), bills anchored on them (any status — "ever on a bill"), and the partners' live bills,
 * in parallel; then, only if a membership points at a bill none of those returned, that bill by id.
 * A missing membership table reads as "no rows" (anchors still count). Any other error is
 * `ok: false`, and callers that refuse on the answer (Checkout) fail CLOSED on it.
 */
export async function unbilledVenueStates(
  venueIds: readonly string[],
  ownerIdByVenue: ReadonlyMap<string, string>
): Promise<{ ok: true; byVenue: Map<string, UnbilledVenueState> } | { ok: false; error: string }> {
  if (!supabaseAdmin) return { ok: false, error: "supabase-admin-unconfigured" };
  const db = supabaseAdmin;
  const ids = Array.from(new Set(venueIds.filter((id) => typeof id === "string" && id.trim() !== "")));
  const byVenue = new Map<string, UnbilledVenueState>();
  if (ids.length === 0) return { ok: true, byVenue };
  const ownerIds = Array.from(new Set(ids.map((id) => ownerIdByVenue.get(id)).filter((id): id is string => Boolean(id))));
  const BILL_COLUMNS = "id, venue_id, status, owner_id";

  const [memberships, anchors, ownerBills] = await Promise.all([
    db.from(BILLING_MEMBERSHIP_TABLE).select(MEMBERSHIP_COLUMNS).in("venue_id", ids).returns<BillMembership[]>(),
    db.from("billing_subscriptions").select(BILL_COLUMNS).in("venue_id", ids).returns<StateBillRow[]>(),
    ownerIds.length > 0
      ? db.from("billing_subscriptions").select(BILL_COLUMNS).in("owner_id", ownerIds).neq("status", "cancelled").returns<StateBillRow[]>()
      : Promise.resolve({ data: [] as StateBillRow[], error: null }),
  ]);

  let membershipRows: BillMembership[] = [];
  if (memberships.error) {
    if (!isMissingMembershipTable(memberships.error)) {
      return { ok: false, error: `membership-read-failed: ${memberships.error.message ?? "unknown"}` };
    }
    noteMissingTable();
  } else {
    membershipRows = Array.isArray(memberships.data) ? memberships.data : [];
  }
  if (anchors.error) return { ok: false, error: `billing-read-failed: ${anchors.error.message}` };
  if (ownerBills.error) return { ok: false, error: `billing-read-failed: ${ownerBills.error.message}` };

  const billById = new Map<string, StateBillRow>();
  for (const row of [...(anchors.data ?? []), ...(ownerBills.data ?? [])]) billById.set(row.id, row);
  const missingBillIds = Array.from(
    new Set(membershipRows.map((row) => row.subscription_id).filter((id) => !billById.has(id)))
  );
  if (missingBillIds.length > 0) {
    const bills = await db.from("billing_subscriptions").select(BILL_COLUMNS).in("id", missingBillIds).returns<StateBillRow[]>();
    if (bills.error) return { ok: false, error: `billing-read-failed: ${bills.error.message}` };
    for (const row of bills.data ?? []) billById.set(row.id, row);
  }

  const membershipByVenue = new Map(membershipRows.map((row) => [row.venue_id, row]));
  const anchoredVenues = new Set((anchors.data ?? []).map((row) => row.venue_id));
  const isLive = (bill: StateBillRow | undefined): boolean => Boolean(bill) && !isCancelled(bill);

  for (const venueId of ids) {
    const membership = membershipByVenue.get(venueId);
    const ownBill = (anchors.data ?? []).find((row) => row.venue_id === venueId);
    // Covered by a live bill (the resolver's rules 1–2): not this function's question.
    if (isLive(ownBill)) continue;
    if (membership && !membership.removed_at && isLive(billById.get(membership.subscription_id))) continue;

    const ownerId = ownerIdByVenue.get(venueId);
    const ownerBill = (ownerBills.data ?? [])
      .filter((row) => row.owner_id === ownerId && !isCancelled(row))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    const ownerBillId = ownerBill?.id ?? null;

    if (membership?.removed_at) {
      byVenue.set(venueId, {
        kind: "removed",
        subscriptionId: membership.subscription_id,
        anchorVenueId: billById.get(membership.subscription_id)?.venue_id ?? null,
        removedAt: membership.removed_at,
        ownerBillId,
      });
    } else if (!membership && !anchoredVenues.has(venueId) && ownerBillId) {
      byVenue.set(venueId, { kind: "comped", ownerBillId });
    } else if (ownerBillId && (membership || ownBill)) {
      // History only on dead bills: a live one would have been `continue`d above.
      byVenue.set(venueId, {
        kind: "lapsed",
        fromBillId: membership?.subscription_id ?? (ownBill as StateBillRow).id,
        ownerBillId,
      });
    } else {
      byVenue.set(venueId, { kind: "unbilled", ownerBillId });
    }
  }
  return { ok: true, byVenue };
}

/**
 * Must this venue NOT open a bill of its own? Removed from a bill, comped, or its partner already
 * has a live bill for another venue — one bill per partner (plan §2). Owner Checkout (Phase 6.3)
 * and the admin "Grant offline" (Phase 6.5) both refuse on it; `undefined` = a live bill already
 * covers the venue (renewing it is not a second bill).
 */
export const refusesOwnBill = (state: UnbilledVenueState | undefined): state is UnbilledVenueState =>
  state !== undefined && (state.kind !== "unbilled" || state.ownerBillId !== null);

/**
 * A live (non-`cancelled`) bill of this partner other than `exceptBillId`, or `billId: null`.
 * Checkout's "one bill per partner" check for the case the classifier above cannot see: a venue
 * whose own bill looked live in our mirror but turned out dead at Stripe.
 */
export async function otherLiveBillOfOwner(
  ownerId: string,
  exceptBillId: string
): Promise<{ ok: true; billId: string | null } | { ok: false; error: string }> {
  if (!supabaseAdmin) return { ok: false, error: "supabase-admin-unconfigured" };
  const { data, error } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("id")
    .eq("owner_id", ownerId)
    .neq("status", "cancelled")
    .neq("id", exceptBillId)
    .order("id", { ascending: true })
    .limit(1)
    .returns<{ id: string }[]>();
  if (error) return { ok: false, error: `billing-read-failed: ${error.message}` };
  return { ok: true, billId: data?.[0]?.id ?? null };
}

/**
 * Every venue currently on a bill (anchor first, then the others by venue id). Used to count
 * venues for pricing (Phase 3) and to act on a whole bill. Removed venues are left out unless
 * `includeRemoved` — which the admin venue delete needs, because a removed venue's history row
 * still blocks deleting the anchor (ON DELETE RESTRICT, see the Phase 1 migration).
 */
export async function venueIdsOnBill(
  subscriptionId: string,
  options: { includeRemoved?: boolean; billedOnly?: boolean } = {}
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
    .select("venue_id, subscription_id, removed_at, remove_at")
    .eq("subscription_id", subscriptionId)
    .returns<Array<MembershipRow & { remove_at?: string | null }>>();

  let others: string[] = [];
  if (members.error) {
    if (!isMissingMembershipTable(members.error)) {
      return { ok: false, error: `membership-read-failed: ${members.error.message ?? "unknown"}` };
    }
    noteMissingTable();
  } else {
    const rows = (Array.isArray(members.data) ? members.data : []).filter(
      (m): m is MembershipRow & { remove_at?: string | null } => isMembershipRow(m)
    );
    others = rows
      .filter((m) => m.venue_id !== anchorVenueId)
      .filter((m) =>
        options.billedOnly
          ? isBilledMembership({ remove_at: m.remove_at ?? null, removed_at: m.removed_at })
          : options.includeRemoved || !m.removed_at
      )
      .map((m) => m.venue_id)
      .sort();
    // Remove (Phase 5) moves the anchor to another venue before it leaves, so an anchor is billed;
    // drift (a failed re-anchor) is counted honestly rather than assumed.
    const anchorRow = rows.find((m) => m.venue_id === anchorVenueId);
    if (options.billedOnly && anchorRow && !isBilledMembership({ remove_at: anchorRow.remove_at ?? null, removed_at: anchorRow.removed_at })) {
      return { ok: true, anchorVenueId, venueIds: others };
    }
  }

  // The anchor is always on its own bill (Phase 5's Remove re-anchors before the anchor leaves).
  return { ok: true, anchorVenueId, venueIds: [anchorVenueId, ...others] };
}

/**
 * How many venues a bill BILLS, from rows already in hand — the same rule as `venueIdsOnBill(…,
 * { billedOnly: true })`: the anchor counts unless its own membership row says it is leaving or
 * gone; every other venue counts while billed. Pure, for whole-table passes (the admin billing
 * list, the daily drift check) that read every bill's memberships in one query.
 */
export const billedVenueCountFromRows = (
  anchorVenueId: string,
  rows: ReadonlyArray<Pick<BillMembership, "venue_id" | "remove_at" | "removed_at">>
): number => {
  const anchorRow = rows.find((row) => row.venue_id === anchorVenueId);
  const anchorBilled = !anchorRow || isBilledMembership(anchorRow);
  const others = rows.filter((row) => row.venue_id !== anchorVenueId && isBilledMembership(row)).length;
  return (anchorBilled ? 1 : 0) + others;
};

/**
 * Every membership row of these bills, any state, grouped by bill — ONE query for a whole-table
 * pass. A missing table is "no rows" (each bill then counts as its anchor alone).
 */
export async function billMembershipsForBills(
  subscriptionIds: readonly string[]
): Promise<{ ok: true; byBill: Map<string, BillMembership[]> } | { ok: false; error: string }> {
  if (!supabaseAdmin) return { ok: false, error: "supabase-admin-unconfigured" };
  const ids = Array.from(new Set(subscriptionIds.filter((id) => typeof id === "string" && id.trim() !== "")));
  const byBill = new Map<string, BillMembership[]>();
  if (ids.length === 0) return { ok: true, byBill };
  const { data, error } = await supabaseAdmin
    .from(BILLING_MEMBERSHIP_TABLE)
    .select(MEMBERSHIP_COLUMNS)
    .in("subscription_id", ids)
    .returns<BillMembership[]>();
  if (error) {
    if (isMissingMembershipTable(error)) {
      noteMissingTable();
      return { ok: true, byBill };
    }
    return { ok: false, error: `membership-read-failed: ${error.message ?? "unknown"}` };
  }
  for (const row of Array.isArray(data) ? data : []) {
    const list = byBill.get(row.subscription_id) ?? [];
    list.push(row);
    byBill.set(row.subscription_id, list);
  }
  return { ok: true, byBill };
}

/**
 * How many venues a bill BILLS — what Stripe's quantity must equal: on the bill and not scheduled
 * to leave (the same count as the `claim_venue_addition` / `claim_venue_bill_change` RPCs). A venue
 * set to leave at the period end is still covered (`venueIdsOnBill`) but no longer billed.
 */
export async function billedVenueCount(
  subscriptionId: string
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const result = await venueIdsOnBill(subscriptionId, { billedOnly: true });
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
 *   - already BILLED on this bill → nothing to do (`inserted: false`);
 *   - on this bill but taken off / set to leave → put back (Phase 5 "Add back"; `inserted: true`);
 *   - on ANOTHER bill that is `cancelled` (dead) → MOVED here (Phase 6.6 "rejoin"; `inserted: true`).
 *     The caller has already checked the venue is the partner's (`rejoinStateOf`) and the quantity
 *     was claimed under this bill's lock; the move is one update conditional on the old bill id;
 *   - on another LIVE bill → `ok: false`. A venue is on at most one bill (venue_id UNIQUE), and
 *     taking one off a live bill is Remove's job, never a side effect of an add.
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

  // A row already holds this venue. Fine if it is this bill's and billed; if it is this bill's but
  // taken off (or set to leave), this paid add PUTS IT BACK — Phase 5's "Add back": the partner has
  // just paid for it again, so it is billed from now on. Conditional on the row still being off, so
  // a second completion of the same add is a no-op.
  const existing = await supabaseAdmin
    .from(BILLING_MEMBERSHIP_TABLE)
    .select("venue_id, subscription_id, removed_at, remove_at")
    .eq("venue_id", id)
    .maybeSingle<MembershipRow & { remove_at: string | null }>();
  if (existing.error) {
    return { ok: false, error: `membership-read-failed: ${existing.error.message ?? "unknown"}` };
  }
  const row = existing.data;
  if (!row) return { ok: false, error: "membership-missing" };
  if (row.subscription_id !== billId) return moveFromDeadBill(row.subscription_id, billId, id, role);
  if (isBilledMembership({ remove_at: row.remove_at ?? null, removed_at: row.removed_at })) {
    return { ok: true, inserted: false };
  }

  const restored = await supabaseAdmin
    .from(BILLING_MEMBERSHIP_TABLE)
    .update({ removed_at: null, remove_at: null, added_at: new Date().toISOString() })
    .eq("venue_id", id)
    .eq("subscription_id", billId)
    .select("venue_id")
    .returns<{ venue_id: string }[]>();
  if (restored.error) {
    return { ok: false, error: `membership-write-failed: ${restored.error.message ?? "unknown"}` };
  }
  return { ok: true, inserted: (restored.data ?? []).length > 0 };
}

/**
 * Re-point a venue's membership row from a DEAD (`cancelled`) bill to `toBillId` (Phase 6.6). Refuses
 * when the old bill is live. The update is conditional on the row still being on the old bill, so a
 * second completion of the same add (which finds the row already moved) is a no-op.
 *
 * Why plain updates and not an RPC: the quantity guard is already in SQL (the add's claim, under the
 * TARGET bill's advisory lock). What is left — "the old bill is dead" — is never reversed while the
 * partner has a live bill: Checkout and Grant offline refuse a second bill (`refusesOwnBill`), and
 * Stripe never revives a cancelled subscription.
 */
async function moveFromDeadBill(
  fromBillId: string,
  toBillId: string,
  venueId: string,
  role: "added" | "admin" | "anchor"
): Promise<AddVenueToBillResult> {
  const from = await supabaseAdmin!
    .from("billing_subscriptions")
    .select("id, status")
    .eq("id", fromBillId)
    .maybeSingle<{ id: string; status: string }>();
  if (from.error) return { ok: false, error: `billing-read-failed: ${from.error.message}` };
  if (!from.data || from.data.status !== "cancelled") return { ok: false, error: "venue-on-another-bill" };

  const moved = await supabaseAdmin!
    .from(BILLING_MEMBERSHIP_TABLE)
    .update({ subscription_id: toBillId, role, added_at: new Date().toISOString(), remove_at: null, removed_at: null })
    .eq("venue_id", venueId)
    .eq("subscription_id", fromBillId)
    .select("venue_id")
    .returns<{ venue_id: string }[]>();
  if (moved.error) return { ok: false, error: `membership-write-failed: ${moved.error.message ?? "unknown"}` };
  if ((moved.data ?? []).length > 0) {
    console.log(`[VenueBilling] membership-moved venue=${venueId} from=${fromBillId} to=${toBillId} role=${role}`);
    return { ok: true, inserted: true };
  }

  // Someone moved it first (a concurrent completion of the same add): fine only if it is now here.
  const now = await billMembershipOf(venueId);
  if (!now.ok) return { ok: false, error: now.error };
  if (now.row && now.row.subscription_id === toBillId && isBilledMembership(now.row)) return { ok: true, inserted: false };
  return { ok: false, error: "membership-move-raced" };
}

// --- Rejoining a live bill from a dead one (Phase 6.6) -------------------------------------------

/**
 * Where a venue stands relative to the bill it is about to be added (back) to — the partner's live
 * bill `targetBillId`. Written once, here; "Add back" (lib/venueAddition.ts) and the admin's "Add to
 * their bill" (lib/adminVenueAttach.ts) both decide on it.
 *
 *   - `billed_here`     — on the target bill and billed, or anchors it → nothing to add.
 *   - `leaving_here`    — on the target bill, set to leave at the period end → that is Undo (free).
 *   - `left_here`       — on the target bill, taken off → Phase 5's Add back.
 *   - `dead_bill`       — its membership row sits on a `cancelled` bill, or it has no row and anchors
 *                         only a cancelled bill → may REJOIN (`addVenueToBill` moves the row).
 *                         `fromOwnerId` is that dead bill's partner.
 *   - `other_live_bill` — on, or anchoring, a different live bill → not addable (support).
 *   - `never_billed`    — no billing history at all (comped, a test venue) → not addable here.
 */
export type RejoinState =
  | { kind: "billed_here" }
  | { kind: "leaving_here" }
  | { kind: "left_here" }
  | { kind: "dead_bill"; fromBillId: string; fromOwnerId: string | null }
  | { kind: "other_live_bill"; billId: string }
  | { kind: "never_billed" };

type RejoinBillRow = { id: string; venue_id: string; status: string; owner_id: string | null };
const REJOIN_BILL_COLUMNS = "id, venue_id, status, owner_id";

/** `rejoinStateOf` on rows already read — pure, so the rule is tested without a database. */
export const classifyRejoin = (
  targetBillId: string,
  membership: Pick<BillMembership, "subscription_id" | "remove_at" | "removed_at"> | null,
  anchoredBill: Pick<RejoinBillRow, "id" | "status" | "owner_id"> | null,
  membershipBill: Pick<RejoinBillRow, "id" | "status" | "owner_id"> | null,
  nowMs: number
): RejoinState => {
  const dead = (bill: { status: string }): boolean => bill.status === "cancelled";
  if (anchoredBill && !dead(anchoredBill)) {
    return anchoredBill.id === targetBillId ? { kind: "billed_here" } : { kind: "other_live_bill", billId: anchoredBill.id };
  }
  if (membership) {
    if (membership.subscription_id === targetBillId) {
      if (isBilledMembership(membership)) return { kind: "billed_here" };
      return hasLeftBill(membership, nowMs) ? { kind: "left_here" } : { kind: "leaving_here" };
    }
    // FK ON DELETE RESTRICT: a membership's bill always exists; an unreadable one is not "dead".
    if (!membershipBill || membershipBill.id !== membership.subscription_id) {
      return { kind: "other_live_bill", billId: membership.subscription_id };
    }
    if (!dead(membershipBill)) return { kind: "other_live_bill", billId: membershipBill.id };
    return { kind: "dead_bill", fromBillId: membershipBill.id, fromOwnerId: membershipBill.owner_id ?? null };
  }
  if (anchoredBill) return { kind: "dead_bill", fromBillId: anchoredBill.id, fromOwnerId: anchoredBill.owner_id ?? null };
  return { kind: "never_billed" };
};

/**
 * `classifyRejoin` for one venue: its membership row (any state) and the bill anchored on it, in
 * parallel, then the membership's bill by id when it is not that one. Two or three bounded reads,
 * only when a partner or admin is adding a venue back.
 */
export async function rejoinStateOf(
  venueId: string,
  targetBillId: string,
  nowMs: number = Date.now()
): Promise<{ ok: true; state: RejoinState } | { ok: false; error: string }> {
  if (!supabaseAdmin) return { ok: false, error: "supabase-admin-unconfigured" };
  const id = venueId.trim();
  const [membership, anchored] = await Promise.all([
    billMembershipOf(id),
    supabaseAdmin.from("billing_subscriptions").select(REJOIN_BILL_COLUMNS).eq("venue_id", id).maybeSingle<RejoinBillRow>(),
  ]);
  if (!membership.ok) return { ok: false, error: membership.error };
  if (anchored.error) return { ok: false, error: `billing-read-failed: ${anchored.error.message}` };
  const anchoredBill = anchored.data ?? null;

  let membershipBill: RejoinBillRow | null = null;
  const row = membership.row;
  if (row && row.subscription_id !== targetBillId) {
    if (anchoredBill && anchoredBill.id === row.subscription_id) {
      membershipBill = anchoredBill;
    } else {
      const bill = await supabaseAdmin
        .from("billing_subscriptions")
        .select(REJOIN_BILL_COLUMNS)
        .eq("id", row.subscription_id)
        .maybeSingle<RejoinBillRow>();
      if (bill.error) return { ok: false, error: `billing-read-failed: ${bill.error.message}` };
      membershipBill = bill.data ?? null;
    }
  }
  return { ok: true, state: classifyRejoin(targetBillId, row, anchoredBill, membershipBill, nowMs) };
}

// --- Anchor-home repair (Phase 6.6) --------------------------------------------------------------

export type AnchorHomeResult =
  | { ok: true; outcome: "home" | "moved" | "inserted" | "not_live" | "anchor_on_live_bill" }
  | { ok: false; error: string };

/**
 * A LIVE bill whose anchor venue's membership row sits on a different, DEAD bill: bring it home
 * (`role 'anchor'`). This happens only after a rejoin moved an anchor off its own cancelled bill and
 * that bill was later revived (a resubscribe re-points the same row; the anchor trigger fires on
 * INSERT only). Left alone, the claim RPCs would count one venue fewer than Stripe bills and refuse
 * every add/remove. An anchor with no row at all gets one (what the trigger would have written).
 * A row on another LIVE bill is drift for an admin: logged, never moved.
 *
 * Best-effort callers (the Stripe webhook's first sync, admin Grant offline) log a failure and carry
 * on; the daily `/api/cron/billing` (`repairAnchorMemberships`) is the repair path.
 */
export async function bringAnchorHome(billId: string): Promise<AnchorHomeResult> {
  if (!supabaseAdmin) return { ok: false, error: "supabase-admin-unconfigured" };
  const bill = await supabaseAdmin
    .from("billing_subscriptions")
    .select("id, venue_id, status")
    .eq("id", billId)
    .maybeSingle<{ id: string; venue_id: string; status: string }>();
  if (bill.error) return { ok: false, error: `billing-read-failed: ${bill.error.message}` };
  if (!bill.data || isCancelled(bill.data)) return { ok: true, outcome: "not_live" };
  const anchorVenueId = bill.data.venue_id;

  const membership = await billMembershipOf(anchorVenueId);
  if (!membership.ok) return { ok: false, error: membership.error };
  const row = membership.row;
  if (row && row.subscription_id === billId) return { ok: true, outcome: "home" };

  if (!row) {
    const inserted = await supabaseAdmin
      .from(BILLING_MEMBERSHIP_TABLE)
      .upsert(
        { subscription_id: billId, venue_id: anchorVenueId, role: "anchor", added_at: new Date().toISOString() },
        { onConflict: "venue_id", ignoreDuplicates: true }
      )
      .select("id")
      .returns<{ id: string }[]>();
    if (inserted.error) {
      if (isMissingMembershipTable(inserted.error)) return { ok: true, outcome: "home" };
      return { ok: false, error: `membership-write-failed: ${inserted.error.message ?? "unknown"}` };
    }
    if ((inserted.data ?? []).length > 0) {
      console.log(`[VenueBilling] anchor-row-inserted venue=${anchorVenueId} bill=${billId}`);
      return { ok: true, outcome: "inserted" };
    }
    return bringAnchorHome(billId); // a row appeared in between: decide on it
  }

  const moved = await moveFromDeadBill(row.subscription_id, billId, anchorVenueId, "anchor");
  if (moved.ok) return { ok: true, outcome: "moved" };
  if (moved.error === "venue-on-another-bill") {
    console.error(
      `[VenueBilling] anchor-on-another-live-bill venue=${anchorVenueId} bill=${billId} other=${row.subscription_id} — needs an admin`
    );
    return { ok: true, outcome: "anchor_on_live_bill" };
  }
  return { ok: false, error: moved.error };
}

export type AnchorRepairResult = {
  liveBills: number;
  misplaced: number;
  moved: number;
  inserted: number;
  needsAdmin: number;
  failed: number;
  dryRun: boolean;
};

/**
 * Daily repair (`/api/cron/billing`): every live bill whose anchor's membership row is missing or on
 * another bill goes through `bringAnchorHome`. Two bounded reads (live bills; their anchors' rows);
 * normally nothing to do. A missing membership table is "nothing to do". Throws on a read error (the
 * cron catches and reports it).
 */
export async function repairAnchorMemberships(options: { dryRun?: boolean } = {}): Promise<AnchorRepairResult> {
  const dryRun = Boolean(options.dryRun);
  const result: AnchorRepairResult = { liveBills: 0, misplaced: 0, moved: 0, inserted: 0, needsAdmin: 0, failed: 0, dryRun };
  if (!supabaseAdmin) throw new Error("supabase-admin-unconfigured");

  const bills = await supabaseAdmin
    .from("billing_subscriptions")
    .select("id, venue_id")
    .neq("status", "cancelled")
    .returns<{ id: string; venue_id: string }[]>();
  if (bills.error) throw new Error(`billing-read-failed: ${bills.error.message}`);
  const live = bills.data ?? [];
  result.liveBills = live.length;
  if (live.length === 0) return result;

  const rows = await supabaseAdmin
    .from(BILLING_MEMBERSHIP_TABLE)
    .select("venue_id, subscription_id")
    .in(
      "venue_id",
      live.map((bill) => bill.venue_id)
    )
    .returns<{ venue_id: string; subscription_id: string }[]>();
  if (rows.error) {
    if (isMissingMembershipTable(rows.error)) {
      noteMissingTable();
      return result;
    }
    throw new Error(`membership-read-failed: ${rows.error.message ?? "unknown"}`);
  }
  const billOfAnchorRow = new Map((rows.data ?? []).map((row) => [row.venue_id, row.subscription_id]));

  for (const bill of live) {
    if (billOfAnchorRow.get(bill.venue_id) === bill.id) continue;
    result.misplaced += 1;
    console.warn(
      `[VenueBilling] anchor-row-misplaced bill=${bill.id} venue=${bill.venue_id} on=${billOfAnchorRow.get(bill.venue_id) ?? "none"}` +
        (dryRun ? " (dry run)" : "")
    );
    if (dryRun) continue;
    const fixed = await bringAnchorHome(bill.id);
    if (!fixed.ok) {
      result.failed += 1;
      console.error(`[VenueBilling] anchor-repair-failed bill=${bill.id}: ${fixed.error}`);
    } else if (fixed.outcome === "moved") result.moved += 1;
    else if (fixed.outcome === "inserted") result.inserted += 1;
    else if (fixed.outcome === "anchor_on_live_bill") result.needsAdmin += 1;
  }
  return result;
}
