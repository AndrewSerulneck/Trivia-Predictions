#!/usr/bin/env node
// Isolated PostgreSQL verification of supabase/migrations/20261014213000_owner_past_winners_summaries.sql
// (docs/live-trivia-weekly-places-reward-plan.md Phase 8, Past Winners). No network, no application
// imports, never touches the linked Supabase project. Runs on PGlite (devDependency):
//   npm run test:owner-history-sql
// or point at another copy: OWNER_HISTORY_PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite node scripts/test-owner-history-sql.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require(process.env.OWNER_HISTORY_PGLITE_MODULE || '@electric-sql/pglite');

const HISTORY = '20261014213000_owner_past_winners_summaries.sql';
const migration = (name) => fs.readFileSync(`supabase/migrations/${name}`, 'utf8');
const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const day = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));

async function run() {
  const db = new PGlite();
  const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
  try {
    // The same minimal base as scripts/test-ranked-places-sql.cjs, then the ranked-places migration
    // (it creates challenge_cycle_settlements and the place columns this one reads).
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
        occurrence_date date, points_awarded integer not null default 0,
        answered_at timestamptz not null default now());
      create index idx_lsa_occurrence on live_showdown_answers(schedule_id, occurrence_date);`);
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
      '20261014010000_live_trivia_ranked_places.sql',
    ]) await db.exec(migration(name));

    await db.exec(migration(HISTORY));
    await db.exec(migration(HISTORY)); // re-runnable

    const players = [1, 2, 3, 4, 5, 6].map((n) => uuid(n));
    for (const p of players) await db.query('insert into users values ($1)', [p]);
    await db.query(`insert into venues values ('venue-a'), ('venue-b')`);

    // ── 1. live_trivia_occurrence_summaries ─────────────────────────────────────────────
    const schedA = uuid(500);
    const schedB = uuid(501);
    const other = uuid(502); // another venue's schedule: never asked for
    const answer = (user, sched, date, points) =>
      db.query('insert into live_showdown_answers(user_id, schedule_id, occurrence_date, points_awarded) values ($1, $2, $3, $4)', [user, sched, date, points]);
    // Schedule A: Oct 7 (two answers each), Oct 9 (tie for first), Oct 14 (only 0-point players).
    await answer(players[0], schedA, '2026-10-07', 100);
    await answer(players[0], schedA, '2026-10-07', 50);
    await answer(players[1], schedA, '2026-10-07', 120);
    await answer(players[2], schedA, '2026-10-07', 0);
    await answer(players[0], schedA, '2026-10-09', 80);
    await answer(players[3], schedA, '2026-10-09', 80);
    await answer(players[4], schedA, '2026-10-14', 0);
    // Schedule B played Oct 9 too, and Oct 2.
    await answer(players[5], schedB, '2026-10-09', 40);
    await answer(players[5], schedB, '2026-10-02', 10);
    // Noise: another venue's schedule and a legacy answer with no occurrence date.
    await answer(players[0], other, '2026-10-10', 999);
    await answer(players[0], schedA, null, 999);

    const summaries = async (before, limit) =>
      (await rows('select * from live_trivia_occurrence_summaries($1::uuid[], $2::date, $3)', [[schedA, schedB, schedA], before, limit]))
        .map((r) => ({
          s: r.schedule_id,
          d: day(r.occurrence_date),
          players: r.player_count,
          top: Number(r.top_points),
          who: [...r.top_user_ids].sort(),
        }));

    const all = await summaries(null, 20);
    assert.deepEqual(all, [
      { s: schedA, d: '2026-10-14', players: 1, top: 0, who: [] }, // nobody scored: no winner
      { s: schedB, d: '2026-10-09', players: 1, top: 40, who: [players[5]] },
      { s: schedA, d: '2026-10-09', players: 2, top: 80, who: [players[0], players[3]].sort() }, // a tie lists both
      { s: schedA, d: '2026-10-07', players: 3, top: 150, who: [players[0]] }, // points summed per player; 0-point player counted
      { s: schedB, d: '2026-10-02', players: 1, top: 10, who: [players[5]] },
    ], 'every game with answers, newest first, other venues and dateless answers excluded');

    // Paging: limit 2 → Oct 14 and Oct 9; the cut lands on Oct 9, so BOTH Oct 9 games come back.
    const page1 = await summaries(null, 2);
    assert.deepEqual(page1.map((r) => `${r.d}:${r.s === schedA ? 'A' : 'B'}`), ['2026-10-14:A', '2026-10-09:B', '2026-10-09:A'],
      'a page never splits one date');
    const page2 = await summaries('2026-10-09', 2);
    assert.deepEqual(page2.map((r) => `${r.d}:${r.s === schedA ? 'A' : 'B'}`), ['2026-10-07:A', '2026-10-02:B'],
      'p_before is strict: the next page starts the day before');
    assert.deepEqual(await summaries('2026-10-02', 2), [], 'nothing older');
    assert.equal((await summaries(null, 1)).length, 1, 'limit 1 → only the newest date');
    assert.equal((await summaries(null, 0)).length, 1, 'limit is clamped to at least 1');
    assert.deepEqual(
      await rows('select * from live_trivia_occurrence_summaries($1::uuid[], null, 20)', [[]]),
      [],
      'no schedules → no games',
    );

    // ── 2. challenge_reward_history_summaries ───────────────────────────────────────────
    const ranked = uuid(100);
    const gameWinner = uuid(101);
    const unused = uuid(102);
    const shared = uuid(103); // a reward at two venues
    const gc = (place, amount) => ({ place, prize_kind: 'gift_card', prize_gift_certificate_amount: amount });
    await db.query(`insert into challenge_campaigns(id, name, win_condition, place_prizes) values ($1, 'Weekly', 'ranked_places', $2)`,
      [ranked, JSON.stringify([gc(1, 30), gc(2, 20), gc(3, 10)])]);
    for (const [id, name] of [[gameWinner, 'Game winner'], [unused, 'Never won'], [shared, 'Shared']]) {
      await db.query(`insert into challenge_campaigns(id, name, win_condition) values ($1, $2, 'game_winner')`, [id, name]);
    }
    const week1 = '2026-09-30T04:00:00Z';
    const week2 = '2026-10-07T04:00:00Z';
    const week3 = '2026-10-14T04:00:00Z';
    const award = (cycle, winners, participants) =>
      db.query('select * from award_ranked_cycle_places($1, $2, $3, $4::jsonb, $5, $6)',
        [ranked, cycle, 'venue-a', JSON.stringify(winners), participants, '2026-12-01T00:00:00Z']);
    await award(week1, [{ user_id: players[0], place: 1, points: 200 }], 2);
    await award(week2, [
      { user_id: players[1], place: 1, points: 300 },
      { user_id: players[0], place: 2, points: 150 },
      { user_id: players[2], place: 3, points: 90 },
    ], 4);
    await award(week3, [], 0); // a week nobody scored: a settlement, no ledger rows
    // Settle week3 later than week2 so "last activity" is week3's settlement.
    await db.query(`update challenge_cycle_settlements set settled_at = '2026-10-17T02:00:00Z' where cycle_start = $1`, [week3]);
    await db.query(`update challenge_cycle_settlements set settled_at = '2026-10-10T02:00:00Z' where cycle_start = $1`, [week2]);
    await db.query(`update challenge_cycle_winners set finalized_at = '2026-10-10T02:00:00Z' where cycle_start = $1`, [week2]);

    const ledger = (challenge, cycle, user, venue, points, at) =>
      db.query(`insert into challenge_cycle_winners(challenge_id, cycle_start, winner_user_id, venue_id, points_earned, finalized_at)
        values ($1, $2, $3, $4, $5, $6)`, [challenge, cycle, user, venue, points, at]);
    await ledger(gameWinner, '2026-10-01T23:00:00Z', players[3], 'venue-a', 70, '2026-10-02T02:00:00Z');
    await ledger(gameWinner, '2026-10-08T23:00:00Z', players[4], 'venue-a', 60, '2026-10-09T02:00:00Z');
    await ledger(gameWinner, '2026-10-08T23:00:00Z', players[5], 'venue-a', 60, '2026-10-09T02:00:00Z'); // a tie
    await ledger(shared, '2026-10-08T23:00:00Z', players[0], 'venue-b', 10, '2026-10-09T02:00:00Z'); // other venue only

    const history = async (venue, beforeAt = null, beforeId = null, limit = 20) =>
      (await rows('select * from challenge_reward_history_summaries($1, $2::timestamptz, $3::uuid, $4)', [venue, beforeAt, beforeId, limit]))
        .map((r) => ({
          id: r.challenge_id,
          last: new Date(r.last_cycle_start).toISOString(),
          at: new Date(r.last_activity_at).toISOString(),
          cycles: r.cycle_count,
          winners: r.last_winners.map((w) => [w.user_id, w.place, w.points]),
        }));

    assert.deepEqual(await history('venue-a'), [
      {
        id: ranked,
        last: '2026-10-14T04:00:00.000Z',
        at: '2026-10-17T02:00:00.000Z',
        cycles: 3,
        winners: [], // the latest week had no winner; the card says why from the settlement
      },
      {
        id: gameWinner,
        last: '2026-10-08T23:00:00.000Z',
        at: '2026-10-09T02:00:00.000Z',
        cycles: 2,
        winners: [[players[4], null, 60], [players[5], null, 60]],
      },
    ], 'one row per reward with a cycle at this venue, latest activity first; never-won and other-venue rewards are absent');

    const atB = await history('venue-b');
    assert.deepEqual(atB.map((r) => r.id), [shared], 'a shared reward shows only at the venue it paid');

    // Keyset paging: limit 1 returns 2 rows (the +1 says "more"); the cursor is the last row KEPT.
    const first = await history('venue-a', null, null, 1);
    assert.deepEqual(first.map((r) => r.id), [ranked, gameWinner], 'p_limit + 1 rows');
    const second = await history('venue-a', first[0].at, first[0].id, 1);
    assert.deepEqual(second.map((r) => r.id), [gameWinner], 'the next page starts strictly after the cursor');
    assert.deepEqual(await history('venue-a', second[0].at, second[0].id, 1), [], 'nothing older');
    // An exact activity tie is broken by id, so paging never skips or repeats.
    await ledger(unused, '2026-10-08T23:00:00Z', players[2], 'venue-a', 5, '2026-10-09T02:00:00Z');
    const tied = await history('venue-a', '2026-10-17T02:00:00Z', ranked, 1);
    assert.deepEqual(tied.map((r) => r.id), [unused, gameWinner].sort().reverse(), 'tie → id desc');
    const afterTie = await history('venue-a', tied[0].at, tied[0].id, 1);
    assert.deepEqual(afterTie.map((r) => r.id), [tied[1].id]);
    await db.query('delete from challenge_cycle_winners where challenge_id = $1', [unused]);

    // A ranked week's winners come back place-ordered.
    await db.query(`delete from challenge_cycle_settlements where cycle_start = $1`, [week3]);
    const rankedRow = (await history('venue-a')).find((r) => r.id === ranked);
    assert.deepEqual(rankedRow.winners, [[players[1], 1, 300], [players[0], 2, 150], [players[2], 3, 90]], '1st, 2nd, 3rd');
    assert.equal(rankedRow.cycles, 2);

    // A deleted player's ledger row (winner_user_id blanked) still counts, with a null id. Production
    // allows the null since the account-deletion migration (20261008044524), which this base skips.
    await db.exec('alter table challenge_cycle_winners alter column winner_user_id drop not null');
    await db.query(`update challenge_cycle_winners set winner_user_id = null where winner_user_id = $1 and challenge_id = $2`, [players[1], ranked]);
    const afterDelete = (await history('venue-a')).find((r) => r.id === ranked);
    assert.deepEqual(afterDelete.winners[0], [null, 1, 300]);

    // ── 3. Grants: service_role only ────────────────────────────────────────────────────
    for (const signature of [
      'live_trivia_occurrence_summaries(uuid[],date,integer)',
      'challenge_reward_history_summaries(text,timestamp with time zone,uuid,integer)',
    ]) {
      for (const role of ['anon', 'authenticated']) {
        const { ok } = (await rows(`select has_function_privilege($1, $2, 'execute') as ok`, [role, signature]))[0];
        assert.equal(ok, false, `${role} must not execute ${signature}`);
      }
      const { ok } = (await rows(`select has_function_privilege('service_role', $1, 'execute') as ok`, [signature]))[0];
      assert.equal(ok, true, `service_role executes ${signature}`);
    }

    console.log('owner history SQL: all checks passed');
  } finally {
    await db.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
