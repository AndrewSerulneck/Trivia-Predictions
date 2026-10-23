import "server-only";
import { findStartingOccurrences } from "@/lib/liveShowdownEngine";
import { chunkIds } from "@/lib/postgrestIds";
import { disablePushDevices } from "@/lib/push/devices";
import { isPushSendingConfigured, sendPushMessages, type PushMessage } from "@/lib/push/fcm";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVenueDisplayName } from "@/lib/venueDisplayName";

// "Live Trivia starts soon" (docs/native-app-store-plan.md Phase 5.1). Runs inside the existing 5-minute
// /api/cron/resolve-live-trivia-winners. Each game is pushed ONCE: its push_game_reminders row is claimed
// (insert … on conflict do nothing) before anything is sent, so overlapping or retried runs stay quiet.
// Who hears it: phones whose last-used venue is the game's venue, with "Live games starting" on, seen in
// the last GAME_REMINDER_MAX_IDLE_DAYS.
//
// Cost: push off → nothing. On → one trivia_schedules read per run (the same bounded read the winner
// sweep makes); only when a game is inside the window: one ledger insert, one phone read per 150 venues,
// one HTTP call per phone. Category Blitz is not scheduled (continuous by default), so it has no reminder.

export const GAME_REMINDER_LEAD_MS = 30 * 60_000;
export const GAME_REMINDER_MAX_IDLE_DAYS = 60;
export const GAME_REMINDER_TITLE = "Live Trivia starts soon";

export type GameReminderReport = {
  skipped?: "not-configured" | "unavailable";
  upcoming: number;
  claimed: number;
  sent: number;
  failed: number;
  disabledDevices: number;
};

/** Pure: "8:00 PM at Pacific Street. Tap to play." in the schedule's own timezone. */
export const gameReminderBody = (startMs: number, timezone: string, venueName: string | null): string => {
  let time: string;
  try {
    time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(startMs);
  } catch {
    time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(startMs);
  }
  return venueName ? `${time} at ${venueName}. Tap to play.` : `Starts at ${time}. Tap to play.`;
};

export const sendLiveGameStartPushes = async (nowMs: number = Date.now()): Promise<GameReminderReport> => {
  const report: GameReminderReport = { upcoming: 0, claimed: 0, sent: 0, failed: 0, disabledDevices: 0 };
  if (!isPushSendingConfigured()) return { ...report, skipped: "not-configured" };
  const admin = supabaseAdmin;
  if (!admin) return { ...report, skipped: "unavailable" };

  const upcoming = await findStartingOccurrences(nowMs, GAME_REMINDER_LEAD_MS);
  report.upcoming = upcoming.length;
  if (upcoming.length === 0) return report;

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
  if (claimed.length === 0) return report;

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
    const path = `/venue/${encodeURIComponent(occurrence.venueId)}`;
    for (const device of devices) {
      messages.push({ deviceId: device.id, token: device.token, title: GAME_REMINDER_TITLE, body, path });
    }
  }
  if (messages.length === 0) return report;

  const results = await sendPushMessages(messages);
  const deadDeviceIds: string[] = [];
  results.forEach((result, index) => {
    if (result.ok) {
      report.sent += 1;
      return;
    }
    report.failed += 1;
    if (result.dead) deadDeviceIds.push(messages[index].deviceId);
  });
  await disablePushDevices(deadDeviceIds, "fcm-dead-token");
  report.disabledDevices = new Set(deadDeviceIds).size;

  console.info("[Push] game-reminders", report);
  return report;
};
