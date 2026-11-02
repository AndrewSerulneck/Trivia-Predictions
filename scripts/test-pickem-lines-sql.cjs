#!/usr/bin/env node
// Isolated PostgreSQL check for supabase/migrations/20261031191250_pickem_college_football_spreads.sql
// (docs/pickem-college-football-and-prize-plan.md Phase 3). No network, no application imports,
// never touches Supabase. Runs on PGlite (devDependency):
//   npm run test:pickem-lines-sql
// or point at another copy: PICKEM_POINTS_PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite node scripts/test-pickem-lines-sql.cjs
//
// venue_game_settings is a minimal stand-in (only what the migration alters). What is proven: the
// college rule defaults to 'spread' and accepts only standard/spread; a line is written only before
// kickoff and never changed once locked or started; settlement's lock never creates a row and keeps
// the spread; grants (service_role only).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require(process.env.PICKEM_POINTS_PGLITE_MODULE || "@electric-sql/pglite");

const MIGRATION = "supabase/migrations/20261031191250_pickem_college_football_spreads.sql";

const SCHEMA = `
  create role anon; create role authenticated; create role service_role;
  create table public.venue_game_settings(
    venue_id text primary key,
    nfl_pickem_scoring_mode text not null default 'standard'
  );
`;

const KEY = "americanfootball_ncaaf";
const isoIn = (ms) => new Date(Date.now() + ms).toISOString();
const HOUR = 3600_000;

async function run() {
  const db = new PGlite();
  const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
  const one = async (sql, params = []) => (await rows(sql, params))[0];
  const line = (gameId, startsAt, homeSpread, extra = {}) => ({
    sport_key: KEY,
    game_id: gameId,
    provider_game_id: gameId.split("__")[0],
    starts_at: startsAt,
    home_team: "Home U",
    away_team: "Away State",
    home_spread: homeSpread,
    away_spread: -homeSpread,
    source_vendor: "fanduel",
    fetched_at: "2026-10-31T12:00:00Z",
    ...extra,
  });
  const upsert = (lines) => rows(`select * from upsert_pickem_game_lines($1::jsonb)`, [JSON.stringify(lines)]);
  const lock = (ids) => rows(`select * from lock_pickem_game_lines($1, $2::text[])`, [KEY, ids]);
  const stored = (gameId) => one(`select * from pickem_game_lines where sport_key = $1 and game_id = $2`, [KEY, gameId]);

  try {
    await db.exec(SCHEMA);
    await db.exec(`insert into venue_game_settings(venue_id) values ('old-venue')`);
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));

    // ── The venue setting ──────────────────────────────────────────────────────────────────────
    assert.equal((await one(`select cfb_pickem_scoring_mode from venue_game_settings where venue_id = 'old-venue'`)).cfb_pickem_scoring_mode, "spread");
    await db.exec(`insert into venue_game_settings(venue_id, cfb_pickem_scoring_mode) values ('winner-venue', 'standard')`);
    await assert.rejects(db.exec(`insert into venue_game_settings(venue_id, cfb_pickem_scoring_mode) values ('bad', 'moneyline')`));
    console.log("ok - college rule defaults to spread (existing rows too), accepts only standard/spread");

    // ── Writing lines: only before kickoff ─────────────────────────────────────────────────────
    const future = "1__future";
    const started = "2__started";
    const written = await upsert([line(future, isoIn(3 * HOUR), -5.5), line(started, isoIn(-10 * 60_000), -3)]);
    assert.deepEqual(written.map((row) => row.game_id), [future]);
    assert.equal(await stored(started), undefined);
    assert.equal(Number((await stored(future)).home_spread), -5.5);
    assert.equal((await stored(future)).locked_at, null);
    console.log("ok - a line is created only for a game that has not started");

    // A later refresh moves an unlocked line before kickoff.
    await upsert([line(future, isoIn(3 * HOUR), -6.5, { source_vendor: "draftkings" })]);
    assert.equal(Number((await stored(future)).home_spread), -6.5);
    assert.equal((await stored(future)).source_vendor, "draftkings");
    console.log("ok - an unlocked line before kickoff is refreshed");

    // A row whose game has started (unlocked, nobody settled yet) is never changed, even if the
    // request carries a future kickoff.
    const kicked = "3__kicked";
    await db.query(
      `insert into pickem_game_lines(sport_key, game_id, provider_game_id, starts_at, home_team, away_team, home_spread, away_spread, source_vendor)
       values ($1, $2, '3', $3, 'H', 'A', -7, 7, 'fanduel')`,
      [KEY, kicked, isoIn(-HOUR)]
    );
    const none = await upsert([line(kicked, isoIn(2 * HOUR), -1)]);
    assert.equal(none.length, 0);
    assert.equal(Number((await stored(kicked)).home_spread), -7);
    console.log("ok - a line whose game has started is never changed");

    // ── Settlement's lock ──────────────────────────────────────────────────────────────────────
    const locked = await lock([future, kicked, "9__never_saved"]);
    assert.deepEqual(locked.map((row) => row.game_id).sort(), [future, kicked].sort());
    const kickedRow = await stored(kicked);
    assert.ok(kickedRow.locked_at, "a started game is locked");
    assert.equal(new Date(kickedRow.locked_at).toISOString(), new Date(kickedRow.starts_at).toISOString());
    assert.equal(Number(kickedRow.home_spread), -7);
    assert.equal((await stored(future)).locked_at, null, "a game not started stays unlocked");
    assert.equal(await stored("9__never_saved"), undefined, "the lock never creates a row");
    console.log("ok - the lock marks only started games, keeps the spread, never creates a row");

    // A locked line is never changed, whatever the request says.
    await db.query(`update pickem_game_lines set locked_at = now(), starts_at = $2 where game_id = $1`, [future, isoIn(3 * HOUR)]);
    assert.equal((await upsert([line(future, isoIn(3 * HOUR), -20)])).length, 0);
    assert.equal(Number((await stored(future)).home_spread), -6.5);
    console.log("ok - a locked line is never changed");

    // ── Grants ─────────────────────────────────────────────────────────────────────────────────
    for (const role of ["anon", "authenticated"]) {
      assert.equal((await one(`select has_table_privilege($1, 'public.pickem_game_lines', 'select') as ok`, [role])).ok, false);
      assert.equal((await one(`select has_function_privilege($1, 'public.upsert_pickem_game_lines(jsonb)', 'execute') as ok`, [role])).ok, false);
      assert.equal((await one(`select has_function_privilege($1, 'public.lock_pickem_game_lines(text, text[])', 'execute') as ok`, [role])).ok, false);
    }
    for (const verb of ["select", "insert", "update", "delete"]) {
      assert.equal((await one(`select has_table_privilege('service_role', 'public.pickem_game_lines', $1) as ok`, [verb])).ok, true);
    }
    assert.equal((await one(`select has_function_privilege('service_role', 'public.upsert_pickem_game_lines(jsonb)', 'execute') as ok`)).ok, true);
    assert.equal((await one(`select has_function_privilege('service_role', 'public.lock_pickem_game_lines(text, text[])', 'execute') as ok`)).ok, true);
    console.log("ok - only service_role can read/write the lines or call the two functions");

    console.log("\nAll Pick 'Em line SQL checks passed.");
  } finally {
    await db.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
