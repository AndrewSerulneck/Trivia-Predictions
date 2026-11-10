import { NextResponse } from "next/server";
import {
  isScheduleId,
  OCCURRENCE_DATE_RE,
  removeGameReminderOptIn,
  saveGameReminderOptIn,
} from "@/lib/gameReminderOptIns";
import { isSessionEnforced, resolveRequestUserId } from "@/lib/serverSession";

// "Remind me" on the next Live Trivia game (docs/cancelled-prizes-pick-windows-away-mode-plan.md, Phase C3).
//   POST   { venueId, scheduleId, startsAt, userId? } → { ok, occurrenceDate, startsAt }
//   DELETE { scheduleId, occurrenceDate, userId? }    → { ok }
//
// The player is the SIGNED tp_sess session's (resolveRequestUserId; a different body userId is 403). No
// location check on purpose: Remind me is for players away from the bar (Phase C1); it changes nothing
// in any game. Refuses outright (503) without SESSION_SECRET: the local dev server shares the production
// database, so an unverified claim must never write a real player's reminder.

type ReminderBody = {
  venueId?: unknown;
  scheduleId?: unknown;
  startsAt?: unknown;
  occurrenceDate?: unknown;
  userId?: unknown;
};

const NO_STORE = { "Cache-Control": "no-store" };

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

const authenticate = async (
  request: Request,
): Promise<{ body: ReminderBody; userId: string } | { response: NextResponse }> => {
  if (!isSessionEnforced()) {
    console.error("[Push] session-not-enforced");
    return { response: json({ ok: false, error: "Reminders are unavailable right now." }, 503) };
  }
  const body = (await request.json().catch(() => ({}))) as ReminderBody;
  const claimed = typeof body.userId === "string" ? body.userId : null;
  const { userId, forbidden } = resolveRequestUserId(request, claimed);
  if (forbidden) return { response: json({ ok: false, error: "Forbidden." }, 403) };
  if (!userId) return { response: json({ ok: false, error: "Please sign in again." }, 401) };
  return { body, userId };
};

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if ("response" in auth) return auth.response;
  const { body, userId } = auth;

  const venueId = typeof body.venueId === "string" ? body.venueId.trim() : "";
  const startMs = typeof body.startsAt === "string" ? Date.parse(body.startsAt) : Number.NaN;
  if (!venueId || venueId.length > 128 || !isScheduleId(body.scheduleId) || !Number.isFinite(startMs)) {
    return json({ ok: false, error: "Invalid game." }, 400);
  }

  const result = await saveGameReminderOptIn({ userId, venueId, scheduleId: body.scheduleId, startMs });
  if (result.ok) return json({ ok: true, occurrenceDate: result.occurrenceDate, startsAt: result.startsAt });
  if (result.error === "wrong_venue") return json({ ok: false, error: "Forbidden." }, 403);
  if (result.error === "no_game") return json({ ok: false, error: "This game has changed." }, 409);
  console.error("[Push] game-reminder-save-failed", { error: result.error });
  return json({ ok: false, error: "Couldn't save that." }, 500);
}

export async function DELETE(request: Request) {
  const auth = await authenticate(request);
  if ("response" in auth) return auth.response;
  const { body, userId } = auth;

  const occurrenceDate = typeof body.occurrenceDate === "string" ? body.occurrenceDate : "";
  if (!isScheduleId(body.scheduleId) || !OCCURRENCE_DATE_RE.test(occurrenceDate)) {
    return json({ ok: false, error: "Invalid game." }, 400);
  }
  const result = await removeGameReminderOptIn({ userId, scheduleId: body.scheduleId, occurrenceDate });
  if (!result.ok) console.error("[Push] game-reminder-remove-failed");
  return json({ ok: result.ok }, result.ok ? 200 : 500);
}
