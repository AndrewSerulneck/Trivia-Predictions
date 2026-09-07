"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { setScrollLock } from "@/lib/scrollLock";
import { SWIPE_PANEL_VARIANTS, SWIPE_TWEEN } from "@/lib/swipeTransition";
import { SportsBingoSelectSport } from "@/components/bingo/SportsBingoSelectSport";
import { SportsBingoSelectGame, type SportsBingoGame } from "@/components/bingo/SportsBingoSelectGame";
import { SportsBingoSelectBoard } from "@/components/bingo/SportsBingoSelectBoard";

/**
 * Board creation, in place. Steps 1–3 slide up over `/bingo/home` instead of navigating away to
 * `/bingo/select-sport` → `/bingo/select-game` → `/bingo/select-board`
 * (docs/prop-bingo-page-simplification-plan.md, phase 4).
 *
 * The three step components are NOT forked: they take optional props that override their router
 * behaviour, so the standalone routes keep working untouched as the deep-link / back-button
 * fallback. This sheet just supplies those callbacks and holds the step state itself.
 *
 * The animation is not new work either — `app/globals.css` already ships
 * `tp-popup-sheet-up`/`-down` and `tp-fade-in`/`-out` (both no-op under `prefers-reduced-motion`).
 * `components/ui/DateCalendarPopover.tsx` is the reference implementation of the surrounding
 * mechanics: `isClosing` gated on the exit duration so the slide-down finishes before unmount,
 * `setScrollLock`, Escape, backdrop mousedown, Tab trap, focus restored to the trigger.
 *
 * The step-to-step (sport → game → board) SWIPE is a separate animation from the sheet's
 * vertical slide-up, and it deliberately uses `framer-motion` — the same `SWIPE_PANEL_VARIANTS`
 * / `SWIPE_TWEEN` the sign-in username → PIN transition uses (`@/lib/swipeTransition`, lifted
 * from `JoinFlow`). That is not a contradiction of "no motion library" above: that note is
 * about the CSS `tp-popup-sheet-up` slide-up, which is untouched.
 *
 * MOUNTED ONLY WHILE OPEN. The host renders this conditionally, so every open starts on step 1
 * with no state to reset — which is also what keeps this file clear of the repo's
 * `react-hooks/set-state-in-effect` rule. The close animation still runs to completion because
 * the sheet owns `isClosing` and only calls `onClose` (the unmount) once the timer fires.
 *
 * PORTRAIT ONLY. `SportsBingoHome` returns a separate landscape tree well above the portrait
 * return; this must be mounted only in the latter (plan 4g).
 */

type CreateBoardStep = "sport" | "game" | "board";

// Matches .animate-tp-popup-sheet-down in app/globals.css.
const SHEET_EXIT_MS = 270;

const resolveExitMs = (): number => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : SHEET_EXIT_MS;
  } catch {
    return SHEET_EXIT_MS;
  }
};

const STEP_NUMBER: Record<CreateBoardStep, number> = { sport: 1, game: 2, board: 3 };

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type CreateBoardSheetProps = {
  /** Fired once the slide-down has finished, so the host can unmount the sheet. */
  onClose: () => void;
  /** Fired the moment a board is locked in — before the slide-down finishes, so the refetch and
   *  the exit animation overlap and the new board is already in the stack behind the sheet. */
  onCreated: (cardId: string) => void;
};

export const CreateBoardSheet = ({ onClose, onCreated }: CreateBoardSheetProps) => {
  const scrollLockId = useId();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const isClosingRef = useRef(false);

  const reducedMotion = useReducedMotion();

  const [isClosing, setIsClosing] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);
  const [step, setStep] = useState<CreateBoardStep>("sport");
  // 1 = advancing (new step slides in from the right), -1 = stepping back. Set in the handlers
  // below, never in an effect (keeps clear of react-hooks/set-state-in-effect).
  const [stepDirection, setStepDirection] = useState<1 | -1>(1);
  const [sportKey, setSportKey] = useState("");
  const [gameId, setGameId] = useState("");

  const requestClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
      returnFocusRef.current?.focus();
    }, resolveExitMs());
  }, [onClose]);

  // Remember the trigger, then move focus into the dialog itself — not onto the first league
  // button, which a screen reader would announce as if it were already chosen.
  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (current === first || !root.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  // Plan 4g. The unmount release also covers the case where the player rotates to landscape with
  // the sheet open: `SportsBingoHome` swaps to its landscape tree, this unmounts, and the page
  // behind must not be left scroll-locked.
  useEffect(() => {
    const owner = `bingo-create-board:${scrollLockId}`;
    setScrollLock(owner, true, "popup");
    return () => setScrollLock(owner, false);
  }, [scrollLockId]);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    []
  );

  const handleSelectSport = useCallback((nextSportKey: string) => {
    setStepDirection(1);
    setSportKey(nextSportKey);
    setStep("game");
  }, []);

  const handleSelectGame = useCallback((game: SportsBingoGame) => {
    setStepDirection(1);
    setSportKey((current) => game.sportKey || current);
    setGameId(game.id);
    setStep("board");
  }, []);

  const handleCreated = useCallback(
    (cardId: string) => {
      onCreated(cardId);
      requestClose();
    },
    [onCreated, requestClose]
  );

  const handleStepBack = useCallback(() => {
    setStepDirection(-1);
    setStep((current) => {
      if (current === "board") {
        setGameId("");
        return "game";
      }
      if (current === "game") {
        setSportKey("");
        return "sport";
      }
      return current;
    });
  }, []);

  return (
    <div
      data-tp-scroll-lock="active"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      className={`fixed inset-0 z-[5000] flex items-end justify-center bg-slate-950/70 ${
        isClosing ? "pointer-events-none animate-tp-fade-out" : "animate-tp-fade-in"
      }`}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        // Dropping the entrance class once it has finished is not cosmetic: `animation-fill-mode:
        // both` holds `transform: translateY(0)` forever, and a transformed ancestor becomes the
        // containing block for `position: fixed` descendants — which would trap step 3's expanded
        // board preview inside this panel instead of the viewport. The last keyframe is the
        // element's natural position, so removing the class moves nothing.
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && !isClosing) setHasEntered(true);
        }}
        className={`tp-bingo-theme flex max-h-[90svh] w-full max-w-[30rem] flex-col overflow-hidden rounded-t-3xl border border-b-0 border-sky-300/30 bg-slate-950 shadow-[0_-18px_44px_rgba(0,0,0,0.65)] outline-none ${
          isClosing ? "animate-tp-popup-sheet-down" : hasEntered ? "" : "animate-tp-popup-sheet-up"
        }`}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-sky-300/20 px-3 py-2.5">
          {step === "sport" ? (
            <span aria-hidden="true" className="h-11 w-11 shrink-0" />
          ) : (
            <button
              type="button"
              onClick={handleStepBack}
              aria-label={`Back to step ${STEP_NUMBER[step] - 1} of 3`}
              className="tp-clean-button inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sky-300/25 bg-slate-900 text-sky-300 active:bg-slate-800"
            >
              <ChevronLeft aria-hidden="true" className="h-5 w-5" />
            </button>
          )}

          <h2
            id={titleId}
            className="min-w-0 truncate text-[12px] font-black uppercase tracking-[0.14em] text-sky-300"
          >
            Step {STEP_NUMBER[step]} of 3
          </h2>

          <button
            type="button"
            onClick={requestClose}
            aria-label="Close board creation"
            className="tp-clean-button inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 active:bg-slate-800"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>

        {/* `overflow-x-clip` so the off-screen panel at x: ±100% cannot widen the sheet or add a
            horizontal scrollbar during the 220ms swipe. `mode="wait"` keeps exactly one step
            mounted, so no absolute positioning / height animation is needed despite the three
            steps differing a lot in height. `initial={false}` so step 1 does NOT swipe in
            sideways while the whole sheet is still sliding up on first open. */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-clip overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <AnimatePresence mode="wait" custom={stepDirection} initial={false}>
            <motion.div
              key={step}
              custom={stepDirection}
              variants={SWIPE_PANEL_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
              transition={reducedMotion ? { duration: 0 } : SWIPE_TWEEN}
              className="w-full"
            >
              {step === "sport" ? (
                <SportsBingoSelectSport hideStepHeading onSelectSport={handleSelectSport} />
              ) : step === "game" ? (
                <SportsBingoSelectGame hideStepHeading sportKey={sportKey} onSelectGame={handleSelectGame} />
              ) : (
                <SportsBingoSelectBoard hideStepHeading sportKey={sportKey} gameId={gameId} onCreated={handleCreated} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
