#!/usr/bin/env node
// Isolated PostgreSQL check for supabase/migrations/20261019045030_seasonal_points_credits.sql
// (docs/squares-and-brackets-plan.md Phase 1). No network, no application imports, never touches
// Supabase. Runs on PGlite (devDependency):
//   npm run test:seasonal-points-sql
// or point at another copy: SEASONAL_PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite node scripts/test-seasonal-points-sql.cjs
//
// The tables below are minimal stand-ins (only the columns the migration touches). PGlite is one
// connection, so concurrent batches can't be raced here; what is proven is the once-only ledger,
// the points bump, all-or-nothing validation, the cascade on account deletion and the grants.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require(process.env.SEASONAL_PGLITE_MODULE || "@electric-sql/pglite");

const MIGRATION = "supabase/migrations/20261019045030_seasonal_points_credits.sql";

const SCHEMA = `
  create role anon; create role authenticated; create role service_role;
  create table users(id uuid primary key, venue_id text, points integer not null default 0);
  create table game_sessions(session_id uuid primary key default gen_random_uuid(), game_type text not null,
    constraint game_sessions_type_valid check (game_type in ('trivia','bingo','pickem','fantasy','speed-trivia',
      'live-trivia','category-blitz','nfl-pickem')));
`;

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const A = id(1);
const B = id(2);
const GHOST = id(99);

async function run() {
  const db = new PGlite();
  const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
  const one = async (sql, params = []) => (await rows(sql, params))[0];
  const credit = (source, credits) =>
    rows(`select * from credit_seasonal_points($1, $2::jsonb)`, [source, JSON.stringify(credits)]);
  const points = async (userId) => (await one(`select points from users where id = $1`, [userId])).points;
  const ledgerCount = async () => Number((await one(`select count(*)::int as n from seasonal_points_credits`)).n);
  const rejects = async (label, fn) => {
    const before = { a: await points(A), b: await points(B), ledger: await ledgerCount() };
    await assert.rejects(fn, undefined, label);
    assert.deepEqual({ a: await points(A), b: await points(B), ledger: await ledgerCount() }, before, `${label}: nothing changed`);
  };

  try {
    await db.exec(SCHEMA);
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));
    await db.query(`insert into users(id, venue_id, points) values ($1, 'v1', 100), ($2, 'v1', 0)`, [A, B]);

    // ── Credit, then retry: pays once ──────────────────────────────────────────────────────
    let out = await credit("squares", [
      { user_id: A, source_key: "board-1:q1", points: 25 },
      { user_id: B, source_key: "board-2:q1", points: 25 },
    ]);
    assert.deepEqual(out.map((r) => r.outcome), ["credited", "credited"]);
    assert.equal(await points(A), 125);
    assert.equal(await points(B), 25);

    out = await credit("squares", [{ user_id: A, source_key: "board-1:q1", points: 25 }]);
    assert.equal(out[0].outcome, "already_credited");
    assert.equal(out[0].existing_user_id, A);
    assert.equal(out[0].existing_points, 25);
    assert.equal(await points(A), 125, "a retried settlement pays nothing");

    // Same key, a different player (a re-grade bug): refused, original holder reported.
    out = await credit("squares", [{ user_id: B, source_key: "board-1:q1", points: 50 }]);
    assert.equal(out[0].outcome, "already_credited");
    assert.equal(out[0].existing_user_id, A);
    assert.equal(await points(B), 25);

    // The same key under the OTHER source is a different credit.
    out = await credit("bracket", [{ user_id: A, source_key: "board-1:q1", points: 4 }]);
    assert.equal(out[0].outcome, "credited");
    assert.equal(await points(A), 129);

    // ── Mixed batch: order kept, several credits to one player summed ──────────────────────
    out = await credit("bracket", [
      { user_id: GHOST, source_key: "e1:r1", points: 1 },
      { user_id: B, source_key: "e2:r1", points: 1 },
      { user_id: A, source_key: "board-1:q1", points: 4 },
      { user_id: B, source_key: "e2:r2", points: 2 },
    ]);
    assert.deepEqual(
      out.map((r) => [r.credit_source_key, r.outcome]),
      [["e1:r1", "user_not_found"], ["e2:r1", "credited"], ["board-1:q1", "already_credited"], ["e2:r2", "credited"]],
    );
    assert.equal(await points(B), 28);
    assert.equal(Number((await one(`select count(*)::int as n from seasonal_points_credits where user_id = $1`, [GHOST])).n), 0);

    assert.deepEqual(await credit("squares", []), [], "an empty batch is a no-op");

    // ── All-or-nothing validation ──────────────────────────────────────────────────────────
    const good = { user_id: A, source_key: "fresh-key", points: 5 };
    await rejects("unknown source", () => credit("fantasy", [good]));
    await rejects("not an array", () => db.query(`select * from credit_seasonal_points('squares', '{}'::jsonb)`));
    await rejects("zero points", () => credit("squares", [good, { user_id: B, source_key: "k0", points: 0 }]));
    await rejects("too many points", () => credit("squares", [good, { user_id: B, source_key: "k1", points: 1001 }]));
    await rejects("fractional points", () => credit("squares", [good, { user_id: B, source_key: "k2", points: 1.5 }]));
    await rejects("points as a string", () => credit("squares", [good, { user_id: B, source_key: "k3", points: "5" }]));
    await rejects("missing key", () => credit("squares", [good, { user_id: B, points: 5 }]));
    await rejects("key too long", () => credit("squares", [good, { user_id: B, source_key: "x".repeat(201), points: 5 }]));
    await rejects("bad uuid", () => credit("squares", [good, { user_id: "nope", source_key: "k4", points: 5 }]));
    await rejects("duplicate key in a batch", () => credit("squares", [good, { ...good, user_id: B }]));
    const tooMany = Array.from({ length: 501 }, (_, i) => ({ user_id: A, source_key: `bulk-${i}`, points: 1 }));
    await rejects("more than 500", () => credit("squares", tooMany));
    const max = Array.from({ length: 500 }, (_, i) => ({ user_id: i % 2 ? A : B, source_key: `bulk-${i}`, points: 1 }));
    out = await credit("squares", max);
    assert.equal(out.filter((r) => r.outcome === "credited").length, 500, "500 in one call is allowed");
    assert.equal(await points(A), 379);
    assert.equal(await points(B), 278);

    // ── Account deletion: the ledger goes with the users row ───────────────────────────────
    await db.query(`delete from users where id = $1`, [B]);
    assert.equal(Number((await one(`select count(*)::int as n from seasonal_points_credits where user_id = $1`, [B])).n), 0);
    out = await credit("squares", [{ user_id: B, source_key: "board-2:q1", points: 25 }]);
    assert.equal(out[0].outcome, "user_not_found", "a freed key pays no one after the player is gone");

    // ── Grants, RLS ────────────────────────────────────────────────────────────────────────
    const fn = "public.credit_seasonal_points(text, jsonb)";
    for (const role of ["anon", "authenticated"]) {
      assert.equal((await one(`select has_function_privilege($1, $2, 'execute') as ok`, [role, fn])).ok, false, `${role} execute`);
      assert.equal((await one(`select has_table_privilege($1, 'public.seasonal_points_credits', 'select') as ok`, [role])).ok, false, `${role} select`);
    }
    assert.equal((await one(`select has_function_privilege('service_role', $1, 'execute') as ok`, [fn])).ok, true);
    assert.equal((await one(`select has_table_privilege('service_role', 'public.seasonal_points_credits', 'select') as ok`)).ok, true);
    const rls = await one(`select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.seasonal_points_credits'::regclass`);
    assert.deepEqual(rls, { relrowsecurity: true, relforcerowsecurity: true });

    // ── Analytics constraint ───────────────────────────────────────────────────────────────
    for (const gameType of ["squares", "bracket", "nfl-pickem", "category-blitz"]) {
      await db.query(`insert into game_sessions(game_type) values ($1)`, [gameType]);
    }
    await assert.rejects(() => db.query(`insert into game_sessions(game_type) values ('brackets')`));

    console.log("seasonal points SQL: all checks passed");
  } finally {
    await db.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
