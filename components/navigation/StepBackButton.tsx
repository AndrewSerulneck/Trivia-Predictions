"use client";

import { ChevronLeft } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// StepBackButton — "previous step of this multi-step flow".
//
// NOT the same control as ExitBackButton. It lives on the LEADING side of a
// sticky bottom WizardFooter, paired with NextButton on the trailing side, and
// is styled ghost/tertiary so it never competes with either the primary Next or
// the top-left exit. A wizard screen legitimately has BOTH: top-left abandons
// the whole flow, bottom-left goes back one step.
//
// `tone` exists because the same POSITIONS and BEHAVIOR have to work on the
// light-themed non-player surfaces (admin, the owner auth/billing white card)
// that the plan explicitly exempts from the dark-native styling. Dark is the
// default and is byte-identical to what shipped in Phase 0.
// ─────────────────────────────────────────────────────────────────────────────

export type NavTone = "dark" | "light";

const STEP_BACK_LAYOUT_CLASS =
  "tp-clean-button inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-5 py-3 text-sm font-black transition-all active:translate-y-[1px] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2";

export const STEP_BACK_TONE_CLASS: Record<NavTone, string> = {
  dark: "border border-white/15 bg-white/5 text-slate-300 focus-visible:ring-white/30",
  light: "border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:ring-indigo-300",
};

/** Dark tone, kept as a named export for callers that only need the string. */
export const STEP_BACK_CLASS = `${STEP_BACK_LAYOUT_CLASS} ${STEP_BACK_TONE_CLASS.dark}`;

export type StepBackButtonProps = {
  onClick: () => void;
  label?: string;
  disabled?: boolean;
  tone?: NavTone;
  className?: string;
};

export function StepBackButton({
  onClick,
  label = "Back",
  disabled = false,
  tone = "dark",
  className = "",
}: StepBackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${STEP_BACK_LAYOUT_CLASS} ${STEP_BACK_TONE_CLASS[tone]}${className ? ` ${className}` : ""}`}
    >
      <ChevronLeft aria-hidden="true" className="h-4 w-4" />
      {label}
    </button>
  );
}
