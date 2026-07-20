import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { createSession, driveContinuousCategoryBlitz, driveVenueCategoryBlitz, registerSessionPresence } from "@/lib/categoryBlitz";
import { resolveContinuousConfig } from "@/lib/categoryBlitzPool";
import { categoryBlitzChannelName } from "@/lib/categoryBlitzShared";
import { resolveCategoryBlitzRoomId } from "@/lib/categoryBlitzRoom";
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

    // Gameplay-scoping room: with the global-room flag off this is `venueId`
    // (today's per-venue isolation); with it on, every venue collapses onto one
    // shared hidden room so rounds always have enough players. The mapping is
    // confined to the gameplay drive/read/presence calls below — the caller's
    // real `venueId` is still what the response reports (see the remap before
    // the return) so the frontend never learns the room is shared.
    const roomId = resolveCategoryBlitzRoomId(venueId);

    const now = new Date();

    // Continuous mode is driven by a separate engine and has no schedule
    // windows. resolveContinuousConfig returns null unless continuous mode is
    // active for this venue — either via an override row or, once the rollout
    // flag is on, the global default — so scheduled venues (or explicit
    // opt-outs) take the else branch exactly as before.
    const continuousConfig = await resolveContinuousConfig(roomId);

    let session: Awaited<ReturnType<typeof driveVenueCategoryBlitz>> = null;
    let nextWindowAt: string | null = null;

    if (continuousConfig) {
      const continuous = await driveContinuousCategoryBlitz(roomId, now);
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
        driveVenueCategoryBlitz(roomId, now, testMode),
        listSchedules(roomId),
      ]);
      session = scheduledSession;
      const nextOcc = getNextScheduleOccurrence(schedules, now);
      nextWindowAt = nextOcc ? nextOcc.windowStart.toISOString() : null;
    }

    // Best-effort presence registration: records that this user's client is
    // present in the live session so they count toward `playerCount`. Never
    // blocks the response — a failure here shouldn't take down session polling.
    // Registered against the room (session.venueId), so every venue's players
    // pool into one `playerCount` and the min-player scoring gate can clear.
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
          venueId: roomId,
        }).catch(() => undefined);
      }
    }

    // The channel all players in this room subscribe to for live round events.
    // Server-provided (rather than derived client-side from venueId) so the
    // shared-room mapping stays server-only: under pooling every venue gets the
    // room's channel here, but the client only ever sees an opaque channel
    // string, never the resolveCategoryBlitzRoomId logic. Flag off => this is
    // byte-for-byte the venue's own channel, identical to prior behavior.
    const realtimeChannel = categoryBlitzChannelName(roomId);

    // Concealment: report the caller's real venue back, never the room id, so
    // nothing in the response payload exposes that venues share a session.
    if (session) session = { ...session, venueId };

    return NextResponse.json({ ok: true, session, nextWindowAt, realtimeChannel });
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
    // Manual session creation lands in the shared room when pooling is on, so an
    // admin-started session is the same one every venue's players see. Response
    // reports the caller's real venue (concealment), matching the GET handler.
    const roomId = resolveCategoryBlitzRoomId(venueId);
    const created = await createSession(roomId);
    const session = { ...created, venueId };
    return NextResponse.json({ ok: true, session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create session.";
    const status = message.includes("already active") ? 409 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
