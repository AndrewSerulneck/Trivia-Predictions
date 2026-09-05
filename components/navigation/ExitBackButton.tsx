"use client";

import { ChevronLeft } from "lucide-react";
import { useExitNavigation, type ExitNavigationOptions } from "@/components/navigation/exitNavigation";
import { type NavTone } from "@/components/navigation/StepBackButton";

// ─────────────────────────────────────────────────────────────────────────────
// ExitBackButton — "leave this screen for its parent".
//
// THE canonical Back. Always in the leading slot of the sticky top bar,
// top-left, exactly one per screen. Never inline in page content, never at the
// bottom of a screen, never in a wizard footer (that's StepBackButton).
//
// Neutral dark slate with NO accent tint — that is what lets the identical
// button sit unchanged on Bingo's warm felt, Category Blitz's emerald, Live
// Trivia's cyan and the plain content pages. Do not tint it per game.
//
// This deliberately replaces the warm `.tp-exit-pill` treatment; see
// docs/navigation-unification-plan.md §1a and Phase 7's style-guide amendment.
// ─────────────────────────────────────────────────────────────────────────────

// Layout is tone-agnostic; tone supplies border + surface + text. `dark` is the
// default and its composed string is the exact set of utilities Phase 0 shipped
// (order is not significant). `light` exists for the owner auth/billing white
// card (Phase 5) — the same POSITION and BEHAVIOR on a light-themed surface, per
// docs/navigation-unification-plan.md §10f. If a Phase 7 tripwire ever asserts
// on EXIT_BACK_CIRCLE_CLASS, assert on the rendered class *set*, not the literal.
export const EXIT_BACK_CIRCLE_LAYOUT_CLASS =
  "tp-clean-button inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border transition-colors";

export const EXIT_BACK_TONE_CLASS: Record<NavTone, string> = {
  dark: "border-white/10 bg-slate-900 text-slate-300 hover:text-white",
  light: "border-slate-300 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900",
};

const EXIT_BACK_LABEL_TONE_CLASS: Record<NavTone, string> = {
  dark: "text-slate-300",
  light: "text-slate-600",
};

/** Dark tone, kept as a named export for callers that only need the string. */
export const EXIT_BACK_CIRCLE_CLASS = `${EXIT_BACK_CIRCLE_LAYOUT_CLASS} ${EXIT_BACK_TONE_CLASS.dark}`;

export type ExitBackButtonProps = ExitNavigationOptions & {
  /**
   * Accessible name, and — when `showLabel` is set — the text rendered BESIDE
   * the circle. Never rendered inside it.
   */
  label?: string;
  /** Render `label` as visible text next to the circle (content pages where the destination isn't obvious). */
  showLabel?: boolean;
  /** Extra classes on the circle itself. Keep to layout; do not re-tint. */
  className?: string;
  /**
   * Palette. `dark` (default) is the dark-native circle; `light` is for the
   * owner auth/billing white card. Shares the `NavTone` vocabulary with
   * StepBackButton / NextButton / WizardFooter.
   */
  tone?: NavTone;
  /**
   * Suppress the exit. For surfaces that run an async teardown on the way out
   * (Live Trivia's `goHome()` behind its `isLeaving` guard) so the control can
   * be visibly inert while the exit animation plays.
   */
  disabled?: boolean;
};

export function ExitBackButton({
  href = "/",
  label = "Back",
  preferHref = false,
  venueHomeFallback = false,
  onExit,
  showLabel = false,
  className = "",
  disabled = false,
  tone = "dark",
}: ExitBackButtonProps) {
  const { handleExit, triggerBackHaptic } = useExitNavigation({
    href,
    preferHref,
    venueHomeFallback,
    onExit,
  });

  const button = (
    <button
      type="button"
      onMouseDown={triggerBackHaptic}
      onClick={handleExit}
      aria-label={label}
      disabled={disabled}
      className={`${EXIT_BACK_CIRCLE_LAYOUT_CLASS} ${EXIT_BACK_TONE_CLASS[tone]} disabled:opacity-50${className ? ` ${className}` : ""}`}
    >
      <ChevronLeft aria-hidden="true" className="h-4 w-4" />
    </button>
  );

  if (!showLabel) {
    return button;
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {button}
      <span
        aria-hidden="true"
        className={`truncate text-[13px] font-black uppercase tracking-[0.11em] ${EXIT_BACK_LABEL_TONE_CLASS[tone]}`}
      >
        {label}
      </span>
    </span>
  );
}
