#!/usr/bin/env node
// Isolated PostgreSQL check for supabase/migrations/20261023105750_push_notifications.sql
// (docs/native-app-store-plan.md Phase 5.1) and 20261023141109_push_venue_news.sql (Phase 5.4). No network, no application imports, never touches
// Supabase. Runs on PGlite (devDependency):
//   npm run test:push-sql
//
// The tables below are minimal stand-ins (only the columns the migration touches). What is proven:
// a notification is claimed once, reaches the phones of its venue profile AND of the same account,
// never a disabled phone or another player's; old rows are never claimed; rows with no phone are
// still stamped; phones go with an account deletion; tokens are unique; the reminder ledger claims
// once; and only service_role may run the claim. 5.4: a bar's news reaches the phones of its players
// (profile or same account) with the switch on, once per game/prize, at most the cap per local day.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require(process.env.PUSH_PGLITE_MODULE || "@electric-sql/pglite");

const MIGRATIONS = [
  "supabase/migrations/20261023105750_push_notifications.sql",
  "supabase/migrations/20261023141109_push_venue_news.sql",
];

const SCHEMA = `
  create role anon; create role authenticated; create role service_role;
  create table accounts(id uuid primary key);
  create table venues(id text primary key, timezone text not null default 'America/New_York');
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
    for (const migration of MIGRATIONS) await db.exec(fs.readFileSync(migration, "utf8"));
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

    // ── 5.4: "News from your bars" ────────────────────────────────────────────────────────────
    const news = (venueId, kind, sourceId, cap = 5) =>
      rows(`select * from claim_venue_news_push($1, $2, $3, $4, 60)`, [venueId, kind, sourceId, cap]);
    const newsTokens = (out) => out.map((r) => r.token).sort();
    // The column defaults ON for every phone, including the ones registered before 5.4.
    assert.equal((await one(`select bool_and(notify_news) as ok from push_devices`)).ok, true, "existing phones default on");
    // v1's players: profile A (both of the account's phones), the stranger and the legacy profile.
    // Phone B was registered at v2 but belongs to the same account as profile A at v1, so it hears v1.
    await addDevice(token("stranger-2"), STRANGER, OTHER_ACCOUNT, "v1");
    await db.query(`update push_devices set notify_news = false where token = $1`, [token("legacy")]);
    let newsOut = await news("v1", "game", "sched-1");
    assert.ok(newsOut.every((r) => r.outcome === "claimed"));
    assert.deepEqual(
      newsTokens(newsOut),
      [token("phone-a"), token("phone-b"), token("stranger-2")].sort(),
      "players of the bar with the switch on; never a disabled phone or one with news off",
    );
    // A v2 announcement reaches only the account with a v2 profile.
    assert.deepEqual(newsTokens(await news("v2", "prize", "camp-1")), [token("phone-a"), token("phone-b")].sort());
    // Each game/prize is announced once, ever.
    assert.deepEqual((await news("v1", "game", "sched-1")).map((r) => [r.outcome, r.token]), [["duplicate", null]]);
    // The cap counts the bar's announcements today: sched-1 was #1; four more fit, the sixth is refused.
    for (let i = 2; i <= 5; i += 1) assert.equal((await news("v1", "prize", `cap-${i}`))[0].outcome, "claimed");
    assert.deepEqual((await news("v1", "game", "cap-6")).map((r) => [r.outcome, r.token]), [["capped", null]]);
    // A refused one leaves no row, so it isn't a "duplicate" later; v2 has its own count.
    assert.equal(Number((await one(`select count(*)::int as n from push_venue_news where source_id = 'cap-6'`)).n), 0);
    assert.equal((await news("v2", "game", "v2-game"))[0].outcome, "claimed");
    // Yesterday's announcements don't count against today.
    await db.query(`update push_venue_news set local_date = '2000-01-01' where venue_id = 'v1'`);
    assert.equal((await news("v1", "game", "next-day"))[0].outcome, "claimed");
    // No phone → nothing recorded; unknown bar; bad kind; a bad timezone falls back to New York.
    await db.exec(`insert into venues(id, timezone) values ('v3', 'Not/AZone')`);
    assert.deepEqual((await news("v3", "game", "lonely")).map((r) => r.outcome), ["no_audience"]);
    assert.equal(Number((await one(`select count(*)::int as n from push_venue_news where venue_id = 'v3'`)).n), 0);
    assert.deepEqual((await news("nope", "game", "x")).map((r) => r.outcome), ["unknown_venue"]);
    await assert.rejects(() => news("v1", "ad", "x"), /unknown kind/);
    // A phone not seen for longer than the idle window is left out.
    await db.query(`update push_devices set last_seen_at = now() - interval '90 days' where token = $1`, [token("stranger-2")]);
    assert.deepEqual(newsTokens(await news("v1", "prize", "idle-check")), [token("phone-a"), token("phone-b")].sort());
    assert.equal(
      (await one(`select devices from push_venue_news where source_id = 'idle-check'`)).devices,
      2,
      "the ledger records how many phones it went to",
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
    const canNews = async (role) =>
      (await one(`select has_function_privilege($1, 'public.claim_venue_news_push(text, text, text, integer, integer)', 'execute') as ok`, [role])).ok;
    assert.equal(await canNews("service_role"), true);
    assert.equal(await canNews("anon"), false);
    assert.equal(await canNews("authenticated"), false);
    for (const table of ["push_devices", "push_game_reminders", "push_venue_news"]) {
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
