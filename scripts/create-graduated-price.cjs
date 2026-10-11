#!/usr/bin/env node
// Multi-venue billing Phase 2 (docs/multi-venue-volume-billing-plan.md §4.1): find-or-create the
// graduated Stripe Price (lookup key GRADUATED_PRICE_LOOKUP_KEY) whose tiers come from
// VENUE_PRICE_TIERS in lib/venuePricing.ts, on the SAME Product as STRIPE_PRICE_ID, and check the
// live Price bills exactly those tiers.
//
//   npm run billing:graduated-price            # dry run: finds + checks, creates nothing
//   npm run billing:graduated-price -- --apply # creates the Price if it does not exist yet
//
// Idempotent: the lookup key is unique per Stripe account, so a second --apply finds the first
// Price instead of minting another. Never edits an existing Price (Stripe forbids editing tiers);
// a price change is a NEW lookup key (…_v2). Exits 1 if the live Price disagrees with our tiers.
// Prints Price/Product ids and the key MODE (live/test) only — never a secret.
const Stripe = require("stripe");
const {
  GRADUATED_PRICE_LOOKUP_KEY,
  graduatedStripeTiers,
  graduatedPriceProblems,
} = require("../lib/venuePricing.ts");

const apply = process.argv.includes("--apply");

const fail = (message) => {
  console.error(`ERROR: ${message}`);
  process.exit(1);
};

(async () => {
  const secretKey = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  const listPriceId = (process.env.STRIPE_PRICE_ID ?? "").trim();
  const configuredGraduatedId = (process.env.STRIPE_GRADUATED_PRICE_ID ?? "").trim();
  if (!secretKey) fail("STRIPE_SECRET_KEY is not set (run via npm so .env.local loads).");
  if (!listPriceId) fail("STRIPE_PRICE_ID is not set — the graduated Price hangs off its Product.");

  const stripe = new Stripe(secretKey);
  console.log(`Stripe mode: ${secretKey.startsWith("sk_live_") ? "LIVE" : "test"}`);
  console.log(`Mode: ${apply ? "APPLY" : "dry run (pass --apply to create)"}`);

  const listPrice = await stripe.prices.retrieve(listPriceId);
  const productId = typeof listPrice.product === "string" ? listPrice.product : listPrice.product.id;
  console.log(`List price ${listPriceId}: ${listPrice.unit_amount} ${listPrice.currency}/${listPrice.recurring?.interval}, product ${productId}`);

  // No `active` filter: an archived Price still holds its lookup key, and must be reported
  // rather than silently "not found" (a create would then fail on the duplicate key).
  const found = await stripe.prices.list({ lookup_keys: [GRADUATED_PRICE_LOOKUP_KEY], limit: 10, expand: ["data.tiers"] });
  let price = found.data[0] ?? null;

  if (!price) {
    const params = {
      product: productId,
      currency: "usd",
      recurring: { interval: "month", interval_count: 1 },
      billing_scheme: "tiered",
      tiers_mode: "graduated",
      tiers: graduatedStripeTiers(),
      lookup_key: GRADUATED_PRICE_LOOKUP_KEY,
      nickname: "Hightop venues — graduated monthly (v1)",
      metadata: { source: "scripts/create-graduated-price.cjs", plan: "multi-venue-volume-billing" },
    };
    if (!apply) {
      console.log(`\nNo Price with lookup key ${GRADUATED_PRICE_LOOKUP_KEY} exists. --apply would create:`);
      console.log(JSON.stringify(params, null, 2));
      return;
    }
    const created = await stripe.prices.create(params, {
      idempotencyKey: `create-${GRADUATED_PRICE_LOOKUP_KEY}`,
    });
    console.log(`\nCreated Price ${created.id}.`);
    price = await stripe.prices.retrieve(created.id, { expand: ["tiers"] });
  } else {
    console.log(`\nFound existing Price ${price.id} (lookup key ${GRADUATED_PRICE_LOOKUP_KEY}).`);
  }

  const problems = graduatedPriceProblems(price);
  const priceProduct = typeof price.product === "string" ? price.product : price.product.id;
  if (priceProduct !== productId) problems.push(`product is ${priceProduct}, expected ${productId} (the list price's)`);

  if (problems.length > 0) {
    console.error(`\nPrice ${price.id} does NOT match VENUE_PRICE_TIERS:`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`Price ${price.id} matches VENUE_PRICE_TIERS exactly (graduated, monthly, usd, no flat fees).`);

  if (configuredGraduatedId && configuredGraduatedId !== price.id) {
    fail(`STRIPE_GRADUATED_PRICE_ID is ${configuredGraduatedId}, but the lookup key resolves to ${price.id}.`);
  }
  if (!configuredGraduatedId) {
    console.log(`\nNext: set STRIPE_GRADUATED_PRICE_ID=${price.id} in .env.local (append) and in Vercel, then redeploy.`);
  } else {
    console.log("STRIPE_GRADUATED_PRICE_ID is set and points at this Price.");
  }
})().catch((error) => fail(error instanceof Error ? error.message : String(error)));
