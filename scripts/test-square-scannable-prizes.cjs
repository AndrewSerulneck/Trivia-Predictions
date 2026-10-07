#!/usr/bin/env node
// Isolated PostgreSQL verification of supabase/migrations/20261007030714_square_scannable_prizes.sql
// (docs/square-scannable-prizes-plan.md Phase S1). No network, no application imports, never
// touches the linked Supabase project. PGlite is not a project dependency, so point at a copy:
// REDEEM_PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite node scripts/test-square-scannable-prizes.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require(process.env.REDEEM_PGLITE_MODULE || '@electric-sql/pglite');

const migration = (name) => fs.readFileSync(`supabase/migrations/${name}`, 'utf8');

async function run() {
  const db = new PGlite();
  try {
    // Minimal stand-ins for the tables the real migrations reference. challenge_campaigns carries the
    // real prize-model check constraints from 20260720120000_rewards_prize_and_quota.sql.
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table users(id uuid primary key); create table venues(id text primary key);
      create table venue_owners(id uuid primary key);
      create table challenge_campaigns(id uuid primary key, name text, prize_type text,
        prize_gift_certificate_amount numeric(10,2),
        prize_kind text check (prize_kind in ('menu_item', 'gift_card')), prize_menu_item text,
        prize_menu_item_name text, prize_discount_kind text check (prize_discount_kind in ('dollar', 'percent')),
        prize_discount_value numeric(10,2));`);
    // The real history of the coupon table and the award function, in order.
    for (const name of [
      '20260509024500_add_challenge_campaign_redemptions.sql',
      '20260612000001_add_challenge_prizes.sql',
      '20260612000002_add_prize_expiry_notification_tracking.sql',
      '20260617000003_challenge_cycle_winners.sql',
      '20260720130000_rewards_multi_winner.sql',
      '20260720140000_rewards_lock_key_tz_independent.sql',
      '20260720150000_rewards_atomic_redemption.sql',
      '20260726120000_rewards_detachable_redemptions.sql',
      '20260726120100_award_cycle_winner_prize_snapshot.sql',
      '20261004192844_pos_foundation.sql',
      '20261005123950_reward_redeem_once.sql',
      '20261007030714_square_scannable_prizes.sql',
    ]) await db.exec(migration(name));
    // Idempotent: applying it twice is harmless.
    await db.exec(migration('20261007030714_square_scannable_prizes.sql'));

    const guest = '00000000-0000-0000-0000-0000000000a1';
    const dollarScan = '00000000-0000-0000-0000-00000000c001';
    const dollarPlain = '00000000-0000-0000-0000-00000000c002';
    await db.query('insert into users values ($1)', [guest]);
    await db.query(`insert into venues values ('venue-a')`);

    const campaign = (id, fields) => {
      const cols = Object.keys(fields);
      return db.query(
        `insert into challenge_campaigns(id, ${cols.join(', ')}) values ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')})`,
        [id, ...Object.values(fields)],
      );
    };
    const dollar = { name: 'Live Trivia', prize_kind: 'menu_item', prize_menu_item: 'appetizer', prize_discount_kind: 'dollar', prize_discount_value: 5 };

    // 1. The campaign column: allowlisted values, and 'gift_card' only on a dollar-off menu prize.
    await campaign(dollarScan, { ...dollar, prize_pos_delivery: 'gift_card' });
    await campaign(dollarPlain, dollar);
    await campaign('00000000-0000-0000-0000-00000000c003', { ...dollar, prize_pos_delivery: 'discount' });
    await assert.rejects(campaign('00000000-0000-0000-0000-00000000c004', { ...dollar, prize_pos_delivery: 'bogus' }), /check/i);
    await assert.rejects(
      campaign('00000000-0000-0000-0000-00000000c005', { ...dollar, prize_discount_kind: 'percent', prize_discount_value: 50, prize_pos_delivery: 'gift_card' }),
      /prize_pos_delivery_shape_check/,
    );
    await assert.rejects(
      campaign('00000000-0000-0000-0000-00000000c006', { name: 'GC', prize_kind: 'gift_card', prize_gift_certificate_amount: 25, prize_pos_delivery: 'gift_card' }),
      /prize_pos_delivery_shape_check/,
    );
    await assert.rejects(
      campaign('00000000-0000-0000-0000-00000000c007', { name: 'Legacy', prize_type: 'free_appetizer', prize_pos_delivery: 'gift_card' }),
      /prize_pos_delivery_shape_check/,
    );
    // A later edit can't strand 'gift_card' on a prize that stopped being dollar-off.
    await assert.rejects(db.query(`update challenge_campaigns set prize_discount_kind = 'percent' where id = $1`, [dollarScan]), /shape_check/);

    // 2. award_cycle_winner snapshots the delivery onto the coupon (and still the cap + prize).
    const award = (challenge, cycle) =>
      db.query('select * from award_cycle_winner($1, $2, $3, $4, $5, $6, null, null, now() + interval \'7 days\')',
        [challenge, cycle, guest, 'venue-a', 10, 5]);
    const won = (await award(dollarScan, '2026-10-01T00:00:00Z')).rows[0];
    assert.deepEqual(won, { won: true, exhausted: false });
    await award(dollarPlain, '2026-10-01T00:00:00Z');
    const coupon = async (challenge) =>
      (await db.query(`select prize_pos_delivery, prize_kind, prize_discount_kind, prize_discount_value::float as value
        from challenge_campaign_redemptions where challenge_id = $1`, [challenge])).rows[0];
    assert.deepEqual(await coupon(dollarScan), { prize_pos_delivery: 'gift_card', prize_kind: 'menu_item', prize_discount_kind: 'dollar', value: 5 });
    assert.deepEqual(await coupon(dollarPlain), { prize_pos_delivery: null, prize_kind: 'menu_item', prize_discount_kind: 'dollar', value: 5 });

    // 3. The coupon keeps its snapshot when the reward later changes.
    await db.query('update challenge_campaigns set prize_pos_delivery = null where id = $1', [dollarScan]);
    assert.equal((await coupon(dollarScan)).prize_pos_delivery, 'gift_card');

    // 4. The coupon column: value check only (historical record — no shape check).
    await assert.rejects(db.query(`update challenge_campaign_redemptions set prize_pos_delivery = 'bogus'`), /check/i);

    // 5. Still exactly one overload, service role only.
    const overloads = (await db.query(`select count(*)::int as n from pg_proc where proname = 'award_cycle_winner'`)).rows[0].n;
    assert.equal(overloads, 1);
    const sig = 'award_cycle_winner(uuid,timestamptz,uuid,text,integer,integer,text,numeric,timestamptz)';
    const privileges = (await db.query(`select has_function_privilege('anon','${sig}','execute') as anon,
      has_function_privilege('authenticated','${sig}','execute') as authenticated,
      has_function_privilege('service_role','${sig}','execute') as service`)).rows[0];
    assert.deepEqual(privileges, { anon: false, authenticated: false, service: true });

    console.log('Scannable-prize checks passed: column allowlist, dollar-menu-only shape check (insert + edit), award snapshot (gift_card + null), snapshot survives a reward edit, coupon value check, one overload, service-role-only execution, re-runnable.');
  } finally { await db.close(); }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
