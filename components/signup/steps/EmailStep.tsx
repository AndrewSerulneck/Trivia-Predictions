"use client";

import Link from "next/link";
import { useState } from "react";
import { SignupQuestion } from "@/components/signup/SignupQuestion";
import { SignupTextField } from "@/components/signup/SignupTextField";
import { SIGNUP_FIELD_LIMITS, isValidSignupEmail } from "@/lib/selfServeSignup";

// Step 2 of 6.
//
// Format validation runs ON BLUR, never per keystroke (plan §4 Phase 4). Every
// email is invalid while it is being typed — "a@" is a legitimate intermediate
// state — so a per-keystroke check means the partner watches a red error for the
// entire time they answer. `touched` is cleared on the next edit, so the error
// appears once, then gets out of the way.
//
// `taken` is the one error this step cannot resolve by editing the format: the
// address is fine, it simply belongs to an existing partner account. A red line
// alone leaves that partner with nowhere to go — self-serve is one venue per
// email, so "try again" is not the answer — so it also renders a real sign-in
// link. See SignupWizard's step-2 pre-check and lib/ownerEmailAvailability.ts.

type EmailStepProps = {
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  /** Server-side error (e.g. "an account with this email already exists"). Outranks the local one. */
  error?: string;
  /** True when `error` is the email-taken one, which gets a sign-in affordance. */
  taken?: boolean;
};

export function EmailStep({ value, onChange, onEnter, error, taken = false }: EmailStepProps) {
  const [touched, setTouched] = useState(false);

  const localError =
    touched && value.trim() && !isValidSignupEmail(value)
      ? "That email doesn't look right — check for a typo."
      : "";
  const shown = error || localError;

  return (
    <SignupQuestion
      eyebrow="Your account"
      title="What's your email?"
      helper="Your receipts, your login, and where the setup guide goes."
    >
      <SignupTextField
        id="signup-email"
        label="Email address"
        value={value}
        onChange={(next) => {
          setTouched(false);
          onChange(next);
        }}
        onBlur={() => setTouched(true)}
        onEnter={() => {
          setTouched(true);
          onEnter();
        }}
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@yourbar.com"
        maxLength={SIGNUP_FIELD_LIMITS.email}
        {...(shown ? { error: shown } : {})}
      />

      {error && taken ? (
        <Link
          href="/owner/login"
          className="mt-3 inline-flex min-h-11 items-center justify-center rounded-ht-md border border-ht-cyan-400/40 bg-ht-cyan-400/10 px-4 text-sm font-black text-ht-cyan-200"
        >
          Sign in to your account
        </Link>
      ) : null}
    </SignupQuestion>
  );
}
