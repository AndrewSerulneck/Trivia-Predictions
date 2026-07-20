"use client";

import { useEffect, useState } from "react";
import { CategoryBlitzIntermissionScreen } from "@/components/venue-screen/CategoryBlitzIntermissionScreen";
import { CategoryBlitzScreen } from "@/components/venue-screen/CategoryBlitzScreen";
import { IdleVenueScreen } from "@/components/venue-screen/IdleVenueScreen";
import { LiveTriviaIntermissionScreen } from "@/components/venue-screen/LiveTriviaIntermissionScreen";
import { LiveTriviaRevealScreen } from "@/components/venue-screen/LiveTriviaRevealScreen";
import { LiveTriviaScreen } from "@/components/venue-screen/LiveTriviaScreen";
import { ScreenTransition } from "@/components/venue-screen/ScreenTransition";
import { TvGoLiveTakeover, type GameLabel } from "@/components/venue-screen/TvGoLiveTakeover";
import { VenueScreenStatus } from "@/components/venue-screen/VenueScreenStatus";
import { getVenueScreenTheme, type VenueScreenMode } from "@/lib/venueScreenBrand";
import type { VenueScreenState } from "@/lib/venueScreen";
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
};

const VENUE_SCREEN_FETCH_TIMEOUT_MS = 10_000;

function VenueTitle({ state, accent }: { state: VenueScreenState; accent: string }) {
  const modeLabel = state.mode === "live-trivia" ? "Live Trivia" : state.mode === "category-blitz" ? "Category Blitz" : state.mode;
  return (
    <header className="flex w-full items-center justify-between gap-8 px-8 py-6 lg:px-10">
      <div className="min-w-0">
        <p
          className="text-xl font-black uppercase tracking-[0.24em] lg:text-2xl"
          style={{ color: accent, textShadow: `0 0 26px ${accent}66` }}
        >
          Hightop Challenge
        </p>
        <h1 className="mt-2 truncate text-5xl font-black leading-none text-white lg:text-6xl">
          {state.venue.displayName ?? state.venue.name}
        </h1>
      </div>
      <div
        className="shrink-0 rounded-2xl border px-5 py-3 text-xl font-black uppercase tracking-[0.12em] lg:text-2xl"
        style={{ borderColor: `${accent}44`, background: `${accent}1f`, color: "#f8fafc" }}
      >
        {modeLabel}
      </div>
    </header>
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

export function VenueScreenClient({ venueId, initialState, debugMode = null }: VenueScreenClientProps) {
  const [state, setState] = useState(initialState);
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
    state.mode === "idle" ? getVenueScreenBurnInTransform(nowMs) : "translate3d(0, 0, 0)";

  return (
    <main className="min-h-[100svh] w-screen overflow-hidden bg-slate-950 text-white">
      <div className="relative flex min-h-[100svh] flex-col" style={{ background: theme.stageGradient }}>
        <div
          className="flex min-h-[100svh] flex-col will-change-transform"
          style={{ transform: screenTransform }}
        >
          {state.mode !== "idle" ? <VenueTitle state={state} accent={theme.accent} /> : null}
          {state.mode === "live-trivia" || state.mode === "category-blitz" ? (
            <ScreenTransition transitionKey={transitionKey} className="flex flex-1 flex-col">
              {state.mode === "live-trivia" ? <LiveTriviaPanel state={state} nowMs={nowMs} /> : null}
              {state.mode === "category-blitz" ? <CategoryBlitzPanel state={state} nowMs={nowMs} /> : null}
            </ScreenTransition>
          ) : null}
          {state.mode === "idle" ? <IdleVenueScreen state={state} nowMs={nowMs} /> : null}
        </div>
        {liveTakeover ? (
          <TvGoLiveTakeover
            key={liveTakeover.key}
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
  );
}
