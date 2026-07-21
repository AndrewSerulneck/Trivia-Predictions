"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getUserId, getVenueId } from "@/lib/storage";
import { BouncingBallLoader } from "@/components/ui/BouncingBallLoader";
import { useVenuePresence } from "@/components/venue/VenuePresenceBoundary";
import type { ChallengeCampaignWin, PrizeType, PrizeWin, RewardMenuItem } from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "Unknown date";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getExpiryInfo(expiresAt: string): {
  label: string;
  className: string;
} {
  const ms = new Date(expiresAt).getTime() - Date.now();
  const hours = ms / (1000 * 60 * 60);
  if (hours <= 24) {
    return { label: "Expires today!", className: "text-red-400 font-semibold" };
  }
  if (hours <= 48) {
    return { label: "Expires tomorrow", className: "text-amber-400 font-semibold" };
  }
  const days = Math.ceil(hours / 24);
  return { label: `Expires in ${days} days`, className: "text-ht-fg-muted" };
}

function prizeLabel(prizeType: PrizeType): string {
  if (prizeType === "wine_bottle") return "BOTTLE OF WINE";
  if (prizeType === "free_appetizer") return "FREE APPETIZER";
  return "GIFT CERTIFICATE";
}

// ── Rewards (Phase 2/6) prize-model display helpers ──────────────────────────

const MENU_ITEM_LABEL: Record<RewardMenuItem, string> = {
  whole_order: "Whole Order",
  appetizer: "Appetizer",
  entree: "Entrée",
  dessert: "Dessert",
  wine_bottle: "Bottle of Wine",
  other: "Menu Item",
};

function menuItemLabel(win: ChallengeCampaignWin): string {
  if (win.prizeMenuItem === "other") return win.prizeMenuItemName?.trim() || "Menu Item";
  return win.prizeMenuItem ? MENU_ITEM_LABEL[win.prizeMenuItem] : "Menu Item";
}

function discountLabel(win: ChallengeCampaignWin): string {
  if (win.prizeDiscountKind === "percent" && win.prizeDiscountValue != null) {
    return win.prizeDiscountValue >= 100 ? "FREE" : `${win.prizeDiscountValue}% OFF`;
  }
  if (win.prizeDiscountKind === "dollar" && win.prizeDiscountValue != null) {
    return `$${win.prizeDiscountValue.toFixed(2)} OFF`;
  }
  return "";
}

// ─── Coupon Cards ─────────────────────────────────────────────────────────────

type CouponCardProps = {
  win: ChallengeCampaignWin;
  onRedeem: (win: ChallengeCampaignWin) => void;
  large?: boolean;
};

function WineCoupon({ win, onRedeem, large }: CouponCardProps) {
  const expiry = win.prizeExpiresAt ? getExpiryInfo(win.prizeExpiresAt) : null;
  const redeemed = Boolean(win.prizeRedeemedAt);

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-rose-700/60 bg-gradient-to-br from-rose-950 to-rose-900/80 p-4">
      <div className="absolute inset-x-0 top-0 flex h-1.5">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className={`flex-1 ${i % 2 === 0 ? "bg-rose-700/60" : "bg-rose-950"}`} />
        ))}
      </div>
      <div className="mt-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-400/70">Prize Coupon</p>
        <p className={`mt-0.5 font-black tracking-wide text-rose-100 ${large ? "text-2xl" : "text-xl"}`}>
          BOTTLE OF WINE
        </p>
        <p className="mt-1 text-xs text-rose-300/80">Won from: {win.challengeName}</p>
      </div>
      <div className="my-3 border-t border-dashed border-rose-700/50" />
      <div className="flex items-end justify-between">
        <div className="space-y-0.5">
          <p className="text-[11px] text-rose-400/70">Awarded {formatDate(win.claimedAt ?? "")}</p>
          {expiry && !redeemed && (
            <p className={`text-[11px] ${expiry.className}`}>{expiry.label}</p>
          )}
        </div>
        {redeemed ? (
          <span className="rounded-full border border-rose-700/50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-rose-400/60">
            Redeemed
          </span>
        ) : !large ? (
          <button
            type="button"
            onClick={() => onRedeem(win)}
            className="tp-clean-button rounded-lg border border-rose-500/60 bg-rose-500/20 px-6 py-3 text-sm font-bold text-rose-200 hover:bg-rose-500/30"
          >
            Redeem
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AppetizerCoupon({ win, onRedeem, large }: CouponCardProps) {
  const expiry = win.prizeExpiresAt ? getExpiryInfo(win.prizeExpiresAt) : null;
  const redeemed = Boolean(win.prizeRedeemedAt);

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-700/60 bg-gradient-to-br from-emerald-950 to-emerald-900/80 p-4">
      <div className="absolute inset-0 rounded-2xl border-4 border-emerald-700/20 m-1.5 pointer-events-none" />
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400/70">Prize Coupon</p>
      <p className={`mt-0.5 font-black tracking-wide text-emerald-100 ${large ? "text-2xl" : "text-xl"}`}>
        FREE APPETIZER
      </p>
      <p className="mt-1 text-xs text-emerald-300/80">Won from: {win.challengeName}</p>
      <div className="my-3 border-t border-dashed border-emerald-700/50" />
      <div className="flex items-end justify-between">
        <div className="space-y-0.5">
          <p className="text-[11px] text-emerald-400/70">Awarded {formatDate(win.claimedAt ?? "")}</p>
          {expiry && !redeemed && (
            <p className={`text-[11px] ${expiry.className}`}>{expiry.label}</p>
          )}
        </div>
        {redeemed ? (
          <span className="rounded-full border border-emerald-700/50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-400/60">
            Redeemed
          </span>
        ) : !large ? (
          <button
            type="button"
            onClick={() => onRedeem(win)}
            className="tp-clean-button rounded-lg border border-emerald-500/60 bg-emerald-500/20 px-6 py-3 text-sm font-bold text-emerald-200 hover:bg-emerald-500/30"
          >
            Redeem
          </button>
        ) : null}
      </div>
    </div>
  );
}

function GiftCertificateCoupon({ win, onRedeem, large }: CouponCardProps) {
  const expiry = win.prizeExpiresAt ? getExpiryInfo(win.prizeExpiresAt) : null;
  const redeemed = Boolean(win.prizeRedeemedAt);
  const amount = win.prizeGiftCertificateAmount;

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-amber-500/60 bg-gradient-to-br from-amber-950 to-amber-900/80 p-4">
      <div className="absolute inset-0 rounded-2xl border-4 border-double border-amber-500/30 m-1 pointer-events-none" />
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/70">Prize Coupon</p>
      {amount != null && (
        <p className={`font-black text-amber-300 ${large ? "text-4xl" : "text-3xl"}`}>
          ${amount.toFixed(2)}
        </p>
      )}
      <p className={`font-black tracking-wide text-amber-100 ${large ? "text-xl" : "text-lg"}`}>
        GIFT CERTIFICATE
      </p>
      <p className="mt-1 text-xs text-amber-300/80">Won from: {win.challengeName}</p>
      <div className="my-3 border-t border-dashed border-amber-500/40" />
      <div className="flex items-end justify-between">
        <div className="space-y-0.5">
          <p className="text-[11px] text-amber-400/70">Awarded {formatDate(win.claimedAt ?? "")}</p>
          {expiry && !redeemed && (
            <p className={`text-[11px] ${expiry.className}`}>{expiry.label}</p>
          )}
        </div>
        {redeemed ? (
          <span className="rounded-full border border-amber-500/40 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-400/60">
            Redeemed
          </span>
        ) : !large ? (
          <button
            type="button"
            onClick={() => onRedeem(win)}
            className="tp-clean-button rounded-lg border border-amber-400/60 bg-amber-500/20 px-6 py-3 text-sm font-bold text-amber-200 hover:bg-amber-500/30"
          >
            Redeem
          </button>
        ) : null}
      </div>
    </div>
  );
}

function GiftCardCoupon({ win, onRedeem, large }: CouponCardProps) {
  const expiry = win.prizeExpiresAt ? getExpiryInfo(win.prizeExpiresAt) : null;
  const redeemed = Boolean(win.prizeRedeemedAt);
  const amount = win.prizeGiftCertificateAmount;

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-amber-500/60 bg-gradient-to-br from-amber-950 to-amber-900/80 p-4">
      <div className="absolute inset-0 rounded-2xl border-4 border-double border-amber-500/30 m-1 pointer-events-none" />
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/70">Prize Coupon</p>
      {amount != null && (
        <p className={`font-black text-amber-300 ${large ? "text-4xl" : "text-3xl"}`}>
          ${amount.toFixed(2)}
        </p>
      )}
      <p className={`font-black tracking-wide text-amber-100 ${large ? "text-xl" : "text-lg"}`}>
        GIFT CARD
      </p>
      <p className="mt-1 text-xs text-amber-300/80">Won from: {win.challengeName}</p>
      <div className="my-3 border-t border-dashed border-amber-500/40" />
      <div className="flex items-end justify-between">
        <div className="space-y-0.5">
          <p className="text-[11px] text-amber-400/70">Awarded {formatDate(win.claimedAt ?? "")}</p>
          {expiry && !redeemed && (
            <p className={`text-[11px] ${expiry.className}`}>{expiry.label}</p>
          )}
        </div>
        {redeemed ? (
          <span className="rounded-full border border-amber-500/40 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-400/60">
            Redeemed
          </span>
        ) : !large ? (
          <button
            type="button"
            onClick={() => onRedeem(win)}
            className="tp-clean-button rounded-lg border border-amber-400/60 bg-amber-500/20 px-6 py-3 text-sm font-bold text-amber-200 hover:bg-amber-500/30"
          >
            Redeem
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MenuItemCoupon({ win, onRedeem, large }: CouponCardProps) {
  const expiry = win.prizeExpiresAt ? getExpiryInfo(win.prizeExpiresAt) : null;
  const redeemed = Boolean(win.prizeRedeemedAt);
  const isWineBottle = win.prizeMenuItem === "wine_bottle";
  const isAppetizer = win.prizeMenuItem === "appetizer";
  // Preserve the thematic wine/appetizer looks; everything else (entrée, dessert,
  // whole order, other) shares a generic indigo theme.
  const theme = isWineBottle
    ? {
        border: "border-rose-700/60",
        gradient: "from-rose-950 to-rose-900/80",
        eyebrow: "text-rose-400/70",
        title: "text-rose-100",
        sub: "text-rose-300/80",
        divider: "border-rose-700/50",
        awarded: "text-rose-400/70",
        redeemedText: "border-rose-700/50 text-rose-400/60",
        buttonBorder: "border-rose-500/60 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30",
      }
    : isAppetizer
      ? {
          border: "border-emerald-700/60",
          gradient: "from-emerald-950 to-emerald-900/80",
          eyebrow: "text-emerald-400/70",
          title: "text-emerald-100",
          sub: "text-emerald-300/80",
          divider: "border-emerald-700/50",
          awarded: "text-emerald-400/70",
          redeemedText: "border-emerald-700/50 text-emerald-400/60",
          buttonBorder: "border-emerald-500/60 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30",
        }
      : {
          border: "border-indigo-600/60",
          gradient: "from-indigo-950 to-indigo-900/80",
          eyebrow: "text-indigo-400/70",
          title: "text-indigo-100",
          sub: "text-indigo-300/80",
          divider: "border-indigo-700/50",
          awarded: "text-indigo-400/70",
          redeemedText: "border-indigo-700/50 text-indigo-400/60",
          buttonBorder: "border-indigo-500/60 bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30",
        };

  const discount = discountLabel(win);

  return (
    <div className={`relative overflow-hidden rounded-2xl border-2 ${theme.border} bg-gradient-to-br ${theme.gradient} p-4`}>
      <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${theme.eyebrow}`}>Prize Coupon</p>
      {discount && (
        <p className={`font-black text-amber-300 ${large ? "text-3xl" : "text-2xl"}`}>{discount}</p>
      )}
      <p className={`font-black tracking-wide ${theme.title} ${large ? "text-xl" : "text-lg"}`}>
        {menuItemLabel(win).toUpperCase()}
      </p>
      <p className={`mt-1 text-xs ${theme.sub}`}>Won from: {win.challengeName}</p>
      <div className={`my-3 border-t border-dashed ${theme.divider}`} />
      <div className="flex items-end justify-between">
        <div className="space-y-0.5">
          <p className={`text-[11px] ${theme.awarded}`}>Awarded {formatDate(win.claimedAt ?? "")}</p>
          {expiry && !redeemed && (
            <p className={`text-[11px] ${expiry.className}`}>{expiry.label}</p>
          )}
        </div>
        {redeemed ? (
          <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${theme.redeemedText}`}>
            Redeemed
          </span>
        ) : !large ? (
          <button
            type="button"
            onClick={() => onRedeem(win)}
            className={`tp-clean-button rounded-lg border px-6 py-3 text-sm font-bold ${theme.buttonBorder}`}
          >
            Redeem
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ChallengeCoupon({ win, onRedeem, large }: CouponCardProps) {
  // Rewards (Phase 2+) prize model takes precedence; the backend derives
  // prizeKind from legacy prizeType when null, so this covers every row.
  if (win.prizeKind === "gift_card") return <GiftCardCoupon win={win} onRedeem={onRedeem} large={large} />;
  if (win.prizeKind === "menu_item") return <MenuItemCoupon win={win} onRedeem={onRedeem} large={large} />;
  if (win.prizeType === "wine_bottle") return <WineCoupon win={win} onRedeem={onRedeem} large={large} />;
  if (win.prizeType === "free_appetizer") return <AppetizerCoupon win={win} onRedeem={onRedeem} large={large} />;
  if (win.prizeType === "gift_certificate") return <GiftCertificateCoupon win={win} onRedeem={onRedeem} large={large} />;
  return null;
}

// ─── Redeem Modal ─────────────────────────────────────────────────────────────

type RedeemModalProps = {
  win: ChallengeCampaignWin;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  confirming: boolean;
  confirmed: boolean;
};

function RedeemModal({ win, onConfirm, onClose, confirming, confirmed }: RedeemModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-4 sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm animate-in slide-in-from-bottom-4 duration-200 space-y-4">
        {confirmed ? (
          <div className="rounded-2xl border border-emerald-500/50 bg-emerald-950/80 p-6 text-center">
            <p className="text-xl font-black text-emerald-300">Redeemed!</p>
            <p className="mt-2 text-sm text-emerald-400/80">Your prize has been recorded. Enjoy!</p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-ht-border-hairline bg-ht-elevated p-4 text-center space-y-1">
              <p className="text-sm font-semibold text-ht-fg-primary">
                Show this coupon to venue staff
              </p>
              <p className="text-xs text-ht-fg-muted">
                Tap &ldquo;Confirm Redemption&rdquo; once the staff member has acknowledged it.
              </p>
            </div>
            <ChallengeCoupon win={win} onRedeem={() => {}} large />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={confirming}
                className="tp-clean-button flex-1 rounded-xl border border-ht-border-hairline py-3 text-sm font-semibold text-ht-fg-secondary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={confirming}
                className="tp-clean-button flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
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
  const [venueId, setVenueId] = useState("");
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
  const [redeemConfirming, setRedeemConfirming] = useState(false);
  const [redeemConfirmed, setRedeemConfirmed] = useState(false);

  useEffect(() => {
    setUserId(getUserId() ?? "");
    setVenueId(getVenueId() ?? "");
  }, []);

  const load = useCallback(async () => {
    if (!venueId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage("");
    try {
      const params = new URLSearchParams({ venueId });
      if (userId) params.set("userId", userId);

      const [weeklyRes, challengeRes] = await Promise.all([
        fetch(`/api/prizes?${params.toString()}`, { cache: "no-store" }),
        userId
          ? fetch(`/api/challenge-campaigns/redeem?userId=${userId}&venueId=${venueId}`, { cache: "no-store" })
          : Promise.resolve(null),
      ]);

      const weeklyPayload = (await weeklyRes.json()) as {
        ok: boolean;
        wins?: PrizeWin[];
        error?: string;
      };
      if (!weeklyPayload.ok) throw new Error(weeklyPayload.error ?? "Failed to load prizes.");
      setWins(weeklyPayload.wins ?? []);

      if (challengeRes) {
        const challengePayload = (await challengeRes.json()) as {
          ok: boolean;
          wins?: ChallengeCampaignWin[];
          error?: string;
        };
        if (challengePayload.ok) {
          setChallengeWins(challengePayload.wins ?? []);
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
      if (!userId || !prizeWin.id || claimingId) return;
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
        setStatusMessage(
          payload.result.claimed
            ? `Claimed "${payload.result.prizeTitle}"${payload.result.rewardPoints > 0 ? ` for +${payload.result.rewardPoints} points.` : "."}`
            : "This prize has already been claimed."
        );
        await load();
      } catch (error) {
        setStatusMessage("");
        setErrorMessage(error instanceof Error ? error.message : "Failed to claim prize.");
      } finally {
        setClaimingId("");
      }
    },
    [claimingId, load, userId]
  );

  // ── Challenge coupon redeem ──────────────────────────────────────────────
  const handleRedeemOpen = useCallback((win: ChallengeCampaignWin) => {
    setRedeemingWin(win);
    setRedeemConfirmed(false);
  }, []);

  const handleRedeemConfirm = useCallback(async () => {
    if (!redeemingWin || !userId || !venueId) return;
    setRedeemConfirming(true);
    setErrorMessage("");
    try {
      const res = await fetch("/api/prizes/redeem-challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, venueId, challengeId: redeemingWin.challengeId }),
      });
      const payload = (await res.json()) as { ok: boolean; code?: string; error?: string; userMessage?: string };
      const presenceFailure = venuePresence.capturePresenceFailure(payload);
      if (presenceFailure) {
        throw new Error(presenceFailure.userMessage);
      }
      if (!payload.ok) throw new Error(payload.error ?? "Failed to redeem prize.");
      setRedeemConfirmed(true);
      await load();
      setTimeout(() => {
        setRedeemingWin(null);
        setRedeemConfirmed(false);
      }, 2000);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to redeem prize.");
      setRedeemingWin(null);
    } finally {
      setRedeemConfirming(false);
    }
  }, [redeemingWin, userId, venueId, load, venuePresence]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (!venueId) {
    return (
      <div className="rounded-ht-2xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-300">
        Join a venue to view your prizes.
      </div>
    );
  }

  if (loading) {
    return <BouncingBallLoader size="sm" label="Loading prizes..." />;
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
        />
      )}

      <div className="space-y-4">
        {errorMessage && (
          <p className="rounded-ht-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400">
            {errorMessage}
          </p>
        )}
        {statusMessage && (
          <p className="rounded-ht-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400">
            {statusMessage}
          </p>
        )}

        {isEmpty ? (
          <div className="rounded-ht-2xl border border-ht-border-hairline bg-ht-elevated p-8 text-center">
            <p className="text-sm text-ht-fg-muted">
              Sorry, you currently do not have any prizes to redeem.
            </p>
          </div>
        ) : (
          <>
            {/* Challenge prize coupons */}
            {activeChallengeWins.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-base font-semibold text-ht-fg-primary">Click "Redeem" on your rewards </h2>
                {activeChallengeWins.map((win) => (
                  <ChallengeCoupon key={win.challengeId} win={win} onRedeem={handleRedeemOpen} />
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
                          <p className="mt-1 text-[11px] text-ht-fg-muted">Awarded {formatDate(win.awardedAt)}</p>
                          {win.rewardPoints > 0 && (
                            <p className="mt-0.5 text-xs font-semibold text-ht-fg-secondary">
                              +{win.rewardPoints} points
                            </p>
                          )}
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
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
                          disabled={claimingId === win.id}
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            void claimWeeklyPrize(win, rect);
                          }}
                          className="tp-clean-button mt-2 rounded-ht-md border border-indigo-500/50 bg-indigo-500/15 px-2 py-1 text-xs font-semibold text-indigo-300 disabled:opacity-60"
                        >
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
