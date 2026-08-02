import { NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import {
  getVenueGameSettings,
  setVenueNFLPickEmScoringMode,
  type NFLPickEmScoringMode,
} from "@/lib/venueGameSettings";

const isNFLPickEmScoringMode = (value: unknown): value is NFLPickEmScoringMode =>
  value === "standard" || value === "spread";

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
  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    venueId?: string;
    nflPickEmScoringMode?: unknown;
  };

  const venueId = String(body.venueId ?? "").trim();
  if (!venueId) {
    return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
  }
  if (!auth.venueIds.includes(venueId)) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this venue." },
      { status: 403 },
    );
  }
  if (!isNFLPickEmScoringMode(body.nflPickEmScoringMode)) {
    return NextResponse.json(
      { ok: false, error: "nflPickEmScoringMode must be 'standard' or 'spread'." },
      { status: 400 },
    );
  }

  try {
    const settings = await setVenueNFLPickEmScoringMode(venueId, body.nflPickEmScoringMode);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to save game settings." },
      { status: 500 },
    );
  }
}
