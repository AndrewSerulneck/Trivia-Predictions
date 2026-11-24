"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AppDownloadQr, appDownloadQrPlatePx } from "@/components/venue-screen/AppDownloadQr";
import { ShineSweep } from "@/components/venue-screen/fx/ShineSweep";
import { useFx, useFxTier } from "@/components/venue-screen/fx/useFx";
import { useHydrated } from "@/components/venue-screen/fx/useHydrated";
import { APP_DOWNLOAD_DISPLAY_URL } from "@/lib/appDownloadLink";
import { formatNextLiveTriviaSentence, formatNextLiveTriviaWhen } from "@/lib/venueScreenIdleLine";
import { SCREEN_COLORS, SCREEN_EASE as EASE } from "@/lib/venueScreenBrand";

/* ------------------------------------------------------------------ *
 * <TvIdleAttract />  — the screen that runs for hours: get the app.
 *
 * Slide 5 of the idle carousel (docs/fire-tv-app-plan.md D20, Phase 11), and the whole idle screen when nothing else
 * has anything to show. One focal point, a still high-contrast QR to hightopchallenge.com/app (AppDownloadQr). Everything that
 * moves does so around it: the ambient wash, the breathing halo and rings behind the plate, the wordmark
 * shine, and the slow burn-in drift. The QR plate itself never animates and nothing is layered over it.
 * (Andrew 2026-11-14, D12: idle is an animated app-download screen; no game card, no tagline.)
 *
 * Every piece of timing is derived from the wall clock rather than from an incrementing counter, so a
 * remount (or a second TV in the same room) lands on the same drift offset and the same phase of the breath.
 * `now` is a prop (VenueScreenClient's already-ticking `nowMs`) so this screen doesn't spin up its own timer.
 * ------------------------------------------------------------------ */

/** The idle "moment" (logo shine + burst) fires on every wall-clock slot of this length. */
export const IDLE_MOMENT_MS = 75_000;

export type TvIdleAttractProps = {
  venueName: string;
  /** The next scheduled Live Trivia game, if any (drives the one small line). */
  nextLiveTrivia?: { startsAt: string; recurringDays: readonly string[] } | null;
  /** The carousel's ticker and dots are showing: keep the bottom 200 px clear and drop the footer line. */
  tickerVisible?: boolean;
  /** The parent's ticking clock (VenueScreenClient's `nowMs`). */
  nowMs: number;
  /** Peak pixel-shift amplitude for burn-in mitigation. */
  driftPx?: number;
};

const BRAND = {
  cyan: SCREEN_COLORS.cyan500,
  cyanLight: SCREEN_COLORS.cyan400,
  amber: SCREEN_COLORS.amber500,
  amberLight: SCREEN_COLORS.amber400,
  slate: "#94a3b8",
};

/* Drift periods are deliberately non-harmonic so the pair never settles
   into a short repeating path — the content walks a slow open curve. */
const DRIFT_X_MS = 227_000;
const DRIFT_Y_MS = 149_000;

const QR_SIZE = 520;
const PLATE_PX = appDownloadQrPlatePx(QR_SIZE);

export function TvIdleAttract({
  venueName,
  nextLiveTrivia = null,
  tickerVisible = false,
  nowMs,
  driftPx = 26,
}: TvIdleAttractProps) {
  const reduceMotion = useReducedMotion();
  // Tier `off` (the frame watchdog found the TV too slow): the QR halo and rings stop, like BrandStage.
  const tier = useFxTier();
  const qrStill = Boolean(reduceMotion) || tier === "off";
  const fx = useFx();
  const hydrated = useHydrated();
  const wordmarkRef = useRef<HTMLDivElement>(null);

  // The 75 s moment: keyed on the wall-clock slot, so two TVs fire together and a reload doesn't add one.
  // It is anchored on the wordmark, away from the QR.
  const momentKey = Math.floor(nowMs / IDLE_MOMENT_MS);
  const [firstMomentKey] = useState(momentKey);
  useEffect(() => {
    if (momentKey === firstMomentKey) return;
    fx.burst({ key: `idle:${momentKey}`, at: wordmarkRef.current, coins: 10, sparks: 26 });
  }, [fx, momentKey, firstMomentKey]);

  /* Burn-in: shift the whole composition along a slow open curve. */
  // Wall-clock positions differ between the server's render and the TV's first one, so it starts after hydration.
  const drift = reduceMotion || !hydrated
    ? { x: 0, y: 0 }
    : {
        x: Math.sin((nowMs / DRIFT_X_MS) * Math.PI * 2) * driftPx,
        y: Math.cos((nowMs / DRIFT_Y_MS) * Math.PI * 2) * driftPx * 0.7,
      };

  const nextLine = hydrated ? formatNextLiveTriviaSentence(formatNextLiveTriviaWhen(nextLiveTrivia, nowMs)) : null;

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ color: "#f8fafc" }}>
      {/* Ambient wash, breathing slowly. Largest bright area on screen, so
          it never sits at a fixed luminance. */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 780px at 22% 12%, rgba(6,182,212,0.13), transparent 62%)," +
            "radial-gradient(1000px 700px at 88% 92%, rgba(245,158,11,0.10), transparent 62%)",
        }}
        animate={reduceMotion ? undefined : { opacity: [0.78, 1, 0.78] }}
        transition={reduceMotion ? undefined : { duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Everything inside drifts together. */}
      <div
        className="relative h-full w-full"
        style={{ transform: `translate3d(${drift.x}px, ${drift.y}px, 0)`, transition: "transform 900ms linear" }}
      >
        {/* Accent bar sits inside the drift and stays dim — a full-width
            bright rule pinned to row 0 for six hours is a burn line. */}
        <div
          className="absolute inset-x-0"
          style={{ top: 0, height: 6, opacity: 0.5, background: `linear-gradient(90deg, ${BRAND.cyan}, ${BRAND.amber} 85%)` }}
        />

        <div className="flex h-full items-center" style={{ padding: `96px 130px ${tickerVisible ? 200 : 96}px` }}>
          {/* ---- Left: wordmark, venue, next game ---- */}
          <div className="flex flex-1 flex-col justify-center" style={{ minWidth: 0 }}>
            <motion.div
              ref={wordmarkRef}
              className="relative -mb-8 -ml-4 -mt-4 self-start overflow-hidden pb-10 pl-4 pr-14 pt-4"
              animate={reduceMotion ? undefined : { scale: [1, 1.014, 1], opacity: [0.94, 1, 0.94] }}
              transition={reduceMotion ? undefined : { duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
              style={{ transformOrigin: "left center" }}
            >
              <ShineSweep periodMs={IDLE_MOMENT_MS} delayMs={0} durationMs={1_400} tint="rgba(255,255,255,0.35)" />
              <motion.div
                key={reduceMotion ? momentKey : "wordmark"}
                initial={reduceMotion && momentKey !== firstMomentKey ? { opacity: 0.6 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.2, ease: EASE }}
                style={{
                  fontSize: 200,
                  fontWeight: 900,
                  lineHeight: 0.94,
                  // Gradient text paints only inside its own box: pad it so g and p keep their tails.
                  paddingBottom: 32,
                  marginBottom: -32,
                  letterSpacing: "-0.055em",
                  backgroundImage: `linear-gradient(100deg, #ffffff 0%, ${BRAND.cyanLight} 46%, ${BRAND.amberLight} 100%)`,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                Hightop
                <br />
                Challenge
              </motion.div>
            </motion.div>

            <div style={{ marginTop: 54, fontSize: 60, fontWeight: 800, letterSpacing: "-0.02em", color: "#e2e8f0" }}>
              {venueName}
            </div>

            {nextLine ? (
              <div
                data-testid="idle-next-live-trivia"
                style={{ marginTop: 22, fontSize: 36, fontWeight: 700, letterSpacing: "0.02em", color: BRAND.slate }}
              >
                {nextLine}
              </div>
            ) : null}
          </div>

          {/* ---- Right: the QR. Halo and rings sit behind the plate and never over it. ---- */}
          <div className="flex flex-col items-center" style={{ width: PLATE_PX + 160 }}>
            <div
              className="relative font-black text-white"
              style={{ fontSize: 76, letterSpacing: "-0.02em", marginBottom: 44 }}
            >
              Get the app
            </div>
            <div className="relative flex items-center justify-center" style={{ width: PLATE_PX, height: PLATE_PX }}>
              <motion.div
                aria-hidden
                data-testid="idle-qr-halo"
                className="pointer-events-none absolute will-change-transform"
                style={{
                  inset: -120,
                  background: `radial-gradient(closest-side, rgba(34,211,238,0.30), rgba(245,158,11,0.12) 62%, transparent 76%)`,
                }}
                animate={qrStill ? undefined : { opacity: [0.55, 1, 0.55], scale: [0.97, 1.03, 0.97] }}
                transition={qrStill ? undefined : { duration: 9, repeat: Infinity, ease: "easeInOut" }}
              />
              {[0, 1].map((i) => (
                <motion.span
                  key={i}
                  aria-hidden
                  data-testid="idle-qr-ring"
                  className="pointer-events-none absolute inset-0 will-change-transform"
                  style={{ borderRadius: 40, border: `3px solid ${BRAND.cyanLight}`, opacity: 0 }}
                  animate={qrStill ? undefined : { scale: [1, 1.26], opacity: [0.5, 0] }}
                  transition={
                    qrStill ? undefined : { duration: 8, repeat: Infinity, ease: "easeOut", delay: i * 4 }
                  }
                />
              ))}
              <div className="relative">
                <AppDownloadQr size={QR_SIZE} caption={false} />
              </div>
            </div>
            <p className="relative font-extrabold tracking-wide text-slate-200" style={{ fontSize: 40, marginTop: 30 }}>
              {APP_DOWNLOAD_DISPLAY_URL}
            </p>
          </div>
        </div>

        {tickerVisible ? null : (
          <footer
            className="absolute inset-x-0 bottom-0 text-center"
            style={{ paddingBottom: 24, fontSize: 22, fontWeight: 800, color: "#475569" }}
          >
            Brought to you by Hightop Challenge&trade;
          </footer>
        )}
      </div>
    </div>
  );
}
