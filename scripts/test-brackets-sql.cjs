#!/usr/bin/env node
// Isolated PostgreSQL check for supabase/migrations/20261019203858_brackets_engine.sql
// (docs/squares-and-brackets-plan.md Phase 7), applied on top of Phase 1's seasonal points ledger
// and Phase 2's Squares migration (which added reverse_seasonal_points). No network, no
// application imports, never touches Supabase. Runs on PGlite (devDependency):
//   npm run test:brackets-sql
// or point at another copy: BRACKETS_PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite node scripts/test-brackets-sql.cjs
//
// What is proven: the save rules (open, lock by the database clock, the rehearsal clock offset,
// own venue, rehearsal = hidden venues only, pick consistency, second chance), set-based grading,
// an admin result change reversing the affected round's credits and bumping its grade_no, the
// consistency checks on results, cascades on player deletion, grants and RLS.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require(process.env.BRACKETS_PGLITE_MODULE || "@electric-sql/pglite");

const MIGRATIONS = [
  "supabase/migrations/20261019045030_seasonal_points_credits.sql",
  "supabase/migrations/20261019051458_squares_engine.sql",
  "supabase/migrations/20261019203858_brackets_engine.sql",
  "supabase/migrations/20261019213121_bracket_prizes.sql",
];

const SCHEMA = `
  create role anon; create role authenticated; create role service_role;
  create table venues(id text primary key, name text, hidden boolean not null default false);
  create table users(id uuid primary key, venue_id text not null references venues(id), username text not null,
    points integer not null default 0, constraint users_points_non_negative check (points >= 0));
  create table game_sessions(session_id uuid primary key default gen_random_uuid(), game_type text not null,
    constraint game_sessions_type_valid check (game_type in ('trivia')));
  -- Phase 9a: only the challenge_campaigns columns it touches, with the game-types check as
  -- 20261019131139 (Squares prizes) left it.
  create table challenge_campaigns(id uuid primary key default gen_random_uuid(), game_types text[] not null default '{}',
    constraint challenge_campaigns_game_types_valid check (array_length(game_types, 1) is null
      or game_types <@ array['pickem','fantasy','trivia','bingo','speed-trivia','live-trivia','nfl-pickem','squares']::text[]));
`;

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const A = id(1); // venue v1
const B = id(2); // venue v1
const C = id(3); // venue v2
const H = id(4); // hidden venue vh

// Slot / seat math, mirrored from lib/brackets/tree.ts.
const offset = (round) => 64 - 2 ** (7 - round);
const roundOf = (slot) => (slot >= 62 ? 6 : slot >= 60 ? 5 : slot >= 56 ? 4 : slot >= 48 ? 3 : slot >= 32 ? 2 : 1);
const children = (slot) => {
  const r = roundOf(slot);
  const loc = slot - offset(r) + 1;
  return [offset(r - 1) + 2 * loc - 2, offset(r - 1) + 2 * loc - 1];
};
/** A full bracket where `pickHome(slot)` decides each game. */
const bracket = (pickHome) => {
  const seats = [];
  for (let slot = 0; slot < 63; slot += 1) {
    if (slot < 32) seats.push(pickHome(slot) ? 2 * slot : 2 * slot + 1);
    else {
      const [h, a] = children(slot);
      seats.push(pickHome(slot) ? seats[h] : seats[a]);
    }
  }
  return seats;
};
const HOME = bracket(() => true);
const AWAY = bracket(() => false);
const upTo = (seats, lastRound) => seats.map((s, slot) => (roundOf(slot) <= lastRound ? s : null));
const pg = (list) => `{${list.map((v) => (v === null ? "NULL" : v)).join(",")}}`;

async function run() {
  const db = new PGlite();
  const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
  const one = async (sql, params = []) => (await rows(sql, params))[0];
  const points = async (userId) => (await one(`select points from users where id = $1`, [userId])).points;
  const save = (t, kind, user, venue, picks, tiebreaker = 140) =>
    one(`select * from bracket_save_entry($1, $2, $3, $4, $5::smallint[], $6)`, [t, kind, user, venue, pg(picks), tiebreaker]);
  const record = (t, seats, total = null, allow = false, reason = null) =>
    one(`select * from bracket_record_results($1, $2::smallint[], $3, $4, $5, 'tester')`, [t, pg(seats), total, allow, reason]);
  const addRound1 = async (t) => {
    for (let loc = 1; loc <= 32; loc += 1) {
      await db.query(`insert into bracket_games (tournament_id, round, location, slot) values ($1, 1, $2, $3)`, [t, loc, loc - 1]);
    }
  };

  try {
    await db.exec(SCHEMA);
    for (const file of MIGRATIONS) await db.exec(fs.readFileSync(file, "utf8"));
    await db.exec(`insert into venues(id, name, hidden) values ('v1', 'One', false), ('v2', 'Two', false), ('vh', 'Test', true)`);
    await db.query(
      `insert into users(id, venue_id, username, points) values ($1,'v1','ann',0), ($2,'v1','bob',0), ($3,'v2','cat',0), ($4,'vh','hal',0)`,
      [A, B, C, H],
    );

    // ── Tournament: no games yet ───────────────────────────────────────────────────────────
    const T = (await one(`insert into bracket_tournaments (gender, season, main_lock_at) values ('men', 2026, now() + interval '1 hour') returning id`)).id;
    assert.equal((await one(`select count(*)::int as n from bracket_rounds where tournament_id = $1`, [T])).n, 6, "six rounds created");
    assert.equal((await save(T, "main", A, "v1", HOME)).save_outcome, "not_open", "no Round of 64 yet");
    await addRound1(T);
    await assert.rejects(
      db.query(`insert into bracket_games (tournament_id, round, location, slot) values ($1, 2, 1, 5)`, [T]),
      /bracket_games_slot_matches/,
      "a slot must match its round and location",
    );

    // ── Saving ────────────────────────────────────────────────────────────────────────────
    const saved = await save(T, "main", A, "v1", HOME);
    assert.equal(saved.save_outcome, "saved");
    const entryA = saved.save_entry_id;
    assert.equal((await save(T, "main", A, "v1", HOME, 150)).save_entry_id, entryA, "a second save replaces the same entry");
    assert.equal((await one(`select tiebreaker, pick_count from bracket_entries where id = $1`, [entryA])).tiebreaker, 150);
    const entryB = (await save(T, "main", B, "v1", AWAY)).save_entry_id;
    const entryC = (await save(T, "main", C, "v2", HOME)).save_entry_id;
    assert.ok(entryB && entryC);
    assert.equal((await save(T, "main", A, "v2", HOME)).save_outcome, "wrong_venue");
    assert.equal((await save(T, "main", id(99), "v1", HOME)).save_outcome, "user_not_found");
    assert.equal((await save(T, "main", A, "v1", HOME, 401)).save_outcome, "invalid_tiebreaker");
    const impossible = [...HOME];
    impossible[32] = 3; // seat 3 lost its first game in this bracket (slot 1 picked seat 2)
    const bad = await save(T, "main", A, "v1", impossible);
    assert.equal(bad.save_outcome, "invalid_picks");
    assert.match(bad.save_problem, /doesn't follow/);
    assert.equal((await save(T, "main", A, "v1", HOME.slice(1))).save_outcome, "invalid_picks", "wrong length");
    const draft = upTo(HOME, 1);
    const entryDraft = (await save(T, "main", H, "vh", draft, null)).save_entry_id;
    assert.equal((await one(`select pick_count from bracket_entries where id = $1`, [entryDraft])).pick_count, 32, "drafts are fine");
    assert.equal((await save(T, "second", A, "v1", HOME.map((s, i) => (i >= 48 ? s : null)))).save_outcome, "not_open");
    await assert.rejects(save(T, "bogus", A, "v1", HOME), /kind/);

    // ── Grading: round 1, home teams win ──────────────────────────────────────────────────
    let r = await record(T, upTo(HOME, 1));
    assert.deepEqual([r.changed_slots, r.regraded_rounds, r.reversed_credits, r.graded_entries], [32, [], 0, 3]);
    const entry = (eid) => one(`select score, round_correct from bracket_entries where id = $1`, [eid]);
    assert.deepEqual(await entry(entryA), { score: 320, round_correct: [32, 0, 0, 0, 0, 0] });
    assert.deepEqual(await entry(entryB), { score: 0, round_correct: [0, 0, 0, 0, 0, 0] });
    assert.equal((await entry(entryDraft)).score, 320);
    r = await record(T, upTo(HOME, 1));
    assert.equal(r.changed_slots, 0, "the same results again change nothing");
    const inconsistent = upTo(HOME, 2);
    inconsistent[32] = 1; // seat 1 lost slot 0
    await assert.rejects(record(T, inconsistent), /did not win a game feeding it/);

    // ── Pay round 1 like the sync does, then an admin corrects slot 0 ──────────────────────
    const paid = await rows(`select * from credit_seasonal_points('bracket', $1::jsonb)`, [
      JSON.stringify([
        { user_id: A, source_key: `${entryA}:r1:1`, points: 32 },
        { user_id: C, source_key: `${entryC}:r1:1`, points: 32 },
      ]),
    ]);
    assert.deepEqual(paid.map((p) => p.outcome), ["credited", "credited"]);
    await db.query(`update bracket_rounds set paid_grade_no = 1, paid_at = now() where tournament_id = $1 and round = 1`, [T]);
    assert.equal(await points(A), 32);

    const corrected = upTo(HOME, 1);
    corrected[0] = 1;
    await assert.rejects(record(T, corrected), /needs an admin override/, "the sync can't change a decided result");
    await assert.rejects(record(T, corrected, null, true, null), /reason/);
    r = await record(T, corrected, null, true, "Feed had the wrong winner");
    // A and C were paid (reversed); B (0 correct) and the draft H (32 correct) were never paid (burned).
    assert.deepEqual([r.changed_slots, r.regraded_rounds, r.reversed_credits], [1, [1], 4]);
    const spent = await rows(`select source_key, reversal_kind from seasonal_points_credits where source = 'bracket' order by source_key`);
    assert.deepEqual(
      spent.map((row) => row.reversal_kind).sort(),
      ["burned", "burned", "reversed", "reversed"],
      "every scoring entry's old key is spent, so a payment racing the change can't pay it",
    );
    const raced = await one(`select * from credit_seasonal_points('bracket', $1::jsonb)`, [
      JSON.stringify([{ user_id: B, source_key: `${entryB}:r1:1`, points: 1 }]),
    ]);
    assert.equal(raced.outcome, "already_credited", "B had 0 correct before; its old key still can't pay now");
    assert.equal(await points(A), 0, "round 1 credit taken back");
    assert.deepEqual(await one(`select grade_no, paid_grade_no from bracket_rounds where tournament_id = $1 and round = 1`, [T]), {
      grade_no: 2,
      paid_grade_no: null,
    });
    assert.deepEqual(await entry(entryA), { score: 310, round_correct: [31, 0, 0, 0, 0, 0] });
    assert.deepEqual(await entry(entryB), { score: 10, round_correct: [1, 0, 0, 0, 0, 0] });
    const burned = await one(`select reversal_kind from seasonal_points_credits where source_key = $1`, [`${entryDraft}:r1:1`]);
    assert.equal(burned.reversal_kind, "burned", "an unpaid old key is spent so it can never pay");
    const late = await one(`select * from credit_seasonal_points('bracket', $1::jsonb)`, [
      JSON.stringify([{ user_id: H, source_key: `${entryDraft}:r1:1`, points: 32 }]),
    ]);
    assert.equal(late.outcome, "already_credited");
    assert.equal(await points(H), 0);
    assert.equal((await one(`select count(*)::int as n from bracket_admin_log where action = 'results_changed'`)).n, 1);

    // ── Second chance: opens when the Round of 32 is decided ───────────────────────────────
    const r2 = upTo(HOME, 2);
    r2[0] = 1;
    r2[32] = 1; // slot 32 = winners of slots 0 (seat 1) and 1 (seat 2)
    await record(T, r2);
    await db.query(`update bracket_tournaments set main_lock_at = now() - interval '1 minute', second_lock_at = now() + interval '1 hour' where id = $1`, [T]);
    assert.equal((await save(T, "main", A, "v1", HOME)).save_outcome, "locked", "main locks by the database clock");
    const second = r2.map((_, i) => null);
    second[48] = 1; // a Sweet 16 team (won slot 32)
    assert.equal((await save(T, "second", A, "v1", second)).save_outcome, "saved");
    second[48] = 0; // seat 0 lost in round 1
    assert.equal((await save(T, "second", A, "v1", second)).save_outcome, "invalid_picks");
    const withEarly = [...second];
    withEarly[48] = 1;
    withEarly[0] = 1;
    assert.match((await save(T, "second", A, "v1", withEarly)).save_problem, /not part/);
    const r3 = [...r2];
    for (let s = 48; s < 56; s += 1) r3[s] = r2[children(s)[0]];
    const entrySecond = (await one(`select id from bracket_entries where tournament_id = $1 and kind = 'second' and user_id = $2`, [T, A])).id;
    await record(T, r3);
    assert.deepEqual(await entry(entrySecond), { score: 40, round_correct: [0, 0, 1, 0, 0, 0] }, "second chance scores only its rounds");

    // ── Rehearsals: hidden venues only, on the tournament's own clock ─────────────────────
    const R = (
      await one(`insert into bracket_tournaments (gender, season, purpose, clock_offset_seconds, main_lock_at)
        values ('men', 2025, 'rehearsal', 172800, now() - interval '1 day') returning id`)
    ).id;
    await addRound1(R);
    assert.equal((await save(R, "main", A, "v1", HOME)).save_outcome, "rehearsal_only");
    assert.equal((await save(R, "main", H, "vh", HOME)).save_outcome, "saved", "open: the clock is two days back");
    await db.query(`update bracket_tournaments set clock_offset_seconds = 0 where id = $1`, [R]);
    assert.equal((await save(R, "main", H, "vh", HOME)).save_outcome, "locked");
    await assert.rejects(
      db.query(`insert into bracket_tournaments (gender, season, clock_offset_seconds) values ('women', 2026, 60)`),
      /clock_offset_valid/,
      "a live tournament has no clock offset",
    );
    await assert.rejects(
      db.query(`insert into bracket_tournaments (gender, season) values ('men', 2026)`),
      /one_current/,
      "one current tournament per gender/season/purpose",
    );
    await db.query(`update bracket_tournaments set region_names = array['East', null, 'South', 'Midwest'] where id = $1`, [T]);
    await assert.rejects(
      db.query(`update bracket_tournaments set region_names = array['East'] where id = $1`, [T]),
      /region_names_shape/,
    );

    // ── Archived ──────────────────────────────────────────────────────────────────────────
    await db.query(`update bracket_tournaments set archived_at = now() where id = $1`, [R]);
    assert.equal((await save(R, "main", H, "vh", HOME)).save_outcome, "no_tournament");

    // ── Account deletion cascades ─────────────────────────────────────────────────────────
    await db.query(`delete from users where id = $1`, [B]);
    assert.equal((await one(`select count(*)::int as n from bracket_entries where user_id = $1`, [B])).n, 0);

    // ── Mirrors of lib/brackets/scoring.ts ────────────────────────────────────────────────
    assert.equal((await one(`select bracket_score_of(array[32,16,8,4,2,1]::smallint[]) as s`)).s, 1920);
    assert.equal((await one(`select bracket_score_of(array[0,0,8,4,2,1]::smallint[]) as s`)).s, 1280);

    // ── Phase 9a: bracket prizes + the Results read (20261019213121) ──────────────────────
    await db.query(`insert into challenge_campaigns (game_types) values ('{squares}'), ('{bracket}')`);
    for (const [keys, ok] of [
      ["{men_main}", true],
      ["{men_main,women_second}", true],
      ["{men_main,women_main,men_second,women_second}", true],
      ["{}", false],
      ["{men_main,men_main}", false],
      ["{men_final}", false],
    ]) {
      const attempt = db.query(`insert into challenge_campaigns (game_types, bracket_keys) values ('{bracket}', $1::text[])`, [keys]);
      if (ok) await attempt;
      else await assert.rejects(attempt, /challenge_campaigns_bracket_keys_valid/, `bracket_keys ${keys} refused`);
    }
    await assert.rejects(
      db.query(`insert into challenge_campaigns (game_types) values ('{march}')`),
      /challenge_campaigns_game_types_valid/,
      "an unknown game type is still refused",
    );
    assert.equal(
      (await one(`select prizes_settled_at from bracket_tournaments where id = $1`, [T])).prizes_settled_at,
      null,
      "prizes_settled_at starts empty",
    );
    // bracket_venue_games = entries with at least one pick, per tournament and kind, at that venue only.
    const expected = await rows(
      `select tournament_id, kind, count(*)::int as entries from bracket_entries where venue_id = 'v1' and pick_count > 0
       group by tournament_id, kind order by tournament_id, kind`,
    );
    const venueGames = await rows(`select * from bracket_venue_games('v1') order by tournament_id, kind`);
    assert.ok(expected.length > 0, "v1 has entries to count");
    assert.deepEqual(venueGames, expected, "bracket_venue_games counts v1's entries");
    await db.query(`update bracket_entries set pick_count = 0 where venue_id = 'v2'`);
    assert.deepEqual(await rows(`select * from bracket_venue_games('v2')`), [], "an entry with no picks is not a game");
    assert.deepEqual(await rows(`select * from bracket_venue_games('nowhere')`), []);

    // ── Grants and RLS ────────────────────────────────────────────────────────────────────
    for (const table of ["bracket_tournaments", "bracket_games", "bracket_rounds", "bracket_entries", "bracket_admin_log"]) {
      const rls = await one(`select relrowsecurity, relforcerowsecurity from pg_class where relname = $1`, [table]);
      assert.deepEqual(rls, { relrowsecurity: true, relforcerowsecurity: true }, `${table} RLS`);
      for (const role of ["anon", "authenticated"]) {
        const can = await one(`select has_table_privilege($1, $2, 'select') as ok`, [role, `public.${table}`]);
        assert.equal(can.ok, false, `${role} cannot read ${table}`);
      }
      const sr = await one(`select has_table_privilege('service_role', $1, 'select, insert, update, delete') as ok`, [`public.${table}`]);
      assert.equal(sr.ok, true, `service_role on ${table}`);
    }
    for (const fn of [
      "bracket_save_entry(uuid, text, uuid, text, smallint[], integer)",
      "bracket_record_results(uuid, smallint[], integer, boolean, text, text)",
      "bracket_picks_problem(smallint[], text, smallint[])",
      "bracket_round_correct(smallint[], text, smallint[])",
      "bracket_venue_games(text)",
      "bracket_keys_valid(text[])",
    ]) {
      for (const role of ["anon", "authenticated"]) {
        const can = await one(`select has_function_privilege($1, $2, 'execute') as ok`, [role, `public.${fn}`]);
        assert.equal(can.ok, false, `${role} cannot run ${fn}`);
      }
      const sr = await one(`select has_function_privilege('service_role', $1, 'execute') as ok`, [`public.${fn}`]);
      assert.equal(sr.ok, true, `service_role runs ${fn}`);
    }

    console.log("brackets SQL: all checks passed");
  } finally {
    await db.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
