"use client";

import { useCallback, useRef, useState, type TouchEvent } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { VENUE_GAME_CARD_BY_KEY } from "@/lib/venueGameCards";
import { GameOnboardingCard, GAME_STEP_DOT_ACTIVE } from "@/components/venue/GameIdentityPanel";

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

const GAME_KEY = "category-blitz" as const;

/**
 * Full-screen tutorial interstitial shown on top of the venue home screen,
 * before the user ever navigates into the Category Blitz lobby. Keeping the
 * tutorial off the lobby route means the lobby (/category-blitz/play) is
 * always the live game/waiting screen, never onboarding slides.
 */
export function CategoryBlitzOnboardingOverlay({
  open,
  onClose,
  onJoin,
}: {
  open: boolean;
  onClose: () => void;
  onJoin: () => void;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const steps = VENUE_GAME_CARD_BY_KEY[GAME_KEY].steps;
  const totalSteps = steps.length;
  const isLastStep = currentStep === totalSteps - 1;

  const transitionToStep = useCallback((targetStep: number) => {
    setCurrentStep((prevStep) => {
      if (targetStep === prevStep) return prevStep;
      setSlideDirection(targetStep > prevStep ? 1 : -1);
      return targetStep;
    });
  }, []);

  const goToNextStep = useCallback(() => {
    transitionToStep(Math.min(currentStep + 1, totalSteps - 1));
  }, [currentStep, totalSteps, transitionToStep]);

  const goToPreviousStep = useCallback(() => {
    transitionToStep(Math.max(currentStep - 1, 0));
  }, [currentStep, transitionToStep]);

  const handleTouchStart = useCallback((event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }, []);

  const handleTouchEnd = useCallback((event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;

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

  const handleClose = useCallback(() => {
    setCurrentStep(0);
    setSlideDirection(1);
    onClose();
  }, [onClose]);

  const handleJoinClick = useCallback(() => {
    setCurrentStep(0);
    setSlideDirection(1);
    onJoin();
  }, [onJoin]);

  if (!open) {
    return null;
  }

  return (
    <div
      data-category-blitz-onboarding
      className="fixed inset-0 z-[2200] flex flex-col bg-[linear-gradient(132deg,#a10d63_0%,#7c0a4a_50%,#4a052c_100%)]"
      style={{ height: "var(--tp-vh, 100dvh)" }}
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[28rem] flex-col px-1.5 pb-[max(env(safe-area-inset-bottom,0px),6px)] pt-1.5 sm:px-2 sm:pt-2">
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div
            className="relative aspect-[3/4.9] overflow-hidden"
            style={{
              width: "min(95vw, 22.5rem, calc((100dvh - 5.75rem) * 0.6122449))",
              touchAction: "pan-y",
            }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <AnimatePresence initial={false} custom={slideDirection}>
              <motion.div
                key={`${GAME_KEY}-${currentStep}`}
                custom={slideDirection}
                variants={ONBOARDING_CARD_VARIANTS}
                initial="enter"
                animate="center"
                exit="exit"
                transition={ONBOARDING_CARD_TRANSITION}
                className="absolute inset-0 h-full w-full"
              >
                <GameOnboardingCard
                  gameKey={GAME_KEY}
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
                index === currentStep ? `w-6 ${GAME_STEP_DOT_ACTIVE[GAME_KEY]}` : "w-2 bg-white/30"
              }`}
              aria-label={`Go to step ${index + 1}`}
            />
          ))}
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 pt-3 sm:pt-4">
          <button
            type="button"
            onClick={currentStep > 0 ? goToPreviousStep : handleClose}
            className="tp-clean-button inline-flex min-h-[52px] items-center justify-center rounded-full bg-gradient-to-r from-orange-500 to-amber-400 px-3 py-2 text-base font-black text-slate-900"
          >
            Back
          </button>
          {isLastStep ? (
            <button
              type="button"
              onClick={handleJoinClick}
              className="tp-clean-button inline-flex min-h-[52px] items-center justify-center rounded-full bg-blue-700 px-3 py-2 text-base font-black text-white"
            >
              Join Game
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
    </div>
  );
}
