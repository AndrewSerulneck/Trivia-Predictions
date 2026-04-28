import { NextResponse } from "next/server";
import { listPickEmSports } from "@/lib/pickem";

export async function GET() {
  try {
    const sports = listPickEmSports();
    return NextResponse.json({ ok: true, sports });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load Pick 'Em sports.",
      },
      { status: 500 }
    );
  }
}
