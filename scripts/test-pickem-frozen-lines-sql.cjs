#!/usr/bin/env node
// Isolated PostgreSQL check for supabase/migrations/20261110014242_pickem_venue_frozen_lines.sql
// (docs/cancelled-prizes-pick-windows-away-mode-plan.md Phase B3). No network, no application imports,
// never touches Supabase. Runs on PGlite (devDependency):
//   npm run test:pickem-frozen-lines-sql
// or point at another copy: PICKEM_POINTS_PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite node scripts/test-pickem-frozen-lines-sql.cjs
//
// venues is a minimal stand-in; the roles get Supabase's default privileges. What is proven: a line is
// frozen only before kickoff, once per (bar, sport, game), and never changes (a second freeze returns the
// first number); bars are independent; a deleted venue takes its lines; only service_role can call the
// RPC, and nobody (service_role included) can write the table directly.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require(process.env.PICKEM_POINTS_PGLITE_MODULE || "@electric-sql/pglite");

const MIGRATION = "supabase/migrations/20261110014242_pickem_venue_frozen_lines.sql";

const SCHEMA = `
  create role anon; create role authenticated; create role service_role bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  create table public.venues(id text primary key);
  insert into public.venues(id) values ('bar-a'), ('bar-b');
`;

const KEY = "americanfootball_ncaaf";
const HOUR = 3600_000;
const isoIn = (ms) => new Date(Date.now() + ms).toISOString();
const DENIED = /permission denied/i;

async function run() {
  const db = new PGlite();
  const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
  const one = async (sql, params = []) => (await rows(sql, params))[0];
  const as = async (role, fn) => {
    await db.exec(`set role ${role}`);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role`);
    }
  };
  const line = (gameId, startsAt, homeSpread, extra = {}) => ({
    sport_key: KEY,
    game_id: gameId,
    starts_at: startsAt,
    home_spread: homeSpread,
    away_spread: -homeSpread,
    source_vendor: "fanduel",
    ...extra,
  });
  const freeze = (venue, lines) =>
    rows(`select * from freeze_pickem_venue_lines($1, $2::jsonb)`, [venue, JSON.stringify(lines)]);
  const stored = (venue, gameId) =>
    one(`select * from pickem_venue_frozen_lines where venue_id = $1 and sport_key = $2 and game_id = $3`, [venue, KEY, gameId]);

  try {
    await db.exec(SCHEMA);
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));

    // ── Freezing: before kickoff only ──────────────────────────────────────────────────────────
    const future = "1__future";
    const started = "2__started";
    const first = await as("service_role", () => freeze("bar-a", [line(future, isoIn(3 * HOUR), -5.5), line(started, isoIn(-10 * 60_000), -3)]));
    assert.deepEqual(first.map((row) => row.game_id), [future]);
    assert.equal(Number(first[0].home_spread), -5.5);
    assert.equal(first[0].source_vendor, "fanduel");
    assert.ok(first[0].frozen_at);
    assert.equal(await stored("bar-a", started), undefined);
    console.log("ok - a line freezes only for a game that has not started");

    // ── Once, never changed ────────────────────────────────────────────────────────────────────
    const again = await as("service_role", () => freeze("bar-a", [line(future, isoIn(3 * HOUR), -7, { source_vendor: "draftkings" })]));
    assert.equal(again.length, 1);
    assert.equal(Number(again[0].home_spread), -5.5, "a second freeze returns the first number");
    assert.equal((await stored("bar-a", future)).source_vendor, "fanduel");
    console.log("ok - a frozen line is kept: a later freeze returns the first number");

    // A frozen game that has since started is still returned (the pick check sees the line it had).
    await db.exec(`alter table pickem_venue_frozen_lines disable trigger pickem_venue_frozen_lines_no_update`);
    await db.query(`update pickem_venue_frozen_lines set starts_at = $1 where game_id = $2`, [isoIn(-HOUR), future]);
    await db.exec(`alter table pickem_venue_frozen_lines enable trigger pickem_venue_frozen_lines_no_update`);
    const afterKickoff = await as("service_role", () => freeze("bar-a", [line(future, isoIn(-HOUR), -9)]));
    assert.equal(Number(afterKickoff[0].home_spread), -5.5);
    console.log("ok - an earlier frozen line is returned after kickoff, unchanged");

    // Bars are independent: the same game freezes at its own number elsewhere.
    const barB = await as("service_role", () => freeze("bar-b", [line(future, isoIn(3 * HOUR), -6.5), line("3__other", isoIn(4 * HOUR), 2)]));
    assert.deepEqual(barB.map((row) => [row.venue_id, row.game_id, Number(row.home_spread)]).sort(), [
      ["bar-b", "1__future", -6.5],
      ["bar-b", "3__other", 2],
    ]);
    assert.equal(Number((await stored("bar-a", future)).home_spread), -5.5);
    console.log("ok - each bar freezes its own line; the RPC returns only that bar's rows");

    // Nothing to freeze: incomplete rows are skipped, a missing venue is refused.
    assert.equal((await as("service_role", () => freeze("bar-a", [{ sport_key: KEY, game_id: "4__x", starts_at: isoIn(HOUR) }]))).length, 0);
    await assert.rejects(as("service_role", () => freeze("", [line("5__y", isoIn(HOUR), 1)])), /venue is required/);
    await assert.rejects(as("service_role", () => freeze("no-such-bar", [line("6__z", isoIn(HOUR), 1)])), /foreign key/);
    console.log("ok - incomplete rows freeze nothing; a blank or unknown venue is refused");

    // ── Never updated ──────────────────────────────────────────────────────────────────────────
    await assert.rejects(db.query(`update pickem_venue_frozen_lines set home_spread = 0 where game_id = $1`, [future]), /never changes/);
    console.log("ok - an update is refused even for the table owner");

    // ── Grants ─────────────────────────────────────────────────────────────────────────────────
    for (const role of ["anon", "authenticated"]) {
      await assert.rejects(as(role, () => freeze("bar-a", [line("7__p", isoIn(HOUR), 1)])), DENIED);
      await assert.rejects(as(role, () => rows(`select * from pickem_venue_frozen_lines`)), DENIED);
    }
    assert.equal((await as("service_role", () => rows(`select * from pickem_venue_frozen_lines where venue_id = 'bar-a'`))).length, 1);
    await assert.rejects(
      as("service_role", () => rows(`insert into pickem_venue_frozen_lines(venue_id, sport_key, game_id, starts_at, home_spread, away_spread, source_vendor) values ('bar-a', $1, '8__q', $2, 1, -1, 'x')`, [KEY, isoIn(HOUR)])),
      DENIED
    );
    await assert.rejects(as("service_role", () => rows(`update pickem_venue_frozen_lines set home_spread = 1`)), DENIED);
    await assert.rejects(as("service_role", () => rows(`delete from pickem_venue_frozen_lines`)), DENIED);
    console.log("ok - only service_role calls the RPC or reads the table; nobody writes it directly");

    // ── Venue deletion cascades ────────────────────────────────────────────────────────────────
    await db.exec(`delete from venues where id = 'bar-b'`);
    assert.equal((await one(`select count(*)::int as n from pickem_venue_frozen_lines where venue_id = 'bar-b'`)).n, 0);
    console.log("ok - deleting a venue removes its frozen lines");

    console.log("\nAll Pick 'Em frozen-line SQL checks passed.");
  } finally {
    await db.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
