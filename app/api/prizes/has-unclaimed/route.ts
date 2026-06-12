import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = String(searchParams.get("userId") ?? "").trim();
    const venueId = String(searchParams.get("venueId") ?? "").trim();

    if (!userId || !venueId || !supabaseAdmin) {
      return NextResponse.json({ ok: true, hasUnclaimed: false });
    }

    const now = new Date().toISOString();

    const [challengeResult, weeklyResult] = await Promise.all([
      supabaseAdmin
        .from("challenge_campaign_redemptions")
        .select("challenge_id", { count: "exact", head: true })
        .eq("winner_user_id", userId)
        .is("prize_redeemed_at", null)
        .not("prize_expires_at", "is", null)
        .gt("prize_expires_at", now),
      supabaseAdmin
        .from("prize_wins")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("venue_id", venueId)
        .eq("status", "awarded"),
    ]);

    const hasUnclaimed =
      (challengeResult.count ?? 0) > 0 || (weeklyResult.count ?? 0) > 0;

    return NextResponse.json({ ok: true, hasUnclaimed });
  } catch {
    return NextResponse.json({ ok: true, hasUnclaimed: false });
  }
}
