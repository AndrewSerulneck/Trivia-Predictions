import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { listSchedules, createSchedule } from "@/lib/scategoriesSchedules";
import type { ScategoriesRecurringType } from "@/types";

const VALID_RECURRING: ScategoriesRecurringType[] = ["none", "daily", "weekly"];
const VALID_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** GET /api/scategories/schedules?venueId=... — list schedules for a venue */
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

/** POST /api/scategories/schedules — create a schedule (admin only) */
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
      timezone?: string;
      recurringType?: string;
      recurringDays?: string[];
      windowMinutes?: number;
    };

    const venueId       = String(body.venueId ?? "").trim();
    const title         = String(body.title ?? "").trim();
    const startTime     = String(body.startTime ?? "").trim();
    const timezone      = String(body.timezone ?? "America/New_York").trim();
    const recurringType = String(body.recurringType ?? "none").trim() as ScategoriesRecurringType;
    const recurringDays = (Array.isArray(body.recurringDays) ? body.recurringDays : [])
      .map((d) => String(d).toLowerCase().trim())
      .filter((d) => VALID_DAYS.includes(d));
    const windowMinutes = Math.max(30, Math.min(720, Number(body.windowMinutes ?? 240)));

    if (!venueId)   return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
    if (!title)     return NextResponse.json({ ok: false, error: "title is required." }, { status: 400 });
    if (!startTime) return NextResponse.json({ ok: false, error: "startTime is required." }, { status: 400 });
    if (!VALID_RECURRING.includes(recurringType)) {
      return NextResponse.json({ ok: false, error: "Invalid recurringType." }, { status: 400 });
    }
    if (recurringType === "weekly" && recurringDays.length === 0) {
      return NextResponse.json({ ok: false, error: "recurringDays required for weekly schedule." }, { status: 400 });
    }

    const schedule = await createSchedule({
      venueId, title, startTime, timezone, recurringType, recurringDays, windowMinutes,
    });
    return NextResponse.json({ ok: true, schedule });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create schedule." },
      { status: 500 }
    );
  }
}
