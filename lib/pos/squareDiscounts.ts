import "server-only";
import { randomUUID } from "node:crypto";
import { resolveRewardPrize, type RewardPrizeSourceRow } from "@/lib/challengeCampaigns";
import { isPosIntegrationsEnabled } from "@/lib/pos/providers";
import { createSquareDiscount, findSquareDiscountByName } from "@/lib/pos/square";
import { hasSquareMenuPrizeScopes, isSquareConfigured, squareAppConfig } from "@/lib/pos/squareConfig";
import { loadSquareCredentials } from "@/lib/pos/squareConnection";
import { squareDiscountSpec } from "@/lib/pos/squareDiscountSpec";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ChallengeCampaignWin } from "@/types";

// Menu-item prizes as ready-made Square discounts (docs/pos-rewards-integration-plan.md Phase 2d;
// Andrew 2026-10-06 chose "Preset discount per prize").
//
// When a guest opens a menu-item coupon at a Square-connected venue, the coupon asks
// (POST /api/prizes/square-discount) for the Square discount that matches the prize —
// "Hightop prize: 50% off Appetizer (max $12)" (lib/pos/squareDiscountSpec.ts). We search the
// partner's catalog for that exact name and create it when it isn't there (first use, or the
// partner deleted it). Staff tap it in Square; Square does the math and the cap; then staff tap
// "Confirm Redemption" on the coupon exactly as before. The coupon is redeemed only by that
// tap, through the once-only redeem RPC — this file never redeems anything and writes nothing
// to our database. Nothing is stored: the name is the identity.
//
// Cost (plan §3 "no polling"): per coupon open, 1 coupon read + at most 1 campaign read +
// 1 connection read, and 1 Square search; plus 1 Square create the first time a prize's terms
// are used at a merchant (or after the partner deletes it). Rate-limited per guest by the route.
// The wallet list adds 1 indexed connection read, and only when it holds a menu-item coupon.

type CouponRow = RewardPrizeSourceRow & {
  id: string;
  challenge_id: string | null;
  winner_user_id: string;
  venue_id: string;
  prize_redeemed_at: string | null;
  prize_expires_at: string | null;
  prize_pos_value_cents: number | null;
};

const COUPON_COLUMNS =
  "id, challenge_id, winner_user_id, venue_id, prize_redeemed_at, prize_expires_at, prize_type, prize_kind, prize_menu_item, prize_menu_item_name, prize_discount_kind, prize_discount_value, prize_pos_value_cents";

type CampaignPrizeRow = RewardPrizeSourceRow & { prize_pos_value_cents: number | null };

const CAMPAIGN_PRIZE_COLUMNS =
  "prize_type, prize_kind, prize_menu_item, prize_menu_item_name, prize_discount_kind, prize_discount_value, prize_pos_value_cents";

export type SquarePrizeDiscountResult =
  | { ok: true; discount: { name: string } }
  | {
      ok: false;
      code: "not_eligible" | "not_found" | "already_redeemed" | "expired" | "unavailable" | "square_error";
      message: string;
    };

const fail = (
  code: Extract<SquarePrizeDiscountResult, { ok: false }>["code"],
  message: string,
): SquarePrizeDiscountResult => ({ ok: false, code, message });

const SQUARE_ERROR_MESSAGE = "Couldn't reach Square right now. Staff can still take the prize off by hand.";

/**
 * The prize as the guest sees it: the LIVE reward's terms while it exists (that is what the
 * wallet shows, lib/challengeCampaigns.ts listChallengeCampaignWinsForUser), else the coupon's
 * award-time snapshot. A failed campaign read falls back to the snapshot too.
 */
const couponPrize = async (coupon: CouponRow) => {
  let source: CampaignPrizeRow = coupon;
  if (coupon.challenge_id) {
    const { data } = await supabaseAdmin!
      .from("challenge_campaigns")
      .select(CAMPAIGN_PRIZE_COLUMNS)
      .eq("id", coupon.challenge_id)
      .maybeSingle<CampaignPrizeRow>();
    if (data) source = data;
  }
  return { ...resolveRewardPrize(source), prizePosValueCents: source.prize_pos_value_cents ?? null };
};

/**
 * Find (or create) the Square discount for this guest's menu-item coupon and return its name for
 * staff. `userId` must already be bound to the signed session by the route.
 */
export const ensureSquarePrizeDiscount = async (params: {
  userId: string;
  venueId: string;
  redemptionId: string;
}): Promise<SquarePrizeDiscountResult> => {
  if (!isPosIntegrationsEnabled() || !isSquareConfigured()) {
    return fail("not_eligible", "Square discounts aren't available here.");
  }
  if (!supabaseAdmin) return fail("unavailable", SQUARE_ERROR_MESSAGE);
  const { userId, venueId, redemptionId } = params;

  const { data: coupon, error: couponError } = await supabaseAdmin
    .from("challenge_campaign_redemptions")
    .select(COUPON_COLUMNS)
    .eq("id", redemptionId)
    .maybeSingle<CouponRow>();
  if (couponError) {
    // A malformed id (not a uuid) can't name anyone's coupon.
    if (String(couponError.code) === "22P02") return fail("not_found", "No prize found.");
    console.error("[PosSquare] discount-coupon-read-failed", couponError.message);
    return fail("unavailable", SQUARE_ERROR_MESSAGE);
  }
  // Someone else's coupon reads exactly like a missing one.
  if (!coupon || coupon.winner_user_id !== userId || coupon.venue_id !== venueId) {
    return fail("not_found", "No prize found.");
  }
  if (coupon.prize_redeemed_at) return fail("already_redeemed", "This prize was already redeemed.");
  if (coupon.prize_expires_at && new Date(coupon.prize_expires_at).getTime() <= Date.now()) {
    return fail("expired", "This prize has expired.");
  }

  const spec = squareDiscountSpec(await couponPrize(coupon));
  if (!spec) return fail("not_eligible", "This prize doesn't use a Square discount.");

  const creds = await loadSquareCredentials(venueId);
  if (!creds.ok) {
    return creds.reason === "unavailable"
      ? fail("unavailable", SQUARE_ERROR_MESSAGE)
      : fail("not_eligible", "This venue isn't taking Square discounts right now.");
  }
  const credentials = creds.credentials;
  // Connected before Phase 2d: the partner hasn't granted the catalog scopes yet.
  if (!hasSquareMenuPrizeScopes(credentials.scopes)) {
    return fail("not_eligible", "This venue isn't taking Square discounts right now.");
  }

  const found = await findSquareDiscountByName(credentials, spec.name);
  if (found && "ok" in found) {
    console.error("[PosSquare] discount-search-failed", { connectionId: credentials.connectionId, code: found.code });
    return fail("square_error", SQUARE_ERROR_MESSAGE);
  }
  if (found) return { ok: true, discount: { name: found.name } };

  // A fresh key per attempt: replaying one after the partner deleted the discount would hand
  // back the deleted object. Two guests opening the same NEW prize at the same instant can
  // create two identical discounts — harmless, staff tap either.
  const created = await createSquareDiscount(credentials, spec, `hightop-discount-${randomUUID()}`);
  if ("ok" in created) {
    console.error("[PosSquare] discount-create-failed", { connectionId: credentials.connectionId, code: created.code });
    return fail("square_error", SQUARE_ERROR_MESSAGE);
  }
  console.info("[PosSquare] discount-created", { connectionId: credentials.connectionId, kind: spec.kind, capped: spec.maxCents !== null });
  return { ok: true, discount: { name: created.name } };
};

/**
 * Tag each unredeemed, unexpired menu-item coupon that can become a Square discount with
 * `squareDiscount: true`, when this venue's Square connection is active, has a location, was
 * made in this server's Square environment, and granted the catalog scopes. The coupon then
 * asks for the discount's name when it opens. Everything else is left untouched.
 *
 * Cost: zero queries while the flag is off or there is no such coupon; otherwise one indexed
 * pos_connections read. No Square call.
 */
export const attachSquareDiscountStates = async (
  wins: ChallengeCampaignWin[],
  venueId: string,
): Promise<ChallengeCampaignWin[]> => {
  const config = squareAppConfig();
  if (!isPosIntegrationsEnabled() || !config || !supabaseAdmin) return wins;
  const nowMs = Date.now();
  const candidates = new Set(
    wins
      .filter(
        (win) =>
          win.redemptionId &&
          !win.prizeRedeemedAt &&
          (!win.prizeExpiresAt || new Date(win.prizeExpiresAt).getTime() > nowMs) &&
          // The cap doesn't decide whether a prize CAN be a discount, only its name.
          squareDiscountSpec({
            prizeKind: win.prizeKind ?? null,
            prizeMenuItem: win.prizeMenuItem ?? null,
            prizeMenuItemName: win.prizeMenuItemName ?? null,
            prizeDiscountKind: win.prizeDiscountKind ?? null,
            prizeDiscountValue: win.prizeDiscountValue ?? null,
            prizePosValueCents: null,
          }) !== null,
      )
      .map((win) => win.redemptionId as string),
  );
  if (candidates.size === 0) return wins;

  const { data: connection, error } = await supabaseAdmin
    .from("pos_connections")
    .select("id, location_id, scopes")
    .eq("venue_id", venueId)
    .eq("provider", "square")
    .eq("status", "active")
    .eq("environment", config.environment)
    .maybeSingle<{ id: string; location_id: string | null; scopes: string[] | null }>();
  if (error) {
    console.error("[PosSquare] wallet-discount-connection-read-failed", error.message);
    return wins;
  }
  if (!connection?.location_id || !hasSquareMenuPrizeScopes(connection.scopes)) return wins;

  return wins.map((win) => (win.redemptionId && candidates.has(win.redemptionId) ? { ...win, squareDiscount: true } : win));
};
