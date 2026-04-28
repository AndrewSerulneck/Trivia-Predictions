"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Venue, LeaderboardEntry } from "@/types";
import { getUserId, getVenueId, clearVenueSession } from "@/lib/storage";
import { getVenueDisplayName } from "@/lib/venueDisplay";
import { writeWarmTriviaCache, writeWarmPredictionsCache } from "@/lib/warmupCache";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";

type Dest = "trivia" | "predictions" | "pickem" | "bingo";
const GAME_RAIL_REPEAT_COUNT = 7;
const GAME_RAIL_EDGE_CLIP_PX = 28;
const GAME_RAIL_PLACEHOLDER_HEIGHT_PX = 372;

export function VenueHubClient({ venue, initialEntries = [] }: { venue: Venue; initialEntries?: LeaderboardEntry[] }) {
  const router = useRouter();
  const [pendingDestination, setPendingDestination] = useState<Dest | null>(null);
  const [isWarmingUp, setIsWarmingUp] = useState(true);
  const [railTop, setRailTop] = useState<number | null>(null);
  const warmupPromiseRef = useRef<Promise<void> | null>(null);
  const warmupStartedRef = useRef(false);
  const railAnchorRef = useRef<HTMLDivElement | null>(null);
  const scrollWrapRef = useRef<HTMLDivElement | null>(null);

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

  const runWarmup = useCallback(async () => {
    if (warmupPromiseRef.current) return warmupPromiseRef.current;
    const userId = getUserId() ?? "";
    const venueId = getVenueId() ?? "";
    if (!userId || !venueId) return setIsWarmingUp(false);

    const p = (async () => {
      try {
        try {
          const tRes = await fetch(`/api/trivia?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
          const body = await tRes.json().catch(() => null);
          if (body?.ok && Array.isArray(body.questions)) {
            try {
              writeWarmTriviaCache({ userId, venueId, questions: body.questions, quota: body.quota ?? null });
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
      } finally {
        setIsWarmingUp(false);
      }
    })();

    warmupPromiseRef.current = p;
    return p;
  }, []);

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
    const el = scrollWrapRef.current;
    if (!el || railTop === null) return;

    const getCopyWidth = () => {
      const first = el.querySelector<HTMLElement>('[data-copy="0"]');
      const second = el.querySelector<HTMLElement>('[data-copy="1"]');
      if (!first || !second) return 0;
      return second.offsetLeft - first.offsetLeft;
    };

    const setStart = () => {
      const width = getCopyWidth();
      if (width > 0) {
        // Anchor to a consistent center-copy position with slight edge clip.
        el.scrollLeft = width * 3 + GAME_RAIL_EDGE_CLIP_PX;
      }
    };
    window.requestAnimationFrame(setStart);

    let isAdjusting = false;
    const onScroll = () => {
      if (isAdjusting) return;
      const width = getCopyWidth();
      const current = el.scrollLeft;
      if (width <= 0) return;

      const centerAnchor = width * 3 + GAME_RAIL_EDGE_CLIP_PX;
      const lowerBound = centerAnchor - width * 0.9;
      const upperBound = centerAnchor + width * 0.9;

      // Recenter around the middle copy before approaching hard edges.
      if (current < lowerBound || current > upperBound) {
        const normalized = ((current - centerAnchor) % width + width) % width;
        isAdjusting = true;
        el.scrollLeft = centerAnchor + normalized;
        window.requestAnimationFrame(() => {
          isAdjusting = false;
        });
        return;
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
    };
  }, [railTop]);

  useEffect(() => {
    router.prefetch("/trivia");
    router.prefetch("/predictions");
    router.prefetch("/pickem");
    router.prefetch("/bingo");
    if (!warmupStartedRef.current) {
      warmupStartedRef.current = true;
      void runWarmup();
    }
  }, [runWarmup, router]);

  const goTo = useCallback(
    async (dest: Dest) => {
      triggerPulse();
      setPendingDestination(dest);
      if (isWarmingUp) {
        const t = new Promise<void>((r) => window.setTimeout(r, 2200));
        await Promise.race([runWarmup(), t]);
      }
      router.push(
        dest === "trivia"
          ? "/trivia"
          : dest === "predictions"
          ? "/predictions"
          : dest === "pickem"
          ? "/pickem"
          : "/bingo"
      );
    },
    [isWarmingUp, runWarmup, router]
  );

  const ctaClass =
    "inline-flex min-h-[20.5rem] w-[16.75rem] flex-shrink-0 flex-col items-start justify-start gap-2 rounded-2xl border px-3 py-3 text-left text-base font-semibold";
  const titleClass = "text-[1.35rem] leading-tight font-bold";
  const rulesLabelClass = "mt-1 text-[1.02rem] font-semibold underline";
  const rulesBodyClass = "text-[0.91rem] leading-snug";

  const gameButtons = (groupIdx: number) => {
    const ariaHidden = groupIdx !== 2;

    // Title > Rules label > Rules body sizes: title is largest, rules label is medium and underlined, body is smallest.
    return (
      <div key={groupIdx} className="flex items-start gap-4" aria-hidden={ariaHidden}>
        <button
          type="button"
          onMouseDown={triggerPulse}
          onClick={() => void goTo("trivia")}
          disabled={pendingDestination !== null}
          className={`${ctaClass} bg-blue-600 text-white`}
        >
          <div className={titleClass}>Hightop Trivia™</div>
          <div className={rulesLabelClass}>Rules:</div>
          <div className={`mt-2 ${rulesBodyClass}`}>-20 questions per round</div>
          <div className={`mt-2 ${rulesBodyClass}`}>-15 seconds per question</div>
          <div className={rulesBodyClass}>-3 rounds per hour</div>
          <div className={rulesBodyClass}>-10 points per correct answer</div>
        </button>

        <button
          type="button"
          onMouseDown={triggerPulse}
          onClick={() => void goTo("predictions")}
          disabled={pendingDestination !== null}
          className={`${ctaClass} bg-slate-900 text-white`}
        >
          <div className={titleClass}>Hightop Predictions™</div>
          <div className={rulesLabelClass}>Rules:</div>
          <div className={`mt-2 ${rulesBodyClass}`}>-Browse live sports prediction markets</div>
          <div className={rulesBodyClass}>-Earn points with correct predictions</div>
          <div className={rulesBodyClass}>-Points are awarded based on probability (less likely outcomes award more points)</div>
        </button>

        <button
          type="button"
          disabled
          className={`${ctaClass} bg-slate-800 text-white`}
        >
          <div className={titleClass}>Hightop Fantasy™</div>
          <div className={rulesLabelClass}>Rules:</div>
          <div className={`mt-2 ${rulesBodyClass}`}>-Challenge other players at your venue head-to-head</div>
          <div className={rulesBodyClass}>-Draft a quarterback, running back, two wide receivers and a team defense.</div>
          <div className={rulesBodyClass}>- 4 challenges per week</div>
          <div className={rulesBodyClass}>- Winner gets 250 points</div>
          <div className={`mt-2 ${rulesBodyClass} font-bold`}>Coming Soon</div>
        </button>

        <button
          type="button"
          onMouseDown={triggerPulse}
          onClick={() => void goTo("pickem")}
          disabled={pendingDestination !== null}
          className={`${ctaClass} bg-indigo-600 text-white`}
        >
          <div className={titleClass}>Hightop Pick &apos;Em™</div>
          <div className={rulesLabelClass}>Rules:</div>
          <div className={`mt-2 ${rulesBodyClass}`}>-Think you can pick the most winners this week? Prove it.</div>
          <div className={rulesBodyClass}>-Challenge another user head-to-head</div>
          <div className={rulesBodyClass}>-Choose a sport and pick more winners than they do</div>
          <div className={rulesBodyClass}>-Add other users to your league to multiply your rewards</div>
        </button>

        <button
          type="button"
          onMouseDown={triggerPulse}
          onClick={() => void goTo("bingo")}
          disabled={pendingDestination !== null}
          className={`${ctaClass} bg-amber-600 text-white`}
        >
          <div className={titleClass}>Hightop Sports Bingo™</div>
          <div className={rulesLabelClass}>Rules:</div>
          <div className={`mt-2 ${rulesBodyClass}`}>-Pick a game and generate random bingo cards featuring specific player stats and game scores</div>
          <div className={rulesBodyClass}>-Refresh until you find a bingo card you like</div>
          <div className={rulesBodyClass}>-Watch live as squares update in real-time.</div>
          <div className={rulesBodyClass}>-Up to 4 active boards at a time</div>
          <div className={rulesBodyClass}>-100 points for boards that hit Bingo</div>
          <div className={rulesBodyClass}>-Click &quot;Collect Points&quot; to claim your reward</div>
        </button>
      </div>
    );
  };

  const warmupTitle = useMemo(() => {
    if (pendingDestination === "trivia") return "Opening Hightop Trivia™...";
    if (pendingDestination === "predictions") return "Opening Hightop Sports Predictions™...";
    if (pendingDestination === "pickem") return "Opening Hightop Pick 'Em™...";
    if (pendingDestination === "bingo") return "Opening Hightop Sports Bingo™...";
    return "Getting everything ready";
  }, [pendingDestination]);

  const gameRailNode =
        railTop !== null && typeof document !== "undefined"
      ? createPortal(
          <div className="absolute left-0 right-0 z-[80] pointer-events-none" style={{ top: railTop }}>
            <div className="relative pointer-events-auto bg-gradient-to-r from-[#1f2a36]/88 via-[#253444]/90 to-[#1f2a36]/88 py-3 overflow-visible">
              <div
                ref={scrollWrapRef}
                className="game-rail-viewport pb-2"
                role="list"
                aria-label="Games"
              >
                <div className="flex gap-4 pr-4">
                  {Array.from({ length: GAME_RAIL_REPEAT_COUNT }, (_, g) => g).map((g) => (
                    <div key={g} data-copy={g} className="flex shrink-0">
                      {gameButtons(g)}
                    </div>
                  ))}
                </div>
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
            <div className="mt-1 text-base font-semibold text-slate-900">Prize details coming soon</div>
            <div className="text-xs text-slate-700">Winning player at this venue will see the reward posted here each week.</div>
          </div>
        </div>

        <div ref={railAnchorRef} className="mt-3" style={{ height: GAME_RAIL_PLACEHOLDER_HEIGHT_PX }} aria-hidden />
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
