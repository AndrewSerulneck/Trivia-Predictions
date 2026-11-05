"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GeofenceEditor } from "@/components/admin/GeofenceEditor";
import { OwnerShell } from "@/components/owner/OwnerShell";
import { VenueAddressEditor, type VenueAddressSelection } from "@/components/owner/VenueAddressEditor";
import { Dropdown } from "@/components/ui/Dropdown";
import { HightopLoader } from "@/components/ui/HightopLoader";
import type { GeofenceEditorValue, PinSource } from "@/lib/geofenceEditor";
import { ownerAuthRecoveryPath } from "@/lib/ownerAuthCodes";
import {
  SIGNUP_RADIUS_DEFAULT,
  SIGNUP_RADIUS_MAX,
  SIGNUP_RADIUS_MIN,
  SIGNUP_RADIUS_PRESETS,
} from "@/lib/selfServeSignup";
import { isUsableVenuePin, VENUE_LOCATION_COPY as COPY } from "@/lib/venueLocationRules";

// Partner Dashboard "Venue Location" (docs/signup-price-copy-and-partner-geofence-plan.md Phase 3).
// A partner moves the pin and sets the radius with the SAME GeofenceEditor signup uses.
//
// D7 rule (plan Phase 5): the radius changes ONLY through the editor's `onRadiusChange`, which
// fires when the partner uses the dial or a size chip. The editor's `onChange` also carries a
// radius on every pin move, GPS fix and manual entry; `handleEditorChange` ignores it,
// so a pin-only save keeps the stored radius. The map preview also depicts that actual radius.
// A null stored radius saves as SIGNUP_RADIUS_DEFAULT, the value the dial shows.

type Venue = { id: string; name: string };
type SavedLocation = { latitude: number | null; longitude: number | null; radius: number | null; address?: string };
type Pin = { lat: number; lng: number };

const PIN_EPSILON = 1e-7; // venues.latitude is decimal(10,8)

const OwnerVenueLocationPage = () => {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [loading, setLoading] = useState(true);
  const [venuesError, setVenuesError] = useState(false);
  const [venuesReloadKey, setVenuesReloadKey] = useState(0);
  const [locationReloadKey, setLocationReloadKey] = useState(0);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [saved, setSaved] = useState<SavedLocation | null>(null);
  const [pin, setPin] = useState<Pin | null>(null);
  const [radius, setRadius] = useState<number | null>(null);
  const [source, setSource] = useState<PinSource>("existing");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressSelection, setAddressSelection] = useState<(VenueAddressSelection & { previousPin: Pin | null; previousSource: PinSource }) | null>(null);

  // R2: lets an async save reply check which venue is selected NOW.
  const selectedVenueIdRef = useRef("");
  useEffect(() => {
    selectedVenueIdRef.current = selectedVenueId;
  }, [selectedVenueId]);

  const applySaved = useCallback((location: SavedLocation) => {
    setSaved(location);
    setPin(
      location.latitude !== null && location.longitude !== null
        ? { lat: location.latitude, lng: location.longitude }
        : null,
    );
    setRadius(location.radius);
    setSource("existing");
    setAddressSelection(null);
  }, []);

  // R3: a failed load shows an error and a Try again button; it never reads as "No venue found".
  // No automatic retry: a retry happens only when the partner taps (venuesReloadKey).
  useEffect(() => {
    const loadVenues = async () => {
      setLoading(true);
      setVenuesError(false);
      try {
        const res = await fetch("/api/owner/venues");
        if (res.status === 401) {
          const body = (await res.json().catch(() => ({}))) as { code?: string };
          router.push(ownerAuthRecoveryPath(body.code));
          return;
        }
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; venues?: Venue[] };
        if (!res.ok || !json.ok) throw new Error(COPY.venuesLoadFailed);
        const loaded = json.venues ?? [];
        setVenues(loaded);
        // Keep the current pick only if it's still in the list (a venue may have been removed).
        setSelectedVenueId((prev) => (loaded.some((venue) => venue.id === prev) ? prev : loaded[0]?.id || ""));
      } catch {
        setVenues([]);
        setVenuesError(true);
      } finally {
        setLoading(false);
      }
    };
    void loadVenues();
  }, [router, venuesReloadKey]);

  useEffect(() => {
    if (!selectedVenueId) {
      setSaved(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingLocation(true);
      setError(null);
      setStatusMessage(null);
      setSaved(null);
      try {
        const res = await fetch(`/api/owner/venues/location?venueId=${encodeURIComponent(selectedVenueId)}`, {
          cache: "no-store",
        });
        if (res.status === 401) {
          const body = (await res.json().catch(() => ({}))) as { code?: string };
          router.push(ownerAuthRecoveryPath(body.code));
          return;
        }
        // A non-JSON error page (502/504) must show our copy, never a JSON parse error.
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; venue?: SavedLocation; error?: string };
        if (!json.ok || !json.venue) throw new Error(json.error ?? COPY.loadFailed);
        if (!cancelled) applySaved(json.venue);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : COPY.loadFailed);
      } finally {
        if (!cancelled) setLoadingLocation(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedVenueId, locationReloadKey, router, applySaved]);

  const hasUsablePin = saved !== null && isUsableVenuePin(saved.latitude, saved.longitude);
  const storedRadius = saved?.radius ?? null;

  const handleEditorChange = useCallback(
    (value: GeofenceEditorValue) => {
      setPin({ lat: value.lat, lng: value.lng });
      setSource(value.source);
      setStatusMessage(null);
    },
    [],
  );

  const handleRadiusChange = useCallback((next: number) => {
    setRadius(next);
    setStatusMessage(null);
  }, []);

  const radiusToSave = radius ?? SIGNUP_RADIUS_DEFAULT;

  const changed = useMemo(() => {
    if (!saved || !pin) return false;
    const pinMoved =
      saved.latitude === null ||
      saved.longitude === null ||
      Math.abs(pin.lat - saved.latitude) > PIN_EPSILON ||
      Math.abs(pin.lng - saved.longitude) > PIN_EPSILON;
    return Boolean(addressSelection) || pinMoved || (radius !== null && radius !== saved.radius);
  }, [saved, pin, radius, addressSelection]);

  // R9: switching venues drops unsaved edits, so ask first. The Dropdown is controlled: declining
  // simply leaves the current venue selected.
  const handleVenueChange = (next: string) => {
    if (next === selectedVenueId) return;
    if (changed && !window.confirm(COPY.discardChanges)) return;
    // Drop the old preview in the same render that changes the heading/selection.
    setSaved(null);
    setAddressSelection(null);
    setLoadingLocation(true);
    setSelectedVenueId(next);
  };

  const handleSave = async () => {
    if (!selectedVenueId || !pin || saving || addressBusy || !changed) return;
    const venueId = selectedVenueId;
    setSaving(true);
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/owner/venues/location", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, latitude: pin.lat, longitude: pin.lng, radius: radiusToSave,
          ...(addressSelection ? { addressToken: addressSelection.addressToken } : {}),
        }),
      });
      if (res.status === 401) {
        const body = (await res.json().catch(() => ({}))) as { code?: string };
        router.push(ownerAuthRecoveryPath(body.code));
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; venue?: SavedLocation; error?: string };
      if (!json.ok || !json.venue) throw new Error(json.error ?? COPY.saveFailed);
      // R2: the save landed on the server for `venueId`; if the partner is on another venue now,
      // don't paint this reply over it.
      if (selectedVenueIdRef.current !== venueId) return;
      applySaved(json.venue);
      setStatusMessage(COPY.saved);
    } catch (saveError) {
      if (selectedVenueIdRef.current !== venueId) return;
      setError(saveError instanceof Error ? saveError.message : COPY.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  // R5: keyed on the CURRENT radius, so the note goes away once the partner picks a new size.
  const radiusOutsideDial =
    radius !== null && radius === storedRadius && (radius < SIGNUP_RADIUS_MIN || radius > SIGNUP_RADIUS_MAX);
  const selectedVenue = venues.find((venue) => venue.id === selectedVenueId) ?? null;

  return (
    <OwnerShell
      title={COPY.pageTitle}
      flushHeader
      maxWidth="lg"
      variant="dark"
      backTo={{ href: "/owner/dashboard", label: "Dashboard", preferHref: true }}
    >
      <div className="space-y-4 rounded-b-2xl border border-t-0 border-ht-hairline bg-ht-surface p-4 shadow-ht-card">
        {selectedVenue ? (
          <h2 className="min-w-0 text-lg font-black text-ht-primary">
            {venues.length > 1 ? (
              <Dropdown
                value={selectedVenueId}
                onChange={handleVenueChange}
                disabled={saving}
                options={venues.map((venue) => ({ value: venue.id, label: venue.name }))}
                ariaLabel="Select venue"
                className="min-h-11 w-full min-w-0 rounded-xl bg-transparent text-left text-lg font-black text-ht-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ht-cyan-300"
              />
            ) : (
              <span className="block break-words">{selectedVenue.name}</span>
            )}
          </h2>
        ) : null}

        {loading || loadingLocation ? (
          <HightopLoader size="lg" className="py-10" />
        ) : venuesError ? (
          <div className="space-y-3 rounded-2xl border border-ht-hairline bg-ht-surface p-8 text-center shadow-ht-card">
            <p className="text-sm font-semibold text-ht-muted">{COPY.venuesLoadFailed}</p>
            <button
              type="button"
              onClick={() => setVenuesReloadKey((key) => key + 1)}
              className="rounded-xl border border-ht-soft bg-ht-cyan-500 px-4 py-2 text-sm font-black text-slate-950 transition active:translate-y-px"
            >
              {COPY.tryAgain}
            </button>
          </div>
        ) : !selectedVenueId ? (
          <div className="rounded-2xl border border-ht-hairline bg-ht-surface p-8 text-center shadow-ht-card">
            <p className="text-sm font-semibold text-ht-muted">{COPY.noVenue}</p>
          </div>
        ) : (
          <>
            {error ? (
              <div className="rounded-xl border border-ht-rose-500/30 bg-ht-rose-500/10 px-3 py-2 text-footnote font-bold text-ht-rose-300">
                {error}
              </div>
            ) : null}

            {statusMessage ? (
              <div className="flex items-start gap-2 rounded-xl border border-ht-cyan-500/30 bg-ht-cyan-500/10 px-3 py-2 text-footnote font-bold text-ht-cyan-300">
                <span className="min-w-0 flex-1">{statusMessage}</span>
                <button
                  type="button"
                  onClick={() => setStatusMessage(null)}
                  aria-label="Dismiss"
                  className="shrink-0 px-1 font-black"
                >
                  ×
                </button>
              </div>
            ) : null}

            {!saved && error ? (
              <button
                type="button"
                onClick={() => setLocationReloadKey((key) => key + 1)}
                className="rounded-xl border border-ht-soft bg-ht-cyan-500 px-4 py-2 text-sm font-black text-slate-950 transition active:translate-y-px"
              >
                {COPY.tryAgain}
              </button>
            ) : saved && !hasUsablePin ? (
              <div className="rounded-2xl border border-ht-hairline bg-ht-surface p-5 shadow-ht-card">
                <p className="text-sm font-semibold text-ht-muted">{COPY.noSavedPin}</p>
              </div>
            ) : saved ? (
              <div className="space-y-4">
                {radiusOutsideDial && radius !== null ? (
                  <p className="text-footnote font-semibold text-ht-secondary">{COPY.radiusKept(radius)}</p>
                ) : null}

                <div className="ht-light-surface rounded-ht-lg bg-slate-200/90 p-3">
                  <GeofenceEditor
                    latitude={pin?.lat ?? null}
                    longitude={pin?.lng ?? null}
                    radius={radius ?? SIGNUP_RADIUS_DEFAULT}
                    source={source}
                    onChange={handleEditorChange}
                    onRadiusChange={handleRadiusChange}
                    hideAdvanced
                    hidePinDetails
                    startLocked
                    lockedView="map"
                    disabled={saving}
                    mapsKeyEndpoint="/api/owner/maps-key"
                    min={SIGNUP_RADIUS_MIN}
                    max={SIGNUP_RADIUS_MAX}
                    presets={SIGNUP_RADIUS_PRESETS}
                  />
                </div>

                <VenueAddressEditor
                  venueId={selectedVenueId}
                  currentAddress={saved.address}
                  disabled={saving}
                  onBusyChange={setAddressBusy}
                  onSelect={(selection) => {
                    setAddressSelection((previous) => ({ ...selection,
                      previousPin: previous ? previous.previousPin : pin,
                      previousSource: previous ? previous.previousSource : source,
                    }));
                    setPin({ lat: selection.details.latitude, lng: selection.details.longitude });
                    setSource("lookup");
                    setError(null);
                    setStatusMessage(null);
                  }}
                />
                {addressSelection ? (
                  <div className="flex items-start gap-2 text-footnote text-ht-secondary">
                    <p className="min-w-0 flex-1 break-words">
                      {addressSelection.details.street}, {addressSelection.details.city}, {addressSelection.details.state} {addressSelection.details.zipCode}
                    </p>
                    <button type="button" disabled={saving || addressBusy} className="h-[44px] min-h-[44px] shrink-0 rounded-xl px-3 font-bold text-ht-primary disabled:opacity-50"
                      onClick={() => {
                        setPin(addressSelection.previousPin);
                        setSource(addressSelection.previousSource);
                        setAddressSelection(null);
                        setError(null);
                      }}>
                      Undo
                    </button>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || addressBusy || !changed}
                  className="w-full rounded-xl border border-ht-soft bg-ht-cyan-500 px-4 py-3 text-sm font-black text-slate-950 transition active:translate-y-px disabled:opacity-50"
                >
                  {saving ? COPY.saving : changed ? COPY.save : COPY.savedButton}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </OwnerShell>
  );
};

export default OwnerVenueLocationPage;
