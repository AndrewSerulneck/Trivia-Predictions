#!/usr/bin/env node
// Isolated PostgreSQL verification; no network or application imports.
// BINGO_PGLITE_MODULE=../tmp/bingo-phase4-pg/node_modules/@electric-sql/pglite node scripts/test-bingo-atomic-grading.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require(process.env.BINGO_PGLITE_MODULE || '@electric-sql/pglite');
const fixture = JSON.parse(fs.readFileSync('tests/fixtures/bingo-brunswick-grove-2026-09-09.json', 'utf8'));

async function run() {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create function auth.uid() returns uuid language sql as 'select null::uuid';
      create table users(id uuid primary key, auth_id uuid); create table venues(id text primary key);
      create function set_updated_at() returns trigger language plpgsql as $$begin new.updated_at = clock_timestamp(); return new; end;$$;
      create table notifications(id uuid default gen_random_uuid(), user_id uuid not null, type text not null, message text not null, link_url text);`);
    await db.exec(fs.readFileSync('supabase/migrations/20260420113000_add_sports_bingo_tables.sql', 'utf8'));
    await db.exec('alter table sports_bingo_cards add column last_cron_processed_at timestamptz;');
    await db.exec(fs.readFileSync('supabase/migrations/20260914010000_bingo_atomic_grading.sql', 'utf8'));
    const player = '00000000-0000-0000-0000-000000000001';
    await db.query('insert into users values ($1)', [player]);
    await db.query('insert into venues values ($1)', ['fixture-venue']);
    await db.query(`insert into sports_bingo_cards(id,user_id,venue_id,game_id,game_label,home_team,away_team,starts_at) values ($1,$2,$3,$4,$5,$6,$7,$8)`, [fixture.card.id, player, 'fixture-venue', fixture.card.game_id, 'Fixture only', fixture.card.home_team, fixture.card.away_team, fixture.card.starts_at]);
    for (const square of fixture.squares) await db.query('insert into sports_bingo_squares(id,card_id,square_index,resolver,is_free,label) values($1,$2,$3,$4,$5,$6)', [square.id, fixture.card.id, square.square_index, square.resolver, square.is_free, square.label]);
    const read = async () => (await db.query('select updated_at::text as version,status,grading_state from sports_bingo_cards where id=$1', [fixture.card.id])).rows[0];
    const original = await read();
    const squares = fixture.squares.map(square => ({ id: square.id, expected_resolver: square.resolver, status: square.expected }));
    const call = async (version, observed, status = 'active', payload = squares, notification = null) => (await db.query('select apply_sports_bingo_grading($1,$2,$3,$4,$5,$6,$7,$8) as result', [fixture.card.id, version, observed, payload, { firstFinalAt: '2026-09-10T03:40:00Z', lastObservedAt: observed }, status, status === 'won' ? [2,7,12,17,22] : null, notification])).rows[0].result;
    assert.equal((await call(original.version, '2026-09-10T03:40:00Z')).applied, true);
    assert.equal((await call(original.version, '2026-09-10T03:41:00Z')).applied, false, 'stale version must reject');
    let current = await read();
    assert.equal((await call(current.version, '2026-09-10T03:39:00Z')).applied, false, 'out-of-order observation must reject');
    const changedRule = structuredClone(squares); changedRule[0].expected_resolver = { kind: 'free' };
    assert.equal((await call(current.version, '2026-09-10T03:41:00Z', 'active', changedRule)).applied, false, 'changed resolver must reject whole batch');
    await assert.rejects(call(current.version, '2026-09-10T03:41:00Z', 'active', squares.slice(1)), /Invalid Bingo grading payload/);
    const pending = structuredClone(squares); pending[0].status = 'pending';
    await assert.rejects(call(current.version, '2026-09-10T03:41:00Z', 'lost', pending), /Cannot finalize an incomplete/);
    const brokenLine = structuredClone(squares); brokenLine[2].status = 'miss';
    await assert.rejects(call(current.version, '2026-09-10T03:41:00Z', 'won', brokenLine), /Invalid Bingo winning line/);
    assert.equal((await read()).version, current.version, 'invalid batch is atomic');
    // Two competing callers read the same revision. PostgreSQL executes one accepted transition.
    const notification = { type: 'success', message: 'Fixture win', link_url: '/fixture' };
    const competing = await Promise.all([call(current.version, '2026-09-10T03:41:01Z', 'won', squares, notification), call(current.version, '2026-09-10T03:41:02Z', 'won', squares, notification)]);
    assert.equal(competing.filter(result => result.applied).length, 1);
    assert.equal(Number((await db.query('select count(*) as n from notifications')).rows[0].n), 1);
    current = await read();
    assert.equal(current.status, 'won');
    assert.equal((await call(current.version, '2026-09-10T03:43:00Z', 'lost')).applied, false, 'terminal boards require explicit historical repair');
    const privileges = (await db.query(`select has_function_privilege('anon','apply_sports_bingo_grading(uuid,timestamptz,timestamptz,jsonb,jsonb,text,jsonb,jsonb)','execute') as anon, has_function_privilege('authenticated','apply_sports_bingo_grading(uuid,timestamptz,timestamptz,jsonb,jsonb,text,jsonb,jsonb)','execute') as authenticated, has_function_privilege('service_role','apply_sports_bingo_grading(uuid,timestamptz,timestamptz,jsonb,jsonb,text,jsonb,jsonb)','execute') as service`)).rows[0];
    assert.deepEqual(privileges, { anon: false, authenticated: false, service: true });
    console.log('PostgreSQL grading checks passed: migration, 25-cell apply, version/order/resolver guards, atomic rejection, competing transitions, one notification, terminal isolation, service-role-only execution.');
  } finally { await db.close(); }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
