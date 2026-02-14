import { NextResponse } from "next/server";
import { getPredictionMarkets } from "@/lib/polymarket";

export async function GET() {
  const markets = await getPredictionMarkets();
  return NextResponse.json({ ok: true, markets });
}
