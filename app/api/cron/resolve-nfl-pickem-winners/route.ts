import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { resolveNFLPickEmWinnerRewards } from "@/lib/nflPickEmWinnerRewards";

// Awards NFL Pick 'Em week-winner rewards ("most correct picks") for NFL weeks
// whose games have all finished. Nothing emits a "week is over" event, so this
// sweep is what closes a contest out. Resolution is idempotent (see
// lib/nflPickEmWinnerRewards.ts), so the daily schedule in vercel.json is safe to
// re-run and a missed run self-heals on the next one.

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  try {
    const report = await resolveNFLPickEmWinnerRewards(Date.now());
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed to resolve NFL Pick 'Em week winners.",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
