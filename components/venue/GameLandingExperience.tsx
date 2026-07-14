"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type TouchEvent,
} from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { useRouter } from "next/navigation";
import { getVenueId } from "@/lib/storage";
import { endCurrentGameSession, startGameSession, type GameAnalyticsType } from "@/lib/analytics";
import { type VenueGameKey, VENUE_GAME_CARD_BY_KEY } from "@/lib/venueGameCards";
import { navigateBackToVenue, runVenueGameReturnTransition } from "@/lib/venueGameTransition";
import { hasResumableSession } from "@/lib/gameResume";
import { forceRecoverDocumentScroll } from "@/lib/scrollLock";
import { hasRecentOnboarding, markOnboardingComplete } from "@/lib/gameOnboarding";
import { GameOnboardingCard, GAME_CARD_BG_BY_KEY, GAME_STEP_DOT_ACTIVE } from "@/components/venue/GameIdentityPanel";
import { VenuePresenceBoundary } from "@/components/venue/VenuePresenceBoundary";
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

const SWIPE_MIN_DISTANCE_PX = 48;
const SWIPE_MAX_VERTICAL_DRIFT_PX = 40;
const ONBOARDING_CARD_TRANSITION = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1] as const,
};
const ONBOARDING_CARD_VARIANTS: Variants = {
  enter: (direction: 1 | -1) => ({
    x: direction > 0 ? "104%" : "-104%",
    opacity: 0.72,
    scale: 0.985,
  }),
  center: {
    x: "0%",
    opacity: 1,
    scale: 1,
  },
  exit: (direction: 1 | -1) => ({
    x: direction > 0 ? "-104%" : "104%",
    opacity: 0.72,
    scale: 0.985,
  }),
};

function getOnboardingInitialStep(_gameKey: VenueGameKey): number {
  return 0;
}

function analyticsGameType(gameKey: VenueGameKey): GameAnalyticsType {
  if (gameKey === "live_trivia") return "live-trivia";
  if (gameKey === "bingo") return "bingo";
  if (gameKey === "fantasy") return "fantasy";
  if (gameKey === "pickem") return "pickem";
  if (gameKey === "category-blitz") return "category-blitz";
  return "speed-trivia";
}

export function GameLandingExperience({
  gameKey,
  playLabel = "Play",
  initialPlaying = false,
  autoResume = true,
  skipOnboardingIfRecent = false,
  playHref,
  showPlayingBackButton = true,
  showShellUserStatus = true,
  showShellAlerts = true,
  playingHidesShellNav = false,
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
  /** Skip straight past the tutorial slides if this browser played `gameKey` at this venue within the last 24 hours. */
  skipOnboardingIfRecent?: boolean;
  playHref?: string;
  showPlayingBackButton?: boolean;
  showShellUserStatus?: boolean;
  showShellAlerts?: boolean;
  playingHidesShellNav?: boolean;
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
  const [isResumeCheckPending, setIsResumeCheckPending] = useState(
    !initialPlaying && (autoResume || skipOnboardingIfRecent)
  );
  const [currentStep, setCurrentStep] = useState(() => getOnboardingInitialStep(gameKey));
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1);
  const steps = VENUE_GAME_CARD_BY_KEY[gameKey].steps;
  const totalSteps = steps.length;
  const isLastStep = currentStep === totalSteps - 1;
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (initialPlaying || (!autoResume && !skipOnboardingIfRecent)) {
      // Defer to avoid calling setState synchronously inside an effect
      Promise.resolve().then(() => setIsResumeCheckPending(false));
      return;
    }
    let canceled = false;
    void (async () => {
      const canResume = autoResume ? await hasResumableSession(gameKey) : false;
      if (canceled) {
        return;
      }
      if (canResume || (skipOnboardingIfRecent && hasRecentOnboarding(gameKey))) {
        // Defer state updates to avoid cascading synchronous renders
        Promise.resolve().then(() => setIsPlaying(true));
      }
      Promise.resolve().then(() => setIsResumeCheckPending(false));
    })();
    return () => {
      canceled = true;
    };
  }, [autoResume, gameKey, initialPlaying, skipOnboardingIfRecent]);

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
    markOnboardingComplete(gameKey);
    startGameSession(analyticsGameType(gameKey));
    return () => {
      endCurrentGameSession("abandoned");
    };
  }, [gameKey, isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      forceRecoverDocumentScroll();
    }
  }, [isPlaying]);

  const handlePlayClick = useCallback(() => {
    if (playDisabled) {
      return;
    }
    if (playHref) {
      router.push(playHref);
      return;
    }
    forceRecoverDocumentScroll();
    setRulesExiting(true);
    playTimerRef.current = setTimeout(() => {
      playTimerRef.current = null;
      setRulesExiting(false);
      setIsPlaying(true);
    }, 300);
  }, [playDisabled, playHref, router]);

  const transitionToStep = useCallback((targetStep: number) => {
    if (targetStep === currentStep) {
      return;
    }
    setSlideDirection(targetStep > currentStep ? 1 : -1);
    setCurrentStep(targetStep);
  }, [currentStep]);

  const goToNextStep = useCallback(() => {
    transitionToStep(Math.min(currentStep + 1, totalSteps - 1));
  }, [currentStep, totalSteps, transitionToStep]);

  const goToPreviousStep = useCallback(() => {
    transitionToStep(Math.max(currentStep - 1, 0));
  }, [currentStep, transitionToStep]);

  const handleTutorialTouchStart = useCallback((event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) {
      touchStartRef.current = null;
      return;
    }
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTutorialTouchEnd = useCallback((event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) {
      return;
    }

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    if (absDeltaX < SWIPE_MIN_DISTANCE_PX || absDeltaY > SWIPE_MAX_VERTICAL_DRIFT_PX || absDeltaY >= absDeltaX) {
      return;
    }

    if (deltaX < 0) {
      goToNextStep();
      return;
    }

    goToPreviousStep();
  }, [goToNextStep, goToPreviousStep]);

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
            gameKey,
            fallbackNavigate: () => {
              router.push(targetPath);
            },
          }),
      });
      return;
    }
    router.push("/");
  }, [gameKey, router]);

  const playingChild =
    showPlayingBackButton && Children.count(children) === 1 && isValidElement(children) && typeof children.type !== "string"
      ? cloneElement(children as ReactElement<{ onBack?: () => void }>, { onBack: backToVenue })
      : children;

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
          showUserStatus={isPlaying && playingHidesShellNav ? false : showShellUserStatus}
          showAlerts={isPlaying && playingHidesShellNav ? false : showShellAlerts}
          noContainer
          shellClassName={isPlaying ? "!gap-0" : undefined}
          mainClassName={isPlaying ? "pt-0!" : undefined}
        >
          {isPlaying ? (
            // Category Blitz pins its own root to `var(--tp-vh)` and manages its
            // own internal scroll regions — a second, independently scrollable/
            // growable wrapper here lets iOS's elastic overscroll drag the whole
            // "fixed" game off screen when a nested list hits its scroll limit.
            // Give it a single, non-scrolling height boundary instead; every
            // other game keeps the original grow-and-scroll wrapper.
            gameKey === "category-blitz" ? (
              <div
                data-venue-game-scroll
                className={`animate-tp-surface-enter relative z-10 flex flex-col overflow-hidden overscroll-none ${playingContainerClassName ?? "px-2 py-2 sm:px-3 sm:py-3"}`}
                style={{ height: "var(--tp-vh, 100dvh)" }}
              >
                <VenuePresenceBoundary enabled={isPlaying}>{playingChild}</VenuePresenceBoundary>
              </div>
            ) : (
            <div
              data-venue-game-scroll
              className={`animate-tp-surface-enter relative z-10 flex min-h-[100dvh] flex-col overflow-y-auto touch-pan-y ${playingContainerClassName ?? "px-2 py-2 sm:px-3 sm:py-3"}`}
              style={{ WebkitOverflowScrolling: "touch" }}
            >
            {playingHidesShellNav ? (
              <VenuePresenceBoundary enabled={isPlaying}>{playingChild}</VenuePresenceBoundary>
            ) : (
              <VenuePresenceBoundary enabled={isPlaying}>
                <div className="min-h-0 flex-1 overflow-hidden">{playingChild}</div>
              </VenuePresenceBoundary>
            )}
            </div>
            )
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
                  className={`relative overflow-hidden ${gameKey === "pickem" ? "aspect-[3/5.4]" : "aspect-[3/4.9]"}`}
                  style={{
                    width: gameKey === "pickem"
                      ? "min(95vw, 22.5rem, calc((100dvh - 5.75rem) * 0.5556))"
                      : "min(95vw, 22.5rem, calc((100dvh - 5.75rem) * 0.6122449))",
                    touchAction: "pan-y",
                  }}
                  onTouchStart={handleTutorialTouchStart}
                  onTouchEnd={handleTutorialTouchEnd}
                >
                  <AnimatePresence initial={false} custom={slideDirection}>
                    <motion.div
                      key={`${gameKey}-${currentStep}`}
                      custom={slideDirection}
                      variants={ONBOARDING_CARD_VARIANTS}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={ONBOARDING_CARD_TRANSITION}
                      className="absolute inset-0 h-full w-full"
                    >
                      <GameOnboardingCard
                        gameKey={gameKey}
                        step={steps[currentStep]}
                        stepIndex={currentStep}
                        className="h-full w-full"
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-center gap-2 pt-3">
                {steps.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => transitionToStep(index)}
                    className={`tp-clean-button h-2 rounded-full transition-all duration-200 ${
                      index === currentStep
                        ? `w-6 ${GAME_STEP_DOT_ACTIVE[gameKey]}`
                        : "w-2 bg-white/30"
                    }`}
                    aria-label={`Go to step ${index + 1}`}
                  />
                ))}
              </div>
              {landingStatus ? <div className="shrink-0 pt-3 sm:pt-4">{landingStatus}</div> : null}
              <div className="grid shrink-0 grid-cols-2 gap-2 pt-3 sm:pt-4">
                <button
                  type="button"
                  onClick={currentStep > 0 ? goToPreviousStep : backToVenue}
                  className="tp-clean-button inline-flex min-h-[52px] items-center justify-center rounded-full bg-gradient-to-r from-orange-500 to-amber-400 px-3 py-2 text-base font-black text-slate-900"
                >
                  Back
                </button>
                {isLastStep ? (
                  <button
                    type="button"
                    onClick={handlePlayClick}
                    disabled={rulesExiting || playDisabled}
                    className="tp-clean-button inline-flex min-h-[52px] items-center justify-center rounded-full bg-blue-700 px-3 py-2 text-base font-black text-white disabled:opacity-60"
                  >
                    {playDisabled && playDisabledLabel ? playDisabledLabel : playLabel}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={goToNextStep}
                    className="tp-clean-button inline-flex min-h-[52px] items-center justify-center rounded-full bg-blue-700 px-3 py-2 text-base font-black text-white"
                  >
                    Next
                  </button>
                )}
              </div>
            </div>
          )}
        </PageShell>
      </div>
    </div>
  );
}
