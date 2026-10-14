#!/usr/bin/env node
// Isolated PostgreSQL verification of supabase/migrations/20261014010000_live_trivia_ranked_places.sql
// (docs/live-trivia-weekly-places-reward-plan.md Phase 1). No network, no application imports, never
// touches the linked Supabase project. Runs on PGlite (devDependency):
//   npm run test:ranked-places-sql
// or point at another copy: RANKED_PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite node scripts/test-ranked-places-sql.cjs
//
// PGlite is a single connection, so the advisory LOCK itself can't be raced here; what is proven is
// that award_ranked_cycle_places takes the byte-identical lock key award_cycle_winner takes, and that
// each function refuses to pay a week the other has touched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require(process.env.RANKED_PGLITE_MODULE || '@electric-sql/pglite');

const RANKED = '20261014010000_live_trivia_ranked_places.sql';
const migration = (name) => fs.readFileSync(`supabase/migrations/${name}`, 'utf8');

const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

async function run() {
  const db = new PGlite();
  const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
  const one = async (sql, params = []) => (await rows(sql, params))[0];
  try {
    // Minimal stand-ins for the tables the real migrations reference (same base as
    // scripts/test-square-scannable-prizes.cjs), plus live_showdown_answers' scoring columns.
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table users(id uuid primary key); create table venues(id text primary key);
      create table venue_owners(id uuid primary key);
      create table challenge_campaigns(id uuid primary key, name text, prize_type text,
        prize_gift_certificate_amount numeric(10,2),
        prize_kind text check (prize_kind in ('menu_item', 'gift_card')), prize_menu_item text,
        prize_menu_item_name text, prize_discount_kind text check (prize_discount_kind in ('dollar', 'percent')),
        prize_discount_value numeric(10,2));
      create table live_showdown_answers(id uuid primary key default gen_random_uuid(),
        user_id uuid not null references users(id), schedule_id uuid not null,
        occurrence_date date not null, points_awarded integer not null default 0,
        answered_at timestamptz not null default now());`);
    for (const name of [
      '20260509024500_add_challenge_campaign_redemptions.sql',
      '20260612000001_add_challenge_prizes.sql',
      '20260612000002_add_prize_expiry_notification_tracking.sql',
      '20260617000003_challenge_cycle_winners.sql',
      '20260720130000_rewards_multi_winner.sql',
      '20260720140000_rewards_lock_key_tz_independent.sql',
      '20260720150000_rewards_atomic_redemption.sql',
      '20260721120000_rewards_game_winner_condition.sql',
      '20260726120000_rewards_detachable_redemptions.sql',
      '20260726120100_award_cycle_winner_prize_snapshot.sql',
      '20261004192844_pos_foundation.sql',
      '20261005123950_reward_redeem_once.sql',
      '20261007030714_square_scannable_prizes.sql',
    ]) await db.exec(migration(name));

    // An existing game-winner reward must survive the constraint swap.
    await db.query(`insert into challenge_campaigns(id, name, win_condition) values ($1, 'Old game winner', 'game_winner')`, [uuid(900)]);

    await db.exec(migration(RANKED));
    await db.exec(migration(RANKED)); // re-runnable

    const venue = 'venue-garden';
    await db.query(`insert into venues values ($1), ('venue-other')`, [venue]);
    const players = [1, 2, 3, 4, 5].map((n) => uuid(n));
    for (const p of players) await db.query('insert into users values ($1)', [p]);

    const gc = (place, amount) => ({ place, prize_kind: 'gift_card', prize_gift_certificate_amount: amount });
    const ladder = [gc(1, 30), { place: 2, prize_kind: 'menu_item', prize_menu_item: 'appetizer', prize_discount_kind: 'percent', prize_discount_value: 100 }, gc(3, 10)];
    const insertCampaign = (id, fields) => {
      const cols = Object.keys(fields);
      return db.query(
        `insert into challenge_campaigns(id, ${cols.join(', ')}) values ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')})`,
        [id, ...Object.values(fields)],
      );
    };
    const ranked = uuid(100);
    const rankedMin = uuid(101);
    const threshold = uuid(102);
    await insertCampaign(ranked, { name: 'Weekly Trivia Champions', win_condition: 'ranked_places', place_prizes: JSON.stringify(ladder) });
    await insertCampaign(rankedMin, { name: 'Busy-night Champions', win_condition: 'ranked_places', place_prizes: JSON.stringify([gc(1, 25)]), min_players: 3 });
    await insertCampaign(threshold, { name: 'Points target', win_condition: 'points_threshold', prize_kind: 'gift_card', prize_gift_certificate_amount: 5 });

    // ── 1. Constraints ───────────────────────────────────────────────────────────────
    const bad = (n, fields, re) => assert.rejects(insertCampaign(uuid(n), { name: 'bad', ...fields }), re);
    await bad(200, { win_condition: 'ranked_places' }, /place_prizes_check/);
    await bad(201, { win_condition: 'points_threshold', place_prizes: JSON.stringify([gc(1, 5)]) }, /place_prizes_check/);
    await bad(202, { win_condition: 'ranked_places', place_prizes: JSON.stringify([gc(1, 1), gc(2, 1), gc(3, 1), gc(4, 1)]) }, /place_prizes_check/);
    await bad(203, { win_condition: 'ranked_places', place_prizes: JSON.stringify({ place: 1 }) }, /place_prizes_check/);
    await bad(204, { win_condition: 'ranked_places', place_prizes: '[]' }, /place_prizes_check/);
    await bad(205, { win_condition: 'points_threshold', min_players: 3 }, /min_players_check/);
    await bad(206, { win_condition: 'game_winner', min_players: 1 }, /min_players_check/);
    await bad(207, { win_condition: 'bogus' }, /win_condition_check/);
    await insertCampaign(uuid(208), { name: 'GW min', win_condition: 'game_winner', min_players: 4 });
    const winConditionChecks = await rows(`select conname from pg_constraint where conrelid = 'challenge_campaigns'::regclass
      and contype = 'c' and pg_get_constraintdef(oid) like '%win_condition%' and pg_get_constraintdef(oid) like '%points_threshold%'`);
    assert.deepEqual(winConditionChecks.map((r) => r.conname), ['challenge_campaigns_win_condition_check'], 'exactly one win_condition check');
    await assert.rejects(
      db.query(`insert into challenge_cycle_winners(challenge_id, cycle_start, winner_user_id, venue_id, place) values ($1, now(), $2, $3, 4)`, [threshold, players[0], venue]),
      /place_check/,
    );

    // ── 2. live_trivia_week_totals ───────────────────────────────────────────────────
    const schedA = uuid(500);
    const schedB = uuid(501);
    const answer = (user, sched, date, points, at) =>
      db.query('insert into live_showdown_answers(user_id, schedule_id, occurrence_date, points_awarded, answered_at) values ($1, $2, $3, $4, $5)', [user, sched, date, points, at]);
    await answer(players[0], schedA, '2026-10-14', 100, '2026-10-14T23:10:00Z');
    await answer(players[0], schedA, '2026-10-14', 0, '2026-10-14T23:50:00Z'); // a miss after the last score
    await answer(players[0], schedA, '2026-10-16', 100, '2026-10-16T23:20:00Z');
    await answer(players[1], schedA, '2026-10-14', 200, '2026-10-14T23:05:00Z');
    await answer(players[2], schedA, '2026-10-15', 0, '2026-10-15T23:00:00Z'); // took part, scored 0
    await answer(players[3], schedB, '2026-10-14', 500, '2026-10-14T23:00:00Z'); // a game NOT in the week
    await answer(players[3], schedA, '2026-10-21', 900, '2026-10-21T23:00:00Z'); // next week
    const totals = await rows(
      `select user_id, total_points::int as total, reached_at from live_trivia_week_totals($1::uuid[], $2::date[]) order by user_id`,
      [[schedA, schedA, schedA], ['2026-10-14', '2026-10-15', '2026-10-16']],
    );
    assert.deepEqual(
      totals.map((r) => [r.user_id, r.total, r.reached_at ? new Date(r.reached_at).toISOString() : null]),
      [
        [players[0], 200, '2026-10-16T23:20:00.000Z'],
        [players[1], 200, '2026-10-14T23:05:00.000Z'],
        [players[2], 0, null],
      ],
      'pairs schedule[i] with date[i]; last SCORING answer; non-scorers listed with 0',
    );
    assert.equal((await rows('select * from live_trivia_week_totals($1::uuid[], $2::date[])', [[], []])).length, 0);

    // ── 3. award_ranked_cycle_places: the happy path ─────────────────────────────────
    const week = '2026-10-14T04:00:00Z';
    const award = (challenge, cycle, winners, participants, expires = '2026-11-13T00:00:00Z') =>
      one('select * from award_ranked_cycle_places($1, $2, $3, $4::jsonb, $5, $6)',
        [challenge, cycle, venue, JSON.stringify(winners), participants, expires]);
    const w = (n, place, points) => ({ user_id: players[n], place, points });
    const before = async (cycle) => ({
      s: (await one('select count(*)::int n from challenge_cycle_settlements where cycle_start = $1', [cycle])).n,
      w: (await one('select count(*)::int n from challenge_cycle_winners where cycle_start = $1', [cycle])).n,
      c: (await one('select count(*)::int n from challenge_campaign_redemptions where cycle_start = $1', [cycle])).n,
    });

    assert.deepEqual(await award(ranked, week, [w(1, 1, 200), w(0, 2, 200), w(3, 3, 40)], 4), { status: 'awarded', winners_awarded: 3 });
    const coupons = await rows(`select winner_user_id, place, reward_name, prize_kind, prize_gift_certificate_amount::float as amount,
        prize_menu_item, prize_discount_kind, prize_discount_value::float as discount, prize_type, prize_expires_at
      from challenge_campaign_redemptions where challenge_id = $1 order by place`, [ranked]);
    assert.deepEqual(coupons.map((c) => [c.winner_user_id, c.place, c.reward_name, c.prize_kind, c.amount, c.prize_menu_item, c.prize_discount_kind, c.discount, c.prize_type]), [
      [players[1], 1, 'Weekly Trivia Champions', 'gift_card', 30, null, null, null, null],
      [players[0], 2, 'Weekly Trivia Champions', 'menu_item', null, 'appetizer', 'percent', 100, null],
      [players[3], 3, 'Weekly Trivia Champions', 'gift_card', 10, null, null, null, null],
    ], 'each coupon snapshots ITS place prize');
    assert.equal(new Date(coupons[0].prize_expires_at).toISOString(), '2026-11-13T00:00:00.000Z');
    const ledger = await rows(`select winner_user_id, place, points_earned, prize_gift_certificate_amount::float as amount
      from challenge_cycle_winners where challenge_id = $1 order by place`, [ranked]);
    assert.deepEqual(ledger.map((r) => [r.winner_user_id, r.place, r.points_earned, r.amount]), [
      [players[1], 1, 200, 30], [players[0], 2, 200, null], [players[3], 3, 40, 10],
    ]);
    assert.deepEqual(
      await one(`select outcome, participant_count, winner_count, min_players from challenge_cycle_settlements where challenge_id = $1`, [ranked]),
      { outcome: 'awarded', participant_count: 4, winner_count: 3, min_players: null },
    );

    // A coupon keeps its snapshot when the reward is later edited.
    await db.query(`update challenge_campaigns set place_prizes = $2::jsonb where id = $1`, [ranked, JSON.stringify([gc(1, 99)])]);
    assert.equal((await one(`select prize_gift_certificate_amount::float a from challenge_campaign_redemptions where challenge_id = $1 and place = 1`, [ranked])).a, 30);
    await db.query(`update challenge_campaigns set place_prizes = $2::jsonb where id = $1`, [ranked, JSON.stringify(ladder)]);

    // ── 4. Settled once ──────────────────────────────────────────────────────────────
    const settled = await before(week);
    assert.deepEqual(await award(ranked, week, [w(4, 1, 999)], 9), { status: 'already_resolved', winners_awarded: 0 });
    assert.deepEqual(await before(week), settled, 're-run writes nothing');

    // ── 5. Refusals roll back completely ─────────────────────────────────────────────
    const week2 = '2026-10-21T04:00:00Z';
    const refuses = async (label, promise, re) => {
      await assert.rejects(promise, re, label);
      assert.deepEqual(await before(week2), { s: 0, w: 0, c: 0 }, `${label}: nothing written`);
    };
    await refuses('not a ranked reward', award(threshold, week2, [w(0, 1, 10)], 1), /not a ranked-places reward/);
    await refuses('unknown reward', award(uuid(999), week2, [w(0, 1, 10)], 1), /not found/);
    await refuses('duplicate place', award(ranked, week2, [w(0, 1, 10), w(1, 1, 5)], 2), /duplicate/);
    await refuses('duplicate player', award(ranked, week2, [w(0, 1, 10), w(0, 2, 10)], 2), /duplicate/);
    await refuses('gap in places', award(ranked, week2, [w(0, 1, 10), w(1, 3, 5)], 2), /no gaps/);
    await refuses('starts at 2', award(ranked, week2, [w(0, 2, 10)], 1), /no gaps/);
    await refuses('more places than prizes', award(rankedMin, week2, [w(0, 1, 10), w(1, 2, 5), w(2, 3, 1)], 3), /no gaps/);
    await refuses('zero points', award(ranked, week2, [w(0, 1, 0)], 1), /more than 0 points/);
    await refuses('fewer participants than winners', award(ranked, week2, [w(0, 1, 10), w(1, 2, 5)], 1), /fewer participants/);
    await refuses('below the minimum but winners sent', award(rankedMin, week2, [w(0, 1, 10)], 2), /below this reward's minimum/);
    await refuses('no expiry', award(ranked, week2, [w(0, 1, 10)], 1, null), /expiry/);
    await refuses('malformed winner', award(ranked, week2, [{ user_id: 'nope', place: 1, points: 5 }], 1), /user_id, place and points/);
    await refuses('not an array', one('select * from award_ranked_cycle_places($1, $2, $3, $4::jsonb, 1, now())', [ranked, week2, venue, '{}']), /JSON array/);

    // ── 6. Weeks nobody won are recorded, once ───────────────────────────────────────
    assert.deepEqual(await award(ranked, week2, [], 1), { status: 'no_scorers', winners_awarded: 0 });
    assert.deepEqual(await award(ranked, week2, [], 1), { status: 'already_resolved', winners_awarded: 0 });
    assert.deepEqual(await award(rankedMin, week2, [], 2), { status: 'below_minimum', winners_awarded: 0 });
    assert.deepEqual(
      await one(`select outcome, participant_count, winner_count, min_players from challenge_cycle_settlements where challenge_id = $1`, [rankedMin]),
      { outcome: 'below_minimum', participant_count: 2, winner_count: 0, min_players: 3 },
    );
    assert.deepEqual(await award(rankedMin, week, [w(0, 1, 10)], 3), { status: 'awarded', winners_awarded: 1 }, 'meeting the minimum pays');
    await assert.rejects(
      db.query(`insert into challenge_cycle_settlements(challenge_id, cycle_start, venue_id, outcome, participant_count, winner_count) values ($1, now(), $2, 'awarded', 1, 0)`, [ranked, venue]),
      /outcome_shape_check/,
    );

    // ── 7. award_cycle_winner refuses a ranked reward, still pays others ─────────────
    const week3 = '2026-10-28T04:00:00Z';
    assert.deepEqual(
      await one(`select * from award_cycle_winner($1, $2, $3, $4, 50, 5, null, null, now() + interval '7 days')`, [ranked, week3, players[0], venue]),
      { won: false, exhausted: true },
    );
    assert.deepEqual(await before(week3), { s: 0, w: 0, c: 0 });
    assert.deepEqual(
      await one(`select * from award_cycle_winner($1, $2, $3, $4, 50, 5, null, null, now() + interval '7 days')`, [threshold, week3, players[0], venue]),
      { won: true, exhausted: false },
    );
    assert.equal((await one(`select place from challenge_campaign_redemptions where challenge_id = $1`, [threshold])).place, null);
    // …and the ranked RPC won't settle a week a ledger row already exists for (a stray award landed first).
    const week4 = '2026-11-04T05:00:00Z';
    await db.query(`insert into challenge_cycle_winners(challenge_id, cycle_start, winner_user_id, venue_id) values ($1, $2, $3, $4)`, [ranked, week4, players[4], venue]);
    assert.deepEqual(await award(ranked, week4, [w(0, 1, 10)], 1), { status: 'already_resolved', winners_awarded: 0 });

    // ── 8. Same lock key in both functions ───────────────────────────────────────────
    const lockExpr = async (fn) => {
      const def = (await one(`select pg_get_functiondef(p.oid) d from pg_proc p where proname = $1`, [fn])).d;
      const m = def.match(/pg_advisory_xact_lock\(([\s\S]*?)\);/);
      assert.ok(m, `${fn} takes an advisory lock`);
      return m[1].replace(/\s+/g, ' ').trim();
    };
    assert.equal(await lockExpr('award_ranked_cycle_places'), await lockExpr('award_cycle_winner'));

    // ── 9. One overload each, service role only, table closed to the browser ─────────
    for (const [name, sig] of [
      ['award_cycle_winner', 'award_cycle_winner(uuid,timestamptz,uuid,text,integer,integer,text,numeric,timestamptz)'],
      ['award_ranked_cycle_places', 'award_ranked_cycle_places(uuid,timestamptz,text,jsonb,integer,timestamptz)'],
      ['live_trivia_week_totals', 'live_trivia_week_totals(uuid[],date[])'],
    ]) {
      assert.equal((await one(`select count(*)::int n from pg_proc where proname = $1`, [name])).n, 1, `${name}: one overload`);
      assert.deepEqual(
        await one(`select has_function_privilege('anon','${sig}','execute') as anon,
          has_function_privilege('authenticated','${sig}','execute') as authenticated,
          has_function_privilege('service_role','${sig}','execute') as service`),
        { anon: false, authenticated: false, service: true },
        `${name}: service role only`,
      );
    }
    assert.deepEqual(
      await one(`select has_table_privilege('anon','challenge_cycle_settlements','select') as anon,
        has_table_privilege('authenticated','challenge_cycle_settlements','select') as authenticated,
        has_table_privilege('service_role','challenge_cycle_settlements','insert') as service,
        (select relrowsecurity and relforcerowsecurity from pg_class where relname = 'challenge_cycle_settlements') as rls`),
      { anon: false, authenticated: false, service: true, rls: true },
    );

    // ── 10. Deleting the reward removes its settlements (history lives on the coupons) ─
    await db.query('delete from challenge_campaigns where id = $1', [rankedMin]);
    assert.equal((await one('select count(*)::int n from challenge_cycle_settlements where challenge_id = $1', [rankedMin])).n, 0);

    console.log('Ranked-places SQL checks passed: constraints (win_condition, place_prizes, min_players, place), week totals (paired games, last scoring answer, 0-point participants), all-or-nothing award with per-place prize snapshot, settle-once, 13 refusals with full rollback, no-winner weeks recorded once, partner minimum, award_cycle_winner refuses ranked, shared lock key, grants, re-runnable.');
  } finally { await db.close(); }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
