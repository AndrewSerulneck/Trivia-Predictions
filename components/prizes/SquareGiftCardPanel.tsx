"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { Code128Barcode } from "@/components/prizes/Code128Barcode";
import { haptic } from "@/lib/haptics";
import type { ChallengeCampaignWin } from "@/types";

// The Square gift card inside the prize wallet's redeem sheet
// (docs/pos-rewards-integration-plan.md Phase 2).
//
//   "available" coupon → explains, then "Get my Square gift card" turns the prize into a real,
//                        funded Square gift card (POST /api/prizes/square-gift-card).
//   "issued"/"used"    → fetches and shows the card straight away (same endpoint; it only shows).
//
// What staff do: take payment → Gift card → type the number (or scan the barcode with a
// scanner). Square tracks the balance. The number is never stored on the phone — it is held in
// component state only while this sheet is open.

type GiftCard = { gan: string; amountCents: number; balanceCents: number; state: string };

type Phase =
  | { kind: "offer" }
  | { kind: "loading" }
  | { kind: "ready"; giftCard: GiftCard }
  | { kind: "error"; message: string };

export type SquareGiftCardPanelProps = {
  win: ChallengeCampaignWin;
  userId: string;
  venueId: string;
  /** The coupon as the wallet draws it, shown on the offer screen. */
  coupon: ReactNode;
  /** The live coupon frame (moving shimmer, server clock, screen kept awake while staff type). */
  frame: (node: ReactNode) => ReactNode;
  /** The coupon just became a Square gift card — refresh the wallet behind the sheet. */
  onIssued: () => void;
  /** The server says the coupon was already redeemed another way — close and refresh. */
  onAlreadyRedeemed: (message: string) => void;
  /** Turns the venue-presence failure payload into a message, as "Confirm Redemption" does. */
  presenceMessage: (payload: unknown) => string | null;
  /** Leave this panel for the normal coupon (only offered before a card exists). */
  onUseNormalCoupon: () => void;
  onClose: () => void;
};

const dollars = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

const GENERIC_ERROR = "Couldn't reach Square right now. Please try again in a minute.";

export const SquareGiftCardPanel = ({
  win,
  userId,
  venueId,
  coupon,
  frame,
  onIssued,
  onAlreadyRedeemed,
  presenceMessage,
  onUseNormalCoupon,
  onClose,
}: SquareGiftCardPanelProps) => {
  const alreadyIssued = win.squareGiftCard === "issued" || win.squareGiftCard === "used";
  const [phase, setPhase] = useState<Phase>(alreadyIssued ? { kind: "loading" } : { kind: "offer" });
  const pendingRef = useRef(false);

  const open = useCallback(async () => {
    if (!win.redemptionId || pendingRef.current) return;
    pendingRef.current = true;
    setPhase({ kind: "loading" });
    try {
      const res = await fetch("/api/prizes/square-gift-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ userId, venueId, redemptionId: win.redemptionId }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        error?: string;
        giftCard?: GiftCard;
      };
      const presence = presenceMessage(payload);
      if (presence) {
        setPhase({ kind: "error", message: presence });
        return;
      }
      if (payload.ok && payload.giftCard) {
        if (!alreadyIssued) {
          haptic("success");
          onIssued();
        }
        setPhase({ kind: "ready", giftCard: payload.giftCard });
        return;
      }
      if (payload.code === "already_redeemed") {
        onAlreadyRedeemed(payload.error ?? "This prize was already redeemed.");
        return;
      }
      setPhase({ kind: "error", message: payload.error ?? GENERIC_ERROR });
    } catch {
      setPhase({ kind: "error", message: GENERIC_ERROR });
    } finally {
      pendingRef.current = false;
    }
  }, [alreadyIssued, onAlreadyRedeemed, onIssued, presenceMessage, userId, venueId, win.redemptionId]);

  // An existing card is shown without a tap.
  useEffect(() => {
    if (alreadyIssued) void open();
    // Once per sheet: `open` changes identity when the wallet refreshes behind us.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const amount = win.prizeGiftCertificateAmount;

  return (
    <div className="space-y-4">
      {phase.kind === "offer" ? (
        <>
          <div className="space-y-1 rounded-2xl border border-ht-border-hairline bg-ht-elevated p-4 text-center">
            <p className="text-sm font-semibold text-ht-fg-primary">Pay with a Square gift card</p>
            <p className="text-xs text-ht-fg-muted">
              We&apos;ll turn this prize into a {amount != null ? `$${amount.toFixed(2)} ` : ""}Square gift card. Staff ring
              it up at the register like any gift card, and you can use it over more than one visit.
            </p>
          </div>
          {frame(coupon)}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="tp-player-hit-target tp-player-pressable tp-clean-button flex-1 rounded-xl border border-ht-border-hairline py-3 text-sm font-semibold text-ht-fg-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void open()}
              className="tp-player-hit-target tp-player-pressable tp-clean-button flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-500"
            >
              Get my Square gift card
            </button>
          </div>
          <button
            type="button"
            onClick={onUseNormalCoupon}
            className="tp-clean-button w-full text-center text-xs font-semibold text-ht-fg-muted underline underline-offset-2"
          >
            Staff can&apos;t take it? Redeem the normal way
          </button>
        </>
      ) : null}

      {phase.kind === "loading" ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-ht-border-hairline bg-ht-elevated p-6 text-sm font-semibold text-ht-fg-secondary" role="status" aria-busy="true">
          <ButtonSpinner />
          {alreadyIssued ? "Loading your gift card…" : "Creating your Square gift card…"}
        </div>
      ) : null}

      {phase.kind === "error" ? (
        <div className="space-y-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4">
          <p role="alert" className="text-sm font-semibold text-rose-300">{phase.message}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="tp-player-hit-target tp-player-pressable tp-clean-button flex-1 rounded-xl border border-ht-border-hairline py-3 text-sm font-semibold text-ht-fg-secondary"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => void open()}
              className="tp-player-hit-target tp-player-pressable tp-clean-button flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-500"
            >
              Try again
            </button>
          </div>
        </div>
      ) : null}

      {phase.kind === "ready" ? (
        <>
          {frame(
          <div className="space-y-3 rounded-2xl border-2 border-amber-500/60 bg-gradient-to-br from-amber-950 to-amber-900/80 p-4" data-square-gift-card>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/70">Square gift card</p>
              <p className="text-xs font-bold text-amber-200">
                {phase.giftCard.state === "ACTIVE" ? `${dollars(phase.giftCard.balanceCents)} left` : "Not active"}
              </p>
            </div>
            <p className="text-center font-mono text-2xl font-black tracking-wider text-amber-100" aria-label="Gift card number">
              {phase.giftCard.gan}
            </p>
            <Code128Barcode value={phase.giftCard.gan.replace(/\s+/g, "")} label="Gift card barcode" />
            <p className="text-xs text-amber-200/80">
              <span className="font-bold">Staff:</span> take payment → Gift card → enter this number (or scan the
              barcode). Started at {dollars(phase.giftCard.amountCents)}.
            </p>
          </div>,
          )}
          <button
            type="button"
            onClick={onClose}
            className="tp-player-hit-target tp-player-pressable tp-clean-button w-full rounded-xl border border-ht-border-hairline py-3 text-sm font-semibold text-ht-fg-secondary"
          >
            Done
          </button>
        </>
      ) : null}
    </div>
  );
};
