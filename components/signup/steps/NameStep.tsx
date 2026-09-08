"use client";

import { SignupQuestion } from "@/components/signup/SignupQuestion";
import { SignupTextField } from "@/components/signup/SignupTextField";
import { SIGNUP_FIELD_LIMITS } from "@/lib/selfServeSignup";

// Step 1 of 6. One input, and the friendliest question in the flow — it is the
// first thing a stranger sees after tapping "Create partner account", so it asks
// for the thing nobody hesitates over.

// No `error` prop: the only field-scoped server error the wizard routes back to
// its step is `email_taken` (Finding #11). A name error, if one ever existed,
// would surface as the generic footer hint like every other server error.
type NameStepProps = {
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
};

export function NameStep({ value, onChange, onEnter }: NameStepProps) {
  return (
    <SignupQuestion eyebrow="Your account" title="First, what's your name?" helper="This is who we'll address on receipts and support.">
      <SignupTextField
        id="signup-name"
        label="Your name"
        value={value}
        onChange={onChange}
        onEnter={onEnter}
        inputMode="text"
        autoComplete="name"
        placeholder="Alex Rivera"
        maxLength={SIGNUP_FIELD_LIMITS.name}
      />
    </SignupQuestion>
  );
}
