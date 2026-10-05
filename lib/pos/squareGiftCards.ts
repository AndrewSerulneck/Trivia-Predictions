import "server-only";
import { PrizeRedeemUnavailableError, redeemChallengePrize } from "@/lib/challengeCampaigns";
import { prizePosValueCents } from "@/lib/pos/prizeValue";
import { isPosIntegrationsEnabled } from "@/lib/pos/providers";
import { getPosAdapter } from "@/lib/pos/registry";
import { retrieveSquareGiftCard } from "@/lib/pos/square";
import { isSquareConfigured, squareAppConfig } from "@/lib/pos/squareConfig";
import { loadSquareCredentials } from "@/lib/pos/squareConnection";
import type { PosConnectionCredentials, PosFailure } from "@/lib/pos/types";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ChallengeCampaignWin, SquareGiftCardState } from "@/types";

// Gift-card prizes as real Square gift cards (docs/pos-rewards-integration-plan.md Phase 2).
//
// LAZY: nothing is created at Square until the guest opens a gift-card coupon at a
// Square-connected venue and taps "Get my Square gift card". Then, in this order:
//
//   1. ledger row     pos_reward_applications, idempotency_key "<redemptionId>:square:apply",
//                     inserted BEFORE any Square call (a duplicate = "already started; resume").
//   2. prepare        CreateGiftCard DIGITAL → a PENDING card with a $0 balance. Worthless.
//                     Its id is saved on the ledger row straight away.
//   3. claim          redeem_challenge_prize(p_method 'pos_square') — the once-only RPC.
//   4. fund           ACTIVATE the card with the prize amount.
//   5. show           RetrieveGiftCard → the card number (GAN) and balance, to this guest only.
//
// WHY THE CLAIM SITS BETWEEN PREPARE AND FUND. The same coupon can still be redeemed the old
// way (staff discount + "Confirm Redemption"). Both paths claim through the same RPC, so exactly
// one wins. If the guest-confirm path wins, all this path leaves behind is an unfunded card —
// a guest can never get the staff discount AND a funded Square card. (Deviation from plan §4
// Phase 2, which had the webhook mark the coupon redeemed on the first REDEEM: that left a
// window where both could happen, and a coupon that "expired" in our wallet while its Square
// card still worked. See the Phase 2 handoff §3.)
//
// So in our records a coupon is REDEEMED (method pos_square) the moment it becomes a Square
// gift card. What the guest later spends at the register is recorded on the ledger row by the
// webhook (lib/pos/squareWebhook.ts).
//
// Every step is idempotent: Square calls reuse keys derived from the ledger key, and a retry
// after any failure resumes from the first unfinished step.
//
// Cost (plan §3): first open = 3 Square calls + ~5 small indexed DB reads/writes; each later
// open = 1 Square call. Nothing runs on a schedule.

const PROVIDER = "square";

type CouponRow = {
  id: string;
  challenge_id: string | null;
  winner_user_id: string;
  venue_id: string;
  prize_redeemed_at: string | null;
  redeemed_method: string | null;
  prize_expires_at: string | null;
  prize_kind: string | null;
  prize_type: string | null;
  prize_gift_certificate_amount: number | null;
};

const COUPON_COLUMNS =
  "id, challenge_id, winner_user_id, venue_id, prize_redeemed_at, redeemed_method, prize_expires_at, prize_kind, prize_type, prize_gift_certificate_amount";

type LedgerRow = {
  id: string;
  redemption_id: string | null;
  status: "pending" | "succeeded" | "failed" | "reversed";
  external_ref: string | null;
  external_detail: Record<string, unknown> | null;
  amount_cents: number | null;
};

const LEDGER_COLUMNS = "id, redemption_id, status, external_ref, external_detail, amount_cents";

export const squareApplyKey = (redemptionId: string): string => `${redemptionId}:${PROVIDER}:apply`;

export type SquareGiftCardView = {
  /** The card number, grouped for reading. Shown to the winning guest only. */
  gan: string;
  amountCents: number;
  balanceCents: number;
  /** Square's state: ACTIVE, DEACTIVATED, BLOCKED, PENDING. */
  state: string;
};

export type OpenSquareGiftCardResult =
  | { ok: true; giftCard: SquareGiftCardView }
  | {
      ok: false;
      code: "not_eligible" | "not_found" | "already_redeemed" | "expired" | "unavailable" | "square_error";
      message: string;
    };

const fail = (
  code: Extract<OpenSquareGiftCardResult, { ok: false }>["code"],
  message: string,
): OpenSquareGiftCardResult => ({ ok: false, code, message });

const SQUARE_ERROR_MESSAGE = "Couldn't reach Square right now. Please try again in a minute.";

// ── Prize: is this coupon a gift card, and for how much? ──────────────────────────────────

const isGiftCardKind = (prizeKind: string | null | undefined, prizeType: string | null | undefined): boolean =>
  prizeKind === "gift_card" || (!prizeKind && prizeType === "gift_certificate");

/**
 * The amount in cents, from the coupon's award-time snapshot — what was actually won. A row
 * from before the snapshot columns falls back to the live reward (one extra read).
 */
const couponGiftCardCents = async (coupon: CouponRow): Promise<number | null> => {
  let kindOk = isGiftCardKind(coupon.prize_kind, coupon.prize_type);
  let amount = coupon.prize_gift_certificate_amount;
  if ((!coupon.prize_kind || amount === null) && coupon.challenge_id && supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from("challenge_campaigns")
      .select("prize_kind, prize_type, prize_gift_certificate_amount")
      .eq("id", coupon.challenge_id)
      .maybeSingle<{ prize_kind: string | null; prize_type: string | null; prize_gift_certificate_amount: number | null }>();
    if (data) {
      if (!coupon.prize_kind) kindOk = isGiftCardKind(data.prize_kind, data.prize_type ?? coupon.prize_type);
      if (amount === null) amount = data.prize_gift_certificate_amount;
    }
  }
  if (!kindOk) return null;
  return prizePosValueCents({
    prizeKind: "gift_card",
    prizeGiftCertificateAmount: amount === null ? null : Number(amount),
    prizeDiscountKind: null,
    prizeDiscountValue: null,
    prizePosValueCents: null,
  });
};

// ── Ledger helpers ───────────────────────────────────────────────────────────────────────

const readLedger = async (key: string): Promise<{ ok: true; row: LedgerRow | null } | { ok: false }> => {
  const { data, error } = await supabaseAdmin!
    .from("pos_reward_applications")
    .select(LEDGER_COLUMNS)
    .eq("idempotency_key", key)
    .maybeSingle<LedgerRow>();
  if (error) {
    console.error("[PosSquare] ledger-read-failed", error.message);
    return { ok: false };
  }
  return { ok: true, row: data ?? null };
};

const insertLedger = async (input: {
  key: string;
  redemptionId: string;
  venueId: string;
  connectionId: string;
  amountCents: number;
}): Promise<LedgerRow | null> => {
  const { data, error } = await supabaseAdmin!
    .from("pos_reward_applications")
    .insert({
      idempotency_key: input.key,
      redemption_id: input.redemptionId,
      venue_id: input.venueId,
      connection_id: input.connectionId,
      provider: PROVIDER,
      action: "apply",
      status: "pending",
      amount_cents: input.amountCents,
      currency: "USD",
      actor: "guest",
    })
    .select(LEDGER_COLUMNS)
    .single<LedgerRow>();
  if (!error && data) return data;
  // 23505 = a concurrent tap inserted it first. That row is ours to resume.
  if (error && String(error.code) === "23505") {
    const again = await readLedger(input.key);
    return again.ok ? again.row : null;
  }
  console.error("[PosSquare] ledger-insert-failed", error?.message);
  return null;
};

const updateLedger = async (id: string, fields: Record<string, unknown>): Promise<void> => {
  const { error } = await supabaseAdmin!
    .from("pos_reward_applications")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error("[PosSquare] ledger-update-failed", error.message);
};

const recordFailure = (row: LedgerRow, failure: PosFailure, terminal: boolean) =>
  updateLedger(row.id, {
    ...(terminal ? { status: "failed" } : {}),
    error_code: failure.code,
    error_message: failure.message.slice(0, 300),
  });

const groupGan = (gan: string): string => gan.replace(/\s+/g, "").replace(/(.{4})(?=.)/g, "$1 ");

// ── Fund + show ──────────────────────────────────────────────────────────────────────────

const fundAndShow = async (
  row: LedgerRow,
  credentials: PosConnectionCredentials,
  redemptionId: string,
  amountCents: number,
): Promise<OpenSquareGiftCardResult> => {
  const giftCardId = row.external_ref!;
  let detail = row.external_detail ?? {};

  if (row.status !== "succeeded") {
    const adapter = getPosAdapter(PROVIDER);
    if (!adapter) return fail("unavailable", SQUARE_ERROR_MESSAGE);
    const applied = await adapter.applyReward({
      credentials,
      idempotencyKey: squareApplyKey(redemptionId),
      redemptionId,
      preparedRef: giftCardId,
      value: { amountCents, currency: "USD", label: "Hightop Challenge prize" },
    });
    if (!applied.ok) {
      console.error("[PosSquare] activate-failed", { ledgerId: row.id, code: applied.code });
      await recordFailure(row, applied, false);
      return fail("square_error", SQUARE_ERROR_MESSAGE);
    }
    detail = { ...detail, ...applied.detail, claimed: true };
    await updateLedger(row.id, {
      status: "succeeded",
      amount_cents: applied.amountCents,
      external_detail: detail,
      error_code: null,
      error_message: null,
      completed_at: new Date().toISOString(),
    });
  }

  const card = await retrieveSquareGiftCard(credentials, giftCardId);
  if ("ok" in card) {
    console.error("[PosSquare] retrieve-failed", { ledgerId: row.id, code: card.code });
    return fail("square_error", SQUARE_ERROR_MESSAGE);
  }
  // Keep the last-known balance on the ledger so the wallet can say "Used" without a Square call.
  if (detail.balance_cents !== card.balanceCents) {
    await updateLedger(row.id, { external_detail: { ...detail, balance_cents: card.balanceCents } });
  }
  return {
    ok: true,
    giftCard: { gan: groupGan(card.gan), amountCents: row.amount_cents ?? amountCents, balanceCents: card.balanceCents, state: card.state },
  };
};

// ── The guest's tap ──────────────────────────────────────────────────────────────────────

/**
 * Turn the guest's gift-card coupon into a Square gift card (first time) or show it again
 * (every later time). `userId` must already be bound to the signed session by the route.
 */
export const openSquareGiftCard = async (params: {
  userId: string;
  venueId: string;
  redemptionId: string;
}): Promise<OpenSquareGiftCardResult> => {
  if (!isPosIntegrationsEnabled() || !isSquareConfigured()) {
    return fail("not_eligible", "Square gift cards aren't available here.");
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
    console.error("[PosSquare] coupon-read-failed", couponError.message);
    return fail("unavailable", SQUARE_ERROR_MESSAGE);
  }
  // Someone else's coupon reads exactly like a missing one.
  if (!coupon || coupon.winner_user_id !== userId || coupon.venue_id !== venueId) {
    return fail("not_found", "No prize found.");
  }
  if (!coupon.challenge_id) return fail("not_eligible", "This prize can't become a Square gift card.");

  const amountCents = await couponGiftCardCents(coupon);
  if (amountCents === null) return fail("not_eligible", "Only gift card prizes can become Square gift cards.");

  const creds = await loadSquareCredentials(venueId);
  if (!creds.ok) {
    return creds.reason === "unavailable"
      ? fail("unavailable", SQUARE_ERROR_MESSAGE)
      : fail("not_eligible", "This venue isn't taking Square gift cards right now.");
  }
  const credentials = creds.credentials;

  const key = squareApplyKey(redemptionId);
  const existing = await readLedger(key);
  if (!existing.ok) return fail("unavailable", SQUARE_ERROR_MESSAGE);
  let row = existing.row;

  // Already redeemed: only a coupon WE turned into a Square card can be shown/resumed.
  if (coupon.prize_redeemed_at) {
    if (coupon.redeemed_method !== "pos_square" || !row?.external_ref || row.status === "failed") {
      return fail("already_redeemed", "This prize was already redeemed.");
    }
    return fundAndShow(row, credentials, redemptionId, amountCents);
  }

  if (coupon.prize_expires_at && new Date(coupon.prize_expires_at).getTime() <= Date.now()) {
    return fail("expired", "This prize has expired.");
  }

  // 1. Ledger row first.
  if (!row) {
    row = await insertLedger({ key, redemptionId, venueId, connectionId: credentials.connectionId, amountCents });
    if (!row) return fail("unavailable", SQUARE_ERROR_MESSAGE);
  } else if (row.status === "failed") {
    // A terminal failure on a coupon that is still unredeemed can only be stale; try again.
    await updateLedger(row.id, { status: "pending" });
    row = { ...row, status: "pending" };
  }

  // 2. Prepare (a worthless PENDING card), saving its id before anything else happens.
  if (!row.external_ref) {
    const adapter = getPosAdapter(PROVIDER);
    if (!adapter?.prepareReward) return fail("unavailable", SQUARE_ERROR_MESSAGE);
    const prepared = await adapter.prepareReward({ credentials, idempotencyKey: key, redemptionId });
    if (!prepared.ok) {
      console.error("[PosSquare] create-failed", { ledgerId: row.id, code: prepared.code });
      await recordFailure(row, prepared, false);
      return fail("square_error", SQUARE_ERROR_MESSAGE);
    }
    await updateLedger(row.id, { external_ref: prepared.externalRef, external_detail: prepared.detail });
    row = { ...row, external_ref: prepared.externalRef, external_detail: prepared.detail };
  }

  // 3. Claim — the once-only RPC decides between this path and "Confirm Redemption".
  try {
    const claim = await redeemChallengePrize({
      userId,
      venueId,
      challengeId: coupon.challenge_id,
      redemptionId,
      method: "pos_square",
    });
    if (!claim.redeemed) {
      // Someone claimed it first. If that was this same path (a double tap), carry on.
      const { data: after } = await supabaseAdmin
        .from("challenge_campaign_redemptions")
        .select("redeemed_method")
        .eq("id", redemptionId)
        .maybeSingle<{ redeemed_method: string | null }>();
      if (after?.redeemed_method !== "pos_square") {
        await recordFailure(row, { ok: false, code: "invalid", message: "lost_to_guest_confirm", retryable: false }, true);
        return fail("already_redeemed", "This prize was already redeemed.");
      }
    }
  } catch (error) {
    if (error instanceof PrizeRedeemUnavailableError) return fail("unavailable", SQUARE_ERROR_MESSAGE);
    const message = error instanceof Error ? error.message : "claim failed";
    await recordFailure(row, { ok: false, code: "invalid", message, retryable: false }, true);
    return message.toLowerCase().includes("expired")
      ? fail("expired", "This prize has expired.")
      : fail("not_found", "No prize found.");
  }

  // 4 + 5. Fund and show.
  return fundAndShow(row, credentials, redemptionId, amountCents);
};

// ── The prize wallet's list ──────────────────────────────────────────────────────────────

/**
 * Tag each gift-card coupon with its Square state:
 *   "available" — Square is connected here; the coupon can still become a Square gift card.
 *   "issued"    — it already is one; "Show gift card" fetches the number.
 *   "used"      — it is one, and its last known balance is $0.
 * Everything else is left untouched (no `squareGiftCard` field).
 *
 * Cost: zero queries while the flag is off or there's no gift-card coupon; otherwise one
 * indexed pos_connections read, plus one ledger read when Square is connected.
 */
export const attachSquareGiftCardStates = async (
  wins: ChallengeCampaignWin[],
  venueId: string,
): Promise<ChallengeCampaignWin[]> => {
  const config = squareAppConfig();
  if (!isPosIntegrationsEnabled() || !config || !supabaseAdmin) return wins;
  const candidates = wins.filter(
    (win) => win.redemptionId && win.challengeId && isGiftCardKind(win.prizeKind, win.prizeType),
  );
  if (candidates.length === 0) return wins;

  const { data: connection, error: connectionError } = await supabaseAdmin
    .from("pos_connections")
    .select("id, location_id")
    .eq("venue_id", venueId)
    .eq("provider", PROVIDER)
    .eq("status", "active")
    // Only a connection made in THIS server's Square environment (see loadSquareCredentials).
    .eq("environment", config.environment)
    .maybeSingle<{ id: string; location_id: string | null }>();
  if (connectionError) {
    console.error("[PosSquare] wallet-connection-read-failed", connectionError.message);
    return wins;
  }
  if (!connection?.location_id) return wins;

  const ids = candidates.map((win) => win.redemptionId as string);
  const { data: ledgerRows, error: ledgerError } = await supabaseAdmin
    .from("pos_reward_applications")
    .select(LEDGER_COLUMNS)
    .eq("provider", PROVIDER)
    .eq("action", "apply")
    .in("redemption_id", ids)
    .returns<LedgerRow[]>();
  if (ledgerError) {
    console.error("[PosSquare] wallet-ledger-read-failed", ledgerError.message);
    return wins;
  }
  const ledgerByRedemption = new Map((ledgerRows ?? []).map((row) => [row.redemption_id, row]));
  const candidateIds = new Set(ids);
  const nowMs = Date.now();

  return wins.map((win) => {
    if (!win.redemptionId || !candidateIds.has(win.redemptionId)) return win;
    const ledger = ledgerByRedemption.get(win.redemptionId);
    let state: SquareGiftCardState | null = null;
    if (win.prizeRedeemedAt) {
      if (ledger?.external_ref && ledger.status !== "failed") {
        state = ledger.external_detail?.balance_cents === 0 ? "used" : "issued";
      }
    } else if (!win.prizeExpiresAt || new Date(win.prizeExpiresAt).getTime() > nowMs) {
      state = "available";
    }
    return state ? { ...win, squareGiftCard: state } : win;
  });
};
