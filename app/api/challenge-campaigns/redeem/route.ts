import { NextResponse } from "next/server";
import { claimChallengeCampaignPrize, listChallengeCampaignWinsForUser } from "@/lib/challengeCampaigns";
import { attachSquareDiscountStates } from "@/lib/pos/squareDiscounts";
import { attachSquareGiftCardStates } from "@/lib/pos/squareGiftCards";
import { squareWalletConnectionLoader } from "@/lib/pos/squareWalletConnection";
import { attachRewardWinDescriptions } from "@/lib/rewards";
import { resolveRequestUserId } from "@/lib/serverSession";
import { getVenueDisplayName } from "@/lib/venueDisplayName";

function toClientErrorStatus(message: string): number {
  const normalized = message.toLowerCase();
  if (normalized.includes("required") || normalized.includes("invalid") || normalized.includes("not found") || normalized.includes("only")) {
    return 400;
  }
  return 500;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    // The query's userId is an unverified claim — a player's wallet is theirs alone
    // (docs/reward-live-redemption-plan.md Phase 1).
    const viewer = resolveRequestUserId(request, searchParams.get("userId"));
    if (viewer.forbidden) {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }
    const userId = viewer.userId ?? "";
    const venueId = String(searchParams.get("venueId") ?? "").trim();

    if (!userId || !venueId) {
      return NextResponse.json({ ok: false, error: "userId and venueId are required." }, { status: 400 });
    }

    // Each coupon also says what it was won FOR — see attachRewardWinDescriptions — and, for a
    // gift card at a Square-connected venue, its Square state (attachSquareGiftCardStates), and
    // for a menu-item prize there, whether it has a ready-made Square discount
    // (attachSquareDiscountStates, Phase 2d). Neither queries anything while
    // NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED is off.
    // Both Square steps share one loader, so the venue's pos_connections row is read at most once
    // per wallet load — and not at all when neither step has a coupon to act on.
    const loadSquareConnection = squareWalletConnectionLoader(venueId);
    const [wins, venueName] = await Promise.all([
      listChallengeCampaignWinsForUser({ userId, venueId })
        .then((rows) => attachRewardWinDescriptions(rows, venueId))
        .then((rows) => attachSquareGiftCardStates(rows, venueId, loadSquareConnection))
        .then((rows) => attachSquareDiscountStates(rows, venueId, loadSquareConnection)),
      getVenueDisplayName(venueId),
    ]);
    // `serverNowMs` + `venueName` feed the live coupon (docs/reward-live-redemption-plan.md
    // Phase 2): the phone shows the SERVER's time, so a wrong phone clock never looks fake.
    return NextResponse.json({ ok: true, wins, serverNowMs: Date.now(), venueName });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load redeemable challenge wins.";
    return NextResponse.json({ ok: false, error: message }, { status: toClientErrorStatus(message) });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      userId?: string;
      venueId?: string;
      challengeId?: string;
      cycleStart?: string;
    } | null;

    const actor = resolveRequestUserId(request, body?.userId);
    if (actor.forbidden) {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }
    const userId = actor.userId ?? "";
    const venueId = String(body?.venueId ?? "").trim();
    const challengeId = String(body?.challengeId ?? "").trim();
    const cycleStart = String(body?.cycleStart ?? "").trim() || undefined;

    if (!userId || !venueId || !challengeId) {
      return NextResponse.json({ ok: false, error: "userId, venueId, and challengeId are required." }, { status: 400 });
    }

    const result = await claimChallengeCampaignPrize({ userId, venueId, challengeId, cycleStart });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to claim challenge prize.";
    return NextResponse.json({ ok: false, error: message }, { status: toClientErrorStatus(message) });
  }
}
