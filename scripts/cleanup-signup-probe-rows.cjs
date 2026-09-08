/**
 * Delete the throwaway rows created by an end-to-end signup probe.
 *
 * Run with:  node --env-file=.env.local scripts/cleanup-signup-probe-rows.cjs
 * Preview:   node --env-file=.env.local scripts/cleanup-signup-probe-rows.cjs --dry-run
 *
 * SCOPE IS DELIBERATELY NARROW. A row is only touched when ALL of these hold:
 *   - the venue carries a `self_serve_created_at` stamp (so it came from the
 *     self-serve wizard, never from admin Activate-a-Venue), and
 *   - its name starts with "Probe Venue", and
 *   - its owner's email matches probe-<digits>@example.com.
 * Anything else is listed and left alone.
 *
 * AUTH.USERS IS SHARED WITH PLAYERS (CLAUDE.md). `accounts.auth_id` and
 * `users.auth_id` are ON DELETE SET NULL, so deleting the wrong auth user does
 * not error — it silently detaches a player from their identity. Every auth
 * delete here is guarded on those two tables first, and is skipped (the owner
 * row still goes) if either references it.
 */

const { createClient } = require("@supabase/supabase-js");

const DRY_RUN = process.argv.includes("--dry-run");
const PROBE_VENUE_NAME = /^Probe Venue/;
const PROBE_OWNER_EMAIL = /^probe-\d+@example\.com$/;

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const say = (...args) => console.log(DRY_RUN ? "[dry-run]" : "[live]   ", ...args);

(async () => {
  const { data: venues, error } = await db
    .from("venues")
    .select("id,name,hidden,self_serve_created_at")
    .not("self_serve_created_at", "is", null);
  if (error) throw new Error(error.message);

  const targets = (venues || []).filter((v) => PROBE_VENUE_NAME.test(v.name || ""));
  const others = (venues || []).filter((v) => !PROBE_VENUE_NAME.test(v.name || ""));

  say("self-serve venues found:", (venues || []).length);
  if (others.length) say("LEAVING ALONE (real self-serve rows):", others.map((v) => `${v.id} (${v.name})`).join(", "));
  if (!targets.length) {
    say("no probe venues to remove.");
    return;
  }
  say("probe venues to remove:", targets.map((v) => `${v.id} (${v.name})`).join(", "));

  for (const venue of targets) {
    const { data: links } = await db
      .from("venue_owner_venues")
      .select("owner_id")
      .eq("venue_id", venue.id);
    const ownerIds = [...new Set((links || []).map((l) => l.owner_id))];

    for (const ownerId of ownerIds) {
      const { data: owner } = await db
        .from("venue_owners")
        .select("id,email,auth_id")
        .eq("id", ownerId)
        .maybeSingle();
      if (!owner) continue;

      if (!PROBE_OWNER_EMAIL.test(owner.email || "")) {
        say(`  SKIP owner ${ownerId}: email "${owner.email}" is not a probe address`);
        continue;
      }

      const { data: otherLinks } = await db
        .from("venue_owner_venues")
        .select("venue_id")
        .eq("owner_id", ownerId)
        .neq("venue_id", venue.id)
        .limit(1);
      if (otherLinks && otherLinks.length) {
        say(`  KEEP owner ${ownerId}: owns another venue`);
        continue;
      }

      let playerReferenced = false;
      for (const [table, col] of [["accounts", "auth_id"], ["users", "auth_id"]]) {
        const { data } = await db.from(table).select("id").eq(col, owner.auth_id).limit(1);
        if (data && data.length) {
          say(`  GUARD: ${table}.${col} references auth user ${owner.auth_id} — auth row KEPT`);
          playerReferenced = true;
        }
      }

      if (DRY_RUN) {
        say(`  would delete owner ${ownerId} (${owner.email})`);
        if (!playerReferenced && owner.auth_id) say(`  would delete auth user ${owner.auth_id}`);
        continue;
      }

      await db.from("venue_owner_venues").delete().eq("owner_id", ownerId);
      const { error: ownerError } = await db.from("venue_owners").delete().eq("id", ownerId);
      say(`  deleted owner ${ownerId} (${owner.email}):`, ownerError ? ownerError.message : "ok");

      if (!playerReferenced && owner.auth_id) {
        const { error: authError } = await db.auth.admin.deleteUser(owner.auth_id);
        say(`  deleted auth user ${owner.auth_id}:`, authError ? authError.message : "ok");
      }
    }

    if (DRY_RUN) {
      say(`would delete venue ${venue.id}`);
      continue;
    }
    const { error: venueError } = await db.from("venues").delete().eq("id", venue.id);
    say(`deleted venue ${venue.id}:`, venueError ? venueError.message : "ok");
  }

  const { data: left } = await db
    .from("venues")
    .select("id,name")
    .not("self_serve_created_at", "is", null);
  say("self-serve venues remaining:", JSON.stringify(left));
})();
