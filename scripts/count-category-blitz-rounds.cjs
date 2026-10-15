#!/usr/bin/env node
/**
 * Category Blitz — rounds-per-day counter (READ ONLY; it writes nothing).
 * docs/category-blitz-how-to-play-plan.md, Phase 5 step 8 ("Measure").
 *
 * Before "sleep when idle" the continuous engine started a round every ~6
 * minutes at every venue whose game had ever been opened, whether or not
 * anyone was playing (~2,460 rounds/day on 2026-10-14, >99.9% unplayed). After
 * it, rounds start only while a player has the game open. Run this before and
 * after the deploy and compare the per-day totals.
 *
 * Prints, per UTC day: rounds started, answers submitted. Then, for the last
 * 24 hours: rounds per venue, and how many continuous sessions are open.
 *
 * Run from the repo root (it needs node_modules):
 *   node --env-file=.env.local scripts/count-category-blitz-rounds.cjs [--days 7]
 */
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = String(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
).trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Run via: node --env-file=.env.local scripts/count-category-blitz-rounds.cjs");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const daysArgIndex = process.argv.indexOf("--days");
const DAYS = Math.max(1, Math.min(60, Number(daysArgIndex >= 0 ? process.argv[daysArgIndex + 1] : 7) || 7));
const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE = 1000;

const countBetween = async (table, column, fromIso, toIso) => {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .gte(column, fromIso)
    .lt(column, toIso);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
};

const main = async () => {
  const now = Date.now();
  const todayStart = Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate(),
  );

  console.log(`Category Blitz rounds per UTC day (last ${DAYS} days; today is partial)`);
  console.log("day         rounds  answers");
  for (let i = DAYS - 1; i >= 0; i -= 1) {
    const from = new Date(todayStart - i * DAY_MS).toISOString();
    const to = new Date(todayStart - i * DAY_MS + DAY_MS).toISOString();
    const [rounds, answers] = await Promise.all([
      countBetween("category_blitz_rounds", "started_at", from, to),
      countBetween("category_blitz_submissions", "submitted_at", from, to),
    ]);
    console.log(`${from.slice(0, 10)}  ${String(rounds).padStart(6)}  ${String(answers).padStart(7)}`);
  }

  // Last 24h by venue — PostgREST can't GROUP BY, so page the venue ids.
  const since = new Date(now - DAY_MS).toISOString();
  const byVenue = new Map();
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("category_blitz_rounds")
      .select("venue_id")
      .gte("started_at", since)
      .order("started_at", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`rounds by venue: ${error.message}`);
    for (const row of data ?? []) byVenue.set(row.venue_id, (byVenue.get(row.venue_id) ?? 0) + 1);
    if (!data || data.length < PAGE) break;
  }
  console.log(`\nRounds in the last 24h by venue (${byVenue.size} venues):`);
  for (const [venueId, n] of [...byVenue.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${venueId}`);
  }

  const { count: openSessions, error: sessErr } = await supabase
    .from("category_blitz_sessions")
    .select("id", { count: "exact", head: true })
    .eq("session_type", "continuous")
    .in("status", ["lobby", "active", "scoring"]);
  if (sessErr) throw new Error(`sessions: ${sessErr.message}`);
  console.log(`\nOpen continuous sessions: ${openSessions ?? 0}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
