"use client";

import type { ReactNode } from "react";
import { NextButton, type NextButtonProps } from "@/components/navigation/NextButton";
import { StepBackButton, type NavTone } from "@/components/navigation/StepBackButton";

// ─────────────────────────────────────────────────────────────────────────────
// WizardFooter — the sticky bottom bar that owns step progression.
//
// Mirrors AppBar's chrome (same border, blur and translucent slate) so top and
// bottom read as one system: StepBack on the leading side, Next on the trailing
// side, nothing else. Exit-back stays in the top bar and never appears here.
//
// Omitting `onBack` renders no step-back (first step of a flow); the Next button
// keeps the trailing position either way.
//
// Two axes, deliberately orthogonal (Phase 4):
//  - `tone`    dark (player) vs light (admin / owner white card). Colors only.
//  - `variant` "sticky" pins the footer to the bottom of the viewport with its
//              own chrome; "inline" drops the chrome and sits as the last row
//              INSIDE a card (JoinFlow's join card, the reward wizard's card),
//              where a full-bleed translucent bar would read as a second panel.
//              Same controls, same order, same positions either way.
// ─────────────────────────────────────────────────────────────────────────────

const STICKY_CHROME_CLASS: Record<NavTone, string> = {
  dark: "sticky bottom-0 z-30 shrink-0 border-t border-white/[0.08] bg-slate-950/[0.86] px-[13px] pb-[max(env(safe-area-inset-bottom),10px)] pt-2.5 backdrop-blur-md",
  light:
    "sticky bottom-0 z-30 shrink-0 border-t border-slate-200 bg-slate-100/95 px-[13px] pb-[max(env(safe-area-inset-bottom),10px)] pt-2.5 backdrop-blur",
};

const HINT_CLASS: Record<NavTone, string> = {
  dark: "mb-2 text-xs text-ht-fg-muted",
  light: "mb-2 text-xs text-slate-500",
};

export type WizardFooterProps = {
  /** Omit on the first step — the footer then renders Next alone, still trailing. */
  onBack?: () => void;
  backLabel?: string;
  backDisabled?: boolean;
  /** Omit to render the footer with no primary (rare — a terminal step). */
  onNext?: () => void;
  nextLabel?: string;
  nextBusyLabel?: string;
  nextBusy?: boolean;
  nextDisabled?: boolean;
  nextHideChevron?: boolean;
  nextAccentClass?: NextButtonProps["accentClass"];
  /** Replaces the Next button's size slot (min-height / padding / text size). */
  nextSizeClass?: NextButtonProps["sizeClass"];
  /** "submit" lets an enclosing <form> own the action (keeps Enter-to-submit). */
  nextType?: NextButtonProps["type"];
  tone?: NavTone;
  variant?: "sticky" | "inline";
  /** Optional line rendered above the buttons (validation hint, step counter). */
  hint?: ReactNode;
  className?: string;
};

export function WizardFooter({
  onBack,
  backLabel = "Back",
  backDisabled = false,
  onNext,
  nextLabel = "Next",
  nextBusyLabel,
  nextBusy = false,
  nextDisabled = false,
  nextHideChevron = false,
  nextAccentClass,
  nextSizeClass,
  nextType = "button",
  tone = "dark",
  variant = "sticky",
  hint,
  className = "",
}: WizardFooterProps) {
  const chrome = variant === "sticky" ? STICKY_CHROME_CLASS[tone] : "";
  const showNext = onNext !== undefined || nextType === "submit";

  return (
    <div className={`${chrome}${className ? `${chrome ? " " : ""}${className}` : ""}`}>
      {hint ? <div className={HINT_CLASS[tone]}>{hint}</div> : null}
      <div className="flex items-center gap-3">
        {onBack ? (
          <StepBackButton onClick={onBack} label={backLabel} disabled={backDisabled} tone={tone} />
        ) : null}
        {showNext ? (
          <NextButton
            {...(onNext ? { onClick: onNext } : {})}
            label={nextLabel}
            busyLabel={nextBusyLabel}
            busy={nextBusy}
            disabled={nextDisabled}
            hideChevron={nextHideChevron}
            tone={tone}
            type={nextType}
            {...(nextAccentClass ? { accentClass: nextAccentClass } : {})}
            {...(nextSizeClass ? { sizeClass: nextSizeClass } : {})}
          />
        ) : null}
      </div>
    </div>
  );
}
