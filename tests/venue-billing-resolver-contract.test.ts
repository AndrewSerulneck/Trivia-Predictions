import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Multi-venue volume billing, Phase 1 (docs/multi-venue-volume-billing-plan.md §4.2).
 *
 * "Which bill covers this venue?" has ONE home: lib/venueBilling.ts. Since Phase 1 a venue can be
 * on another venue's bill (billing_subscription_venues), so a direct
 * `.from("billing_subscriptions")…eq("venue_id", …)` read silently answers "no bill" for it — and
 * the readers that act on that answer include the abandoned-signup sweep and pending-signup
 * purge, which DELETE venues they think were never paid for.
 *
 * Writes keyed by the row's own `id`, owner-keyed reads, Stripe-id-keyed reads and unfiltered
 * scans are all fine. The only venue-keyed read allowed outside the resolver is the Stripe
 * webhook's lookup of a NOT-YET-TRACKED subscription by its metadata anchor venue.
 */

const ROOT = process.cwd();
const SCANNED_DIRS = ["app", "lib", "components"];
const RESOLVER = "lib/venueBilling.ts";
const WEBHOOK = "app/api/webhooks/stripe/route.ts";

const listSourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
  };
  walk(path.join(ROOT, dir));
  return out;
};

const relative = (file: string) => path.relative(ROOT, file).split(path.sep).join("/");

/** Each `.from("<table>")` call's chain, up to the end of its statement. */
const chainsOn = (source: string, table: string): string[] => {
  const chains: string[] = [];
  const needle = `.from("${table}")`;
  let index = source.indexOf(needle);
  while (index !== -1) {
    const end = source.indexOf(";", index);
    chains.push(source.slice(index, end === -1 ? undefined : end));
    index = source.indexOf(needle, index + needle.length);
  }
  return chains;
};

const VENUE_KEYED = /\.(eq|in|neq|match)\(\s*["']venue_id["']/;

const files = SCANNED_DIRS.flatMap(listSourceFiles);

describe("venue-keyed billing reads go through lib/venueBilling.ts", () => {
  it("no venue-keyed billing_subscriptions read outside the resolver (+ the webhook's one anchor lookup)", () => {
    const offenders: string[] = [];
    let webhookVenueKeyed = 0;
    for (const file of files) {
      const rel = relative(file);
      if (rel === RESOLVER) continue;
      const source = readFileSync(file, "utf8");
      for (const chain of chainsOn(source, "billing_subscriptions")) {
        if (!VENUE_KEYED.test(chain)) continue;
        if (rel === WEBHOOK) {
          webhookVenueKeyed += 1;
          continue;
        }
        offenders.push(`${rel}: ${chain.slice(0, 120).replace(/\s+/g, " ")}`);
      }
    }
    expect(offenders).toEqual([]);
    // Exactly one: the metadata-venue fallback for a subscription no row tracks yet.
    expect(webhookVenueKeyed).toBe(1);
  });

  it("the membership table is read and written only by the resolver", () => {
    const offenders = files
      .map((file) => [relative(file), readFileSync(file, "utf8")] as const)
      .filter(([rel, source]) => rel !== RESOLVER && /["']billing_subscription_venues["']/.test(source))
      .map(([rel]) => rel);
    expect(offenders).toEqual([]);
  });

  it("the webhook finds a tracked row by Stripe subscription id before the metadata venue", () => {
    const source = readFileSync(path.join(ROOT, WEBHOOK), "utf8");
    const bySubscription = source.indexOf('.eq("stripe_subscription_id", sub.id)');
    const byVenue = source.indexOf('.eq("venue_id", venueId)');
    expect(bySubscription).toBeGreaterThan(-1);
    expect(byVenue).toBeGreaterThan(bySubscription);
  });

  it("the webhook mirrors amount_cents from quantity × price, never a bare unit_amount (tiered prices have none)", () => {
    const source = readFileSync(path.join(ROOT, WEBHOOK), "utf8");
    expect(source).toContain("amount_cents: subscriptionMonthlyCents(items)");
    expect(source).not.toMatch(/amount_cents:\s*price\?\.unit_amount/);
  });

  it("the destructive paths ask the resolver whether a venue was ever billed", () => {
    for (const rel of ["lib/pendingSignup.ts", "lib/signupSweep.ts"]) {
      const source = readFileSync(path.join(ROOT, rel), "utf8");
      expect(source, rel).toContain("venueIdsEverBilled(");
    }
  });

  it("pricing has one home: no tier amounts hard-coded in billing code", () => {
    const offenders = files
      .map((file) => [relative(file), readFileSync(file, "utf8")] as const)
      .filter(([rel]) => rel !== "lib/venuePricing.ts" && /billing|venueBilling|stripe/i.test(rel))
      .filter(([, source]) => /\b(7500|6000|4500)\b/.test(source))
      .map(([rel]) => rel);
    expect(offenders).toEqual([]);
  });
});
