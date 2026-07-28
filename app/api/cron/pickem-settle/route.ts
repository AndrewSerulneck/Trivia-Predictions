import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { accrueNFLPickEmChallengePoints, type NFLPickEmAccrualReport } from "@/lib/nflPickEmRewardAccrual";
import { settlePendingPickEmPicks } from "@/lib/pickem";

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  try {
    const result = await settlePendingPickEmPicks();
    // NFL-only second pass: feed the picks that just settled into the
    // challenge-campaign engine so points-target NFL rewards can be won
    // (lib/nflPickEmRewardAccrual.ts). Idempotent and independent of the sweep
    // above, so a failure here must NOT report settlement as failed — the picks
    // are already settled and the next run re-accrues them.
    let nflRewardAccrual: NFLPickEmAccrualReport | null = null;
    let nflRewardAccrualError: string | null = null;
    try {
      nflRewardAccrual = await accrueNFLPickEmChallengePoints();
    } catch (error) {
      nflRewardAccrualError =
        error instanceof Error ? error.message : "NFL Pick 'Em reward accrual failed.";
    }
    return NextResponse.json({ ok: true, result, nflRewardAccrual, nflRewardAccrualError });
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
