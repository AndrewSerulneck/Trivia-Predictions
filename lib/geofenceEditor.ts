// Shared contract for the geofence editor (map + radius dial), built in
// docs/venue-activation-map-radius-plan.md. Phase 0: types + log-scale radius
// math only — no UI. Phases 1-4 consume this; do not redefine PinSource or the
// radius math locally in VenueMapPicker / RadiusDial / GeofenceEditor.

export const RADIUS_MIN = 25;
export const RADIUS_MAX = 2000;

// Existing precedent from ActivateVenueFlow.tsx — reused verbatim so the mobile
// flow's pin-provenance copy ("Pin set from your phone", "existing" on edit,
// etc.) keeps working unchanged when it switches to GeofenceEditor in Phase 4.
export type PinSource = "none" | "existing" | "lookup" | "gps" | "map" | "manual";

// Hoisted out of ActivateVenueFlow.tsx (Phase 2) so RadiusDial can render the
// one-tap shortcut chips without importing a whole flow component. Values and
// copy are unchanged from the mobile flow's originals.
export type RadiusPreset = { value: number; label: string; hint: string };

export const RADIUS_PRESETS: ReadonlyArray<RadiusPreset> = [
  { value: 150, label: "Standard", hint: "Most bars & restaurants" },
  { value: 300, label: "Large", hint: "Big floor, patio, parking" },
  { value: 600, label: "Campus", hint: "Stadium, fairground, resort" },
];

/**
 * Plain-language sense of scale for the live readout, so an admin who has no
 * intuition for "220 m" can still tell whether the circle is right.
 */
export function radiusDescription(radius: number): string {
  const preset = RADIUS_PRESETS.find((entry) => entry.value === radius);
  if (preset) return preset.hint;
  if (radius <= 75) return "Just the building";
  if (radius < 200) return "About a bar and its patio";
  if (radius < 400) return "A big floor plus parking";
  if (radius < 800) return "A block or a small campus";
  return "A stadium-sized footprint";
}

export type GeofenceEditorValue = {
  lat: number;
  lng: number;
  radius: number;
  source: PinSource;
};

// The shared component owns no form state — callers (VenuesSection,
// ActivateVenueFlow) hold the VenueFormState and pass a single onChange down.
export type GeofenceEditorChange = (value: GeofenceEditorValue) => void;

/**
 * Dial travel is logarithmic between RADIUS_MIN and RADIUS_MAX, so equal
 * finger movement gives equal *relative* size change everywhere on the track
 * (the 150→200m range gets as much physical travel as 1000→1333m does),
 * instead of linear travel wasting ~80% of the sweep on sizes nobody picks.
 *
 * t is the pointer's fractional position on the track, 0..1.
 */
export function dialFractionToRadius(t: number): number {
  const clampedT = Math.min(1, Math.max(0, t));
  const logMin = Math.log(RADIUS_MIN);
  const logMax = Math.log(RADIUS_MAX);
  const raw = Math.exp(logMin + clampedT * (logMax - logMin));
  return snapRadius(raw);
}

/** Inverse of dialFractionToRadius — where the thumb sits for a given radius. */
export function radiusToDialFraction(radius: number): number {
  const clamped = clampRadius(radius);
  const logMin = Math.log(RADIUS_MIN);
  const logMax = Math.log(RADIUS_MAX);
  return (Math.log(clamped) - logMin) / (logMax - logMin);
}

/**
 * Snap to 25m increments below 500m, 50m above — per the plan's Phase 0
 * decision. Snapping happens *after* the log-space interpolation, not before,
 * so the snap grid doesn't distort the perceived drag speed.
 */
export function snapRadius(radius: number): number {
  const clamped = clampRadius(radius);
  const step = clamped < 500 ? 25 : 50;
  const snapped = Math.round(clamped / step) * step;
  return clampRadius(snapped);
}

export function clampRadius(radius: number): number {
  return Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, radius));
}

/**
 * One arrow-key step for RadiusDial's `role="slider"` keyboard handling
 * (Phase 2). Matches the snap granularity so every keypress lands on a valid,
 * already-snapped value.
 */
export function radiusKeyStep(radius: number, direction: 1 | -1): number {
  const step = radius < 500 ? 25 : 50;
  return clampRadius(radius + direction * step);
}
