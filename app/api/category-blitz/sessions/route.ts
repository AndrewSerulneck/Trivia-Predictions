import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { createSession, driveContinuousCategoryBlitz, driveVenueCategoryBlitzWithSchedules, peekCategoryBlitz, registerSessionPresence } from "@/lib/categoryBlitz";
import { resolveContinuousConfig } from "@/lib/categoryBlitzPool";
import { categoryBlitzChannelName } from "@/lib/categoryBlitzShared";
import { resolveCategoryBlitzRoomId } from "@/lib/categoryBlitzRoom";
import { listSchedules, getNextScheduleOccurrence, openScheduleWindowEnd } from "@/lib/categoryBlitzSchedules";
import { isSessionEnforced, readSession } from "@/lib/serverSession";
import { isVenuePresenceLive, isVenuePresenceMutationEnforcementEnabled } from "@/lib/venuePresence";

/**
 * The look-only reply: the room's session (continuous timing merged in, `venueId`
 * concealed as the real venue), the next scheduled window, the realtime channel and
 * whether a round is in play. Reads only; never creates or starts anything. Shared by
 * `peek=1` and the not-at-the-bar branch so the two can't drift.
 */
const buildPeekPayload = async ({ roomId, venueId, now }: { roomId: string; venueId: string; now: Date }) => {
  const peek = await peekCategoryBlitz(roomId, now);
  const nextOcc = peek.continuousConfig ? null : getNextScheduleOccurrence(await listSchedules(roomId), now);
  const session = peek.session
    ? {
        ...peek.session,
        ...(peek.continuousConfig
          ? {
              roundDurationSeconds: peek.continuousConfig.roundDurationSeconds,
              intermissionSeconds: peek.continuousConfig.intermissionSeconds,
            }
          : {}),
        venueId, // concealment, as below
      }
    : null;
  return {
    ok: true as const,
    session,
    nextWindowAt: nextOcc ? nextOcc.windowStart.toISOString() : null,
    realtimeChannel: categoryBlitzChannelName(roomId),
    live: peek.awake,
  };
};

/**
 * GET /api/category-blitz/sessions?venueId=...
 * Returns the active session (or null) plus the next scheduled window open time.
 * nextWindowAt is null when no future window exists. scheduleWindowEndAt is when
 * tonight's open window ends, read from the same schedule list the engine uses
 * (so it follows a partner's mid-game edit); null with no open window, for a
 * manual session (the engine never advances one) and for continuous venues.
 * The letter die reads it to know whether another round follows
 * (anotherRoundFollows, docs/category-blitz-letter-die-plan.md Phase 11.1b).
 * serverReceivedAtMs / serverNowMs are the server's clock as the request came in
 * and as the reply leaves (ms epoch), so the die can measure a late letter on the
 * server's clock, not a phone's, without the engine's work skewing the reading
 * (Phases 12.2a, 13.1b).
 *
 * Always routes through driveVenueCategoryBlitz (not a raw getActiveSession
 * lookup) so it self-heals a stale session AND advances/fires rounds on
 * every poll — this is what makes the game playable without the production
 * cron, which never runs against `next dev` or preview deployments.
 *
 * Continuous venues "sleep when idle" (docs/category-blitz-how-to-play-plan.md
 * Phase 5): this drive is the ONLY thing that starts a continuous round, so
 * only the open game page may call it. Anything that merely looks — venue home,
 * the admin panel — passes `peek=1`, which reads without creating or starting
 * anything and adds `live` (a round is in play or its results are showing).
 * The TV reads through `peekCategoryBlitz` directly (lib/venueScreen.ts).
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

    // The player this poll is for: the signed session's, and only when it matches the claimed userId.
    const requestedUserId = (searchParams.get("userId") ?? "").trim();
    const sessionUserId = readSession(request);
    const resolvedUserId = isSessionEnforced()
      ? sessionUserId && sessionUserId === requestedUserId ? sessionUserId : ""
      : requestedUserId;

    // Starting or waking a round is playing, so it needs the player at the bar like every other write
    // (away-mode plan, Andrew 2026-11-09). With VENUE_PRESENCE_ENFORCEMENT on, a poll from a player who
    // isn't verified there only LOOKS: it sees a round already running but never starts one, and doesn't
    // count toward the room's players. One read-only presence row per poll, no telemetry.
    if (
      searchParams.get("peek") !== "1" &&
      isVenuePresenceMutationEnforcementEnabled() &&
      !(resolvedUserId && (await isVenuePresenceLive({ userId: resolvedUserId, venueId })))
    ) {
      const { live: _live, ...lookOnly } = await buildPeekPayload({ roomId, venueId, now });
      return NextResponse.json({
        ...lookOnly,
        scheduleWindowEndAt: null,
        serverReceivedAtMs: now.getTime(),
        serverNowMs: Date.now(),
      });
    }

    if (searchParams.get("peek") === "1") {
      return NextResponse.json(await buildPeekPayload({ roomId, venueId, now }));
    }

    // Continuous mode is driven by a separate engine and has no schedule
    // windows. resolveContinuousConfig returns null unless continuous mode is
    // active for this venue — either via an override row or, once the rollout
    // flag is on, the global default — so scheduled venues (or explicit
    // opt-outs) take the else branch exactly as before.
    const continuousConfig = await resolveContinuousConfig(roomId);

    let session: Awaited<ReturnType<typeof driveVenueCategoryBlitzWithSchedules>>["session"] = null;
    let nextWindowAt: string | null = null;
    let scheduleWindowEndAt: string | null = null;

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
      // One schedules read per poll: the engine returns the list it decided
      // on, so nextWindowAt and scheduleWindowEndAt can't come from a
      // different read (13.3a). Null only if it stood down before reading.
      const driven = await driveVenueCategoryBlitzWithSchedules(roomId, now, testMode);
      session = driven.session;
      const schedules = driven.schedules ?? (await listSchedules(roomId));
      const nextOcc = getNextScheduleOccurrence(schedules, now);
      nextWindowAt = nextOcc ? nextOcc.windowStart.toISOString() : null;
      if (session?.source === "auto") {
        scheduleWindowEndAt = openScheduleWindowEnd(schedules, now)?.toISOString() ?? null;
      }
    }

    // Best-effort presence registration: records that this user's client is
    // present in the live session so they count toward `playerCount`. Never
    // blocks the response — a failure here shouldn't take down session polling.
    // Registered against the room (session.venueId), so every venue's players
    // pool into one `playerCount` and the min-player scoring gate can clear.
    if (session && session.status !== "complete") {
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

    return NextResponse.json({
      ok: true,
      session,
      nextWindowAt,
      scheduleWindowEndAt,
      realtimeChannel,
      serverReceivedAtMs: now.getTime(),
      serverNowMs: Date.now(),
    });
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
