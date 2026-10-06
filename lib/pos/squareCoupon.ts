import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// What the two guest-facing Square paths share (docs/square-review-fixes-plan.md R3 #7): the gift
// card (lib/pos/squareGiftCards.ts) and the menu-item discount (lib/pos/squareDiscounts.ts) both
// start by loading the guest's own coupon. One loader means "whose coupon is this?" has one answer.

export type SquareCouponFailCode =
  | "not_eligible"
  | "not_found"
  | "already_redeemed"
  | "expired"
  | "unavailable"
  | "square_error";

export type SquareCouponFailure = { ok: false; code: SquareCouponFailCode; message: string };

/** A failed result. Both paths' result types are this shape plus their own success branch. */
export const squareFail = (code: SquareCouponFailCode, message: string): SquareCouponFailure => ({
  ok: false,
  code,
  message,
});

export const NO_PRIZE_MESSAGE = "No prize found.";

/** The columns every coupon read must include for the ownership check. */
type OwnedCouponBase = { winner_user_id: string; venue_id: string };

/**
 * Read one coupon and prove it belongs to this guest at this venue.
 *
 * `not_found` covers a missing coupon, a malformed id (`22P02`) and — deliberately
 * indistinguishable from them — someone else's coupon. `unavailable` is any other read failure
 * (logged as `[PosSquare] <readFailedLog>`). `columns` must include `winner_user_id` and
 * `venue_id`. Expiry and redeemed checks stay with each caller: their order differs per path.
 */
export const loadOwnedCoupon = async <T extends OwnedCouponBase>(params: {
  userId: string;
  venueId: string;
  redemptionId: string;
  columns: string;
  readFailedLog: string;
}): Promise<{ ok: true; coupon: T } | { ok: false; code: "not_found" | "unavailable" }> => {
  if (!supabaseAdmin) return { ok: false, code: "unavailable" };
  const { data: coupon, error } = await supabaseAdmin
    .from("challenge_campaign_redemptions")
    .select(params.columns)
    .eq("id", params.redemptionId)
    .maybeSingle<T>();
  if (error) {
    // A malformed id (not a uuid) can't name anyone's coupon.
    if (String(error.code) === "22P02") return { ok: false, code: "not_found" };
    console.error(`[PosSquare] ${params.readFailedLog}`, error.message);
    return { ok: false, code: "unavailable" };
  }
  // Someone else's coupon reads exactly like a missing one.
  if (!coupon || coupon.winner_user_id !== params.userId || coupon.venue_id !== params.venueId) {
    return { ok: false, code: "not_found" };
  }
  return { ok: true, coupon };
};

/** True when the coupon has an expiry that has passed. */
export const isCouponExpired = (coupon: { prize_expires_at: string | null }): boolean =>
  Boolean(coupon.prize_expires_at && new Date(coupon.prize_expires_at).getTime() <= Date.now());
