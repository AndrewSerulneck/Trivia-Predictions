#!/usr/bin/env node
/**
 * Abandoned Self-Serve Signups — Phase 0 (docs/abandoned-signup-cleanup-plan.md).
 *
 * Purge ONE pending (unpaid, never-finished) self-serve signup by email so a
 * prospective partner can re-run the wizard with the same address today, with no
 * deploy. This is the manual, one-off version of what Phase 1's
 * `purgePendingSignup()` will do in code.
 *
 *   Preview:  npm run signup:purge-pending -- fake@emailaddress.com
 *   Delete:   npm run signup:purge-pending -- fake@emailaddress.com --delete
 *
 * READ ONLY BY DEFAULT. It prints the owner row, its linked venues (with
 * hidden / self_serve_created_at / lat-lon), any billing_subscriptions rows, and
 * the seven-table auth.users reference check. It deletes nothing unless
 * `--delete` is passed.
 *
 * IT REFUSES TO DELETE if ANY of these is true — every clause is load-bearing,
 * transcribed from the predicate in lib/signupSweep.ts which has passed security
 * review:
 *   - a billing_subscriptions row exists for the owner or ANY linked venue, ever
 *     (a cancelled subscriber keeps its row, so "no row" is a reliable
 *     "never paid" test);
 *   - a linked venue is not hidden;
 *   - a linked venue has no self_serve_created_at stamp (admin-activated, or a
 *     Category Blitz global room);
 *   - a linked venue is at latitude 0, longitude 0 (placeholder / internal room);
 *   - the auth user is referenced by any of the six PLAYER tables that carry an
 *     auth.users(id) foreign key.
 *
 * WHY THE SEVEN-TABLE GUARD MATTERS: `auth.users` is shared with players
 * (CLAUDE.md standing prohibition; tests/lib.auth-users-fk-guard.test.ts). Four
 * of the player consumers are ON DELETE SET NULL — deleting the row does not
 * error, it silently detaches a player from their identity — and two are
 * ON DELETE CASCADE. "This email has no live subscription, so delete its auth
 * user" is an account-takeover vector if the predicate is even slightly loose.
 *
 * Deletion order matches unwind() in app/api/owner/signup/route.ts:
 *   venues -> venue_owners -> auth user.
 */
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = String(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
).trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Run via: npm run signup:purge-pending -- <email> [--delete] (loads .env.local)");
  process.exit(1);
}

const args = process.argv.slice(2);
const DELETE = args.includes("--delete");
const rawEmail = args.find((a) => !a.startsWith("--"));

if (!rawEmail) {
  console.error("Usage: npm run signup:purge-pending -- <email> [--delete]");
  process.exit(1);
}

// Matches draftFromBody() in app/api/owner/signup/route.ts: the email is stored
// lower-cased and trimmed.
const email = rawEmail.trim().toLowerCase();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Mirrors AUTH_USER_FK_CONSUMERS in lib/signupSweep.ts. The first entry
// (venue_owners) is THIS owner's own row and is discounted from the guard; the
// other six are player tables and any hit refuses the purge.
const PLAYER_CONSUMERS = [
  ["accounts", "auth_id"],
  ["users", "auth_id"],
  ["username_change_attempts", "requester_auth_id"],
  ["username_change_audit", "changed_by_auth_id"],
  ["category_blitz_submissions", "auth_id"],
  ["category_blitz_session_participants", "auth_id"],
];

const tag = DELETE ? "[live]   " : "[dry-run]";
const say = (...a) => console.log(tag, ...a);

async function main() {
  console.log(`Target email: ${email}`);
  console.log(`Mode: ${DELETE ? "DELETE" : "dry run (read only)"}`);
  console.log("");

  // --- Owner row ----------------------------------------------------------
  const { data: owner, error: ownerErr } = await supabase
    .from("venue_owners")
    .select("id, email, name, auth_id, created_at")
    .eq("email", email)
    .maybeSingle();
  if (ownerErr) throw new Error(`venue_owners read: ${ownerErr.message}`);

  if (!owner) {
    console.log("No venue_owners row for that email. Nothing to purge.");
    return;
  }

  console.log("venue_owners row:");
  console.log(`  id         ${owner.id}`);
  console.log(`  name       ${owner.name}`);
  console.log(`  auth_id    ${owner.auth_id}`);
  console.log(`  created_at ${owner.created_at}`);
  console.log("");

  const refusals = [];

  // --- Linked venues ----------------------------------------------------------
  const { data: links, error: linkErr } = await supabase
    .from("venue_owner_venues")
    .select("venue_id")
    .eq("owner_id", owner.id);
  if (linkErr) throw new Error(`venue_owner_venues read: ${linkErr.message}`);

  const venueIds = [...new Set((links || []).map((l) => l.venue_id))];

  let venues = [];
  if (venueIds.length > 0) {
    const { data: venueRows, error: venueErr } = await supabase
      .from("venues")
      .select("id, name, hidden, self_serve_created_at, latitude, longitude")
      .in("id", venueIds);
    if (venueErr) throw new Error(`venues read: ${venueErr.message}`);
    venues = venueRows || [];
  }

  console.log(`linked venues: ${venues.length}`);
  for (const v of venues) {
    console.log(`  ${v.id} (${v.name})`);
    console.log(`    hidden                ${v.hidden}`);
    console.log(`    self_serve_created_at ${v.self_serve_created_at}`);
    console.log(`    lat, lon              ${v.latitude}, ${v.longitude}`);
  }
  console.log("");

  if (venues.length === 0) {
    // The lib/signupSweep predicate requires >= 1 linked venue. An owner with no
    // linked venue is not a shape this Phase-0 script is built to reason about.
    refusals.push("owner has NO linked venue — not a recognised pending-signup shape");
  }
  for (const v of venues) {
    if (v.hidden !== true) refusals.push(`venue ${v.id} is not hidden`);
    if (!v.self_serve_created_at) refusals.push(`venue ${v.id} has no self_serve_created_at stamp`);
    if (Number(v.latitude) === 0 && Number(v.longitude) === 0) {
      refusals.push(`venue ${v.id} is at (0, 0) — placeholder / internal room`);
    }
  }

  // --- billing_subscriptions (owner OR any linked venue, ever) ---------------
  const { data: ownerSubs, error: ownerSubErr } = await supabase
    .from("billing_subscriptions")
    .select("id, status, owner_id, venue_id, stripe_subscription_id")
    .eq("owner_id", owner.id);
  if (ownerSubErr) throw new Error(`billing_subscriptions (owner) read: ${ownerSubErr.message}`);

  let venueSubs = [];
  if (venueIds.length > 0) {
    const { data, error } = await supabase
      .from("billing_subscriptions")
      .select("id, status, owner_id, venue_id, stripe_subscription_id")
      .in("venue_id", venueIds);
    if (error) throw new Error(`billing_subscriptions (venue) read: ${error.message}`);
    venueSubs = data || [];
  }

  const allSubs = [...(ownerSubs || []), ...venueSubs];
  console.log(`billing_subscriptions rows (owner or linked venue, any status): ${allSubs.length}`);
  for (const s of allSubs) {
    console.log(`  id=${s.id} status=${s.status} owner_id=${s.owner_id} venue_id=${s.venue_id} stripe=${s.stripe_subscription_id}`);
  }
  console.log("");
  if (allSubs.length > 0) {
    refusals.push("a billing_subscriptions row exists (owner or linked venue) — this signup has paid at some point");
  }

  // --- Seven-table auth.users reference check -------------------------------
  console.log("auth.users reference check (six player tables; this owner's own venue_owners row discounted):");
  let playerReferenced = false;
  if (owner.auth_id) {
    for (const [table, column] of PLAYER_CONSUMERS) {
      const { data, error } = await supabase
        .from(table)
        .select(column)
        .eq(column, owner.auth_id)
        .limit(1);
      if (error) throw new Error(`${table}.${column} read: ${error.message}`);
      const hit = (data || []).length > 0;
      console.log(`  ${table}.${column}: ${hit ? "REFERENCED" : "clear"}`);
      if (hit) {
        playerReferenced = true;
        refusals.push(`auth user ${owner.auth_id} is referenced by ${table}.${column} — PLAYER data`);
      }
    }
  } else {
    console.log("  (owner row has no auth_id)");
  }
  console.log("");

  // --- Verdict --------------------------------------------------------------
  if (refusals.length > 0) {
    console.log("REFUSING TO PURGE. This is not a clean pending signup:");
    for (const r of refusals) console.log(`  - ${r}`);
    process.exitCode = 2;
    return;
  }

  console.log("Predicate PASSED — this is a clean, unpaid, never-finished self-serve signup.");
  console.log("");

  if (!DELETE) {
    console.log("Dry run. Re-run with --delete to remove, in this order:");
    for (const v of venues) console.log(`  DELETE venues            ${v.id}`);
    console.log(`  DELETE venue_owners      ${owner.id}`);
    if (owner.auth_id && !playerReferenced) console.log(`  DELETE auth.users        ${owner.auth_id}`);
    return;
  }

  // --- Delete: venues -> venue_owners -> auth user ------------------------
  for (const v of venues) {
    const { error } = await supabase.from("venues").delete().eq("id", v.id);
    say(`deleted venue ${v.id}:`, error ? error.message : "ok");
    if (error) throw new Error(`venue delete failed: ${error.message}`);
  }

  const { error: ownerDelErr } = await supabase.from("venue_owners").delete().eq("id", owner.id);
  say(`deleted venue_owners ${owner.id}:`, ownerDelErr ? ownerDelErr.message : "ok");
  if (ownerDelErr) throw new Error(`venue_owners delete failed: ${ownerDelErr.message}`);

  if (owner.auth_id) {
    const { error: authDelErr } = await supabase.auth.admin.deleteUser(owner.auth_id);
    say(`deleted auth.users ${owner.auth_id}:`, authDelErr ? authDelErr.message : "ok");
    if (authDelErr) throw new Error(`auth user delete failed: ${authDelErr.message}`);
  }

  console.log("");
  console.log(`Done. ${email} is free to re-run the signup wizard.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
