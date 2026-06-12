import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createNotification } from "@/lib/notifications";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const bearer = request.headers.get("authorization") ?? "";
    if (bearer.toLowerCase() === `bearer ${secret.toLowerCase()}`) return true;
    return (request.headers.get("x-cron-secret") ?? "") === secret;
  }
  return false;
}

type RedemptionWarningRow = {
  winner_user_id: string;
  challenge_id: string;
};

type CampaignNameRow = {
  id: string;
  name: string;
};

async function sendExpiryWarnings(): Promise<{ twoDayCount: number; oneDayCount: number }> {
  if (!supabaseAdmin) return { twoDayCount: 0, oneDayCount: 0 };

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const nowIso = now.toISOString();

  // Find prizes expiring between 24h–48h from now (2-day warning not yet sent)
  const { data: twoDayRows } = await supabaseAdmin
    .from("challenge_campaign_redemptions")
    .select("winner_user_id, challenge_id")
    .gt("prize_expires_at", in24h)
    .lte("prize_expires_at", in48h)
    .is("prize_redeemed_at", null)
    .is("expiry_2d_notified_at", null)
    .returns<RedemptionWarningRow[]>();

  // Find prizes expiring within the next 24h (1-day warning not yet sent)
  const { data: oneDayRows } = await supabaseAdmin
    .from("challenge_campaign_redemptions")
    .select("winner_user_id, challenge_id")
    .gt("prize_expires_at", nowIso)
    .lte("prize_expires_at", in24h)
    .is("prize_redeemed_at", null)
    .is("expiry_1d_notified_at", null)
    .returns<RedemptionWarningRow[]>();

  const allRows = [...(twoDayRows ?? []), ...(oneDayRows ?? [])];
  if (allRows.length === 0) return { twoDayCount: 0, oneDayCount: 0 };

  // Batch-fetch campaign names
  const campaignIds = Array.from(new Set(allRows.map((r) => r.challenge_id)));
  const { data: campaigns } = await supabaseAdmin
    .from("challenge_campaigns")
    .select("id, name")
    .in("id", campaignIds)
    .returns<CampaignNameRow[]>();

  const nameById = new Map((campaigns ?? []).map((c) => [c.id, c.name]));
  const stampIso = new Date().toISOString();

  let twoDayCount = 0;
  let oneDayCount = 0;

  for (const row of twoDayRows ?? []) {
    const name = nameById.get(row.challenge_id) ?? "a challenge";
    await createNotification({
      userId: row.winner_user_id,
      message: `Your prize from "${name}" expires in 2 days! Tap here to redeem it.`,
      type: "warning",
      linkUrl: "/redeem-prizes",
    });
    await supabaseAdmin
      .from("challenge_campaign_redemptions")
      .update({ expiry_2d_notified_at: stampIso })
      .eq("challenge_id", row.challenge_id)
      .eq("winner_user_id", row.winner_user_id);
    twoDayCount++;
  }

  for (const row of oneDayRows ?? []) {
    const name = nameById.get(row.challenge_id) ?? "a challenge";
    await createNotification({
      userId: row.winner_user_id,
      message: `Your prize from "${name}" expires today! Tap here to redeem it before it's gone.`,
      type: "warning",
      linkUrl: "/redeem-prizes",
    });
    await supabaseAdmin
      .from("challenge_campaign_redemptions")
      .update({ expiry_1d_notified_at: stampIso })
      .eq("challenge_id", row.challenge_id)
      .eq("winner_user_id", row.winner_user_id);
    oneDayCount++;
  }

  return { twoDayCount, oneDayCount };
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }
  try {
    const result = await sendExpiryWarnings();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Prize expiry warning cron failed." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
