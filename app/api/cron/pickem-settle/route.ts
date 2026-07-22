import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { settlePendingPickEmPicks } from "@/lib/pickem";

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  try {
    const result = await settlePendingPickEmPicks();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Pick 'Em cron settlement failed.",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
