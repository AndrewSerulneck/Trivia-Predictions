#!/usr/bin/env node
// Multi-venue billing Phase 2 (docs/multi-venue-volume-billing-plan.md §5 Phase 2): move every
// live card subscription on the flat $100 list price (STRIPE_PRICE_ID) onto the graduated Price
// (lookup key GRADUATED_PRICE_LOOKUP_KEY) at quantity 1, with proration_behavior "none". At one
// venue both cost $100/month, so nobody's bill changes — this only makes "add a venue" (Phase 3)
// a quantity change instead of a price change.
//
//   npm run billing:migrate-to-graduated            # dry run: reads + previews, changes nothing
//   npm run billing:migrate-to-graduated -- --apply # swaps the eligible subscriptions
//
// Skips (and reports) anything it should not touch: offline/check rows, rows with no Stripe
// subscription, custom negotiated rates (`custom_monthly_…` lookup keys, lib/billingCustomPrice.ts),
// subscriptions scheduled to cancel or driven by a subscription schedule, multi-item
// subscriptions, quantity other than 1, any price that is not the list price, and any
// subscription whose next-invoice preview would change by even a cent.
//
// Safe to re-run: an already-swapped subscription is reported "already graduated". Each swap
// carries an idempotency key. Writes NOTHING to our database — the Stripe webhook
// (customer.subscription.updated) mirrors stripe_price_id / amount_cents / quantity, and --apply
// waits briefly and prints the mirrored row. Prints ids, venue ids and amounts only.
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");
const {
  GRADUATED_PRICE_LOOKUP_KEY,
  graduatedPriceProblems,
  monthlyTotalCents,
} = require("../lib/venuePricing.ts");

const apply = process.argv.includes("--apply");
const LIVE_STATUSES = new Set(["active", "past_due", "trialing"]);
const CUSTOM_LOOKUP_PREFIX = "custom_monthly_";

const fail = (message) => {
  console.error(`ERROR: ${message}`);
  process.exit(1);
};
const dollars = (cents) => (typeof cents === "number" ? `$${(cents / 100).toFixed(2)}` : String(cents));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const secretKey = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  const listPriceId = (process.env.STRIPE_PRICE_ID ?? "").trim();
  const configuredGraduatedId = (process.env.STRIPE_GRADUATED_PRICE_ID ?? "").trim();
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!secretKey || !listPriceId) fail("STRIPE_SECRET_KEY and STRIPE_PRICE_ID must be set (run via npm so .env.local loads).");
  if (!supabaseUrl || !serviceKey) fail("Supabase URL / service role key are not set.");

  const stripe = new Stripe(secretKey);
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  console.log(`Stripe mode: ${secretKey.startsWith("sk_live_") ? "LIVE" : "test"}`);
  console.log(`Mode: ${apply ? "APPLY" : "dry run (pass --apply to swap)"}`);

  // The target Price: found by its lookup key (the env var, when set, must agree) and checked
  // against VENUE_PRICE_TIERS before anything is moved onto it.
  const found = await stripe.prices.list({ lookup_keys: [GRADUATED_PRICE_LOOKUP_KEY], limit: 10, expand: ["data.tiers"] });
  const graduated = found.data[0];
  if (!graduated) fail(`No Price with lookup key ${GRADUATED_PRICE_LOOKUP_KEY} — run npm run billing:graduated-price -- --apply first.`);
  if (configuredGraduatedId && configuredGraduatedId !== graduated.id) {
    fail(`STRIPE_GRADUATED_PRICE_ID is ${configuredGraduatedId}, but the lookup key resolves to ${graduated.id}.`);
  }
  const problems = graduatedPriceProblems(graduated);
  if (problems.length > 0) fail(`Price ${graduated.id} does not match VENUE_PRICE_TIERS: ${problems.join("; ")}`);
  console.log(`Graduated Price ${graduated.id} checked against VENUE_PRICE_TIERS: OK`);
  console.log(`List price (moving FROM): ${listPriceId}\n`);

  const { data: rows, error } = await db
    .from("billing_subscriptions")
    .select("id, venue_id, billing_method, status, stripe_subscription_id, stripe_price_id, amount_cents")
    .order("venue_id");
  if (error) fail(`billing_subscriptions read: ${error.message}`);

  const toSwap = [];
  const skipped = [];
  for (const row of rows) {
    const label = row.venue_id;
    const skip = (reason) => skipped.push(`${label}: ${reason}`);
    if (row.billing_method === "offline") { skip("offline (check) billing — no Stripe subscription"); continue; }
    if (!row.stripe_subscription_id) { skip(`no Stripe subscription (status ${row.status})`); continue; }

    let sub;
    try {
      sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id, { expand: ["items.data.price"] });
    } catch (e) {
      skip(`could not read ${row.stripe_subscription_id} at Stripe (${e.code ?? e.message})`);
      continue;
    }
    if (!LIVE_STATUSES.has(sub.status)) { skip(`Stripe status ${sub.status}`); continue; }
    if (sub.schedule) { skip(`driven by subscription schedule ${typeof sub.schedule === "string" ? sub.schedule : sub.schedule.id}`); continue; }
    if (sub.cancel_at_period_end || sub.cancel_at) { skip("scheduled to cancel"); continue; }
    if (sub.items.data.length !== 1) { skip(`${sub.items.data.length} items — edit at Stripe by hand`); continue; }
    const item = sub.items.data[0];
    const price = item.price;
    if (price.id === graduated.id) { skip(`already graduated (quantity ${item.quantity})`); continue; }
    if ((price.lookup_key ?? "").startsWith(CUSTOM_LOOKUP_PREFIX)) { skip(`custom negotiated rate ${price.lookup_key} — left alone (Phase 6)`); continue; }
    if (price.id !== listPriceId) { skip(`on unexpected price ${price.id} (${dollars(price.unit_amount)}) — left alone`); continue; }
    if (item.quantity !== 1) { skip(`quantity ${item.quantity} on the flat price — left alone`); continue; }

    // Prove the bill does not move: Stripe's own preview of the next invoice, as-is vs. swapped.
    let before;
    let after;
    try {
      before = await stripe.invoices.createPreview({ subscription: sub.id });
      after = await stripe.invoices.createPreview({
        subscription: sub.id,
        subscription_details: {
          items: [{ id: item.id, price: graduated.id, quantity: 1 }],
          proration_behavior: "none",
        },
      });
    } catch (e) {
      skip(`invoice preview failed (${e.code ?? e.message})`);
      continue;
    }
    const same = before.subtotal === after.subtotal && before.total === after.total && before.amount_due === after.amount_due;
    if (!same) {
      skip(`next invoice would change: subtotal ${dollars(before.subtotal)}→${dollars(after.subtotal)}, total ${dollars(before.total)}→${dollars(after.total)} — refused`);
      continue;
    }
    toSwap.push({ row, sub, item, before, after });
  }

  console.log(`Would swap (${toSwap.length}):`);
  for (const { row, sub, item, before } of toSwap) {
    const discount = (sub.discounts ?? []).length > 0 ? `, ${sub.discounts.length} discount(s) kept` : "";
    console.log(
      `  ${row.venue_id}: ${sub.id} item ${item.id} ${item.price.id} (${dollars(item.price.unit_amount)}) → ${graduated.id} qty 1` +
        ` · next invoice ${dollars(before.total)} unchanged${discount} · mirror now ${dollars(row.amount_cents)}, expected after ${dollars(monthlyTotalCents(1))}`
    );
  }
  console.log(`\nSkipped (${skipped.length}):`);
  for (const line of skipped) console.log(`  ${line}`);

  if (!apply || toSwap.length === 0) {
    if (!apply && toSwap.length > 0) console.log("\nDry run — nothing changed. Re-run with --apply to swap.");
    return;
  }

  console.log("\nSwapping…");
  for (const { row, sub, item } of toSwap) {
    await stripe.subscriptions.update(
      sub.id,
      { items: [{ id: item.id, price: graduated.id, quantity: 1 }], proration_behavior: "none" },
      { idempotencyKey: `graduated-v1-swap-${sub.id}-${item.id}` }
    );
    const check = await stripe.subscriptions.retrieve(sub.id, { expand: ["items.data.price"] });
    const now = check.items.data[0];
    const ok = check.items.data.length === 1 && now.price.id === graduated.id && now.quantity === 1;
    console.log(`  ${row.venue_id}: ${ok ? "swapped" : "UNEXPECTED STATE"} (${now.price.id} qty ${now.quantity}, status ${check.status})`);
    if (!ok) process.exitCode = 1;
  }

  // The webhook mirrors the swap; give it a moment, then show what our database says.
  console.log("\nWaiting 15s for the Stripe webhook to mirror…");
  await sleep(15000);
  const ids = toSwap.map(({ row }) => row.id);
  const { data: mirrored, error: mirrorError } = await db
    .from("billing_subscriptions")
    .select("venue_id, status, stripe_price_id, amount_cents, quantity")
    .in("id", ids);
  if (mirrorError) fail(`mirror read: ${mirrorError.message}`);
  for (const m of mirrored) {
    const good = m.stripe_price_id === graduated.id && m.amount_cents === monthlyTotalCents(1) && m.quantity === 1;
    console.log(`  ${m.venue_id}: price ${m.stripe_price_id} amount ${dollars(m.amount_cents)} quantity ${m.quantity} status ${m.status} ${good ? "OK" : "— not mirrored yet / check webhook"}`);
  }
})().catch((error) => fail(error instanceof Error ? error.message : String(error)));
