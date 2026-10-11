#!/usr/bin/env node
// READ-ONLY. Multi-venue billing (docs/multi-venue-volume-billing-plan.md) Phase 1 check:
// for every owner-linked venue, compares lib/venueBilling.ts's answer ("which bill covers this
// venue?") with the pre-Phase-1 query (billing_subscriptions by venue_id), and prints each bill's
// venue count. Before any venue is added to a chain, every line must say SAME and every count 1.
// Prints `[VenueBilling] membership-table-missing` until migration 20261011134820 is applied.
//
//   npm run billing:check-venue-billing
//
// Writes nothing. Venue ids and counts only — no emails, amounts or Stripe ids are printed.
const { loadBillingForVenues, venueIdsEverBilled, billedVenueCount } = require("../lib/venueBilling.ts");
const { supabaseAdmin } = require("../lib/supabaseAdmin.ts");

(async () => {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured (run via npm so .env.local loads).");
  const { data: links, error: linkError } = await supabaseAdmin.from("venue_owner_venues").select("venue_id");
  if (linkError) throw new Error(`venue_owner_venues read: ${linkError.message}`);
  const ids = Array.from(new Set(links.map((l) => l.venue_id))).sort();

  const { data: anchors, error: anchorError } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("id, venue_id")
    .in("venue_id", ids);
  if (anchorError) throw new Error(`billing_subscriptions read: ${anchorError.message}`);
  const anchorByVenue = new Map(anchors.map((r) => [r.venue_id, r.id]));

  const resolved = await loadBillingForVenues(ids, "amount_cents");
  if (!resolved.ok) throw new Error(resolved.error);

  let mismatches = 0;
  for (const id of ids) {
    const before = anchorByVenue.get(id) ?? null;
    const now = resolved.byVenue.get(id)?.id ?? null;
    const verdict = before === now ? "SAME" : before === null ? "NOW ON A BILL (chain member)" : "DIFFERENT";
    if (before !== now && before !== null) mismatches += 1;
    console.log(`${id}: before=${before ? "own bill" : "none"} resolver=${now ? (now === before ? "own bill" : "another venue's bill") : "none"} ${verdict}`);
  }

  const ever = await venueIdsEverBilled(ids);
  console.log(`\never billed: ${ever.ok ? [...ever.venueIds].sort().join(", ") || "(none)" : `ERROR ${ever.error}`}`);

  console.log("\nvenues per bill:");
  for (const row of anchors) {
    const count = await billedVenueCount(row.id);
    console.log(`  bill anchored on ${row.venue_id}: ${count.ok ? count.count : `ERROR ${count.error}`}`);
  }

  console.log(mismatches === 0 ? "\nOK — no venue lost or changed its own bill." : `\n${mismatches} venue(s) resolve to a different bill — investigate.`);
  process.exit(mismatches === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
