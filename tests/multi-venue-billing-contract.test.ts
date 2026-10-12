import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Multi-venue billing Phase 3 — static tripwires for "Add a venue"
 * (docs/multi-venue-volume-billing-plan.md §4.3). The behaviour is tested end to end in
 * tests/api.owner.venues-add.test.ts; these pin the rules that must not be quietly edited away.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const listSourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(path.relative(ROOT, full).split(path.sep).join("/"));
    }
  };
  walk(path.join(ROOT, dir));
  return out;
};
const sources = ["app", "lib", "components"].flatMap(listSourceFiles);

const FLOW = "lib/venueAddition.ts";
/** Phase 6: modules that may READ the add ledger (never write it). */
const ADDITION_LEDGER_READERS = ["lib/billingQuantityDrift.ts"];
/**
 * Modules that may READ the change ledger without writing it directly: the drift check, and (Phase
 * 6.1) the admin price swap, which writes its `price` rows only through its own two RPCs.
 */
const CHANGE_LEDGER_READERS = ["lib/billingCustomPrice.ts", "lib/billingQuantityDrift.ts"];
const CUSTOM_PRICE = "lib/billingCustomPrice.ts";
const ADD_ROUTE = "app/api/owner/venues/add/route.ts";
const QUOTE_ROUTE = "app/api/owner/venues/add/quote/route.ts";

describe("multi-venue billing — Add a venue contract", () => {
  it("the flag has one reader, and both partner routes check it before anything else", () => {
    const readers = sources.filter((rel) => read(rel).includes("process.env.NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED"));
    expect(readers).toEqual(["lib/multiVenueBilling.ts"]);
    for (const route of [ADD_ROUTE, QUOTE_ROUTE]) {
      const src = stripComments(read(route));
      const flagAt = src.indexOf("isMultiVenueBillingEnabled()");
      expect(flagAt, route).toBeGreaterThan(-1);
      expect(flagAt, `${route}: flag before auth`).toBeLessThan(src.indexOf("requireOwnerAuth(request)"));
      expect(src.indexOf("requireOwnerAuth(request)"), `${route}: auth before the rate limit`).toBeLessThan(
        src.indexOf("rateLimit(request")
      );
    }
  });

  it("finishing an add is NOT flag-gated: the webhook and the cron complete adds already under way", () => {
    const webhook = stripComments(read("app/api/webhooks/stripe/route.ts"));
    expect(webhook).toContain("completeVenueAdditionForInvoice(invoice)");
    expect(webhook).not.toContain("isMultiVenueBillingEnabled");
    const cron = stripComments(read("app/api/cron/billing/route.ts"));
    expect(cron).toContain("reconcileStaleVenueAdditions(");
    expect(cron).not.toContain("isMultiVenueBillingEnabled");
  });

  it("the ledger and its claim RPC are used only by the flow module (+ Phase 6's read-only drift check)", () => {
    const ledgerUsers = sources.filter((rel) => /["']billing_venue_additions["']/.test(read(rel)));
    expect(ledgerUsers.sort()).toEqual([...ADDITION_LEDGER_READERS, FLOW].sort());
    const rpcUsers = sources.filter((rel) => read(rel).includes('"claim_venue_addition"'));
    expect(rpcUsers).toEqual([FLOW]);
  });

  it("Phase 6: the admin price swap and the drift check only READ the ledgers", () => {
    for (const rel of new Set([...ADDITION_LEDGER_READERS, ...CHANGE_LEDGER_READERS])) {
      const source = stripComments(read(rel));
      const touches = source.match(/\.from\(\s*["']billing_venue_(?:additions|changes)["']\s*\)/g) ?? [];
      const reads = source.match(/\.from\(\s*["']billing_venue_(?:additions|changes)["']\s*\)\s*\.select\(/g) ?? [];
      expect(touches.length, rel).toBeGreaterThan(0);
      expect(reads.length, rel).toBe(touches.length);
    }
  });

  it("Phase 6: the drift check is report-only and runs in the daily billing cron", () => {
    const drift = stripComments(read("lib/billingQuantityDrift.ts"));
    for (const write of [".insert(", ".update(", ".upsert(", ".delete(", ".rpc(", "subscriptions.update(", "invoices."]) {
      expect(drift, write).not.toContain(write);
    }
    expect(drift).toContain("quantity-drift bill=");
    expect(stripComments(read("app/api/cron/billing/route.ts"))).toContain("checkBillingQuantityDrift()");
  });

  it("Phase 6: admin 'Add to their bill' charges ONLY through the partner's add flow", () => {
    const attach = stripComments(read("lib/adminVenueAttach.ts"));
    expect(attach).toContain("startVenueAddition(");
    expect(attach).toContain("adminAttachVenue: venue");
    // No Stripe client, no venue creation, no hand-rolled membership for a card bill.
    expect(attach).not.toMatch(/from "@\/lib\/stripe"[^;]*\bstripe\b/);
    expect(attach).not.toContain("stripe.");
    expect(attach).not.toContain("createAdminVenue");
  });

  it("Phase 6: a custom rate keeps the venue count and never prorates", () => {
    const custom = stripComments(read(CUSTOM_PRICE));
    expect(custom).toContain("items: [{ id: items[0].id, price: priceId, quantity }]");
    expect(custom).toContain("proration_behavior: CUSTOM_PRICE_PRORATION_BEHAVIOR");
    expect(custom.match(/stripe!?\.subscriptions\.update\(/g) ?? []).toHaveLength(1);
  });

  it("Phase 6.1: the price swap claims the bill's lock BEFORE it reads Stripe, and only through its RPCs", () => {
    const custom = stripComments(read(CUSTOM_PRICE));
    const swap = custom.slice(custom.indexOf("async function swapSubscriptionPrice"));
    const claimAt = swap.indexOf("claimPriceChange(");
    expect(claimAt).toBeGreaterThan(-1);
    expect(claimAt).toBeLessThan(swap.indexOf("subscriptions.retrieve("));
    expect(swap.indexOf("subscriptions.retrieve(")).toBeLessThan(swap.indexOf("subscriptions.update("));
    expect(swap).toContain("{ idempotencyKey: key }");
    // No unlocked read-then-write fallback, and no direct write to the ledger.
    expect(custom).not.toContain("venueChangeInFlight");
    expect(custom).not.toContain("billing_venue_additions");
    expect(sources.filter((rel) => read(rel).includes('"claim_bill_price_change"'))).toEqual([CUSTOM_PRICE]);
    expect(sources.filter((rel) => read(rel).includes('"finish_bill_price_change"'))).toEqual([CUSTOM_PRICE]);
    // Stale price rows are settled by the daily cron and before every add / quote / remove / swap.
    expect(stripComments(read("app/api/cron/billing/route.ts"))).toContain("reconcileStaleBillPriceChanges(");
    const removal = stripComments(read("lib/venueRemoval.ts"));
    const settle = removal.slice(removal.indexOf("export async function settleStaleVenueChangesForBill"));
    expect(settle).toContain("settleStaleBillPriceChangesForBill(billId, nowMs)");
    const admin = stripComments(read("app/api/admin/billing/route.ts"));
    for (const call of ["setCustomPrice(row", "setStandardPrice(row"]) {
      const at = admin.indexOf(call);
      expect(at, call).toBeGreaterThan(-1);
      expect(admin.lastIndexOf("settleStaleVenueChangesForBill(row.id)", at), call).toBeGreaterThan(admin.lastIndexOf("async function", at));
    }
  });

  it("Phase 6.1: the Remove / Undo reconcilers never read a price row as a venue change", () => {
    const removal = stripComments(read("lib/venueRemoval.ts"));
    expect(removal.match(/\.in\("action", VENUE_CHANGE_ACTIONS\)/g) ?? []).toHaveLength(2);
    expect(removal).toContain('const VENUE_CHANGE_ACTIONS: VenueBillChangeAction[] = ["remove", "undo"];');
  });

  it("Phase 6.1: add and Remove / Undo re-read Stripe AFTER their claim and update from that read", () => {
    const flow = stripComments(read(FLOW));
    const start = flow.slice(flow.indexOf("export async function startVenueAddition"));
    expect(start.indexOf("claimAddition(")).toBeLessThan(start.indexOf("stripe.subscriptions.retrieve("));
    expect(start.indexOf("postClaimCheck(")).toBeLessThan(start.indexOf("stripe.subscriptions.update("));
    expect(start).toContain("items: [{ id: liveItem.id, quantity: row.quantity_after as number }]");
    expect(start).not.toContain("context.item.quantity");
    expect(start).not.toContain("context.subscription.pending_update");
    const removal = stripComments(read("lib/venueRemoval.ts"));
    const change = removal.slice(removal.indexOf("export async function startVenueChange"));
    expect(change.indexOf('"claim_venue_bill_change"')).toBeLessThan(change.indexOf("stripe.subscriptions.retrieve("));
    expect(change.indexOf("postClaimCheck(")).toBeLessThan(change.indexOf("stripe.subscriptions.update("));
    expect(change).toContain("items: [{ id: checked.item.id, quantity: row.quantity_after }]");
    expect(change).not.toContain("context.item.quantity");
  });

  it("the charge applies the new quantity ONLY if the prorated invoice is paid, keyed on the ledger row", () => {
    const flow = stripComments(read(FLOW));
    expect(flow).toContain('payment_behavior: "pending_if_incomplete"');
    expect(flow).toContain('proration_behavior: "always_invoice"');
    expect(flow).toContain("{ idempotencyKey: row.idempotency_key }");
    for (const forbidden of ["error_if_incomplete", "allow_incomplete", "default_incomplete"]) {
      expect(flow, forbidden).not.toContain(forbidden);
    }
    // Exactly one subscription write in the whole flow.
    expect(flow.match(/stripe\.subscriptions\.update\(/g) ?? []).toHaveLength(1);
  });

  it("the venue is created hidden and stamped in ONE insert (revealable + sweepable), never visible first", () => {
    const flow = stripComments(read(FLOW));
    const create = flow.slice(flow.indexOf("createAdminVenue({"), flow.indexOf("});", flow.indexOf("createAdminVenue({")));
    expect(create).toContain("hidden: true");
    expect(create).toContain("selfServeCreatedAt:");
    expect(create).toContain("checkoutStartedAt:");
  });

  it("a declined charge voids its invoice before the venue is deleted, and the reveal clears rehidden_at", () => {
    const flow = stripComments(read(FLOW));
    const fail = flow.slice(flow.indexOf("async function failAddition"), flow.indexOf("export type ReconcileState"));
    expect(fail.indexOf("voidInvoice(")).toBeGreaterThan(-1);
    expect(fail.indexOf("voidInvoice(")).toBeLessThan(fail.indexOf("deleteUnbilledAddedVenue("));
    expect(flow).toContain('.update({ hidden: false, rehidden_at: null })');
    expect(flow).toContain('.or("latitude.neq.0,longitude.neq.0")');
  });

  it("the duplicate-address scan is the shared one (lib/nearbyVenue.ts), never a copy", () => {
    const flow = stripComments(read(FLOW));
    expect(flow).toMatch(/import \{[^}]*\bfindNearbyVenue\b[^}]*\} from "@\/lib\/nearbyVenue"/);
    expect(flow).not.toContain("calculateDistanceMeters");
    expect(sources.filter((rel) => /function findNearbyVenue\b/.test(read(rel)))).toEqual(["lib/nearbyVenue.ts"]);
  });

  it("Phase 5: the change ledger and its RPCs are used only by lib/venueRemoval.ts (+ Phase 6's read-only checks)", () => {
    const REMOVAL = "lib/venueRemoval.ts";
    expect(sources.filter((rel) => /["']billing_venue_changes["']/.test(read(rel))).sort()).toEqual(
      [...CHANGE_LEDGER_READERS, REMOVAL].sort()
    );
    expect(sources.filter((rel) => read(rel).includes('"claim_venue_bill_change"'))).toEqual([REMOVAL]);
    expect(sources.filter((rel) => read(rel).includes('"finish_venue_bill_change"'))).toEqual([REMOVAL]);
  });

  it("Phase 5: Remove / Undo never prorate, write Stripe once, keyed on the ledger row", () => {
    const flow = stripComments(read("lib/venueRemoval.ts"));
    expect(flow).toContain('proration_behavior: "none"');
    for (const forbidden of ["always_invoice", "create_prorations", "pending_if_incomplete", "error_if_incomplete"]) {
      expect(flow, forbidden).not.toContain(forbidden);
    }
    expect(flow.match(/stripe\.subscriptions\.update\(/g) ?? []).toHaveLength(1);
    expect(flow).toContain("{ idempotencyKey: row.idempotency_key }");
    // The removal job hides with the "we hid this" stamp, so a paid Add back can un-hide it.
    expect(flow).toContain(".update({ hidden: true, rehidden_at: nowIso })");
  });

  it("Phase 5: the remove route checks the flag, then auth, then the rate limit; the cron jobs are not flag-gated", () => {
    const route = stripComments(read("app/api/owner/venues/remove/route.ts"));
    const flagAt = route.indexOf("isMultiVenueBillingEnabled()");
    expect(flagAt).toBeGreaterThan(-1);
    expect(flagAt).toBeLessThan(route.indexOf("requireOwnerAuth(request)"));
    expect(route.indexOf("requireOwnerAuth(request)")).toBeLessThan(route.indexOf("rateLimit(request"));
    const cron = stripComments(read("app/api/cron/billing/route.ts"));
    expect(cron).toContain("reconcileStaleVenueChanges(");
    expect(cron).toContain("applyDueVenueRemovals(");
  });

  it("prices come from lib/venuePricing.ts, never literals", () => {
    for (const rel of [
      FLOW,
      ADD_ROUTE,
      QUOTE_ROUTE,
      "lib/multiVenueBilling.ts",
      "lib/venueRemoval.ts",
      "lib/billAccountView.ts",
      "app/api/owner/venues/remove/route.ts",
      "components/owner/billing/BillVenuesPanel.tsx",
      "app/owner/billing/page.tsx",
    ]) {
      expect(read(rel), rel).not.toMatch(/\b(10000|7500|6000|4500)\b/);
    }
  });

  it("Phase 6.2: the custom_monthly_ prefix is written once, and only it makes a per-venue rate", () => {
    const holders = sources.filter((rel) => stripComments(read(rel)).includes('"custom_monthly_"') || stripComments(read(rel)).includes("`custom_monthly_"));
    expect(holders).toEqual(["lib/venuePricing.ts"]);
    expect(stripComments(read(CUSTOM_PRICE))).toContain("`${CUSTOM_PER_VENUE_LOOKUP_PREFIX}${cents}`");
    const pricing = stripComments(read("lib/venuePricing.ts"));
    const rateFn = pricing.slice(pricing.indexOf("export const billRateFromPrice"), pricing.indexOf("export const unratedPriceRefusal"));
    expect(rateFn).toContain("startsWith(CUSTOM_PER_VENUE_LOOKUP_PREFIX)");
    // Dead since Phase 6 (review #9).
    expect(stripComments(read(FLOW))).not.toContain("isGraduatedPrice");
    // Both partner flows give an unrated Price its true refusal (custom_rate / billing_state).
    expect(stripComments(read(FLOW))).toContain("code: unratedItemRefusal(item)");
    expect(stripComments(read("lib/venueRemoval.ts"))).toContain("code: unratedItemRefusal(item)");
  });
});
