import { NextResponse } from "next/server";
import { resolveGameWinnerRewards } from "@/lib/liveTriviaWinnerRewards";

// Awards "winner of the game" rewards for Live Trivia occurrences that have
// finished. Live Trivia has no game-over event, so this sweep is what closes out
// a game. Resolution is idempotent (see lib/liveTriviaWinnerRewards.ts), so
// running every minute is safe and a missed run self-heals on the next sweep.

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const bearer = request.headers.get("authorization") ?? "";
    if (bearer.toLowerCase() === `bearer ${secret.toLowerCase()}`) {
      return true;
    }

    const headerSecret = request.headers.get("x-cron-secret") ?? "";
    return headerSecret === secret;
  }

  return Boolean(request.headers.get("x-vercel-cron"));
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  try {
    const report = await resolveGameWinnerRewards(Date.now());
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to resolve game winners.",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
