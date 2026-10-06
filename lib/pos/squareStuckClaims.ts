import "server-only";
import { isOurSquareClaim, squareApplyKey } from "@/lib/pos/squareClaim";
import { openSquareGiftCard } from "@/lib/pos/squareGiftCards";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Admin view of Square gift card attempts that never finished
// (docs/pos-rewards-integration-plan.md Phase 2c, "stuck-claim visibility").
//
// A guest's tap writes a pos_reward_applications row first and marks it `succeeded` only once
// the card is funded (lib/pos/squareGiftCards.ts). A row still not `succeeded` after 15 minutes
// is one of:
//   claimed_unfunded — the coupon IS redeemed (pos_square) but the card was never funded:
//                      the guest has neither a usable coupon nor a usable card. The one case
//                      that needs us. "Retry funding" runs the same idempotent path the guest's
//                      next tap would — whatever the ledger row's status (isOurSquareClaim).
//   unclaimed        — Square or the claim failed before the coupon was taken; the guest still
//                      has the normal coupon and can tap again. Nothing to do.
//   lost             — "Confirm Redemption" (or another method) won the race; harmless, the card
//                      left behind was never funded.
//
// TWO bounded reads, so harmless rows can never push a claimed-unfunded one out of view
// (docs/square-review-fixes-plan.md R1, finding #3):
//   1. need action — claimed_unfunded rows only (inner join on the coupon), oldest first, ≤100.
//      These should stay near zero.
//   2. the rest    — newest first, ≤50, last 14 days only, so abandoned rows age out of view.
//                    Never deleted: the ledger is the audit record.
// Plus one coupon read (for read 2's rows) and one venue-name read. On demand only (the admin
// opens the Venues section); no cron. Never returns a card number, token or gift card id.

const STUCK_AFTER_MS = 15 * 60 * 1000;
const HARMLESS_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const NEEDS_ACTION_LIMIT = 100;
const HARMLESS_LIMIT = 50;

export type StuckSquareClaimKind = "claimed_unfunded" | "unclaimed" | "lost";

export type StuckSquareClaim = {
  ledgerId: string;
  redemptionId: string | null;
  venueId: string;
  venueName: string | null;
  status: string;
  kind: StuckSquareClaimKind;
  amountCents: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StuckSquareClaimList = {
  /** Need-action rows first (oldest first), then the harmless rest (newest first). */
  claims: StuckSquareClaim[];
  /** From read 1 alone. `capped` = it hit its limit; show "100+". */
  needsAction: { count: number; capped: boolean };
};

type LedgerRow = {
  id: string;
  redemption_id: string | null;
  venue_id: string;
  status: string;
  external_ref: string | null;
  amount_cents: number | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

const LEDGER_COLUMNS =
  "id, redemption_id, venue_id, status, external_ref, amount_cents, error_code, error_message, created_at, updated_at";

type CouponRow = { id: string; prize_redeemed_at: string | null; redeemed_method: string | null };

/** PostgREST embeds a many-to-one as an object; tolerate an array too. */
type NeedsActionRow = LedgerRow & { challenge_campaign_redemptions: CouponRow | CouponRow[] | null };

/** Pure: what a stuck row means, from the ledger row and its coupon. */
export const classifyStuckSquareClaim = (
  row: Pick<LedgerRow, "external_ref">,
  coupon: Pick<CouponRow, "prize_redeemed_at" | "redeemed_method"> | null,
): StuckSquareClaimKind => {
  if (!coupon?.prize_redeemed_at) return "unclaimed";
  if (isOurSquareClaim(row, coupon)) return "claimed_unfunded";
  return "lost";
};

export const listStuckSquareClaims = async (): Promise<StuckSquareClaimList> => {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");
  const nowMs = Date.now();
  const cutoff = new Date(nowMs - STUCK_AFTER_MS).toISOString();
  const harmlessSince = new Date(nowMs - HARMLESS_WINDOW_MS).toISOString();

  const [needsActionRead, restRead] = await Promise.all([
    supabaseAdmin
      .from("pos_reward_applications")
      .select(`${LEDGER_COLUMNS}, challenge_campaign_redemptions!inner(id, prize_redeemed_at, redeemed_method)`)
      .eq("provider", "square")
      .eq("action", "apply")
      .neq("status", "succeeded")
      .not("external_ref", "is", null)
      .eq("challenge_campaign_redemptions.redeemed_method", "pos_square")
      // Same rule as classifyStuckSquareClaim (isOurSquareClaim), so the count matches the badges.
      .not("challenge_campaign_redemptions.prize_redeemed_at", "is", null)
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(NEEDS_ACTION_LIMIT)
      .returns<NeedsActionRow[]>(),
    supabaseAdmin
      .from("pos_reward_applications")
      .select(LEDGER_COLUMNS)
      .eq("provider", "square")
      .eq("action", "apply")
      .neq("status", "succeeded")
      .lt("created_at", cutoff)
      .gte("created_at", harmlessSince)
      .order("created_at", { ascending: false })
      .limit(HARMLESS_LIMIT)
      .returns<LedgerRow[]>(),
  ]);
  if (needsActionRead.error) throw new Error(`Failed to load stuck Square claims: ${needsActionRead.error.message}`);
  if (restRead.error) throw new Error(`Failed to load stuck Square claims: ${restRead.error.message}`);

  const needsAction = needsActionRead.data ?? [];
  const needsActionIds = new Set(needsAction.map((row) => row.id));
  const rest = (restRead.data ?? []).filter((row) => !needsActionIds.has(row.id));
  const needsActionSummary = { count: needsAction.length, capped: needsAction.length >= NEEDS_ACTION_LIMIT };
  if (needsAction.length === 0 && rest.length === 0) return { claims: [], needsAction: needsActionSummary };

  const couponById = new Map<string, CouponRow>();
  for (const row of needsAction) {
    const embedded = Array.isArray(row.challenge_campaign_redemptions)
      ? row.challenge_campaign_redemptions[0]
      : row.challenge_campaign_redemptions;
    if (embedded) couponById.set(embedded.id, embedded);
  }
  const restRedemptionIds = [
    ...new Set(rest.map((row) => row.redemption_id).filter((id): id is string => Boolean(id) && !couponById.has(id as string))),
  ];
  const venueIds = [...new Set([...needsAction, ...rest].map((row) => row.venue_id))];
  const [coupons, venues] = await Promise.all([
    restRedemptionIds.length
      ? supabaseAdmin
          .from("challenge_campaign_redemptions")
          .select("id, prize_redeemed_at, redeemed_method")
          .in("id", restRedemptionIds)
          .returns<CouponRow[]>()
      : Promise.resolve({ data: [] as CouponRow[], error: null }),
    supabaseAdmin.from("venues").select("id, name").in("id", venueIds).returns<Array<{ id: string; name: string | null }>>(),
  ]);
  if (coupons.error) throw new Error(`Failed to load coupons: ${coupons.error.message}`);
  for (const coupon of coupons.data ?? []) couponById.set(coupon.id, coupon);
  // A missing venue name is cosmetic; the id is still shown.
  const nameById = new Map((venues.data ?? []).map((venue) => [venue.id, venue.name]));

  const claims = [...needsAction, ...rest].map((row) => ({
    ledgerId: row.id,
    redemptionId: row.redemption_id,
    venueId: row.venue_id,
    venueName: nameById.get(row.venue_id) ?? null,
    status: row.status,
    kind: classifyStuckSquareClaim(row, row.redemption_id ? couponById.get(row.redemption_id) ?? null : null),
    amountCents: row.amount_cents,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  return { claims, needsAction: needsActionSummary };
};

export type RetrySquareFundingResult =
  | { ok: true }
  | { ok: false; status: 404 | 409 | 502 | 503; error: string };

/**
 * "Retry funding" for a claimed-but-unfunded coupon: runs openSquareGiftCard as the coupon's
 * winner — the same idempotent path the guest's next tap would take (no new card, no second
 * claim). Refuses anything that isn't `claimed_unfunded`, so an admin can never turn a guest's
 * untouched coupon into a Square card. The card number openSquareGiftCard returns is dropped here.
 */
export const retrySquareFunding = async (redemptionId: string): Promise<RetrySquareFundingResult> => {
  if (!supabaseAdmin) return { ok: false, status: 503, error: "Supabase admin client is not configured." };
  const { data: coupon, error } = await supabaseAdmin
    .from("challenge_campaign_redemptions")
    .select("id, winner_user_id, venue_id, prize_redeemed_at, redeemed_method")
    .eq("id", redemptionId)
    .maybeSingle<CouponRow & { winner_user_id: string; venue_id: string }>();
  if (error && String(error.code) !== "22P02") return { ok: false, status: 503, error: "Couldn't read the coupon." };
  if (!coupon) return { ok: false, status: 404, error: "No such coupon." };

  const { data: row } = await supabaseAdmin
    .from("pos_reward_applications")
    .select("external_ref, status")
    .eq("idempotency_key", squareApplyKey(redemptionId))
    .maybeSingle<{ external_ref: string | null; status: string }>();
  if (!row || row.status === "succeeded" || classifyStuckSquareClaim(row, coupon) !== "claimed_unfunded") {
    return { ok: false, status: 409, error: "Only a coupon claimed for a Square gift card but never funded can be retried." };
  }

  const result = await openSquareGiftCard({ userId: coupon.winner_user_id, venueId: coupon.venue_id, redemptionId });
  console.info("[PosSquare] admin-retry-funding", { redemptionId, ok: result.ok, ...(result.ok ? {} : { code: result.code }) });
  if (result.ok) return { ok: true };
  return {
    ok: false,
    status: result.code === "square_error" ? 502 : result.code === "unavailable" ? 503 : 409,
    error: result.message,
  };
};
