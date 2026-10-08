#!/usr/bin/env node
// Isolated PostgreSQL check for supabase/migrations/20261008044524_player_account_deletion.sql.
// No network, no application imports, never touches Supabase. Native app store plan Phase 1b.
//
// The tables below are a minimal synthetic copy of the live schema: only the columns the function
// touches, but with production's exact FK targets and ON DELETE rules (verified 2026-10-08 against
// the migrations and the live PostgREST schema). The real migration file is then applied on top.
//
// PLAYER_DELETE_PGLITE_MODULE=../tmp/bingo-phase4-pg/node_modules/@electric-sql/pglite \
//   node scripts/test-player-account-deletion.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require(process.env.PLAYER_DELETE_PGLITE_MODULE || "@electric-sql/pglite");

const MIGRATION = "supabase/migrations/20261008044524_player_account_deletion.sql";

const SCHEMA = `
  create role anon; create role authenticated; create role service_role;
  create table venues(id text primary key);
  create table accounts(id uuid primary key, auth_id uuid, username text);
  create table users(id uuid primary key, auth_id uuid, username text, venue_id text references venues(id),
    account_id uuid references accounts(id) on delete cascade);
  create table venue_owners(id uuid primary key default gen_random_uuid(), auth_id uuid);
  create table challenge_campaigns(id uuid primary key, winner_user_id uuid references users(id) on delete set null);
  create table challenge_cycle_winners(id uuid primary key default gen_random_uuid(),
    challenge_id uuid not null references challenge_campaigns(id) on delete cascade,
    cycle_start timestamptz not null,
    winner_user_id uuid not null references users(id) on delete cascade,
    unique (challenge_id, cycle_start, winner_user_id));
  create table challenge_campaign_redemptions(id uuid primary key default gen_random_uuid(),
    challenge_id uuid references challenge_campaigns(id) on delete cascade,
    winner_user_id uuid not null references users(id) on delete cascade);
  create table pos_reward_applications(id uuid primary key default gen_random_uuid(),
    redemption_id uuid references challenge_campaign_redemptions(id) on delete set null, amount_cents integer);
  create table ad_interactions(interaction_id uuid primary key default gen_random_uuid(),
    user_id uuid null references users(id) on delete set null);
  create table user_sessions(session_id uuid primary key, user_id uuid not null references users(id) on delete cascade,
    ip_address text);
  create table game_sessions(session_id uuid primary key, user_id uuid not null references users(id) on delete cascade,
    user_session_id uuid null references user_sessions(session_id) on delete set null);
  create table story_share_events(event_id uuid primary key default gen_random_uuid(),
    user_id uuid null references users(id) on delete set null,
    user_session_id uuid null references user_sessions(session_id) on delete set null,
    game_session_id uuid null references game_sessions(session_id) on delete set null);
  create table venue_presence_events(id uuid primary key default gen_random_uuid(),
    user_id uuid references users(id) on delete set null);
  create table username_change_attempts(id uuid primary key default gen_random_uuid(),
    user_id uuid references users(id) on delete set null, requester_auth_id uuid);
  create table username_change_audit(id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade, changed_by_auth_id uuid,
    old_username text, new_username text);
  create table category_blitz_sessions(id uuid primary key, cumulative_totals jsonb);
  create table category_blitz_submissions(id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade, auth_id uuid);
  create table category_blitz_session_participants(id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade, auth_id uuid);
  create table llm_usage_logs(id uuid primary key default gen_random_uuid(), feature text, metadata jsonb);
  create table pickem_picks(id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade);
  create table user_passkeys(id uuid primary key default gen_random_uuid(),
    account_id uuid references accounts(id) on delete cascade, user_id uuid references users(id) on delete set null);
  create table webauthn_challenges(id uuid primary key default gen_random_uuid(),
    account_id uuid references accounts(id) on delete cascade, user_id uuid references users(id) on delete set null);
`;

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const P = { account: id(1), auth: id(2), userA: id(3), userB: id(4), authB: id(5) }; // the deleting player
const O = { account: id(11), auth: id(12), user: id(13) }; // a bystander at the same venue
const L = { user: id(21), auth: id(22) }; // a legacy profile with no account
const S = { user: id(31), auth: id(32) }; // a profile whose auth id is ALSO a partner's
const CAMPAIGN = id(41);
const SESSION = id(42);
const CYCLE = "2026-10-05T00:00:00Z";

async function seed(db) {
  const q = (sql, params = []) => db.query(sql, params);
  await q(`insert into venues values ('v1'), ('v2')`);
  await q(`insert into accounts values ($1,$2,'Player'), ($3,$4,'Bystander')`, [P.account, P.auth, O.account, O.auth]);
  await q(
    `insert into users(id, auth_id, username, venue_id, account_id) values
      ($1,$2,'Player','v1',$3), ($4,$5,'Player','v2',$3), ($6,$7,'Bystander','v1',$8),
      ($9,$10,'Legacy','v1',null), ($11,$12,'Shared','v1',null)`,
    [P.userA, P.auth, P.account, P.userB, P.authB, O.user, O.auth, O.account, L.user, L.auth, S.user, S.auth]
  );
  await q(`insert into venue_owners(auth_id) values ($1)`, [S.auth]);
  await q(`insert into challenge_campaigns values ($1, $2)`, [CAMPAIGN, P.userA]); // P is the "resolved" marker
  await q(`insert into challenge_cycle_winners(challenge_id, cycle_start, winner_user_id) values ($1,$2,$3), ($1,$2,$4)`, [CAMPAIGN, CYCLE, P.userA, O.user]);
  const red = await q(`insert into challenge_campaign_redemptions(challenge_id, winner_user_id) values ($1,$2) returning id`, [CAMPAIGN, P.userA]);
  await q(`insert into challenge_campaign_redemptions(challenge_id, winner_user_id) values ($1,$2)`, [CAMPAIGN, O.user]);
  await q(`insert into pos_reward_applications(redemption_id, amount_cents) values ($1, 2500)`, [red.rows[0].id]);
  for (const u of [P.userA, P.userB, O.user]) {
    await q(`insert into ad_interactions(user_id) values ($1)`, [u]);
    await q(`insert into venue_presence_events(user_id) values ($1)`, [u]);
    await q(`insert into pickem_picks(user_id) values ($1)`, [u]);
    await q(`insert into category_blitz_submissions(user_id, auth_id) values ($1, (select auth_id from users where id=$1))`, [u]);
    await q(`insert into username_change_attempts(user_id, requester_auth_id) values ($1, (select auth_id from users where id=$1))`, [u]);
  }
  await q(`insert into user_sessions values ($1,$2,'198.51.100.7'), ($3,$4,'198.51.100.8')`, [id(51), P.userA, id(52), O.user]);
  await q(`insert into game_sessions values ($1,$2,$3), ($4,$5,$6)`, [id(61), P.userA, id(51), id(62), O.user, id(52)]);
  // P's story shares: one with user_id, one recorded with user_id null but P's session ids.
  await q(`insert into story_share_events(user_id, user_session_id, game_session_id) values ($1,$2,$3), (null,$2,$3), ($4,$5,$6)`, [P.userA, id(51), id(61), O.user, id(52), id(62)]);
  await q(`insert into username_change_audit(user_id, changed_by_auth_id, old_username, new_username) values ($1,$2,'OldPlayerName','Player')`, [P.userA, P.auth]);
  await q(`insert into category_blitz_sessions values ($1, $2)`, [SESSION, JSON.stringify({ [P.userA]: 12, [P.userB]: 3, [O.user]: 9 })]);
  await q(
    `insert into llm_usage_logs(feature, metadata) values ('username_moderation', '{"username":"Player"}'),
      ('username_moderation', '{"username":"OldPlayerName"}'), ('username_moderation', '{"username":"Bystander"}'),
      ('category_blitz_grading', '{"username":"Player"}')`
  );
  await q(`insert into user_passkeys(account_id, user_id) values ($1,$2), ($3,$4), (null,$5)`, [P.account, P.userA, O.account, O.user, L.user]);
  await q(`insert into webauthn_challenges(account_id, user_id) values ($1,$2), (null,$3), ($4,$5)`, [P.account, P.userB, L.user, O.account, O.user]);
}

const count = async (db, sql, params = []) => Number((await db.query(`select count(*)::int as n from ${sql}`, params)).rows[0].n);
const call = async (db, userId) => (await db.query(`select delete_player_account($1) as r`, [userId])).rows[0].r;

async function snapshot(db) {
  const tables = [
    "accounts", "users", "challenge_cycle_winners", "challenge_campaign_redemptions", "pos_reward_applications",
    "ad_interactions", "user_sessions", "game_sessions", "story_share_events", "venue_presence_events",
    "username_change_attempts", "username_change_audit", "category_blitz_submissions", "llm_usage_logs",
    "pickem_picks", "user_passkeys", "webauthn_challenges",
  ];
  const out = {};
  for (const t of tables) out[t] = await count(db, t);
  out.blitzTotals = (await db.query(`select cumulative_totals from category_blitz_sessions`)).rows[0].cumulative_totals;
  out.nullWinners = await count(db, "challenge_cycle_winners where winner_user_id is null");
  return out;
}

async function run() {
  const db = new PGlite();
  try {
    await db.exec(SCHEMA);
    await seed(db);
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));

    // Grants: service role only.
    const privileges = (await db.query(`select
      has_function_privilege('anon','delete_player_account(uuid)','execute') as anon,
      has_function_privilege('authenticated','delete_player_account(uuid)','execute') as authenticated,
      has_function_privilege('service_role','delete_player_account(uuid)','execute') as service`)).rows[0];
    assert.deepEqual(privileges, { anon: false, authenticated: false, service: true });

    // Unknown id → not_found, nothing changes.
    const before = await snapshot(db);
    assert.deepEqual(await call(db, id(999)), { outcome: "not_found" });
    assert.deepEqual(await snapshot(db), before);

    // Partial failure → the whole call rolls back. Force the very last delete (accounts) to fail.
    await db.exec(`create function fail_delete() returns trigger language plpgsql as $$
      begin raise exception 'forced failure'; end; $$;
      create trigger fail_accounts before delete on accounts for each row execute function fail_delete();`);
    await assert.rejects(call(db, P.userA), /forced failure/);
    assert.deepEqual(await snapshot(db), before, "a failure part-way must delete nothing");
    await db.exec(`drop trigger fail_accounts on accounts;`);

    // Happy path, called with the player's SECOND venue profile: the whole account goes.
    const result = await call(db, P.userB);
    assert.equal(result.outcome, "deleted");
    assert.equal(result.users_deleted, 2);
    assert.equal(result.account_deleted, true);
    assert.equal(result.winner_rows_blanked, 1);
    assert.deepEqual([...result.unreferenced_auth_ids].sort(), [P.auth, P.authB].sort());

    const after = await snapshot(db);
    assert.equal(await count(db, "accounts where id = $1", [P.account]), 0);
    assert.equal(await count(db, "users where account_id = $1 or id in ($2,$3)", [P.account, P.userA, P.userB]), 0);
    // Winner slot kept, name gone; the cycle still counts two winners, so no extra prize.
    assert.equal(await count(db, "challenge_cycle_winners where challenge_id = $1 and cycle_start = $2", [CAMPAIGN, CYCLE]), 2);
    assert.equal(after.nullWinners, 1);
    // Campaign "resolved" marker survives (FK dropped), so the reward does not re-open.
    assert.equal((await db.query(`select winner_user_id from challenge_campaigns where id=$1`, [CAMPAIGN])).rows[0].winner_user_id, P.userA);
    // Coupon gone; the venue's money ledger kept, unlinked.
    assert.equal(after.challenge_campaign_redemptions, 1);
    assert.equal(after.pos_reward_applications, 1);
    assert.equal(await count(db, "pos_reward_applications where redemption_id is null and amount_cents = 2500"), 1);
    // SET NULL consumers removed, not orphaned.
    assert.equal(await count(db, "ad_interactions where user_id is null"), 0);
    assert.equal(await count(db, "venue_presence_events where user_id is null"), 0);
    assert.equal(await count(db, "username_change_attempts where user_id is null"), 0);
    assert.equal(after.story_share_events, 1, "only the bystander's story share remains");
    // Cascades.
    assert.equal(after.user_sessions, 1);
    assert.equal(after.game_sessions, 1);
    assert.equal(after.pickem_picks, 1);
    assert.equal(after.category_blitz_submissions, 1);
    assert.equal(after.username_change_audit, 0);
    assert.equal(after.user_passkeys, 2, "bystander's + legacy profile's passkeys remain");
    assert.equal(after.webauthn_challenges, 2);
    // Blitz scoreboard keys and moderation log rows for every name the player held.
    assert.deepEqual(after.blitzTotals, { [O.user]: 9 });
    assert.equal(await count(db, "llm_usage_logs where feature = 'username_moderation'"), 1);
    assert.equal(await count(db, "llm_usage_logs where feature = 'category_blitz_grading'"), 1);
    // Bystander untouched.
    assert.equal(await count(db, "users where id = $1", [O.user]), 1);
    assert.equal(await count(db, "accounts where id = $1", [O.account]), 1);

    // Idempotent: a second call finds nothing.
    assert.deepEqual(await call(db, P.userA), { outcome: "not_found" });

    // Legacy profile with no account: only that row goes.
    const legacy = await call(db, L.user);
    assert.equal(legacy.outcome, "deleted");
    assert.equal(legacy.users_deleted, 1);
    assert.equal(legacy.account_deleted, false);
    assert.deepEqual(legacy.unreferenced_auth_ids, [L.auth]);
    assert.equal(await count(db, "users"), 2);
    assert.equal(await count(db, "user_passkeys where user_id is null and account_id is null"), 0, "no orphaned passkey");
    assert.equal(await count(db, "webauthn_challenges where user_id is null and account_id is null"), 0);

    // An auth id that a partner (venue_owners) also uses is never reported as deletable.
    const shared = await call(db, S.user);
    assert.equal(shared.outcome, "deleted");
    assert.deepEqual(shared.unreferenced_auth_ids, []);
    assert.equal(await count(db, "venue_owners where auth_id = $1", [S.auth]), 1);

    console.log(
      "Player account deletion checks passed: service-role-only grant, not_found, rollback on partial failure, " +
        "whole-account delete from any profile, winner slot kept with name blanked, campaign marker kept, " +
        "coupon removed and money ledger kept unlinked, SET NULL consumers removed, cascades, Blitz totals, " +
        "moderation log, bystander untouched, idempotent, legacy profile, partner-shared auth id protected."
    );
  } finally {
    await db.close();
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
