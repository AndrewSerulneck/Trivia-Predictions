"use client";

import { useCallback, useRef, useState } from "react";
import { RadiusDial } from "@/components/admin/RadiusDial";
import { VenueMapPicker, type VenueMapPickerHandle } from "@/components/admin/VenueMapPicker";
import { adminField, adminLabel } from "@/lib/adminStyles";
import {
  clampRadius,
  snapRadius,
  type GeofenceEditorChange,
  type PinSource,
} from "@/lib/geofenceEditor";

/**
 * GeofenceEditor — venue-activation Phase 3 (docs/venue-activation-map-radius-plan.md).
 *
 * The one screen the whole plan exists for: map on top, the radius dial
 * directly beneath it, and the pin controls ("Use my current location",
 * provenance label, plain-language hint) between them — so the circle visibly
 * grows under your finger while you size it. No bottom sheet, no lat/long boxes
 * on the critical path (they live under "Advanced").
 *
 * State ownership, deliberately split:
 *  - This component owns only *interaction* state: the GPS request in flight,
 *    its error, the reported accuracy, whether the dial is mid-drag, and
 *    whether Advanced is open.
 *  - The caller (VenuesSection / ActivateVenueFlow, Phase 4) owns the venue
 *    form. Every change — pin drag, GPS fix, dial move, typed coordinate —
 *    arrives as one `GeofenceEditorValue` through `onChange`, carrying the
 *    `source` so the caller can keep its own provenance copy and clear
 *    `placeId` when the pin stops belonging to the looked-up Place.
 *
 * The `radiusEditing` loop closes here and nowhere else: RadiusDial's
 * `onEditingChange` → local state → VenueMapPicker's `radiusEditing` prop,
 * which thickens the circle stroke while you drag.
 */

type GeofenceEditorProps = {
  latitude: number | null;
  longitude: number | null;
  radius: number;
  /** Where the current pin came from — drives the provenance label. */
  source: PinSource;
  onChange: GeofenceEditorChange;
  disabled?: boolean;
  /** Hide the Advanced lat/long disclosure (the mobile flow has its own). */
  hideAdvanced?: boolean;
  className?: string;
};

const GPS_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };

const cardShell = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";

export function GeofenceEditor({
  latitude,
  longitude,
  radius,
  source,
  onChange,
  disabled = false,
  hideAdvanced = false,
  className,
}: GeofenceEditorProps) {
  const mapRef = useRef<VenueMapPickerHandle | null>(null);
  const [radiusEditing, setRadiusEditing] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Raw text for the Advanced boxes, so a half-typed "-104." isn't parsed to
  // NaN and thrown away between keystrokes. Cleared on blur, which re-derives
  // the display from the caller's (canonical, committed) coordinates — that
  // also picks up a pin moved by the map or GPS while Advanced sat open.
  const [latDraft, setLatDraft] = useState<string | null>(null);
  const [lngDraft, setLngDraft] = useState<string | null>(null);

  const hasPin = latitude !== null && longitude !== null;
  const value = clampRadius(snapRadius(radius));

  const emit = useCallback(
    (next: { lat: number; lng: number; radius: number; source: PinSource }) => {
      onChange({
        lat: next.lat,
        lng: next.lng,
        radius: clampRadius(next.radius),
        source: next.source,
      });
    },
    [onChange]
  );

  const handleRadiusChange = useCallback(
    (nextRadius: number) => {
      // Sizing the circle never moves the pin, and never changes its
      // provenance — a GPS-set pin is still a GPS-set pin at 600 m.
      if (latitude === null || longitude === null) return;
      emit({ lat: latitude, lng: longitude, radius: nextRadius, source });
    },
    [emit, latitude, longitude, source]
  );

  const handleMapDrag = useCallback(
    (lat: number, lng: number) => {
      setAccuracyMeters(null);
      setLocateError("");
      emit({ lat, lng, radius: value, source: "map" });
    },
    [emit, value]
  );

  /**
   * Lifted verbatim (behavior and copy) out of ActivateVenueFlow so the desktop
   * form gets a working "Use my current location" button for the first time —
   * it had none. The map is recentered imperatively as well as via props,
   * because a first-ever pin also needs the camera moved off DEFAULT_CENTER.
   */
  const useCurrentLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocateError("This device can't share its location. Drag the pin on the map instead.");
      return;
    }
    setLocating(true);
    setLocateError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setAccuracyMeters(position.coords.accuracy);
        setLocating(false);
        emit({ lat, lng, radius: value, source: "gps" });
        mapRef.current?.recenter({ lat, lng });
      },
      (positionError) => {
        setLocating(false);
        setLocateError(
          positionError.code === positionError.PERMISSION_DENIED
            ? "Location is blocked for this browser. Allow it in your phone's settings, or drag the pin on the map."
            : "Couldn't get a fix. Try again near a window or outside, or drag the pin on the map."
        );
      },
      GPS_OPTIONS
    );
  }, [emit, value]);

  function commitAdvanced(nextLat: string, nextLng: string) {
    const lat = Number.parseFloat(nextLat);
    const lng = Number.parseFloat(nextLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    setAccuracyMeters(null);
    emit({ lat, lng, radius: value, source: "manual" });
  }

  const latText = latDraft ?? (latitude === null ? "" : String(latitude));
  const lngText = lngDraft ?? (longitude === null ? "" : String(longitude));

  return (
    <div className={className ? `space-y-3 ${className}` : "space-y-3"}>
      {hasPin ? (
        <VenueMapPicker
          ref={mapRef}
          latitude={latitude}
          longitude={longitude}
          radius={value}
          radiusEditing={radiusEditing}
          onChange={handleMapDrag}
        />
      ) : (
        // Lazy-mount: no coordinates yet means nothing to show, and mounting
        // the map anyway would burn a Maps API load on every venue form open
        // (Risk #2 in the plan).
        <div className="flex h-80 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
          <p className="text-sm font-semibold text-slate-700">The map appears once there&apos;s a pin</p>
          <p className="text-xs text-slate-500">
            Pick the address above, or tap “Use my current location” while you&apos;re standing in the venue.
          </p>
        </div>
      )}

      <div className={cardShell}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{pinLabel(hasPin, source, accuracyMeters)}</p>
            <p className="mt-0.5 text-xs text-slate-600">
              {hasPin
                ? "Drag the pin to the door players walk through."
                : "The geofence runs off this pin, not the street address."}
            </p>
            {hasPin ? (
              <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                {latitude.toFixed(5)}, {longitude.toFixed(5)}
              </p>
            ) : null}
          </div>
          {hasPin ? (
            <a
              href={`https://maps.google.com/?q=${latitude},${longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs font-semibold text-indigo-600 hover:underline"
            >
              Check ↗
            </a>
          ) : null}
        </div>

        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={disabled || locating}
          className="mt-3 min-h-[48px] w-full rounded-xl border border-indigo-300 bg-indigo-50 px-4 text-sm font-semibold text-indigo-800 disabled:opacity-60"
        >
          {locating ? "Getting a fix…" : "📍 Use my current location"}
        </button>
        <p className="mt-2 text-xs text-slate-500">
          Standing inside the venue? Your phone&apos;s location is more accurate than any address lookup.
        </p>
        {locateError ? <p className="mt-2 text-xs text-amber-700">{locateError}</p> : null}
      </div>

      <div className={cardShell}>
        <span className={adminLabel}>Geofence size *</span>
        <p className="mb-3 text-xs text-slate-500">
          How close a player must be to the pin to join. Drag to resize — the circle on the map follows.
        </p>
        <RadiusDial
          radius={value}
          onChange={handleRadiusChange}
          onEditingChange={setRadiusEditing}
          disabled={disabled || !hasPin}
        />
      </div>

      {hideAdvanced ? null : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setAdvancedOpen((prev) => !prev)}
            aria-expanded={advancedOpen}
            aria-controls="geofence-advanced"
            className="flex min-h-[48px] w-full items-center justify-between px-4 text-left text-sm font-semibold text-slate-700"
          >
            Advanced — exact coordinates
            <span aria-hidden className="text-slate-400">{advancedOpen ? "▲" : "▼"}</span>
          </button>
          {advancedOpen ? (
            <div id="geofence-advanced" className="flex gap-3 border-t border-slate-100 px-4 py-4">
              <div className="flex-1">
                <label className={adminLabel} htmlFor="geofence-lat">
                  Latitude
                </label>
                <input
                  id="geofence-lat"
                  className={`${adminField} min-h-[44px]`}
                  inputMode="decimal"
                  disabled={disabled}
                  value={latText}
                  onBlur={() => setLatDraft(null)}
                  onChange={(event) => {
                    setLatDraft(event.target.value);
                    commitAdvanced(event.target.value, lngText);
                  }}
                />
              </div>
              <div className="flex-1">
                <label className={adminLabel} htmlFor="geofence-lng">
                  Longitude
                </label>
                <input
                  id="geofence-lng"
                  className={`${adminField} min-h-[44px]`}
                  inputMode="decimal"
                  disabled={disabled}
                  value={lngText}
                  onBlur={() => setLngDraft(null)}
                  onChange={(event) => {
                    setLngDraft(event.target.value);
                    commitAdvanced(latText, event.target.value);
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Pin provenance copy, lifted from ActivateVenueFlow's `pinLabel` memo so the
 * wording stays identical across both surfaces. Exported for tests and for
 * Phase 4 call sites that render the label outside this card.
 */
export function pinLabel(hasPin: boolean, source: PinSource, accuracyMeters: number | null): string {
  if (!hasPin) return "No pin yet";
  if (source === "gps") {
    return accuracyMeters !== null
      ? `Pin set from your phone (±${Math.round(accuracyMeters)} m)`
      : "Pin set from your phone";
  }
  if (source === "map") return "Pin placed by hand on the map";
  if (source === "manual") return "Pin set from typed coordinates";
  if (source === "existing") return "Pin already on file";
  return "Pin set from the address lookup";
}
