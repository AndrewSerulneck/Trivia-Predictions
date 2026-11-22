// Read-only: sizes the Pick 'Em reads the TV sports screens would add (docs/fire-tv-app-plan.md Phase 9).
// Run: node --env-file=.env.local scripts/tv-sports-inventory.cjs
const { createClient } = require("@supabase/supabase-js");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase env missing.");
const db = createClient(url, key, { auth: { persistSession: false } });

const DAY = 24 * 60 * 60 * 1000;

const pageAll = async (build) => {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
};

(async () => {
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const picks = await pageAll(() =>
    db.from("pickem_picks").select("venue_id, game_id, sport_key, starts_at, status").gte("starts_at", since),
  );
  const byVenueDay = new Map();
  const gamesByDay = new Map();
  const sportKeys = new Map();
  for (const p of picks) {
    const day = p.starts_at.slice(0, 10);
    const k = `${p.venue_id}|${day}`;
    byVenueDay.set(k, (byVenueDay.get(k) ?? 0) + 1);
    if (!gamesByDay.has(day)) gamesByDay.set(day, new Set());
    gamesByDay.get(day).add(p.game_id);
    sportKeys.set(p.sport_key, (sportKeys.get(p.sport_key) ?? 0) + 1);
  }
  const counts = [...byVenueDay.values()].sort((a, b) => b - a);
  const gameCounts = [...gamesByDay.values()].map((s) => s.size).sort((a, b) => b - a);
  console.log("picks in last 30 days:", picks.length);
  console.log("venue-days with picks:", counts.length, "max picks per venue-day:", counts[0] ?? 0, "median:", counts[Math.floor(counts.length / 2)] ?? 0);
  console.log("distinct picked games per UTC day: max", gameCounts[0] ?? 0, "median", gameCounts[Math.floor(gameCounts.length / 2)] ?? 0);
  console.log("picks by sport_key:", Object.fromEntries([...sportKeys].sort((a, b) => b[1] - a[1])));

  const { count: venueCount } = await db.from("venues").select("id", { count: "exact", head: true });
  const { count: screenOn } = await db.from("venues").select("id", { count: "exact", head: true }).neq("screen_enabled", false);
  console.log("venues:", venueCount, "screen enabled:", screenOn);

  const { data: tz } = await db.from("venues").select("timezone").limit(1000);
  const zones = new Map();
  for (const r of tz ?? []) zones.set(r.timezone ?? "(null)", (zones.get(r.timezone ?? "(null)") ?? 0) + 1);
  console.log("venue time zones:", Object.fromEntries(zones));

  const { count: usersWithPoints } = await db.from("users").select("id", { count: "exact", head: true }).gt("points", 0);
  console.log("users with points > 0:", usersWithPoints);

  const { count: activeCampaigns } = await db
    .from("challenge_campaigns").select("id", { count: "exact", head: true }).eq("is_active", true).is("winner_user_id", null);
  console.log("active prize campaigns:", activeCampaigns);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
