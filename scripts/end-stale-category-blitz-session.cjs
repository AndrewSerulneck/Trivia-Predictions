#!/usr/bin/env node

/**
 * One-off: force-close a specific orphaned Category Blitz session so a venue's
 * next scheduled window can open a fresh session.
 *
 * Usage:
 *   node --env-file=.env.local scripts/end-stale-category-blitz-session.cjs <sessionId>
 */

const { createClient } = require("@supabase/supabase-js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function getClient() {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  assert(supabaseUrl, "Missing NEXT_PUBLIC_SUPABASE_URL.");
  assert(serviceRoleKey, "Missing SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function main() {
  const sessionId = process.argv[2];
  assert(sessionId, "Usage: node --env-file=.env.local scripts/end-stale-category-blitz-session.cjs <sessionId>");

  const supabase = getClient();

  const { data: session, error: fetchErr } = await supabase
    .from("category_blitz_sessions")
    .select("id, venue_id, status, source, scheduled_end_at, created_at")
    .eq("id", sessionId)
    .maybeSingle();

  assert(!fetchErr, fetchErr?.message ?? "Failed to load session.");
  assert(session, `Session ${sessionId} not found.`);

  console.log("Found session:", session);

  const { error: updateErr } = await supabase
    .from("category_blitz_sessions")
    .update({ status: "complete", completed_at: new Date().toISOString() })
    .eq("id", sessionId);

  assert(!updateErr, updateErr?.message ?? "Failed to close session.");

  console.log(`Session ${sessionId} closed.`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
