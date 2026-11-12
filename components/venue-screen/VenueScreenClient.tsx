"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BracketTvScreen } from "@/components/venue-screen/BracketTvScreen";
import { CategoryBlitzIntermissionScreen } from "@/components/venue-screen/CategoryBlitzIntermissionScreen";
import { CategoryBlitzScreen } from "@/components/venue-screen/CategoryBlitzScreen";
import { IdleVenueScreen } from "@/components/venue-screen/IdleVenueScreen";
import { LiveTriviaIntermissionScreen } from "@/components/venue-screen/LiveTriviaIntermissionScreen";
import { LiveTriviaRevealScreen } from "@/components/venue-screen/LiveTriviaRevealScreen";
import { LiveTriviaScreen } from "@/components/venue-screen/LiveTriviaScreen";
import { BrandStage } from "@/components/venue-screen/fx/BrandStage";
import { FxProvider } from "@/components/venue-screen/fx/FxCanvas";
import { StageTwinkles } from "@/components/venue-screen/fx/StageTwinkles";
import { ShineSweep } from "@/components/venue-screen/fx/ShineSweep";
import { SquaresTvScreen } from "@/components/venue-screen/SquaresTvScreen";
import { ScreenTransition } from "@/components/venue-screen/ScreenTransition";
import { TvGoLiveTakeover, type GameLabel } from "@/components/venue-screen/TvGoLiveTakeover";
import { TvIntroStinger } from "@/components/venue-screen/TvIntroStinger";
import { VenueScreenStatus } from "@/components/venue-screen/VenueScreenStatus";
import { BRACKET_GAME_NAME, SQUARES_GAME_NAME } from "@/lib/venueGameCards";
import { getVenueScreenTheme, type VenueScreenMode, type VenueScreenTheme } from "@/lib/venueScreenBrand";
import type { VenueScreenState } from "@/lib/venueScreen";
import { useKeepScreenAwake } from "@/lib/useKeepScreenAwake";
import {
  getVenueScreenBurnInTransform,
  getVenueScreenPollIntervalMs,
  getVenueScreenRetryDelayMs,
  type VenueScreenDebugMode,
} from "@/lib/venueScreenTiming";

type VenueScreenClientProps = {
  venueId: string;
  initialState: VenueScreenState;
  debugMode?: VenueScreenDebugMode | null;
  /** Play the intro stinger on open. False only for the dashboard thumbnail (`intro=0`). */
  intro?: boolean;
};

const VENUE_SCREEN_FETCH_TIMEOUT_MS = 10_000;

// The venue screen is authored for a fixed TV-like 16:9 canvas. Rather than
// re-flow it responsively for every possible viewport, we render that fixed
// canvas and transform-scale it to fit whatever viewport actually loaded the
// route (a phone, a laptop window, or a true 16:9 TV), letterboxing the extra
// space on black — the same technique the dashboard preview uses (see
// ScaledPreview in app/owner/display/page.tsx). On a 16:9 viewport the fit is
// exact (scale is uniform, no letterboxing); any other aspect ratio centers
// with black bars instead of overflowing/clipping.
//
// 2304×1296 (not 1280×720): the `Tv*` panels are authored in hard-coded
// pixels sized for a larger design space than 1280×720, and `overflow-hidden`
// was silently clipping most of them (see docs/venue-tv-display-content-fit-plan.md
// Phase 0 — worst measured case was 2194×1190, category-blitz round with the
// longest real category names, with the live-trivia answer-reveal text
// entirely below the fold). This is a 16:9 size with ~5–9% headroom over that
// worst case; both dimensions are multiples of 16 for clean scale-factor math
// against common TV resolutions (2304/1920 = 1296/1080 = 1.2).
const VENUE_SCREEN_CANVAS_WIDTH = 2304;
const VENUE_SCREEN_CANVAS_HEIGHT = 1296;

// Measures the live viewport and renders the fixed-size venue-screen canvas
// scaled to fit inside it, centered on a black backdrop. Fit-to-viewport is
// always on (no flag) — a browser viewport always equals the real screen size,
// so scale-to-fit self-adapts: a true 16:9 TV computes a uniform scale with no
// visible change, everything else letterboxes automatically.
function ViewportFitCanvas({ children }: { children: ReactNode }) {
  // `null` until the first client measure. Server render and the first client
  // render both use scale 1 (matching HTML → no hydration mismatch); the effect
  // corrects the scale on mount before paint settles.
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    // Some mobile browsers (notably iOS Safari) fire `orientationchange` without
    // a reliable `resize`, so listen for both to keep the scale in sync when the
    // phone is rotated.
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  const scale = viewport
    ? Math.min(
        viewport.width / VENUE_SCREEN_CANVAS_WIDTH,
        viewport.height / VENUE_SCREEN_CANVAS_HEIGHT,
      )
    : 1;

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-black">
      <div
        className="shrink-0 origin-center"
        style={{
          width: VENUE_SCREEN_CANVAS_WIDTH,
          height: VENUE_SCREEN_CANVAS_HEIGHT,
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function VenueTitle({ state, theme }: { state: VenueScreenState; theme: VenueScreenTheme }) {
  const reduceMotion = useReducedMotion();
  const { accent, accentSoft } = theme;
  const modeLabel =
    state.mode === "live-trivia"
      ? "Live Trivia"
      : state.mode === "category-blitz"
        ? "Category Blitz"
        : state.mode === "squares"
          ? SQUARES_GAME_NAME
          : state.mode === "bracket"
            ? BRACKET_GAME_NAME
            : state.mode;
  return (
    <>
      <header className="flex w-full items-center justify-between gap-8 px-8 py-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-6">
          <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl">
            <img src="/brand/web/htc-logo-192.webp" alt="" className="size-full object-contain" />
            <ShineSweep periodMs={45_000} delayMs={6_000} />
          </div>
          <div className="min-w-0">
            <p
              className="bg-clip-text text-xl font-black uppercase tracking-[0.24em] text-transparent lg:text-2xl"
              style={{ backgroundImage: `linear-gradient(90deg, ${accent}, ${accentSoft})` }}
            >
              Hightop Challenge
            </p>
            <h1
              className="-mx-12 -my-6 mt-2 truncate px-12 py-6 text-5xl font-black leading-none text-white lg:text-6xl"
              style={{ textShadow: `0 0 44px ${accent}55` }}
            >
              {state.venue.displayName ?? state.venue.name}
            </h1>
          </div>
        </div>
        <div className="relative shrink-0">
          <motion.div
            aria-hidden
            className="absolute -inset-2 rounded-3xl"
            style={{ background: `radial-gradient(closest-side, ${accent}66, transparent)` }}
            animate={reduceMotion ? undefined : { opacity: [0.35, 0.85, 0.35] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
          />
          <div
            className="relative rounded-2xl p-[3px]"
            style={{ backgroundImage: `linear-gradient(135deg, ${accent}, ${accentSoft})` }}
          >
            <div className="rounded-[0.85rem] bg-slate-950/90 px-5 py-3 text-xl font-black uppercase tracking-[0.12em] text-slate-50 lg:text-2xl">
              {modeLabel}
            </div>
          </div>
        </div>
      </header>
      <div aria-hidden className="relative mx-8 h-1 shrink-0 overflow-hidden rounded-full lg:mx-10">
        <div
          className="absolute inset-0 opacity-40"
          style={{ backgroundImage: `linear-gradient(90deg, transparent, ${accent}, ${accentSoft}, transparent)` }}
        />
        {/* Same markup under reduced motion (parked off the left edge) so hydration matches. */}
        <motion.div
          className="absolute inset-y-0 left-0 w-1/6 will-change-transform"
          style={{ backgroundImage: `linear-gradient(90deg, transparent, ${accent}, transparent)`, x: "-100%" }}
          animate={reduceMotion ? undefined : { x: ["-100%", "600%"] }}
          transition={{ duration: 3.2, repeat: Infinity, repeatDelay: 9, ease: "easeInOut" }}
        />
      </div>
    </>
  );
}

function LiveTriviaPanel({
  state,
  nowMs,
}: {
  state: Extract<VenueScreenState, { mode: "live-trivia" }>;
  nowMs: number;
}) {
  const phase = state.liveTrivia.phase;
  if (phase === "question") return <LiveTriviaScreen state={state} nowMs={nowMs} />;
  if (phase === "reveal") return <LiveTriviaRevealScreen state={state} nowMs={nowMs} />;
  return <LiveTriviaIntermissionScreen state={state} nowMs={nowMs} />;
}

function CategoryBlitzPanel({
  state,
  nowMs,
}: {
  state: Extract<VenueScreenState, { mode: "category-blitz" }>;
  nowMs: number;
}) {
  const blitz = state.categoryBlitz;
  return blitz.phase === "round" ? (
    <CategoryBlitzScreen state={state} nowMs={nowMs} />
  ) : (
    <CategoryBlitzIntermissionScreen state={state} nowMs={nowMs} />
  );
}

// Identity of the current view for the phase-level cross-fade. Deliberately
// EXCLUDES secondsRemaining so the once-per-second poll tick doesn't retrigger
// the swap — only real phase/round changes do. Finer motion (question word
// reveal, letter slam) is keyed inside each panel on its own identity.
function getScreenTransitionKey(state: VenueScreenState): string {
  if (state.mode === "live-trivia") {
    // The final-standings beat has no roundNumber that distinguishes two
    // back-to-back games (both can end on the same round), so key it on the
    // stable per-game gameId; other phases stay keyed on roundNumber.
    const identity =
      state.liveTrivia.phase === "final" ? state.liveTrivia.gameId : state.liveTrivia.roundNumber ?? "x";
    return `lt:${state.liveTrivia.phase}:${identity}`;
  }
  if (state.mode === "category-blitz") {
    return `cb:${state.categoryBlitz.phase}:${state.categoryBlitz.roundId ?? "x"}`;
  }
  if (state.mode === "squares") return `sq:${state.squares.phase}`;
  if (state.mode === "bracket") return `br:${state.bracket.key}`;
  return "idle";
}

function modeToGameLabel(mode: VenueScreenState["mode"]): GameLabel | null {
  if (mode === "live-trivia") return "Live Trivia";
  if (mode === "category-blitz") return "Category Blitz";
  return null;
}

function getRefreshErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Refresh timed out. Keeping the last venue screen live.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Unable to refresh venue screen. Keeping the last venue screen live.";
}

export function VenueScreenClient({ venueId, initialState, debugMode = null, intro = true }: VenueScreenClientProps) {
  const [state, setState] = useState(initialState);
  // The intro stinger plays over the screen on every open (docs/venue-display-hype-and-intro-stinger-plan.md
  // §8); the poll loop runs underneath. A go-live takeover that lands meanwhile waits for it.
  const [introPlaying, setIntroPlaying] = useState(intro);
  const endIntro = useCallback(() => setIntroPlaying(false), []);
  useKeepScreenAwake();
  const [error, setError] = useState<string | null>(null);
  const [failureCount, setFailureCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Fires the "We're live" takeover exactly when a poll observes a genuine
  // idle → live transition (never on the initial mount/reload — see the
  // detection logic in the polling effect below and the comment atop
  // TvGoLiveTakeover for why that fully replaces the original design's
  // Date.now()-based staleness guard).
  const [liveTakeover, setLiveTakeover] = useState<{ key: number; gameLabel: GameLabel } | null>(null);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let active = true;
    let timeoutId: number | null = null;
    let requestTimeoutId: number | null = null;
    let activeController: AbortController | null = null;
    let currentState = initialState;
    let failures = 0;
    let load: () => Promise<void>;
    // Tracks mode across polls (plain closure variable, not React state — same
    // pattern as `currentState`/`failures` above) so a genuine idle → live flip
    // can be detected without ever firing on the very first poll of a fresh
    // mount/reload, even if that reload lands mid-game.
    let previousMode: VenueScreenState["mode"] = initialState.mode;

    const schedule = (delayMs: number) => {
      timeoutId = window.setTimeout(load, delayMs);
    };

    const handleFailure = (message: string) => {
      failures += 1;
      setFailureCount(failures);
      setError(message);
    };

    load = async () => {
      setIsRefreshing(true);
      const controller = new AbortController();
      activeController = controller;
      requestTimeoutId = window.setTimeout(() => controller.abort(), VENUE_SCREEN_FETCH_TIMEOUT_MS);

      try {
        const params = new URLSearchParams({ venueId });
        if (debugMode) params.set("mode", debugMode);
        const response = await fetch(`/api/venue-screen/state?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = (await response.json()) as VenueScreenState | { ok: false; error?: string };
        if (!active) return;
        if (!json.ok) {
          throw new Error(json.error ?? "Unable to refresh venue screen.");
        }
        if (!response.ok) {
          throw new Error("Unable to refresh venue screen.");
        }
        const flippedLive = previousMode === "idle" && modeToGameLabel(json.mode) !== null;
        previousMode = json.mode;
        currentState = json;
        failures = 0;
        setState(json);
        setError(null);
        setFailureCount(0);
        setNowMs(Date.now());
        if (flippedLive) {
          const gameLabel = modeToGameLabel(json.mode);
          if (gameLabel) setLiveTakeover({ key: json.updatedAt, gameLabel });
        }
      } catch (loadError) {
        if (active) handleFailure(getRefreshErrorMessage(loadError));
      } finally {
        if (requestTimeoutId !== null) {
          window.clearTimeout(requestTimeoutId);
          requestTimeoutId = null;
        }
        if (activeController === controller) {
          activeController = null;
        }
        if (active) {
          setIsRefreshing(false);
          const nextDelayMs =
            failures > 0
              ? getVenueScreenRetryDelayMs(failures)
              : getVenueScreenPollIntervalMs(currentState);
          schedule(nextDelayMs);
        }
      }
    };

    timeoutId = window.setTimeout(load, getVenueScreenPollIntervalMs(currentState));
    return () => {
      active = false;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (requestTimeoutId !== null) window.clearTimeout(requestTimeoutId);
      activeController?.abort();
    };
  }, [debugMode, initialState, venueId]);

  const theme = getVenueScreenTheme(state.mode as VenueScreenMode, {
    primary: state.venue.screenBrandPrimary,
    secondary: state.venue.screenBrandSecondary,
  });
  const transitionKey = getScreenTransitionKey(state);
  const screenTransform =
    state.mode === "idle" || state.mode === "squares" || state.mode === "bracket"
      ? getVenueScreenBurnInTransform(nowMs) : "translate3d(0, 0, 0)";

  return (
    <FxProvider armed={!introPlaying}>
      <ViewportFitCanvas>
        {/* Sizing is relative to the fixed canvas above (h-full/w-full), not the
            raw viewport — ViewportFitCanvas handles fitting the canvas to the
            actual device. The `min-h-0` further down the flex chain is load
            bearing: without it a flex item's default `min-height: auto` lets the
            column grow past the canvas instead of overflowing, which is what
            AutoScaleToFit needs to see. */}
        <main className="h-full w-full overflow-hidden bg-slate-950 text-white">
          <div className="relative flex h-full flex-col" style={{ background: theme.stageGradient }}>
            <BrandStage ambientA={theme.ambientA} ambientB={theme.ambientB} />
            {introPlaying ? null : <StageTwinkles />}
            <div
              className="flex h-full flex-col will-change-transform"
              style={{ transform: screenTransform }}
            >
              {state.mode !== "idle" ? <VenueTitle state={state} theme={theme} /> : null}
              {state.mode === "live-trivia" || state.mode === "category-blitz" ? (
                <ScreenTransition transitionKey={transitionKey} className="flex min-h-0 flex-1 flex-col">
                  {state.mode === "live-trivia" ? <LiveTriviaPanel state={state} nowMs={nowMs} /> : null}
                  {state.mode === "category-blitz" ? <CategoryBlitzPanel state={state} nowMs={nowMs} /> : null}
                </ScreenTransition>
              ) : null}
              {state.mode === "squares" ? (
                <ScreenTransition transitionKey={transitionKey} className="flex min-h-0 flex-1 flex-col">
                  <SquaresTvScreen state={state} accent={theme.accent} />
                </ScreenTransition>
              ) : null}
              {state.mode === "bracket" ? (
                <ScreenTransition transitionKey={transitionKey} className="flex min-h-0 flex-1 flex-col">
                  <BracketTvScreen state={state} accent={theme.accent} />
                </ScreenTransition>
              ) : null}
              {state.mode === "idle" ? <IdleVenueScreen state={state} nowMs={nowMs} /> : null}
            </div>
            {liveTakeover && !introPlaying ? (
              <TvGoLiveTakeover
                key={liveTakeover.key}
                momentKey={liveTakeover.key}
                gameLabel={liveTakeover.gameLabel}
                venueName={state.venue.displayName ?? state.venue.name}
                onComplete={() => setLiveTakeover(null)}
              />
            ) : null}
            {error || debugMode ? (
              <VenueScreenStatus
                updatedAt={state.updatedAt}
                nowMs={nowMs}
                error={error}
                failureCount={failureCount}
                isRefreshing={isRefreshing}
                debugMode={debugMode}
              />
            ) : null}
            {error ? (
              <div className="fixed bottom-5 right-5 z-30 max-w-[min(42rem,calc(100vw-2.5rem))] rounded-lg border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-lg font-bold text-amber-100">
                {error}
              </div>
            ) : null}
          </div>
        </main>
      </ViewportFitCanvas>
      {/* Outside the scaled canvas: a fixed element inside a transformed parent isn't viewport-fixed. */}
      {introPlaying ? <TvIntroStinger onDone={endIntro} /> : null}
    </FxProvider>
  );
}
