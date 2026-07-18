import { NextResponse } from "next/server";
import { datetimeLocalValueToUtcIso } from "@/lib/categoryBlitzScheduleTime";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import {
  OWNER_SCHEDULE_INVALID_RECURRENCE_MESSAGE,
  OWNER_SCHEDULE_OVERLAP_MESSAGE,
  OWNER_SCHEDULE_WEEKLY_DAYS_REQUIRED_MESSAGE,
  deleteOwnerSchedule,
  getOwnerSchedule,
  ownsVenue,
  updateOwnerSchedule,
} from "@/lib/ownerSchedule";

function isTimeValidationError(message: string): boolean {
  return (
    message === "A valid start and end date/time are required." ||
    message === "End date/time must be after the start date/time."
  );
}

function isRecurrenceValidationError(message: string): boolean {
  return (
    message === OWNER_SCHEDULE_WEEKLY_DAYS_REQUIRED_MESSAGE ||
    message === OWNER_SCHEDULE_INVALID_RECURRENCE_MESSAGE
  );
}

/** Coerce an untrusted body value into a clean string[] of weekday keys. */
function parseRecurringDays(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry ?? "").trim().toLowerCase()).filter(Boolean);
}

/** DELETE /api/owner/schedule/[id] — remove a schedule the owner controls. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  try {
    const { id } = await params;

    // Resolve the schedule first so we can enforce venue ownership before
    // deleting anything. A missing schedule is a 404; one the owner doesn't own
    // is a 403 (and we never reveal it exists via a different code path).
    const schedule = await getOwnerSchedule(id);
    if (!schedule) {
      return NextResponse.json({ ok: false, error: "Schedule not found." }, { status: 404 });
    }
    if (!ownsVenue(auth, schedule.venueId)) {
      return NextResponse.json(
        { ok: false, error: "You do not have access to this venue." },
        { status: 403 },
      );
    }

    await deleteOwnerSchedule(schedule);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete schedule." },
      { status: 500 },
    );
  }
}

/** PATCH /api/owner/schedule/[id] — edit a schedule the owner controls. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  const { id } = await params;

  // Resolve the schedule first so we can enforce venue ownership before
  // touching anything, and so gameType is always taken from the existing row
  // rather than trusted from client input.
  const schedule = await getOwnerSchedule(id);
  if (!schedule) {
    return NextResponse.json({ ok: false, error: "Schedule not found." }, { status: 404 });
  }
  if (!ownsVenue(auth, schedule.venueId)) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this venue." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    startTime?: string;
    endTime?: string;
    timezone?: string;
    rounds?: number;
    recurringType?: string;
    recurringDays?: unknown;
  };

  const title = String(body.title ?? "").trim();
  const startTime = String(body.startTime ?? "").trim();
  const endTime = String(body.endTime ?? "").trim();
  const timezone = String(body.timezone ?? schedule.timezone).trim() || schedule.timezone;
  const rounds = Math.max(1, Math.floor(Number(body.rounds)) || 1);
  const recurringType = String(body.recurringType ?? "none").trim().toLowerCase();
  const recurringDays = parseRecurringDays(body.recurringDays);

  if (!title) return NextResponse.json({ ok: false, error: "title is required." }, { status: 400 });
  if (!startTime) return NextResponse.json({ ok: false, error: "startTime is required." }, { status: 400 });
  if (!endTime) return NextResponse.json({ ok: false, error: "endTime is required." }, { status: 400 });

  try {
    const updated = await updateOwnerSchedule({
      id,
      venueId: schedule.venueId,
      title,
      startTimeIso: datetimeLocalValueToUtcIso(startTime, timezone),
      endTimeIso: datetimeLocalValueToUtcIso(endTime, timezone),
      timezone,
      gameType: schedule.gameType,
      rounds,
      recurringType,
      recurringDays,
    });
    return NextResponse.json({ ok: true, schedule: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update schedule.";
    const status =
      message === OWNER_SCHEDULE_OVERLAP_MESSAGE
        ? 409
        : isTimeValidationError(message) || isRecurrenceValidationError(message)
          ? 400
          : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
