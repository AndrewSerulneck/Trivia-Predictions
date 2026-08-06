# Venue Activation — One-Screen Map + Radius Dial Plan

**Goal.** On `/admin` → Venues, after an address is entered the admin should see, on **one
screen**: the pin on a live map (draggable, or set from "Use my current location") and a
**finger-draggable radius dial** whose circle updates on the map in real time. When the pin and
radius look right, they tap **Activate Venue**. No modal round-trips, no separate map sheet, no
lat/long text boxes on the critical path.

## Where we are today (as-built)

Two separate venue UIs exist, and both split the map away from the radius control:

- **Desktop** — [components/admin/sections/VenuesSection.tsx](components/admin/sections/VenuesSection.tsx):
  one long flat form. Radius is a bare `type="number"` box at
  [VenuesSection.tsx:600-611](components/admin/sections/VenuesSection.tsx#L600-L611); lat/long are
  raw text inputs; the map (`VenueMapPicker`) sits far below at
  [VenuesSection.tsx:637-664](components/admin/sections/VenuesSection.tsx#L637-L664), separated
  from the radius field by five other inputs. The map *does* already receive `radius` and draws
  the circle, so the wiring exists — it's the layout and the input affordance that fail.
- **Mobile** — [components/admin/mobile/ActivateVenueFlow.tsx](components/admin/mobile/ActivateVenueFlow.tsx):
  a much better 2-step flow, but the map is hidden **behind a bottom sheet** ("Adjust pin",
  ~line 655) while the radius presets live on the step-2 card (~lines 455-500). You cannot see
  the circle change while you change the size — the exact feedback loop that makes a geofence
  feel obvious.
- **Shared map** — [components/admin/VenueMapPicker.tsx](components/admin/VenueMapPicker.tsx)
  (203 lines, Google Maps JS, marker + circle, `onChange(lat, lng)` on marker drag). Reusable;
  needs to grow "recenter/fit to radius" and a resize hook, not a rewrite.

**Two consequences worth deciding up front:** (1) the fix must land in *both* surfaces or the
desktop form stays the unintuitive one — this plan builds one shared component and mounts it in
both; (2) `VenueMapPicker` currently has no way to refit zoom when the radius changes, so a
600 m circle can overflow a map framed for 150 m.

---

## Phase 0 — Decisions + shared contract (no UI yet) — ✅ DONE 2026-08-06

**Delivered:** [lib/geofenceEditor.ts](lib/geofenceEditor.ts) — read it before starting Phase 1
or 2, it is the contract every later phase must import from, not re-derive.

- Radius domain: confirmed 25–2000 m matches **both** client
  ([lib/adminVenueForm.ts](lib/adminVenueForm.ts) `validateVenueForm`, lines 208-211) and server
  ([lib/admin.ts](lib/admin.ts) lines 1972-1973 create path, 2112-2113 update path). No server
  change needed anywhere in this plan — `radius_meters`/`latitude`/`longitude` already round-trip
  through `buildVenuePayload`. `RADIUS_MIN = 25` / `RADIUS_MAX = 2000` are exported from
  `lib/geofenceEditor.ts`; import them, don't hardcode 25/2000 again.
- **Log-scale dial math is implemented and spot-checked**, not just specified:
  - `dialFractionToRadius(t: number): number` — pointer fraction 0..1 → snapped radius. Verified
    `t=0 → 25`, `t=1 → 2000`, `t=0.5 → 225` (log midpoint, not linear 1012).
  - `radiusToDialFraction(radius: number): number` — inverse, for initializing the thumb position
    from an existing venue's radius (edit mode) or a preset chip tap.
  - `snapRadius(radius: number): number` — snaps to 25 m increments below 500 m, 50 m above, per
    the plan's original spec. Snapping happens in *linear* radius space after the log
    interpolation, not before — confirmed this doesn't distort drag feel (spot-checked
    `snap(212) → 200`, `snap(612) → 600`).
  - `clampRadius(radius: number): number` — plain clamp to [25, 2000], used everywhere so nothing
    can drift outside the server's bound.
  - `radiusKeyStep(radius, direction): number` — one arrow-key step for Phase 2's
    `role="slider"` keyboard handling; steps by the same 25/50 granularity as snapping so every
    keypress lands on an already-valid value. Verified clamps correctly at both ends (`2000 + 1
    step → 2000`, `25 - 1 step → 25`).
  - All four verified with a one-off `npx tsx -e` run against the real file, not just read —
    see the values above.
- **Types locked:**
  - `PinSource = "none" | "existing" | "lookup" | "gps" | "map" | "manual"` — **do not redefine
    this.** It already exists verbatim in
    [ActivateVenueFlow.tsx:43](components/admin/mobile/ActivateVenueFlow.tsx#L43) driving the
    mobile flow's pin-provenance copy (e.g. "Pin set from your phone (±N m)" for `"gps"`). Phase 0
    moved the canonical definition to `lib/geofenceEditor.ts`; **Phase 3/4 must delete the local
    `type PinSource = ...` in `ActivateVenueFlow.tsx` and import from `lib/geofenceEditor.ts`
    instead** so there's exactly one definition, not two that can drift.
  - `GeofenceEditorValue = { lat, lng, radius, source: PinSource }` and `GeofenceEditorChange =
    (value: GeofenceEditorValue) => void` — the shared `GeofenceEditor` component (Phase 3) takes
    one `onChange` of this shape and owns no form state itself, per the plan.

### Notes for Phase 1 (VenueMapPicker upgrades)

- Current props: `{ latitude: number | null; longitude: number | null; radius: number; onChange:
  (lat, lng) => void }` in [VenueMapPicker.tsx:32-37](components/admin/VenueMapPicker.tsx#L32-L37).
  Its `onChange` signature is narrower than `GeofenceEditorChange` (no `source`, no `radius`) —
  that's fine and intentional, `VenueMapPicker` only reports pin drags. Don't widen its `onChange`
  to the full `GeofenceEditorValue`; let the Phase 3 `GeofenceEditor` wrapper be the one that knows
  about `source` (map drag ⇒ `source: "map"`) and stitches `VenueMapPicker`'s `onChange` together
  with `RadiusDial`'s radius output into one `GeofenceEditorValue` for its own `onChange`.
- The circle is created once in the mount effect
  ([VenueMapPicker.tsx:136-146](components/admin/VenueMapPicker.tsx#L136-L146)) and only
  `setRadius`/`setCenter` afterward — there's no existing "recompute zoom to fit circle" logic
  anywhere, `onRadiusFit` is a genuinely new addition, not a rename of something present.
- Map init is gated behind `mapsReady` state and literally renders `hidden` className
  ([VenueMapPicker.tsx:192-197](components/admin/VenueMapPicker.tsx#L192-L197)) until the script
  loads — that's the exact grey-blank risk called out in Risk #1. When `GeofenceEditor` mounts this
  inline (Phase 3/4) instead of inside a bottom sheet that starts `display: none`, re-test that a
  freshly-mounted, immediately-visible container still sizes correctly; the current code has never
  had to handle "container starts at zero height/width then becomes visible," only "starts
  visible."
- No `recenter()` is currently exposed — `mapRef`/`markerRef` are internal refs, nothing is
  imperative-handle'd out. Phase 1 needs `useImperativeHandle` + `forwardRef` (or a callback-ref
  pattern) to expose `recenter()` for the "Use my current location" button described in Phase 3.

### Notes for Phase 2 (RadiusDial)

- Import `dialFractionToRadius`, `radiusToDialFraction`, `radiusKeyStep`, `RADIUS_MIN`,
  `RADIUS_MAX` from `lib/geofenceEditor.ts` — do not reimplement the log-scale math in the
  component. The dial component's job is pointer-event → fraction → these functions → radius;
  keep the math itself out of the component so it stays unit-testable without mounting anything
  (Phase 5's "Unit: log-scale radius mapping, snapping, clamping, keyboard stepping" tests should
  import directly from `lib/geofenceEditor.ts`).
- Existing preset chips to preserve as one-tap shortcuts: `RADIUS_PRESETS` in
  [ActivateVenueFlow.tsx:47-51](components/admin/mobile/ActivateVenueFlow.tsx#L47-L51) — `150
  Standard`, `300 Large`, `600 Campus`. These are plain values, not yet exported from a shared
  location; Phase 2 or 3 should hoist this array out of `ActivateVenueFlow.tsx` (likely into
  `lib/geofenceEditor.ts` alongside the other constants, or its own small export) so `RadiusDial`
  can render the chips without importing a whole flow component.
- Existing a11y bar to match: [tests/admin-mobile.bottom-sheet-a11y.test.ts](tests/admin-mobile.bottom-sheet-a11y.test.ts).

### Notes for Phase 3 (GeofenceEditor)

- GPS logic to lift out of `ActivateVenueFlow.tsx` into the new shared component:
  `useCurrentLocation` (lines 190-219), plus the `locating`/`locateError`/`accuracyMeters`/
  `pinLabel` state it drives (state declarations ~lines 102-135, `pinLabel` memo ~line 124-135).
  Desktop `VenuesSection.tsx` has none of this today — confirm after lifting that desktop actually
  gets a working "Use my current location" button, not just an unused prop.
- `PinCard` component (~[ActivateVenueFlow.tsx:685-737](components/admin/mobile/ActivateVenueFlow.tsx#L685-L737))
  already renders the "Use my current location" button + pin label + error copy — likely reusable
  wholesale inside the new `GeofenceEditor` rather than rewritten.

## Phase 1 — `VenueMapPicker` upgrades — ✅ DONE 2026-08-06

Add to the existing component, preserving its current props so nothing breaks:

- `onRadiusFit`: recompute zoom so the circle fills ~70% of the viewport whenever `radius`
  changes materially, without stomping a user's manual pan/zoom mid-drag.
- Handle container resize (the map goes from a sheet to an inline card, and Google Maps blanks
  out grey if it's initialized hidden — this is the single most likely bug in the whole plan).
- Expose an imperative `recenter()` for the "Use my current location" button.
- Make the circle visually the *editing* object: a thicker stroke that highlights while the
  dial is being dragged.

**Model: Sonnet · Effort: medium.** Fiddly Maps-API work, but self-contained.

### As-built notes for Phase 2/3/4

All changes are confined to
[components/admin/VenueMapPicker.tsx](components/admin/VenueMapPicker.tsx). **Both existing call
sites** ([ActivateVenueFlow.tsx:660](components/admin/mobile/ActivateVenueFlow.tsx#L660) and
[VenuesSection.tsx:658](components/admin/sections/VenuesSection.tsx#L658)) were left completely
unchanged — the four original props (`latitude`, `longitude`, `radius`, `onChange`) still work
exactly as before, so nothing broke. Verified: `npx tsc --noEmit`, `npx eslint
components/admin/VenueMapPicker.tsx`, `npm run test`, `npm run build` all clean. (One pre-existing
failure, `tests/admin-mobile.shell-height-chain.test.ts`, is unrelated to this file — reproduced
on a stash of this change too, it's about `AdminMobileShell.tsx` pinned-nav classNames; not
touched by Phase 1 and not this plan's concern.)

- **No `onRadiusFit` prop was added** — re-read the plan's own wording: "recompute zoom... without
  stomping a user's manual pan/zoom mid-drag" describes *behavior*, not a callback prop name that
  needs to exist. There was nothing for a caller to hook into (no caller needs to know *when* a
  refit happened), so this became an internal `fitToCircle()` helper wired into the existing
  radius-change `useEffect`, gated so it never fires while `dragInProgressRef.current` is true and
  only fires when radius has moved >15% from the last-fit radius (`lastFitRadiusRef`) — so typing
  in the lat/long "Advanced" boxes or nudging the dial by one step doesn't constantly reframe the
  map out from under the user. If Phase 2/3 finds the 15% threshold too twitchy or too sluggish
  while live-dragging the dial, that threshold is the one knob to tune — it's a local const, not
  exported.
- **`fitToCircle` uses `circle.getBounds()` + `map.fitBounds(bounds, 40)`**, not a manual
  zoom-level calculation from the radius value. This is deliberate: Maps' own `fitBounds` already
  accounts for the actual pixel size of the container (important once Phase 3/4 mounts this inline
  at whatever card width the page gives it, not always the same 320-ish px sheet width mobile uses
  today), and the `40`px padding argument approximates "circle fills ~70% of the viewport" without
  hardcoding a zoom/radius lookup table that would need retuning per screen size.
- **New optional prop: `radiusEditing?: boolean`** (default `false`). Pass `true` while the radius
  dial is mid-drag to thicken the circle's `strokeWeight` from 2 to 4
  (`CIRCLE_STROKE_IDLE`/`CIRCLE_STROKE_EDITING` consts at the top of the file) — this is how
  **Phase 2's `RadiusDial`** should signal "I'm being dragged" up to whatever parent renders both
  (Phase 3's `GeofenceEditor`). Neither existing call site passes this prop yet (defaults to
  `false`, i.e. today's stroke weight) — that's expected until Phase 3 wires it.
- **`VenueMapPicker` is now `forwardRef`-wrapped** and exports a `VenueMapPickerHandle` type with
  one method: `recenter(pos?: { lat: number; lng: number }) => void`. Calling it with no argument
  recenters on the picker's current `latitude`/`longitude` props; calling it with a `{ lat, lng }`
  (e.g. a fresh GPS fix) recenters there directly *and* moves the marker/circle to match — useful
  for **Phase 3's "Use my current location" button**, which needs to move the pin, not just pan
  the camera. After recentering it also calls `fitToCircle` so the zoom re-fits the current radius
  around the new position. Neither existing call site attaches a ref yet — it's optional
  (`ref?: Ref<VenueMapPickerHandle>` via `forwardRef`), so both compile and behave unchanged.
  **Phase 3 must attach a ref when composing `GeofenceEditor`** to wire this up; don't reintroduce
  a second "recenter" mechanism (e.g. a `centerOn` prop) — this is the one path.
- **Resize handling uses a `ResizeObserver` on the outer container** (the div that wraps the
  loading-state / map div / caption — `containerRef`, not `mapDivRef`), not a `window.resize`
  listener or a visibility/IntersectionObserver. Rationale: the actual bug (Risk #1) is the
  container's *box size* changing — either because it goes from `display:none`/zero-size to
  visible (today's bottom sheet, or Phase 3/4's card mounting) or because the same mounted
  instance is resized (sheet width ≠ inline card width, orientation change). `ResizeObserver`
  catches both in one code path without needing to know *why* the size changed. On every
  non-zero-size callback it calls `google.maps.event.trigger(map, "resize")` (the documented Maps
  API fix for grey/blank canvases) followed by a `panTo` back to the current marker position
  (`fitBounds`/`setCenter` alone don't repaint if the internal canvas thinks it's still
  zero-sized — the explicit `resize` trigger first is required). This effect is independent of the
  `radius`/`radiusEditing` effects and only depends on `mapsReady`, so it won't re-subscribe on
  every keystroke.
- **This was not tested against a real "mounted inline inside a card that starts at zero height"
  scenario** — only against the existing bottom-sheet call sites, which mount `children` lazily
  (`MobileBottomSheet` only renders children when `open`, see
  [MobileBottomSheet.tsx:47](components/admin/mobile/MobileBottomSheet.tsx#L47)) so `VenueMapPicker`
  has never actually had to size itself from zero → visible in production. **Phase 3/4 is the
  first time this component will be mounted directly inline** (per the plan's own Risk #1 framing)
  — when that lands, deliberately test the zero→visible transition on a real device/browser
  (resize the browser window, or toggle the "Advanced" section if `GeofenceEditor` conditionally
  hides/shows the map) before assuming the `ResizeObserver` path is sufficient. If it isn't, the
  next thing to try is an `IntersectionObserver` fallback or triggering `resize` on mount
  unconditionally (not just via the observer callback) — deliberately left out here since it
  wasn't reproducible without Phase 3/4's actual mount site to test against.
- **No new npm dependency was added.** `ResizeObserver` and `google.maps.event.trigger` are both
  already available (browser built-in / already-loaded Maps JS global) — nothing to install.
- The `GmapsGlobal` type gained `LatLngBounds` and `event.trigger` to support the above; `GmapsMap`
  gained `setZoom`/`getZoom`/`fitBounds`; `GmapsCircle` gained `setOptions`/`getBounds`. These are
  hand-maintained ambient types matching the real Maps JS API (same pattern as the rest of the
  file) — if Phase 2/3 needs another Maps method, extend these types the same way rather than
  reaching for `@types/google.maps` (not installed, and the file's existing convention is a
  minimal hand-rolled surface).

## Phase 2 — The radius dial — ✅ DONE 2026-08-06

New `components/admin/RadiusDial.tsx`. A horizontal drag-to-size control (per the request:
"left to right with a finger"), not a rotary knob — a slider track reads correctly on both
phone and desktop and is far easier to make accessible.

- Pointer Events (`onPointerDown`/`Move`/`Up` + `setPointerCapture`) so mouse, touch and pen
  share one code path.
- Live numeric readout ("**220 m** — about a large bar + patio") and the existing preset chips
  (Standard/Large/Campus) retained as one-tap shortcuts that set the dial.
- **Accessibility is not optional here**: `role="slider"`, `aria-valuemin/max/now/text`, and
  arrow-key stepping. The repo already has a bottom-sheet a11y test
  ([tests/admin-mobile.bottom-sheet-a11y.test.ts](tests/admin-mobile.bottom-sheet-a11y.test.ts)),
  so match that bar.
- `touch-action: none` on the track, or the page will scroll instead of dragging on iOS.

**Model: Opus · Effort: medium.** Gesture + a11y correctness is where hand-rolled sliders
usually go wrong; worth the stronger model.

### As-built notes for Phase 3/4/5

Files touched: **new** [components/admin/RadiusDial.tsx](components/admin/RadiusDial.tsx);
**edited** [lib/geofenceEditor.ts](lib/geofenceEditor.ts) (additive only),
[app/globals.css](app/globals.css) (appended a `.tp-dial-*` block at the end),
[components/admin/mobile/ActivateVenueFlow.tsx](components/admin/mobile/ActivateVenueFlow.tsx)
(3-line import/re-export swap only — its UI is untouched and still shows the old preset chips +
number box; **Phase 4 is what replaces that**). `VenueMapPicker.tsx` and `VenuesSection.tsx` were
not touched at all. Verified: `npx tsc --noEmit` clean, `npx eslint` clean on every file I wrote,
`npm run test` (1415 passed), `npm run build` clean. The one failing test,
`tests/admin-mobile.shell-height-chain.test.ts`, is the same pre-existing `AdminMobileShell`
className failure Phase 1 documented — reconfirmed against a `git stash` of this change, it is
not ours. (`ActivateVenueFlow.tsx:698` also has a pre-existing
`react/no-unescaped-entities` lint error, likewise reproduced on a stash — don't be alarmed by it,
and don't "fix" it as part of Phase 3; it belongs to whoever rewrites that copy in Phase 4.)

- **`RADIUS_PRESETS` was hoisted into `lib/geofenceEditor.ts`** as the plan's Phase 2 notes
  asked, along with a new `RadiusPreset` type. `ActivateVenueFlow.tsx` now imports it and
  **re-exports it verbatim** (`export { RADIUS_PRESETS };`) purely so
  `tests/admin-mobile.activate-venue.test.ts:2` keeps compiling against its old import path.
  **Phase 4 should delete that re-export** once it rewrites that screen, and repoint the test at
  `@/lib/geofenceEditor`. There is exactly one array now, not two.
- **New helper: `radiusDescription(radius): string`** in `lib/geofenceEditor.ts` — the
  plain-language scale hint next to the readout ("About a bar and its patio"). It returns the
  matching preset's `hint` on an exact preset hit, else a band-based phrase. `RadiusDial` uses it
  for both the visible copy and `aria-valuetext`; **Phase 3 gets this for free** and should not
  write a second copy of that wording inside `GeofenceEditor`. A `label` prop on `RadiusDial`
  overrides it if Phase 3/4 ever needs surface-specific copy.
- **`RadiusDial` owns no state.** Props: `{ radius, onChange(radius), onEditingChange?(editing),
  disabled?, label? }`. The value is `snapRadius(clampRadius(radius))` on every render, so a
  caller passing an unsnapped radius (e.g. an edit-mode venue stored at 200 m, or a hand-typed
  Advanced value) renders on-grid without the component writing back. **`onChange` only fires
  when the computed value actually changes**, so wiring it straight into a `setForm` patch will
  not loop.
- **`onEditingChange` is the wire to Phase 1's `radiusEditing` prop.** It fires `true` on
  pointerdown / `false` on pointerup-or-cancel, and for keyboard it fires `true` on each keypress
  with a trailing 400 ms `KEY_END_DELAY_MS` timer that fires `false` once the user stops (keyboard
  has no natural drag-end). **Phase 3's `GeofenceEditor` should hold one `radiusEditing` state
  and pass `RadiusDial`'s `onEditingChange` into it → `VenueMapPicker`'s `radiusEditing`** — that
  is the whole "circle gets a thicker stroke while you're sizing it" loop, and neither half is
  wired yet.
- **The thumb/fill position is a CSS custom property, not an inline style.** CLAUDE.md bans
  `style={{}}` outside `components/venue-screen/*`, so `RadiusDial` writes
  `--tp-dial-pct` (0-100) onto the track element with `style.setProperty` in an effect — the same
  technique `--tp-vh` (`ViewportHeightSync.tsx`) and `--cbz-visible-*`
  (`CategoryBlitzGame.tsx`) already use. The three consuming rules (`.tp-dial-track`,
  `.tp-dial-fill`, `.tp-dial-thumb`) are appended at the very end of `app/globals.css`.
  **`.tp-dial-track` is where `touch-action: none` lives** — Tailwind's `touch-none` would also
  work, but keeping it in the same rule as `user-select`/`-webkit-tap-highlight-color` means the
  whole "this is a drag surface, not a scroll surface" contract is in one place. If Phase 4 moves
  the dial inside a scrollable card and iOS starts scrolling instead of dragging, that rule is the
  first thing to check.
- **Pointer Events with `setPointerCapture`**, one code path for mouse/touch/pen, as specced.
  Position comes from `clientX` against `getBoundingClientRect()`, and the handler bails when
  `rect.width <= 0` — which is what will happen if Phase 3/4 mounts the dial inside a
  container that starts collapsed (the same zero-size hazard Phase 1 flagged for the map).
- **a11y:** `role="slider"`, `tabIndex=0`, `aria-label="Geofence radius"`,
  `aria-valuemin/max/now/valuetext`, `aria-disabled` when disabled. Keyboard: arrows (via
  `radiusKeyStep`, so every keypress lands on a snapped value), Home → 25, End → 2000, PageUp/Down
  → ±25% snapped. Preset chips are real `<button aria-pressed>`. **Verified in a throwaway jsdom
  render** (slider roles/values/`--tp-dial-pct`/arrow+Home+End stepping, and chip → `onChange(600)`)
  — that probe was **deleted rather than committed**, because the plan assigns tests to Phase 5.
  **Phase 5 should recreate it** as `tests/venue-activation.radius-dial.test.ts`; note the repo's
  vitest config only globs `*.test.ts`, so use `createElement`, not JSX (same constraint
  `tests/admin-mobile.bottom-sheet-a11y.test.ts` works around), and call `cleanup()` between
  renders or `getByRole` finds duplicates.
- **Not verifiable here, deliberately left to the Phase 5 device checklist:** actual thumb-drag
  feel, whether the log curve reads right under a finger, and whether the 48px track / 36px thumb
  are big enough on a phone. Headless can't judge any of it.

## Phase 3 — `GeofenceEditor` (map + dial, one card) — ✅ DONE 2026-08-06

New `components/admin/GeofenceEditor.tsx` composing Phases 1 and 2: map on top, dial directly
beneath it, and the two action buttons — **Use my current location** and a plain-language pin
hint ("Drag the pin to the front door") — between them. This is the screen the user asked for.

- Lift the GPS logic out of `ActivateVenueFlow` (`useCurrentLocation`, `locating`,
  `accuracyMeters`, `locateError`, `pinLabel`) into this component so desktop gets it too —
  desktop has **no** current-location button today.
- Keep lat/long text inputs, but only under "Advanced".

**Model: Opus · Effort: medium.** Careful state extraction across two existing call sites.

### As-built notes for Phase 4/5

Files touched: **new** [components/admin/GeofenceEditor.tsx](components/admin/GeofenceEditor.tsx);
**edited** [components/admin/mobile/ActivateVenueFlow.tsx](components/admin/mobile/ActivateVenueFlow.tsx)
(2-line change only — deleted its local `type PinSource` and imported the canonical one from
`lib/geofenceEditor.ts`, as Phase 0 required; **its UI is completely untouched** and still shows
the old preset chips + number box + "Adjust pin" bottom sheet — **Phase 4 is what replaces that**).
`VenueMapPicker.tsx`, `RadiusDial.tsx`, `VenuesSection.tsx`, `lib/geofenceEditor.ts` and
`app/globals.css` were **not touched at all**. Verified: `npx tsc --noEmit` clean, `npx eslint
components/admin/GeofenceEditor.tsx` clean, `npm run test` (1415 passed — the identical number
Phase 2 recorded), `npm run build` clean. Same single pre-existing failure,
`tests/admin-mobile.shell-height-chain.test.ts` (`AdminMobileShell` pinned-nav classNames), which
both Phase 1 and Phase 2 already documented as not-ours — don't chase it.

- **`GeofenceEditor` is not yet mounted anywhere.** It compiles, is fully wired internally, and is
  covered by the probe described below, but **zero call sites render it** — that is Phase 4's
  entire job, and it's why nothing in the app looks different yet. Don't read the green build as
  "the feature is live."
- **Props: `{ latitude: number | null; longitude: number | null; radius: number; source: PinSource;
  onChange: GeofenceEditorChange; disabled?; hideAdvanced?; className? }`.** It owns **no form
  state** — `latitude`/`longitude`/`radius`/`source` are all controlled by the caller, and every
  mutation (pin drag, GPS fix, dial move, typed coordinate) comes back as one
  `GeofenceEditorValue` through `onChange`. It owns only *interaction* state: `radiusEditing`,
  `locating`, `locateError`, `accuracyMeters`, `advancedOpen`, and the Advanced text drafts.
- **`source` is a controlled prop, deliberately, not internal state.** The mobile flow already
  keeps `pinSource` in its own `useState` and both surfaces need it for other purposes (mobile's
  step-1 `PinCard`, clearing `placeId`), so hoisting it would have created two competing copies.
  **Phase 4 keeps its existing `pinSource` state and feeds it in**, updating it from
  `onChange`'s `value.source`.
- **`placeId` clearing is the caller's job, not this component's.** `GeofenceEditor` has no idea
  `placeId` exists. Every `onChange` carries a `source`, and **`"gps" | "map" | "manual"` all mean
  "the pin no longer belongs to the looked-up Place" → Phase 4 must clear `placeId` on those three
  and leave it alone on `"lookup"`/`"existing"`.** This is exactly what `ActivateVenueFlow` does
  today at three separate call sites; the new single `onChange` collapses it to one branch. Getting
  this wrong is the most likely silent regression in Phase 4 (Risk #3's "must not regress
  `placeId` clearing") — the desktop form currently clears it inline on the lat/long inputs and on
  the map's `onChange`.
- **Radius changes never move the pin and never change `source`.** `handleRadiusChange` re-emits
  the *current* lat/lng and the *current* `source` with the new radius — a GPS-set pin is still a
  GPS-set pin at 600 m. `handleRadiusChange` also **early-returns when there's no pin**, and the
  dial is `disabled` in that state, so a radius can't be set before a location exists.
- **The `radiusEditing` loop is closed here and nowhere else**: `RadiusDial`'s `onEditingChange`
  → local `radiusEditing` state → `VenueMapPicker`'s `radiusEditing` prop → thicker circle stroke.
  Phase 4 does not need to wire anything for this; **don't add a second path.**
- **The map is lazy-mounted behind `hasPin`** (`latitude !== null && longitude !== null`), which is
  the plan's own Risk #2 mitigation — no coordinates means no Maps API load, so opening a venue
  form doesn't burn a map load. The placeholder is a dashed 320px-tall card reading "The map
  appears once there's a pin." **This means `VenueMapPicker` mounts into a container that is
  already laid out and visible, never a zero-size one** — the exact scenario Phase 1 flagged as
  untested. It's a `{hasPin ? <map/> : <placeholder/>}` swap, not a `display:none` toggle, so the
  map mounts fresh at full size rather than transitioning from zero. That's the good case for
  Phase 1's `ResizeObserver`, but it is **still not proof** — see the device checklist note below.
- **`recenter()` is used exactly once**, in the GPS success path: `mapRef.current?.recenter({ lat,
  lng })`. This matters for the first-ever pin — the props change alone would move the marker, but
  the camera would still be sitting on `DEFAULT_CENTER` if the map had just mounted. Note the
  ordering: `emit(...)` fires **before** `recenter(...)`, so on a first pin the map may not exist
  yet when `recenter` runs and the call no-ops harmlessly (the subsequent prop-driven mount centers
  on the new coords anyway). Don't "fix" this by reordering — emitting last would render the map
  with stale coords.
- **`pinLabel(hasPin, source, accuracyMeters)` is exported** from `GeofenceEditor.tsx` as a plain
  function, carrying `ActivateVenueFlow`'s original `pinLabel` memo wording **verbatim** (all seven
  branches pinned by the probe). **Phase 4 should delete the `pinLabel` `useMemo` in
  `ActivateVenueFlow.tsx` (~line 123) and the `PinCard` component (~line 683) entirely**, since
  `GeofenceEditor` now renders both the label and the "Use my current location" button. If step 1
  still wants a pin summary before the editor appears, import `pinLabel` rather than re-deriving
  the strings.
- **`useCurrentLocation` was lifted with identical behavior and near-identical copy.** The only
  wording change: the three fallback sentences now say **"drag the pin on the map"** instead of
  **"drop the pin on the map"**, because there is no longer a separate "Adjust pin" sheet to open —
  the map is right there. `GPS_OPTIONS` (`enableHighAccuracy: true, timeout: 15000, maximumAge: 0`)
  is unchanged. **Desktop genuinely gets a working button now, not an unused prop** — verified by
  the probe's GPS tests, which drive the real button through a stubbed `navigator.geolocation`.
- **`hideAdvanced` exists for the mobile flow.** `ActivateVenueFlow` already has its own "Advanced"
  disclosure holding lat/long *plus* display name, county, region, TV settings and delete. Two
  nested "Advanced" sections would be absurd, so **mobile should pass `hideAdvanced` and keep its
  existing panel; desktop should leave it off and get the built-in one.** That's the intended split
  — it is not a leftover flag.
- **The Advanced lat/long boxes use a draft-string pattern.** Raw text is held in `latDraft`/
  `lngDraft` so a half-typed `"-104."` isn't parsed to `NaN` and discarded between keystrokes;
  `commitAdvanced` only emits when **both** values parse finite and are in range
  (±90 / ±180), and the drafts are cleared **on blur**, which re-derives the display from the
  caller's committed coordinates. **This was originally a `useEffect` keyed on
  `[latitude, longitude]` and eslint's `react-hooks/set-state-in-effect` rejected it** — don't
  reintroduce that; blur is the correct clearing point. Same rule family killed an
  `onChangeRef.current = onChange` write during render (`react-hooks/refs`), so `emit` depends on
  `onChange` identity directly. **If Phase 4 passes an inline arrow as `onChange`, that's fine** —
  nothing in this component uses `emit` as an effect dependency, only as a callback.
- **Verified in a throwaway jsdom probe (8 tests, all passing), then deleted** — same convention
  Phase 2 followed, because the plan assigns tests to Phase 5. **Phase 5 should recreate it** as
  `tests/venue-activation.geofence-editor.test.ts`. What it covered, and should cover again:
  arrow-key on the dial emits `{lat, lng, radius: 175, source: "lookup"}` with the pin unmoved;
  no-pin state disables the slider and shows the placeholder; Advanced commits `source: "manual"`
  and ignores both unparseable (`"-"`) and out-of-range (`"999"`) input; GPS success emits
  `source: "gps"`; `PERMISSION_DENIED` surfaces the blocked-location copy; `hideAdvanced` removes
  the disclosure; all seven `pinLabel` branches. Two mechanics you will need: the file needs
  `// @vitest-environment jsdom` on line 1 (the repo's vitest config is `environment: "node"`),
  and **`fetch` must be stubbed** — `VenueMapPicker` calls `/api/admin/maps-key` on mount, so
  return `{ ok: false, error: "…" }` to park it in its error state. Use `createElement`, not JSX
  (config only globs `*.test.ts`), and `cleanup()` between renders.
- **What headless could NOT verify, for the Phase 5 device checklist:** the map never actually
  rendered in any of this — the probe stubs the maps key away, so **the "circle grows under your
  finger while you drag the dial" loop has never been seen working end-to-end.** Specifically
  unverified: `radiusEditing` actually thickening the stroke, `fitToCircle` reframing at the right
  moment (Phase 1 left the 15% refit threshold as the one knob to tune — **now is when you'd find
  out it's twitchy, by live-dragging the dial over a real map**), `recenter()` on a first GPS pin,
  and whether the map's 320px height plus the pin card plus the dial plus the presets actually fit
  on a phone screen without the dial falling below the fold. That last one is a layout risk Phase 4
  owns: **if the dial is off-screen while the map is visible, the entire point of the plan is
  lost.**

## Phase 4 — Mount in both surfaces — ✅ DONE 2026-08-06

- **Mobile**: replace the step-2 radius card *and* the "Adjust pin" bottom sheet with
  `GeofenceEditor`; delete the sheet path. Step 2 becomes: name → geofence editor → Advanced →
  **Activate venue**.
- **Desktop**: replace the radius/lat/long/map block
  ([VenuesSection.tsx:600-664](components/admin/sections/VenuesSection.tsx#L600-L664)) with the
  same component, and move it to sit immediately after the address fields so the confirm→activate
  order the user described actually reads top-to-bottom.
- Make the primary button read **Activate Venue** on create in both surfaces (desktop currently
  uses a generic `submitLabel`).

**Model: Opus · Effort: medium-high.** Touches the largest file (1032-line `VenuesSection`) and
must not regress edit mode, the venue list, or `placeId` clearing.

### As-built notes for Phase 5

Files touched — **all edits, no new files**:
[components/admin/mobile/ActivateVenueFlow.tsx](components/admin/mobile/ActivateVenueFlow.tsx),
[components/admin/sections/VenuesSection.tsx](components/admin/sections/VenuesSection.tsx),
[tests/admin-mobile.activate-venue.test.ts](tests/admin-mobile.activate-venue.test.ts) (one import
line). `GeofenceEditor.tsx`, `RadiusDial.tsx`, `VenueMapPicker.tsx`, `lib/geofenceEditor.ts` and
`app/globals.css` were **not touched at all** — Phases 1-3 built exactly the right seams and Phase 4
only had to mount them. Verified: `npx tsc --noEmit` clean, `npm run lint` **clean across the whole
repo**, `npm run test` (1415 passed — the identical number Phases 2 and 3 recorded), `npm run build`
clean. Same single pre-existing failure, `tests/admin-mobile.shell-height-chain.test.ts`
(`AdminMobileShell` pinned-nav classNames), which Phases 1, 2 and 3 all already documented as
not-ours — **don't chase it, and don't count it as a Phase 4 regression.**

- **`GeofenceEditor` is now live on both surfaces.** This is the first phase where the app actually
  looks different. Mobile: step 2 is now name → `GeofenceEditor` → Advanced → **Activate venue**.
  Desktop: the geofence block sits immediately after the address fields (Country), before
  County/Region and the Venue Screen Settings panel.
- **The `RADIUS_PRESETS` re-export in `ActivateVenueFlow.tsx` is gone**, as Phase 2's notes
  instructed, and `tests/admin-mobile.activate-venue.test.ts:2` now imports from
  `@/lib/geofenceEditor`. That test's assertions are unchanged and still pass — it only ever used
  the array to check every preset survives `validateVenueForm`.
- **`placeId` clearing (Risk #3, the flagged silent-regression risk) is implemented identically in
  both surfaces**, as a `handleGeofenceChange` function next to the form state:
  `const detached = source === "gps" || source === "map" || source === "manual"` → spread
  `{ placeId: "" }` only when detached. `"lookup"` and `"existing"` leave it alone. **Verified by a
  throwaway probe** (see below) that a dial move emits `source: "lookup"` and therefore does *not*
  clear `placeId` — that's the case a naive implementation breaks, since resizing the circle
  shouldn't disown the Place. If you touch this, keep the two copies in sync or hoist the predicate
  into `lib/geofenceEditor.ts`; it was left duplicated because it is three tokens long and the two
  call sites patch differently-shaped state (`patch` vs `onChange`).
- **Mobile's `pinSource` state was kept and fed in, exactly as Phase 3 predicted.** It still drives
  step 1's `PinCard` summary; `handleGeofenceChange` updates it from `value.source`.
- **Desktop gained `pinSource` state for the first time** (`useState<PinSource>(mode === "edit" ?
  "existing" : "none")`). It's also set to `"lookup"` in `selectPrediction` and reset to `"none"` in
  `clearAddressFields`. There is no persisted provenance column — this is per-session UI state only,
  which is fine because its only job is the label wording.
- **Mobile's `pinLabel` `useMemo` and the "Adjust pin" `MobileBottomSheet` are deleted**, per
  Phase 3's instruction. Step 1's `PinCard` **was kept, not deleted** — Phase 3 suggested deleting it
  wholesale, but step 1 still needs a pin summary *before* the editor exists on step 2, so instead:
  its `onOpenMap` prop and "Adjust pin on map" button are gone (there is no sheet to open), and it
  now takes a `pinLabel` **string** computed by the shared `pinLabel()` imported from
  `GeofenceEditor.tsx`. No wording is duplicated. `MobileBottomSheet` itself is still used by
  `AdminMobileShell` and `BillingSection` — not orphaned.
- **Step 1's GPS fallback copy was changed from "drop the pin on the map" to match reality.** Step 1
  no longer has any map, so the no-geolocation message now reads "Pick the address above, then drag
  the pin on the map"; the denied/failed messages say "drag the pin on the map" (aligning with the
  wording Phase 3 already lifted into `GeofenceEditor`). **This is intentional divergence from the
  original strings** — the old copy pointed at a control that no longer exists.
- **The pre-existing `react/no-unescaped-entities` lint error at `ActivateVenueFlow.tsx:698` is
  fixed**, because it lived inside the `PinCard` heading block Phase 4 rewrote anyway. Phase 2's note
  said it "belongs to whoever rewrites that copy in Phase 4" — that happened. `npm run lint` is now
  clean repo-wide, so **Phase 5 should treat any lint error as new.**
- **Desktop's create button now reads "Activate Venue"** (was "Create Venue"). The `submitLabel`
  prop was kept rather than derived from `mode` — edit still passes "Save Changes", and removing the
  prop would have been a wider diff for no gain.
- **Desktop's bare `type="number"` radius box and both raw lat/long inputs are deleted from the main
  grid.** Coordinates are now only reachable through `GeofenceEditor`'s "Advanced — exact
  coordinates" disclosure (desktop leaves `hideAdvanced` off, mobile passes it, per Phase 3's
  intended split). The Place ID / "Coordinates set manually" caption above the map was **kept** —
  it's still the only place `form.placeId` is visible.
- **Verified in a throwaway jsdom probe (5 tests, all passing), then deleted** — same convention
  Phases 2 and 3 followed. **Phase 5 should recreate it** as
  `tests/venue-activation.phase4-mount.test.ts`. What it covered and should cover again: (1) mobile
  edit mode renders the `role="slider"` at `aria-valuenow=150` and no longer renders "Adjust pin on
  map" or the "Custom (m)" number box; (2) mobile passes `hideAdvanced` — the editor's "Advanced —
  exact coordinates" disclosure is absent while the flow's own "Advanced" panel is present; (3) an
  ArrowRight on the dial then Save emits `buildVenuePayload` with `radius: 175` and the **lat/lng
  unchanged**; (4) a dial move emits `source: "lookup"` (placeId preserved) while Advanced typing
  emits `"manual"`; (5) desktop's GPS button emits `source: "gps"` and renders "Pin set from your
  phone (±12 m)". Mechanics you'll need, same as Phase 3's: `// @vitest-environment jsdom` on line 1,
  `createElement` not JSX, `cleanup()` between renders, **`fetch` stubbed** (VenueMapPicker calls
  `/api/admin/maps-key` on mount — return `{ ok: false, error: "…" }` to park it in its error state),
  and for the GPS test `vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } })`.
- **Still never seen with a real map, by anyone, in any phase.** Every probe to date stubs the maps
  key away, so **the entire premise of this plan — "the circle grows under your finger while you drag
  the dial" — has not once been observed working.** That is Phase 5's device checklist, and it is not
  a formality. Concretely unverified: `radiusEditing` thickening the stroke; whether Phase 1's **15%
  refit threshold** is twitchy or sluggish while live-dragging (Phase 1 named this the one knob to
  tune — dragging the dial over a real map is when you find out); `recenter()` on a first GPS pin;
  and the layout risk Phase 3 handed to Phase 4 → see next bullet.
- **The "is the dial below the fold?" layout risk is now real and testable, and I could not test
  it.** On mobile step 2 the stack is: header + step chip, name card, then `GeofenceEditor` = 320px
  map → pin card (label + coords + 48px GPS button + hint) → dial card (readout + 48px track + three
  56px chips). On a 667pt iPhone SE that is **certainly** taller than the viewport, so the map and
  the dial will not be simultaneously visible without scrolling — which is the exact feedback loop
  the plan exists to create. **Phase 5 must check this on a real phone first**, before anything else
  on the checklist. If it fails, the cheapest fixes in order: (a) shrink the map from `h-80` to
  `h-56/h-64` on small screens only (it's a Tailwind class on `VenueMapPicker`'s map div), (b) make
  the map sticky within the step-2 scroll container so it stays visible while the dial scrolls under
  it, (c) collapse the pin card between the map and dial into a single line. Don't reach for a
  redesign before trying (a).
- **Desktop's map is now mounted on every venue create/edit form open, but only once coordinates
  exist** — Phase 3's `hasPin` lazy-mount is what holds Risk #2 (Maps quota) roughly flat. A blank
  create form shows the dashed placeholder and loads no map. Worth a spot-check in the Google Cloud
  console after this ships if venue edits are frequent.

## Phase 5 — Tests + verification — ✅ DONE 2026-08-06

- Unit: log-scale radius mapping, snapping, clamping at 25/2000, keyboard stepping.
- Component: dragging the dial emits the radius the map circle is given; picking an address
  seeds both pin and default radius; GPS failure paths still surface the existing copy.
- Regression: the existing admin-mobile suite (`tests/admin-mobile.*`) must stay green, plus
  `npm run build && npx tsc --noEmit && npm run lint && npm run test`.
- **Real-device gate.** Per `CLAUDE.md`, headless browsers cannot validate touch drag or map
  rendering — a headless pass will report success on a dial that doesn't move under a thumb.
  Add `docs/venue-activation-device-checklist.md` (iPhone Safari, iPad, desktop Chrome:
  drag pin, drag dial, rotate device, GPS permission denied) that only Andrew can close.

**Model: Sonnet · Effort: medium** for the automated tests; the device checklist is manual.

### As-built notes — handoff for whoever closes the device checklist next

**This phase is entirely test/doc work — zero application code changed.** Files touched, all
**new**: [tests/venue-activation.radius-dial.test.ts](tests/venue-activation.radius-dial.test.ts)
(15 tests), [tests/venue-activation.geofence-editor.test.ts](tests/venue-activation.geofence-editor.test.ts)
(9 tests), [tests/venue-activation.phase4-mount.test.ts](tests/venue-activation.phase4-mount.test.ts)
(6 tests), [docs/venue-activation-device-checklist.md](docs/venue-activation-device-checklist.md).
`lib/geofenceEditor.ts`, `RadiusDial.tsx`, `GeofenceEditor.tsx`, `VenueMapPicker.tsx`,
`ActivateVenueFlow.tsx`, `VenuesSection.tsx` and `app/globals.css` were **not touched at all** —
Phases 1-4 already built the seams these tests import against. Verified: `npx tsc --noEmit`
clean, `npm run lint` clean across the whole repo, `npm run test` (**1445 passed** — up from
Phase 4's 1415 by exactly the 30 tests added here), `npm run build` clean. Same single
pre-existing failure, `tests/admin-mobile.shell-height-chain.test.ts` (`AdminMobileShell`
pinned-nav classNames) — Phases 1-4 all already documented this as unrelated to this plan; it
remains untouched here too. **Do not chase it as part of this plan.**

- **The three new test files are the recreations Phases 2/3/4 asked for, not new designs.**
  Each phase's as-built notes described a throwaway jsdom probe that was verified once then
  *deleted* (deliberately, since the plan assigned permanent tests to Phase 5) and specified
  almost exactly what to recreate, including file names. All three recreations follow that spec
  closely; where a named assertion turned out not to line up with the real DOM (see below), the
  assertion was adjusted to what the component actually renders, not the other way around.
- **Mechanics, consistent across all three new files, matching the existing repo convention**
  (same pattern `tests/admin-mobile.bottom-sheet-a11y.test.ts` uses): `// @vitest-environment
  jsdom` on line 1 (vitest.config.ts defaults to `environment: "node"`), `createElement` not JSX
  (the config only globs `*.test.ts`, not `*.test.tsx`), `cleanup()` in `afterEach`. Every file
  that mounts `VenueMapPicker` (directly or via `GeofenceEditor`/`ActivateVenueFlow`/
  `VenuesSection`) stubs `global.fetch` to return `{ ok: false }` from `/api/admin/maps-key`,
  which parks the picker in its `loadError` branch — **no real map is ever mounted by any
  automated test in this repo, in any phase.** That gap is exactly what
  `docs/venue-activation-device-checklist.md` exists to close.
- **`tests/venue-activation.radius-dial.test.ts`** (15 tests) covers the two things Phase 2's
  notes asked for separately: the pure log-scale math directly from `lib/geofenceEditor.ts`
  (endpoints/midpoint/snap/clamp/key-step, re-verifying the same values Phase 0 spot-checked —
  `t=0.5 → 225`, `snap(212) → 200`, `snap(612) → 600`), and `RadiusDial`'s a11y/keyboard contract
  mounted in jsdom (`role="slider"` values, `--tp-dial-pct` CSS custom property, Arrow/Home/End
  keys, the 400ms trailing `onEditingChange(false)` timer via `vi.useFakeTimers()`, disabled
  state, preset chip clicks). **Pointer-drag itself (`onPointerDown/Move/Up`) is not exercised**
  — jsdom's synthetic pointer events don't meaningfully simulate `setPointerCapture` /
  `getBoundingClientRect()` drag physics, and the keyboard path already covers the same
  `onChange`/`onEditingChange` contract through a code path jsdom *can* verify honestly. Real
  finger-drag feel is checklist item 2.
- **`tests/venue-activation.geofence-editor.test.ts`** (9 tests) covers `GeofenceEditor` in
  isolation, matching Phase 3's list almost verbatim: dial-move `onChange` shape (pin unmoved,
  source preserved), no-pin disabled/placeholder state, Advanced commit (valid / unparseable /
  out-of-range), GPS success (`source: "gps"`), GPS `PERMISSION_DENIED` copy, `hideAdvanced`, and
  all seven `pinLabel` branches. One addition beyond Phase 3's list: a dedicated test that an
  *unsnapped* radius passed in as a prop renders on-grid without an unsolicited `onChange` fire
  (guards the "caller passes an edit-mode venue's raw stored radius" case Phase 2's notes called
  out) — folded into the radius-dial file instead of duplicated here, since it's `RadiusDial`'s
  contract, not `GeofenceEditor`'s.
- **`tests/venue-activation.phase4-mount.test.ts`** (6 tests) covers both real mount sites
  directly — `ActivateVenueFlow` (mobile) and `VenuesSection` (desktop) — rather than a
  lower-level `VenueForm`, because `VenueForm` is a private, non-exported function inside
  `VenuesSection.tsx`; `VenuesSection` itself is the only exported surface, so the desktop tests
  drive it through "+ Add Venue" into create mode the same way a real admin would. Covers: mobile
  edit-mode slider renders at the venue's stored radius with the old "Adjust pin on map" button
  and "Custom (m)" box confirmed absent; `hideAdvanced` leaves exactly one Advanced disclosure
  (the flow's own) and not GeofenceEditor's; an `ArrowRight` keypress on the dial followed by
  "Save changes" submits `radius: 175` with `latitude`/`longitude` unchanged from the venue's
  stored values; a dial-only move preserves `source: "lookup"`-equivalent provenance copy
  ("Pin already on file") while a subsequent Advanced-panel edit flips it to "Pin set from typed
  coordinates" (the `placeId`-clearing predicate, exercised through its user-visible effect since
  `placeId` itself isn't rendered in edit mode); desktop's GPS button emits `source: "gps"` and
  renders "Pin set from your phone (±12 m)"; desktop's create-mode submit button reads "Activate
  Venue".
- **Two real DOM mismatches were found and fixed while writing the mount test — worth knowing
  before touching either file again:**
  1. Mobile's own "Advanced" disclosure button
     ([ActivateVenueFlow.tsx:488](components/admin/mobile/ActivateVenueFlow.tsx#L488)) renders
     the word "Advanced" followed by a sibling `▼`/`▲` `<span>`, which Testing Library folds into
     one accessible name ("Advanced ▼") — an exact-string `getByRole("button", { name:
     "Advanced" })` throws `NoElementFound`, not `MultipleElementsFound` as you'd guess. Match it
     with `/^Advanced/` instead, same as `GeofenceEditor`'s own equivalent button already needs
     to be disambiguated from.
  2. Mobile's own Advanced lat/long `<label>`s
     ([ActivateVenueFlow.tsx:521](components/admin/mobile/ActivateVenueFlow.tsx#L521) and
     the longitude label beside it) have **no `htmlFor`/`id` association** with their `<input>`s
     — unlike `GeofenceEditor`'s Advanced inputs, which do use `htmlFor="geofence-lat"` /
     `id="geofence-lat"`. `screen.getByLabelText(/Latitude/)` throws
     `TestingLibraryElementError: ... no form control was found associated to that label` here.
     The test works around it with `screen.getByText("Latitude").parentElement.querySelector
     ("input")`. **This is a pre-existing a11y gap in `ActivateVenueFlow.tsx`'s own Advanced
     panel, not something Phase 5 introduced or fixed** — flagging it here since it's a
     screen-reader-usability nit a future pass could clean up (add `htmlFor`/`id`, same pattern
     `GeofenceEditor.tsx` already uses two components over), but it was out of scope to "fix" a
     component this phase wasn't asked to touch just because a test needed a workaround.
- **`docs/venue-activation-device-checklist.md` is organized by risk, most-blocking first**, not
  alphabetically or by phase number — item 0 ("is the dial even visible without scrolling on an
  iPhone SE-class screen") is called out as the first thing to check because Phase 4's own notes
  frame it as a potential showstopper for the whole plan, not a polish item. Items 1-6 each map to
  a specific unresolved "not verifiable in jsdom" callout left by Phases 1, 3, and 4 (pin drag,
  dial drag + circle-thickens-while-editing, the 15%-refit-threshold feel, zero→visible map mount,
  `recenter()` on first GPS fix, GPS permission-denied copy). Item 7 is one full create-and-delete
  real-world run per surface; item 8 is a short regression sweep (unsnapped stored radius,
  Place ID caption swap). **Nothing on this list has been checked — it is presented exactly as
  handed off, awaiting Andrew.**
- **What's left for the plan to be fully closed:** only the device checklist itself. Every other
  box in every phase (0 through 5) is done, automated-verified, and green. There is no more code
  work implied by this plan unless the device pass surfaces a real bug (most likely candidates per
  the notes above, in rough likelihood order: the iPhone-SE below-the-fold layout in item 0, and
  the 15%-refit-threshold feel in item 3 — both were flagged as genuinely untested guesses, not
  just formalities).

---

---

## Suggested sequencing

Phases 0-1 → 2 → 3 → 4 → 5, strictly in order; 1 and 2 are independent of each other and could
run in parallel if you want to split them.

## Risks

1. **Google Maps in a hidden/resizing container renders grey** — Phase 1 must call
   `resize`/re-fit on mount and on visibility change.
2. **Maps API cost/quota** — the map now loads inline on every venue edit rather than only when
   a sheet is opened. Lazy-mount it (only after coordinates exist) to keep loads roughly flat.
3. **Desktop regression surface** — `VenuesSection.tsx` is large and also hosts sponsors and
   screen settings; keep the diff confined to the geofence block.
