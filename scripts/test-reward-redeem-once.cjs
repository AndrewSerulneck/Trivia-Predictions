#!/usr/bin/env node
// Isolated PostgreSQL verification of supabase/migrations/20261005123950_reward_redeem_once.sql
// (docs/reward-live-redemption-plan.md Phase 1). No network, no application imports, never
// touches the linked Supabase project. PGlite is not a project dependency, so point at a copy:
// REDEEM_PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite node scripts/test-reward-redeem-once.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require(process.env.REDEEM_PGLITE_MODULE || '@electric-sql/pglite');

const migration = (name) => fs.readFileSync(`supabase/migrations/${name}`, 'utf8');

async function run() {
  const db = new PGlite();
  try {
    // Minimal stand-ins for the tables the real redemptions migrations reference.
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table users(id uuid primary key); create table venues(id text primary key);
      create table challenge_campaigns(id uuid primary key, name text, prize_kind text, prize_menu_item text,
        prize_menu_item_name text, prize_discount_kind text, prize_discount_value numeric);`);
    // The real history of challenge_campaign_redemptions, in order.
    for (const name of [
      '20260509024500_add_challenge_campaign_redemptions.sql',
      '20260612000001_add_challenge_prizes.sql',
      '20260612000002_add_prize_expiry_notification_tracking.sql',
      '20260617000003_challenge_cycle_winners.sql',
      '20260726120000_rewards_detachable_redemptions.sql',
      '20261005123950_reward_redeem_once.sql',
    ]) await db.exec(migration(name));

    const guest = '00000000-0000-0000-0000-0000000000a1';
    const other = '00000000-0000-0000-0000-0000000000b2';
    const reward = '00000000-0000-0000-0000-00000000c0c0';
    const otherReward = '00000000-0000-0000-0000-00000000d0d0';
    await db.query('insert into users values ($1), ($2)', [guest, other]);
    await db.query(`insert into challenge_campaigns(id, name, prize_kind) values ($1, 'Live Trivia', 'gift_card'), ($2, 'NFL', 'gift_card')`, [reward, otherReward]);

    const coupon = async ({ user = guest, challenge = reward, venue = 'venue-a', cycle, expires = "now() + interval '7 days'" }) =>
      (await db.query(`insert into challenge_campaign_redemptions(challenge_id, winner_user_id, venue_id, cycle_start, prize_expires_at)
        values ($1, $2, $3, $4, ${expires}) returning id`, [challenge, user, venue, cycle])).rows[0].id;
    const redeem = async (args) => {
      const { challenge = reward, user = guest, venue = 'venue-a', method = 'guest_confirm', id = null } = args ?? {};
      return (await db.query('select * from redeem_challenge_prize($1, $2, $3, $4, $5)', [challenge, user, venue, method, id])).rows[0];
    };
    const row = async (id) => (await db.query('select prize_redeemed_at, redeemed_method from challenge_campaign_redemptions where id = $1', [id])).rows[0];

    // 1. Column exists, nullable, allowlisted.
    const first = await coupon({ cycle: '2026-10-01T00:00:00Z' });
    assert.equal((await row(first)).redeemed_method, null);
    await assert.rejects(db.query(`update challenge_campaign_redemptions set redeemed_method = 'bogus' where id = $1`, [first]), /check/i);

    // 2. Redeem once; the second call (a double tap) is refused, and nothing changes.
    const a = await redeem();
    assert.equal(a.outcome, 'redeemed');
    assert.equal(a.redemption_id, first);
    const after = await row(first);
    assert.equal(after.redeemed_method, 'guest_confirm');
    const b = await redeem();
    assert.equal(b.outcome, 'already_redeemed');
    assert.equal(b.redemption_id, first);
    assert.equal(new Date(b.redeemed_at).getTime(), new Date(after.prize_redeemed_at).getTime());
    assert.deepEqual(await row(first), after, 'a refused redeem writes nothing');

    // 3. Competing calls on one coupon: exactly one "redeemed". (PGlite is one connection, so this
    //    proves the guard, not multi-backend lock timing — see the Phase 1 handoff.)
    const raced = await coupon({ cycle: '2026-10-02T00:00:00Z' });
    const results = await Promise.all([redeem({ id: raced }), redeem({ id: raced }), redeem({ id: raced })]);
    assert.equal(results.filter((r) => r.outcome === 'redeemed').length, 1);
    assert.equal(results.filter((r) => r.outcome === 'already_redeemed').length, 2);

    // 4. Targeting by id never spills onto the guest's NEXT coupon.
    const c1 = await coupon({ cycle: '2026-10-03T00:00:00Z' });
    const c2 = await coupon({ cycle: '2026-10-04T00:00:00Z' });
    assert.equal((await redeem({ id: c2 })).outcome, 'redeemed');
    assert.equal((await redeem({ id: c2 })).outcome, 'already_redeemed');
    assert.equal((await row(c1)).prize_redeemed_at, null, 'the other coupon is untouched');
    // Without an id, the oldest eligible coupon is taken.
    const oldest = await redeem();
    assert.equal(oldest.outcome, 'redeemed');
    assert.equal(oldest.redemption_id, c1);

    // 5. Expired: refused, untouched. An expired older coupon does not block a newer one.
    const expired = await coupon({ challenge: otherReward, cycle: '2026-09-01T00:00:00Z', expires: "now() - interval '1 minute'" });
    assert.equal((await redeem({ challenge: otherReward })).outcome, 'expired');
    assert.equal((await row(expired)).prize_redeemed_at, null);
    const fresh = await coupon({ challenge: otherReward, cycle: '2026-09-08T00:00:00Z' });
    const freshResult = await redeem({ challenge: otherReward });
    assert.equal(freshResult.outcome, 'redeemed');
    assert.equal(freshResult.redemption_id, fresh);
    assert.equal((await redeem({ challenge: otherReward, id: expired })).outcome, 'expired');
    // No expiry at all = never expires (legacy rows).
    const noExpiry = await coupon({ cycle: '2026-10-05T00:00:00Z', expires: 'null' });
    assert.equal((await redeem({ id: noExpiry })).outcome, 'redeemed');

    // 6. Wrong user / venue / challenge / id → not_found, nothing written.
    const others = await coupon({ user: other, cycle: '2026-10-01T00:00:00Z' });
    assert.equal((await redeem({ id: others })).outcome, 'not_found', "guest cannot redeem another guest's coupon by id");
    assert.equal((await row(others)).prize_redeemed_at, null);
    const elsewhere = await coupon({ user: other, venue: 'venue-b', cycle: '2026-10-02T00:00:00Z' });
    assert.equal((await redeem({ user: other, venue: 'venue-a', id: elsewhere })).outcome, 'not_found', 'venue-scoped');
    assert.equal((await redeem({ user: other, venue: 'venue-b', id: elsewhere })).outcome, 'redeemed');
    assert.equal((await redeem({ challenge: '00000000-0000-0000-0000-00000000ffff' })).outcome, 'not_found');

    // 7. A detached coupon (reward deleted → challenge_id null) never matches.
    const detached = await coupon({ user: other, cycle: '2026-10-03T00:00:00Z' });
    await db.query('update challenge_campaign_redemptions set challenge_id = null where id = $1', [detached]);
    assert.equal((await redeem({ user: other, id: detached })).outcome, 'not_found');

    // 8. Methods: POS methods record themselves; unknown methods raise before touching anything.
    const pos = await coupon({ user: other, cycle: '2026-10-04T00:00:00Z' });
    await assert.rejects(redeem({ user: other, id: pos, method: 'cash' }), /unknown method/);
    assert.equal((await row(pos)).prize_redeemed_at, null);
    assert.equal((await redeem({ user: other, id: pos, method: 'pos_square' })).outcome, 'redeemed');
    assert.equal((await row(pos)).redeemed_method, 'pos_square');

    // 9. Service role only.
    const sig = 'redeem_challenge_prize(uuid,uuid,text,text,uuid)';
    const privileges = (await db.query(`select has_function_privilege('anon','${sig}','execute') as anon,
      has_function_privilege('authenticated','${sig}','execute') as authenticated,
      has_function_privilege('service_role','${sig}','execute') as service`)).rows[0];
    assert.deepEqual(privileges, { anon: false, authenticated: false, service: true });

    console.log('Redeem-once checks passed: column + allowlist, once-only, competing calls, id targeting, oldest-eligible fallback, expiry, user/venue/challenge scoping, detached rows, methods, service-role-only execution.');
  } finally { await db.close(); }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
