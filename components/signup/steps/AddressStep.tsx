"use client";

import { useCallback, useState } from "react";
import { MapPin } from "lucide-react";
import type { AddressPrediction } from "@/components/admin/useAddressLookup";
import { SignupQuestion } from "@/components/signup/SignupQuestion";
import { SignupStaggerItem } from "@/components/signup/SignupStagger";
import { SignupTextField } from "@/components/signup/SignupTextField";
import { useSignupAddressLookup } from "@/components/signup/useSignupAddressLookup";
import { DEFAULT_VENUE_COUNTRY } from "@/lib/adminVenueForm";
import type { PinSource } from "@/lib/geofenceEditor";
import {
  SIGNUP_FIELD_LIMITS,
  SIGNUP_PLACES_QUERY_MAX_LENGTH,
  hasSignupAddress,
  type SignupDraft,
} from "@/lib/selfServeSignup";

// Step 4 of 6 — "Where is your venue?".
//
// The one screen that talks to Google, and the one with the most ways to fail in
// a real bar. Every failure has a recovery path ON THIS SCREEN, lifted from
// ActivateVenueFlow (admin-mobile Phase 4), which is the version that survived
// contact with salespeople standing inside venues:
//
//  - Places finds nothing (a brand-new bar, a POI Google has never indexed)
//      → "Enter it by hand" reveals the raw fields.
//  - Typed text yields NO COORDINATES, so the manual block also carries "Use my
//      current location". Without it a hand-typed venue reaches step 5 with an
//      empty map and a disabled radius dial, which reads as a broken screen.
//  - The rate limiter fires (429) or Supabase is down (503)
//      → useAddressLookup surfaces `payload.error` verbatim in the field.
//
// The lookup goes through useSignupAddressLookup — the flag-gated, rate-limited
// public route. Never useAddressLookup directly here, and never a fork of it:
// one implementation means one Places billing session
// (docs/partner-self-serve-signup-plan.md §4 Phase 1).

const GPS_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };

/**
 * A Places prediction for a business ("Murphy's Tap House") carries the name in
 * mainText; one for a plain street address carries the street number. Only the
 * former is worth pre-filling the venue name with. Same `/^\d/` rule as
 * ActivateVenueFlow's `businessNameFromPrediction` — kept identical on purpose
 * so both surfaces name a venue the same way.
 */
function businessNameFromPrediction(prediction: AddressPrediction): string {
  const main = prediction.mainText.trim();
  if (!main || /^\d/.test(main)) return "";
  return main;
}

type AddressStepProps = {
  draft: SignupDraft;
  onPatch: (patch: Partial<SignupDraft>) => void;
  /**
   * Where the pin this step set came from. Provenance is chrome, not data — it
   * drives the label on step 5 ("Pin set from the address lookup" vs "Pin set
   * from your phone") — so it lives in page state beside the draft rather than
   * inside it, and is never persisted or submitted.
   */
  onPinSource: (source: PinSource) => void;
  onEnter: () => void;
};

export function AddressStep({ draft, onPatch, onPinSource, onEnter }: AddressStepProps) {
  const lookup = useSignupAddressLookup();
  const [manual, setManual] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");

  // The same rule the step gate uses (signupStepIssue's "address" branch) — one
  // shared predicate, not a fourth copy (Finding #13).
  const hasAddress = hasSignupAddress(draft);

  const handleSelect = useCallback(
    async (prediction: AddressPrediction) => {
      const details = await lookup.select(prediction);
      if (!details) return;
      const suggested = businessNameFromPrediction(prediction);
      onPatch({
        street: details.street,
        city: details.city,
        state: details.state.toUpperCase(),
        zipCode: details.zipCode,
        latitude: details.latitude,
        longitude: details.longitude,
        placeId: details.placeId,
        // Never overwrite a name the partner already typed.
        ...(draft.venueName.trim() ? {} : { venueName: suggested }),
      });
      onPinSource("lookup");
      setManual(false);
      setLocateError("");
    },
    [draft.venueName, lookup, onPatch, onPinSource]
  );

  const clearAddress = useCallback(() => {
    onPatch({ street: "", city: "", state: "", zipCode: "", placeId: "", latitude: null, longitude: null });
    lookup.reset();
    onPinSource("none");
    setManual(false);
    setLocateError("");
  }, [lookup, onPatch, onPinSource]);

  const useCurrentLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocateError("This device can't share its location. You can drop the pin on the map on the next step.");
      return;
    }
    setLocating(true);
    setLocateError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        // A GPS pin no longer belongs to the looked-up Place — same rule
        // ActivateVenueFlow applies when the pin detaches from the lookup.
        onPatch({ latitude: position.coords.latitude, longitude: position.coords.longitude, placeId: "" });
        onPinSource("gps");
      },
      (positionError) => {
        setLocating(false);
        setLocateError(
          positionError.code === positionError.PERMISSION_DENIED
            ? "Location is blocked for this browser. Allow it in your phone's settings, or drop the pin on the next step."
            : "Couldn't get a fix. Try again near a window, or drop the pin on the next step."
        );
      },
      GPS_OPTIONS
    );
  }, [onPatch, onPinSource]);

  return (
    <SignupQuestion
      eyebrow="Your venue"
      title="Where is your venue?"
      helper="Start typing the business name — we'll fill in the rest."
    >
      <SignupTextField
        id="signup-address-search"
        label="Search for your venue"
        value={lookup.query}
        onChange={lookup.handleInput}
        onFocus={lookup.openIfPredictions}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        placeholder="e.g. Murphy's Tap House, Denver"
        maxLength={SIGNUP_PLACES_QUERY_MAX_LENGTH}
        {...(lookup.error ? { error: lookup.error } : {})}
      />

      {lookup.loading ? <p className="mt-2 ht-caption text-ht-fg-dim">Searching…</p> : null}

      {lookup.open && lookup.predictions.length > 0 ? (
        <ul className="mt-2 divide-y divide-white/[0.06] overflow-hidden rounded-ht-md border border-ht-hairline bg-ht-elevated">
          {lookup.predictions.map((prediction) => (
            <li key={prediction.placeId}>
              <button
                type="button"
                onClick={() => void handleSelect(prediction)}
                className="flex min-h-[56px] w-full flex-col items-start justify-center gap-0.5 px-3 py-2 text-left active:bg-white/[0.06]"
              >
                <span className="text-sm font-bold text-ht-primary">{prediction.mainText || prediction.fullText}</span>
                {prediction.secondaryText ? (
                  <span className="text-xs font-semibold text-ht-fg-dim">{prediction.secondaryText}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {lookup.noResults && !manual ? (
        <p className="mt-2 ht-caption text-ht-fg-muted">
          Nothing matched — new venues are often missing from maps. Enter it by hand below.
        </p>
      ) : null}

      {/* The resolved address, or the escape hatch. Never both. */}
      {hasAddress && !manual ? (
        <SignupStaggerItem className="mt-4">
          <div className="rounded-ht-lg border border-ht-hairline bg-ht-surface p-4">
            <p className="ht-eyebrow">Address</p>
            <p className="mt-1 text-sm font-bold leading-snug text-ht-primary">
              {draft.street}
              <br />
              {draft.city}, {draft.state} {draft.zipCode}
              <br />
              <span className="font-semibold text-ht-fg-dim">{DEFAULT_VENUE_COUNTRY}</span>
            </p>
            <button
              type="button"
              onClick={clearAddress}
              className="mt-3 inline-flex min-h-11 items-center rounded-ht-md border border-ht-soft px-3 text-sm font-bold text-ht-secondary active:bg-white/[0.06]"
            >
              Change address
            </button>
          </div>
        </SignupStaggerItem>
      ) : (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              setManual((prev) => !prev);
              lookup.close();
            }}
            aria-expanded={manual}
            aria-controls="signup-manual-address"
            className="flex min-h-11 w-full items-center justify-between gap-2 rounded-ht-md border border-ht-soft px-3 text-left text-sm font-bold text-ht-secondary active:bg-white/[0.06]"
          >
            <span>Can&apos;t find it? Enter it by hand</span>
            <span aria-hidden className="shrink-0 text-ht-fg-dim">{manual ? "▲" : "▼"}</span>
          </button>
        </div>
      )}

      {manual ? (
        <div id="signup-manual-address" className="mt-3 flex flex-col gap-3 rounded-ht-lg border border-ht-hairline bg-ht-surface p-4">
          <SignupTextField
            id="signup-street"
            label="Street"
            value={draft.street}
            onChange={(street) => onPatch({ street })}
            inputMode="text"
            autoComplete="street-address"
            placeholder="Street"
            maxLength={SIGNUP_FIELD_LIMITS.street}
            autoFocus={false}
          />
          <SignupTextField
            id="signup-city"
            label="City"
            value={draft.city}
            onChange={(city) => onPatch({ city })}
            inputMode="text"
            autoComplete="address-level2"
            placeholder="City"
            maxLength={SIGNUP_FIELD_LIMITS.city}
            autoFocus={false}
          />
          <div className="flex gap-3">
            <div className="w-24">
              <SignupTextField
                id="signup-state"
                label="State"
                value={draft.state}
                onChange={(state) => onPatch({ state: state.toUpperCase() })}
                inputMode="text"
                autoComplete="address-level1"
                placeholder="CO"
                maxLength={SIGNUP_FIELD_LIMITS.state}
                autoFocus={false}
              />
            </div>
            <div className="flex-1">
              <SignupTextField
                id="signup-zip"
                label="ZIP code"
                value={draft.zipCode}
                onChange={(zipCode) => onPatch({ zipCode })}
                onEnter={onEnter}
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="ZIP"
                maxLength={SIGNUP_FIELD_LIMITS.zipCode}
                autoFocus={false}
              />
            </div>
          </div>

          {/* US-only (plan §0). Rendered as a locked line rather than collected —
              DEFAULT_VENUE_COUNTRY stays the single source of the value. */}
          <p className="ht-caption text-ht-fg-dim">Country: {DEFAULT_VENUE_COUNTRY}</p>

          {/* Typed text carries no coordinates. This is the recovery path that
              makes the hand-entry route actually work in the field. */}
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={locating}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-ht-md border border-ht-cyan-400/40 bg-ht-cyan-400/10 px-4 text-sm font-black text-ht-cyan-200 disabled:opacity-60"
          >
            <MapPin aria-hidden className="h-4 w-4" />
            {locating ? "Getting a fix…" : "Use my current location"}
          </button>
          <p className="ht-caption text-ht-fg-dim">
            Standing inside the venue? Your phone&apos;s location beats any address lookup.
          </p>
          {locateError ? <p className="ht-caption text-ht-amber-300">{locateError}</p> : null}
        </div>
      ) : null}

      {/* The venue name. Auto-filled from a business prediction, always editable
          — a Places name is often the legal entity, not what's on the sign. */}
      <SignupStaggerItem className="mt-4">
        <p className="ht-eyebrow">Venue name</p>
        <p className="mb-2 ht-caption text-ht-fg-dim">This is what players see when they join.</p>
        <SignupTextField
          id="signup-venue-name"
          label="Venue name"
          value={draft.venueName}
          onChange={(venueName) => onPatch({ venueName })}
          onEnter={onEnter}
          inputMode="text"
          autoComplete="organization"
          placeholder="Murphy's Tap House"
          maxLength={SIGNUP_FIELD_LIMITS.venueName}
          autoFocus={false}
        />
      </SignupStaggerItem>
    </SignupQuestion>
  );
}
