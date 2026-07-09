import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { createSession, driveVenueCategoryBlitz, registerSessionPresence } from "@/lib/categoryBlitz";
import { listSchedules, getNextScheduleOccurrence } from "@/lib/categoryBlitzSchedules";
import { isSessionEnforced, readSession } from "@/lib/serverSession";

/**
 * GET /api/category-blitz/sessions?venueId=...
 * Returns the active session (or null) plus the next scheduled window open time.
 * nextWindowAt is null when no future window exists.
 *
 * Always routes through driveVenueCategoryBlitz (not a raw getActiveSession
 * lookup) so it self-heals a stale session AND advances/fires rounds on
 * every poll — this is what makes the game playable without the production
 * cron, which never runs against `next dev` or preview deployments.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get("venueId")?.trim() ?? "";
    if (!venueId) {
      return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
    }
    const testMode = searchParams.get("testMode") === "1";

    const now = new Date();

    // Capture the probe timestamp BEFORE driveVenueCategoryBlitz runs, so
    // that if the engine advances a round inside that call (startRound sets
    // started_at ≈ now), this client's first_seen_at is still ≤ the round's
    // started_at. Eliminates the race where registerSessionPresence setting
    // first_seen_at after driveVenueCategoryBlitz would land a few ms after
    // the round's started_at and incorrectly classify a player who was
    // present at round-start as a spectator (see Phase 1 of
    // docs/category-blitz-bugs-timing-fix.md).
    const probeTimestamp = now.toISOString();

    const [session, schedules] = await Promise.all([
      driveVenueCategoryBlitz(venueId, now, testMode),
      listSchedules(venueId),
    ]);
    const nextOcc = getNextScheduleOccurrence(schedules, now);
    const nextWindowAt: string | null = nextOcc ? nextOcc.windowStart.toISOString() : null;

    // Best-effort presence registration: the first time this user's client
    // observes any live session state (lobby onward) becomes their
    // first_seen_at watermark for spectator/player resolution. Never blocks
    // the response — a failure here shouldn't take down session polling.
    // Uses probeTimestamp to ensure first_seen_at is never after a round
    // started in the same request.
    if (session && session.status !== "complete") {
      const requestedUserId = (searchParams.get("userId") ?? "").trim();
      const sessionUserId = readSession(request);
      const resolvedUserId = isSessionEnforced()
        ? sessionUserId && sessionUserId === requestedUserId ? sessionUserId : ""
        : requestedUserId;
      if (resolvedUserId) {
        await registerSessionPresence({
          sessionId: session.id,
          userId: resolvedUserId,
          authId: null,
          venueId,
          observedAt: probeTimestamp,
        }).catch(() => undefined);
      }
    }

    return NextResponse.json({ ok: true, session, nextWindowAt });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load session." },
      { status: 500 }
    );
  }
}

/** POST /api/category-blitz/sessions — create a new lobby session (admin only) */
export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as { venueId?: string };
    const venueId = String(body.venueId ?? "").trim();
    if (!venueId) {
      return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
    }
    const session = await createSession(venueId);
    return NextResponse.json({ ok: true, session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create session.";
    const status = message.includes("already active") ? 409 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
