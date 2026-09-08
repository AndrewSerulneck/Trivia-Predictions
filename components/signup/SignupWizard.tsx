"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SignupShell } from "@/components/signup/SignupShell";
import { AddressStep } from "@/components/signup/steps/AddressStep";
import { EmailStep } from "@/components/signup/steps/EmailStep";
import { GeofenceStep } from "@/components/signup/steps/GeofenceStep";
import { NameStep } from "@/components/signup/steps/NameStep";
import { PasswordStep } from "@/components/signup/steps/PasswordStep";
import { ReviewStep, type SignupDuplicate } from "@/components/signup/steps/ReviewStep";
import {
  clearSignupDraft,
  readSignupDraft,
  signupDraftHasAnswers,
  writeSignupDraft,
} from "@/components/signup/signupDraft";
import { marketingHref } from "@/lib/domainSplit";
import type { GeofenceEditorValue, PinSource } from "@/lib/geofenceEditor";
import {
  BLANK_SIGNUP_DRAFT,
  SIGNUP_PRICE_LABEL,
  SIGNUP_STEPS,
  signupStepIssue,
  type SignupDraft,
} from "@/lib/selfServeSignup";

// Partner Self-Serve Signup — the wizard. Phase 4
// (docs/partner-self-serve-signup-plan.md §4).
//
// THIS FILE OWNS STATE AND NOTHING ELSE. All chrome — the progress rail, the one
// ExitBackButton, the sticky WizardFooter, the step slide, the staggered
// entrance — belongs to SignupShell (Phase 3). There is deliberately no
// page-level header, no second Back and no second footer here.
//
// NOTHING IS WRITTEN TO THE DATABASE UNTIL THE REVIEW STEP SUBMITS (plan §3).
// Steps 1–5 live entirely in `draft`, mirrored to sessionStorage minus the
// password (components/signup/signupDraft.ts).
//
// ── Why Next is never disabled ───────────────────────────────────────────────
// Phase 3's handoff sketched `nextDisabled={!isStepValid}`. It is not wired that
// way, and the reason is ActivateVenueFlow's comment on the same decision: a
// greyed, inert Continue tells a partner that something is wrong but not what,
// and on the address step "what" can be any of five fields. Instead Next always
// fires, `signupStepIssue` names the one thing that is missing, and the shell
// renders it as the footer hint directly above the thumb that just tapped.
// `nextDisabled` is reserved for the genuinely inert state: a submit in flight.

const LAST_STEP_INDEX = SIGNUP_STEPS.length - 1;

/** Phase 5's contract. Keep this in sync with app/api/owner/signup/route.ts. */
type SignupResponse = {
  ok: boolean;
  venueId?: string;
  error?: string;
  /** 409 discriminator: which duplicate branch fired (plan §4 Phase 5 step 3). */
  code?: "venue_available" | "venue_claimed" | "email_taken";
  venue?: { id: string; name: string; address: string };
};

export function SignupWizard() {
  const router = useRouter();

  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<SignupDraft>(BLANK_SIGNUP_DRAFT);
  // Pin provenance is chrome (it drives GeofenceEditor's label), not an answer —
  // so it sits beside the draft and is never persisted or submitted.
  const [pinSource, setPinSource] = useState<PinSource>("none");
  const [hint, setHint] = useState("");
  // A server error that belongs to ONE field, shown on that field's step. Today
  // the only such error is `email_taken` (Finding #11): it used to land in the
  // review footer four steps from the input it is about. Every other server
  // error stays a generic footer `hint`.
  const [emailError, setEmailError] = useState("");
  // `emailTaken` is narrower than `emailError`: only the "this address already
  // has a partner account" case, which is the one the partner cannot fix by
  // retyping — so it is the only one that earns a sign-in link on the field.
  const [emailTaken, setEmailTaken] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [duplicate, setDuplicate] = useState<SignupDuplicate | null>(null);

  const step = SIGNUP_STEPS[index] ?? SIGNUP_STEPS[0];
  const [hydrated, setHydrated] = useState(false);

  // Restore after mount, never during render: sessionStorage does not exist on
  // the server, and reading it in the initial useState would hydrate a different
  // tree than the server rendered.
  useEffect(() => {
    const restored = readSignupDraft();
    if (restored.latitude !== null && restored.longitude !== null) {
      // The draft carries coordinates but not where they came from. "existing"
      // is the honest label for a pin restored from storage.
      setPinSource("existing");
    }
    setDraft(restored);
    setHydrated(true);
  }, []);

  // Mirror every change back to storage — but only once the restore above has
  // COMMITTED. `hydrated` is state, not a ref, deliberately: a ref flipped
  // inside the restore effect would already read true when this effect runs
  // later in the same commit, and it would write the still-blank draft straight
  // over the one we just read. Batched state means this effect skips that pass
  // entirely and first fires on the commit that carries the restored draft.
  useEffect(() => {
    if (!hydrated) return;
    writeSignupDraft(draft);
  }, [draft, hydrated]);

  const patch = useCallback((next: Partial<SignupDraft>) => {
    setDraft((prev) => ({ ...prev, ...next }));
    setHint("");
  }, []);

  const handleGeofenceChange = useCallback(
    (value: GeofenceEditorValue) => {
      // GeofenceEditor already clamps to 50–200 m (Phase 2), so the draft cannot
      // hold an out-of-band radius. Phase 5 re-validates anyway: a tampered
      // sessionStorage payload never passes through this callback.
      const detached = value.source === "gps" || value.source === "map" || value.source === "manual";
      patch({
        latitude: value.lat,
        longitude: value.lng,
        radius: value.radius,
        ...(detached ? { placeId: "" } : {}),
      });
      setPinSource(value.source);
    },
    [patch]
  );

  const submit = useCallback(
    async (claimVenueId?: string) => {
      setSubmitting(true);
      setHint("");
      setEmailError("");
      setEmailTaken(false);
      try {
        const response = await fetch("/api/owner/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name.trim(),
            email: draft.email.trim().toLowerCase(),
            password: draft.password,
            venueName: draft.venueName.trim(),
            street: draft.street.trim(),
            city: draft.city.trim(),
            state: draft.state.trim().toUpperCase(),
            zipCode: draft.zipCode.trim(),
            placeId: draft.placeId,
            latitude: draft.latitude,
            longitude: draft.longitude,
            radius: draft.radius,
            ...(claimVenueId ? { claimVenueId } : {}),
          }),
        });

        // Phase 5 has not shipped yet: with the flag on and no route, this is a
        // 404 with an HTML body. Say something true rather than "invalid JSON".
        if (response.status === 404) {
          setHint("Signup isn't available yet. Please try again shortly.");
          return;
        }

        const payload = (await response.json().catch(() => ({}))) as SignupResponse;

        // `email_taken` is about the email field, three steps back. Route it
        // there instead of stranding it in the review footer (Finding #11).
        if (response.status === 409 && payload.code === "email_taken") {
          setDuplicate(null);
          setEmailTaken(true);
          setEmailError(payload.error ?? "An account with this email already exists.");
          setIndex(SIGNUP_STEPS.indexOf("email"));
          return;
        }

        if (response.status === 409 && payload.venue && payload.code && payload.code !== "email_taken") {
          setDuplicate({
            kind: payload.code,
            venueId: payload.venue.id,
            venueName: payload.venue.name,
            address: payload.venue.address,
          });
          return;
        }

        if (!response.ok || !payload.ok) {
          setHint(payload.error ?? "Something went wrong. Please try again.");
          return;
        }

        // The answers are now rows in the database; a restored draft from here
        // on would only re-offer a signup that already happened.
        clearSignupDraft();
        // Payment handoff is Phase 6's. /owner/billing/setup already owns the
        // Checkout POST together with its bfcache and double-tap hardening, and
        // Phase 5 sets the owner session cookie before returning, so routing
        // there is the handoff — do not re-implement the checkout call here.
        router.replace("/owner/billing/setup");
      } catch {
        setHint("Network error. Check your connection and try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [draft, router]
  );

  /**
   * Step 2's "is this email already taken?" pre-check.
   *
   * Returns true when the wizard may advance. Blocking HERE is the whole point:
   * without it a partner whose email already has a `venue_owners` row filled in
   * four more steps, tapped "Start subscription", and was thrown back to this
   * field by the review screen's 409 — which reads as the wizard resetting
   * itself rather than as an answer about their email.
   *
   * IT FAILS OPEN, deliberately. A 404 (flag skew), a 503 (lookup down), a
   * rate-limit or a dead network all let the partner through, because
   * `POST /api/owner/signup` re-runs the same lookup through the same module
   * and is the authority. A pre-check that can wedge the entire wizard when a
   * non-essential route is unhealthy would be worse than the dead end it
   * replaces. Only a definite `available: false` stops anyone.
   */
  const checkEmailAvailable = useCallback(async (): Promise<boolean> => {
    setCheckingEmail(true);
    try {
      const response = await fetch("/api/signup/email-available", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: draft.email.trim().toLowerCase() }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        available?: boolean;
        error?: string;
      };
      if (response.ok && payload.ok && payload.available === false) {
        setEmailTaken(true);
        setEmailError(payload.error ?? "An account with this email already exists.");
        return false;
      }
      return true;
    } catch {
      return true;
    } finally {
      setCheckingEmail(false);
    }
  }, [draft.email]);

  const advance = useCallback(() => {
    const issue = signupStepIssue(step, draft);
    if (issue) {
      setHint(issue);
      return;
    }
    setHint("");

    if (step === "email") {
      void checkEmailAvailable().then((available) => {
        if (available) setIndex((prev) => prev + 1);
      });
      return;
    }

    if (index < LAST_STEP_INDEX) {
      setIndex((prev) => prev + 1);
      return;
    }
    void submit();
  }, [checkEmailAvailable, draft, index, step, submit]);

  const goBack = useCallback(() => {
    setHint("");
    setDuplicate(null);
    setIndex((prev) => Math.max(0, prev - 1));
  }, []);

  /**
   * "Leave signup", but only when there is something to lose.
   *
   * `onExit` WINS OVER EVERYTHING in useExitNavigation — supplying it replaces
   * the whole precedence chain, including the history-first behaviour that sends
   * a partner who arrived from /owner/login back to /owner/login. So it is
   * supplied ONLY on a dirty draft, where the confirm is worth that trade; a
   * clean draft gets the shell's ordinary Back and its `/info` fallback.
   *
   * The destination is marketingHref("/info"), never "/" — apex `/` is the
   * PLAYER sign-in (CLAUDE.md), and dropping a partner there is exactly the bug
   * that rule exists to prevent.
   */
  const dirty = signupDraftHasAnswers(draft);
  const handleExit = useCallback(() => {
    if (!window.confirm("Leave signup? Your answers won't be saved.")) return;
    clearSignupDraft();
    window.location.href = marketingHref("/info");
  }, []);

  const nextLabel =
    step === "review" ? `Start subscription — ${SIGNUP_PRICE_LABEL.amount}${SIGNUP_PRICE_LABEL.period}` : "Next";

  return (
    <SignupShell
      stepIndex={index}
      stepCount={SIGNUP_STEPS.length}
      stepKey={step}
      {...(dirty ? { onExit: handleExit } : {})}
      {...(index > 0 ? { onBack: goBack } : {})}
      {...(duplicate ? {} : { onNext: advance })}
      nextLabel={nextLabel}
      nextBusyLabel={checkingEmail ? "Checking…" : "Starting…"}
      nextBusy={submitting || checkingEmail}
      nextDisabled={submitting || checkingEmail}
      {...(hint ? { footerHint: hint } : {})}
    >
      {step === "name" ? (
        <NameStep value={draft.name} onChange={(name) => patch({ name })} onEnter={advance} />
      ) : null}

      {step === "email" ? (
        <EmailStep
          value={draft.email}
          onChange={(email) => {
            patch({ email });
            setEmailError("");
            setEmailTaken(false);
          }}
          onEnter={advance}
          taken={emailTaken}
          {...(emailError ? { error: emailError } : {})}
        />
      ) : null}

      {step === "password" ? (
        <PasswordStep value={draft.password} onChange={(password) => patch({ password })} onEnter={advance} />
      ) : null}

      {step === "address" ? (
        <AddressStep draft={draft} onPatch={patch} onPinSource={setPinSource} onEnter={advance} />
      ) : null}

      {step === "geofence" ? (
        <GeofenceStep draft={draft} source={pinSource} onChange={handleGeofenceChange} />
      ) : null}

      {step === "review" ? (
        <ReviewStep
          draft={draft}
          duplicate={duplicate}
          submitting={submitting}
          onClaim={(venueId) => void submit(venueId)}
          onEditLocation={() => {
            setDuplicate(null);
            setHint("");
            setIndex(SIGNUP_STEPS.indexOf("geofence"));
          }}
        />
      ) : null}
    </SignupShell>
  );
}
