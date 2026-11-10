import "server-only";
import { findStartingOccurrences } from "@/lib/liveShowdownEngine";
import { chunkIds } from "@/lib/postgrestIds";
import { disablePushDevices } from "@/lib/push/devices";
import { isPushSendingConfigured, sendPushMessages, type PushMessage } from "@/lib/push/fcm";
import { venuePushPath } from "@/lib/pushLanding";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVenueDisplayName } from "@/lib/venueDisplayName";

// "Live Trivia starts soon" (docs/native-app-store-plan.md Phase 5.1). Runs inside the existing 5-minute
// /api/cron/resolve-live-trivia-winners. Each game is pushed ONCE: its push_game_reminders row is claimed
// (insert … on conflict do nothing) before anything is sent, so overlapping or retried runs stay quiet.
// Who hears it: phones whose last-used venue is the game's venue, with "Group games starting" on, seen in
// the last GAME_REMINDER_MAX_IDLE_DAYS.
//
// "Remind me" (away-mode plan, Phase C3) rides the same run: players who tapped it on a game get ONE push
// 1 hour before, on every live phone of their account, whatever their last-used venue. Each opt-in is
// claimed once by the RPC claim_game_reminder_optins (stamps reminded_at) before anything is sent. The
// 30-minute audience above is unchanged, so a player with both may get both.
//
// Cost: push off → nothing. On → one trivia_schedules read per run (the same bounded read the winner
// sweep makes, now looking 1 hour ahead instead of 30 minutes); only when a game is inside 30 minutes: one
// ledger insert, one phone read per 150 venues, one HTTP call per phone; only when a game is inside the
// hour: one claim RPC (an index lookup on that game's unclaimed opt-ins). Category Blitz is not scheduled
// (continuous by default), so it has no reminder.

export const GAME_REMINDER_LEAD_MS = 30 * 60_000;
/** "Remind me" lead time (plan §4 and Q2: 1 hour). */
export const OPT_IN_REMINDER_LEAD_MS = 60 * 60_000;
/** claim_game_reminder_optins raises above 200 games per call (20261109214742_push_game_reminder_optins.sql). */
export const OPT_IN_CLAIM_MAX_GAMES = 200;
export const GAME_REMINDER_MAX_IDLE_DAYS = 60;
export const GAME_REMINDER_TITLE = "Live Trivia starts soon";
export const OPT_IN_REMINDER_TITLE = "Live Trivia reminder";

export type OptInReminderReport = {
  games: number;
  claimed: number;
  sent: number;
  failed: number;
  error?: string;
};

export type GameReminderReport = {
  skipped?: "not-configured" | "unavailable";
  upcoming: number;
  claimed: number;
  sent: number;
  failed: number;
  disabledDevices: number;
  optIn: OptInReminderReport;
};

type StartingOccurrence = Awaited<ReturnType<typeof findStartingOccurrences>>[number];

/**
 * Pure: "8:00 PM at Pacific Street." in the schedule's own timezone. No "Tap to play" (away-mode plan, Phase C2):
 * the phone's last-used bar is not proof the player is there; the tap opens Venue Home, view-only when away.
 */
export const gameReminderBody = (startMs: number, timezone: string, venueName: string | null): string => {
  let time: string;
  try {
    time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(startMs);
  } catch {
    time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(startMs);
  }
  return venueName ? `${time} at ${venueName}.` : `Starts at ${time}.`;
};

export const sendLiveGameStartPushes = async (nowMs: number = Date.now()): Promise<GameReminderReport> => {
  const report: GameReminderReport = {
    upcoming: 0,
    claimed: 0,
    sent: 0,
    failed: 0,
    disabledDevices: 0,
    optIn: { games: 0, claimed: 0, sent: 0, failed: 0 },
  };
  if (!isPushSendingConfigured()) return { ...report, skipped: "not-configured" };
  const admin = supabaseAdmin;
  if (!admin) return { ...report, skipped: "unavailable" };

  // One schedule read covers both audiences.
  const withinHour = await findStartingOccurrences(nowMs, Math.max(GAME_REMINDER_LEAD_MS, OPT_IN_REMINDER_LEAD_MS));
  const upcoming = withinHour.filter((occurrence) => occurrence.startMs - nowMs <= GAME_REMINDER_LEAD_MS);
  report.upcoming = upcoming.length;

  const deadDeviceIds: string[] = [];
  try {
    await sendStartsSoonPushes(upcoming, nowMs, report, deadDeviceIds);
  } finally {
    // The opt-in reminders run even when the 30-minute half threw (each claims its own rows first).
    const optInGames = withinHour.filter((occurrence) => occurrence.startMs - nowMs <= OPT_IN_REMINDER_LEAD_MS);
    report.optIn.games = optInGames.length;
    try {
      await sendOptInReminderPushes(optInGames, report.optIn, deadDeviceIds);
    } catch (error) {
      report.optIn.error = error instanceof Error ? error.message : "Failed to send reminders.";
      console.error("[Push] opt-in-reminders-failed", { message: report.optIn.error });
    }
    await disablePushDevices(deadDeviceIds, "fcm-dead-token");
    report.disabledDevices = new Set(deadDeviceIds).size;
  }

  if (report.upcoming > 0 || report.optIn.games > 0) console.info("[Push] game-reminders", report);
  return report;
};

/** "Live Trivia starts soon": phones whose last-used venue is the game's, once per game (Phase 5.1). */
const sendStartsSoonPushes = async (
  upcoming: StartingOccurrence[],
  nowMs: number,
  report: GameReminderReport,
  deadDeviceIds: string[],
): Promise<void> => {
  const admin = supabaseAdmin;
  if (!admin || upcoming.length === 0) return;

  const { data: claimedRows, error: claimError } = await admin
    .from("push_game_reminders")
    .upsert(
      upcoming.map((occurrence) => ({
        schedule_id: occurrence.scheduleId,
        occurrence_date: occurrence.occurrenceDate,
        venue_id: occurrence.venueId,
        starts_at: new Date(occurrence.startMs).toISOString(),
      })),
      { onConflict: "schedule_id,occurrence_date", ignoreDuplicates: true },
    )
    .select("schedule_id, occurrence_date");
  if (claimError) throw new Error(claimError.message || "Failed to claim game reminders.");

  const claimedKeys = new Set(
    ((claimedRows ?? []) as Array<{ schedule_id: string; occurrence_date: string }>).map(
      (row) => `${row.schedule_id}@${row.occurrence_date}`,
    ),
  );
  const claimed = upcoming.filter((occurrence) => claimedKeys.has(`${occurrence.scheduleId}@${occurrence.occurrenceDate}`));
  report.claimed = claimed.length;
  if (claimed.length === 0) return;

  const venueIds = Array.from(new Set(claimed.map((occurrence) => occurrence.venueId)));
  const seenSinceIso = new Date(nowMs - GAME_REMINDER_MAX_IDLE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const devicesByVenue = new Map<string, Array<{ id: string; token: string }>>();
  for (const chunk of chunkIds(venueIds)) {
    const { data, error } = await admin
      .from("push_devices")
      .select("id, token, venue_id")
      .in("venue_id", chunk)
      .is("disabled_at", null)
      .eq("notify_games", true)
      .gte("last_seen_at", seenSinceIso);
    if (error) throw new Error(error.message || "Failed to load phones for game reminders.");
    for (const row of (data ?? []) as Array<{ id: string; token: string; venue_id: string }>) {
      const list = devicesByVenue.get(row.venue_id) ?? [];
      list.push({ id: row.id, token: row.token });
      devicesByVenue.set(row.venue_id, list);
    }
  }

  const messages: Array<PushMessage & { deviceId: string }> = [];
  for (const occurrence of claimed) {
    const devices = devicesByVenue.get(occurrence.venueId) ?? [];
    if (devices.length === 0) continue;
    const body = gameReminderBody(occurrence.startMs, occurrence.timezone, await getVenueDisplayName(occurrence.venueId));
    const path = venuePushPath(occurrence.venueId, "games");
    for (const device of devices) {
      messages.push({ deviceId: device.id, token: device.token, title: GAME_REMINDER_TITLE, body, path });
    }
  }
  if (messages.length === 0) return;

  const results = await sendPushMessages(messages);
  results.forEach((result, index) => {
    if (result.ok) {
      report.sent += 1;
      return;
    }
    report.failed += 1;
    if (result.dead) deadDeviceIds.push(messages[index].deviceId);
  });
};

type OptInClaimRow = { schedule_id: string; occurrence_date: string; user_id: string; device_id: string; token: string };

/** "Remind me": the phones of players who asked, once per opt-in (Phase C3). */
const sendOptInReminderPushes = async (
  games: StartingOccurrence[],
  report: OptInReminderReport,
  deadDeviceIds: string[],
): Promise<void> => {
  const admin = supabaseAdmin;
  if (!admin || games.length === 0) return;

  // One chunk after another. A failed chunk is recorded and the loop goes on; rows already claimed are still sent.
  const rows: OptInClaimRow[] = [];
  for (const chunk of chunkIds(games, OPT_IN_CLAIM_MAX_GAMES)) {
    const { data, error } = await admin.rpc("claim_game_reminder_optins", {
      p_schedule_ids: chunk.map((occurrence) => occurrence.scheduleId),
      p_occurrence_dates: chunk.map((occurrence) => occurrence.occurrenceDate),
    });
    if (error) {
      report.error = error.message || "Failed to claim reminders.";
      console.error("[Push] opt-in-claim-failed", { message: report.error });
      continue;
    }
    rows.push(...((data ?? []) as OptInClaimRow[]));
  }
  report.claimed = new Set(rows.map((row) => `${row.user_id}@${row.schedule_id}@${row.occurrence_date}`)).size;
  if (rows.length === 0) return;

  const gameByKey = new Map(games.map((occurrence) => [`${occurrence.scheduleId}@${occurrence.occurrenceDate}`, occurrence]));
  const messages: Array<PushMessage & { deviceId: string }> = [];
  const sentTo = new Set<string>();
  for (const row of rows) {
    const occurrence = gameByKey.get(`${row.schedule_id}@${row.occurrence_date}`);
    // One push per phone per game, even when two of the account's profiles asked.
    const dedupeKey = `${row.schedule_id}@${row.occurrence_date}@${row.token}`;
    if (!occurrence || sentTo.has(dedupeKey)) continue;
    sentTo.add(dedupeKey);
    const body = gameReminderBody(occurrence.startMs, occurrence.timezone, await getVenueDisplayName(occurrence.venueId));
    const path = venuePushPath(occurrence.venueId, "games");
    messages.push({ deviceId: row.device_id, token: row.token, title: OPT_IN_REMINDER_TITLE, body, path });
  }
  if (messages.length === 0) return;

  const results = await sendPushMessages(messages);
  results.forEach((result, index) => {
    if (result.ok) {
      report.sent += 1;
      return;
    }
    report.failed += 1;
    if (result.dead) deadDeviceIds.push(messages[index].deviceId);
  });
};
