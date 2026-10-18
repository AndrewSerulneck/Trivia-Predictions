"use client";

import { haptic } from "@/lib/haptics";

import { ButtonSpinner } from "@/components/ui/ButtonSpinner";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNativeBackHandler } from "@/components/navigation/nativeBackButton";
import { getUserId, getUsername, getVenueId } from "@/lib/storage";
import { clockOffsetFromServer } from "@/lib/liveCouponClock";
import { HightopLoader } from "@/components/ui/HightopLoader";
import { LiveCouponFrame } from "@/components/prizes/LiveCouponFrame";
import { SquareDiscountHint } from "@/components/prizes/SquareDiscountHint";
import { SCANNABLE_COUPON_LINE } from "@/lib/posStaffInstructions";
import { SquareGiftCardPanel } from "@/components/prizes/SquareGiftCardPanel";
import { useVenuePresence } from "@/components/venue/VenuePresenceBoundary";
import { isScannableGiftCardPrize } from "@/lib/pos/prizeDelivery";
import { PrizeCard } from "@/components/prizes/PrizeCard";
import {
  prizeCardBack,
  prizeCardFace,
  prizeExpiryInfo,
  type PrizeCardFace,
  type PrizeExpiryTone,
} from "@/lib/prizeCardFace";
import type { ChallengeCampaignWin, PrizeWin } from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "Unknown date";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const EXPIRY_CLASS: Record<PrizeExpiryTone, string> = {
  urgent: "font-semibold text-red-400",
  soon: "font-semibold text-amber-400",
  normal: "",
};

/** Under every list card: the action and the details are on the back now (plan §2.8, Q6 default). */
const TAP_FOR_DETAILS = "Tap the card for details";

// ─── Prize cards (docs/prize-gift-card-redesign-plan.md Phase 3) ─────────────

type WalletPrize = "gift_card" | "menu_item" | "legacy";

/**
 * Which prize this coupon draws as, with the wallet's long-standing precedence: the Rewards prize
 * model first (the backend derives prizeKind from a legacy prizeType when it is null, so this
 * covers every row), then the legacy types. Null = nothing the wallet knows how to show.
 */
function walletPrizeOf(win: ChallengeCampaignWin): WalletPrize | null {
  if (win.prizeKind === "gift_card") return "gift_card";
  if (win.prizeKind === "menu_item") return "menu_item";
  if (win.prizeType === "wine_bottle" || win.prizeType === "free_appetizer" || win.prizeType === "gift_certificate") {
    return "legacy";
  }
  return null;
}

/**
 * THE which-button decision for a prize in the list, unchanged from the coupons it replaced:
 * a prize already turned into a Square gift card → "Show gift card" (gift-card prizes, and
 * dollar-off menu prizes set to a scannable gift card); otherwise redeemed → no button (the card's
 * own chip says Redeemed / Used); otherwise → "Redeem". Legacy prizes never become Square cards
 * here. It decides the button on the back of the card (plan §2.8).
 */
function prizeActionOf(win: ChallengeCampaignWin): "Show gift card" | "Redeem" | null {
  const kind = walletPrizeOf(win);
  const squareIssued =
    win.squareGiftCard === "issued" &&
    (kind === "gift_card" || (kind === "menu_item" && isScannableGiftCardPrize(win)));
  if (squareIssued) return "Show gift card";
  if (win.prizeRedeemedAt) return null;
  return "Redeem";
}

/**
 * The list's face. A redeemed prize with no button never looks ready: the one case is a legacy
 * gift certificate (no prizeKind) that became a Square card, which the face calls spendable but
 * the list has never offered to show — it keeps the old coupon's "Redeemed".
 */
function walletFaceOf(win: ChallengeCampaignWin, venueName: string | null): PrizeCardFace {
  const face = prizeCardFace(win, venueName);
  if (face.status !== "ready" || !win.prizeRedeemedAt || prizeActionOf(win)) return face;
  return { ...face, status: "redeemed", ariaLabel: `${face.ariaLabel}, redeemed` };
}

type WalletPrizeCardProps = {
  win: ChallengeCampaignWin;
  venueName: string | null;
  onRedeem: (win: ChallengeCampaignWin) => void;
};

/**
 * One prize in the list: the card (tap it to see the back, where the action now sits —
 * plan §2.8), then one muted line: the expiry and "Tap the card for details".
 */
function WalletPrizeCard({ win, venueName, onRedeem }: WalletPrizeCardProps) {
  if (!walletPrizeOf(win)) return null;
  const expiry = win.prizeExpiresAt && !win.prizeRedeemedAt ? prizeExpiryInfo(win.prizeExpiresAt) : null;
  // Only where it really can be a card (Square connected here, attachSquareGiftCardStates); otherwise
  // it is an ordinary coupon and must not promise one.
  const scannableLine = win.prizeKind === "menu_item" && isScannableGiftCardPrize(win) && Boolean(win.squareGiftCard);
  const actionLabel = prizeActionOf(win);

  return (
    // A div, not an <article>: phones pad every .tp-page-main article/section by 0.625rem !important.
    <div data-prize-wallet-item className="space-y-2.5">
      <PrizeCard
        face={walletFaceOf(win, venueName)}
        back={prizeCardBack(win)}
        action={actionLabel ? { label: actionLabel, onPress: () => onRedeem(win) } : undefined}
      />
      <div className="max-w-sm space-y-0.5 px-1 text-footnote text-ht-fg-muted">
        <p className="line-clamp-2">
          {expiry ? (
            <>
              <span className={EXPIRY_CLASS[expiry.tone]}>{expiry.label}</span>
              {" · "}
            </>
          ) : null}
          <span>{TAP_FOR_DETAILS}</span>
        </p>
        {scannableLine ? <p className="font-semibold">{SCANNABLE_COUPON_LINE}</p> : null}
      </div>
    </div>
  );
}

/**
 * The large card shown to staff inside the live frame. It flips too (what it was won for, terms,
 * expiry are on its back), but carries no action: Confirm Redemption below it is the one redeem.
 */
function LargePrizeCard({ win, venueName }: { win: ChallengeCampaignWin; venueName: string | null }) {
  return <PrizeCard face={prizeCardFace(win, venueName)} back={prizeCardBack(win)} size="large" inLiveFrame />;
}

// ─── Redeem Modal ─────────────────────────────────────────────────────────────

type RedeemModalProps = {
  win: ChallengeCampaignWin;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  confirming: boolean;
  confirmed: boolean;
  errorMessage: string;
  /** What the live coupon proves: the server's clock, and whose coupon it is, where. */
  clockOffsetMs: number;
  username: string | null;
  venueName: string | null;
  /** Square paths (docs/pos-rewards-integration-plan.md Phase 2 / 2d) — used only when `win.squareGiftCard` or `win.squareDiscount` is set. */
  userId: string;
  venueId: string;
  onSquareIssued: () => void;
  onSquareAlreadyRedeemed: (message: string) => void;
  presenceMessage: (payload: unknown) => string | null;
};

function RedeemModal({
  win,
  onConfirm,
  onClose,
  confirming,
  confirmed,
  errorMessage,
  clockOffsetMs,
  username,
  venueName,
  userId,
  venueId,
  onSquareIssued,
  onSquareAlreadyRedeemed,
  presenceMessage,
}: RedeemModalProps) {
  // A gift card at a Square-connected venue opens on the Square path; "Redeem the normal way"
  // drops back to the classic coupon + Confirm Redemption (only before a card exists).
  const [useNormalCoupon, setUseNormalCoupon] = useState(false);
  // Android's Back inside the app = tapping outside the coupon (onClose ignores it mid-confirm).
  useNativeBackHandler("overlay", onClose);
  const frame = (node: ReactNode) => (
    <LiveCouponFrame clockOffsetMs={clockOffsetMs} username={username} venueName={venueName}>
      {node}
    </LiveCouponFrame>
  );
  const squarePath = Boolean(win.squareGiftCard) && !useNormalCoupon;
  return (
    <div
      role="dialog" aria-modal="true" aria-label="Confirm redemption"
      className="fixed inset-0 z-[6200] flex flex-col items-center overflow-y-auto bg-black/90 p-4 pb-[max(env(safe-area-inset-bottom),16px)]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* 90% black, not 75%: the prize card has no box of its own, and the list behind must not
          show through around it. */}
      {/* The live coupon makes this taller than a short phone: auto margins pin it to the bottom
          (centred from sm up) when it fits, and let the whole sheet scroll when it doesn't. */}
      <div className="mt-auto w-full max-w-sm animate-in slide-in-from-bottom-4 duration-200 space-y-4 sm:my-auto">
        {errorMessage ? <p role="alert" className="text-sm text-rose-300">{errorMessage}</p> : null}
        {squarePath ? (
          <SquareGiftCardPanel
            win={win}
            userId={userId}
            venueId={venueId}
            coupon={<LargePrizeCard win={win} venueName={venueName} />}
            venueName={venueName}
            frame={frame}
            onIssued={onSquareIssued}
            onAlreadyRedeemed={onSquareAlreadyRedeemed}
            presenceMessage={presenceMessage}
            onUseNormalCoupon={() => setUseNormalCoupon(true)}
            onClose={onClose}
          />
        ) : confirmed ? (
          <div className="rounded-2xl border border-emerald-500/50 bg-emerald-950/80 p-6 text-center">
            <p role="status" className="text-xl font-black text-emerald-300">Redeemed!</p>
            <p className="mt-2 text-sm text-emerald-400/80">Your prize has been recorded. Enjoy!</p>
          </div>
        ) : (
          <>
            <p className="rounded-2xl border border-ht-border-hairline bg-ht-elevated px-4 py-3 text-center text-sm font-semibold text-ht-fg-primary">
              Show this to staff, then tap Confirm Redemption.
            </p>
            {frame(<LargePrizeCard win={win} venueName={venueName} />)}
            {/* Menu-item prize at a Square venue (POS plan Phase 2d): which Square discount staff tap. */}
            {win.squareDiscount ? <SquareDiscountHint win={win} userId={userId} venueId={venueId} /> : null}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={confirming}
                className="tp-player-hit-target tp-player-pressable tp-clean-button flex-1 rounded-xl border border-ht-border-hairline py-3 text-sm font-semibold text-ht-fg-secondary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={confirming}
                className="tp-player-hit-target tp-player-pressable tp-clean-button flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50" aria-busy={confirming}
              >
              {(confirming) ? <ButtonSpinner /> : null}
                {confirming ? "Confirming..." : "Confirm Redemption"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PrizeWalletPanel() {
  const venuePresence = useVenuePresence();
  const [userId, setUserId] = useState("");
  const [username, setUsername] = useState("");
  const [venueId, setVenueId] = useState("");
  // Live coupon: the wallet response carries the server's time and the venue's name (zero extra requests).
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [venueName, setVenueName] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  // Weekly prizes (existing system)
  const [wins, setWins] = useState<PrizeWin[]>([]);
  const [claimingId, setClaimingId] = useState("");

  // Challenge prize coupons
  const [challengeWins, setChallengeWins] = useState<ChallengeCampaignWin[]>([]);

  // Redeem modal
  const [redeemingWin, setRedeemingWin] = useState<ChallengeCampaignWin | null>(null);
  const claimPendingRef = useRef(false);
  const redeemPendingRef = useRef(false);
  const [redeemConfirming, setRedeemConfirming] = useState(false);
  const [redeemConfirmed, setRedeemConfirmed] = useState(false);

  useEffect(() => {
    setUserId(getUserId() ?? "");
    setUsername(getUsername() ?? "");
    setVenueId(getVenueId() ?? "");
  }, []);

  const load = useCallback(async (showLoading = true) => {
    if (!venueId) {
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    setErrorMessage("");
    try {
      const params = new URLSearchParams({ venueId });
      if (userId) params.set("userId", userId);

      // The clock offset is measured when THIS response lands, not after Promise.all, or a
      // slow /api/prizes would make the live coupon's clock run behind.
      const [weeklyRes, challenge] = await Promise.all([
        fetch(`/api/prizes?${params.toString()}`, { cache: "no-store" }),
        userId
          ? fetch(`/api/challenge-campaigns/redeem?userId=${userId}&venueId=${venueId}`, { cache: "no-store" })
              .then((res) => ({ res, receivedAtMs: Date.now() }))
          : Promise.resolve(null),
      ]);

      const weeklyPayload = (await weeklyRes.json()) as {
        ok: boolean;
        wins?: PrizeWin[];
        error?: string;
      };
      if (!weeklyPayload.ok) throw new Error(weeklyPayload.error ?? "Failed to load prizes.");
      setWins(weeklyPayload.wins ?? []);

      if (challenge) {
        const challengePayload = (await challenge.res.json()) as {
          ok: boolean;
          wins?: ChallengeCampaignWin[];
          serverNowMs?: number;
          venueName?: string | null;
          error?: string;
        };
        if (challengePayload.ok) {
          setChallengeWins(challengePayload.wins ?? []);
          setClockOffsetMs(clockOffsetFromServer(challengePayload.serverNowMs, challenge.receivedAtMs));
          setVenueName(challengePayload.venueName ?? "");
        }
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load prize information.");
    } finally {
      setLoading(false);
    }
  }, [userId, venueId]);

  useEffect(() => { void load(); }, [load]);

  // Filter challenge wins: must carry a prize (legacy prizeType or new prizeKind) and not be expired
  const activeChallengeWins = useMemo(() => {
    const now = Date.now();
    return challengeWins.filter((win) => {
      if (!win.prizeType && !win.prizeKind) return false;
      // A coupon already turned into a Square gift card stays: the card outlives the coupon's expiry.
      if (win.squareGiftCard === "issued") return true;
      if (win.prizeExpiresAt && new Date(win.prizeExpiresAt).getTime() < now) return false;
      return true;
    });
  }, [challengeWins]);

  const awardedWins = useMemo(() => wins.filter((w) => w.status === "awarded"), [wins]);
  const claimedWins = useMemo(() => wins.filter((w) => w.status === "claimed"), [wins]);
  const isEmpty = activeChallengeWins.length === 0 && wins.length === 0;

  // ── Weekly prize claim ───────────────────────────────────────────────────
  const claimWeeklyPrize = useCallback(
    async (prizeWin: PrizeWin, sourceRect: DOMRect) => {
      if (!userId || !prizeWin.id || claimPendingRef.current) return;
      claimPendingRef.current = true;
      setClaimingId(prizeWin.id);
      setErrorMessage("");
      setStatusMessage("");
      try {
          const res = await fetch("/api/prizes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "claim", userId, prizeWinId: prizeWin.id }),
          });
          const payload = (await res.json()) as {
            ok: boolean;
            result?: { claimed: boolean; rewardPoints: number; prizeTitle: string };
            error?: string;
          };
          if (!payload.ok || !payload.result) throw new Error(payload.error ?? "Failed to claim prize.");
          if (payload.result.claimed && payload.result.rewardPoints > 0) {
            window.dispatchEvent(new CustomEvent("tp:coin-flight", {
              detail: {
                sourceRect: { left: sourceRect.left, top: sourceRect.top, width: sourceRect.width, height: sourceRect.height },
                delta: payload.result.rewardPoints,
                coins: Math.min(36, Math.max(12, Math.round(payload.result.rewardPoints / 2))),
              },
            }));
            window.dispatchEvent(new CustomEvent("tp:points-updated", {
              detail: { source: "prize-claim", delta: payload.result.rewardPoints },
            }));
          }
          if (payload.result.claimed) haptic("success");
          setStatusMessage(
            payload.result.claimed
              ? `Claimed "${payload.result.prizeTitle}"${payload.result.rewardPoints > 0 ? ` for +${payload.result.rewardPoints} points.` : "."}`
              : "This prize has already been claimed."
          );
          await load(false);
      } catch (error) {
        setStatusMessage("");
        setErrorMessage(error instanceof Error ? error.message : "Failed to claim prize.");
      } finally {
        claimPendingRef.current = false;
        setClaimingId("");
      }
    },
    [load, userId]
  );

  // ── Challenge coupon redeem ──────────────────────────────────────────────
  const handleRedeemOpen = useCallback((win: ChallengeCampaignWin) => {
    setErrorMessage("");
    setRedeemingWin(win);
    setRedeemConfirmed(false);
  }, []);

  const handleRedeemConfirm = useCallback(async () => {
    // A coupon with no challengeId belongs to a reward the partner deleted; it is
    // already-redeemed history and has nothing left to redeem against.
    if (!redeemingWin?.challengeId || !userId || !venueId || redeemPendingRef.current) return;
    redeemPendingRef.current = true;
    setRedeemConfirming(true);
    setErrorMessage("");
    try {
        const res = await fetch("/api/prizes/redeem-challenge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // redemptionId names this exact coupon, so a second tap can't redeem the next one.
          body: JSON.stringify({
            userId,
            venueId,
            challengeId: redeemingWin.challengeId,
            redemptionId: redeemingWin.redemptionId ?? undefined,
          }),
        });
        const payload = (await res.json()) as { ok: boolean; code?: string; error?: string; userMessage?: string };
        const presenceFailure = venuePresence.capturePresenceFailure(payload);
        if (presenceFailure) {
          throw new Error(presenceFailure.userMessage);
        }
        if (!payload.ok && payload.code === "already_redeemed") {
          // A spent coupon must not stay on screen looking live to staff: close it and
          // refresh the list (load() clears the message, so it is set afterwards).
          setRedeemingWin(null);
          await load(false);
          setErrorMessage(payload.error ?? "This prize was already redeemed.");
          return;
        }
        if (!payload.ok) throw new Error(payload.error ?? "Failed to redeem prize.");
        setRedeemConfirmed(true);
        haptic("success");
        await load(false);
        setTimeout(() => {
          setRedeemingWin(null);
          setRedeemConfirmed(false);
        }, 2000);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to redeem prize.");
    } finally {
      redeemPendingRef.current = false;
      setRedeemConfirming(false);
    }
  }, [redeemingWin, userId, venueId, load, venuePresence]);

  // ── Square gift card (docs/pos-rewards-integration-plan.md Phase 2) ───────
  const handleSquareIssued = useCallback(() => {
    // The coupon is now redeemed (method pos_square); refresh the list behind the sheet so it
    // shows "Show gift card". The sheet itself stays open on the card.
    void load(false);
  }, [load]);

  const handleSquareAlreadyRedeemed = useCallback(
    async (message: string) => {
      setRedeemingWin(null);
      await load(false);
      setErrorMessage(message);
    },
    [load]
  );

  const presenceMessage = useCallback(
    (payload: unknown) => venuePresence.capturePresenceFailure(payload)?.userMessage ?? null,
    [venuePresence]
  );

  // ── Render ───────────────────────────────────────────────────────────────

  if (!venueId) {
    return (
      <div className="rounded-ht-2xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-300">
        Join a venue to view your prizes.
      </div>
    );
  }

  if (loading) {
    return <HightopLoader size="sm" variant="card" showLabel label="Loading prizes..." />;
  }

  return (
    <>
      {redeemingWin && (
        <RedeemModal
          win={redeemingWin}
          onConfirm={handleRedeemConfirm}
          onClose={() => { if (!redeemConfirming) setRedeemingWin(null); }}
          confirming={redeemConfirming}
          confirmed={redeemConfirmed}
          errorMessage={errorMessage}
          clockOffsetMs={clockOffsetMs}
          username={username || null}
          venueName={venueName || null}
          userId={userId}
          venueId={venueId}
          onSquareIssued={handleSquareIssued}
          onSquareAlreadyRedeemed={(message) => void handleSquareAlreadyRedeemed(message)}
          presenceMessage={presenceMessage}
        />
      )}

      <div className="space-y-4">
        {errorMessage && (
          <p className="rounded-ht-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400" role="alert">
            {errorMessage}
          </p>
        )}
        {statusMessage && (
          <p className="rounded-ht-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400" role="status">
            {statusMessage}
          </p>
        )}

        {isEmpty ? (
          <div className="rounded-ht-2xl border border-ht-border-hairline bg-ht-elevated p-8 text-center">
            <p className="text-sm text-ht-fg-muted">
              No prizes yet. Win one here and it will show up in this list.
            </p>
          </div>
        ) : (
          <>
            {/* Challenge prize coupons */}
            {activeChallengeWins.length > 0 && (
              <section aria-label="Your prizes" className="space-y-6">
                {activeChallengeWins.map((win) => (
                  // One reward can hold several coupons for the same player (a weekly places
                  // reward pays a new one every week), so the coupon's own id comes first.
                  // challengeId is null on a coupon whose reward was deleted, and several
                  // such rows can coexist — the last fallback uses the fields that uniquely
                  // identify the win itself.
                  <WalletPrizeCard
                    key={win.redemptionId ?? win.challengeId ?? `detached:${win.cycleStart ?? ""}:${win.claimedAt ?? ""}`}
                    win={win}
                    venueName={venueName || null}
                    onRedeem={handleRedeemOpen}
                  />
                ))}
              </section>
            )}

            {/* Weekly prize wins */}
            {wins.length > 0 && (
              <section className="rounded-ht-2xl border border-ht-border-hairline bg-ht-elevated p-4 space-y-3">
                <div>
                  <h2 className="text-base font-semibold text-ht-fg-primary">Weekly Prize Wins</h2>
                  <p className="mt-0.5 text-xs text-ht-fg-muted">
                    Awarded: <span className="font-semibold">{awardedWins.length}</span> · Claimed:{" "}
                    <span className="font-semibold">{claimedWins.length}</span>
                  </p>
                </div>
                <ul className="space-y-2">
                  {wins.map((win) => (
                    <li key={win.id} className="rounded-ht-lg border border-ht-border-hairline bg-ht-surface p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-ht-fg-primary">{win.prizeTitle}</p>
                          {win.prizeDescription && (
                            <p className="mt-0.5 text-xs text-ht-fg-secondary">{win.prizeDescription}</p>
                          )}
                          <p className="mt-1 text-caption text-ht-fg-muted">Awarded {formatDate(win.awardedAt)}</p>
                          {win.rewardPoints > 0 && (
                            <p className="mt-0.5 text-xs font-semibold text-ht-fg-secondary">
                              +{win.rewardPoints} points
                            </p>
                          )}
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-caption font-semibold ${
                            win.status === "claimed"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-amber-500/15 text-amber-300"
                          }`}
                        >
                          {win.status === "claimed" ? "Claimed" : "Awarded"}
                        </span>
                      </div>
                      {win.status === "awarded" && (
                        <button
                          type="button"
                          disabled={Boolean(claimingId)}
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            void claimWeeklyPrize(win, rect);
                          }}
                          className="tp-player-hit-target tp-player-pressable tp-clean-button mt-2 rounded-ht-md border border-indigo-500/50 bg-indigo-500/15 px-2 py-1 text-xs font-semibold text-indigo-300 disabled:opacity-60" aria-busy={claimingId === win.id}
                        >
              {(claimingId === win.id) ? <ButtonSpinner /> : null}
                          {claimingId === win.id ? "Claiming..." : "Claim Prize"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
