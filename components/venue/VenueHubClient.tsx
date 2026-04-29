"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Venue, LeaderboardEntry } from "@/types";
import { getUserId, getVenueId, clearVenueSession } from "@/lib/storage";
import { getVenueDisplayName } from "@/lib/venueDisplay";
import { writeWarmTriviaCache, writeWarmPredictionsCache } from "@/lib/warmupCache";
import { VENUE_GAME_CARD_BY_KEY, VENUE_HOME_GAME_KEYS, type VenueGameKey } from "@/lib/venueGameCards";
import { runVenueGameOpenTransition } from "@/lib/venueGameTransition";
import { GameRuleCardPanel } from "@/components/venue/GameIdentityPanel";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";

const GAME_RAIL_MIN_PLACEHOLDER_HEIGHT_PX = 440;

type TriviaQuotaSnapshot = {
  limit: number;
  questionsUsed: number;
  questionsRemaining: number;
  windowSecondsRemaining: number;
  isAdminBypass?: boolean;
};

function formatCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function VenueHubClient({ venue, initialEntries = [] }: { venue: Venue; initialEntries?: LeaderboardEntry[] }) {
  const router = useRouter();
  const [pendingDestination, setPendingDestination] = useState<VenueGameKey | null>(null);
  const [activeGameIndex, setActiveGameIndex] = useState(0);
  const [isWarmingUp, setIsWarmingUp] = useState(true);
  const [triviaQuota, setTriviaQuota] = useState<TriviaQuotaSnapshot | null>(null);
  const [triviaUnlockSeconds, setTriviaUnlockSeconds] = useState(0);
  const [triviaGateNotice, setTriviaGateNotice] = useState("");
  const [railTop, setRailTop] = useState<number | null>(null);
  const [railPlaceholderHeight, setRailPlaceholderHeight] = useState(GAME_RAIL_MIN_PLACEHOLDER_HEIGHT_PX);
  const [railContentNode, setRailContentNode] = useState<HTMLDivElement | null>(null);
  const [weeklyPrizeTitle, setWeeklyPrizeTitle] = useState("Weekly Venue Champion Prize");
  const [weeklyPrizeDescription, setWeeklyPrizeDescription] = useState(
    "Top the leaderboard by week end to earn this venue's reward."
  );
  const [weeklyPrizePoints, setWeeklyPrizePoints] = useState(0);
  const warmupPromiseRef = useRef<Promise<void> | null>(null);
  const warmupStartedRef = useRef(false);
  const railAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const storedUserId = getUserId() ?? "";
    const storedVenueId = getVenueId() ?? "";
    if (!storedUserId) return void router.replace(`/?v=${venue.id}`);
    if (storedVenueId !== venue.id) router.replace(`/?v=${venue.id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const venueDisplayName = getVenueDisplayName(venue as any);

  const triggerPulse = () => {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    try {
      (navigator as any).vibrate?.(14);
    } catch {}
  };

  const leaveVenue = () => {
    try {
      (navigator as any).vibrate?.([22, 40, 22]);
    } catch {}
    clearVenueSession();
    router.push("/");
  };

  const loadTriviaQuota = useCallback(async (): Promise<TriviaQuotaSnapshot | null> => {
    const userId = (getUserId() ?? "").trim();
    if (!userId) {
      setTriviaQuota(null);
      setTriviaUnlockSeconds(0);
      return null;
    }

    try {
      const response = await fetch(`/api/trivia/quota?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
      const payload = (await response.json()) as { ok: boolean; quota?: TriviaQuotaSnapshot | null };
      if (!payload.ok) {
        return null;
      }
      const nextQuota = payload.quota ?? null;
      setTriviaQuota(nextQuota);
      const isLocked = Boolean(nextQuota && !nextQuota.isAdminBypass && nextQuota.questionsRemaining <= 0);
      setTriviaUnlockSeconds(isLocked ? Math.max(0, Math.floor(nextQuota?.windowSecondsRemaining ?? 0)) : 0);
      return nextQuota;
    } catch {
      return null;
    }
  }, []);

  const runWarmup = useCallback(async () => {
    if (warmupPromiseRef.current) return warmupPromiseRef.current;
    const userId = getUserId() ?? "";
    const venueId = getVenueId() ?? "";
    if (!userId || !venueId) return setIsWarmingUp(false);

    const p = (async () => {
      try {
        let warmedTriviaQuota: TriviaQuotaSnapshot | null = null;
        try {
          const [tRes, tQuotaRes] = await Promise.all([
            fetch(`/api/trivia?userId=${encodeURIComponent(userId)}`, { cache: "no-store" }),
            fetch(`/api/trivia/quota?userId=${encodeURIComponent(userId)}`, { cache: "no-store" }),
          ]);
          const body = await tRes.json().catch(() => null);
          const quotaBody = (await tQuotaRes.json().catch(() => null)) as
            | { ok?: boolean; quota?: TriviaQuotaSnapshot | null }
            | null;
          if (quotaBody?.ok) {
            warmedTriviaQuota = quotaBody.quota ?? null;
            setTriviaQuota(warmedTriviaQuota);
            const isLocked = Boolean(
              warmedTriviaQuota &&
              !warmedTriviaQuota.isAdminBypass &&
              warmedTriviaQuota.questionsRemaining <= 0
            );
            setTriviaUnlockSeconds(
              isLocked ? Math.max(0, Math.floor(warmedTriviaQuota?.windowSecondsRemaining ?? 0)) : 0
            );
          }
          if (body?.ok && Array.isArray(body.questions)) {
            try {
              writeWarmTriviaCache({ userId, venueId, questions: body.questions, quota: warmedTriviaQuota });
            } catch {}
          }
        } catch {}

        try {
          const pr = await fetch(
            "/api/predictions?page=1&pageSize=24&excludeSensitive=false",
            { cache: "no-store" }
          );
          const pb = await pr.json().catch(() => null);
          if (pb?.ok) {
            try {
              writeWarmPredictionsCache({ venueId, payload: pb });
            } catch {}
          }
        } catch {}

        try {
          await fetch("/api/pickem/sports", { cache: "no-store" });
        } catch {}

        try {
          const prizeRes = await fetch(`/api/prizes?venueId=${encodeURIComponent(venueId)}`, {
            cache: "no-store",
          });
          const prizeBody = await prizeRes.json().catch(() => null);
          if (prizeBody?.ok && prizeBody.weeklyPrize) {
            setWeeklyPrizeTitle(String(prizeBody.weeklyPrize.prizeTitle ?? "Weekly Venue Champion Prize"));
            setWeeklyPrizeDescription(
              String(
                prizeBody.weeklyPrize.prizeDescription ??
                  "Top the leaderboard by week end to earn this venue's reward."
              )
            );
            setWeeklyPrizePoints(Math.max(0, Number(prizeBody.weeklyPrize.rewardPoints ?? 0)));
          }
        } catch {}
      } finally {
        setIsWarmingUp(false);
      }
    })();

    warmupPromiseRef.current = p;
    return p;
  }, []);

  useEffect(() => {
    if (triviaUnlockSeconds <= 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      setTriviaUnlockSeconds((value) => Math.max(0, value - 1));
    }, 1000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [triviaUnlockSeconds]);

  useEffect(() => {
    if (!triviaGateNotice) {
      return;
    }
    const timer = window.setTimeout(() => {
      setTriviaGateNotice("");
    }, 3500);
    return () => {
      window.clearTimeout(timer);
    };
  }, [triviaGateNotice]);

  useEffect(() => {
    const anchor = railAnchorRef.current;
    if (!anchor || typeof window === "undefined") return;

    let rafId: number | null = null;
    const measure = () => {
      const rect = anchor.getBoundingClientRect();
      setRailTop(rect.top + window.scrollY);
    };
    const scheduleMeasure = () => {
      if (rafId !== null) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        measure();
      });
    };

    const raf1 = window.requestAnimationFrame(measure);
    const raf2 = window.requestAnimationFrame(measure);
    measure();

    const onResize = () => scheduleMeasure();
    const onScroll = () => scheduleMeasure();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    window.addEventListener("scroll", onScroll, true);

    const ro = new ResizeObserver(() => scheduleMeasure());
    ro.observe(anchor);
    if (anchor.parentElement) {
      ro.observe(anchor.parentElement);
    }
    if (document.body) {
      ro.observe(document.body);
    }

    // Catch late hydration/layout changes above the anchor on small devices.
    const settleTimer = window.setInterval(scheduleMeasure, 250);
    const stopSettleTimer = window.setTimeout(() => {
      window.clearInterval(settleTimer);
    }, 4000);

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.removeEventListener("scroll", onScroll, true);
      window.clearInterval(settleTimer);
      window.clearTimeout(stopSettleTimer);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    router.prefetch("/trivia");
    router.prefetch("/predictions");
    router.prefetch("/pickem");
    router.prefetch("/bingo");
    router.prefetch("/fantasy");
    router.prefetch("/pending-challenges");
    router.prefetch("/active-games");
    router.prefetch("/redeem-prizes");
    router.prefetch("/activity");
    if (!warmupStartedRef.current) {
      warmupStartedRef.current = true;
      void runWarmup();
    }
  }, [runWarmup, router]);

  useEffect(() => {
    if (!railContentNode || typeof window === "undefined") {
      return;
    }

    const measure = () => {
      const nextHeight = Math.ceil(railContentNode.getBoundingClientRect().height + 12);
      setRailPlaceholderHeight(Math.max(GAME_RAIL_MIN_PLACEHOLDER_HEIGHT_PX, nextHeight));
    };

    measure();
    const rafId = window.requestAnimationFrame(measure);
    const resizeObserver = new ResizeObserver(() => {
      measure();
    });
    resizeObserver.observe(railContentNode);

    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      resizeObserver.disconnect();
    };
  }, [railContentNode, activeGameIndex, isWarmingUp]);

  const goTo = useCallback(
    async (dest: VenueGameKey, sourceElement: HTMLElement | null) => {
      const destination = VENUE_GAME_CARD_BY_KEY[dest];
      if (!destination) return;

      triggerPulse();

      if (dest === "trivia") {
        const latestQuota = await loadTriviaQuota();
        const triviaLocked = Boolean(latestQuota && !latestQuota.isAdminBypass && latestQuota.questionsRemaining <= 0);
        if (triviaLocked) {
          const unlockIn = Math.max(0, Math.floor(latestQuota?.windowSecondsRemaining ?? triviaUnlockSeconds));
          setTriviaUnlockSeconds(unlockIn);
          setTriviaGateNotice(
            unlockIn > 0
              ? `Trivia is locked for now. Try again in ${formatCountdown(unlockIn)}.`
              : "Trivia is locked for now. Please try again soon."
          );
          return;
        }
      }

      setTriviaGateNotice("");
      setPendingDestination(dest);
      await runVenueGameOpenTransition({
        gameKey: dest,
        sourceElement,
        targetPath: destination.path,
        navigate: () => {
          router.push(destination.path);
        },
      });
    },
    [loadTriviaQuota, router, triviaUnlockSeconds]
  );

  const homeCards = useMemo(() => VENUE_HOME_GAME_KEYS.map((key) => VENUE_GAME_CARD_BY_KEY[key]), []);
  const activeCard = homeCards[activeGameIndex] ?? homeCards[0];
  const triviaIsLocked = Boolean(triviaQuota && !triviaQuota.isAdminBypass && triviaQuota.questionsRemaining <= 0);
  const triviaUnlockCountdown = triviaUnlockSeconds > 0
    ? triviaUnlockSeconds
    : triviaIsLocked
      ? Math.max(0, Math.floor(triviaQuota?.windowSecondsRemaining ?? 0))
      : 0;

  const goPrevCard = useCallback(() => {
    setActiveGameIndex((index) => (index - 1 + homeCards.length) % homeCards.length);
  }, [homeCards.length]);

  const goNextCard = useCallback(() => {
    setActiveGameIndex((index) => (index + 1) % homeCards.length);
  }, [homeCards.length]);

  const warmupTitle = useMemo(() => {
    if (pendingDestination === "trivia") return "Opening Hightop Trivia™...";
    if (pendingDestination === "predictions") return "Opening Hightop Sports Predictions™...";
    if (pendingDestination === "pickem") return "Opening Hightop Pick 'Em™...";
    if (pendingDestination === "fantasy") return "Opening Hightop Fantasy™...";
    if (pendingDestination === "bingo") return "Opening Hightop Sports Bingo™...";
    return "Getting everything ready";
  }, [pendingDestination]);

  const gameRailNode =
        railTop !== null && typeof document !== "undefined"
      ? createPortal(
          <div className="absolute left-0 right-0 z-[80] pointer-events-none" style={{ top: railTop }}>
            <div
              ref={setRailContentNode}
              className="relative pointer-events-auto overflow-visible bg-gradient-to-r from-[#1f2a36]/88 via-[#253444]/90 to-[#1f2a36]/88 py-3"
            >
              <div className="mx-auto max-w-[30rem] px-2 md:max-w-[28rem] lg:max-w-[26rem]">
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onMouseDown={triggerPulse}
                    onClick={goPrevCard}
                    className="tp-clean-button inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-xl font-black text-slate-800"
                    aria-label="Previous game"
                  >
                    ‹
                  </button>
                  {activeCard ? (
                    <button
                      type="button"
                      onMouseDown={triggerPulse}
                      onClick={(event) => {
                        void goTo(activeCard.key, event.currentTarget);
                      }}
                      disabled={pendingDestination !== null}
                      data-venue-game-card={activeCard.key}
                      className="group relative inline-flex w-[clamp(18rem,95vw,22.5rem)] md:w-[clamp(16rem,40vw,19.5rem)] aspect-[3/4.9] text-left"
                      style={{ border: 0, boxShadow: "none", background: "transparent" }}
                    >
                      <GameRuleCardPanel gameKey={activeCard.key} layout="hub" className="h-full w-full" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onMouseDown={triggerPulse}
                    onClick={goNextCard}
                    className="tp-clean-button inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-xl font-black text-slate-800"
                    aria-label="Next game"
                  >
                    ›
                  </button>
                </div>
                <div className="mt-2 text-center text-xs font-black tracking-[0.12em] text-white/90">
                  {Math.min(homeCards.length, activeGameIndex + 1)}/{homeCards.length}
                </div>
                {activeCard?.key === "trivia" && triviaUnlockCountdown > 0 ? (
                  <div className="mt-2 rounded-full border border-amber-200/80 bg-amber-100/95 px-3 py-1.5 text-center text-[11px] font-black tracking-[0.08em] text-amber-900">
                    Trivia unlocks in {formatCountdown(triviaUnlockCountdown)}
                  </div>
                ) : null}
                {triviaGateNotice ? (
                  <div className="mt-2 rounded-xl border border-rose-200/80 bg-rose-100/95 px-3 py-2 text-center text-xs font-semibold text-rose-900">
                    {triviaGateNotice}
                  </div>
                ) : null}
              </div>
              {isWarmingUp && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-white/90 px-4 py-2 rounded-full text-sm font-medium shadow">{warmupTitle}</div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      {gameRailNode}
      <div className="space-y-3">
      <section className="mx-0 rounded-none bg-gradient-to-r from-[#1f2a36]/86 via-[#253444]/88 to-[#1f2a36]/86 py-2.5">
        <div className="relative z-[120] px-2">
          <div className="tp-hud-card !border-transparent !shadow-none rounded-2xl p-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{venueDisplayName}</h2>
                <div className="text-sm text-slate-700">Join games and view leaderboard</div>
              </div>
              <div>
                <button
                  onClick={leaveVenue}
                  className="rounded-full border-2 border-white bg-[#1f2a36] px-3 py-1 text-sm font-semibold text-white"
                >
                  Leave
                </button>
              </div>
            </div>
          </div>

          <div className="mt-3 tp-hud-card !border-transparent !shadow-none rounded-2xl p-3">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-700">This Week&apos;s Prize</div>
            <div className="mt-1 text-base font-semibold text-slate-900">{weeklyPrizeTitle}</div>
            <div className="text-xs text-slate-700">{weeklyPrizeDescription}</div>
            {weeklyPrizePoints > 0 ? (
              <div className="mt-1 text-xs font-semibold text-slate-800">Bonus reward: +{weeklyPrizePoints} points</div>
            ) : null}
          </div>

        </div>

        <div ref={railAnchorRef} className="mt-3" style={{ height: railPlaceholderHeight }} aria-hidden />
      </section>

      <div className="tp-hud-card !border-transparent !shadow-none rounded-2xl p-4" style={{ background: "#4a2e18" }}>
        <div className="inline-flex rounded-xl border-2 border-[#3b2412] bg-[#1f5136] px-3 py-1.5 shadow-[0_2px_0_rgba(0,0,0,0.25)]">
          <h3 className="text-2xl font-semibold text-[#ecf8f1] [font-family:'Kalam',cursive] [text-shadow:0_1px_0_rgba(0,0,0,0.45)]">
            Leaderboard
          </h3>
        </div>
        <div className="mt-3">
          <LeaderboardTable venueId={venue.id} initialEntries={initialEntries} />
        </div>
      </div>
      </div>
    </>
  );
}
