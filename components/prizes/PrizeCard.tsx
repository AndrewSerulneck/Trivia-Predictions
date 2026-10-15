"use client";

import { useState, type MouseEvent } from "react";
import { PrizeCardBackFace, type PrizeCardBackAction } from "@/components/prizes/PrizeCardBackFace";
import { PrizeCardLogo } from "@/components/prizes/PrizeCardLogo";
import { haptic } from "@/lib/haptics";
import { PRIZE_CARD } from "@/lib/themeTokens";
import type { PrizeCardBack, PrizeCardFace } from "@/lib/prizeCardFace";

export { SAMPLE_PRIZE_CARD_FACE } from "@/lib/prizeCardFace";

/**
 * A won prize drawn as one digital gift card (docs/prize-gift-card-redesign-plan.md §2.2–2.6):
 * white stock, one soft cyan→violet glow top-right, the logo top-left, the headline, the venue and
 * a small label. Nothing else goes on the face. Given a `back`, a tap flips it over to the
 * details and the staff action (§2.8; the back is `PrizeCardBackFace.tsx`).
 *
 * Takes a face (`prizeCardFace()` in lib/prizeCardFace.ts), not a win, so the Partner Manual and
 * the email picture can draw `SAMPLE_PRIZE_CARD_FACE`. Colours come only from `PRIZE_CARD`
 * (lib/themeTokens.ts); never an ad-hoc hex here. No requests.
 */

type PrizeCardProps = {
  face: PrizeCardFace;
  /** "list" in the wallet; "large" in the redeem sheet. */
  size?: "list" | "large";
  /** Inside LiveCouponFrame: the frame owns the tap buzz, so the logo (and the flip) stay silent. */
  inLiveFrame?: boolean;
  /**
   * The details on the back (`prizeCardBack()`). With it, a tap anywhere but the logo flips the
   * card (§2.8); without it (the Partner Manual and email sample) the card is flat and never flips.
   */
  back?: PrizeCardBack;
  /** The one button on the back (list cards only; the redeem sheet has Confirm Redemption below). */
  action?: PrizeCardBackAction;
  /** Start face-down. Only the render script uses it, to draw backs in the specimen. */
  initialFlipped?: boolean;
};

// A phrase longer than this steps down one size so it still fits in two lines.
const LONG_PHRASE_CHARS = 22;

const headlineClass = (face: PrizeCardFace, size: "list" | "large"): string => {
  if (face.headlineKind === "amount") {
    // One step smaller on a sub-360 px phone, so the 2× logo above it still has room.
    return size === "large"
      ? "text-6xl max-[359px]:text-4xl font-black leading-none tracking-tight tabular-nums"
      : "text-5xl max-[359px]:text-4xl font-black leading-none tracking-tight tabular-nums";
  }
  const long = face.headline.length > LONG_PHRASE_CHARS;
  const step =
    size === "large" ? (long ? "text-2xl" : "text-3xl") : long ? "text-xl" : "text-2xl";
  return `${step} line-clamp-2 font-extrabold leading-tight text-balance`;
};

const STATUS_CHIP: Record<PrizeCardFace["status"], string | null> = {
  ready: null,
  redeemed: "Redeemed",
  used: "Used",
};

export const PrizeCard = ({
  face,
  size = "list",
  inLiveFrame = false,
  back,
  action,
  initialFlipped = false,
}: PrizeCardProps) => {
  const [flipped, setFlipped] = useState(Boolean(back) && initialFlipped);
  const chip = STATUS_CHIP[face.status];
  const faceClass = `relative isolate overflow-hidden ${PRIZE_CARD.shape} ${PRIZE_CARD.base} ${PRIZE_CARD.shadow} ${PRIZE_CARD.text} [font-family:var(--ht-font-body)] ${
    chip ? "opacity-60 grayscale" : ""
  }`;

  const frontContent = (
    <>
      <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${PRIZE_CARD.glow}`} />
      <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 h-[30%] ${PRIZE_CARD.highlight}`} />

      <div className={`relative flex h-full flex-col ${size === "large" ? "p-6" : "p-5"}`}>
        {/* flex-1 + min-h-0: the logo gets whatever height the headline leaves (PrizeCardLogo caps it). */}
        <div className="flex min-h-0 flex-1 items-start justify-between gap-3 pb-1">
          <PrizeCardLogo size={size} inLiveFrame={inLiveFrame} />
          {chip ? (
            <span data-prize-card-chip className={`rounded-full px-2.5 py-1 text-caption font-semibold ${PRIZE_CARD.chip}`}>
              {chip}
            </span>
          ) : null}
        </div>

        {/* The group's aria-label already reads the face in one sentence. */}
        <div aria-hidden="true" className="shrink-0">
          <p data-prize-card-headline className={`text-right ${headlineClass(face, size)}`}>
            {face.headline}
          </p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <span data-prize-card-venue className={`min-w-0 truncate text-caption uppercase tracking-[0.14em] ${PRIZE_CARD.venueText}`}>
              {face.venueName ?? ""}
            </span>
            <span data-prize-card-label className={`shrink-0 text-caption font-bold uppercase tracking-[0.2em] ${PRIZE_CARD.labelText}`}>
              {face.label}
            </span>
          </div>
        </div>
      </div>

      <div aria-hidden="true" className={`pointer-events-none absolute inset-0 rounded-2xl ${PRIZE_CARD.edge}`} />
    </>
  );

  // No back (the Partner Manual and email sample): the flat card, exactly as before the flip.
  if (!back) {
    return (
      <div
        role="group"
        aria-label={face.ariaLabel}
        data-prize-card
        data-prize-card-status={face.status}
        data-prize-card-front
        className={faceClass}
      >
        {frontContent}
      </div>
    );
  }

  const flip = () => {
    // Inside the live frame its pointer-down already buzzed: one tap, one buzz.
    if (!inLiveFrame) haptic("selection");
    setFlipped((value) => !value);
  };

  // The logo keeps its bounce and a control on the back does its own job; every other tap flips.
  // The tap always bubbles on: the live frame's sparkle is the proof the card isn't a screenshot.
  const handleSurfaceClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("[data-prize-card-logo], [data-prize-card-action]")) return;
    flip();
  };

  return (
    // The perspective root and the rotating element carry NO overflow, opacity or filter: any of
    // them flattens preserve-3d and iOS Safari then shows the back mirrored or not at all. The
    // glow, the clipping and the redeemed grey live on the front face only (plan §5).
    <div
      role="group"
      aria-label={face.ariaLabel}
      data-prize-card
      data-prize-card-status={face.status}
      data-prize-card-flipped={flipped ? "true" : "false"}
      className="relative w-full max-w-sm [perspective:1200px]"
    >
      {/* Keyboard and screen readers: the card itself can't be a button (the logo is one). */}
      <button
        type="button"
        data-prize-card-toggle
        onClick={flip}
        className="sr-only !border-0 focus-visible:not-sr-only focus-visible:absolute focus-visible:right-2 focus-visible:top-2 focus-visible:z-10 focus-visible:!rounded-full focus-visible:bg-slate-950 focus-visible:px-3 focus-visible:py-1.5 focus-visible:text-caption focus-visible:!font-bold focus-visible:text-white"
      >
        {flipped ? "Show front" : "Show details"}
      </button>

      <div
        data-prize-card-flipper
        onClick={handleSurfaceClick}
        className={`relative cursor-pointer select-none [-webkit-tap-highlight-color:transparent] [transform-style:preserve-3d] [-webkit-transform-style:preserve-3d] transition-transform duration-500 ease-out motion-reduce:transition-none ${
          flipped ? "motion-safe:[transform:rotateY(180deg)]" : ""
        }`}
      >
        <div
          data-prize-card-front
          aria-hidden={flipped ? "true" : undefined}
          inert={flipped}
          className={`${faceClass} [backface-visibility:hidden] [-webkit-backface-visibility:hidden] transition-[opacity,visibility] duration-500 motion-reduce:duration-150 ${
            flipped ? "invisible motion-reduce:opacity-0" : "visible"
          }`}
        >
          {frontContent}
        </div>

        <div
          data-prize-card-back
          aria-hidden={flipped ? undefined : "true"}
          inert={!flipped}
          className={`absolute inset-0 overflow-hidden rounded-2xl ${PRIZE_CARD.base} ${PRIZE_CARD.edge} ${PRIZE_CARD.shadow} ${PRIZE_CARD.text} [font-family:var(--ht-font-body)] [backface-visibility:hidden] [-webkit-backface-visibility:hidden] motion-safe:[transform:rotateY(180deg)] transition-[opacity,visibility] duration-500 motion-reduce:duration-150 ${
            flipped ? "visible" : "invisible motion-reduce:opacity-0"
          }`}
        >
          <PrizeCardBackFace back={back} action={action} size={size} />
        </div>
      </div>
    </div>
  );
};
