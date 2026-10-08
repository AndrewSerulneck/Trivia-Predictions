#!/usr/bin/env node
// Operator tool for an emailed "delete my account" request (the /delete-account page promises we
// will do it for a player who can't sign in). Uses the SAME code as the in-app button:
// lib/playerAccountDeletion.ts → the delete_player_account RPC → anonymous auth-user cleanup.
//
// Dry run (default) — shows the account and its venue profiles, changes nothing:
//   node --env-file=.env.local --conditions react-server --import tsx scripts/delete-player-account.cjs --username <name>
// Delete — irreversible, PRODUCTION:
//   node --env-file=.env.local --conditions react-server --import tsx scripts/delete-player-account.cjs --username <name> --confirm
//
// Run from the repo root. Never prints secrets.
const { createClient } = require("@supabase/supabase-js");

const args = process.argv.slice(2);
const usernameArg = args[args.indexOf("--username") + 1];
const confirm = args.includes("--confirm");

async function main() {
  if (!args.includes("--username") || !usernameArg || usernameArg.startsWith("--")) {
    console.error("Usage: … scripts/delete-player-account.cjs --username <name> [--confirm]");
    process.exitCode = 1;
    return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing (run with --env-file=.env.local).");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const normalized = usernameArg.trim().toLowerCase();
  const { data: account, error: accountError } = await sb
    .from("accounts")
    .select("id, username, created_at, god_mode")
    .eq("username_normalized", normalized)
    .maybeSingle();
  if (accountError) throw new Error(`accounts lookup failed: ${accountError.message}`);

  let profiles = [];
  if (account) {
    const { data, error } = await sb.from("users").select("id, venue_id, points, created_at").eq("account_id", account.id);
    if (error) throw new Error(`users lookup failed: ${error.message}`);
    profiles = data ?? [];
  } else {
    // A legacy venue profile with no account.
    const { data, error } = await sb
      .from("users")
      .select("id, venue_id, points, created_at")
      .is("account_id", null)
      .eq("username_normalized", normalized);
    if (error) throw new Error(`users lookup failed: ${error.message}`);
    profiles = data ?? [];
  }

  console.log({ account: account ?? null, profiles });
  if (!account && profiles.length === 0) {
    console.log("No player with that username. Nothing to do.");
    return;
  }
  if (!account && profiles.length > 1) {
    console.log("Several legacy profiles share that username; delete each by id from the app or ask a developer.");
    return;
  }
  if (account?.god_mode) console.warn("Note: this is a God Mode (staff/reviewer) account.");
  if (!confirm) {
    console.log("Dry run. Re-run with --confirm to delete permanently.");
    return;
  }
  if (profiles.length === 0) {
    console.log("The account has no venue profile; the RPC is keyed by a profile id. Ask a developer.");
    return;
  }

  const { deletePlayerAccount } = require("@/lib/playerAccountDeletion");
  const result = await deletePlayerAccount(profiles[0].id);
  console.log(result);
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
