import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { createSession, driveVenueCategoryBlitz } from "@/lib/categoryBlitz";
import { listSchedules, getNextScheduleOccurrence } from "@/lib/categoryBlitzSchedules";

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

    const now = new Date();
    const [session, schedules] = await Promise.all([
      driveVenueCategoryBlitz(venueId, now),
      listSchedules(venueId),
    ]);
    const nextOcc = getNextScheduleOccurrence(schedules, now);
    const nextWindowAt: string | null = nextOcc ? nextOcc.windowStart.toISOString() : null;

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
