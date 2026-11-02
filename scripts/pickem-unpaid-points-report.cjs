#!/usr/bin/env node
/**
 * Read-only: how many Pick 'Em points were graded but never collected, and a
 * cost baseline for automatic payment (docs/pickem-college-football-and-prize-plan.md
 * Phase 1). Writes nothing.
 *
 *   node --env-file=.env.local scripts/pickem-unpaid-points-report.cjs
 */
const { createClient } = require("@supabase/supabase-js");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const PAGE = 1000;
const POINTS_PER_PICK = 10;
// Migration 20261031182914 stamped won picks graded more than 24 h before it ran (2026-10-31 18:29Z).
const BACKLOG_CUT_ISO = "2026-10-30T18:29:14Z";

const pageAll = async (build) => {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
};

const ageBucket = (iso, nowMs) => {
  const days = (nowMs - Date.parse(iso)) / 86400000;
  if (days < 1) return "< 1 day";
  if (days < 7) return "1-7 days";
  if (days < 30) return "7-30 days";
  if (days < 90) return "30-90 days";
  return "90+ days";
};

(async () => {
  const nowMs = Date.now();
  const unpaid = await pageAll(() =>
    db
      .from("pickem_picks")
      .select("id, user_id, venue_id, sport_slug, starts_at, resolved_at, reward_points, home_score, scoring_mode")
      .eq("status", "won")
      .is("reward_claimed_at", null)
      .order("id", { ascending: true })
  );

  const bySport = {};
  const byAge = {};
  const byVenue = {};
  const users = new Set();
  for (const row of unpaid) {
    bySport[row.sport_slug] = (bySport[row.sport_slug] ?? 0) + 1;
    const bucket = ageBucket(row.resolved_at ?? row.starts_at, nowMs);
    byAge[bucket] = (byAge[bucket] ?? 0) + 1;
    byVenue[row.venue_id] = (byVenue[row.venue_id] ?? 0) + 1;
    users.add(row.user_id);
  }
  const rewardPointsColumnSum = unpaid.reduce((sum, row) => sum + Number(row.reward_points ?? 0), 0);

  // Phase 7.5.1 (F12): the OLD admin "settle game" credited users.points itself and left
  // reward_claimed_at null, so pay_pickem_points would pay those picks again. Its rows carry no
  // score and no scoring_mode (the cron writes scores; NFL picks get a mode). A cron-graded pick
  // with no score from the provider looks the same, so this is an upper bound.
  const adminCredited = unpaid.filter(
    (row) =>
      row.home_score === null &&
      row.scoring_mode === null &&
      row.resolved_at !== null &&
      Date.parse(row.resolved_at) >= Date.parse(BACKLOG_CUT_ISO)
  );

  const { count: totalPicks } = await db.from("pickem_picks").select("id", { count: "exact", head: true });
  const { count: pendingPicks } = await db
    .from("pickem_picks")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  const { count: paidPicks } = await db
    .from("pickem_picks")
    .select("id", { count: "exact", head: true })
    .not("reward_claimed_at", "is", null);

  // Baseline: picks made in the last 30 days, and the busiest single settlement day.
  const sinceIso = new Date(nowMs - 30 * 86400000).toISOString();
  const recent = await pageAll(() =>
    db
      .from("pickem_picks")
      .select("id, user_id, venue_id, sport_slug, starts_at, status")
      .gte("starts_at", sinceIso)
      .order("id", { ascending: true })
  );
  const perDay = {};
  const perPlayerDay = {};
  for (const row of recent) {
    const day = row.starts_at.slice(0, 10);
    perDay[day] = (perDay[day] ?? 0) + 1;
    const k = `${row.user_id}|${row.venue_id}|${day}`;
    perPlayerDay[k] = (perPlayerDay[k] ?? 0) + 1;
  }
  const busiestDay = Object.entries(perDay).sort((a, b) => b[1] - a[1])[0] ?? null;
  const playerDays = Object.values(perPlayerDay);
  const atCap = playerDays.filter((n) => n >= 10).length;

  console.log(
    JSON.stringify(
      {
        measuredAt: new Date(nowMs).toISOString(),
        unpaid: {
          picks: unpaid.length,
          pointsToPayAt10Each: unpaid.length * POINTS_PER_PICK,
          rewardPointsColumnSum,
          players: users.size,
          venues: Object.keys(byVenue).length,
          bySport,
          byAgeSinceGraded: byAge,
          topVenues: Object.entries(byVenue)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10),
        },
        alreadyCreditedByAdminSettle: {
          picks: adminCredited.length,
          players: new Set(adminCredited.map((row) => row.user_id)).size,
          pickIds: adminCredited.map((row) => row.id),
        },
        allTime: { totalPicks, pendingPicks, paidPicks },
        last30Days: {
          picks: recent.length,
          busiestDay,
          playerDays: playerDays.length,
          playerDaysAtTheTenPickCap: atCap,
          bySport: recent.reduce((acc, r) => ((acc[r.sport_slug] = (acc[r.sport_slug] ?? 0) + 1), acc), {}),
        },
      },
      null,
      2
    )
  );
})().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
