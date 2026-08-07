"use client";

import { useEffect, useRef, useState } from "react";
import type { Venue } from "@/types";
import { GeofenceEditor } from "@/components/admin/GeofenceEditor";
import { useAddressLookup, type AddressPrediction } from "@/components/admin/useAddressLookup";
import { adminField, adminLabel } from "@/lib/adminStyles";
import type { GeofenceEditorValue, PinSource } from "@/lib/geofenceEditor";
import {
  BLANK_VENUE_FORM,
  DEFAULT_VENUE_COUNTRY,
  buildVenuePayload,
  validateVenueForm,
  venueToForm,
  type VenueFormState,
} from "@/lib/adminVenueForm";

/**
 * Activate-a-Venue — the mobile venue create/edit flow (admin-mobile Phase 4).
 *
 * Shaped around what a salesperson actually does standing inside a bar:
 *
 *  Step 1 "Where is it?"  Address lookup only. One tap fills street/city/state/
 *    ZIP *and* the geofence pin. Every field failure has a recovery path on the
 *    same screen — see RECOVERY below.
 *  Step 2 "About the venue"  Name, then the GeofenceEditor (map + radius dial on
 *    one screen), everything else folded into Advanced.
 *
 * Venue-activation Phase 4 (docs/venue-activation-map-radius-plan.md) replaced
 * step 2's preset chips + number box and the "Adjust pin" bottom sheet with the
 * shared GeofenceEditor, so the circle grows under your finger while you size
 * it. Step 1 keeps a *summary* of the pin only (label + GPS button); the
 * editable map lives on step 2 where the radius is.
 *
 * RECOVERY (the part that matters in the field):
 *  - Lookup finds nothing (new bar, POI not in Places) → "Enter the address by
 *    hand", which reveals the address fields *and* the GPS button, because typed
 *    text produces no coordinates.
 *  - Lookup finds the address but the pin is wrong (rooftop vs entrance, strip
 *    mall, big parking lot) → "Use my current location" sets the pin from the
 *    phone the salesperson is holding *inside* the venue, which beats any
 *    geocode; step 2's map drags it for anything else.
 *  - Venue has no clean street address (fairground, marina, stadium concession)
 *    → the street line is display copy for players; the geofence runs off the
 *    pin. The manual card says so, so they type a human landmark and set the
 *    pin from GPS.
 */

type Step = "location" | "details";

const sectionCard = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";

function coordsOf(form: VenueFormState): { lat: number; lng: number } | null {
  const lat = Number.parseFloat(form.latitude);
  const lng = Number.parseFloat(form.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function hasWrittenAddress(form: VenueFormState): boolean {
  return Boolean(form.street.trim() && form.city.trim() && form.state.trim() && form.zipCode.trim());
}

// A Places prediction for a business ("Murphy's Tap House") carries the name in
// mainText; one for a plain street address carries the street number. Only the
// former is worth pre-filling the venue name with.
function businessNameFromPrediction(prediction: AddressPrediction): string {
  const main = prediction.mainText.trim();
  if (!main || /^\d/.test(main)) return "";
  return main;
}

type ActivateVenueFlowProps = {
  mode: "create" | "edit";
  venue?: Venue;
  busy: boolean;
  error: string;
  onSubmit: (payload: ReturnType<typeof buildVenuePayload>) => void;
  onValidationError: (message: string) => void;
  onCancel: () => void;
  onDelete?: () => void;
};

export function ActivateVenueFlow({
  mode,
  venue,
  busy,
  error,
  onSubmit,
  onValidationError,
  onCancel,
  onDelete,
}: ActivateVenueFlowProps) {
  const [form, setForm] = useState<VenueFormState>(() => (venue ? venueToForm(venue) : BLANK_VENUE_FORM));
  const [step, setStep] = useState<Step>(mode === "edit" ? "details" : "location");
  const [manualAddress, setManualAddress] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pinSource, setPinSource] = useState<PinSource>(venue ? "existing" : "none");
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [hintError, setHintError] = useState("");

  const lookup = useAddressLookup();
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (mode === "create") searchRef.current?.focus();
  }, [mode]);

  function patch(next: Partial<VenueFormState>) {
    setForm((prev) => ({ ...prev, ...next }));
    setHintError("");
  }

  const coords = coordsOf(form);
  const radiusValue = Number.parseInt(form.radius, 10) || 150;
  const addressReady = hasWrittenAddress(form) && coords !== null;

  /**
   * The single mutation path for pin + radius on step 2. GeofenceEditor owns no
   * form state, so every change (pin drag, GPS fix, dial move, typed coordinate)
   * arrives here as one value. `placeId` is cleared for the three sources that
   * mean "the pin no longer belongs to the looked-up Place" — the same rule the
   * three separate call sites enforced before Phase 4 collapsed them.
   */
  function handleGeofenceChange(value: GeofenceEditorValue) {
    const detached = value.source === "gps" || value.source === "map" || value.source === "manual";
    patch({
      latitude: String(value.lat),
      longitude: String(value.lng),
      radius: String(value.radius),
      ...(detached ? { placeId: "" } : {}),
    });
    setPinSource(value.source);
    if (value.source !== "gps") setAccuracyMeters(null);
  }

  async function handleSelectPrediction(prediction: AddressPrediction) {
    const details = await lookup.select(prediction);
    if (!details) return;
    const suggestedName = businessNameFromPrediction(prediction);
    patch({
      street: details.street,
      city: details.city,
      state: details.state.toUpperCase(),
      zipCode: details.zipCode,
      country: details.country || DEFAULT_VENUE_COUNTRY,
      latitude: String(details.latitude),
      longitude: String(details.longitude),
      placeId: details.placeId,
      ...(form.name.trim() ? {} : { name: suggestedName }),
    });
    setPinSource("lookup");
    setAccuracyMeters(null);
    setManualAddress(false);
  }

  function startManualAddress() {
    setManualAddress(true);
    lookup.close();
    if (!form.country.trim()) patch({ country: DEFAULT_VENUE_COUNTRY });
  }

  function toggleManualAddress() {
    if (manualAddress) {
      setManualAddress(false);
    } else {
      startManualAddress();
    }
  }

  function clearAddress() {
    patch({
      street: "",
      city: "",
      state: "",
      zipCode: "",
      country: "",
      latitude: "",
      longitude: "",
      placeId: "",
    });
    lookup.reset();
    setManualAddress(false);
    setPinSource("none");
    setAccuracyMeters(null);
  }

  function goToDetails() {
    if (!hasWrittenAddress(form)) {
      setHintError("Add a street, city, state and ZIP so players see where this is.");
      return;
    }
    if (!coords) {
      setHintError("Set the pin — tap “Use my current location” while you're standing in the venue.");
      return;
    }
    setHintError("");
    setStep("details");
  }

  function submit() {
    const validationError = validateVenueForm(form);
    if (validationError) {
      setHintError(validationError);
      onValidationError(validationError);
      return;
    }
    setHintError("");
    onSubmit(buildVenuePayload(form));
  }

  const banner = hintError || error;

  return (
    <div className="pb-2">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            // Create: step 2 walks back to step 1. Edit: step 1 is only ever
            // reached from step 2's "Change address", so it walks back there —
            // never out of the form, which would drop unsaved edits.
            if (mode === "create" && step === "details") setStep("location");
            else if (mode === "edit" && step === "location") setStep("details");
            else onCancel();
          }}
          className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm active:bg-slate-50"
        >
          ‹ {(mode === "create" && step === "details") || (mode === "edit" && step === "location")
            ? mode === "create"
              ? "Address"
              : "Details"
            : "Venues"}
        </button>
        {mode === "create" ? (
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Step {step === "location" ? 1 : 2} of 2
          </span>
        ) : null}
      </div>

      {step === "location" ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Where is it?</h2>
            <p className="mt-1 text-sm text-slate-600">
              Start typing the name of the business or their address below
            </p>
          </div>

          <div className={sectionCard}>
            <label className={adminLabel} htmlFor="venue-address-search">
              Enter business name here to fill in details automatically
            </label>
            <input
              id="venue-address-search"
              ref={searchRef}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              value={lookup.query}
              onChange={(event) => lookup.handleInput(event.target.value)}
              onFocus={lookup.openIfPredictions}
              placeholder="e.g. Murphy's Tap House, Denver"
              className={`${adminField} min-h-[48px] text-base`}
            />
            {lookup.loading ? <p className="mt-2 text-xs text-slate-500">Searching…</p> : null}

            {lookup.open && lookup.predictions.length > 0 ? (
              <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                {lookup.predictions.map((prediction) => (
                  <li key={prediction.placeId}>
                    <button
                      type="button"
                      onClick={() => void handleSelectPrediction(prediction)}
                      className="flex min-h-[56px] w-full flex-col items-start justify-center gap-0.5 px-3 py-2 text-left active:bg-indigo-50"
                    >
                      <span className="text-sm font-semibold text-slate-800">
                        {prediction.mainText || prediction.fullText}
                      </span>
                      {prediction.secondaryText ? (
                        <span className="text-xs text-slate-500">{prediction.secondaryText}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {lookup.error ? <p className="mt-2 text-xs text-amber-700">{lookup.error}</p> : null}
            {lookup.noResults && !manualAddress ? (
              <p className="mt-2 text-xs text-slate-600">
                Nothing matched — new venues are often missing from maps. Enter it by hand below.
              </p>
            ) : null}

            <button
              type="button"
              onClick={toggleManualAddress}
              aria-expanded={manualAddress}
              aria-controls="manual-address-fields"
              className="mt-3 flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg border border-violet-600 bg-violet-600 px-3 text-left text-sm font-semibold text-white shadow-sm active:bg-violet-500"
            >
              <span>Or click here to enter the address manually.</span>
              <span aria-hidden className="shrink-0 text-white/70">
                {manualAddress ? "▲" : "▼"}
              </span>
            </button>
          </div>

          {manualAddress ? (
            <div id="manual-address-fields" className={sectionCard}>
              <h3 className="text-sm font-semibold text-slate-900">Type the full address below</h3>
              <div className="mt-3 space-y-3">
                <div>
                  <label className={adminLabel}>Street *</label>
                  <input
                    className={`${adminField} min-h-[48px] text-base`}
                    value={form.street}
                    onChange={(event) => patch({ street: event.target.value })}
                  />
                </div>
                <div>
                  <label className={adminLabel}>City *</label>
                  <input
                    className={`${adminField} min-h-[48px] text-base`}
                    value={form.city}
                    onChange={(event) => patch({ city: event.target.value })}
                  />
                </div>
                <div className="flex gap-3">
                  <div className="w-24">
                    <label className={adminLabel}>State *</label>
                    <input
                      className={`${adminField} min-h-[48px] text-base uppercase`}
                      maxLength={2}
                      autoCapitalize="characters"
                      value={form.state}
                      onChange={(event) => patch({ state: event.target.value.toUpperCase() })}
                    />
                  </div>
                  <div className="flex-1">
                    <label className={adminLabel}>ZIP *</label>
                    <input
                      className={`${adminField} min-h-[48px] text-base`}
                      inputMode="numeric"
                      value={form.zipCode}
                      onChange={(event) => patch({ zipCode: event.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : hasWrittenAddress(form) ? (
            <div className={sectionCard}>
              <h3 className="text-sm font-semibold text-slate-900">Address</h3>
              <p className="mt-1 text-sm text-slate-700">
                {form.street}
                <br />
                {form.city}, {form.state} {form.zipCode}
              </p>
              <button
                type="button"
                onClick={clearAddress}
                className="mt-3 inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700"
              >
                Change address
              </button>
            </div>
          ) : null}

          {banner ? (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{banner}</div>
          ) : null}

          <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-slate-100/95 px-4 py-3 backdrop-blur">
            <button
              type="button"
              onClick={goToDetails}
              className={`min-h-[52px] w-full rounded-xl px-4 text-base font-semibold text-white ${
                addressReady ? "bg-indigo-600" : "bg-slate-400"
              }`}
            >
              Continue
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {mode === "create" ? "About the venue" : `Editing ${venue?.name ?? "venue"}`}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {mode === "create"
                ? "Two things left. Everything else has a sensible default."
                : "Change what you need and save."}
            </p>
          </div>

          <div className={sectionCard}>
            <label className={adminLabel} htmlFor="venue-name">
              Venue name *
            </label>
            <input
              id="venue-name"
              className={`${adminField} min-h-[48px] text-base`}
              value={form.name}
              autoCapitalize="words"
              onChange={(event) => patch({ name: event.target.value })}
            />
            <p className="mt-1 text-xs text-slate-500">Players pick this name from the venue list.</p>
          </div>

          {/*
            The whole point of venue-activation Phase 4: map and dial on one
            screen, so the circle visibly resizes while you drag. `hideAdvanced`
            because this flow already has its own Advanced panel below (which
            still holds the lat/long boxes) — two nested disclosures would be
            absurd.
          */}
          <GeofenceEditor
            latitude={coords?.lat ?? null}
            longitude={coords?.lng ?? null}
            radius={radiusValue}
            source={pinSource}
            onChange={handleGeofenceChange}
            hideAdvanced
            startLocked={mode === "edit"}
          />

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setAdvancedOpen((prev) => !prev)}
              aria-expanded={advancedOpen}
              className="flex min-h-[52px] w-full items-center justify-between px-4 text-left text-sm font-semibold text-slate-700"
            >
              Advanced
              <span className="text-slate-400">{advancedOpen ? "▲" : "▼"}</span>
            </button>
            {advancedOpen ? (
              <div className="space-y-4 border-t border-slate-100 px-4 py-4">
                <div>
                  <label className={adminLabel}>Display name</label>
                  <input
                    className={`${adminField} min-h-[48px] text-base`}
                    value={form.displayName}
                    onChange={(event) => patch({ displayName: event.target.value })}
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className={adminLabel}>County</label>
                    <input
                      className={`${adminField} min-h-[48px] text-base`}
                      value={form.county}
                      onChange={(event) => patch({ county: event.target.value })}
                    />
                  </div>
                  <div className="flex-1">
                    <label className={adminLabel}>Region</label>
                    <input
                      className={`${adminField} min-h-[48px] text-base`}
                      value={form.region}
                      onChange={(event) => patch({ region: event.target.value })}
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className={adminLabel}>Latitude</label>
                    <input
                      className={`${adminField} min-h-[48px] text-base`}
                      inputMode="decimal"
                      value={form.latitude}
                      onChange={(event) => {
                        patch({ latitude: event.target.value, placeId: "" });
                        setPinSource("manual");
                      }}
                    />
                  </div>
                  <div className="flex-1">
                    <label className={adminLabel}>Longitude</label>
                    <input
                      className={`${adminField} min-h-[48px] text-base`}
                      inputMode="decimal"
                      value={form.longitude}
                      onChange={(event) => {
                        patch({ longitude: event.target.value, placeId: "" });
                        setPinSource("manual");
                      }}
                    />
                  </div>
                </div>
                <label className="flex min-h-[44px] items-center gap-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={form.screenEnabled}
                    onChange={(event) => patch({ screenEnabled: event.target.checked })}
                  />
                  TV display is enabled
                </label>
                <div>
                  <label className={adminLabel}>Brand image URL</label>
                  <input
                    className={`${adminField} min-h-[48px] text-base`}
                    inputMode="url"
                    placeholder="https://…"
                    value={form.screenBrandImageUrl}
                    onChange={(event) => patch({ screenBrandImageUrl: event.target.value })}
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className={adminLabel}>Primary color</label>
                    <input
                      className={`${adminField} min-h-[48px] text-base`}
                      placeholder="#0f172a"
                      value={form.screenBrandPrimary}
                      onChange={(event) => patch({ screenBrandPrimary: event.target.value })}
                    />
                  </div>
                  <div className="flex-1">
                    <label className={adminLabel}>Secondary color</label>
                    <input
                      className={`${adminField} min-h-[48px] text-base`}
                      placeholder="#f59e0b"
                      value={form.screenBrandSecondary}
                      onChange={(event) => patch({ screenBrandSecondary: event.target.value })}
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Sponsor slots and the rest of the TV display settings live in the desktop admin.
                </p>
                {mode === "edit" && onDelete ? (
                  <button
                    type="button"
                    onClick={onDelete}
                    className="min-h-[48px] w-full rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-700"
                  >
                    Delete this venue
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {mode === "edit" ? (
            <button
              type="button"
              onClick={() => setStep("location")}
              className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
            >
              Change address
            </button>
          ) : null}

          {banner ? <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{banner}</div> : null}

          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="flex h-[104px] w-full items-center justify-center rounded-xl bg-indigo-600 px-4 text-[32px] font-semibold leading-tight text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : mode === "create" ? "Activate this venue" : "Save changes"}
          </button>
        </div>
      )}

    </div>
  );
}

