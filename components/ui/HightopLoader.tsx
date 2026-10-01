"use client";

import { useLoaderVisible } from "@/lib/useLoaderVisible";

/**
 * The Hightop loading animation
 * (docs/partner-dashboard-merch-button-loader-speed-plan.md, Phase 3).
 *
 * The logo drops in spinning, lands with a squash, then hops forever: one full
 * clockwise turn in the air, a beat on the ground, then one full turn back the
 * other way. All of it is CSS keyframes from `tailwind.config.ts`
 * (`logo-loader-body` / `-spin` / `-shadow`) animating only transform and
 * opacity, so it costs no JavaScript per frame and can play before a page's own
 * code has run. No framer-motion, no inline styles.
 *
 * Replaces `BouncingBallLoader` everywhere (Andrew, 2026-10-01 — "get rid of the
 * basketball"); the three `variant`s cover that component's three shapes:
 *   plain       ← today's `dark` (bare, for a dark surface)
 *   card        ← today's default (bordered panel)
 *   fullScreen  ← today's `fullScreen` (route/transition overlay)
 *
 * The visible label is opt-in (`showLabel`) because partner screens want silence
 * and the player in-page loaders want their text. `label` is always announced.
 */
export type HightopLoaderSize = "sm" | "md" | "lg";
export type HightopLoaderVariant = "plain" | "card" | "fullScreen";

interface HightopLoaderProps {
  size?: HightopLoaderSize;
  /** Announced by screen readers; also drawn when `showLabel` is set. */
  label?: string;
  /** Draw `label` under the logo (the player screens' behaviour). */
  showLabel?: boolean;
  variant?: HightopLoaderVariant;
  /**
   * Hold off this long before appearing, so a fast load never flashes a loader.
   * Pass 0 when the caller already gates on `useLoaderVisible`.
   */
  delayMs?: number;
  className?: string;
}

/** The 192 px WebP is the one every other surface loads, so it is already cached. */
const LOGO_SRC = "/brand/web/htc-logo-192.webp";

const SIZES: Record<HightopLoaderSize, {
  stage: string;
  logo: string;
  shadow: string;
  px: number;
  gap: string;
  text: string;
}> = {
  // `stage` leaves room above the logo for a hop of 45% of its own height.
  sm: { stage: "h-14 w-14", logo: "h-8 w-8", shadow: "w-7", px: 32, gap: "gap-1.5", text: "text-[10px]" },
  md: { stage: "h-20 w-20", logo: "h-12 w-12", shadow: "w-10", px: 48, gap: "gap-2.5", text: "text-xs" },
  lg: { stage: "h-28 w-28", logo: "h-16 w-16", shadow: "w-14", px: 64, gap: "gap-3.5", text: "text-sm" },
};

export const HightopLoader = ({
  size = "md",
  label = "Loading…",
  showLabel = false,
  variant = "plain",
  delayMs,
  className = "",
}: HightopLoaderProps) => {
  const metrics = SIZES[size];
  const visible = useLoaderVisible(true, delayMs === undefined ? undefined : { delayMs });

  if (!visible) return null;

  const stage = (
    <div aria-hidden="true" className={`relative ${metrics.stage}`}>
      <div
        className={`absolute inset-x-0 bottom-0 mx-auto h-1.5 origin-center rounded-[50%] bg-slate-400/60 ${metrics.shadow} animate-logo-loader-shadow motion-reduce:hidden`}
      />
      <div
        className={`absolute inset-x-0 bottom-2 mx-auto origin-bottom ${metrics.logo} animate-logo-loader-body motion-reduce:animate-none`}
      >
        <div className="h-full w-full origin-center animate-logo-loader-spin motion-reduce:animate-none">
          <img
            src={LOGO_SRC}
            alt=""
            width={metrics.px}
            height={metrics.px}
            className="h-full w-full select-none motion-reduce:animate-logo-pulse"
            draggable={false}
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
        </div>
      </div>
    </div>
  );

  const textClass =
    variant === "fullScreen"
      ? `${metrics.text} font-black tracking-[0.05em] text-white [font-family:var(--ht-font-display)]`
      : `${metrics.text} font-semibold tracking-[0.08em] text-ht-fg-muted`;

  const block = (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center text-center ${metrics.gap} ${
        variant === "card" ? "rounded-ht-xl border border-ht-border-hairline bg-ht-elevated px-4 py-6" : "px-6"
      } ${variant === "fullScreen" ? "" : className}`}
    >
      {stage}
      <p className={showLabel ? textClass : "sr-only"}>{label}</p>
    </div>
  );

  if (variant === "fullScreen") {
    return (
      <div
        className={`pointer-events-none fixed inset-0 z-[2400] flex h-screen w-screen items-center justify-center bg-[#030712] ${className}`}
      >
        {block}
      </div>
    );
  }

  return block;
};
