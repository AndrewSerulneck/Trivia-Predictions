# Signup price copy + partner geofence — Phase 3 handoff (2026-11-03)

## For Andrew (plain English)
The partner **Venue Location** page is built: Partner Dashboard menu → "Venue Location" (after Game Settings). A partner
unlocks the map, drags the pin or taps "Use my current location", optionally sets the radius, and saves. The Phase 2
safety rules apply (own venue only, 1 km move cap, an admin-set radius over 200 m is never shrunk by a pin-only save).
**Not live:** the changes are in the working tree on `after-app-review`, **uncommitted**, not pushed, not deployed. No
migration, env var or cost change. **Still to do:** Phase 4 review, and your phone pass (checklist section N — the plan
called it K but K was taken). I did not browser-test it (see §6).

## For the next agent (Phase 4: Opus 5.5, medium)
### 1. Scope
Phase 4 per the plan: `/code-review high` on the branch diff, fix real findings, add ONE short CLAUDE.md bullet (owner
location route + rules file + D6/D7 traps), write Andrew's release note. Do not push `main`, deploy or touch Production env.

### 2. Starting state
Branch `after-app-review`, last commit `82b7fbe1`. Phase 3 files below are **uncommitted** (commit them first if Andrew
agrees). No data changed; no DB access was made.

### 3. Decisions
D1–D7 in the plan, unchanged. Phase 3 added:
- The radius guard lives in the page (not the editor, which must not be forked): `shownRadius(stored)` = what the editor
  displays (clamped+snapped to 50–200). When the editor emits a radius equal to `shownRadius(current)` the page keeps
  `current` (the stored value). **Known limit:** a partner with a stored 600 m cannot deliberately pick exactly 200 m
  (indistinguishable from the echo); 190 or 210-capped values work. Judged acceptable; mention to Andrew if he asks.
- Page shows "Currently N m — set by Hightop. It stays unless you change the dial." when stored radius is outside 50–200.
- If the venue has no usable saved pin the page shows `noSavedPin` ("email support") and no editor (server would refuse anyway).

### 4. Files
- `app/owner/venue-location/page.tsx` (new): shell copied from game-settings; GET on venue change; PATCH on Save; 401 →
  `ownerAuthRecoveryPath`; server `error` shown verbatim; `applySaved` resets from the response.
- `lib/venueLocationRules.ts`: extra strings in `VENUE_LOCATION_COPY` (page title, save labels, `radiusKept(n)`).
- `components/owner/menu/ownerMenuItems.ts`: `venue-location` row (MapPin) after `game-settings`.
- Tests: `tests/owner-menu-contract.test.ts` (order/hrefs updated), `tests/owner-loader-contract.test.ts` (page added),
  new `tests/owner-venue-location-page-contract.test.ts`.
- `docs/partner-dashboard-app-redesign-device-checklist.md`: new section **N**.

### 5. Facts and traps
- `GeofenceEditor` with `startLocked` does **not** mount `VenueMapPicker` until "Edit location & geofence" is tapped, so
  the Maps script/key fetch is deferred. Locked summary still prints "Geofence radius: 200 m" for a stored 600 (editor
  clamps); the page's "Currently 600 m" line covers this.
- Editor emits `radius` = its clamped/snapped shown value on every pin move/GPS fix; that is the D7 trap handled above.
- `PartnerManual.tsx` has no geofence/join-problem section → nothing added. `/owner` is web-only in the native app
  (`lib/nativeLinkOut.ts`), nothing to do.
- Plan said "section K" for the checklist; K already existed, so it is **N**.
- 4 pre-existing failing tests (MLB/NFL star-index staleness) are unrelated; leave them.

### 6. Verification
`npx tsc --noEmit` clean; eslint clean on changed files; `npm run test` 6,106 pass / 4 fail (the tripwires); `npm run build`
compiles and lists `/owner/venue-location`. **Not verified:** no browser run (needs scratchpad clone + mocked
`/api/owner/*`, no `.env.local`); the D7 guard is pinned by a source-text test only, not exercised live. Do that in
Phase 4 or via Andrew's phone pass.

### 7. Open questions
Plan's three (radius range, 1 km cap, page placement). None block Phase 4.

### 8. First steps
1. Commit Phase 3. 2. Optionally browser-check with mocked routes (stored radius 600 → pin drag → PATCH body keeps 600).
3. `/code-review high`; fix. 4. CLAUDE.md bullet + release note.
