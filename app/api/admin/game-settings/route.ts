import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  getVenueGameSettings,
  setVenueNFLPickEmScoringMode,
  type NFLPickEmScoringMode,
} from "@/lib/venueGameSettings";

const isNFLPickEmScoringMode = (value: unknown): value is NFLPickEmScoringMode =>
  value === "standard" || value === "spread";

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
  };

  const venueId = String(body.venueId ?? "").trim();
  if (!venueId) {
    return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
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
