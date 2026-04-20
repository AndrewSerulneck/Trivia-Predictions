"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { clearVenueSession, getUserId, getVenueId } from "@/lib/storage";
import { getVenueDisplayName } from "@/lib/venueDisplay";
import { writeWarmPredictionsCache, writeWarmTriviaCache } from "@/lib/warmupCache";
import type { LeaderboardEntry, Prediction, TriviaQuestion, Venue } from "@/types";

type TriviaQuotaPayload = {
  limit: number;
  questionsUsed: number;
  questionsRemaining: number;
  windowSecondsRemaining: number;
  isAdminBypass?: boolean;
};

export function VenueHubClient({
  venue,
  initialEntries,
}: {
  venue: Venue;
  initialEntries: LeaderboardEntry[];
}) {
  const router = useRouter();
  const [pendingDestination, setPendingDestination] = useState<"trivia" | "predictions" | "bingo" | null>(null);
  const [isWarmingUp, setIsWarmingUp] = useState(true);
  const [warmupMessage, setWarmupMessage] = useState("Preparing games...");
  const warmupPromiseRef = useRef<Promise<void> | null>(null);
  const warmupStartedRef = useRef(false);

  useEffect(() => {
    const storedUserId = getUserId() ?? "";
    const storedVenueId = getVenueId() ?? "";
    if (!storedUserId) {
      router.replace(`/?v=${venue.id}`);
      return;
    }
    if (storedVenueId !== venue.id) {
      router.replace(`/?v=${venue.id}`);
    }
  }, [router, venue.id]);

  const venueDisplayName = getVenueDisplayName(venue);

  const triggerExit = () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([22, 40, 22]);
    }
  };

  const leaveVenue = () => {
    triggerExit();
    clearVenueSession();
    router.push("/");
  };

  const triggerPulse = () => {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    navigator.vibrate(14);
  };
  const ctaClass =
    "inline-flex min-h-[96px] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 px-3 py-4 text-center text-base font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95";

  const runWarmup = useCallback(async () => {
    if (warmupPromiseRef.current) {
      return warmupPromiseRef.current;
    }

    const userId = getUserId() ?? "";
    const venueId = getVenueId() ?? "";
    if (!userId || !venueId) {
      setIsWarmingUp(false);
      return;
    }

    const warmupPromise = (async () => {
      try {
        setWarmupMessage("Preparing trivia...");
        const [triviaQuestionsResult, triviaQuotaResult] = await Promise.allSettled([
          fetch(`/api/trivia?userId=${encodeURIComponent(userId)}`, { cache: "no-store" }),
          fetch(`/api/trivia/quota?userId=${encodeURIComponent(userId)}`, { cache: "no-store" }),
        ]);

        let triviaQuestions: TriviaQuestion[] = [];
        let triviaQuota: TriviaQuotaPayload | null = null;
        if (triviaQuestionsResult.status === "fulfilled") {
          const triviaPayload = (await triviaQuestionsResult.value.json()) as {
            ok?: boolean;
            questions?: TriviaQuestion[];
          };
          if (triviaPayload.ok && Array.isArray(triviaPayload.questions)) {
            triviaQuestions = triviaPayload.questions;
          }
        }
        if (triviaQuotaResult.status === "fulfilled") {
          const quotaPayload = (await triviaQuotaResult.value.json()) as {
            ok?: boolean;
            quota?: TriviaQuotaPayload | null;
          };
          if (quotaPayload.ok) {
            triviaQuota = quotaPayload.quota ?? null;
          }
        }
        if (triviaQuestions.length > 0) {
          writeWarmTriviaCache({
            userId,
            venueId,
            questions: triviaQuestions,
            quota: triviaQuota,
          });
        }

        setWarmupMessage("Preparing predictions...");
        const predictionsResponse = await fetch("/api/predictions?page=1&pageSize=24&excludeSensitive=false", {
          cache: "no-store",
        });
        const predictionsPayload = (await predictionsResponse.json()) as {
          ok?: boolean;
          items?: Prediction[];
          page?: number;
          pageSize?: number;
          totalItems?: number;
          totalPages?: number;
          sports?: string[];
          leaguesBySport?: Record<string, string[]>;
        };

        if (predictionsPayload.ok && Array.isArray(predictionsPayload.items) && predictionsPayload.items.length > 0) {
          writeWarmPredictionsCache({
            venueId,
            payload: {
              items: predictionsPayload.items,
              page: predictionsPayload.page,
              pageSize: predictionsPayload.pageSize,
              totalItems: predictionsPayload.totalItems,
              totalPages: predictionsPayload.totalPages,
              sports: predictionsPayload.sports,
              leaguesBySport: predictionsPayload.leaguesBySport,
            },
          });
        }

        setWarmupMessage("Preparing sports bingo...");
        await fetch("/api/bingo/games?sportKey=basketball_nba&includeLocked=true", {
          cache: "no-store",
        });
      } catch {
        // Warmup is best-effort; ignore transient failures.
      } finally {
        setIsWarmingUp(false);
        setWarmupMessage("Ready");
      }
    })();

    warmupPromiseRef.current = warmupPromise;
    return warmupPromise;
  }, []);

  const goTo = async (destination: "trivia" | "predictions" | "bingo") => {
    triggerPulse();
    setPendingDestination(destination);
    if (isWarmingUp) {
      setWarmupMessage(
        `Opening ${destination === "trivia" ? "Trivia" : destination === "predictions" ? "Predictions" : "Sports Bingo"}...`
      );
      const timeout = new Promise<void>((resolve) => {
        window.setTimeout(resolve, 2200);
      });
      await Promise.race([runWarmup(), timeout]);
    }
    router.push(destination === "trivia" ? "/trivia" : destination === "predictions" ? "/predictions" : "/bingo");
  };

  useEffect(() => {
    router.prefetch("/trivia");
    router.prefetch("/predictions");
    router.prefetch("/bingo");
    if (!warmupStartedRef.current) {
      warmupStartedRef.current = true;
      void runWarmup();
    }
  }, [router, runWarmup]);

  const warmupTitle = useMemo(() => {
    if (pendingDestination === "trivia") return "Opening Trivia...";
    if (pendingDestination === "predictions") return "Opening Predictions...";
    if (pendingDestination === "bingo") return "Opening Sports Bingo...";
    return "Getting everything ready";
  }, [pendingDestination]);

  return (
    <div className="space-y-5">
      <div className="flex justify-start">
        <button
          type="button"
          onClick={leaveVenue}
          className="group inline-flex items-center gap-2 rounded-full border border-rose-700 bg-gradient-to-r from-rose-600 to-rose-700 px-4 py-2.5 text-sm font-semibold tracking-wide text-white shadow-lg shadow-rose-200 transition-all active:scale-95 active:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-sm"
          >
            🚪
          </span>
          <span>Leave Venue</span>
          <span
            aria-hidden="true"
            className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 transition group-hover:translate-x-1"
          >
            EXIT
          </span>
        </button>
      </div>

      <section className="grid grid-cols-1 gap-3">
        <button
          type="button"
          onMouseDown={triggerPulse}
          onClick={() => {
            void goTo("trivia");
          }}
          disabled={pendingDestination !== null}
          className={`${ctaClass} bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-200 hover:from-blue-700 hover:to-cyan-600 active:scale-95`}
        >
          <span aria-hidden="true" className="text-4xl leading-none">
            🎯
          </span>
          {pendingDestination === "trivia" ? "Opening Trivia..." : "Play Trivia!"}
        </button>
        <button
          type="button"
          onMouseDown={triggerPulse}
          onClick={() => {
            void goTo("predictions");
          }}
          disabled={pendingDestination !== null}
          className={`${ctaClass} bg-gradient-to-br from-slate-800 to-violet-700 text-white shadow-md shadow-violet-200 hover:from-slate-900 hover:to-violet-800 active:scale-95`}
        >
          <span aria-hidden="true" className="text-4xl leading-none">
            🔮
          </span>
          {pendingDestination === "predictions" ? "Opening Predictions..." : "Make Sports Predictions"}
        </button>
        <button
          type="button"
          onMouseDown={triggerPulse}
          onClick={() => {
            void goTo("bingo");
          }}
          disabled={pendingDestination !== null}
          className={`${ctaClass} bg-gradient-to-br from-fuchsia-600 to-pink-500 text-white shadow-md shadow-pink-200 hover:from-fuchsia-700 hover:to-pink-600 active:scale-95`}
        >
          <span aria-hidden="true" className="text-4xl leading-none">
            🎰
          </span>
          {pendingDestination === "bingo" ? "Opening Sports Bingo..." : "Play Sports Bingo"}
        </button>
      </section>

      {(isWarmingUp || pendingDestination !== null) && (
        <section className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-800">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" />
            <span>{warmupTitle}</span>
          </div>
          <p className="mt-1 text-xs text-blue-700">{warmupMessage}</p>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">{venueDisplayName} Leaderboard</h2>
        <p className="text-sm text-slate-600">Compete with players currently joined at this venue.</p>
        <LeaderboardTable venueId={venue.id} initialEntries={initialEntries} />
      </section>
    </div>
  );
}
