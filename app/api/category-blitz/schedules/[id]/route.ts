import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { datetimeLocalValueToUtcIso } from "@/lib/categoryBlitzScheduleTime";
import { deleteSchedule, updateSchedule } from "@/lib/categoryBlitzSchedules";

function isValidationError(message: string): boolean {
  return (
    message === "A valid start date and time are required." ||
    message === "A valid start and end date/time are required." ||
    message === "End date/time must be after the start date/time."
  );
}

/** PATCH /api/category-blitz/schedules/[id] — update a schedule (admin only) */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const body = (await request.json()) as {
      title?: string;
      startTime?: string;
      endTime?: string;
      timezone?: string;
    };

    const title     = String(body.title ?? "").trim();
    const startTime = String(body.startTime ?? "").trim();
    const endTime   = String(body.endTime ?? "").trim();
    const timezone  = String(body.timezone ?? "America/New_York").trim();

    if (!title)     return NextResponse.json({ ok: false, error: "title is required." }, { status: 400 });
    if (!startTime) return NextResponse.json({ ok: false, error: "startTime is required." }, { status: 400 });
    if (!endTime)   return NextResponse.json({ ok: false, error: "endTime is required." }, { status: 400 });

    const schedule = await updateSchedule(id, {
      title,
      startTime: datetimeLocalValueToUtcIso(startTime, timezone),
      endTime: datetimeLocalValueToUtcIso(endTime, timezone),
      timezone,
    });
    return NextResponse.json({ ok: true, schedule });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update schedule.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: isValidationError(message) ? 400 : 500 }
    );
  }
}

/** DELETE /api/category-blitz/schedules/[id] — soft-delete a schedule (admin only) */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    await deleteSchedule(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete schedule." },
      { status: 500 }
    );
  }
}
