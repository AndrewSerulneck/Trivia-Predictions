import { NextResponse } from "next/server";
import { autoSettleResolvedPredictionMarkets } from "@/lib/admin";
import { isCronAuthorized } from "@/lib/cronAuth";

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  try {
    const result = await autoSettleResolvedPredictionMarkets();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Cron settlement failed." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
