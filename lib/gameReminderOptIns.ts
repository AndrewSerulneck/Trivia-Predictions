import "server-only";
import { findUpcomingScheduleOccurrence } from "@/lib/liveShowdownEngine";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// "Remind me" (docs/cancelled-prizes-pick-windows-away-mode-plan.md, Phase C3): the ONLY writer of
// push_game_reminder_optins. Called from POST/DELETE /api/push/game-reminders with the signed session's
// user id, never a client-supplied one. The push itself is sent by lib/push/gameReminders.ts.
//
// A player may ask only for a game at the bar their signed-in profile belongs to (after C1's "open",
// that is the bar on screen), and only for a game that is really on: the server finds the occurrence in
// the live schedule and keys it by the schedule's own occurrence date. Being at the bar is NOT required:
// Remind me is for players who are away (C1).

export type GameReminderOptInResult =
  | { ok: true; occurrenceDate: string; startsAt: string }
  | { ok: false; error: "unavailable" | "wrong_venue" | "no_game" | "write_failed" };

export const OCCURRENCE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isScheduleId = (value: unknown): value is string => typeof value === "string" && UUID_RE.test(value);

export const saveGameReminderOptIn = async (input: {
  userId: string;
  venueId: string;
  scheduleId: string;
  startMs: number;
  nowMs?: number;
}): Promise<GameReminderOptInResult> => {
  const admin = supabaseAdmin;
  if (!admin) return { ok: false, error: "unavailable" };

  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("venue_id")
    .eq("id", input.userId)
    .maybeSingle<{ venue_id: string | null }>();
  if (profileError) return { ok: false, error: "write_failed" };
  if (!profile || profile.venue_id !== input.venueId) return { ok: false, error: "wrong_venue" };

  let occurrence: Awaited<ReturnType<typeof findUpcomingScheduleOccurrence>>;
  try {
    occurrence = await findUpcomingScheduleOccurrence(input.venueId, input.scheduleId, input.startMs, input.nowMs ?? Date.now());
  } catch {
    return { ok: false, error: "write_failed" };
  }
  if (!occurrence) return { ok: false, error: "no_game" };

  const startsAt = new Date(occurrence.startMs).toISOString();
  // Tapping twice is harmless: the second insert is ignored (and a claimed row stays claimed).
  const { error } = await admin.from("push_game_reminder_optins").upsert(
    {
      user_id: input.userId,
      schedule_id: occurrence.scheduleId,
      occurrence_date: occurrence.occurrenceDate,
      venue_id: occurrence.venueId,
      starts_at: startsAt,
    },
    { onConflict: "user_id,schedule_id,occurrence_date", ignoreDuplicates: true },
  );
  if (error) return { ok: false, error: "write_failed" };
  return { ok: true, occurrenceDate: occurrence.occurrenceDate, startsAt };
};

/** Turns a reminder off. Scoped to the session player's own row; removing nothing is still ok. */
export const removeGameReminderOptIn = async (input: {
  userId: string;
  scheduleId: string;
  occurrenceDate: string;
}): Promise<{ ok: boolean }> => {
  const admin = supabaseAdmin;
  if (!admin) return { ok: false };
  const { error } = await admin
    .from("push_game_reminder_optins")
    .delete()
    .eq("user_id", input.userId)
    .eq("schedule_id", input.scheduleId)
    .eq("occurrence_date", input.occurrenceDate);
  return { ok: !error };
};
