#!/usr/bin/env node
/**
 * Phase 4 — Retroactive per-cycle score correction for recurring leaderboard challenges.
 *
 * Re-derives correct per-cycle scores from game source tables (timezone-corrected),
 * replacing the corrupted cumulative `challenge_campaign_progress` rows.
 *
 * SAFE BY DEFAULT: read-only dry-run. Pass --apply to mutate.
 *
 * Usage:
 *   node --env-file=.env.local scripts/recompute-challenge-cycles.cjs [--venue <id>] [--apply]
 *
 * Venue attribution: user_id is permanently venue-scoped (one users row per
 * username+venue), so trivia/live answers map to a venue via users.venue_id.
 *
 * Bucketing timestamp (faithful to when challenge points were credited):
 *   speed-trivia  -> trivia_answers.answered_at        (2 pts per correct)
 *   live-trivia   -> live_showdown_answers.answered_at (points_awarded)
 *   pickem        -> pickem_picks.reward_claimed_at    (reward_points, status=won)
 *   fantasy       -> fantasy_entries.reward_claimed_at (reward_points)
 *   bingo         -> sports_bingo_cards.reward_claimed_at (reward_points, status=won)
 */

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.local");
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const venueArgIdx = args.indexOf("--venue");
const VENUE_FILTER = venueArgIdx >= 0 ? args[venueArgIdx + 1] : null;
const MAX_CYCLES = 26; // safety cap on lookback

const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// ── Per-user decisions (from the operator) ──
// 1. The 3-Day Challenge config is broken (stored single-day). Override its
//    grading to multi-day Tue 4PM -> Fri 2AM and persist schedule_type=multi_day.
const MULTIDAY_FIX_NAMES = new Set(["3-Day Challenge"]);
// 2. Award a real prize (redemption + notification) ONLY for the latest closed
//    cycle of these challenges. All other closed cycles are recorded as history
//    only. Open cycles are left for the Phase 3 finalizer to award on close.
const AWARD_LATEST_CLOSED_NAMES = new Set(["Tuesday Challenge"]);

const PRIZE_LABELS = {
  free_appetizer: "a free appetizer",
  wine_bottle: "a bottle of wine",
  gift_certificate: "a gift certificate",
};

// ── timezone-aware date helpers (ported verbatim from lib/challengeCampaigns.ts) ──
function toLocalParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "0";
  const dowStr = get("weekday").toLowerCase().slice(0, 3);
  const rawHour = parseInt(get("hour"), 10);
  return { dow: Math.max(0, DOW.indexOf(dowStr)), hour: rawHour === 24 ? 0 : rawHour, minute: parseInt(get("minute"), 10) };
}

function localDateTimeToUtc(year, month, day, hour, minute, timezone) {
  const probe = new Date(Date.UTC(year, month, day, hour, minute, 0));
  const { hour: localH, minute: localM } = toLocalParts(probe, timezone);
  let offsetMinutes = (localH * 60 + localM) - (hour * 60 + minute);
  if (offsetMinutes > 12 * 60) offsetMinutes -= 24 * 60;
  if (offsetMinutes < -12 * 60) offsetMinutes += 24 * 60;
  return new Date(probe.getTime() - offsetMinutes * 60 * 1000);
}

function computeCycleStart(campaign, now, timezone) {
  const isRecurring = campaign.recurringType && campaign.recurringType !== "none";
  if (!isRecurring) {
    if (campaign.startDate) {
      const [h, m] = (campaign.startTime ?? "00:00").split(":").map(Number);
      const [y, mo, d] = campaign.startDate.split("-").map(Number);
      return localDateTimeToUtc(y, mo - 1, d, h, m, timezone);
    }
    return new Date(0);
  }
  const startDayKey = campaign.activeDays[0];
  if (!startDayKey) return new Date(0);
  const startDowIndex = DOW.indexOf(startDayKey);
  if (startDowIndex < 0) return new Date(0);
  const [startH, startM] = (campaign.startTime ?? "00:00").split(":").map(Number);
  const { dow: nowDow, hour: nowH, minute: nowM } = toLocalParts(now, timezone);
  const daysFromStart = ((nowDow - startDowIndex) + 7) % 7;
  const minutesFromCycleStart = daysFromStart * 1440 + (nowH * 60 + nowM) - (startH * 60 + startM);
  const daysBack = minutesFromCycleStart < 0 ? daysFromStart + 7 : daysFromStart;
  const localDateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const getP = (type) => localDateParts.find((p) => p.type === type)?.value ?? "1";
  const localNowMs = Date.UTC(parseInt(getP("year")), parseInt(getP("month")) - 1, parseInt(getP("day")));
  const cycleDate = new Date(localNowMs - daysBack * 86400000);
  return localDateTimeToUtc(cycleDate.getUTCFullYear(), cycleDate.getUTCMonth(), cycleDate.getUTCDate(), startH, startM, timezone);
}

function computeCycleEnd(campaign, cycleStart, timezone) {
  const isRecurring = campaign.recurringType && campaign.recurringType !== "none";
  if (!isRecurring) {
    if (campaign.endDate) {
      const [h, m] = (campaign.endTime ?? "23:59").split(":").map(Number);
      const [y, mo, d] = campaign.endDate.split("-").map(Number);
      return localDateTimeToUtc(y, mo - 1, d, h, m, timezone);
    }
    return new Date(8640000000000000);
  }
  const [startH, startM] = (campaign.startTime ?? "00:00").split(":").map(Number);
  const [endH, endM] = (campaign.endTime ?? "23:59").split(":").map(Number);
  const isMultiDay = campaign.scheduleType === "multi_day" || campaign.scheduleType === "one_time";
  if (isMultiDay && campaign.endDay) {
    const startDowIndex = DOW.indexOf(campaign.activeDays[0] ?? "");
    const endDowIndex = DOW.indexOf(campaign.endDay);
    if (startDowIndex >= 0 && endDowIndex >= 0) {
      const daySpan = ((endDowIndex - startDowIndex) + 7) % 7;
      const durationMinutes = (daySpan === 0 ? 7 : daySpan) * 1440 + (endH * 60 + endM) - (startH * 60 + startM);
      return new Date(cycleStart.getTime() + durationMinutes * 60 * 1000);
    }
  }
  const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
  const safeDuration = durationMinutes > 0 ? durationMinutes : durationMinutes + 24 * 60;
  return new Date(cycleStart.getTime() + safeDuration * 60 * 1000);
}

// ── DB row -> campaign shape ──
function mapCampaign(row) {
  const multidayFix = MULTIDAY_FIX_NAMES.has(row.name);
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    venueIds: Array.isArray(row.venue_ids) ? row.venue_ids : [],
    // Honor the config fix: grade the 3-Day challenge as multi_day (Tue->Fri via end_day).
    scheduleType: (multidayFix || row.schedule_type === "multi_day" || row.schedule_type === "one_time") ? "multi_day" : "single_day",
    multidayFix,
    rawScheduleType: row.schedule_type,
    activeDays: Array.isArray(row.active_days) ? row.active_days : [],
    startDate: row.start_date ?? undefined,
    startTime: row.start_time ?? undefined,
    endDay: row.end_day ?? undefined,
    endTime: row.end_time ?? undefined,
    endDate: row.end_date ?? undefined,
    gameTypes: Array.isArray(row.game_types) && row.game_types.length > 0
      ? row.game_types.map(normalizeGameType)
      : ["pickem", "fantasy", "speed-trivia", "live-trivia", "bingo"],
    challengeMode: row.challenge_mode ?? "progress",
    leaderboardTiebreaker: row.leaderboard_tiebreaker ?? "first_to_score",
    pointMultiplier: Math.max(0.001, Number(row.point_multiplier ?? 1)),
    recurringType: row.recurring_type,
    winnerUserId: row.winner_user_id,
    prizeType: row.prize_type,
  };
}
function normalizeGameType(v) {
  const n = String(v ?? "").trim().toLowerCase();
  if (n === "trivia") return "speed-trivia";
  if (n === "live_trivia") return "live-trivia";
  return n;
}

const inc = (base, mult) => Math.max(1, Math.round(base * mult));

async function fetchAll(builder) {
  const out = [];
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const { data, error } = await builder.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function main() {
  // 1. Discover venue(s) + timezone
  let venueQuery = db.from("venues").select("id, name, timezone");
  if (VENUE_FILTER) venueQuery = venueQuery.eq("id", VENUE_FILTER);
  const { data: venues, error: venueErr } = await venueQuery;
  if (venueErr) throw new Error(venueErr.message);
  const venueById = new Map((venues ?? []).map((v) => [v.id, v]));

  // 2. Load recurring leaderboard campaigns
  const { data: campaignRows, error: cErr } = await db
    .from("challenge_campaigns")
    .select("id, created_at, name, venue_ids, schedule_type, active_days, start_date, start_time, end_day, end_time, end_date, game_types, challenge_mode, leaderboard_tiebreaker, point_multiplier, recurring_type, winner_user_id, prize_type");
  if (cErr) throw new Error(cErr.message);

  const campaigns = (campaignRows ?? [])
    .map(mapCampaign)
    .filter((c) => c.challengeMode === "leaderboard" && c.recurringType && c.recurringType !== "none")
    .filter((c) => {
      if (!VENUE_FILTER) return true;
      return (c.venueIds.length === 0) || c.venueIds.includes(VENUE_FILTER);
    });

  if (campaigns.length === 0) {
    console.log("No recurring leaderboard campaigns found for the given filter.");
    return;
  }

  const now = new Date();
  console.log(`\n${"=".repeat(78)}`);
  console.log(`Phase 4 reconstruction — ${APPLY ? "APPLY (will mutate)" : "DRY-RUN (read-only)"} — ${now.toISOString()}`);
  console.log(`${"=".repeat(78)}`);

  // Preload username map (only for venue users we care about)
  const { data: allUsers } = await db.from("users").select("id, username, venue_id");
  const userMap = new Map((allUsers ?? []).map((u) => [u.id, u]));
  const usersByVenue = new Map();
  for (const u of allUsers ?? []) {
    if (!usersByVenue.has(u.venue_id)) usersByVenue.set(u.venue_id, new Set());
    usersByVenue.get(u.venue_id).add(u.id);
  }

  for (const campaign of campaigns) {
    const venueIds = campaign.venueIds.length > 0 ? campaign.venueIds : [...venueById.keys()];
    for (const venueId of venueIds) {
      if (VENUE_FILTER && venueId !== VENUE_FILTER) continue;
      const venue = venueById.get(venueId);
      const tz = venue?.timezone ?? "America/New_York";
      const venueUserIds = usersByVenue.get(venueId) ?? new Set();

      console.log(`\n${"─".repeat(78)}`);
      console.log(`CHALLENGE: "${campaign.name}"  [${campaign.id}]`);
      console.log(`  venue: ${venue?.name ?? venueId} (${venueId})  tz: ${tz}`);
      console.log(`  schedule_type(raw)=${campaign.rawScheduleType} -> ${campaign.scheduleType} | activeDays=[${campaign.activeDays}] endDay=${campaign.endDay ?? "—"}`);
      console.log(`  window: ${campaign.startTime ?? "00:00"}–${campaign.endTime ?? "23:59"} | multiplier=${campaign.pointMultiplier} | games=[${campaign.gameTypes}]`);
      console.log(`  created: ${campaign.createdAt} | winner_user_id=${campaign.winnerUserId ?? "null"}`);

      // Enumerate cycles from now back to created_at
      const createdMs = new Date(campaign.createdAt).getTime();
      const cycles = [];
      let probeStart = computeCycleStart(campaign, now, tz);
      for (let i = 0; i < MAX_CYCLES; i++) {
        if (probeStart.getTime() + 7 * 86400000 < createdMs) break;
        const end = computeCycleEnd(campaign, probeStart, tz);
        cycles.push({ start: new Date(probeStart), end });
        probeStart = new Date(probeStart.getTime() - 7 * 86400000);
      }
      cycles.reverse();

      if (cycles.length === 0) {
        console.log("  (no cycles in range)");
        continue;
      }

      const fmt = (d) => d.toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

      // Latest closed cycle (for targeted prize awarding).
      const closedStartsMs = cycles.filter((c) => now.getTime() > c.end.getTime()).map((c) => c.start.getTime());
      const latestClosedStartMs = closedStartsMs.length > 0 ? Math.max(...closedStartsMs) : null;
      const awardLatestClosed = AWARD_LATEST_CLOSED_NAMES.has(campaign.name);

      if (APPLY) {
        // Persist the 3-Day schedule_type fix so live/future grading is correct.
        if (campaign.multidayFix && campaign.rawScheduleType !== "multi_day") {
          const { error } = await db.from("challenge_campaigns").update({ schedule_type: "multi_day" }).eq("id", campaign.id);
          if (error) throw new Error(`config fix failed: ${error.message}`);
          console.log(`  ✔ config fixed: schedule_type ${campaign.rawScheduleType} -> multi_day`);
        }
        // Remove corrupted cumulative epoch rows for this challenge/venue.
        const epochIso = new Date(0).toISOString();
        const { error: delErr } = await db.from("challenge_campaign_progress")
          .delete().eq("challenge_id", campaign.id).eq("venue_id", venueId).eq("cycle_start", epochIso);
        if (delErr) throw new Error(`epoch cleanup failed: ${delErr.message}`);
      }

      for (const cycle of cycles) {
        const isClosed = now.getTime() > cycle.end.getTime();
        const isCurrent = now.getTime() >= cycle.start.getTime() && now.getTime() <= cycle.end.getTime();
        if (!isClosed && !isCurrent) continue; // future cycle, skip

        const startIso = cycle.start.toISOString();
        const endIso = cycle.end.toISOString();
        const points = new Map(); // userId -> { pts, lastAt }
        const add = (userId, pts, at) => {
          if (!venueUserIds.has(userId)) return;
          const cur = points.get(userId) ?? { pts: 0, lastAt: 0 };
          cur.pts += pts;
          const atMs = new Date(at).getTime();
          if (atMs > cur.lastAt) cur.lastAt = atMs;
          points.set(userId, cur);
        };

        // speed-trivia: trivia_answers (no venue col; filter by venue user set)
        if (campaign.gameTypes.includes("speed-trivia")) {
          const rows = await fetchAll(
            db.from("trivia_answers").select("user_id, answered_at, is_correct")
              .eq("is_correct", true).gte("answered_at", startIso).lt("answered_at", endIso)
          );
          for (const r of rows) add(r.user_id, inc(2, campaign.pointMultiplier), r.answered_at);
        }
        // live-trivia: live_showdown_answers (no venue col)
        if (campaign.gameTypes.includes("live-trivia")) {
          const rows = await fetchAll(
            db.from("live_showdown_answers").select("user_id, answered_at, points_awarded")
              .gt("points_awarded", 0).gte("answered_at", startIso).lt("answered_at", endIso)
          );
          for (const r of rows) add(r.user_id, inc(Number(r.points_awarded), campaign.pointMultiplier), r.answered_at);
        }
        // pickem: claimed won picks, bucket by reward_claimed_at
        if (campaign.gameTypes.includes("pickem")) {
          const rows = await fetchAll(
            db.from("pickem_picks").select("user_id, reward_claimed_at, reward_points, status")
              .eq("venue_id", venueId).eq("status", "won").not("reward_claimed_at", "is", null)
              .gte("reward_claimed_at", startIso).lt("reward_claimed_at", endIso)
          );
          for (const r of rows) add(r.user_id, inc(Number(r.reward_points ?? 0), campaign.pointMultiplier), r.reward_claimed_at);
        }
        // fantasy: claimed entries, bucket by reward_claimed_at
        if (campaign.gameTypes.includes("fantasy")) {
          const rows = await fetchAll(
            db.from("fantasy_entries").select("user_id, reward_claimed_at, reward_points")
              .eq("venue_id", venueId).not("reward_claimed_at", "is", null).gt("reward_points", 0)
              .gte("reward_claimed_at", startIso).lt("reward_claimed_at", endIso)
          );
          for (const r of rows) add(r.user_id, inc(Number(r.reward_points ?? 0), campaign.pointMultiplier), r.reward_claimed_at);
        }
        // bingo: claimed won cards, bucket by reward_claimed_at
        if (campaign.gameTypes.includes("bingo")) {
          const rows = await fetchAll(
            db.from("sports_bingo_cards").select("user_id, reward_claimed_at, reward_points, status")
              .eq("venue_id", venueId).eq("status", "won").not("reward_claimed_at", "is", null)
              .gte("reward_claimed_at", startIso).lt("reward_claimed_at", endIso)
          );
          for (const r of rows) add(r.user_id, inc(Number(r.reward_points ?? 0), campaign.pointMultiplier), r.reward_claimed_at);
        }

        const standings = [...points.entries()]
          .map(([userId, v]) => ({ userId, username: userMap.get(userId)?.username ?? "?", pts: v.pts, lastAt: v.lastAt }))
          .sort((a, b) => b.pts - a.pts || a.lastAt - b.lastAt || a.userId.localeCompare(b.userId));

        const isLatestClosed = isClosed && cycle.start.getTime() === latestClosedStartMs;
        const willAward = isLatestClosed && awardLatestClosed && standings.length > 0;

        const tag = isClosed ? "CLOSED" : "CURRENT";
        console.log(`\n  ▸ Cycle ${fmt(cycle.start)} → ${fmt(cycle.end)}  [${tag}]`);
        if (standings.length === 0) {
          console.log("      (no qualifying points)");
        } else {
          standings.slice(0, 8).forEach((s, i) => {
            let mark = "";
            if (i === 0 && isClosed) mark = willAward ? "  👑 WINNER + PRIZE AWARDED" : "  👑 WINNER (history only)";
            console.log(`      ${String(i + 1).padStart(2)}. ${s.username.padEnd(20)} ${String(s.pts).padStart(6)} pts${mark}`);
          });
          if (standings.length > 8) console.log(`      … +${standings.length - 8} more`);
        }

        if (APPLY) {
          await applyCycle(campaign.id, venueId, startIso, standings);
          if (isClosed && standings.length > 0) {
            await recordCycleWinner(campaign, venueId, startIso, standings[0]);
            if (willAward) {
              await awardPrize(campaign, venueId, startIso, standings[0], now);
            }
          }
        }
      }

      // Show what the corrupted legacy data currently holds for comparison
      const { data: legacy } = await db
        .from("challenge_campaign_progress")
        .select("user_id, points_earned, cycle_start")
        .eq("challenge_id", campaign.id).eq("venue_id", venueId)
        .order("points_earned", { ascending: false });
      const epochRows = (legacy ?? []).filter((r) => new Date(r.cycle_start).getTime() === 0);
      if (epochRows.length > 0) {
        console.log(`\n  ⚠ CURRENT corrupted cumulative rows (cycle_start=epoch), top 5:`);
        epochRows.slice(0, 5).forEach((r) => {
          console.log(`      ${(userMap.get(r.user_id)?.username ?? "?").padEnd(20)} ${String(r.points_earned).padStart(6)} pts  (all-time cumulative)`);
        });
      }
    }
  }

  console.log(`\n${"=".repeat(78)}`);
  console.log(APPLY ? "APPLY complete." : "DRY-RUN complete. Re-run with --apply to write corrected per-cycle data.");
  console.log(`${"=".repeat(78)}\n`);
}

async function applyCycle(challengeId, venueId, cycleStartIso, standings) {
  // Remove any existing progress rows for this challenge+venue+cycle (incl epoch legacy handled separately)
  await db.from("challenge_campaign_progress")
    .delete().eq("challenge_id", challengeId).eq("venue_id", venueId).eq("cycle_start", cycleStartIso);
  if (standings.length === 0) return;
  const inserts = standings.map((s) => ({
    challenge_id: challengeId,
    user_id: s.userId,
    venue_id: venueId,
    cycle_start: cycleStartIso,
    points_earned: s.pts,
    updated_at: new Date(s.lastAt || Date.now()).toISOString(),
  }));
  const { error } = await db.from("challenge_campaign_progress").insert(inserts);
  if (error) throw new Error(`insert progress failed: ${error.message}`);
}

async function recordCycleWinner(campaign, venueId, cycleStartIso, winner) {
  const { error } = await db.from("challenge_cycle_winners").upsert(
    {
      challenge_id: campaign.id,
      cycle_start: cycleStartIso,
      winner_user_id: winner.userId,
      venue_id: venueId,
      points_earned: winner.pts,
      prize_type: campaign.prizeType ?? null,
    },
    { onConflict: "challenge_id,cycle_start" }
  );
  if (error) throw new Error(`upsert cycle winner failed: ${error.message}`);
}

// Issue an actual prize: redemption row (shows in Redeem page) + winner notification.
async function awardPrize(campaign, venueId, cycleStartIso, winner, now) {
  if (!campaign.prizeType) return;
  const prizeExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error: rErr } = await db.from("challenge_campaign_redemptions").upsert(
    {
      challenge_id: campaign.id,
      winner_user_id: winner.userId,
      venue_id: venueId,
      cycle_start: cycleStartIso,
      prize_expires_at: prizeExpiresAt,
    },
    { onConflict: "challenge_id,winner_user_id,cycle_start", ignoreDuplicates: true }
  );
  if (rErr) throw new Error(`award redemption failed: ${rErr.message}`);

  const prizeLabel = PRIZE_LABELS[campaign.prizeType] ?? "a prize";
  const { error: nErr } = await db.from("notifications").insert({
    user_id: winner.userId,
    message: `You won ${prizeLabel} in "${campaign.name}"! Tap here to view your coupon before it expires.`,
    type: "success",
    read: false,
    link_url: "/redeem-prizes",
  });
  if (nErr) throw new Error(`award notification failed: ${nErr.message}`);
  console.log(`      → prize awarded to ${winner.username}: ${prizeLabel} (expires ${prizeExpiresAt.slice(0, 10)})`);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
