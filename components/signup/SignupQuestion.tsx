"use client";

import type { ReactNode } from "react";
import { SignupStagger, SignupStaggerItem } from "@/components/signup/SignupStagger";

// Partner Self-Serve Signup — the one-question layout.
//
// Phase 3 (docs/partner-self-serve-signup-plan.md §4): "One question per screen,
// one input, one line of helper text maximum. No paragraphs."
//
// That rule is enforced by the SHAPE of this component, not by a comment on it:
// `title` and `helper` are strings, so there is nowhere to put a paragraph, a
// bullet list, or a second heading. If a screen genuinely needs more words, the
// answer is another step — not a longer screen.
//
// It also owns the staggered entrance so every screen's content arrives with the
// same rhythm: eyebrow, then title, then helper, then the input, ~40 ms apart.

type SignupQuestionProps = {
  /** Small tracked label above the question ("Your venue", "Your account"). */
  eyebrow?: string;
  /** The question itself. One sentence. */
  title: string;
  /** At most one line of support. Omit whenever the question stands alone. */
  helper?: string;
  /** The answer surface — normally exactly one SignupTextField. */
  children: ReactNode;
};

export function SignupQuestion({ eyebrow, title, helper, children }: SignupQuestionProps) {
  return (
    <SignupStagger className="flex flex-col gap-3 pt-3">
      {eyebrow ? (
        <SignupStaggerItem>
          <p className="ht-eyebrow">{eyebrow}</p>
        </SignupStaggerItem>
      ) : null}

      <SignupStaggerItem>
        <h1 className="ht-h1 text-balance">{title}</h1>
      </SignupStaggerItem>

      {helper ? (
        <SignupStaggerItem>
          <p className="ht-caption text-ht-muted">{helper}</p>
        </SignupStaggerItem>
      ) : null}

      <SignupStaggerItem className="pt-2">{children}</SignupStaggerItem>
    </SignupStagger>
  );
}
