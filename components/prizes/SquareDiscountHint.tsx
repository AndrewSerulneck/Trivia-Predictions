"use client";

import { useEffect, useState } from "react";
import type { ChallengeCampaignWin } from "@/types";

// The staff line on a menu-item coupon at a Square-connected venue
// (docs/pos-rewards-integration-plan.md Phase 2d).
//
// On open it asks POST /api/prizes/square-discount for the ready-made Square discount that
// matches this prize ("Hightop prize: 50% off Appetizer (max $12)"; created in the partner's
// Square on first use) and shows its name so staff can tap it. Square does the math and the
// cap. Staff then confirm the coupon as before.
//
// Shows nothing while loading and nothing on any failure: the coupon above already says what the
// prize is, so staff can always take it off by hand. One request per open; no retries, no polling.

export type SquareDiscountHintProps = {
  win: ChallengeCampaignWin;
  userId: string;
  venueId: string;
};

export const SquareDiscountHint = ({ win, userId, venueId }: SquareDiscountHintProps) => {
  const [name, setName] = useState<string | null>(null);
  const redemptionId = win.redemptionId ?? null;

  useEffect(() => {
    if (!redemptionId || !userId || !venueId) return;
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch("/api/prizes/square-discount", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ userId, venueId, redemptionId }),
        });
        const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; discount?: { name?: string } };
        const found = payload.discount?.name?.trim();
        if (!cancelled && res.ok && payload.ok && found) setName(found);
      } catch {
        // Nothing to show; staff take the prize off by hand.
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [redemptionId, userId, venueId]);

  if (!name) return null;
  return (
    <div
      data-square-discount
      className="rounded-2xl border border-emerald-500/40 bg-emerald-950/60 p-4 text-left space-y-1.5"
    >
      <p className="text-caption font-bold uppercase tracking-[0.2em] text-emerald-400/80">For staff · Square register</p>
      <p className="text-xs text-emerald-200/80">In Square, add this discount to the sale:</p>
      <p className="text-base font-black leading-snug text-emerald-100">{name}</p>
      <p className="text-xs text-emerald-200/80">Square takes off the right amount. Then tap &ldquo;Confirm Redemption&rdquo;.</p>
    </div>
  );
};
