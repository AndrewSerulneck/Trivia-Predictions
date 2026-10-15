"use client";

import { useState } from "react";
import { haptic } from "@/lib/haptics";
import { PRIZE_CARD } from "@/lib/themeTokens";

/**
 * The Hightop logo on a prize card; it bounces when tapped
 * (docs/prize-gift-card-redesign-plan.md §2.5).
 *
 * - Each tap re-keys the image, so the bounce restarts even mid-bounce (LiveCouponFrame's
 *   `burstKey` pattern). Reduce Motion swaps the travel for a short opacity blink.
 * - Inside `LiveCouponFrame` (`inLiveFrame`) it never buzzes: the frame's own pointer-down
 *   already did, and one moment gets one buzz.
 * - It never stops the tap from reaching the frame — a staff tap here must still sparkle,
 *   because the sparkle is the proof the card isn't a screenshot.
 * - The global phone rules give every enabled `button` `min-height: 36px` (≤430 px) and side
 *   padding (≤380 px) with `!important` at `button:not(:disabled)` specificity; the
 *   `[&:not(:disabled)]:!…` classes out-rank them so the logo stays flush on an iPhone SE.
 * - Only the optimised, year-cached `/brand/web/` webp file, never the 1.7 MB source PNG.
 */

type PrizeCardLogoProps = {
  size: "list" | "large";
  inLiveFrame: boolean;
};

// 80 px (list) / 96 px (large): 2× the Phase 2 size (Andrew, 2026-10-15). The logo fills the
// height the card has left above the headline, capped at that size, so on a narrow phone it
// shrinks instead of pushing the venue row off the card. The 192 px file stays sharp at 2×.
const SIZES = {
  list: { px: 80, image: "max-h-20" },
  large: { px: 96, image: "max-h-24" },
} as const;
const LOGO_SRC = "/brand/web/htc-logo-192.webp";

export const PrizeCardLogo = ({ size, inLiveFrame }: PrizeCardLogoProps) => {
  const [tapKey, setTapKey] = useState(0);
  const metrics = SIZES[size];

  const handleTap = () => {
    if (!inLiveFrame) haptic("selection");
    setTapKey((key) => key + 1);
  };

  return (
    <button
      type="button"
      aria-label="Hightop Challenge"
      data-prize-card-logo
      onClick={handleTap}
      className={`inline-flex h-full min-h-0 shrink-0 rounded-full !border-0 bg-transparent p-0 [&:not(:disabled)]:!min-h-0 [&:not(:disabled)]:!p-0 [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 ${PRIZE_CARD.focusRing}`}
    >
      <img
        key={tapKey}
        src={LOGO_SRC}
        alt=""
        width={metrics.px}
        height={metrics.px}
        draggable={false}
        decoding="async"
        data-prize-card-logo-tap={tapKey > 0 ? "" : undefined}
        className={`aspect-square h-full w-auto ${metrics.image} origin-bottom select-none ${
          tapKey > 0 ? "animate-logo-tap-bounce motion-reduce:animate-logo-tap-dip" : ""
        }`}
      />
    </button>
  );
};
