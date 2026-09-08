// Shared contract for the geofence editor (map + radius dial), built in
// docs/venue-activation-map-radius-plan.md. Phase 0: types + log-scale radius
// math only — no UI. Phases 1-4 consume this; do not redefine PinSource or the
// radius math locally in VenueMapPicker / RadiusDial / GeofenceEditor.

export const RADIUS_MIN = 25;
export const RADIUS_MAX = 2000;

// Every radius helper below takes an optional (min, max) domain, defaulting to
// the admin constants above. Passing nothing is bit-identical to the pre-Phase-2
// behavior (docs/partner-self-serve-signup-plan.md §4 Phase 2) — that equivalence
// is the acceptance test. The self-serve signup wizard passes SIGNUP_RADIUS_MIN
// (50) / SIGNUP_RADIUS_MAX (200) so a stranger can't draw a 2 km circle.

/**
 * Snap granularity for a given domain. The legacy admin domain keeps its coarse
 * 25 m (below 500) / 50 m (above) grid; a narrow custom domain like signup's
 * 50–200 m gets a 10 m grid, because 25 m gives only ~7 stops across the whole
 * range. The 400 m span cutoff is what separates the two.
 */
function radiusSnapStep(radius: number, min: number, max: number): number {
  if (max - min <= 400) return 10;
  return radius < 500 ? 25 : 50;
}

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
export function radiusDescription(
  radius: number,
  presets: ReadonlyArray<RadiusPreset> = RADIUS_PRESETS
): string {
  const preset = presets.find((entry) => entry.value === radius);
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
export function dialFractionToRadius(
  t: number,
  min: number = RADIUS_MIN,
  max: number = RADIUS_MAX
): number {
  const clampedT = Math.min(1, Math.max(0, t));
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  const raw = Math.exp(logMin + clampedT * (logMax - logMin));
  return snapRadius(raw, min, max);
}

/** Inverse of dialFractionToRadius — where the thumb sits for a given radius. */
export function radiusToDialFraction(
  radius: number,
  min: number = RADIUS_MIN,
  max: number = RADIUS_MAX
): number {
  const clamped = clampRadius(radius, min, max);
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  return (Math.log(clamped) - logMin) / (logMax - logMin);
}

/**
 * Snap to the domain's grid (see radiusSnapStep). Snapping happens *after* the
 * log-space interpolation, not before, so the snap grid doesn't distort the
 * perceived drag speed.
 */
export function snapRadius(
  radius: number,
  min: number = RADIUS_MIN,
  max: number = RADIUS_MAX
): number {
  const clamped = clampRadius(radius, min, max);
  const step = radiusSnapStep(clamped, min, max);
  const snapped = Math.round(clamped / step) * step;
  return clampRadius(snapped, min, max);
}

export function clampRadius(
  radius: number,
  min: number = RADIUS_MIN,
  max: number = RADIUS_MAX
): number {
  return Math.min(max, Math.max(min, radius));
}

/**
 * One arrow-key step for RadiusDial's `role="slider"` keyboard handling
 * (Phase 2). Matches the snap granularity so every keypress lands on a valid,
 * already-snapped value.
 */
export function radiusKeyStep(
  radius: number,
  direction: 1 | -1,
  min: number = RADIUS_MIN,
  max: number = RADIUS_MAX
): number {
  const step = radiusSnapStep(radius, min, max);
  return clampRadius(radius + direction * step, min, max);
}
