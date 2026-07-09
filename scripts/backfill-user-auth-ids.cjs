#!/usr/bin/env node
/**
 * Backfills auth.users + public.users.auth_id for every account that's
 * missing one — matches the join flow's own lazy-backfill semantics
 * (app/api/join/profile/route.ts: "if (!existing.auth_id && authUserId)")
 * but performed server-side instead of waiting on a client-side
 * signInAnonymously() call that, in this environment, has never
 * successfully attached an identity for any account (see
 * lib/auth.ts's getCurrentAuthUserId — a 1.2s race against signInAnonymously
 * that in practice always loses).
 *
 * Uses a real ANONYMOUS sign-in (the anon-key client's signInAnonymously(),
 * same call the app itself makes) for each account, rather than the admin
 * API's createUser() — that endpoint insists on an email/phone even though
 * the dedicated anonymous-auth endpoint needs neither, so this produces
 * real is_anonymous:true auth.users rows indistinguishable from what a
 * normal successful join would have created, instead of synthetic fake
 * emails.
 *
 * Why this matters: category_blitz_submissions.auth_id is a NOT NULL FK to
 * auth.users (supabase/migrations/20260628130000_scategories.sql). Any
 * account with a null auth_id gets every Category Blitz submission rejected
 * with 400 "Could not resolve user." — silently, since the client never
 * checks the submit response's status.
 *
 * Usage:
 *   node --env-file=.env.local scripts/backfill-user-auth-ids.cjs [--dry-run]
 */
const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const adminDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rows, error } = await adminDb
    .from("users")
    .select("id, username")
    .is("auth_id", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to load users: ${error.message}`);

  console.log(`Found ${rows.length} user(s) with a null auth_id.`);
  if (dryRun) {
    console.log("--dry-run: no changes made.");
    return;
  }

  let ok = 0;
  let anonymousCount = 0;
  let fallbackCount = 0;
  let failed = 0;
  let rateLimited = false;

  for (const row of rows) {
    let newAuthUserId = null;

    // Prefer a real anonymous sign-in (matches what a normal join should have
    // produced) — but Supabase's anonymous-sign-in endpoint has a low default
    // rate limit (~30/hour), so once we've seen one rate-limit error, stop
    // wasting calls on it for the rest of this run and go straight to the
    // admin-created fallback below.
    if (!rateLimited) {
      const anonDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: authData, error: authErr } = await anonDb.auth.signInAnonymously();
      if (authData?.user) {
        newAuthUserId = authData.user.id;
        anonymousCount += 1;
      } else if (authErr?.code === "over_request_rate_limit") {
        rateLimited = true;
        console.log(`  (rate limit hit — switching remaining accounts to the admin-created fallback)`);
      } else {
        console.error(`  ✗ ${row.username} (${row.id}): anonymous sign-in failed — ${authErr?.message}`);
        failed += 1;
        continue;
      }
    }

    // Fallback: the admin API requires an email/phone (unlike the dedicated
    // anonymous endpoint), so this uses an obviously-synthetic, clearly
    // labeled address purely to satisfy that requirement — never a real
    // inbox, never used for login.
    if (!newAuthUserId) {
      const email = `backfill_${row.id}@tp-auth-backfill.internal`;
      const { data: authData, error: authErr } = await adminDb.auth.admin.createUser({
        email,
        password: crypto.randomUUID(),
        email_confirm: true,
      });
      if (!authData?.user) {
        console.error(`  ✗ ${row.username} (${row.id}): admin create failed — ${authErr?.message}`);
        failed += 1;
        continue;
      }
      newAuthUserId = authData.user.id;
      fallbackCount += 1;
    }

    // Guarded by .is("auth_id", null) so this is safe to re-run without
    // clobbering an auth_id set by a real signInAnonymously() call that
    // landed between the read above and this write.
    const { error: updateErr } = await adminDb
      .from("users")
      .update({ auth_id: newAuthUserId })
      .eq("id", row.id)
      .is("auth_id", null);
    if (updateErr) {
      console.error(`  ✗ ${row.username} (${row.id}): users update failed — ${updateErr.message}`);
      failed += 1;
      continue;
    }

    console.log(`  ✓ ${row.username} (${row.id}) -> auth_id ${newAuthUserId}`);
    ok += 1;
  }

  console.log(`\nDone. ${ok} backfilled (${anonymousCount} anonymous, ${fallbackCount} admin-fallback), ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
