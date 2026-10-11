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

  it("the ledger and its claim RPC are used only by the flow module", () => {
    const ledgerUsers = sources.filter((rel) => /["']billing_venue_additions["']/.test(read(rel)));
    expect(ledgerUsers).toEqual([FLOW]);
    const rpcUsers = sources.filter((rel) => read(rel).includes('"claim_venue_addition"'));
    expect(rpcUsers).toEqual([FLOW]);
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

  it("prices come from lib/venuePricing.ts, never literals", () => {
    for (const rel of [FLOW, ADD_ROUTE, QUOTE_ROUTE, "lib/multiVenueBilling.ts"]) {
      expect(read(rel), rel).not.toMatch(/\b(10000|7500|6000|4500)\b/);
    }
  });
});
