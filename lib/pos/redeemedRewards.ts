import "server-only";
import { describeRewardPrizeInSentence } from "@/lib/rewardDefinitions";
import { resolveRewardPrize } from "@/lib/challengeCampaigns";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// "Rewards redeemed" for one venue (docs/pos-rewards-integration-plan.md Phase 2f).
//
// On demand, never a cron: 3 bounded reads per open, ZERO Square calls (card balances are what
// the webhook already wrote to the ledger). Redemptions (newest 50) → ledger rows for those ids
// → usernames for those winners.
//
// `redeemed_method='pos_square'` means "converted to a Square gift card", not "spent": the
// spent/balance fields come from the ledger's external_detail. The row returned to the browser
// carries no gift card id, card number, merchant id or user id.

const LIMIT = 50;

export type RedeemedRewardHow = "guest_confirm" | "square_gift_card" | "other";

export type RedeemedReward = {
  id: string;
  redeemedAt: string;
  username: string | null;
  prize: string;
  how: RedeemedRewardHow;
  /** Square gift cards only; null when unknown. */
  amountCents: number | null;
  balanceCents: number | null;
  lastUsedAt: string | null;
};

type RedemptionRow = {
  id: string;
  winner_user_id: string;
  prize_redeemed_at: string;
  redeemed_method: string | null;
  prize_type: string | null;
  prize_gift_certificate_amount: number | null;
  prize_kind: string | null;
  prize_menu_item: string | null;
  prize_menu_item_name: string | null;
  prize_discount_kind: string | null;
  prize_discount_value: number | null;
};

type LedgerRow = {
  redemption_id: string | null;
  status: string;
  amount_cents: number | null;
  external_detail: Record<string, unknown> | null;
};

const REDEMPTION_COLUMNS =
  "id, winner_user_id, prize_redeemed_at, redeemed_method, prize_type, prize_gift_certificate_amount, prize_kind, prize_menu_item, prize_menu_item_name, prize_discount_kind, prize_discount_value";

/** Pure: how a coupon was taken, in the words the partner sees. */
export const redeemedHow = (method: string | null): RedeemedRewardHow => {
  if (method === "pos_square") return "square_gift_card";
  if (method === "guest_confirm" || method === null) return "guest_confirm";
  return "other";
};

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const stringOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);

export const listRedeemedRewards = async (venueId: string): Promise<RedeemedReward[]> => {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");
  const { data, error } = await supabaseAdmin
    .from("challenge_campaign_redemptions")
    .select(REDEMPTION_COLUMNS)
    .eq("venue_id", venueId)
    .not("prize_redeemed_at", "is", null)
    .order("prize_redeemed_at", { ascending: false })
    .limit(LIMIT)
    .returns<RedemptionRow[]>();
  if (error) throw new Error(`Failed to load redeemed rewards: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const squareIds = rows.filter((row) => row.redeemed_method === "pos_square").map((row) => row.id);
  const userIds = [...new Set(rows.map((row) => row.winner_user_id))];
  const [ledger, users] = await Promise.all([
    squareIds.length
      ? supabaseAdmin
          .from("pos_reward_applications")
          .select("redemption_id, status, amount_cents, external_detail")
          .eq("provider", "square")
          .eq("action", "apply")
          .in("redemption_id", squareIds)
          .returns<LedgerRow[]>()
      : Promise.resolve({ data: [] as LedgerRow[], error: null }),
    supabaseAdmin.from("users").select("id, username").in("id", userIds).returns<Array<{ id: string; username: string | null }>>(),
  ]);
  if (ledger.error) throw new Error(`Failed to load Square ledger: ${ledger.error.message}`);
  // A missing username is cosmetic.
  const ledgerByRedemption = new Map((ledger.data ?? []).map((row) => [row.redemption_id, row]));
  const nameById = new Map((users.data ?? []).map((user) => [user.id, user.username]));

  return rows.map((row) => {
    const resolved = resolveRewardPrize({
      prize_kind: row.prize_kind,
      prize_menu_item: row.prize_menu_item,
      prize_menu_item_name: row.prize_menu_item_name,
      prize_discount_kind: row.prize_discount_kind,
      prize_discount_value: row.prize_discount_value,
      prize_type: row.prize_type,
    });
    const how = redeemedHow(row.redeemed_method);
    const card = how === "square_gift_card" ? ledgerByRedemption.get(row.id) ?? null : null;
    const detail = card?.external_detail ?? {};
    return {
      id: row.id,
      redeemedAt: row.prize_redeemed_at,
      username: nameById.get(row.winner_user_id) ?? null,
      prize: describeRewardPrizeInSentence({
        ...resolved,
        prizeGiftCertificateAmount: row.prize_gift_certificate_amount,
      }),
      how,
      amountCents: card?.amount_cents ?? null,
      balanceCents: numberOrNull(detail.balance_cents),
      lastUsedAt: detail.first_redeemed_at ? stringOrNull(detail.last_activity_at) : null,
    };
  });
};
