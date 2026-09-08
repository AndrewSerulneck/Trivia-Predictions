"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { SignupQuestion } from "@/components/signup/SignupQuestion";
import { SignupTextField } from "@/components/signup/SignupTextField";
import { SIGNUP_FIELD_LIMITS, SIGNUP_PASSWORD_MIN_LENGTH } from "@/lib/selfServeSignup";

// Step 3 of 6.
//
// Plan §4 Phase 4: "min 8 (matches /api/owner/auth/register), reveal toggle, a
// quiet strength rail. No rules list until a rule is broken."
//
// That last clause is the design. A rules checklist rendered up front tells a
// partner they are about to fail four tests before they have typed anything; the
// rail says the same thing without accusing anyone. The one hard rule (8
// characters) appears as text ONLY once the field is non-empty and still short.
//
// AUTOCOMPLETE IS `new-password`, and that is load-bearing: it is what makes iOS
// Keychain and 1Password offer to GENERATE and save a strong password rather
// than trying to fill an existing one. Device checklist §6.

// No `error` prop: the only field-scoped server error the wizard routes back to
// its step is `email_taken` (Finding #11). Password errors surface as the
// generic footer hint.
type PasswordStepProps = {
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
};

/**
 * 0–3, deliberately coarse. This drives a three-segment rail, not a percentage:
 * a numeric score invites a partner to optimise it, and the only rule that
 * actually gates anything is the length floor.
 */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 {
  if (password.length < SIGNUP_PASSWORD_MIN_LENGTH) return 0;
  let variety = 0;
  if (/[a-z]/.test(password)) variety += 1;
  if (/[A-Z]/.test(password)) variety += 1;
  if (/\d/.test(password)) variety += 1;
  if (/[^A-Za-z0-9]/.test(password)) variety += 1;
  if (password.length >= 16 || (password.length >= 12 && variety >= 3)) return 3;
  if (password.length >= 12 || variety >= 3) return 2;
  return 1;
}

const RAIL_TONE: Record<0 | 1 | 2 | 3, string> = {
  0: "bg-white/10",
  1: "bg-ht-amber-400",
  2: "bg-ht-cyan-400",
  3: "bg-ht-emerald-400",
};

const RAIL_LABEL: Record<0 | 1 | 2 | 3, string> = {
  0: "",
  1: "Fine",
  2: "Good",
  3: "Strong",
};

export function PasswordStep({ value, onChange, onEnter }: PasswordStepProps) {
  const [revealed, setRevealed] = useState(false);

  const strength = passwordStrength(value);
  // The one rule, surfaced only once it is actually broken.
  const tooShort = value.length > 0 && value.length < SIGNUP_PASSWORD_MIN_LENGTH;
  const shown = tooShort ? `${SIGNUP_PASSWORD_MIN_LENGTH} characters minimum.` : "";

  return (
    <SignupQuestion
      eyebrow="Your account"
      title="Create a password"
      helper="You'll use this and your email to sign in to the partner dashboard."
    >
      <SignupTextField
        id="signup-password"
        label="Password"
        value={value}
        onChange={onChange}
        onEnter={onEnter}
        type={revealed ? "text" : "password"}
        inputMode="text"
        autoComplete="new-password"
        enterKeyHint="next"
        maxLength={SIGNUP_FIELD_LIMITS.password}
        {...(shown ? { error: shown } : {})}
        trailing={
          <button
            type="button"
            onClick={() => setRevealed((prev) => !prev)}
            aria-label={revealed ? "Hide password" : "Show password"}
            aria-pressed={revealed}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ht-fg-dim transition-colors active:text-ht-fg-primary"
          >
            {revealed ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
          </button>
        }
      />

      {/* The quiet rail. Three segments, no number, no checklist. Empty field =
          three inert tracks, so nothing is "failing" before you start typing. */}
      <div className="mt-3 flex items-center gap-3" aria-hidden={strength === 0}>
        <div className="flex flex-1 gap-1.5">
          {[1, 2, 3].map((segment) => (
            <span
              key={segment}
              className={`h-1 flex-1 rounded-full transition-colors motion-reduce:transition-none ${
                strength >= segment ? RAIL_TONE[strength] : "bg-white/10"
              }`}
            />
          ))}
        </div>
        <span className="w-12 shrink-0 text-right text-[11px] font-black uppercase tracking-[0.1em] text-ht-fg-dim">
          {RAIL_LABEL[strength]}
        </span>
      </div>
    </SignupQuestion>
  );
}
