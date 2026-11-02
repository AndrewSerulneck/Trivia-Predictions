#!/usr/bin/env node
// Isolated PostgreSQL check for the Pick 'Em Phase 7.1 / 7.1b lockdown migrations
// (docs/pickem-college-football-and-prize-plan.md §9 finding F1):
//   supabase/migrations/20261101150024_pickem_picks_server_only_writes.sql
//   supabase/migrations/20261101150026_users_server_only_writes.sql
// No network, no application imports, never touches Supabase. Runs on PGlite (devDependency):
//   npm run test:player-write-lockdown-sql
// or point at another copy: PICKEM_POINTS_PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite node scripts/test-player-write-lockdown-sql.cjs
//
// users and pickem_picks are minimal stand-ins carrying production's state before the fix: RLS on,
// the policies copied verbatim from 20260214153000_initial_schema.sql and
// 20260427113000_add_pickem_tables.sql, and the ALL grants from
// 20260923130841_explicit_api_grants_baseline.sql. What is proven: before the fix a signed-in
// player CAN forge a won pick and their own points (the hole is real); after it, insert / update /
// delete / truncate are refused for authenticated and anon; a player still reads their own rows
// (and only those); service_role still writes both tables.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require(process.env.PICKEM_POINTS_PGLITE_MODULE || "@electric-sql/pglite");

const MIGRATIONS = [
  "supabase/migrations/20261101150024_pickem_picks_server_only_writes.sql",
  "supabase/migrations/20261101150026_users_server_only_writes.sql",
];

const PLAYER_AUTH = "11111111-1111-1111-1111-111111111111";
const OTHER_AUTH = "22222222-2222-2222-2222-222222222222";
const PLAYER_USER = "aaaaaaaa-0000-0000-0000-000000000001";
const OTHER_USER = "aaaaaaaa-0000-0000-0000-000000000002";

const SCHEMA = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;

  create table public.users(
    id uuid primary key default gen_random_uuid(),
    auth_id uuid,
    username text not null,
    venue_id text not null,
    points integer not null default 0
  );
  create table public.pickem_picks(
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    venue_id text not null,
    game_id text not null,
    status text not null default 'pending',
    reward_points integer not null default 0,
    reward_claimed_at timestamptz
  );

  alter table users enable row level security;
  drop policy if exists "Users can read own profiles" on users;
  create policy "Users can read own profiles"
    on users for select
    using (auth_id = auth.uid());
  drop policy if exists "Users can create own profiles" on users;
  create policy "Users can create own profiles"
    on users for insert
    with check (auth_id = auth.uid());
  drop policy if exists "Users can update own profiles" on users;
  create policy "Users can update own profiles"
    on users for update
    using (auth_id = auth.uid())
    with check (auth_id = auth.uid());

  alter table pickem_picks enable row level security;
  drop policy if exists "Users can read own pickem picks" on pickem_picks;
  create policy "Users can read own pickem picks"
    on pickem_picks for select
    using (user_id in (select id from users where auth_id = auth.uid()));
  drop policy if exists "Users can insert own pickem picks" on pickem_picks;
  create policy "Users can insert own pickem picks"
    on pickem_picks for insert
    with check (user_id in (select id from users where auth_id = auth.uid()));
  drop policy if exists "Users can update own pickem picks" on pickem_picks;
  create policy "Users can update own pickem picks"
    on pickem_picks for update
    using (user_id in (select id from users where auth_id = auth.uid()))
    with check (user_id in (select id from users where auth_id = auth.uid()));

  grant all privileges on table public.pickem_picks to anon;
  grant all privileges on table public.pickem_picks to authenticated;
  grant all privileges on table public.pickem_picks to service_role;
  grant all privileges on table public.users to anon;
  grant all privileges on table public.users to authenticated;
  grant all privileges on table public.users to service_role;
`;

const SEED = `
  insert into users(id, auth_id, username, venue_id, points) values
    ('${PLAYER_USER}', '${PLAYER_AUTH}', 'player', 'venue-a', 40),
    ('${OTHER_USER}', '${OTHER_AUTH}', 'other', 'venue-a', 70);
  insert into pickem_picks(user_id, venue_id, game_id, status, reward_points, reward_claimed_at) values
    ('${PLAYER_USER}', 'venue-a', 'g-lost', 'lost', 0, null),
    ('${PLAYER_USER}', 'venue-a', 'g-paid', 'won', 10, '2026-10-31T20:00:00Z'),
    ('${OTHER_USER}', 'venue-a', 'g-other', 'won', 10, '2026-10-31T20:00:00Z');
`;

const DENIED = /permission denied/i;

async function run() {
  const db = new PGlite();
  const rows = async (sql, params = []) => (await db.query(sql, params)).rows;

  // Runs `fn` as `role` (with a JWT sub when given), always returning to the superuser.
  const as = async (role, authId, fn) => {
    await db.exec(`set role ${role}`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [authId ?? ""]);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role`);
      await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    }
  };
  const player = (fn) => as("authenticated", PLAYER_AUTH, fn);

  // Every write a player could send through PostgREST, against their OWN rows (the case the
  // policies allowed).
  const forgeWonPick = () =>
    rows(`insert into pickem_picks(user_id, venue_id, game_id, status) values ($1, 'venue-a', 'g-forged', 'won')`, [PLAYER_USER]);
  const flipLostToWon = () => rows(`update pickem_picks set status = 'won' where game_id = 'g-lost'`);
  const unclaimPaidPick = () => rows(`update pickem_picks set reward_claimed_at = null where game_id = 'g-paid'`);
  const setOwnPoints = () => rows(`update users set points = 999999 where id = $1`, [PLAYER_USER]);
  const createProfile = () =>
    rows(`insert into users(auth_id, username, venue_id, points) values ($1, 'clone', 'venue-b', 5000)`, [PLAYER_AUTH]);

  try {
    await db.exec(SCHEMA);
    await db.exec(SEED);

    // ── Before the fix: the hole is real (so the "after" checks below prove something) ───────────
    await db.exec("begin");
    await player(async () => {
      await forgeWonPick();
      await flipLostToWon();
      await unclaimPaidPick();
      await setOwnPoints();
      await createProfile();
    });
    assert.equal((await rows(`select count(*)::int as n from pickem_picks where status = 'won' and user_id = $1`, [PLAYER_USER]))[0].n, 3);
    assert.equal((await rows(`select points from users where id = $1`, [PLAYER_USER]))[0].points, 999999);
    await db.exec("rollback");
    console.log("ok - before the fix a signed-in player can forge a won pick, un-pay a pick, set own points, add a profile");

    for (const file of MIGRATIONS) await db.exec(fs.readFileSync(file, "utf8"));

    // ── After: every player write is refused ─────────────────────────────────────────────────────
    for (const [label, write] of [
      ["insert a won pick", forgeWonPick],
      ["flip a lost pick to won", flipLostToWon],
      ["un-pay a paid pick", unclaimPaidPick],
      ["delete own pick", () => rows(`delete from pickem_picks where game_id = 'g-lost'`)],
      ["truncate pickem_picks", () => rows(`truncate pickem_picks`)],
      ["set own points", setOwnPoints],
      ["create a profile", createProfile],
      ["delete own profile", () => rows(`delete from users where id = $1`, [PLAYER_USER])],
      ["truncate users", () => rows(`truncate users cascade`)],
    ]) {
      await assert.rejects(player(write), DENIED, `authenticated: ${label}`);
      await assert.rejects(as("anon", null, write), DENIED, `anon: ${label}`);
    }
    const unchanged = await rows(`select game_id, status, reward_claimed_at from pickem_picks where user_id = $1 order by game_id`, [PLAYER_USER]);
    assert.deepEqual(unchanged.map((row) => [row.game_id, row.status, row.reward_claimed_at !== null]), [
      ["g-lost", "lost", false],
      ["g-paid", "won", true],
    ]);
    assert.equal((await rows(`select points from users where id = $1`, [PLAYER_USER]))[0].points, 40);
    assert.equal((await rows(`select count(*)::int as n from users`))[0].n, 2);
    console.log("ok - after the fix authenticated and anon can't insert, update, delete or truncate either table");

    // The write policies are gone; the read policies stay.
    const policies = await rows(`select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by tablename, policyname`);
    assert.deepEqual(policies.map((row) => [row.tablename, row.policyname, row.cmd]), [
      ["pickem_picks", "Users can read own pickem picks", "SELECT"],
      ["users", "Users can read own profiles", "SELECT"],
    ]);
    for (const table of ["pickem_picks", "users"]) {
      for (const role of ["anon", "authenticated"]) {
        assert.equal((await rows(`select has_table_privilege($1, $2, 'SELECT') as ok`, [role, `public.${table}`]))[0].ok, true);
        for (const privilege of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
          assert.equal(
            (await rows(`select has_table_privilege($1, $2, $3) as ok`, [role, `public.${table}`, privilege]))[0].ok,
            false,
            `${role} ${privilege} on ${table}`,
          );
        }
      }
    }
    console.log("ok - only the read policies remain; anon/authenticated keep SELECT and nothing else");

    // ── Reads still work, scoped to the player's own rows ────────────────────────────────────────
    const ownPicks = await player(() => rows(`select game_id from pickem_picks order by game_id`));
    assert.deepEqual(ownPicks.map((row) => row.game_id), ["g-lost", "g-paid"]);
    const ownProfiles = await player(() => rows(`select id from users`));
    assert.deepEqual(ownProfiles.map((row) => row.id), [PLAYER_USER]);
    assert.equal((await as("anon", null, () => rows(`select count(*)::int as n from pickem_picks`)))[0].n, 0);
    console.log("ok - a player still reads their own picks and profile (and nobody else's); anon sees none");

    // ── The server (service_role) still writes both tables ───────────────────────────────────────
    await as("service_role", null, async () => {
      const [created] = await rows(`insert into users(auth_id, username, venue_id) values ($1, 'new', 'venue-b') returning id`, [OTHER_AUTH]);
      await rows(`update users set points = points + 10 where id = $1`, [created.id]);
      await rows(`insert into pickem_picks(user_id, venue_id, game_id) values ($1, 'venue-b', 'g-new')`, [created.id]);
      await rows(`update pickem_picks set status = 'won', reward_claimed_at = now(), reward_points = 10 where game_id = 'g-new'`);
      await rows(`delete from pickem_picks where game_id = 'g-new'`);
      await rows(`delete from users where id = $1`, [created.id]);
    });
    console.log("ok - service_role still inserts, updates and deletes both tables");

    // ── Re-running the migrations is harmless ────────────────────────────────────────────────────
    for (const file of MIGRATIONS) await db.exec(fs.readFileSync(file, "utf8"));
    console.log("ok - both migrations re-run cleanly");
  } finally {
    await db.close();
  }
}

run().then(
  () => console.log("player write lockdown SQL: all checks passed"),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
