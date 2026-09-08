"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { ExitBackButton } from "@/components/navigation/ExitBackButton";
import { WizardFooter, type WizardFooterProps } from "@/components/navigation/WizardFooter";
import { SignupStepTransition } from "@/components/signup/SignupStepTransition";
import {
  SIGNUP_RAIL_DURATION,
  signupProgressFraction,
  signupTransition,
} from "@/components/signup/signupMotion";
import { marketingHref } from "@/lib/domainSplit";

// Partner Self-Serve Signup — the shell.
//
// Phase 3 (docs/partner-self-serve-signup-plan.md §4). The surface that "takes
// over the screen": full-bleed, dark canvas, no OwnerShell white card, one
// question visible at a time. Built BEFORE any question content so all six
// screens inherit one feel.
//
// Four slots, in this order and no others:
//   1. hairline progress rail   — pinned to the very top edge, animates on every
//                                 step change.
//   2. ExitBackButton, top-left — THE canonical Back ("leave signup"), per
//                                 CLAUDE.md's navigation rules. Step-to-step
//                                 progression is the FOOTER's job, never this.
//   3. one content region       — scrolls; everything else is fixed chrome.
//   4. WizardFooter             — sticky, dark tone, Back + Next.
//
// This shell deliberately does NOT compose StepBackButton/NextButton itself —
// tests/navigation-controls-contract.test.ts fails any file but WizardFooter
// that renders them, and the footer is the whole point of that rule.
//
// HEIGHT: `--tp-vh` (components/ui/ViewportHeightSync.tsx, mounted in
// app/layout.tsx) tracks `visualViewport.height`, so it SHRINKS when the iOS
// soft keyboard opens. That is what keeps the sticky footer above the keyboard
// instead of underneath it. `100dvh` is only the pre-hydration fallback — do not
// "simplify" this to `h-screen`, which is the exact bug the var exists to fix.
//
// ROUTE NOTE: `/owner/signup` is registered in AppShell's FULLSCREEN_PATHS so the
// wizard gets zero outer padding, no 720px clamp and no decorative blobs. If the
// route is ever renamed, that list must be updated with it.

export type SignupShellProps = {
  /** 0-based index of the visible step. */
  stepIndex: number;
  /** Total steps in the flow — SIGNUP_STEPS.length in practice. */
  stepCount: number;
  /** Stable identity for the step swap when index alone isn't enough. */
  stepKey?: string;
  /** The one question on screen. */
  children: ReactNode;

  /**
   * "Leave signup." Defaults to the marketing home (`/info`), which is the
   * correct home page — never `/`, which is the PLAYER sign-in (CLAUDE.md).
   * `useExitNavigation` prefers real history when there is any, so this is the
   * cold-open / installed-PWA fallback.
   */
  exitHref?: string;
  /** Caller-owned exit (e.g. "discard your answers?" confirmation). Wins over href. */
  onExit?: () => void;
  /** Accessible name for the exit control. */
  exitLabel?: string;

  /** Step-back. Omit on the first step; the footer then renders Next alone. */
  onBack?: () => void;
  /** Step-forward / submit. */
  onNext?: () => void;
  nextLabel?: string;
  nextBusyLabel?: string;
  nextBusy?: boolean;
  nextDisabled?: boolean;
  nextType?: WizardFooterProps["nextType"];
  /** Optional line above the footer buttons (validation hint, error). */
  footerHint?: ReactNode;
};

export function SignupShell({
  stepIndex,
  stepCount,
  stepKey,
  children,
  exitHref,
  onExit,
  exitLabel = "Leave signup",
  onBack,
  onNext,
  nextLabel = "Next",
  nextBusyLabel,
  nextBusy = false,
  nextDisabled = false,
  nextType = "button",
  footerHint,
}: SignupShellProps) {
  const reduce = useReducedMotion() ?? false;
  const fraction = signupProgressFraction(stepIndex, stepCount);
  const stepNumber = Math.min(Math.max(stepIndex, 0), Math.max(stepCount - 1, 0)) + 1;

  return (
    <div className="flex h-[var(--tp-vh,100dvh)] w-full flex-col overflow-hidden bg-ht-canvas pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      {/* 1 — progress rail. Scale, not width: a transform animates on the
          compositor and never reflows the header sitting under it. */}
      <div
        role="progressbar"
        aria-label="Signup progress"
        aria-valuemin={1}
        aria-valuemax={stepCount}
        aria-valuenow={stepNumber}
        className="h-[2px] w-full shrink-0 bg-white/[0.07]"
      >
        <motion.div
          className="h-full w-full origin-left bg-ht-cyan-400"
          initial={false}
          animate={{ scaleX: fraction }}
          transition={signupTransition(reduce, SIGNUP_RAIL_DURATION)}
        />
      </div>

      {/* 2 — exit, top-left. Exactly one per screen. */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-1 pt-[max(env(safe-area-inset-top),10px)]">
        <ExitBackButton
          href={exitHref ?? marketingHref("/info")}
          label={exitLabel}
          {...(onExit ? { onExit } : {})}
        />
        <span className="text-[11px] font-black uppercase tracking-[0.14em] text-ht-fg-dim">
          Step {stepNumber} of {stepCount}
        </span>
      </div>

      {/* 3 — the one content region. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-2">
        <SignupStepTransition
          stepIndex={stepIndex}
          {...(stepKey ? { stepKey } : {})}
          className="mx-auto w-full max-w-md"
        >
          {children}
        </SignupStepTransition>
      </div>

      {/* 4 — progression. Dark tone; the shell is the dark canvas. */}
      <WizardFooter
        tone="dark"
        variant="sticky"
        {...(onBack ? { onBack } : {})}
        {...(onNext ? { onNext } : {})}
        nextLabel={nextLabel}
        {...(nextBusyLabel ? { nextBusyLabel } : {})}
        nextBusy={nextBusy}
        nextDisabled={nextDisabled}
        nextType={nextType}
        {...(footerHint ? { hint: footerHint } : {})}
      />
    </div>
  );
}
