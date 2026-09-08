"use client";

import { useState } from "react";
import { SignupQuestion } from "@/components/signup/SignupQuestion";
import { SignupStaggerItem } from "@/components/signup/SignupStagger";
import { DEFAULT_VENUE_COUNTRY } from "@/lib/adminVenueForm";
import { SIGNUP_PRICE_LABEL, hasSignupPin, type SignupDraft } from "@/lib/selfServeSignup";

// Step 6 of 6 — confirm, then pay.
//
// Compact by design: every value here was answered two screens ago, so this is a
// receipt, not a form. The only new information on the page is the price and
// what happens next.
//
// THE MAP IS A STATIC IMAGE, not a re-mounted GeofenceEditor. See
// app/api/signup/venue-map/route.ts for why. It is also NON-FATAL: if the image
// 429s, 503s or the key is missing, the summary still renders and the button
// still works. A partner must never be unable to pay because a thumbnail failed.

export type SignupDuplicate = {
  /** "venue_available" → claimable; "venue_claimed" → someone already owns it. */
  kind: "venue_available" | "venue_claimed";
  venueId: string;
  venueName: string;
  address: string;
};

type ReviewStepProps = {
  draft: SignupDraft;
  /** Set when POST /api/owner/signup answered 409 with a nearby venue (Phase 5). */
  duplicate?: SignupDuplicate | null;
  /**
   * A submit is in flight. On the duplicate panel the WizardFooter is hidden, so
   * the claim button is the only control on screen — without this a double tap
   * burns two of five hourly rate-limit slots and can 409 a signup that already
   * succeeded (Finding #4).
   */
  submitting?: boolean;
  /** Confirming "yes, this is my venue" — re-submits with claimVenueId. */
  onClaim?: (venueId: string) => void;
  /** Dismiss the match and create a new venue anyway is NOT offered: see below. */
  onEditLocation?: () => void;
};

export function ReviewStep({ draft, duplicate, submitting, onClaim, onEditLocation }: ReviewStepProps) {
  const [mapFailed, setMapFailed] = useState(false);

  if (duplicate) {
    return (
      <DuplicatePanel
        duplicate={duplicate}
        submitting={submitting ?? false}
        {...(onClaim ? { onClaim } : {})}
        {...(onEditLocation ? { onEditLocation } : {})}
      />
    );
  }

  const mapSrc = hasSignupPin(draft)
    ? `/api/signup/venue-map?lat=${draft.latitude}&lon=${draft.longitude}&radius=${draft.radius}`
    : "";

  return (
    <SignupQuestion eyebrow="Almost there" title="Does this look right?" helper="You can change any of it later from the partner dashboard.">
      <SignupStaggerItem>
        <div className="overflow-hidden rounded-ht-lg border border-ht-hairline bg-ht-surface">
          {mapSrc && !mapFailed ? (
            // A plain <img>, not next/image: the source is a rate-limited API
            // route streaming raw PNG bytes, which the image optimizer cannot
            // fetch or cache, and an optimizer pass would spend a second
            // request on every render.
            <img
              src={mapSrc}
              alt={`Map of ${draft.venueName || "your venue"} with its ${draft.radius} m geofence`}
              width={600}
              height={260}
              className="block h-40 w-full object-cover"
              onError={() => setMapFailed(true)}
            />
          ) : null}

          <dl className="divide-y divide-white/[0.06]">
            <ReviewRow label="Venue" value={draft.venueName || "—"} />
            <ReviewRow
              label="Address"
              value={
                <>
                  {draft.street}
                  <br />
                  {draft.city}, {draft.state} {draft.zipCode}
                  <br />
                  <span className="font-semibold text-ht-fg-dim">{DEFAULT_VENUE_COUNTRY}</span>
                </>
              }
            />
            <ReviewRow label="Geofence" value={`${draft.radius} m around your pin`} />
            <ReviewRow label="Your account" value={draft.email || "—"} />
          </dl>
        </div>
      </SignupStaggerItem>

      <SignupStaggerItem className="mt-3">
        <div className="rounded-ht-lg border border-ht-cyan-400/40 bg-ht-surface p-4">
          <p className="ht-eyebrow">Venue Pro</p>
          <div className="mt-1 font-black text-ht-primary">
            <span className="text-4xl">{SIGNUP_PRICE_LABEL.amount}</span>
            <span className="text-base text-ht-muted"> {SIGNUP_PRICE_LABEL.period}</span>
          </div>
          <p className="mt-3 ht-caption text-ht-fg-muted">
            Next you&apos;ll go to Stripe&apos;s secure checkout to enter your card. Cancel anytime.
          </p>
        </div>
      </SignupStaggerItem>
    </SignupQuestion>
  );
}

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="shrink-0 text-[11px] font-black uppercase tracking-[0.12em] text-ht-fg-dim">{label}</dt>
      <dd className="text-right text-sm font-bold leading-snug text-ht-primary">{value}</dd>
    </div>
  );
}

/**
 * The proximity match (plan §0: "Never silently create a second row for one
 * bar"). Two outcomes, and NEITHER offers "create it anyway":
 *
 *  - venue_available — an unowned row already exists for this address, almost
 *    always one an admin created during a sales visit. Claiming links the new
 *    owner to it; creating a duplicate would split that venue's players and
 *    leaderboards across two rows with no way to merge them.
 *  - venue_claimed — someone already owns it. The honest answers are "sign in"
 *    or "talk to us", not a second subscription for the same bar.
 *
 * The escape hatch for a genuine false positive (two bars in one building) is
 * "my venue is somewhere else" → back to the pin, which is a real, checkable
 * correction rather than a bypass button.
 */
function DuplicatePanel({
  duplicate,
  submitting,
  onClaim,
  onEditLocation,
}: {
  duplicate: SignupDuplicate;
  submitting: boolean;
  onClaim?: (venueId: string) => void;
  onEditLocation?: () => void;
}) {
  const claimable = duplicate.kind === "venue_available";

  return (
    <SignupQuestion
      eyebrow="One moment"
      title={claimable ? "Is this your venue?" : "This venue already has an owner"}
      helper={
        claimable
          ? "We already have a venue at this location — claim it instead of creating a second one."
          : "Someone has already set up a partner account for this address."
      }
    >
      <SignupStaggerItem>
        <div className="rounded-ht-lg border border-ht-hairline bg-ht-surface p-4">
          <p className="text-base font-black text-ht-primary">{duplicate.venueName}</p>
          <p className="mt-1 ht-caption text-ht-fg-muted">{duplicate.address}</p>
        </div>
      </SignupStaggerItem>

      <SignupStaggerItem className="mt-3 flex flex-col gap-2">
        {claimable && onClaim ? (
          <button
            type="button"
            onClick={() => onClaim(duplicate.venueId)}
            disabled={submitting}
            aria-busy={submitting}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-ht-md bg-ht-cyan-400 px-4 font-black text-slate-950 active:translate-y-px disabled:pointer-events-none disabled:opacity-60"
          >
            {submitting ? "Claiming…" : "Yes — this is my venue"}
          </button>
        ) : (
          <a
            href="/owner/login"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-ht-md bg-ht-cyan-400 px-4 font-black text-slate-950 active:translate-y-px"
          >
            Sign in instead
          </a>
        )}

        {onEditLocation ? (
          <button
            type="button"
            onClick={onEditLocation}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-ht-md border border-ht-soft px-4 text-sm font-bold text-ht-secondary active:bg-white/[0.06]"
          >
            No — my venue is somewhere else
          </button>
        ) : null}

        {claimable ? null : (
          <p className="ht-caption text-ht-fg-dim">
            If that isn&apos;t right, email support and we&apos;ll sort it out.
          </p>
        )}
      </SignupStaggerItem>
    </SignupQuestion>
  );
}
