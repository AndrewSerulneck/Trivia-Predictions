#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

async function auditPhase1() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const stripePriceId = process.env.STRIPE_PRICE_ID;

  if (!supabaseUrl || !supabaseServiceRoleKey || !stripeSecretKey || !stripePriceId) {
    console.error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, STRIPE_PRICE_ID');
    process.exit(1);
  }

  console.log('=== Phase 1 Audit ===\n');
  console.log('1. Checking for non-round-dollar rates...');

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
  const { data: nonRoundRates, error } = await supabase
    .from('billing_subscriptions')
    .select('venue_id, amount_cents')
    .gt('amount_cents', 0)
    .order('amount_cents');

  if (error) {
    console.error('Query failed:', error);
    process.exit(1);
  }

  const nonRoundRows = nonRoundRates.filter(row => row.amount_cents % 100 !== 0);

  if (nonRoundRows.length === 0) {
    console.log('✓ No non-round rates found. Dollars-only costs nothing.\n');
  } else {
    console.log(`✗ Found ${nonRoundRows.length} non-round rate(s):`);
    nonRoundRows.forEach(row => {
      const dollars = (row.amount_cents / 100).toFixed(2);
      console.log(`   venue_id ${row.venue_id}: $${dollars} (${row.amount_cents} cents)`);
    });
    console.log('');
  }

  console.log('2. Confirming STRIPE_PRICE_ID and retrieving Product ID...');
  console.log(`   Price ID: ${stripePriceId}`);

  const stripe = new Stripe(stripeSecretKey);
  try {
    const price = await stripe.prices.retrieve(stripePriceId);
    const productId = price.product;
    console.log(`✓ Price resolved successfully`);
    console.log(`   Product ID: ${productId}`);
    console.log(`   Unit amount: $${(price.unit_amount / 100).toFixed(2)}/month`);
    console.log(`   Currency: ${price.currency}`);
    console.log(`   Lookup key: ${price.lookup_key || '(not set)'}\n`);

    console.log('=== Summary for Run Log ===');
    console.log(`Non-round rates: ${nonRoundRows.length} found`);
    if (nonRoundRows.length > 0) {
      console.log(`  Keep stripePriceId path for: ${nonRoundRows.map(r => `venue ${r.venue_id} ($${(r.amount_cents / 100).toFixed(2)})`).join(', ')}`);
    }
    console.log(`Custom prices Product ID: ${productId}`);
  } catch (err) {
    console.error(`✗ Failed to retrieve price ${stripePriceId}:`, err.message);
    process.exit(1);
  }
}

auditPhase1().catch(console.error);
