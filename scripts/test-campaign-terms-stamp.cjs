#!/usr/bin/env node
// Isolated PostgreSQL check of challenge_campaigns.terms_updated_at's trigger
// (docs/reward-descriptions-review-fixes-plan.md F6). No network, no app imports.
// PGlite is not a project dependency; install it somewhere disposable and point at it:
//   (cd /tmp/pg && npm i @electric-sql/pglite)
//   CAMPAIGN_PGLITE_MODULE=/tmp/pg/node_modules/@electric-sql/pglite node scripts/test-campaign-terms-stamp.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require(process.env.CAMPAIGN_PGLITE_MODULE || "@electric-sql/pglite");

const MIGRATION = "supabase/migrations/20261004170244_challenge_campaigns_terms_updated_at.sql";

async function run() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table challenge_campaigns(id int primary key, name text, is_active boolean, winner_user_id uuid,
      display_order int, rules text, reward_definition_id text, win_condition text, recurring_type text,
      points_required_to_win int, nfl_week_scope jsonb, game_winner_slots jsonb);
    insert into challenge_campaigns values (1, 'A', true, null, 1, 'r', 'live_trivia_challenge', 'points_threshold',
      'weekly', 500, '{"kind":"weekly","season":2026}', '[]');`);
  const sql = fs.readFileSync(MIGRATION, "utf8");
  await db.exec(sql);
  await db.exec(sql); // re-applying must be harmless
  const stamp = async () =>
    (await db.query("select terms_updated_at from challenge_campaigns where id = 1")).rows[0].terms_updated_at;

  assert.equal(await stamp(), null, "new column starts null");

  // What the system writes when a reward is won / spent, plus admin cosmetics.
  await db.exec(`update challenge_campaigns set is_active = false,
    winner_user_id = '00000000-0000-0000-0000-000000000001', display_order = 3, name = 'B', rules = 'x',
    game_winner_slots = '[{"scheduleId":"s","weekday":"mon"}]' where id = 1`);
  assert.equal(await stamp(), null, "award/deactivate/cosmetic writes must not stamp");

  // The edit form re-sends unchanged terms (jsonb key order may differ).
  await db.exec(`update challenge_campaigns set points_required_to_win = 500, recurring_type = 'weekly',
    nfl_week_scope = '{"season":2026,"kind":"weekly"}' where id = 1`);
  assert.equal(await stamp(), null, "re-sending identical terms must not stamp");

  const changes = [
    ["points_required_to_win", "1000"],
    ["recurring_type", "'daily'"],
    ["nfl_week_scope", `'{"kind":"season","season":2026,"fromWeek":1}'`],
    ["win_condition", "'game_winner'"],
    ["reward_definition_id", "null"],
  ];
  for (const [column, value] of changes) {
    await db.exec("update challenge_campaigns set terms_updated_at = null where id = 1");
    assert.equal(await stamp(), null);
    await db.exec(`update challenge_campaigns set ${column} = ${value} where id = 1`);
    assert.ok(await stamp(), `${column} change must stamp`);
  }
  console.log("challenge_campaigns terms stamp: all assertions passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
