"use client";

import { useEffect, useState } from "react";
import { CategoryBlitzIntermissionScreen } from "@/components/venue-screen/CategoryBlitzIntermissionScreen";
import { CategoryBlitzScreen } from "@/components/venue-screen/CategoryBlitzScreen";
import { IdleVenueScreen } from "@/components/venue-screen/IdleVenueScreen";
import { LiveTriviaIntermissionScreen } from "@/components/venue-screen/LiveTriviaIntermissionScreen";
import { LiveTriviaScreen } from "@/components/venue-screen/LiveTriviaScreen";
import { VenueScreenStatus } from "@/components/venue-screen/VenueScreenStatus";
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

function withHexAlpha(hexColor: string, alpha: string): string {
  const normalized = /^#[0-9a-f]{3}$/i.test(hexColor)
    ? `#${hexColor[1]}${hexColor[1]}${hexColor[2]}${hexColor[2]}${hexColor[3]}${hexColor[3]}`
    : hexColor;
  return /^#[0-9a-f]{6}$/i.test(normalized) ? `${normalized}${alpha}` : normalized;
}

function VenueTitle({ state }: { state: VenueScreenState }) {
  return (
    <header className="flex w-full items-center justify-between gap-8 px-8 py-6 lg:px-10">
      <div>
        <p className="text-xl font-black uppercase tracking-[0.18em] text-cyan-200/80 lg:text-2xl">
          Hightop Challenge
        </p>
        <h1 className="mt-2 text-5xl font-black leading-none text-white lg:text-6xl">
          {state.venue.displayName ?? state.venue.name}
        </h1>
      </div>
      <div className="rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2 text-xl font-black uppercase text-white/80 lg:px-5 lg:py-3 lg:text-2xl">
        {state.mode.replace("-", " ")}
      </div>
    </header>
  );
}

function LiveTriviaPanel({ state }: { state: Extract<VenueScreenState, { mode: "live-trivia" }> }) {
  return state.liveTrivia.phase === "question" ? (
    <LiveTriviaScreen state={state} />
  ) : (
    <LiveTriviaIntermissionScreen state={state} />
  );
}

function CategoryBlitzPanel({ state }: { state: Extract<VenueScreenState, { mode: "category-blitz" }> }) {
  const blitz = state.categoryBlitz;
  return blitz.phase === "round" ? (
    <CategoryBlitzScreen state={state} />
  ) : (
    <CategoryBlitzIntermissionScreen state={state} />
  );
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
        currentState = json;
        failures = 0;
        setState(json);
        setError(null);
        setFailureCount(0);
        setNowMs(Date.now());
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

  const brandPrimary = state.venue.screenBrandPrimary ?? "#22d3ee";
  const brandSecondary = state.venue.screenBrandSecondary ?? "#fbbf24";
  const primaryWash = withHexAlpha(brandPrimary, "33");
  const secondaryWash = withHexAlpha(brandSecondary, "24");
  const screenTransform =
    state.mode === "idle" ? getVenueScreenBurnInTransform(nowMs) : "translate3d(0, 0, 0)";

  return (
    <main className="min-h-[100svh] w-screen overflow-hidden bg-slate-950 text-white">
      <div
        className="flex min-h-[100svh] flex-col"
        style={{
          background: `radial-gradient(circle at top left, ${primaryWash}, transparent 38%), radial-gradient(circle at bottom right, ${secondaryWash}, transparent 34%), linear-gradient(135deg, #020617, #111827 52%, #020617)`,
        }}
      >
        <div
          className="flex min-h-[100svh] flex-col will-change-transform"
          style={{ transform: screenTransform }}
        >
          {state.mode !== "idle" ? <VenueTitle state={state} /> : null}
          {state.mode === "live-trivia" ? <LiveTriviaPanel state={state} /> : null}
          {state.mode === "category-blitz" ? <CategoryBlitzPanel state={state} /> : null}
          {state.mode === "idle" ? <IdleVenueScreen state={state} nowMs={nowMs} /> : null}
        </div>
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
