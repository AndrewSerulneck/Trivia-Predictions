"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getVenueId } from "@/lib/storage";
import { type VenueGameKey } from "@/lib/venueGameCards";
import { navigateBackToVenue, runVenueGameReturnTransition } from "@/lib/venueGameTransition";
import { hasResumableSession } from "@/lib/gameResume";
import { GameRuleCardPanel, GAME_CARD_BG_BY_KEY } from "@/components/venue/GameIdentityPanel";
import { PageShell } from "@/components/ui/PageShell";

export function GameLandingExperience({
  gameKey,
  playLabel = "Play",
  initialPlaying = false,
  autoResume = true,
  playHref,
  showPlayingBackButton = true,
  children,
}: {
  gameKey: VenueGameKey;
  playLabel?: string;
  initialPlaying?: boolean;
  autoResume?: boolean;
  playHref?: string;
  showPlayingBackButton?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isPlaying, setIsPlaying] = useState(initialPlaying);
  const [rulesExiting, setRulesExiting] = useState(false);
  const [isResumeCheckPending, setIsResumeCheckPending] = useState(!initialPlaying && autoResume);
  const showTriviaTopNav = gameKey === "trivia" && isPlaying;
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialPlaying || !autoResume) {
      setIsResumeCheckPending(false);
      return;
    }
    let canceled = false;
    void (async () => {
      const canResume = await hasResumableSession(gameKey);
      if (canceled) {
        return;
      }
      if (canResume) {
        setIsPlaying(true);
      }
      setIsResumeCheckPending(false);
    })();
    return () => {
      canceled = true;
    };
  }, [autoResume, gameKey, initialPlaying]);

  useEffect(() => {
    return () => {
      if (playTimerRef.current !== null) {
        clearTimeout(playTimerRef.current);
      }
    };
  }, []);

  const handlePlayClick = useCallback(() => {
    if (playHref) {
      router.push(playHref);
      return;
    }
    setRulesExiting(true);
    playTimerRef.current = setTimeout(() => {
      playTimerRef.current = null;
      setRulesExiting(false);
      setIsPlaying(true);
    }, 300);
  }, [playHref, router]);

  const backToVenue = useCallback(() => {
    const venueId = getVenueId()?.trim() ?? "";
    if (venueId) {
      const targetPath = `/venue/${encodeURIComponent(venueId)}`;
      void runVenueGameReturnTransition({
        gameKey,
        navigate: () =>
          navigateBackToVenue({
            venuePath: targetPath,
            fallbackNavigate: () => {
              router.push(targetPath);
            },
          }),
      });
      return;
    }
    router.push("/");
  }, [gameKey, router]);

  return (
    <div
      data-venue-game-surface
      className={`tp-game-page fixed inset-0 z-[70] min-h-[100dvh] w-screen overflow-x-hidden ${
        isPlaying ? "overflow-y-auto" : "overflow-y-hidden"
      } ${GAME_CARD_BG_BY_KEY[gameKey]}`}
    >
      <PageShell
        title=""
        showPageTitle={false}
        showUserStatus={showTriviaTopNav}
        showAlerts={showTriviaTopNav}
        noContainer
      >
        {isPlaying ? (
          <div className="animate-tp-surface-enter relative min-h-full px-2 py-2 sm:px-3 sm:py-3">
            {showPlayingBackButton ? (
              <div className="sticky top-2 z-30 mb-2">
                <button
                  type="button"
                  onClick={backToVenue}
                  className="tp-clean-button inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#1c2b3a] bg-gradient-to-r from-[#a93d3a] via-[#c8573e] to-[#e9784e] px-4 py-2.5 text-sm font-semibold text-[#fff7ea] shadow-sm shadow-[#1c2b3a]/35 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9784e]/60 active:scale-95 active:brightness-90"
                >
                  <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#fff7ea]/20 text-xs">
                    ←
                  </span>
                  Back to Venue
                </button>
              </div>
            ) : null}
            {children}
          </div>
        ) : isResumeCheckPending ? (
          <div className="flex h-full min-h-[60dvh] items-center justify-center px-4">
            <div className="rounded-xl border border-slate-200 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm">
              Restoring your active game...
            </div>
          </div>
        ) : (
          <div className={`mx-auto flex h-full min-h-0 w-full max-w-[28rem] flex-col px-1.5 pb-[max(env(safe-area-inset-bottom,0px),6px)] pt-1.5 sm:px-2 sm:pt-2 ${rulesExiting ? "animate-tp-surface-exit" : ""}`}>
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <div
                className="aspect-[3/4.9]"
                style={{ width: "min(95vw, 22.5rem, calc((100dvh - 5.75rem) * 0.6122449))" }}
              >
                <GameRuleCardPanel gameKey={gameKey} layout="landing" className="h-full w-full" />
              </div>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-2 pt-3 sm:pt-4">
              <button
                type="button"
                onClick={backToVenue}
                className="tp-clean-button inline-flex min-h-[52px] items-center justify-center rounded-full bg-emerald-500 px-3 py-2 text-base font-black text-white"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handlePlayClick}
                disabled={rulesExiting}
                className="tp-clean-button inline-flex min-h-[52px] items-center justify-center rounded-full bg-blue-700 px-3 py-2 text-base font-black text-white"
              >
                {playLabel}
              </button>
            </div>
          </div>
        )}
      </PageShell>
    </div>
  );
}
