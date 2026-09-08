"use client";

import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import {
  RADIUS_MAX,
  RADIUS_MIN,
  RADIUS_PRESETS,
  type RadiusPreset,
  clampRadius,
  dialFractionToRadius,
  radiusDescription,
  radiusKeyStep,
  radiusToDialFraction,
  snapRadius,
} from "@/lib/geofenceEditor";

/**
 * Radius dial — venue-activation Phase 2 (docs/venue-activation-map-radius-plan.md).
 *
 * A horizontal drag-to-size control, not a rotary knob: a slider track reads
 * correctly on both phone and desktop and is far easier to make accessible.
 * Travel is logarithmic (see lib/geofenceEditor.ts) so equal finger movement
 * gives equal *relative* size change across the whole 25-2000 m domain.
 *
 * This component owns NO state. The radius lives in the caller's form state;
 * the dial reports every change up through `onChange`, and reports drag
 * start/end through `onEditingChange` so the parent (Phase 3's GeofenceEditor)
 * can pass `radiusEditing` to VenueMapPicker and thicken the circle stroke
 * while the user is sizing it.
 *
 * The thumb/fill position is written to a CSS custom property (`--tp-dial-pct`)
 * rather than an inline style object — see `.tp-dial-*` in app/globals.css and
 * the `--tp-vh` precedent in components/ui/ViewportHeightSync.tsx.
 */

type RadiusDialProps = {
  radius: number;
  onChange: (radius: number) => void;
  /** Fires true on pointer/keyboard interaction start, false when it ends. */
  onEditingChange?: (editing: boolean) => void;
  disabled?: boolean;
  /** Rendered under the readout; defaults to the plain-language scale hint. */
  label?: string;
  /**
   * Radius domain. Defaults to the admin constants (25–2000 m); the self-serve
   * signup wizard passes 50–200 m (docs/partner-self-serve-signup-plan.md §4
   * Phase 2). Threaded into every math call — passing nothing is bit-identical
   * to the pre-Phase-2 dial.
   */
  min?: number;
  max?: number;
  /**
   * One-tap shortcut chips. Defaults to admin's 150/300/600; signup passes
   * SIGNUP_RADIUS_PRESETS. Also drives the plain-language readout hint.
   */
  presets?: ReadonlyArray<RadiusPreset>;
};

const KEY_END_DELAY_MS = 400;

export function RadiusDial({
  radius,
  onChange,
  onEditingChange,
  disabled = false,
  label,
  min = RADIUS_MIN,
  max = RADIUS_MAX,
  presets = RADIUS_PRESETS,
}: RadiusDialProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const keyEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const value = clampRadius(snapRadius(radius, min, max), min, max);

  // Keep the visual position in sync with the value on every render, including
  // changes that did not come from this component (preset chip, Advanced
  // lat/long box, edit-mode hydration).
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.style.setProperty("--tp-dial-pct", String(radiusToDialFraction(value, min, max) * 100));
  }, [value, min, max]);

  useEffect(
    () => () => {
      if (keyEndTimerRef.current) clearTimeout(keyEndTimerRef.current);
    },
    []
  );

  const emitFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      const fraction = (clientX - rect.left) / rect.width;
      const next = dialFractionToRadius(fraction, min, max);
      if (next !== value) onChange(next);
    },
    [onChange, value, min, max]
  );

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    draggingRef.current = true;
    onEditingChange?.(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    trackRef.current?.focus();
    emitFromClientX(event.clientX);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (disabled || !draggingRef.current) return;
    emitFromClientX(event.clientX);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onEditingChange?.(false);
  }

  // Keyboard has no natural "drag end", so editing is held open briefly after
  // the last keypress — long enough that a run of arrow presses reads as one
  // editing gesture to the map circle, short enough to settle on its own.
  function markKeyboardEditing() {
    onEditingChange?.(true);
    if (keyEndTimerRef.current) clearTimeout(keyEndTimerRef.current);
    keyEndTimerRef.current = setTimeout(() => onEditingChange?.(false), KEY_END_DELAY_MS);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = radiusKeyStep(value, 1, min, max);
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = radiusKeyStep(value, -1, min, max);
    else if (event.key === "Home") next = min;
    else if (event.key === "End") next = max;
    else if (event.key === "PageUp") next = clampRadius(snapRadius(value * 1.25, min, max), min, max);
    else if (event.key === "PageDown") next = clampRadius(snapRadius(value / 1.25, min, max), min, max);
    if (next === null) return;
    event.preventDefault();
    markKeyboardEditing();
    if (next !== value) onChange(next);
  }

  const description = label ?? radiusDescription(value, presets);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <span className="text-2xl font-semibold tabular-nums text-slate-900">{value} m</span>
          <span className="ml-2 text-xs text-slate-500">{description}</span>
        </div>
        <span className="text-[11px] uppercase tracking-wide text-slate-400">
          {min}–{max} m
        </span>
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Geofence radius"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value} meters — ${description}`}
        aria-disabled={disabled || undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        className={`tp-dial-track relative h-12 w-full rounded-full border border-slate-300 bg-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
          disabled ? "opacity-50" : "cursor-ew-resize"
        }`}
      >
        <div className="tp-dial-fill pointer-events-none absolute inset-y-0 left-0 rounded-full bg-indigo-100" />
        <div className="tp-dial-thumb pointer-events-none absolute top-1/2 h-9 w-9 rounded-full border-2 border-white bg-indigo-600 shadow-md" />
      </div>

      <div className={`grid gap-2 ${presets.length % 3 === 0 ? "grid-cols-3" : "grid-cols-2"}`}>
        {presets.map((preset) => {
          const selected = value === preset.value;
          return (
            <button
              key={preset.value}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onChange(preset.value)}
              className={`min-h-[56px] rounded-xl border px-2 py-2 text-center disabled:opacity-50 ${
                selected
                  ? "border-indigo-600 bg-indigo-50 text-indigo-800"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              <span className="block text-sm font-semibold">{preset.label}</span>
              <span className="block text-[11px] text-slate-500">{preset.value} m</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
