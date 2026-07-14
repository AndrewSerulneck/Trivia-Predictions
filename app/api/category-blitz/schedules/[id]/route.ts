import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { datetimeLocalValueToUtcIso } from "@/lib/categoryBlitzScheduleTime";
import { deleteSchedule, getSchedule, updateSchedule } from "@/lib/categoryBlitzSchedules";
import { abandonVenueAutoSession, endVenueAutoSession } from "@/lib/categoryBlitz";

function isValidationError(message: string): boolean {
  return (
    message === "A valid start date and time are required." ||
    message === "A valid start and end date/time are required." ||
    message === "End date/time must be after the start date/time." ||
    message === "recurringType must be none, daily, or weekly." ||
    message === "Select at least one day for weekly recurring schedules." ||
    message === "recurringDays must contain valid weekday keys."
  );
}

function recurringDaysKey(days: string[] | undefined): string {
  return [...(days ?? [])].sort().join(",");
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
      recurringType?: string;
      recurringDays?: string[];
    };

    const title     = String(body.title ?? "").trim();
    const startTime = String(body.startTime ?? "").trim();
    const endTime   = String(body.endTime ?? "").trim();
    const timezone  = String(body.timezone ?? "America/New_York").trim();

    if (!title)     return NextResponse.json({ ok: false, error: "title is required." }, { status: 400 });
    if (!startTime) return NextResponse.json({ ok: false, error: "startTime is required." }, { status: 400 });
    if (!endTime)   return NextResponse.json({ ok: false, error: "endTime is required." }, { status: 400 });

    // Look up the current schedule so we can compare old timing/recurrence
    // semantics against the updated row. Title-only edits keep the session.
    const current = await getSchedule(id);
    if (!current) {
      return NextResponse.json({ ok: false, error: "Schedule not found." }, { status: 404 });
    }

    const nextRecurringType = body.recurringType ?? current.recurringType;
    const nextRecurringDays =
      body.recurringType === undefined && body.recurringDays === undefined
        ? current.recurringDays
        : body.recurringDays;

    const schedule = await updateSchedule(id, {
      title,
      startTime: datetimeLocalValueToUtcIso(startTime, timezone),
      endTime: datetimeLocalValueToUtcIso(endTime, timezone),
      timezone,
      recurringType: nextRecurringType,
      recurringDays: nextRecurringDays,
    });

    // If timing or recurrence changed, end any active auto session so the next
    // client poll creates a fresh session from the updated schedule instead of
    // continuing on an obsolete window/cadence.
    const scheduleSemanticsChanged =
      current.startTime !== schedule.startTime ||
      current.endTime !== schedule.endTime ||
      current.timezone !== schedule.timezone ||
      current.recurringType !== schedule.recurringType ||
      recurringDaysKey(current.recurringDays) !== recurringDaysKey(schedule.recurringDays);

    if (scheduleSemanticsChanged) {
      await endVenueAutoSession(schedule.venueId);
    }

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
    const venueId = await deleteSchedule(id);

    // Abandon (don't gracefully end) any active auto session so players drop
    // back to the lobby instead of a Game Over screen — deleting a schedule
    // discards the running game rather than finishing it.
    if (venueId) {
      await abandonVenueAutoSession(venueId);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete schedule." },
      { status: 500 }
    );
  }
}
