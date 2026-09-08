#!/usr/bin/env node
/**
 * Partner Self-Serve Signup — Phase 5a §3 precondition check.
 * docs/partner-self-serve-signup-plan.md
 *
 * The plan wants a unique index on `venue_owner_venues (venue_id)` so two
 * simultaneous claims cannot both win. That index FAILS TO BUILD if any venue
 * today already has more than one owner row, so the migration must not ship
 * until this returns clean.
 *
 * The SQL equivalent, for the record:
 *
 *   select venue_id, count(*) from venue_owner_venues
 *   group by venue_id having count(*) > 1;
 *
 * PostgREST cannot GROUP BY, so this pages the table (it is small — one row per
 * owner/venue pair) and groups in JS. READ ONLY: it writes nothing.
 *
 * Run: npm run signup:check-claim-precondition
 */
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = String(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
).trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Run via: npm run signup:check-claim-precondition (loads .env.local)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const PAGE = 1000;

async function main() {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("venue_owner_venues")
      .select("venue_id, owner_id")
      .order("venue_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("Query failed:", error.message);
      process.exit(1);
    }
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }

  const byVenue = new Map();
  for (const row of rows) {
    const list = byVenue.get(row.venue_id) ?? [];
    list.push(row.owner_id);
    byVenue.set(row.venue_id, list);
  }

  const duplicates = Array.from(byVenue.entries()).filter(([, owners]) => owners.length > 1);

  console.log(`venue_owner_venues rows: ${rows.length}`);
  console.log(`distinct venues:         ${byVenue.size}`);
  console.log(`venues with >1 owner:    ${duplicates.length}`);

  if (duplicates.length === 0) {
    console.log("\nCLEAN — safe to ship the venue_owner_venues(venue_id) unique index.");
    process.exit(0);
  }

  console.log("\nNOT CLEAN. Do NOT ship the migration. These venues have multiple owners:");
  for (const [venueId, owners] of duplicates) {
    console.log(`  ${venueId} → ${owners.length} owners: ${owners.join(", ")}`);
  }
  console.log(
    "\nThis is a product question for Andrew (is co-ownership intended?), not\n" +
      "something to auto-resolve by deleting somebody's access."
  );
  process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
