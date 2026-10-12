#!/usr/bin/env node
// Multi-venue billing Phase 6.8 (review 6.5 #3): fill billing_subscriptions.stripe_price_lookup_key
// (migration 20261012033356) for rows written before the webhook started mirroring it.
//
//   npm run billing:backfill-lookup-keys            # dry run: reads Stripe + the table, writes nothing
//   npm run billing:backfill-lookup-keys -- --apply # writes the missing / stale keys
//
// Read-only at Stripe: one prices.retrieve per distinct stripe_price_id. Each write is conditional
// on the row's stripe_price_id still being the Price that was read, so a webhook that re-points the
// row meanwhile is never overwritten with a stale key (the webhook mirrors the key itself from now
// on). Safe to re-run: a row whose key already matches is reported "ok". Prints ids and keys only.
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const apply = process.argv.includes("--apply");

const fail = (message) => {
  console.error(`ERROR: ${message}`);
  process.exit(1);
};

(async () => {
  const secretKey = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!secretKey) fail("STRIPE_SECRET_KEY must be set (run via npm so .env.local loads).");
  if (!supabaseUrl || !serviceKey) fail("Supabase URL / service role key are not set.");

  const stripe = new Stripe(secretKey);
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  console.log(`Stripe mode: ${secretKey.startsWith("sk_live_") ? "LIVE" : "test"}`);
  console.log(`Mode: ${apply ? "APPLY" : "dry run (pass --apply to write)"}\n`);

  const { data: rows, error } = await db
    .from("billing_subscriptions")
    .select("id, venue_id, status, billing_method, stripe_price_id, stripe_price_lookup_key")
    .not("stripe_price_id", "is", null)
    .order("venue_id");
  if (error) fail(`billing_subscriptions read (is migration 20261012033356 applied?): ${error.message}`);

  const keyByPrice = new Map();
  for (const priceId of new Set(rows.map((row) => row.stripe_price_id))) {
    try {
      const price = await stripe.prices.retrieve(priceId);
      keyByPrice.set(priceId, price.lookup_key ?? null);
    } catch (err) {
      console.log(`  ${priceId}: could not read at Stripe (${err && err.code ? err.code : err.message}) — its rows are skipped`);
    }
  }

  let ok = 0;
  let changed = 0;
  let skipped = 0;
  for (const row of rows) {
    const label = `${row.venue_id} (bill ${row.id}, ${row.status}, ${row.billing_method})`;
    if (!keyByPrice.has(row.stripe_price_id)) { skipped += 1; continue; }
    const key = keyByPrice.get(row.stripe_price_id);
    if ((row.stripe_price_lookup_key ?? null) === key) {
      ok += 1;
      console.log(`  ok       ${label}: ${row.stripe_price_id} → ${key ?? "(no lookup key)"}`);
      continue;
    }
    changed += 1;
    console.log(`  ${apply ? "write" : "would"}    ${label}: ${row.stripe_price_id} → ${row.stripe_price_lookup_key ?? "null"} ⇒ ${key ?? "null"}`);
    if (apply) {
      const { data, error: writeError } = await db
        .from("billing_subscriptions")
        .update({ stripe_price_lookup_key: key })
        .eq("id", row.id)
        .eq("stripe_price_id", row.stripe_price_id)
        .select("id");
      if (writeError) fail(`write ${row.id}: ${writeError.message}`);
      if ((data ?? []).length === 0) console.log(`           (row moved to another Price meanwhile — left for the webhook)`);
    }
  }

  console.log(`\n${rows.length} card row(s): ${ok} already right, ${changed} ${apply ? "written" : "to write"}, ${skipped} skipped.`);
})().catch((err) => fail(err && err.message ? err.message : String(err)));
