import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { createSession, driveContinuousCategoryBlitz, driveVenueCategoryBlitz, registerSessionPresence } from "@/lib/categoryBlitz";
import { resolveContinuousConfig } from "@/lib/categoryBlitzPool";
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

    // Continuous mode is driven by a separate engine and has no schedule
    // windows. resolveContinuousConfig returns null unless continuous mode is
    // active for this venue — either via an override row or, once the rollout
    // flag is on, the global default — so scheduled venues (or explicit
    // opt-outs) take the else branch exactly as before.
    const continuousConfig = await resolveContinuousConfig(venueId);

    let session: Awaited<ReturnType<typeof driveVenueCategoryBlitz>> = null;
    let nextWindowAt: string | null = null;

    if (continuousConfig) {
      const continuous = await driveContinuousCategoryBlitz(venueId, now);
      // Attach the venue's configured round/intermission timing so the client
      // countdown ("next round in") anchors on the real continuous cadence
      // rather than the shared scheduled defaults. These are transport-only
      // fields — not persisted session columns.
      session = continuous?.session
        ? {
            ...continuous.session,
            roundDurationSeconds: continuousConfig.roundDurationSeconds,
            intermissionSeconds: continuousConfig.intermissionSeconds,
          }
        : null;
    } else {
      const [scheduledSession, schedules] = await Promise.all([
        driveVenueCategoryBlitz(venueId, now, testMode),
        listSchedules(venueId),
      ]);
      session = scheduledSession;
      const nextOcc = getNextScheduleOccurrence(schedules, now);
      nextWindowAt = nextOcc ? nextOcc.windowStart.toISOString() : null;
    }

    // Best-effort presence registration: records that this user's client is
    // present in the live session so they count toward `playerCount`. Never
    // blocks the response — a failure here shouldn't take down session polling.
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
