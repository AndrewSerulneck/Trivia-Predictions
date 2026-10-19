#!/usr/bin/env node
// Isolated PostgreSQL check for supabase/migrations/20261019051458_squares_engine.sql
// (docs/squares-and-brackets-plan.md Phase 2), applied on top of Phase 1's
// 20261019045030_seasonal_points_credits.sql, and Phase 4's 20261019131139_squares_prizes.sql. No network, no application imports, never touches
// Supabase. Runs on PGlite (devDependency):
//   npm run test:squares-sql
// or point at another copy: SQUARES_PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite node scripts/test-squares-sql.cjs
//
// PGlite is one connection, so true concurrency can't be raced here. What is proven: the claim
// rules (cap, uniqueness, lock, venue, release), the one-time draw, set-based grading on every
// board, the void (reverse paid / burn unpaid, re-grade under new keys), the ledger reversal
// function, cascades on player deletion, grants and RLS.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require(process.env.SQUARES_PGLITE_MODULE || "@electric-sql/pglite");

const MIGRATIONS = [
  "supabase/migrations/20261019045030_seasonal_points_credits.sql",
  "supabase/migrations/20261019051458_squares_engine.sql",
  "supabase/migrations/20261019131139_squares_prizes.sql",
];

const SCHEMA = `
  create role anon; create role authenticated; create role service_role;
  create table venues(id text primary key, name text);
  create table users(id uuid primary key, venue_id text not null references venues(id), username text not null,
    points integer not null default 0, constraint users_points_non_negative check (points >= 0));
  create table game_sessions(session_id uuid primary key default gen_random_uuid(), game_type text not null,
    constraint game_sessions_type_valid check (game_type in ('trivia')));
  -- Only the challenge_campaigns columns Phase 4 touches, with the game-types check as 20260715000200 left it.
  create table challenge_campaigns(id uuid primary key default gen_random_uuid(), game_types text[] not null default '{}',
    reward_definition_id text, venue_ids text[] not null default '{}',
    constraint challenge_campaigns_game_types_valid check (array_length(game_types, 1) is null
      or game_types <@ array['pickem','fantasy','trivia','bingo','speed-trivia','live-trivia','nfl-pickem']::text[]));
  create table challenge_cycle_winners(id uuid primary key default gen_random_uuid(), challenge_id uuid not null,
    cycle_start timestamptz not null, winner_user_id uuid, venue_id text not null,
    unique (challenge_id, cycle_start, winner_user_id));
  create table challenge_campaign_redemptions(id uuid primary key default gen_random_uuid(), challenge_id uuid,
    winner_user_id uuid not null, venue_id text not null, cycle_start timestamptz not null, prize_redeemed_at timestamptz);
`;

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const A = id(1); // venue v1
const B = id(2); // venue v1
const C = id(3); // venue v1
const D = id(4); // venue v2
const COL = [3, 1, 4, 0, 5, 9, 2, 6, 8, 7];
const ROW = [2, 7, 1, 8, 0, 9, 5, 3, 6, 4];

async function run() {
  const db = new PGlite();
  const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
  const one = async (sql, params = []) => (await rows(sql, params))[0];
  const points = async (userId) => (await one(`select points from users where id = $1`, [userId])).points;
  let eventId;
  const claim = (userId, venueId, cell, action = "claim") =>
    one(`select * from squares_claim($1, $2, $3, $4, $5)`, [eventId, userId, venueId, cell, action]);
  const grade = (moment, col, row, pts, gradeNo, source = "feed") =>
    one(`select * from squares_grade_moment($1, $2, $3, $4, $5, $6, $7)`, [eventId, moment, col, row, pts, source, gradeNo]);
  const credit = (credits) =>
    rows(`select * from credit_seasonal_points('squares', $1::jsonb)`, [JSON.stringify(credits)]);

  try {
    await db.exec(SCHEMA);
    for (const file of MIGRATIONS) await db.exec(fs.readFileSync(file, "utf8"));
    await db.exec(`insert into venues values ('v1', 'One'), ('v2', 'Two')`);
    await db.query(
      `insert into users(id, venue_id, username, points) values ($1,'v1','ann',10), ($2,'v1','bob',0), ($3,'v1','cat',0), ($4,'v2','dan',0)`,
      [A, B, C, D],
    );

    // ── Event: lock in the future ──────────────────────────────────────────────────────────
    eventId = (
      await one(`insert into squares_events (season, bdl_game_id, col_side, col_team, row_team, kickoff_at, lock_at)
        values (2026, 1, 'home', '{"id":1}', '{"id":2}', now() + interval '2 hours', now() + interval '90 minutes') returning id`)
    ).id;
    await db.query(
      `insert into squares_event_moments (event_id, moment) select $1, m from unnest(array['q1','half','q3','final']) m`,
      [eventId],
    );

    // A second current event is impossible.
    await assert.rejects(
      db.query(`insert into squares_events (season, bdl_game_id, col_side, col_team, row_team, kickoff_at, lock_at)
        values (2026, 2, 'home', '{}', '{}', now(), now())`),
      /squares_events_one_current/,
    );

    // ── Claims ─────────────────────────────────────────────────────────────────────────────
    let out = await claim(A, "v1", 5);
    assert.equal(out.claim_outcome, "claimed");
    assert.deepEqual(out.claim_cells, [5]);
    assert.equal((await claim(A, "v1", 5)).claim_outcome, "already_yours");
    assert.equal((await claim(B, "v1", 5)).claim_outcome, "taken");
    assert.equal((await claim(A, "v1", 6)).claim_outcome, "claimed");
    out = await claim(A, "v1", 7);
    assert.equal(out.claim_outcome, "cap_reached", "the cap is 2");
    assert.deepEqual(out.claim_cells, [5, 6]);
    assert.equal((await claim(B, "v1", 6, "release")).claim_outcome, "not_yours");
    assert.equal((await claim(A, "v1", 6, "release")).claim_outcome, "released");
    assert.equal((await claim(A, "v1", 7)).claim_outcome, "claimed", "released cap space is reusable");
    assert.equal((await claim(A, "v2", 50)).claim_outcome, "wrong_venue");
    assert.equal((await claim(id(99), "v1", 50)).claim_outcome, "user_not_found");
    assert.equal((await claim(D, "v2", 9, "release")).claim_outcome, "not_yours", "release before any board exists");
    assert.equal(Number((await one(`select count(*)::int n from squares_boards`)).n), 1, "a release never creates a board");
    await assert.rejects(claim(A, "v1", 100), /cell must be 0/);
    await assert.rejects(claim(A, "v1", 1, "steal"), /action must be/);

    // Same cell on another venue's board is independent.
    assert.equal((await claim(D, "v2", 5)).claim_outcome, "claimed");
    assert.equal(Number((await one(`select count(*)::int n from squares_boards`)).n), 2);

    // Winning-cell setup. ROW digit at index 4 is 0, COL index 3 is 0 → cell 43 wins 0–0.
    // B holds 43 at v1; nobody holds it at v2. Q1 7–3: col 7 → index 9, row 3 → index 7 → cell 79 (C at v1).
    assert.equal((await claim(B, "v1", 43)).claim_outcome, "claimed");
    assert.equal((await claim(C, "v1", 79)).claim_outcome, "claimed");

    // ── Draw: refused before lock, then once ──────────────────────────────────────────────
    out = await one(`select * from squares_draw($1, $2::smallint[], $3::smallint[])`, [eventId, COL, ROW]);
    assert.equal(out.draw_happened, false, "no draw before lock_at");
    assert.equal(out.draw_col_digits, null);
    await assert.rejects(
      one(`select * from squares_draw($1, $2::smallint[], $3::smallint[])`, [eventId, [1, 1, 2, 3, 4, 5, 6, 7, 8, 9], ROW]),
      /permutation/,
    );
    assert.equal((await grade("q1", 0, 0, 25, 1)).grade_outcome, "not_drawn");

    await db.query(`update squares_events set lock_at = now() - interval '1 minute' where id = $1`, [eventId]);
    assert.equal((await claim(C, "v1", 1)).claim_outcome, "locked", "the database clock closes claims at lock_at");
    assert.equal((await claim(A, "v1", 7, "release")).claim_outcome, "locked", "no release after lock");

    out = await one(`select * from squares_draw($1, $2::smallint[], $3::smallint[])`, [eventId, COL, ROW]);
    assert.equal(out.draw_happened, true);
    assert.deepEqual(out.draw_col_digits, COL);
    out = await one(`select * from squares_draw($1, $2::smallint[], $3::smallint[])`, [eventId, ROW, COL]);
    assert.equal(out.draw_happened, false, "never re-draws");
    assert.deepEqual(out.draw_col_digits, COL, "the first draw stands");
    await db.query(`update squares_events set lock_at = now() + interval '1 hour' where id = $1`, [eventId]);
    assert.equal((await claim(C, "v1", 1)).claim_outcome, "locked", "a drawn event is locked whatever lock_at says");
    await db.query(`update squares_events set lock_at = now() - interval '1 minute' where id = $1`, [eventId]);

    // ── Grade: every board in one statement ───────────────────────────────────────────────
    assert.equal((await grade("q1", 7, 3, 25, 2)).grade_outcome, "stale", "grade_no must match");
    out = await grade("q1", 7, 3, 25, 1);
    assert.equal(out.grade_outcome, "graded");
    assert.equal(out.grade_winning_cell, 79);
    assert.equal(out.grade_boards, 2);
    assert.equal(out.grade_winners, 1);
    assert.equal((await grade("q1", 0, 0, 25, 1)).grade_outcome, "already_graded");
    let results = await rows(`select r.*, b.venue_id from squares_results r join squares_boards b on b.id = r.board_id
      where r.moment = 'q1' order by b.venue_id`);
    assert.equal(results[0].user_id, C);
    assert.equal(results[0].points, 25);
    assert.equal(results[0].credit_key, `${results[0].board_id}:q1:1`);
    assert.equal(results[1].user_id, null, "empty winning square at v2: nobody wins");
    assert.equal(results[1].points, 0);
    assert.equal(results[1].credit_key, null);

    // Pay q1 (what creditSeasonalPoints does), then grade half 10–10 (cell 43 → B at v1).
    await credit([{ user_id: C, source_key: results[0].credit_key, points: 25 }]);
    assert.equal(await points(C), 25);
    out = await grade("half", 10, 10, 25, 1);
    assert.equal(out.grade_winning_cell, 43);
    const halfKey = (await one(`select credit_key from squares_results where moment = 'half' and user_id = $1`, [B])).credit_key;

    // ── Void q1 with an admin re-grade: paid credit reversed; new grade under a new key ────
    await assert.rejects(
      one(`select * from squares_void_moment($1, 'q1', '', 'admin')`, [eventId]),
      /reason/,
    );
    out = await one(`select * from squares_void_moment($1, 'q1', 'feed corrected', 'andrew', 10, 10, 25)`, [eventId]);
    assert.equal(out.void_outcome, "voided_and_regraded");
    assert.equal(out.void_reversed, 1);
    assert.equal(out.void_burned, 0);
    assert.equal(out.void_grade_no, 2);
    assert.equal(out.void_winning_cell, 43);
    assert.equal(await points(C), 0, "C's q1 points were taken back");
    const reversedRow = await one(`select * from seasonal_points_credits where source_key = $1`, [results[0].credit_key]);
    assert.equal(reversedRow.reversal_kind, "reversed");
    assert.match(reversedRow.reversal_reason, /feed corrected/);
    assert.equal((await credit([{ user_id: C, source_key: results[0].credit_key, points: 25 }]))[0].outcome, "already_credited");
    assert.equal(await points(C), 0, "a reversed key can never pay again");
    const q1 = await rows(`select * from squares_results where moment = 'q1' order by grade_no, board_id`);
    assert.equal(q1.filter((r) => r.grade_no === 1).every((r) => r.voided_at !== null), true);
    const regraded = q1.find((r) => r.grade_no === 2 && r.user_id === B);
    assert.equal(regraded.credit_key.endsWith(":q1:2"), true);
    const moment = await one(`select * from squares_event_moments where event_id = $1 and moment = 'q1'`, [eventId]);
    assert.equal(moment.grade_no, 2);
    assert.equal(moment.score_source, "admin");
    const log = await one(`select * from squares_admin_log where action = 'void_moment'`);
    assert.equal(log.actor, "andrew");
    assert.equal(log.detail.voidedWinningCell, 79);
    assert.equal(log.detail.regrade.winningCell, 43);

    // ── Void half while UNPAID: the key is burned, so a late credit pays nothing ──────────
    out = await one(`select * from squares_void_moment($1, 'half', 'wrong digits', 'andrew')`, [eventId]);
    assert.equal(out.void_outcome, "voided");
    assert.equal(out.void_burned, 1);
    assert.equal((await credit([{ user_id: B, source_key: halfKey, points: 25 }]))[0].outcome, "already_credited");
    assert.equal(await points(B), 0, "the late credit was blocked by the burn");
    const halfMoment = await one(`select * from squares_event_moments where event_id = $1 and moment = 'half'`, [eventId]);
    assert.equal(halfMoment.graded_at, null, "back to pending for the feed");
    assert.equal(halfMoment.grade_no, 2);
    assert.equal((await one(`select * from squares_void_moment($1, 'half', 'again', 'andrew')`, [eventId])).void_outcome, "not_graded");

    // ── reverse_seasonal_points directly ──────────────────────────────────────────────────
    await credit([{ user_id: A, source_key: "x:1", points: 30 }]);
    assert.equal(await points(A), 40);
    out = await rows(`select * from reverse_seasonal_points('squares', $1::jsonb, 'test')`, [
      JSON.stringify([
        { user_id: A, source_key: "x:1", points: 30 },
        { user_id: A, source_key: "x:2", points: 5 },
        { user_id: id(98), source_key: "x:3", points: 5 },
      ]),
    ]);
    assert.deepEqual(out.map((r) => r.outcome), ["reversed", "burned", "user_not_found"]);
    assert.equal(await points(A), 10);
    out = await rows(`select * from reverse_seasonal_points('squares', $1::jsonb, 'test')`, [
      JSON.stringify([{ user_id: A, source_key: "x:1", points: 30 }]),
    ]);
    assert.equal(out[0].outcome, "already_reversed");
    assert.equal(await points(A), 10, "reversing twice takes nothing more");
    // Never below zero.
    await credit([{ user_id: D, source_key: "y:1", points: 20 }]);
    await db.query(`update users set points = 5 where id = $1`, [D]);
    await rows(`select * from reverse_seasonal_points('squares', $1::jsonb, 'test')`, [
      JSON.stringify([{ user_id: D, source_key: "y:1", points: 20 }]),
    ]);
    assert.equal(await points(D), 0);
    await assert.rejects(rows(`select * from reverse_seasonal_points('squares', '[]'::jsonb, '')`), /reason/);
    await assert.rejects(rows(`select * from reverse_seasonal_points('nope', '[]'::jsonb, 'r')`), /unknown source/);

    // ── Player deletion cascades their claims and results ─────────────────────────────────
    await db.query(`delete from users where id = $1`, [B]);
    assert.equal(Number((await one(`select count(*)::int n from squares_claims where user_id = $1`, [B])).n), 0);
    assert.equal(Number((await one(`select count(*)::int n from squares_results where user_id = $1`, [B])).n), 0);

    // ── Phase 4: Squares prizes ───────────────────────────────────────────────────────────
    await db.query(`insert into challenge_campaigns (game_types) values ('{live-trivia}'), ('{nfl-pickem}')`);
    const prize = (gameTypes, moments) =>
      db.query(`insert into challenge_campaigns (game_types, squares_moments) values ($1::text[], $2::text[])`, [gameTypes, moments]);
    await prize(["squares"], ["q1", "final"]);
    await prize(["squares"], ["q1", "half", "q3", "final"]);
    await prize(["live-trivia"], null);
    await assert.rejects(prize(["bracket"], null), /game_types_valid/, "only squares is new");
    await assert.rejects(prize(["squares"], []), /squares_moments_valid/, "at least one moment");
    await assert.rejects(prize(["squares"], ["q1", "q1"]), /squares_moments_valid/, "no moment twice");
    await assert.rejects(prize(["squares"], ["q5"]), /squares_moments_valid/, "known moments only");
    await assert.rejects(prize(["squares"], ["q1", "half", "q3", "final", "q1"]), /squares_moments_valid/);
    const checked = await one(`select count(*)::int total, count(prize_checked_at)::int checked from squares_results`);
    assert.ok(Number(checked.total) > 0);
    assert.equal(Number(checked.checked), 0, "every existing result starts unchecked for prizes");
    assert.ok(await one(`select 1 as ok from pg_indexes where indexname = 'squares_results_prize_unchecked_idx'`));
    const fnGrant = await one(`select has_function_privilege('service_role', 'public.squares_moments_valid(text[])', 'execute') as ok`);
    assert.equal(fnGrant.ok, true);

    // A voided grade's coupons: unused ones are withdrawn (coupon + ledger row), redeemed ones kept.
    const sqPrize = (await one(
      `insert into challenge_campaigns (game_types, reward_definition_id, venue_ids, squares_moments)
       values ('{squares}', 'squares_challenge', '{v1}', '{q1,final}') returning id`,
    )).id;
    const otherPrize = (await one(
      `insert into challenge_campaigns (game_types, reward_definition_id, venue_ids) values ('{live-trivia}', 'live_trivia_challenge', '{v1}') returning id`,
    )).id;
    const KEY = "2027-02-14T23:30:01.001Z";
    const coupon = async (challengeId, userId, venueId, redeemed) => {
      await db.query(`insert into challenge_cycle_winners (challenge_id, cycle_start, winner_user_id, venue_id) values ($1, $2, $3, $4)`, [challengeId, KEY, userId, venueId]);
      await db.query(
        `insert into challenge_campaign_redemptions (challenge_id, winner_user_id, venue_id, cycle_start, prize_redeemed_at) values ($1, $2, $3, $4, $5)`,
        [challengeId, userId, venueId, KEY, redeemed ? "2027-02-14T23:55:00Z" : null],
      );
    };
    await coupon(sqPrize, A, "v1", false);
    await coupon(sqPrize, C, "v1", true);
    await coupon(otherPrize, A, "v1", false); // same key, not a Squares prize: never touched
    const withdraw = (venueId, userId) =>
      one(`select * from squares_withdraw_prize_coupons($1, $2, $3)`, [venueId, KEY, userId]);
    assert.deepEqual(await withdraw("v1", A), { withdrawn_count: 1, kept_count: 0 });
    assert.deepEqual(await withdraw("v1", A), { withdrawn_count: 0, kept_count: 0 }, "safe to repeat");
    assert.deepEqual(await withdraw("v1", C), { withdrawn_count: 0, kept_count: 1 }, "a redeemed coupon is spent and kept");
    assert.deepEqual(await withdraw("v2", C), { withdrawn_count: 0, kept_count: 0 }, "another venue's key matches nothing");
    const left = await rows(`select challenge_id, winner_user_id from challenge_campaign_redemptions order by winner_user_id`);
    assert.deepEqual(left.map((r) => [r.challenge_id === sqPrize ? "squares" : "other", r.winner_user_id]), [["other", A], ["squares", C]]);
    const ledgerLeft = await rows(`select challenge_id, winner_user_id from challenge_cycle_winners order by winner_user_id`);
    assert.deepEqual(ledgerLeft.map((r) => [r.challenge_id === sqPrize ? "squares" : "other", r.winner_user_id]), [["other", A], ["squares", C]]);
    await assert.rejects(withdraw("v1", null), /required/);
    for (const role of ["anon", "authenticated"]) {
      const can = await one(`select has_function_privilege($1, 'public.squares_withdraw_prize_coupons(text, timestamptz, uuid)', 'execute') as ok`, [role]);
      assert.equal(can.ok, false, `${role} cannot withdraw coupons`);
    }
    assert.equal((await one(`select has_function_privilege('service_role', 'public.squares_withdraw_prize_coupons(text, timestamptz, uuid)', 'execute') as ok`)).ok, true);
    assert.ok(await one(`select 1 as ok from pg_indexes where indexname = 'squares_results_prize_withdraw_idx'`));

    // ── Grants and RLS ────────────────────────────────────────────────────────────────────
    for (const table of ["squares_events", "squares_event_moments", "squares_boards", "squares_claims", "squares_results", "squares_admin_log"]) {
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
      "squares_claim(uuid, uuid, text, integer, text)",
      "squares_draw(uuid, smallint[], smallint[])",
      "squares_grade_moment(uuid, text, integer, integer, integer, text, integer)",
      "squares_void_moment(uuid, text, text, text, integer, integer, integer)",
      "reverse_seasonal_points(text, jsonb, text)",
    ]) {
      for (const role of ["anon", "authenticated"]) {
        const can = await one(`select has_function_privilege($1, $2, 'execute') as ok`, [role, `public.${fn}`]);
        assert.equal(can.ok, false, `${role} cannot run ${fn}`);
      }
      const sr = await one(`select has_function_privilege('service_role', $1, 'execute') as ok`, [`public.${fn}`]);
      assert.equal(sr.ok, true, `service_role runs ${fn}`);
    }

    console.log("squares SQL: all checks passed");
  } finally {
    await db.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
