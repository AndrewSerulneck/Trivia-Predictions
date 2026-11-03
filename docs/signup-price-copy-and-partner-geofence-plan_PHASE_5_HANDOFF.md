# Signup price copy + partner geofence — Phase 5 handoff (2026-11-03)

## For Andrew (plain English)
The Venue Location page now changes a venue's geofence size **only** when the partner taps a size chip or moves the
dial. Moving the pin never changes it. This fixes four review findings (R1, R5, R6, R7):
- A venue set by Hightop to 600 m keeps 600 m when the partner only moves the pin, **and** the partner can now pick
  200 m on purpose (before, that tap was ignored).
- The "set by Hightop" note now reads "Your geofence is 600 m, set by Hightop. The dial can't show that size, so it
  stays unless you pick a new one." It disappears once the partner picks a new size.
- A venue with no stored radius now saves 150 m (what the dial shows), never a silent 50 m.

**Not live:** uncommitted on `after-app-review` (together with Phase 3), not pushed, not deployed. No migration, env
var, cron or cost change. **Needs you later:** the phone pass in checklist section N (one new line for this phase).

## For the next agent (Phase 6: Sonnet 5.5, medium)

### 1. Scope
Phase 6 per the plan: R2 (save racing a venue switch), R3 (`loadVenues` error handling + Try again), R9 (confirm
before discarding edits on a venue switch). Out of scope: `beforeunload`, server routes, Phase 7 items (R4, R8).

### 2. Starting state
Branch `after-app-review`, last commit `82b7fbe1`. **Uncommitted:** all of Phase 3 (see its handoff) plus Phase 5's
files below. No data changed; no DB, Supabase or Vercel access was made. Not browser-tested on a device.

### 3. Decisions made in Phase 5
- Implemented exactly as the plan's Phase 5 section. No new field on `GeofenceEditorValue`.
- `onRadiusChange` is called with `clampRadius(nextRadius, min, max)` — the same value the following `onChange`
  carries.
- `handleRadiusChange` also clears `statusMessage` (same as a pin edit), so a stale "Saved" banner doesn't linger.
- The page test uses the **real** `GeofenceEditor`/`RadiusDial` with only `VenueMapPicker` stubbed, rather than
  stubbing the editor. That proves the real echo behavior. This stood in for the plan's browser check (see §6).

### 4. Files
- `components/admin/GeofenceEditor.tsx`: new optional prop `onRadiusChange?: (radius: number) => void` (JSDoc says it
  fires only for the dial or a chip). Called only in `handleRadiusChange`, just before `emit`. Other callers (signup
  `GeofenceStep`, admin `VenuesSection`, `ActivateVenueFlow`, add-venue) don't pass it and behave as before.
- `app/owner/venue-location/page.tsx`: `shownRadius` and the `clampRadius`/`snapRadius` imports removed;
  `handleEditorChange` sets only pin/source/status; new `handleRadiusChange`; `radiusToSave = radius ??
  SIGNUP_RADIUS_DEFAULT` sent in the PATCH; `changed = pinMoved || (radius !== null && radius !== saved.radius)`;
  editor gets `radius ?? SIGNUP_RADIUS_DEFAULT`; notice `radiusOutsideDial` keyed on the current radius (R5). Header
  comment rewritten.
- `lib/venueLocationRules.ts`: `VENUE_LOCATION_COPY.radiusKept` reworded (plan text).
- `tests/venue-activation.geofence-editor.test.ts`: `VenueMapPicker` is now `vi.mock`ed (a "Drag pin" button) for the
  whole file; new `describe("onRadiusChange …")` — chip tap (stored 600 on a 50–200 dial, 200 chip) fires; dial
  fires; map drag, GPS, Advanced never fire. Existing exact-object assertions untouched and passing.
- `tests/owner-venue-location-page-contract.test.ts`: old `shownRadius` regex replaced by the four plan checks.
- **New** `tests/owner-venue-location-page.render.test.ts` (jsdom): stored 600 + pin drag → PATCH `radius: 600`;
  stored 600 + 200 chip → PATCH `radius: 200` and note gone; stored null → dial shows 150, Save disabled on open, pin
  drag → PATCH `radius: 150`. Mocks: stable `useRouter` object, `OwnerShell` (renders children), `VenueMapPicker`,
  `fetch`.
- `docs/partner-dashboard-app-redesign-device-checklist.md` section N: "Currently … m" wording updated; Phase 5 line
  added.

### 5. Facts and traps
- **Known limit (no code, per plan):** for a 600 m venue, dragging the dial (or arrow keys / End) to the far end does
  **not** fire, because `RadiusDial` skips `next === value` (`components/admin/RadiusDial.tsx:101,150`) and its shown
  value is already 200. The 200 m chip always fires (`RadiusDial.tsx:199`), and so does dragging to 190 m. The new
  `radiusKept` copy points partners to "pick a new one".
- **Test trap:** a `useRouter` mock that returns a fresh object each render re-runs the page's `[router]` effects and
  blanks the page (looks like a perpetual loader). Use one stable object (Phase 6 render tests should reuse
  `tests/owner-venue-location-page.render.test.ts`'s setup).
- `vi.mock` of `VenueMapPicker` now applies to every test in `tests/venue-activation.geofence-editor.test.ts`; none
  of the older tests exercised the map, so nothing changed for them.
- 4 pre-existing failing tests (MLB/NFL star-index staleness tripwires) are unrelated; leave them.

### 6. Verification
- `npx tsc --noEmit` clean; eslint clean on all changed files; `npm run test`: 6,114 pass / 4 fail (the tripwires).
- Mutation check: re-adding `setRadius(value.radius)` to `handleEditorChange` fails both the contract test and the
  render test's "stored 600 + pin drag" case; the page was restored from a backup copy afterwards.
- **Not done:** a real-browser run from a scratchpad clone. The jsdom render test with the real editor covers the
  same logic; the Google map itself is only covered by Andrew's phone pass (checklist N).

### 7. Open questions
The plan's three (radius range, 1 km cap, page placement). None block Phase 6.

### 8. First steps for Phase 6
1. Read the plan's Phase 6 section and `app/owner/venue-location/page.tsx`.
2. Add `venuesLoadFailed` / `discardChanges` copy to `VENUE_LOCATION_COPY`; fix `loadVenues` (catch, `res.ok`,
   `venuesError`, `venuesReloadKey`), `disabled={saving}` + `selectedVenueIdRef` guard, `handleVenueChange` with
   `window.confirm`.
3. Extend the contract test, and add render tests to `tests/owner-venue-location-page.render.test.ts` (500 from
   `/api/owner/venues` → error + Try again recovers; switch with an unsaved edit → confirm).
