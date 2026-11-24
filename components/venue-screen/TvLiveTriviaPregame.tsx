"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { GameTileFace } from "@/components/game-themes/GameTileFace";
import { GAME_TILE_THEMES } from "@/components/game-themes/gameTileThemes";
import { VENUE_HUB_TILE_SUBTITLE_BY_KEY } from "@/components/venue/venueHubShared";
import { AppDownloadQr } from "@/components/venue-screen/AppDownloadQr";
import { FlipChar } from "@/components/venue-screen/fx/FlipChar";
import { LightStreak, OneShotShine } from "@/components/venue-screen/fx/MomentOverlays";
import { useFxMoment, useFxTier } from "@/components/venue-screen/fx/useFx";
import { useReducedMotionAfterHydration } from "@/components/venue-screen/fx/useReducedMotionAfterHydration";
import type { VenueScreenState } from "@/lib/venueScreen";
import { SCREEN_COLORS } from "@/lib/venueScreenBrand";
import { formatPregameCountdown } from "@/lib/venueScreenIdleLine";

// The hour before a Live Trivia game (docs/live-trivia-pregame-and-display-cleanup-plan.md, Phase 3; 60 minutes since
// docs/fire-tv-app-plan.md D13): a "LIVE TRIVIA" title, one focal countdown, then three steps (get the app, sign in, tap Live Trivia). The QR stays still, high-contrast
// and uncovered (AppDownloadQr). The Live Trivia button is the real Venue Home tile (GameTileFace), scaled up.
// Precedence and the window itself live in `selectVenueScreenState`; this only draws what it is handed.

/** Digits beat once a second inside the last five minutes (same threshold as the idle countdown it replaces). */
export const PREGAME_HEARTBEAT_UNDER_S = 300;

const TILE_WIDTH = 380; // the phone tile's width; the TV replica is this, scaled
const TILE_HEIGHT = 176;
const TILE_SCALE = 2;
const QR_SIZE = 270;

type PregameState = Extract<VenueScreenState, { mode: "live-trivia-pregame" }>;

type TvLiveTriviaPregameProps = {
  state: PregameState;
  /** The parent's ticking clock (VenueScreenClient's `nowMs`). */
  nowMs: number;
  accent: string;
};

const Step = ({ n, label, children }: { n: number; label: string; children: ReactNode }) => (
  <div className="flex flex-col items-center">
    <div className="flex items-center" style={{ gap: 24 }}>
      <span
        className="flex items-center justify-center rounded-full bg-white font-black text-slate-950"
        style={{ width: 76, height: 76, fontSize: 48 }}
      >
        {n}
      </span>
      <span className="font-black text-white" style={{ fontSize: 60, letterSpacing: "-0.02em" }}>
        {label}
      </span>
    </div>
    <div className="flex flex-1 items-center justify-center" style={{ marginTop: 32 }}>
      {children}
    </div>
  </div>
);

export function TvLiveTriviaPregame({ state, nowMs, accent }: TvLiveTriviaPregameProps) {
  const { gameId, startsAt, firstRoundCategory } = state.pregame;
  const reduceMotion = useReducedMotion();
  // Tier `off` (the frame watchdog found the TV too slow): the heartbeat ring stops, like BrandStage.
  const tier = useFxTier();
  const still = Boolean(reduceMotion) || tier === "off";
  // Digit flips change the first-render style, so they wait for hydration (React #418 otherwise on reduced-motion TVs).
  const reducedAfterHydration = useReducedMotionAfterHydration();
  const entered = useFxMoment(`pregame:${gameId}`);

  const seconds = Math.max(0, Math.ceil((Date.parse(startsAt) - nowMs) / 1_000));
  const text = formatPregameCountdown(seconds);
  const heartbeat = seconds < PREGAME_HEARTBEAT_UNDER_S;
  const theme = GAME_TILE_THEMES.live_trivia;

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden" style={{ padding: "24px 96px 64px" }}>
      {entered ? <LightStreak color={`${accent}99`} /> : null}

      {/* ---- Countdown: the one focal point ---- */}
      <div className="flex flex-col items-center text-center">
        <p
          data-testid="pregame-title"
          className="font-black"
          style={{
            fontSize: 150,
            letterSpacing: "-0.045em",
            lineHeight: 0.94,
            // Gradient text paints only inside its own box: pad it so descenders keep their tails.
            paddingBottom: "0.22em",
            marginBottom: "-0.22em",
            backgroundImage: `linear-gradient(100deg, #ffffff 0%, ${SCREEN_COLORS.cyan400} 46%, ${SCREEN_COLORS.amber400} 100%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            whiteSpace: "nowrap",
          }}
        >
          LIVE TRIVIA
        </p>
        <p className="font-black uppercase text-slate-300" style={{ fontSize: 44, letterSpacing: "0.3em" }}>
          Starts in
        </p>
        <div className="relative" style={{ marginTop: 4 }}>
          {heartbeat ? (
            <motion.span
              aria-hidden
              data-testid="pregame-heartbeat"
              className="pointer-events-none absolute will-change-transform"
              style={{ inset: "8px -40px", borderRadius: 999, border: `3px solid ${accent}`, opacity: 0 }}
              animate={still ? undefined : { scale: [1, 1.12], opacity: [0.6, 0] }}
              transition={still ? undefined : { duration: 1.2, repeat: Infinity, ease: "easeOut" }}
            />
          ) : null}
          <p
            className="font-black tabular-nums text-white"
            style={{ fontSize: 208, lineHeight: 1, letterSpacing: "-0.03em", textShadow: `0 0 60px ${accent}66` }}
          >
            <span className="sr-only">{text}</span>
            <span aria-hidden="true">
              {[...text].map((char, i, all) => (
                <FlipChar key={`${all.length - i}:${char}`} char={char} flip={!reducedAfterHydration} />
              ))}
            </span>
          </p>
        </div>
        {firstRoundCategory ? (
          <p
            className="max-w-full truncate font-bold"
            style={{ fontSize: 40, marginTop: 4, color: SCREEN_COLORS.cyan300 }}
          >
            Round 1: {firstRoundCategory}
          </p>
        ) : null}
      </div>

      {/* ---- Three steps ---- */}
      <div className="flex min-h-0 flex-1 justify-center" style={{ gap: 88, marginTop: 36 }}>
        <Step n={1} label="Get the app">
          {/* Above the entrance streak (z-10): the QR is never covered. */}
          <div className="relative z-20">
            <AppDownloadQr size={QR_SIZE} />
          </div>
        </Step>

        <Step n={2} label="Sign in">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-slate-500"
            style={{ width: 240, height: 240 }}
          >
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="9.5" r="3.2" />
            <path d="M5.8 18.6c1.4-2.6 3.6-3.9 6.2-3.9s4.8 1.3 6.2 3.9" />
          </svg>
        </Step>

        <Step n={3} label="Tap Live Trivia">
          {/* A look-alike of the Venue Home button: not interactive, same face as the phone's. */}
          <div aria-hidden="true" style={{ width: Math.round(TILE_WIDTH * TILE_SCALE), height: Math.round(TILE_HEIGHT * TILE_SCALE) }}>
            <div
              className={`relative block overflow-hidden rounded-[22px] text-white shadow-ht-tile [container-type:inline-size] ${theme.surfaceClass}`}
              style={{ width: TILE_WIDTH, transform: `scale(${TILE_SCALE})`, transformOrigin: "top left" }}
            >
              <GameTileFace gameKey="live_trivia">
                <span className="mt-2 block text-[clamp(15px,4.6cqw,18px)] font-bold leading-snug text-white/95">
                  {VENUE_HUB_TILE_SUBTITLE_BY_KEY.live_trivia}
                </span>
              </GameTileFace>
              {entered ? <OneShotShine delayS={0.9} /> : null}
            </div>
          </div>
        </Step>
      </div>
    </section>
  );
}
