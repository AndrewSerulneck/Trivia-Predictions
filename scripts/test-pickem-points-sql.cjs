#!/usr/bin/env node
// Isolated PostgreSQL check for supabase/migrations/20261031182914_pickem_automatic_points.sql
// (docs/pickem-college-football-and-prize-plan.md Phase 1). No network, no application imports,
// never touches Supabase. Runs on PGlite (devDependency):
//   npm run test:pickem-points-sql
// or point at another copy: PICKEM_POINTS_PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite node scripts/test-pickem-points-sql.cjs
//
// The tables below are minimal stand-ins (only the columns the migration touches), plus the old
// claim_pickem_points signature so its grants can be changed. PGlite is one connection, so
// concurrent payers can't be raced here; what is proven is pay-once, the flat 10 (no bonus, NFL
// included), the old backlog cancelled at 0 points (a pick graded in the last 24 h still paid),
// the per-player scope, the batch limit and the grants.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require(process.env.PICKEM_POINTS_PGLITE_MODULE || "@electric-sql/pglite");

const MIGRATION = "supabase/migrations/20261031182914_pickem_automatic_points.sql";

const SCHEMA = `
  create role anon; create role authenticated; create role service_role;
  create table users(id uuid primary key, venue_id text, points integer);
  create table pickem_picks(
    id uuid primary key,
    user_id uuid not null references users(id) on delete cascade,
    venue_id text not null,
    sport_slug text not null,
    starts_at timestamptz not null,
    status text not null default 'pending',
    resolved_at timestamptz,
    reward_points integer not null default 50,
    reward_claimed_at timestamptz
  );
  create function public.claim_pickem_points(uuid, text, date, timestamptz, timestamptz)
    returns integer language sql as $$ select 0 $$;
  grant execute on function public.claim_pickem_points(uuid, text, date, timestamptz, timestamptz)
    to anon, authenticated, service_role;
`;

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const A = id(1);
const B = id(2);
const C = id(3);
const D = id(4);

async function run() {
  const db = new PGlite();
  const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
  const one = async (sql, params = []) => (await rows(sql, params))[0];
  const pay = (userId = null, limit = null) =>
    rows(`select * from pay_pickem_points($1::uuid, coalesce($2::int, 500))`, [userId, limit]);
  const points = async (userId) => (await one(`select points from users where id = $1`, [userId])).points;
  let pickSeq = 100;
  const pick = async (userId, status, extra = {}) => {
    pickSeq += 1;
    const pickId = id(pickSeq);
    await db.query(
      `insert into pickem_picks(id, user_id, venue_id, sport_slug, starts_at, status, resolved_at, reward_claimed_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        pickId,
        userId,
        extra.venueId ?? "v1",
        extra.sport ?? "nba",
        extra.startsAt ?? "2026-10-31T23:00:00Z",
        status,
        extra.resolvedAt ?? (status === "pending" ? null : "2026-11-01T02:00:00Z"),
        extra.claimedAt ?? null,
      ]
    );
    return pickId;
  };

  try {
    await db.exec(SCHEMA);
    await db.query(`insert into users(id, venue_id, points) values ($1, 'v1', 100), ($2, 'v1', 0), ($3, 'v2', null), ($4, 'v3', 5)`, [A, B, C, D]);

    // ── The backlog that exists when the migration runs: old wins are cancelled, not paid ──────
    const backlogOld = await pick(D, "won", { venueId: "v3", resolvedAt: "2026-08-01T00:00:00Z" });
    const backlogRecent = await pick(D, "won", { venueId: "v3", resolvedAt: new Date(Date.now() - 3600_000).toISOString() });
    const backlogLost = await pick(D, "lost", { venueId: "v3", resolvedAt: "2026-08-01T00:00:00Z" });
    const backlogCollected = await pick(D, "won", { venueId: "v3", resolvedAt: "2026-08-01T00:00:00Z", claimedAt: "2026-08-02T00:00:00Z" });
    await db.query(`update pickem_picks set reward_points = 20 where id = $1`, [backlogCollected]);
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));
    const old = await one(`select reward_points, reward_claimed_at from pickem_picks where id = $1`, [backlogOld]);
    assert.ok(old.reward_claimed_at, "an old uncollected win is marked handled");
    assert.equal(old.reward_points, 0, "with 0 points (it was never paid)");
    const lostRow = await one(`select reward_claimed_at from pickem_picks where id = $1`, [backlogLost]);
    assert.equal(lostRow.reward_claimed_at, null, "a loss is untouched");
    const collected = await one(`select reward_points, reward_claimed_at from pickem_picks where id = $1`, [backlogCollected]);
    assert.equal(collected.reward_points, 20, "an already-collected pick keeps its points");
    assert.equal(new Date(collected.reward_claimed_at).toISOString(), "2026-08-02T00:00:00.000Z");
    let backlogOut = await pay(D);
    assert.deepEqual(backlogOut.map((r) => r.pick_id), [backlogRecent], "only last night's win is paid");
    assert.equal(await points(D), 15, "5 + 10: the old win added nothing");
    backlogOut = await pay(D);
    assert.equal(backlogOut.length, 0);

    // ── Pays every won, unpaid pick a flat 10, NFL included; nothing else ────────────────────
    const won1 = await pick(A, "won");
    const won2 = await pick(A, "won", { sport: "nfl" });
    await pick(A, "lost");
    await pick(A, "push");
    await pick(A, "canceled");
    await pick(A, "pending");
    const alreadyPaid = await pick(A, "won", { claimedAt: "2026-10-01T00:00:00Z" });
    const wonB = await pick(B, "won");
    const wonC = await pick(C, "won", { venueId: "v2", resolvedAt: "2026-07-01T00:00:00Z" });

    let out = await pay();
    assert.deepEqual(out.map((r) => r.pick_id).sort(), [won1, won2, wonB, wonC].sort());
    assert.ok(out.every((r) => r.points_awarded === 10), "flat 10 per pick");
    assert.equal(out.find((r) => r.pick_id === won2).sport_slug, "nfl");
    assert.equal(await points(A), 120, "2 picks x 10, no 2x/3x bonus");
    assert.equal(await points(B), 10);
    assert.equal(await points(C), 10, "a null balance starts from 0");
    const stamped = await rows(`select id, reward_points, reward_claimed_at from pickem_picks where id = any($1::uuid[])`, [[won1, won2, wonB, wonC]]);
    assert.ok(stamped.every((r) => r.reward_claimed_at && r.reward_points === 10));
    const untouched = await one(`select reward_claimed_at from pickem_picks where id = $1`, [alreadyPaid]);
    assert.equal(new Date(untouched.reward_claimed_at).toISOString(), "2026-10-01T00:00:00.000Z", "a collected pick is never re-paid");

    // ── Run again: pays nothing ──────────────────────────────────────────────────────────────
    out = await pay();
    assert.equal(out.length, 0);
    assert.equal(await points(A), 120);

    // ── A pick that grades later is paid on the next run, once ───────────────────────────────
    const late = await pick(B, "pending");
    out = await pay();
    assert.equal(out.length, 0, "pending is never paid");
    await db.query(`update pickem_picks set status = 'won', resolved_at = now() where id = $1`, [late]);
    out = await pay();
    assert.deepEqual(out.map((r) => r.pick_id), [late]);
    assert.equal(await points(B), 20);
    assert.equal((await pay()).length, 0);

    // ── One player's scope touches only that player ──────────────────────────────────────────
    const aNew = await pick(A, "won");
    const bNew = await pick(B, "won");
    out = await pay(A);
    assert.deepEqual(out.map((r) => r.pick_id), [aNew]);
    assert.equal(await points(A), 130);
    assert.equal(await points(B), 20, "B untouched by A's scope");
    out = await pay();
    assert.deepEqual(out.map((r) => r.pick_id), [bNew]);
    assert.equal(await points(B), 30);

    // ── The batch limit is honoured; the rest wait for the next run ──────────────────────────
    for (let i = 0; i < 4; i += 1) await pick(C, "won", { venueId: "v2" });
    const oldest = await pick(C, "won", { venueId: "v2", resolvedAt: "2026-06-01T00:00:00Z" });
    out = await pay(null, 1);
    assert.deepEqual(out.map((r) => r.pick_id), [oldest], "oldest grade first (a backlog drains in order)");
    out = await pay(null, 1);
    assert.equal(out.length, 1);
    assert.equal(await points(C), 30);
    out = await pay(null, 0);
    assert.equal(out.length, 1, "a limit below 1 is raised to 1");
    out = await pay();
    assert.equal(out.length, 2);
    assert.equal(await points(C), 60);

    // ── Grants: service_role only; the old Collect RPC loses anon/authenticated ──────────────
    const can = async (role, signature) =>
      (await one(`select has_function_privilege($1, $2, 'execute') as ok`, [role, signature])).ok;
    const PAY = "public.pay_pickem_points(uuid, integer)";
    const CLAIM = "public.claim_pickem_points(uuid, text, date, timestamptz, timestamptz)";
    assert.equal(await can("service_role", PAY), true);
    assert.equal(await can("anon", PAY), false);
    assert.equal(await can("authenticated", PAY), false);
    assert.equal(await can("service_role", CLAIM), true);
    assert.equal(await can("anon", CLAIM), false);
    assert.equal(await can("authenticated", CLAIM), false);

    // ── Re-running the migration is harmless ─────────────────────────────────────────────────
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));
    assert.equal((await pay()).length, 0);

    console.log("pickem points SQL: all checks passed");
  } finally {
    await db.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
