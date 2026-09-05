"use client";

import { ChevronRight } from "lucide-react";
import type { NavTone } from "@/components/navigation/StepBackButton";

// ─────────────────────────────────────────────────────────────────────────────
// NextButton — "advance this flow".
//
// Trailing side of the sticky WizardFooter, bottom-right, primary CTA. The
// canonical primary in this app is cyan-400 on slate-950 (THEME.*.primary,
// JoinFlow's existing "Next →"); `accentClass` exists only for a surface whose
// accent genuinely differs, and should be reached for rarely.
//
// `tone="light"` swaps in the indigo primary the light-themed non-player
// surfaces already use (ownerPrimaryButtonClass, the admin wizard's
// primaryButton) — same control, same position, a palette that belongs on a
// white card. Prefer it over hand-writing `accentClass` on those surfaces.
//
// Body copy like "Next round starts in" is NOT this control.
// ─────────────────────────────────────────────────────────────────────────────

const NEXT_BUTTON_SHELL_CLASS =
  "tp-clean-button inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl font-black transition-all active:translate-y-[1px] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2";

/**
 * Size is a separate, REPLACEABLE slot rather than something a `className` can
 * append to: `text-base` and `text-[32px]` are the same Tailwind property, so an
 * appended override wins or loses on stylesheet order, not on class order. Pass
 * `sizeClass` to change the size; never try to out-append it.
 */
export const NEXT_BUTTON_SIZE_CLASS = "min-h-[44px] px-6 py-3 text-base";

export const NEXT_BUTTON_BASE_CLASS = `${NEXT_BUTTON_SHELL_CLASS} ${NEXT_BUTTON_SIZE_CLASS}`;

export const NEXT_BUTTON_ACCENT_CLASS = "bg-cyan-400 text-slate-950 focus-visible:ring-cyan-400/60";

export const NEXT_BUTTON_TONE_CLASS: Record<NavTone, string> = {
  dark: NEXT_BUTTON_ACCENT_CLASS,
  light: "bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-300",
};

export type NextButtonProps = {
  /** Optional only so `type="submit"` can let the form own the action. */
  onClick?: () => void;
  label?: string;
  /** Shown instead of `label` while `busy` is true. */
  busyLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  /** Hide the trailing chevron (e.g. a terminal "Let's Go!" step). */
  hideChevron?: boolean;
  tone?: NavTone;
  /** Override the primary accent. Must supply its own bg / text / focus ring. */
  accentClass?: string;
  /** Replaces NEXT_BUTTON_SIZE_CLASS wholesale (min-height / padding / text size). */
  sizeClass?: string;
  className?: string;
  type?: "button" | "submit";
};

export function NextButton({
  onClick,
  label = "Next",
  busyLabel,
  busy = false,
  disabled = false,
  hideChevron = false,
  tone = "dark",
  accentClass,
  sizeClass = NEXT_BUTTON_SIZE_CLASS,
  className = "",
  type = "button",
}: NextButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={`${NEXT_BUTTON_SHELL_CLASS} ${sizeClass} ${accentClass ?? NEXT_BUTTON_TONE_CLASS[tone]}${className ? ` ${className}` : ""}`}
    >
      {busy ? busyLabel ?? label : label}
      {hideChevron || busy ? null : <ChevronRight aria-hidden="true" className="h-4 w-4" />}
    </button>
  );
}
