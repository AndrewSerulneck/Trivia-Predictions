import { NextResponse } from "next/server";
import { datetimeLocalValueToUtcIso } from "@/lib/categoryBlitzScheduleTime";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import {
  OWNER_SCHEDULE_INVALID_RECURRENCE_MESSAGE,
  OWNER_SCHEDULE_WEEKLY_DAYS_REQUIRED_MESSAGE,
  getOwnerSchedule,
  ownsVenue,
  previewOwnerScheduleChangeNotice,
} from "@/lib/ownerSchedule";
import type { OwnerSchedule } from "@/types";

// The prize warning shown BEFORE a partner confirms (docs/cancelled-prizes-pick-windows-away-mode-plan.md
// Phase A3). GET = cancelling this game; POST = saving an edit (same body as PATCH /api/owner/schedule/[id]).
// A dry run: nothing is written and nothing is paid. `notice` is null when no prize would end or shrink.

type Resolved = { schedule: OwnerSchedule } | { response: Response };

/** Owner auth, then the schedule, then venue ownership — before any prize is read. */
const resolveOwnedSchedule = async (request: Request, params: Promise<{ id: string }>): Promise<Resolved> => {
  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return { response: response as Response };
  }
  const { id } = await params;
  const schedule = await getOwnerSchedule(id);
  if (!schedule) {
    return { response: NextResponse.json({ ok: false, error: "Schedule not found." }, { status: 404 }) };
  }
  if (!ownsVenue(auth, schedule.venueId)) {
    return {
      response: NextResponse.json({ ok: false, error: "You do not have access to this venue." }, { status: 403 }),
    };
  }
  return { schedule };
};

const failed = (error: unknown) => {
  const message = error instanceof Error ? error.message : "Failed to check prizes.";
  const status =
    message === OWNER_SCHEDULE_WEEKLY_DAYS_REQUIRED_MESSAGE ||
    message === OWNER_SCHEDULE_INVALID_RECURRENCE_MESSAGE ||
    message === "A valid start date/time is required."
      ? 400
      : 500;
  return NextResponse.json({ ok: false, error: message }, { status });
};

/** GET /api/owner/schedule/[id]/cancel-impact — prizes cancelling this game would end. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolved = await resolveOwnedSchedule(request, params);
    if ("response" in resolved) return resolved.response;
    return NextResponse.json({ ok: true, notice: await previewOwnerScheduleChangeNotice(resolved.schedule) });
  } catch (error) {
    return failed(error);
  }
}

/** POST /api/owner/schedule/[id]/cancel-impact — prizes this edit would end or shrink. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolved = await resolveOwnedSchedule(request, params);
    if ("response" in resolved) return resolved.response;
    const { schedule } = resolved;

    const body = (await request.json().catch(() => ({}))) as {
      startTime?: string;
      timezone?: string;
      rounds?: number;
      recurringType?: string;
      recurringDays?: unknown;
    };
    const startTime = String(body.startTime ?? "").trim();
    const timezone = String(body.timezone ?? schedule.timezone).trim() || schedule.timezone;
    let startTimeIso: string;
    try {
      startTimeIso = datetimeLocalValueToUtcIso(startTime, timezone);
    } catch {
      throw new Error("A valid start date/time is required.");
    }
    if (!startTime || !Number.isFinite(Date.parse(startTimeIso))) {
      throw new Error("A valid start date/time is required.");
    }
    const recurringDays = Array.isArray(body.recurringDays)
      ? body.recurringDays.map((day) => String(day ?? "").trim().toLowerCase()).filter(Boolean)
      : [];

    const notice = await previewOwnerScheduleChangeNotice(schedule, {
      startTimeIso,
      timezone,
      rounds: Number(body.rounds),
      recurringType: String(body.recurringType ?? "none").trim().toLowerCase(),
      recurringDays,
    });
    return NextResponse.json({ ok: true, notice });
  } catch (error) {
    return failed(error);
  }
}
