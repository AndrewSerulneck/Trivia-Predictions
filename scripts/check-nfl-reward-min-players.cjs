#!/usr/bin/env node
/**
 * Reward Minimum Players — the backfill check. docs/reward-minimum-players-plan.md Phase 1.
 *
 * READ ONLY. It answers one question: does any NFL "most picks right" reward
 * (reward_definition_id 'nfl_pickem_challenge', win_condition 'game_winner') have
 * no minimum stored? Since Phase 1, null means "no minimum — even 1 picker wins",
 * so a reward created by the OLD wizard after migration 20261017191219 ran, but
 * before the Phase 1 code was deployed, would show up here with null and must be
 * fixed (ask Andrew first) with a one-row update to min_players = 3.
 *
 * Expected: "min_players null: 0" until Phase 1 is deployed. After that, null is
 * a legitimate partner choice for rewards created on or after the deploy.
 *
 * Usage: node --env-file=.env.local scripts/check-nfl-reward-min-players.cjs
 */
const { createClient } = require("@supabase/supabase-js");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (use --env-file=.env.local).");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

(async () => {
  const { data, error } = await db
    .from("challenge_campaigns")
    .select("id,is_active,min_players,nfl_week_scope,created_at")
    .eq("reward_definition_id", "nfl_pickem_challenge")
    .eq("win_condition", "game_winner")
    .order("created_at", { ascending: true });
  if (error) {
    console.error(`Read failed: ${error.message}`);
    process.exit(1);
  }
  const rows = data ?? [];
  console.log(
    `NFL most-picks rewards: ${rows.length} | min_players null: ${rows.filter((row) => row.min_players === null).length}`,
  );
  for (const row of rows) {
    console.log(
      [row.id, row.is_active ? "active" : "inactive", `min=${row.min_players ?? "none"}`, JSON.stringify(row.nfl_week_scope), row.created_at].join("  "),
    );
  }
})();
