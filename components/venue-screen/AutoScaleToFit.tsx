"use client";

import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/* ------------------------------------------------------------------ *
 * <AutoScaleToFit /> — the same idea as ViewportFitCanvas, one level in.
 *
 * ViewportFitCanvas scales the whole fixed 16:9 canvas down to whatever
 * viewport loaded the route. This scales a single `Tv*` panel's CONTENT down
 * to the slot the canvas gives it, so a longer category name / venue name /
 * trivia question can never clip again (see
 * docs/venue-tv-display-content-fit-plan.md — Phase 1 sized the canvas for
 * today's content, this phase removes the whole class of bug).
 *
 * Structure: an outer SLOT (fixed at 100% x 100% of whatever space the panel
 * was given, `overflow-hidden`) and an inner CONTENT element that always keeps
 * that same full layout size and is only ever transform-scaled. Content that
 * already fits gets `scale === 1` and no transform at all, so well-behaved
 * panels are pixel-identical to not using this wrapper.
 *
 * Two things this depends on, both easy to break:
 *
 * 1. The slot must actually BE a bound. Every flex ancestor between the canvas
 *    and the panel carries `min-h-0`, because a flex item's default
 *    `min-height: auto` lets the whole column grow to fit its content instead
 *    of overflowing — and content that never overflows is content this
 *    component can never detect. (That is precisely how the canvas ended up
 *    clipping in the first place.)
 * 2. Purely decorative overhang belongs OUTSIDE this wrapper. Panels layer
 *    full-bleed washes, glows and confetti as absolute siblings at their root,
 *    where the root's `overflow-hidden` clips them; measuring an animating
 *    700px glow would swing the scale for as long as it is on screen.
 *
 * Mount it on a panel's own content element, not around a framer-motion
 * animated node — a wrapper transform composes with the node's own keyframes.
 * ------------------------------------------------------------------ */

type AutoScaleToFitProps = {
  children: ReactNode;
  /** Applied to the scaled content element — i.e. the classes the panel would otherwise put on its own content div. */
  className?: string;
  /** Ditto for inline style (padding, colors). Size and transform are owned by this component. */
  style?: CSSProperties;
};

type Fit = { scale: number; offsetX: number; offsetY: number };

const IDENTITY: Fit = { scale: 1, offsetX: 0, offsetY: 0 };

// Sub-pixel slack. `scrollWidth`/`scrollHeight` round to integers, so an exact
// fit routinely reads back one pixel over; without this every panel would sit
// at a pointless 0.999 scale.
const OVERFLOW_SLACK_PX = 1;

const isSameFit = (a: Fit, b: Fit) =>
  Math.abs(a.scale - b.scale) < 0.001 &&
  Math.abs(a.offsetX - b.offsetX) < 0.5 &&
  Math.abs(a.offsetY - b.offsetY) < 0.5;

export function AutoScaleToFit({ children, className, style }: AutoScaleToFitProps) {
  const slotRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState<Fit>(IDENTITY);

  const measure = useCallback(() => {
    const slot = slotRef.current;
    const content = contentRef.current;
    if (!slot || !content) return;

    const availableWidth = slot.clientWidth;
    const availableHeight = slot.clientHeight;
    if (availableWidth <= 0 || availableHeight <= 0) return;

    // Read the natural size off the SLOT, not the content element: Chrome
    // reports no scroll overflow at all for an `overflow: visible` box (it
    // propagates the overflow up to the nearest clipping ancestor instead), so
    // measuring the content element directly always reads back "fits". The
    // slot is `overflow-hidden`, which makes it a scroll container that does
    // report it.
    //
    // The transform is stripped for the duration of the read because the
    // scrollable overflow region is computed from TRANSFORMED boxes — leaving
    // the previous scale on would feed the measurement back into itself. This
    // all happens inside a layout effect, so nothing is ever painted untransformed.
    const previousTransform = content.style.transform;
    content.style.transform = "none";
    let measuredWidth = slot.scrollWidth;
    let measuredHeight = slot.scrollHeight;
    // `scrollWidth`/`scrollHeight` deliberately exclude the content element's
    // own end padding, so a panel silently eats its bottom/right padding before
    // any overflow is reported. Walk the in-flow children too and add the
    // padding back, so the panel keeps the breathing room it was authored with.
    const slotRect = slot.getBoundingClientRect();
    const contentStyle = getComputedStyle(content);
    const paddingRight = parseFloat(contentStyle.paddingRight) || 0;
    const paddingBottom = parseFloat(contentStyle.paddingBottom) || 0;
    for (const child of content.children) {
      const position = getComputedStyle(child).position;
      if (position === "absolute" || position === "fixed") continue;
      const rect = child.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      measuredWidth = Math.max(measuredWidth, rect.right - slotRect.left + paddingRight);
      measuredHeight = Math.max(measuredHeight, rect.bottom - slotRect.top + paddingBottom);
    }
    content.style.transform = previousTransform;

    const naturalWidth =
      measuredWidth > availableWidth + OVERFLOW_SLACK_PX ? measuredWidth : availableWidth;
    const naturalHeight =
      measuredHeight > availableHeight + OVERFLOW_SLACK_PX ? measuredHeight : availableHeight;

    const scale = Math.min(1, availableWidth / naturalWidth, availableHeight / naturalHeight);
    // Scaling from the top-left corner is what actually pulls the overflowing
    // edge back inside the slot (scaling about the centre does not). Whichever
    // axis wasn't the binding constraint is then re-centred by hand.
    const next: Fit = {
      scale,
      offsetX: (availableWidth - scale * naturalWidth) / 2,
      offsetY: (availableHeight - scale * naturalHeight) / 2,
    };
    setFit((current) => (isSameFit(current, next) ? current : next));
  }, []);

  // Deliberately no dependency array: the venue screen re-renders on its
  // once-a-second clock tick and on every poll, so any content change is
  // re-measured within a second without needing a MutationObserver over a
  // subtree that framer-motion is constantly writing to.
  useLayoutEffect(measure);

  // Not the primary trigger (the slot is a fixed 100%x100% and so never
  // resizes on content change) — this is here for the one thing the render
  // tick can't see: the slot itself changing size.
  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!slot || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(slot);
    return () => observer.disconnect();
  }, [measure]);

  const isScaled = fit.scale < 1;

  return (
    <div ref={slotRef} className="relative h-full w-full overflow-hidden">
      <div
        ref={contentRef}
        // Marks the measured element for the venue-screen overflow harness
        // (and the Phase 3 regression guard) — it needs to tell "fits at
        // scale 1" apart from "overflows and wasn't scaled".
        data-auto-scale-to-fit={fit.scale}
        className={className}
        style={{
          ...style,
          width: "100%",
          height: "100%",
          transform: isScaled
            ? `translate(${fit.offsetX}px, ${fit.offsetY}px) scale(${fit.scale})`
            : undefined,
          transformOrigin: isScaled ? "top left" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
