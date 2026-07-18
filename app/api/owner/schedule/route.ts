import { NextResponse } from "next/server";
import { datetimeLocalValueToUtcIso } from "@/lib/categoryBlitzScheduleTime";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import {
  DEFAULT_OWNER_SCHEDULE_GAME_TYPE,
  OWNER_SCHEDULE_INVALID_RECURRENCE_MESSAGE,
  OWNER_SCHEDULE_OVERLAP_MESSAGE,
  OWNER_SCHEDULE_UNSUPPORTED_GAME_MESSAGE,
  OWNER_SCHEDULE_WEEKLY_DAYS_REQUIRED_MESSAGE,
  createOwnerSchedule,
  isKnownGameType,
  isSupportedGameType,
  listOwnerSchedules,
  ownsVenue,
} from "@/lib/ownerSchedule";
import type { OwnerScheduleGameType } from "@/types";

function isTimeValidationError(message: string): boolean {
  return (
    message === "A valid start date and time are required." ||
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

/** GET /api/owner/schedule?venueId=...&gameType=... — list a venue's schedules (owner-scoped). */
export async function GET(request: Request) {
  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venueId")?.trim() ?? "";
  // No (or "all") gameType → merged calendar across both engines. A specific
  // value scopes the list to that engine and must be a known type.
  const gameTypeRaw = searchParams.get("gameType")?.trim() ?? "";
  const gameTypeFilter: OwnerScheduleGameType | undefined =
    gameTypeRaw && gameTypeRaw !== "all" ? (gameTypeRaw as OwnerScheduleGameType) : undefined;

  if (!venueId) {
    return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
  }
  if (gameTypeFilter && !isKnownGameType(gameTypeFilter)) {
    return NextResponse.json({ ok: false, error: "Invalid gameType." }, { status: 400 });
  }
  if (!ownsVenue(auth, venueId)) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this venue." },
      { status: 403 },
    );
  }

  try {
    const schedules = await listOwnerSchedules(venueId, gameTypeFilter);
    return NextResponse.json({ ok: true, schedules });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load schedules." },
      { status: 500 },
    );
  }
}

/** POST /api/owner/schedule — create a schedule for a venue the owner controls. */
export async function POST(request: Request) {
  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    venueId?: string;
    title?: string;
    startTime?: string;
    endTime?: string;
    timezone?: string;
    gameType?: string;
    rounds?: number;
    recurringType?: string;
    recurringDays?: unknown;
  };

  const venueId = String(body.venueId ?? "").trim();
  const title = String(body.title ?? "").trim();
  const startTime = String(body.startTime ?? "").trim();
  const endTime = String(body.endTime ?? "").trim();
  const timezone = String(body.timezone ?? "America/New_York").trim() || "America/New_York";
  const gameTypeRaw = String(body.gameType ?? DEFAULT_OWNER_SCHEDULE_GAME_TYPE).trim();
  const rounds = Math.max(1, Math.floor(Number(body.rounds)) || 1);
  const recurringType = String(body.recurringType ?? "none").trim().toLowerCase();
  const recurringDays = parseRecurringDays(body.recurringDays);

  if (!venueId) return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
  if (!title) return NextResponse.json({ ok: false, error: "title is required." }, { status: 400 });
  if (!startTime) return NextResponse.json({ ok: false, error: "startTime is required." }, { status: 400 });
  if (!endTime) return NextResponse.json({ ok: false, error: "endTime is required." }, { status: 400 });

  if (!isKnownGameType(gameTypeRaw)) {
    return NextResponse.json({ ok: false, error: "Invalid gameType." }, { status: 400 });
  }
  // Venue ownership is enforced before anything else touches the engine.
  if (!ownsVenue(auth, venueId)) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this venue." },
      { status: 403 },
    );
  }
  if (!isSupportedGameType(gameTypeRaw)) {
    return NextResponse.json(
      { ok: false, error: OWNER_SCHEDULE_UNSUPPORTED_GAME_MESSAGE },
      { status: 400 },
    );
  }

  try {
    const schedule = await createOwnerSchedule({
      venueId,
      title,
      startTimeIso: datetimeLocalValueToUtcIso(startTime, timezone),
      endTimeIso: datetimeLocalValueToUtcIso(endTime, timezone),
      timezone,
      gameType: gameTypeRaw,
      rounds,
      recurringType,
      recurringDays,
    });
    return NextResponse.json({ ok: true, schedule });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create schedule.";
    const status =
      message === OWNER_SCHEDULE_OVERLAP_MESSAGE
        ? 409
        : message === OWNER_SCHEDULE_UNSUPPORTED_GAME_MESSAGE
          ? 400
          : isTimeValidationError(message) || isRecurrenceValidationError(message)
            ? 400
            : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
