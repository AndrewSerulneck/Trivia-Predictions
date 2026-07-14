import { NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import {
  OWNER_COMPETITION_CAP_MESSAGE,
  OWNER_COMPETITION_DUPLICATE_MESSAGE,
  OWNER_COMPETITION_UNKNOWN_TEMPLATE_MESSAGE,
  OWNER_COMPETITION_WINDOW_MESSAGE,
  createOwnerCompetition,
  listOwnerCompetitions,
  type OwnerCompetitionPrize,
} from "@/lib/ownerCompetitions";

/** GET /api/owner/competitions?venueId=... — list an owner's competitions for a venue. */
export async function GET(request: Request) {
  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venueId")?.trim() ?? "";
  if (!venueId) {
    return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
  }
  if (!auth.venueIds.includes(venueId)) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this venue." },
      { status: 403 },
    );
  }

  try {
    const competitions = await listOwnerCompetitions(auth.ownerId, venueId);
    return NextResponse.json({ ok: true, competitions });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load competitions." },
      { status: 500 },
    );
  }
}

/** POST /api/owner/competitions — create a competition for a venue the owner controls. */
export async function POST(request: Request) {
  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    venueId?: string;
    templateId?: string;
    title?: string;
    startDate?: string;
    startTime?: string;
    endDate?: string;
    endTime?: string;
    timezone?: string;
    prize?: OwnerCompetitionPrize;
  };

  const venueId = String(body.venueId ?? "").trim();
  const templateId = String(body.templateId ?? "").trim();
  const startDate = String(body.startDate ?? "").trim();
  const startTime = String(body.startTime ?? "").trim();
  const endDate = String(body.endDate ?? "").trim();
  const endTime = String(body.endTime ?? "").trim();
  const timezone = String(body.timezone ?? "America/New_York").trim() || "America/New_York";

  if (!venueId) return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
  if (!templateId) return NextResponse.json({ ok: false, error: "templateId is required." }, { status: 400 });
  if (!startDate || !startTime || !endDate || !endTime) {
    return NextResponse.json({ ok: false, error: "A start and end date/time are required." }, { status: 400 });
  }

  // Venue ownership is enforced before anything touches the engine.
  if (!auth.venueIds.includes(venueId)) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this venue." },
      { status: 403 },
    );
  }

  try {
    const competition = await createOwnerCompetition({
      ownerId: auth.ownerId,
      venueId,
      templateId,
      title: body.title,
      startDate,
      startTime,
      endDate,
      endTime,
      timezone,
      prize: body.prize,
    });
    return NextResponse.json({ ok: true, competition });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create competition.";
    const status =
      message === OWNER_COMPETITION_CAP_MESSAGE || message === OWNER_COMPETITION_DUPLICATE_MESSAGE
        ? 409
        : message === OWNER_COMPETITION_UNKNOWN_TEMPLATE_MESSAGE ||
            message === OWNER_COMPETITION_WINDOW_MESSAGE
          ? 400
          : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
