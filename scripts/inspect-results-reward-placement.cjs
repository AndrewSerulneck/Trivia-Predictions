#!/usr/bin/env node
/* Read-only: lists every reward-ledger row, settlement and the campaigns they belong to, so the
 * Results page's reward-placement rules (docs/partner-results-page-plan.md §5b) can be checked
 * against real data. Never writes. Prints no player ids (counts and usernames only).
 * Usage: node --env-file=.env.local scripts/inspect-results-reward-placement.cjs */
const { createClient } = require("@supabase/supabase-js");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const pageAll = async (table, columns) => {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
};

(async () => {
  const winners = await pageAll("challenge_cycle_winners", "challenge_id, venue_id, cycle_start, finalized_at, place");
  const settlements = await pageAll("challenge_cycle_settlements", "challenge_id, venue_id, cycle_start, outcome, settled_at");
  const ids = [...new Set([...winners, ...settlements].map((r) => r.challenge_id))];
  const { data: campaigns, error } = await db
    .from("challenge_campaigns")
    .select("id, name, win_condition, recurring_type, schedule_type, active_days, start_time, end_day, end_time, reward_definition_id, game_winner_slots, nfl_week_scope, venue_ids, is_active")
    .in("id", ids);
  if (error) throw new Error(error.message);
  const venueIds = [...new Set([...winners, ...settlements].map((r) => r.venue_id))];
  const { data: venues } = await db.from("venues").select("id, name, timezone").in("id", venueIds);
  const venueById = new Map((venues ?? []).map((v) => [v.id, v]));
  const { data: schedules } = await db.from("trivia_schedules").select("id, venue_id, title, start_time, timezone, recurring_type, recurring_days, num_rounds").in("venue_id", venueIds);

  console.log(`ledger rows: ${winners.length}, settlements: ${settlements.length}, campaigns: ${ids.length}, venues: ${venueIds.length}`);
  for (const c of campaigns ?? []) {
    console.log("\nCAMPAIGN", JSON.stringify({ ...c, venue_ids: (c.venue_ids ?? []).length }));
    const rows = winners.filter((w) => w.challenge_id === c.id);
    const sets = settlements.filter((s) => s.challenge_id === c.id);
    const byVenue = new Map();
    for (const r of rows) byVenue.set(r.venue_id, [...(byVenue.get(r.venue_id) ?? []), r]);
    for (const [venueId, list] of byVenue) {
      const venue = venueById.get(venueId);
      const tz = venue?.timezone || "America/New_York";
      const fmt = (iso) => (iso ? new Date(iso).toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null);
      const cycles = [...new Set(list.map((r) => r.cycle_start))].sort();
      console.log(`  venue ${venue?.name ?? venueId} (${tz}) — ${list.length} rows, ${cycles.length} cycles`);
      for (const cs of cycles.slice(-8)) {
        const inCycle = list.filter((r) => r.cycle_start === cs);
        const fin = inCycle.map((r) => r.finalized_at).filter(Boolean).sort().pop();
        console.log(`    cycle ${cs} (${fmt(cs)}) winners=${inCycle.length} places=${inCycle.map((r) => r.place).join(",")} finalized ${fmt(fin)}`);
      }
    }
    for (const s of sets) console.log(`  settlement ${s.cycle_start} ${s.outcome} settled ${s.settled_at} venue ${venueById.get(s.venue_id)?.name ?? s.venue_id}`);
  }
  console.log("\nSCHEDULES");
  for (const s of schedules ?? []) console.log(" ", JSON.stringify({ ...s, venue: venueById.get(s.venue_id)?.name }));
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
