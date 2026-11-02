#!/usr/bin/env node
// Isolated PostgreSQL check for the Pick 'Em Phase 7.5.3 save lease
// (docs/pickem-college-football-and-prize-plan.md §10 finding F17):
//   supabase/migrations/20261102021619_pickem_prize_save_leases.sql
// No network, no application imports, never touches Supabase. Runs on PGlite (devDependency):
//   npm run test:pickem-prize-lease-sql
// or point at another copy: PICKEM_POINTS_PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite node scripts/test-pickem-prize-lease-sql.cjs
//
// What is proven: a second claim is refused while a live lease is held, and wins once it has run out;
// the holder may renew its own lease; release by a stranger's token (or after a takeover) deletes
// nothing; the lease is per venue; bad arguments are refused; anon/authenticated can neither call the
// functions nor touch the table, service_role can call both. PGlite is one connection, so two claims
// can't truly run at once here: the per-venue advisory lock plus the primary key are what serialise
// them in Postgres.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require(process.env.PICKEM_POINTS_PGLITE_MODULE || "@electric-sql/pglite");

const MIGRATION = "supabase/migrations/20261102021619_pickem_prize_save_leases.sql";

const TOKEN_A = "aaaaaaaa-0000-0000-0000-00000000000a";
const TOKEN_B = "bbbbbbbb-0000-0000-0000-00000000000b";
const TOKEN_C = "cccccccc-0000-0000-0000-00000000000c";

// Supabase grants EXECUTE on every new public function to the API roles by default; the migration
// must take that back itself.
const SCHEMA = `
  create role anon; create role authenticated; create role service_role bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  create table public.venues(id text primary key);
  insert into public.venues(id) values ('venue-a'), ('venue-b');
`;

const DENIED = /permission denied/i;

async function run() {
  const db = new PGlite();
  const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
  const as = async (role, fn) => {
    await db.exec(`set role ${role}`);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role`);
    }
  };
  const claim = async (venue, token, ttl) =>
    (await rows(
      ttl === undefined
        ? `select claim_pickem_prize_save($1, $2::uuid) as ok`
        : `select claim_pickem_prize_save($1, $2::uuid, $3) as ok`,
      ttl === undefined ? [venue, token] : [venue, token, ttl],
    ))[0].ok;
  const release = async (venue, token) =>
    (await rows(`select release_pickem_prize_save($1, $2::uuid) as ok`, [venue, token]))[0].ok;
  const holder = async (venue) =>
    (await rows(`select token from pickem_prize_save_leases where venue_id = $1`, [venue]))[0]?.token ?? null;
  const expire = (venue) =>
    rows(`update pickem_prize_save_leases set expires_at = now() - interval '1 second' where venue_id = $1`, [venue]);

  try {
    await db.exec(SCHEMA);
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));

    // ── Claim ───────────────────────────────────────────────────────────────────────────────────
    assert.equal(await as("service_role", () => claim("venue-a", TOKEN_A)), true);
    assert.equal(await holder("venue-a"), TOKEN_A);
    const [{ ttl }] = await rows(
      `select round(extract(epoch from expires_at - now()))::int as ttl from pickem_prize_save_leases where venue_id = 'venue-a'`,
    );
    assert.equal(ttl, 30, "the default lease is 30 seconds");
    console.log("ok - the first claim wins (default 30 s)");

    assert.equal(await as("service_role", () => claim("venue-a", TOKEN_B)), false);
    assert.equal(await holder("venue-a"), TOKEN_A);
    console.log("ok - a second claim is refused while the lease is live, and leaves it alone");

    assert.equal(await claim("venue-a", TOKEN_A, 60), true);
    assert.equal(await holder("venue-a"), TOKEN_A);
    console.log("ok - the holder can renew its own lease");

    assert.equal(await claim("venue-b", TOKEN_B), true);
    console.log("ok - the lease is per venue: another bar is not blocked");

    await expire("venue-a");
    assert.equal(await claim("venue-a", TOKEN_C), true);
    assert.equal(await holder("venue-a"), TOKEN_C);
    console.log("ok - once a lease has run out, another save takes it over");

    // ── Release ─────────────────────────────────────────────────────────────────────────────────
    assert.equal(await as("service_role", () => release("venue-a", TOKEN_A)), false);
    assert.equal(await holder("venue-a"), TOKEN_C);
    assert.equal(await release("venue-a", TOKEN_B), false);
    assert.equal(await holder("venue-a"), TOKEN_C);
    console.log("ok - release by a stranger's token (or the token it was taken over from) deletes nothing");

    assert.equal(await release("venue-a", TOKEN_C), true);
    assert.equal(await holder("venue-a"), null);
    assert.equal(await claim("venue-a", TOKEN_A), true);
    console.log("ok - the holder's release frees the bar at once");

    // ── Bad arguments ───────────────────────────────────────────────────────────────────────────
    for (const [label, args] of [
      ["no venue", [null, TOKEN_A, 30]],
      ["blank venue", ["  ", TOKEN_A, 30]],
      ["no token", ["venue-a", null, 30]],
      ["ttl 0", ["venue-a", TOKEN_A, 0]],
      ["ttl too long", ["venue-a", TOKEN_A, 301]],
      ["ttl null", ["venue-a", TOKEN_A, null]],
    ]) {
      await assert.rejects(rows(`select claim_pickem_prize_save($1, $2::uuid, $3)`, args), /claim_pickem_prize_save/, label);
    }
    await assert.rejects(claim("venue-missing", TOKEN_A), /foreign key/i, "an unknown venue");
    console.log("ok - bad arguments and unknown venues are refused");

    // ── Grants ──────────────────────────────────────────────────────────────────────────────────
    for (const role of ["anon", "authenticated"]) {
      await assert.rejects(as(role, () => claim("venue-b", TOKEN_C)), DENIED, `${role}: claim`);
      await assert.rejects(as(role, () => release("venue-b", TOKEN_B)), DENIED, `${role}: release`);
      await assert.rejects(as(role, () => rows(`select * from pickem_prize_save_leases`)), DENIED, `${role}: read`);
      await assert.rejects(as(role, () => rows(`delete from pickem_prize_save_leases`)), DENIED, `${role}: delete`);
    }
    for (const signature of ["claim_pickem_prize_save(text, uuid, integer)", "release_pickem_prize_save(text, uuid)"]) {
      for (const role of ["public", "anon", "authenticated"]) {
        const [{ ok }] = await rows(
          role === "public"
            ? `select exists(select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = $1::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') as ok`
            : `select has_function_privilege($2, $1::regprocedure, 'EXECUTE') as ok`,
          role === "public" ? [`public.${signature}`] : [`public.${signature}`, role],
        );
        assert.equal(ok, false, `${role} EXECUTE on ${signature}`);
      }
      assert.equal((await rows(`select has_function_privilege('service_role', $1::regprocedure, 'EXECUTE') as ok`, [`public.${signature}`]))[0].ok, true);
    }
    assert.equal(await holder("venue-b"), TOKEN_B, "the refused calls changed nothing");
    const [{ rls, forced }] = await rows(
      `select relrowsecurity as rls, relforcerowsecurity as forced from pg_class where oid = 'public.pickem_prize_save_leases'::regclass`,
    );
    assert.equal(rls && forced, true);
    console.log("ok - anon/authenticated can't call either function or touch the table; service_role calls both; RLS forced");

    // ── A deleted venue takes its lease with it; re-running the migration is harmless ───────────
    await rows(`delete from venues where id = 'venue-b'`);
    assert.equal(await holder("venue-b"), null);
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));
    assert.equal(await holder("venue-a"), TOKEN_A);
    console.log("ok - a deleted venue's lease goes with it; the migration re-runs cleanly");
  } finally {
    await db.close();
  }
}

run().then(
  () => console.log("pickem prize save lease SQL: all checks passed"),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
