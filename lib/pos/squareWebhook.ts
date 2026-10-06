import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { PrizeRedeemUnavailableError, redeemChallengePrize } from "@/lib/challengeCampaigns";
import { squareEnvironment } from "@/lib/pos/squareConfig";
import { markSquareMerchantRevoked } from "@/lib/pos/squareConnection";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Square webhook: signature check + gift card activity recording
// (docs/pos-rewards-integration-plan.md Phase 2) + OAuth revocations (Phase 2c).
//
// Subscribe the Square app to `gift_card.activity.created`. Square sends it for EVERY gift
// card activity at every merchant that connected our app — including the partner's own gift
// card sales — so most events are not ours: one indexed ledger lookup by gift card id, a
// one-line log, 200. For our cards we keep the last-known balance and activity on the ledger
// row (the prize wallet's "Used" badge and Phase 5's partner report read it).
//
// The coupon itself is already redeemed by the time a card can be spent — the claim happens
// before the card is funded (lib/pos/squareGiftCards.ts). If a REDEEM ever arrives for a card
// whose coupon is somehow unclaimed, we claim it here through the same once-only RPC as a
// backstop (plan §4 Phase 2), and log it loudly because it means a bug.

/**
 * Square signs HMAC-SHA256(signature key, notification URL + raw body), base64, in the
 * `x-square-hmacsha256-signature` header. Constant-time compare.
 */
export const verifySquareSignature = (input: {
  rawBody: string;
  signatureHeader: string | null;
  signatureKey: string;
  notificationUrl: string;
}): boolean => {
  if (!input.signatureHeader) return false;
  const expected = createHmac("sha256", input.signatureKey)
    .update(input.notificationUrl + input.rawBody)
    .digest("base64");
  const left = Buffer.from(expected);
  const right = Buffer.from(input.signatureHeader.trim());
  return left.length === right.length && timingSafeEqual(left, right);
};

export type SquareGiftCardActivity = {
  id?: string;
  type?: string;
  gift_card_id?: string;
  created_at?: string;
  gift_card_balance_money?: { amount?: number };
  redeem_activity_details?: { amount_money?: { amount?: number } };
};

type LedgerRow = {
  id: string;
  redemption_id: string | null;
  external_detail: Record<string, unknown> | null;
};

export type RecordActivityResult =
  | { ok: true; matched: false }
  | { ok: true; matched: true; skipped?: "stale" }
  | { ok: false };

/** Record one activity. `ok: false` = a database failure; the route answers 500 so Square retries. */
export const recordSquareGiftCardActivity = async (activity: SquareGiftCardActivity): Promise<RecordActivityResult> => {
  if (!supabaseAdmin) return { ok: false };
  const giftCardId = String(activity.gift_card_id ?? "").trim();
  if (!giftCardId) return { ok: true, matched: false };

  const { data: row, error } = await supabaseAdmin
    .from("pos_reward_applications")
    .select("id, redemption_id, external_detail")
    .eq("provider", "square")
    .eq("action", "apply")
    .eq("external_ref", giftCardId)
    .maybeSingle<LedgerRow>();
  if (error) {
    console.error("[PosSquare] webhook-ledger-read-failed", error.message);
    return { ok: false };
  }
  if (!row) return { ok: true, matched: false };

  const detail = row.external_detail ?? {};
  // Square retries and doesn't guarantee order: never let an older event overwrite a newer one.
  const lastAt = typeof detail.last_activity_at === "string" ? Date.parse(detail.last_activity_at) : Number.NaN;
  const thisAt = activity.created_at ? Date.parse(activity.created_at) : Number.NaN;
  if (Number.isFinite(lastAt) && Number.isFinite(thisAt) && thisAt < lastAt) {
    return { ok: true, matched: true, skipped: "stale" };
  }
  if (detail.last_activity_id && detail.last_activity_id === activity.id) {
    return { ok: true, matched: true, skipped: "stale" };
  }

  const next: Record<string, unknown> = {
    ...detail,
    last_activity_id: activity.id ?? null,
    last_activity_type: activity.type ?? null,
    last_activity_at: activity.created_at ?? new Date().toISOString(),
  };
  if (typeof activity.gift_card_balance_money?.amount === "number") {
    next.balance_cents = activity.gift_card_balance_money.amount;
  }
  if (activity.type === "REDEEM" && !detail.first_redeemed_at) {
    next.first_redeemed_at = activity.created_at ?? new Date().toISOString();
  }

  const { error: updateError } = await supabaseAdmin
    .from("pos_reward_applications")
    .update({ external_detail: next, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (updateError) {
    console.error("[PosSquare] webhook-ledger-update-failed", updateError.message);
    return { ok: false };
  }

  if (activity.type === "REDEEM" && row.redemption_id) {
    await claimIfUnclaimed(row.redemption_id);
  }
  return { ok: true, matched: true };
};

const claimIfUnclaimed = async (redemptionId: string): Promise<void> => {
  const { data: coupon } = await supabaseAdmin!
    .from("challenge_campaign_redemptions")
    .select("challenge_id, winner_user_id, venue_id, prize_redeemed_at")
    .eq("id", redemptionId)
    .maybeSingle<{ challenge_id: string | null; winner_user_id: string; venue_id: string; prize_redeemed_at: string | null }>();
  if (!coupon || coupon.prize_redeemed_at || !coupon.challenge_id) return;
  console.error("[PosSquare] webhook-redeem-on-unclaimed-coupon", { redemptionId });
  try {
    await redeemChallengePrize({
      userId: coupon.winner_user_id,
      venueId: coupon.venue_id,
      challengeId: coupon.challenge_id,
      redemptionId,
      method: "pos_square",
    });
  } catch (error) {
    // Expired / not found: the card was still spent at Square; the ledger already records it.
    if (!(error instanceof PrizeRedeemUnavailableError)) return;
    console.error("[PosSquare] webhook-backstop-claim-unavailable", { redemptionId });
  }
};

export type SquareRevocationEvent = {
  merchant_id?: string;
  created_at?: string;
  data?: { object?: { revocation?: { revoked_at?: string; revoker_type?: string } } };
};

export type RecordRevocationResult =
  | { ok: true; changed: number; skipped?: "no_merchant" | "no_environment" | "no_time" }
  | { ok: false };

/**
 * `oauth.authorization.revoked` (Phase 2c): our access to a merchant ended — the partner removed
 * our app in Square, Square did, or our own Disconnect's RevokeToken did. Matches that merchant's
 * live rows in THIS server's Square environment that were connected before the revocation
 * (lib/pos/squareConnection.ts markSquareMerchantRevoked). Our own Disconnect already marked its
 * row revoked, so the usual case is a no-op. Square sends nanosecond timestamps; Date.parse
 * reads them (to the millisecond).
 */
export const recordSquareRevocation = async (event: SquareRevocationEvent): Promise<RecordRevocationResult> => {
  const merchantId = String(event.merchant_id ?? "").trim();
  if (!merchantId) return { ok: true, changed: 0, skipped: "no_merchant" };
  const environment = squareEnvironment();
  if (!environment) return { ok: true, changed: 0, skipped: "no_environment" };
  const revocation = event.data?.object?.revocation;
  const whenMs = Date.parse(revocation?.revoked_at ?? event.created_at ?? "");
  if (!Number.isFinite(whenMs)) return { ok: true, changed: 0, skipped: "no_time" };
  return markSquareMerchantRevoked({
    merchantId,
    environment,
    revokedAt: new Date(whenMs).toISOString(),
    revokerType: revocation?.revoker_type ?? null,
  });
};
