import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getVenueGameSettings, readGameSettingsChanges, updateVenueGameSettings } from "@/lib/venueGameSettings";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venueId")?.trim() ?? "";
  if (!venueId) {
    return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
  }

  try {
    const settings = await getVenueGameSettings(venueId);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load game settings." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    venueId?: string;
    nflPickEmScoringMode?: unknown;
    cfbPickEmScoringMode?: unknown;
    pickWindows?: unknown;
  };

  const venueId = String(body.venueId ?? "").trim();
  if (!venueId) {
    return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
  }
  const changes = readGameSettingsChanges(body);
  if (!changes) {
    return NextResponse.json(
      { ok: false, error: "Send nflPickEmScoringMode or cfbPickEmScoringMode ('standard' or 'spread'), or valid pickWindows." },
      { status: 400 },
    );
  }

  try {
    const settings = await updateVenueGameSettings(venueId, changes);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to save game settings." },
      { status: 500 },
    );
  }
}
