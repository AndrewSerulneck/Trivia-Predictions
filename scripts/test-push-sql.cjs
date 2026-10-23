#!/usr/bin/env node
// Isolated PostgreSQL check for supabase/migrations/20261023105750_push_notifications.sql
// (docs/native-app-store-plan.md Phase 5.1). No network, no application imports, never touches
// Supabase. Runs on PGlite (devDependency):
//   npm run test:push-sql
//
// The tables below are minimal stand-ins (only the columns the migration touches). What is proven:
// a notification is claimed once, reaches the phones of its venue profile AND of the same account,
// never a disabled phone or another player's; old rows are never claimed; rows with no phone are
// still stamped; phones go with an account deletion; tokens are unique; the reminder ledger claims
// once; and only service_role may run the claim.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require(process.env.PUSH_PGLITE_MODULE || "@electric-sql/pglite");

const MIGRATION = "supabase/migrations/20261023105750_push_notifications.sql";

const SCHEMA = `
  create role anon; create role authenticated; create role service_role;
  create table accounts(id uuid primary key);
  create table venues(id text primary key);
  create table users(id uuid primary key, account_id uuid references accounts(id) on delete cascade, venue_id text);
  create table trivia_schedules(id uuid primary key);
  create table notifications(
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    message text not null,
    type text not null,
    read boolean not null default false,
    created_at timestamptz not null default now(),
    link_url text
  );
`;

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ACCOUNT = id(100);
const OTHER_ACCOUNT = id(101);
const PROFILE_A = id(1); // ACCOUNT at venue v1
const PROFILE_B = id(2); // ACCOUNT at venue v2
const STRANGER = id(3); // OTHER_ACCOUNT
const LEGACY = id(4); // no account
const SCHEDULE = id(200);
const token = (name) => `${name}-token-${"x".repeat(40)}`;

async function run() {
  const db = new PGlite();
  const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
  const one = async (sql, params = []) => (await rows(sql, params))[0];
  const claim = () => rows(`select * from claim_notification_pushes(900, 500)`);
  const notify = async (userId, message, ageSeconds = 0) =>
    (
      await one(
        `insert into notifications(user_id, message, type, link_url, created_at)
         values ($1, $2, 'success', '/redeem-prizes', now() - make_interval(secs => $3)) returning id`,
        [userId, message, ageSeconds],
      )
    ).id;

  try {
    await db.exec(SCHEMA);
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));
    await db.exec(`
      insert into accounts(id) values ('${ACCOUNT}'), ('${OTHER_ACCOUNT}');
      insert into venues(id) values ('v1'), ('v2');
      insert into users(id, account_id, venue_id) values
        ('${PROFILE_A}', '${ACCOUNT}', 'v1'), ('${PROFILE_B}', '${ACCOUNT}', 'v2'),
        ('${STRANGER}', '${OTHER_ACCOUNT}', 'v1'), ('${LEGACY}', null, 'v1');
      insert into trivia_schedules(id) values ('${SCHEDULE}');
    `);

    // One phone registered at venue v1 (profile A), one at v2 (profile B, same account), a disabled
    // phone of the same account, a stranger's phone and a legacy profile's phone.
    const addDevice = (tok, userId, accountId, venueId, disabled = false) =>
      db.query(
        `insert into push_devices(token, platform, user_id, account_id, venue_id, disabled_at)
         values ($1, 'android', $2, $3, $4, ${disabled ? "now()" : "null"})`,
        [tok, userId, accountId, venueId],
      );
    await addDevice(token("phone-a"), PROFILE_A, ACCOUNT, "v1");
    await addDevice(token("phone-b"), PROFILE_B, ACCOUNT, "v2");
    await addDevice(token("dead"), PROFILE_A, ACCOUNT, "v1", true);
    await addDevice(token("stranger"), STRANGER, OTHER_ACCOUNT, "v1");
    await addDevice(token("legacy"), LEGACY, null, "v1");

    // ── Old rows are never claimed (they predate the outbox or a long outage) ───────────────
    const old = await notify(PROFILE_A, "old news", 3600);
    // ── A notification for profile A reaches both of the account's live phones ──────────────
    const fresh = await notify(PROFILE_A, "You won!");
    const legacyNote = await notify(LEGACY, "Legacy result");
    const nobody = await notify(STRANGER, "stranger news");
    await db.query(`delete from push_devices where user_id = $1`, [STRANGER]);

    let out = await claim();
    const forFresh = out.filter((r) => r.notification_id === fresh).map((r) => r.token).sort();
    assert.deepEqual(forFresh, [token("phone-a"), token("phone-b")], "same account, both phones, not the disabled one");
    assert.equal(out.find((r) => r.notification_id === fresh).message, "You won!");
    assert.equal(out.find((r) => r.notification_id === fresh).link_url, "/redeem-prizes");
    assert.deepEqual(
      out.filter((r) => r.notification_id === legacyNote).map((r) => r.token),
      [token("legacy")],
      "a profile with no account reaches its own phone",
    );
    assert.equal(out.filter((r) => r.notification_id === nobody).length, 0, "no phone, no row");
    assert.equal(out.filter((r) => r.notification_id === old).length, 0, "an old row is never claimed");
    assert.equal(out.length, 3);

    // Stamped once — including the one with no phone — and a second run sends nothing.
    const stamped = await rows(`select id from notifications where pushed_at is not null order by id`);
    assert.deepEqual(stamped.map((r) => r.id).sort(), [fresh, legacyNote, nobody].sort());
    assert.equal((await one(`select pushed_at from notifications where id = $1`, [old])).pushed_at, null);
    assert.deepEqual(await claim(), [], "a second run claims nothing");

    // ── Limit: oldest first, the rest wait for the next run ──────────────────────────────────
    const first = await notify(PROFILE_B, "first", 30);
    const second = await notify(PROFILE_B, "second", 10);
    out = await rows(`select * from claim_notification_pushes(900, 1)`);
    assert.deepEqual([...new Set(out.map((r) => r.notification_id))], [first]);
    out = await claim();
    assert.deepEqual([...new Set(out.map((r) => r.notification_id))], [second]);

    // The window is clamped: a huge window still can't reach the hour-old row.
    assert.deepEqual(await rows(`select * from claim_notification_pushes(999999, 500)`), []);

    // ── Tokens are unique ────────────────────────────────────────────────────────────────────
    await assert.rejects(() => addDevice(token("phone-a"), PROFILE_B, ACCOUNT, "v2"), /unique|duplicate/i);
    await assert.rejects(() => addDevice("short", PROFILE_B, ACCOUNT, "v2"), /token_length/);

    // ── Reminder ledger: claimed once ────────────────────────────────────────────────────────
    const claimReminder = () =>
      rows(
        `insert into push_game_reminders(schedule_id, occurrence_date, venue_id, starts_at)
         values ($1, '2026-10-23', 'v1', now()) on conflict do nothing returning schedule_id`,
        [SCHEDULE],
      );
    assert.equal((await claimReminder()).length, 1);
    assert.equal((await claimReminder()).length, 0, "the overlapping run sends nothing");
    await assert.rejects(
      () => db.query(`insert into push_game_reminders(schedule_id, occurrence_date, venue_id, starts_at) values ($1, 'today', 'v1', now())`, [SCHEDULE]),
      /occurrence_date_format/,
    );

    // ── Account deletion takes the phones with it ────────────────────────────────────────────
    await db.query(`delete from users where account_id = $1`, [ACCOUNT]);
    await db.query(`delete from accounts where id = $1`, [ACCOUNT]);
    assert.equal(Number((await one(`select count(*)::int as n from push_devices where account_id = $1`, [ACCOUNT])).n), 0);
    // A deleted venue only clears the phone's venue.
    await addDevice(token("venue-gone"), LEGACY, null, "v2");
    await db.query(`delete from venues where id = 'v2'`);
    assert.equal((await one(`select venue_id from push_devices where token = $1`, [token("venue-gone")])).venue_id, null);

    // ── Grants: service_role only ────────────────────────────────────────────────────────────
    const can = async (role) =>
      (await one(`select has_function_privilege($1, 'public.claim_notification_pushes(integer, integer)', 'execute') as ok`, [role])).ok;
    assert.equal(await can("service_role"), true);
    assert.equal(await can("anon"), false);
    assert.equal(await can("authenticated"), false);
    for (const table of ["push_devices", "push_game_reminders"]) {
      const priv = async (role, verb) =>
        (await one(`select has_table_privilege($1, $2, $3) as ok`, [role, `public.${table}`, verb])).ok;
      assert.equal(await priv("service_role", "select"), true, `${table}: service_role select`);
      assert.equal(await priv("service_role", "insert"), true, `${table}: service_role insert`);
      assert.equal(await priv("anon", "select"), false, `${table}: anon select`);
      assert.equal(await priv("authenticated", "select"), false, `${table}: authenticated select`);
    }

    console.log("push SQL: all checks passed");
  } finally {
    await db.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
