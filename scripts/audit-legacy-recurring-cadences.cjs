#!/usr/bin/env node
// Read-only audit for docs/rewards-terms-sentence-plan.md Phase 4.5.
//
// Before the terms-sentence rebuild, computeCycleStart/computeCycleEnd
// (lib/challengeCampaigns.ts) were weekly-anchored for EVERY recurring campaign —
// a campaign stored with recurring_type "daily", "monthly", or "yearly" silently
// behaved exactly like "weekly" (same activeDays[0]-anchored cycle boundary, same
// 7-day step). Now those three recurrence types get their own real calendar-anchored
// cycle windows. Any campaign that already exists with one of those three values
// changes behavior the instant this ships — its quota reset cadence, its
// leaderboard "between cycles" window, and (for a leaderboard campaign) the
// instant finalizeClosedRecurringCycles decides its cycle has closed.
//
// The Rewards wizard could never have created such a row (SUPPORTED_REWARD_CADENCES
// only ever offered "none"/"weekly" until this rebuild), so any hit here was made
// through the admin raw create/edit form (components/admin/sections/ChallengesSection.tsx),
// which has always exposed all five recurring_type values directly.
//
// This script only reads — it does not change any row. Run it before Phase 4.5
// ships to production so a human can decide, per hit, whether the new (correct)
// calendar behavior is what that specific campaign should have.

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const AFFECTED_RECURRENCES = ["daily", "monthly", "yearly"];

async function main() {
  const { data: rows, error } = await supabase
    .from("challenge_campaigns")
    .select(
      "id, name, recurring_type, active_days, start_time, is_active, created_by_owner_id, reward_definition_id, challenge_mode, venue_ids, created_at",
    )
    .in("recurring_type", AFFECTED_RECURRENCES)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }

  console.log(
    `Scanned challenge_campaigns for recurring_type in (${AFFECTED_RECURRENCES.join(", ")}) — ` +
      "these silently ran on a WEEKLY cycle before the terms-sentence rebuild and now run on their real calendar period.\n",
  );

  if (!rows || rows.length === 0) {
    console.log("No hits. Every existing recurring campaign is 'none' or 'weekly' — the behavior change is inert.");
    return;
  }

  console.log(`Found ${rows.length} row(s) whose cycle behavior changes:\n`);
  for (const row of rows) {
    console.log(`- ${row.id}  "${row.name}"`);
    console.log(
      `  recurring_type=${row.recurring_type}  active_days=${JSON.stringify(row.active_days)}  ` +
        `start_time=${row.start_time ?? "(none)"}  challenge_mode=${row.challenge_mode}`,
    );
    console.log(
      `  is_active=${row.is_active}  reward_definition_id=${row.reward_definition_id ?? "(none — not wizard-created)"}  ` +
        `created_by_owner_id=${row.created_by_owner_id ?? "(admin)"}  venue_ids=${JSON.stringify(row.venue_ids)}`,
    );
    console.log(`  created_at=${row.created_at}`);
  }

  console.log(
    "\nEach hit above was created through the admin raw campaign form (not the Rewards wizard, " +
      "which never offered these cadences before this rebuild). Review whether its intended cycle " +
      "was actually weekly (in which case its recurring_type should be corrected to \"weekly\") or " +
      "whether the new calendar-anchored behavior is what it always should have been.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
