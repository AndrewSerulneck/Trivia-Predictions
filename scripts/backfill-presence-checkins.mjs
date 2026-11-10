// One-off (away-mode plan, Phase C1): before 2026-11-09 a failed presence check erased
// `venue_presence_sessions.last_verified_at`, which "Your bars" now reads as the last check-in. This restores it
// from the newest "verified" row in `venue_presence_events` for rows where it is null.
//
// Dry run by default (prints what it would change). Apply only with Andrew's go-ahead:
//   node --env-file=.env.local scripts/backfill-presence-checkins.mjs           # dry run
//   node --env-file=.env.local scripts/backfill-presence-checkins.mjs --apply   # writes; the printed list is the undo log
// Undo: set last_verified_at back to null for the printed (user_id, venue_id) pairs.
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: rows, error } = await db
  .from("venue_presence_sessions")
  .select("user_id, venue_id")
  .is("last_verified_at", null);
if (error) throw new Error(error.message);

const changes = [];
for (const row of rows ?? []) {
  const { data: events, error: eventError } = await db
    .from("venue_presence_events")
    .select("created_at")
    .eq("user_id", row.user_id)
    .eq("venue_id", row.venue_id)
    .eq("event_type", "verified")
    .order("created_at", { ascending: false })
    .limit(1);
  if (eventError) throw new Error(eventError.message);
  const lastVerifiedAt = events?.[0]?.created_at;
  if (lastVerifiedAt) changes.push({ ...row, last_verified_at: lastVerifiedAt });
}

console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", nullRows: rows?.length ?? 0, changes }, null, 2));
if (!apply) process.exit(0);

for (const change of changes) {
  const { error: updateError } = await db
    .from("venue_presence_sessions")
    .update({ last_verified_at: change.last_verified_at })
    .eq("user_id", change.user_id)
    .eq("venue_id", change.venue_id)
    .is("last_verified_at", null);
  if (updateError) throw new Error(`${change.user_id}/${change.venue_id}: ${updateError.message}`);
}
console.log(`Updated ${changes.length} rows.`);
