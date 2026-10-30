#!/usr/bin/env node
// Phase 6: turns the store-review player account into a God Mode account (so Apple's / Google's
// reviewers, who are not standing in a bar, can still join a venue). It does NOT create the account
// and never sees its PIN: create it first with the normal "Create Account" screen in the app/website,
// so the PIN is hashed by the normal code path.
//
// Dry run (default) — shows the account, changes nothing:
//   node --env-file=.env.local scripts/make-app-review-account.cjs --username appreview
// Apply — PRODUCTION write (sets accounts.god_mode = true for that one row):
//   node --env-file=.env.local scripts/make-app-review-account.cjs --username appreview --confirm
// Undo after approval (recommended): add --off together with --confirm.
//
// Run from the repo root. Never prints secrets.
const { createClient } = require("@supabase/supabase-js");

const args = process.argv.slice(2);
const username = args[args.indexOf("--username") + 1];
const confirm = args.includes("--confirm");
const off = args.includes("--off");

async function main() {
  if (!args.includes("--username") || !username || username.startsWith("--")) {
    console.error("Usage: … scripts/make-app-review-account.cjs --username <name> [--confirm] [--off]");
    process.exitCode = 1;
    return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing (run with --env-file=.env.local).");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: account, error } = await sb
    .from("accounts")
    .select("id, username, god_mode, created_at")
    .eq("username_normalized", username.trim().toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`accounts lookup failed: ${error.message}`);
  if (!account) {
    console.log(`No account named "${username}". Create it first with the normal Create Account screen.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Account "${account.username}" (created ${account.created_at}), god_mode = ${account.god_mode}.`);

  const target = !off;
  if (account.god_mode === target) {
    console.log(`Already god_mode = ${target}. Nothing to do.`);
    return;
  }
  if (!confirm) {
    console.log(`DRY RUN: would set god_mode = ${target}. Re-run with --confirm.`);
    return;
  }
  const { error: updateError } = await sb.from("accounts").update({ god_mode: target }).eq("id", account.id);
  if (updateError) throw new Error(`update failed: ${updateError.message}`);
  console.log(`Done: god_mode = ${target}.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
