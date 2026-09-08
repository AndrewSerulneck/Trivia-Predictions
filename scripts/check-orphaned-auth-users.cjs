#!/usr/bin/env node
/**
 * Partner Self-Serve Signup — Phase 6 sizing check for the orphaned-auth-user
 * reconciliation. docs/partner-self-serve-signup-plan.md §4 Phase 6 / Phase 5a §1.
 *
 * READ ONLY. It deletes nothing. It answers one question:
 *
 *   How many `auth.users` rows are referenced by NONE of the seven tables that
 *   carry an auth.users(id) foreign key, and are older than 24h?
 *
 * That is exactly the predicate `/api/cron/signup-sweep` uses before it would
 * delete an auth user, so this is the dry run of that job — run it before ever
 * setting SIGNUP_SWEEP_AUTH_DELETE_ENABLED.
 *
 * WHY THE SEVEN-TABLE GUARD MATTERS (do not shorten this list):
 * `auth.users` is NOT the venue-owner credential store. Six of the seven
 * consumers below are PLAYER tables. Four are ON DELETE SET NULL — deleting the
 * row does not error, it silently detaches a player from their identity — and
 * two are ON DELETE CASCADE, which deletes that player's Category Blitz
 * gameplay rows outright. `tests/lib.auth-users-fk-guard.test.ts` is the source
 * of truth for this list; if it fails, this script and the sweep are stale.
 *
 * Run: npm run signup:check-orphan-auth-users
 */
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = String(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
).trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Run via: npm run signup:check-orphan-auth-users (loads .env.local)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Mirrors AUTH_USER_FK_CONSUMERS in lib/signupSweep.ts. Kept as a literal here
// (rather than imported) because this is a plain .cjs script with no TS build.
const CONSUMERS = [
  ["venue_owners", "auth_id"],
  ["accounts", "auth_id"],
  ["users", "auth_id"],
  ["username_change_attempts", "requester_auth_id"],
  ["username_change_audit", "changed_by_auth_id"],
  ["category_blitz_submissions", "auth_id"],
  ["category_blitz_session_participants", "auth_id"],
];

const PER_PAGE = 200;
const MAX_PAGES = 100;
const IN_CHUNK = 100;

async function listAllAuthUsers() {
  const users = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(`listUsers page ${page}: ${error.message}`);
    const batch = data && data.users ? data.users : [];
    for (const user of batch) {
      users.push({ id: user.id, email: user.email || "", createdAt: user.created_at || "" });
    }
    if (batch.length < PER_PAGE) return users;
  }
  console.warn(`WARNING: stopped at ${MAX_PAGES} pages — there may be more auth users.`);
  return users;
}

async function main() {
  const users = await listAllAuthUsers();
  console.log(`auth.users scanned: ${users.length}`);

  const referenced = new Set();
  for (const [table, column] of CONSUMERS) {
    let refs = 0;
    for (let i = 0; i < users.length; i += IN_CHUNK) {
      const ids = users.slice(i, i + IN_CHUNK).map((u) => u.id);
      const { data, error } = await supabase.from(table).select(column).in(column, ids);
      if (error) throw new Error(`${table}.${column}: ${error.message}`);
      for (const row of data || []) {
        const value = row[column];
        if (value) {
          referenced.add(value);
          refs += 1;
        }
      }
    }
    console.log(`  ${table}.${column}: ${refs} references into the scanned set`);
  }

  const allOrphans = users.filter((u) => !referenced.has(u.id));
  // EMAILLESS ORPHANS ARE PLAYERS, NOT SIGNUP DEBRIS. lib/auth.ts's
  // signInAnonymously() (three call sites in components/join/JoinFlow.tsx)
  // creates an emailless auth.users row for every anonymous visitor, and one who
  // never finishes joining a venue never gets an `accounts` or `users` row — so
  // it is an orphan by the seven-table test and is NOT ours to delete. Every row
  // POST /api/owner/signup creates has an email (`createUser({ email, ... })`).
  // The sweep applies the same filter; see ORPHAN_REQUIRES_EMAIL in lib/signupSweep.ts.
  const anonymous = allOrphans.filter((u) => !u.email);
  const orphans = allOrphans.filter((u) => Boolean(u.email));
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const aged = orphans.filter((u) => {
    const created = Date.parse(u.createdAt);
    return Number.isFinite(created) && created < cutoff;
  });

  console.log("");
  console.log(`orphans (referenced by none of the seven): ${allOrphans.length}`);
  console.log(`  emailless — anonymous PLAYER sessions, never swept: ${anonymous.length}`);
  console.log(`  with an email — candidate signup debris: ${orphans.length}`);
  console.log(`  of those, older than 24h (sweep-eligible): ${aged.length}`);

  const byMonth = {};
  for (const user of aged) {
    const month = String(user.createdAt).slice(0, 7) || "unknown";
    byMonth[month] = (byMonth[month] || 0) + 1;
  }
  const months = Object.keys(byMonth).sort();
  if (months.length > 0) {
    console.log("  by created month:");
    for (const month of months) console.log(`    ${month}: ${byMonth[month]}`);
  }

  if (aged.length === 0) {
    console.log("");
    console.log("CLEAN — nothing the orphan reconciliation would delete today.");
    return;
  }

  console.log("");
  console.log(`Sample (up to 10 of ${aged.length}):`);
  for (const user of aged.slice(0, 10)) {
    console.log(`  ${user.createdAt}  ${user.email || "(no email)"}`);
  }
  console.log("");
  console.log(
    "NOT CLEAN. Every row above would be deleted the moment " +
      "SIGNUP_SWEEP_AUTH_DELETE_ENABLED is set. Understand what they are FIRST — " +
      "a large count means these are not signup debris but some other kind of " +
      "auth user this product creates and does not link, and deleting them is " +
      "destructive. See docs/partner-self-serve-signup-plan.md Phase 6."
  );
  process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
