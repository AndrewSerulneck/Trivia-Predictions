#!/usr/bin/env node
// Isolated PostgreSQL check for the challenge_campaigns.nfl_week_scope constraint:
// the original migration (20260727120000) then the widening (20261012200725).
// No network, never touches Supabase.
//   NFL_SCOPE_PGLITE_MODULE=tmp/bingo-phase4-pg/node_modules/@electric-sql/pglite \
//     node scripts/test-nfl-week-scope-sql.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require(
  path.resolve(process.env.NFL_SCOPE_PGLITE_MODULE || "tmp/bingo-phase4-pg/node_modules/@electric-sql/pglite"),
);

const run = async () => {
  const db = new PGlite();
  await db.exec("create table challenge_campaigns(id serial primary key);");
  await db.exec(fs.readFileSync("supabase/migrations/20260727120000_rewards_nfl_week_scope.sql", "utf8"));
  const accepts = async (value) => {
    await db.query("insert into challenge_campaigns(nfl_week_scope) values ($1::jsonb)", [
      value === null ? null : JSON.stringify(value),
    ]);
  };
  // Before the widening, single_week is refused.
  await assert.rejects(() => accepts({ kind: "single_week", season: 2026, week: 9 }));

  await db.exec(fs.readFileSync("supabase/migrations/20261012200725_nfl_week_scope_single_week.sql", "utf8"));
  for (const ok of [
    null,
    { kind: "weekly", season: 2026 },
    { kind: "season", season: 2026, fromWeek: 7 },
    { kind: "single_week", season: 2026, week: 9 },
  ]) await accepts(ok);
  for (const bad of [
    { kind: "single_week", season: 2026 },
    { kind: "single_week", season: 2026, week: "9" },
    { kind: "single_week", week: 9 },
    { kind: "season", season: 2026 },
    { kind: "range", season: 2026, week: 9 },
    [1],
  ]) await assert.rejects(() => accepts(bad), `should reject ${JSON.stringify(bad)}`);
  // Re-applying is safe (drop-if-exists + add).
  await db.exec(fs.readFileSync("supabase/migrations/20261012200725_nfl_week_scope_single_week.sql", "utf8"));
  console.log("nfl_week_scope constraint: all checks passed");
};
run().catch((e) => { console.error(e); process.exit(1); });
