import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { datetimeLocalValueToUtcIso } from "@/lib/categoryBlitzScheduleTime";
import { listSchedules, createSchedule } from "@/lib/categoryBlitzSchedules";

function isValidationError(message: string): boolean {
  return (
    message === "A valid start date and time are required." ||
    message === "A valid start and end date/time are required." ||
    message === "End date/time must be after the start date/time."
  );
}

/** GET /api/category-blitz/schedules?venueId=... — list schedules for a venue */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get("venueId")?.trim() ?? "";
    if (!venueId) {
      return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
    }
    const schedules = await listSchedules(venueId);
    return NextResponse.json({ ok: true, schedules });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load schedules." },
      { status: 500 }
    );
  }
}

/** POST /api/category-blitz/schedules — create a schedule (admin only) */
export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as {
      venueId?: string;
      title?: string;
      startTime?: string;
      endTime?: string;
      timezone?: string;
    };

    const venueId   = String(body.venueId ?? "").trim();
    const title     = String(body.title ?? "").trim();
    const startTime = String(body.startTime ?? "").trim();
    const endTime   = String(body.endTime ?? "").trim();
    const timezone  = String(body.timezone ?? "America/New_York").trim();

    if (!venueId)   return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
    if (!title)     return NextResponse.json({ ok: false, error: "title is required." }, { status: 400 });
    if (!startTime) return NextResponse.json({ ok: false, error: "startTime is required." }, { status: 400 });
    if (!endTime)   return NextResponse.json({ ok: false, error: "endTime is required." }, { status: 400 });

    const schedule = await createSchedule({
      venueId,
      title,
      startTime: datetimeLocalValueToUtcIso(startTime, timezone),
      endTime: datetimeLocalValueToUtcIso(endTime, timezone),
      timezone,
    });
    return NextResponse.json({ ok: true, schedule });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create schedule.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: isValidationError(message) ? 400 : 500 }
    );
  }
}
