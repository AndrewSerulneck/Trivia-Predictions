#!/usr/bin/env node
// Isolated PostgreSQL check for supabase/migrations/20261031200417_pickem_prizes.sql
// (docs/pickem-college-football-and-prize-plan.md Phase 4a). No network, no application imports,
// never touches Supabase. Runs on PGlite (devDependency):
//   npm run test:pickem-prizes-sql
// or point at another copy: PICKEM_POINTS_PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite node scripts/test-pickem-prizes-sql.cjs
//
// challenge_campaigns and pickem_picks are minimal stand-ins (only the columns the migration's check
// and indexes name). What is proven: existing rows are untouched; a Pick 'Em Prize always has a scope
// and a window and nothing else has either; the shapes the database can see are enforced (no check
// clause can pass by evaluating to NULL); "X out of N" has a limit exactly when it has 1–3 tiers; the
// minimum picks only on "most right"; both indexes exist.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require(process.env.PICKEM_POINTS_PGLITE_MODULE || "@electric-sql/pglite");

const MIGRATION = "supabase/migrations/20261031200417_pickem_prizes.sql";

const SCHEMA = `
  create role anon; create role authenticated; create role service_role;
  create table public.challenge_campaigns(
    id serial primary key,
    reward_definition_id text,
    win_condition text not null default 'points_threshold',
    is_active boolean not null default true,
    venue_ids text[] not null default '{}'
  );
  create table public.pickem_picks(id serial primary key, venue_id text not null, starts_at timestamptz not null);
`;

const SCOPE = JSON.stringify({ sports: ["ncaaf"], leagues: [] });
const DAY = JSON.stringify({ kind: "day", date: "2026-11-07" });
const TIERS = (n) =>
  JSON.stringify(Array.from({ length: n }, (_, i) => ({ place: i + 1, correct: 10 + i, quantity: 1, prize_kind: "gift_card" })));

async function run() {
  const db = new PGlite();
  const insert = (columns) => {
    const names = Object.keys(columns);
    const values = names.map((_, i) => `$${i + 1}`);
    return db.query(`insert into challenge_campaigns(${names.join(", ")}) values (${values.join(", ")})`, Object.values(columns));
  };
  const accepts = async (label, columns) => {
    await insert(columns);
    console.log(`ok - accepts ${label}`);
  };
  const refuses = async (label, columns) => {
    await assert.rejects(insert(columns), /challenge_campaigns_pickem_prize_check/, label);
    console.log(`ok - refuses ${label}`);
  };
  const prize = (extra = {}) => ({ reward_definition_id: "pickem_challenge", pickem_scope: SCOPE, pickem_window: DAY, ...extra });

  try {
    await db.exec(SCHEMA);
    await db.exec(`
      insert into challenge_campaigns(reward_definition_id, win_condition) values
        ('live_trivia_challenge', 'game_winner'), (null, 'points_threshold'), ('nfl_pickem_challenge', 'points_threshold');
    `);
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));
    console.log("ok - applies over existing prizes (every new column NULL)");

    // ── Which rows may carry Pick 'Em terms ────────────────────────────────────────────────────
    await accepts("a plain prize with no Pick 'Em terms", { reward_definition_id: "live_trivia_challenge" });
    await accepts("a legacy campaign (no definition) with no Pick 'Em terms", { reward_definition_id: null });
    await accepts("a get-N-right Pick 'Em Prize", prize());
    await refuses("a Pick 'Em Prize without a window", prize({ pickem_window: null }));
    await refuses("a Pick 'Em Prize without a scope", prize({ pickem_scope: null }));
    await refuses("Pick 'Em terms on another prize", { reward_definition_id: "nfl_pickem_challenge", pickem_scope: SCOPE, pickem_window: DAY });
    await refuses("Pick 'Em terms on a legacy campaign", { reward_definition_id: null, pickem_scope: SCOPE, pickem_window: DAY });

    // ── Shapes ─────────────────────────────────────────────────────────────────────────────────
    await refuses("an empty scope", prize({ pickem_scope: JSON.stringify({ sports: [], leagues: [] }) }));
    await refuses("a scope that isn't an object", prize({ pickem_scope: JSON.stringify(["ncaaf"]) }));
    await refuses("a scope whose sports aren't a list", prize({ pickem_scope: JSON.stringify({ sports: "ncaaf" }) }));
    await accepts("a scope with leagues only", prize({ pickem_scope: JSON.stringify({ leagues: ["soccer_epl"] }) }));
    await refuses("an unknown window kind", prize({ pickem_window: JSON.stringify({ kind: "month" }) }));
    await refuses("a window with no kind (NULL must not pass)", prize({ pickem_window: JSON.stringify({ date: "2026-11-07" }) }));
    for (const kind of ["weekday", "week", "range"]) {
      await accepts(`a ${kind} window`, prize({ pickem_window: JSON.stringify({ kind }) }));
    }

    // ── How it's won ───────────────────────────────────────────────────────────────────────────
    await accepts("most right with a minimum of picks", prize({ win_condition: "game_winner", pickem_min_picks: 10 }));
    await refuses("a minimum of picks on a points prize", prize({ pickem_min_picks: 10 }));
    await refuses("a minimum of 0 picks", prize({ win_condition: "game_winner", pickem_min_picks: 0 }));
    await accepts("X out of N with three tiers", prize({ pickem_pick_limit: 20, pickem_tiers: TIERS(3) }));
    await refuses("a limit without tiers", prize({ pickem_pick_limit: 20 }));
    await refuses("tiers without a limit", prize({ pickem_tiers: TIERS(1) }));
    await refuses("four tiers", prize({ pickem_pick_limit: 20, pickem_tiers: TIERS(4) }));
    await refuses("no tiers (an empty list)", prize({ pickem_pick_limit: 20, pickem_tiers: "[]" }));
    await refuses("tiers on a most-right prize", prize({ win_condition: "game_winner", pickem_pick_limit: 20, pickem_tiers: TIERS(1) }));
    await refuses("a limit over 100", prize({ pickem_pick_limit: 101, pickem_tiers: TIERS(1) }));

    // ── Indexes ────────────────────────────────────────────────────────────────────────────────
    const indexes = (await db.query(`select indexname from pg_indexes where schemaname = 'public'`)).rows.map((row) => row.indexname);
    assert.ok(indexes.includes("idx_challenge_campaigns_pickem_prizes"));
    assert.ok(indexes.includes("idx_pickem_picks_venue_starts_at"));
    console.log("ok - both indexes exist");

    // Re-applying is harmless (the deploy may run it twice).
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));
    console.log("ok - re-applies cleanly");
  } finally {
    await db.close();
  }
}

run().then(
  () => console.log("pickem prizes SQL: all checks passed"),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
