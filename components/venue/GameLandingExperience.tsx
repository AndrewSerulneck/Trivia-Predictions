"use client";

import { Children, cloneElement, isValidElement, useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { getVenueId } from "@/lib/storage";
import { endCurrentGameSession, startGameSession, type GameAnalyticsType } from "@/lib/analytics";
import { type VenueGameKey } from "@/lib/venueGameCards";
import { navigateBackToVenue, runVenueGameReturnTransition } from "@/lib/venueGameTransition";
import { hasResumableSession } from "@/lib/gameResume";
import { forceRecoverDocumentScroll } from "@/lib/scrollLock";
import { GameRuleCardPanel, GAME_CARD_BG_BY_KEY } from "@/components/venue/GameIdentityPanel";
import { PageShell } from "@/components/ui/PageShell";

function recoverGamePageScrollState() {
  forceRecoverDocumentScroll();
  if (typeof document === "undefined") return;
  const appRoot = document.getElementById("__next") ?? document.getElementById("root");
  appRoot?.classList.remove("tp-modal-open", "tp-popup-open");

  if (appRoot instanceof HTMLElement) {
    appRoot.style.position = "";
    appRoot.style.height = "";
    appRoot.style.maxHeight = "";
    appRoot.style.overflow = "";
  }
}

function analyticsGameType(gameKey: VenueGameKey): GameAnalyticsType {
  if (gameKey === "live_trivia") return "live-trivia";
  if (gameKey === "bingo") return "bingo";
  if (gameKey === "fantasy") return "fantasy";
  if (gameKey === "pickem") return "pickem";
  return "speed-trivia";
}

export function GameLandingExperience({
  gameKey,
  playLabel = "Play",
  initialPlaying = false,
  autoResume = true,
  playHref,
  showPlayingBackButton = true,
  showShellUserStatus = true,
  showShellAlerts = true,
  playingBackgroundClassName,
  playingContainerClassName,
  landingStatus,
  playDisabled = false,
  playDisabledLabel,
  children,
}: {
  gameKey: VenueGameKey;
  playLabel?: string;
  initialPlaying?: boolean;
  autoResume?: boolean;
  playHref?: string;
  showPlayingBackButton?: boolean;
  showShellUserStatus?: boolean;
  showShellAlerts?: boolean;
  playingBackgroundClassName?: string;
  playingContainerClassName?: string;
  landingStatus?: React.ReactNode;
  playDisabled?: boolean;
  playDisabledLabel?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isPlaying, setIsPlaying] = useState(initialPlaying);
  const [rulesExiting, setRulesExiting] = useState(false);
  const [isResumeCheckPending, setIsResumeCheckPending] = useState(!initialPlaying && autoResume);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialPlaying || !autoResume) {
      // Defer to avoid calling setState synchronously inside an effect
      Promise.resolve().then(() => setIsResumeCheckPending(false));
      return;
    }
    let canceled = false;
    void (async () => {
      const canResume = await hasResumableSession(gameKey);
      if (canceled) {
        return;
      }
      if (canResume) {
        // Defer state updates to avoid cascading synchronous renders
        Promise.resolve().then(() => setIsPlaying(true));
      }
      Promise.resolve().then(() => setIsResumeCheckPending(false));
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

  useEffect(() => {
    if (gameKey !== "pickem") {
      return;
    }

    const body = document.body;
    const root = document.documentElement;
    body.classList.add("tp-pickem-force-scroll");
    root.classList.add("tp-pickem-force-scroll");

    recoverGamePageScrollState();
    const frame = window.requestAnimationFrame(() => {
      recoverGamePageScrollState();
    });
    const timer = window.setTimeout(() => {
      recoverGamePageScrollState();
    }, 220);
    // Guard against stale popup/modal lock classes that can linger across transitions on mobile.
    const interval = window.setInterval(() => {
      recoverGamePageScrollState();
    }, 1200);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.clearInterval(interval);
      body.classList.remove("tp-pickem-force-scroll");
      root.classList.remove("tp-pickem-force-scroll");
    };
  }, [gameKey]);

  useEffect(() => {
    if (!isPlaying) return;
    startGameSession(analyticsGameType(gameKey));
    return () => {
      endCurrentGameSession("abandoned");
    };
  }, [gameKey, isPlaying]);

  const handlePlayClick = useCallback(() => {
    if (playDisabled) {
      return;
    }
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
  }, [playDisabled, playHref, router]);

  const backToVenue = useCallback(() => {
    endCurrentGameSession("abandoned");
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
      className="tp-game-page relative z-[70] min-h-[100dvh] w-full overflow-x-hidden"
    >
      <div
        aria-hidden
        className={`pointer-events-none fixed inset-0 z-0 ${playingBackgroundClassName ?? GAME_CARD_BG_BY_KEY[gameKey]}`}
      />
      <div className="relative z-10">
        <PageShell
          title=""
          showPageTitle={false}
          showUserStatus={showShellUserStatus}
          showAlerts={showShellAlerts}
          noContainer
        >
          {isPlaying ? (
            <div
              data-venue-game-scroll
              className={`animate-tp-surface-enter relative z-10 flex min-h-[100dvh] flex-col overflow-y-auto touch-pan-y ${playingContainerClassName ?? "px-2 py-2 sm:px-3 sm:py-3"}`}
              style={{ WebkitOverflowScrolling: "touch" }}
            >
            <div className="min-h-0 flex-1 overflow-hidden">
              {showPlayingBackButton && Children.count(children) === 1 && isValidElement(children) && typeof children.type !== "string"
                ? cloneElement(children as ReactElement<{ onBack?: () => void }>, { onBack: backToVenue })
                : children}
            </div>
            </div>
          ) : isResumeCheckPending ? (
            <div className="flex h-full min-h-[60dvh] items-center justify-center px-4">
              <div className="rounded-ht-lg border border-ht-border-soft bg-ht-elevated px-4 py-3 text-sm font-semibold text-ht-fg-muted">
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
              {landingStatus ? <div className="shrink-0 pt-3 sm:pt-4">{landingStatus}</div> : null}
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
                  disabled={rulesExiting || playDisabled}
                  className="tp-clean-button inline-flex min-h-[52px] items-center justify-center rounded-full bg-blue-700 px-3 py-2 text-base font-black text-white disabled:opacity-60"
                >
                  {playDisabled && playDisabledLabel ? playDisabledLabel : playLabel}
                </button>
              </div>
            </div>
          )}
        </PageShell>
      </div>
    </div>
  );
}
