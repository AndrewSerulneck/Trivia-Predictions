# Signup price copy + partner-adjustable geofence — plan

**Status (2026-11-03):** Phases 1–8 done and committed on `after-app-review` (Phases 3, 5–8 in `faaa7cde`, not pushed); latest handoff `docs/signup-price-copy-and-partner-geofence-plan_PHASE_8_HANDOFF.md`. Phase 8 re-review fixed 3 small page bugs and added the CLAUDE.md bullet and release note. Andrew accepted the unpaid-claim risk (Phase 8 handoff Q1 = c, 2026-11-03). **Waiting on Andrew:** the phone pass (checklist N), then release once App Store approval is confirmed.
Each finished phase writes `docs/signup-price-copy-and-partner-geofence-plan_PHASE_<N>_HANDOFF.md` and updates this line.

## For Andrew (plain English)

Two changes:

1. **Stop showing a plan name and price before Stripe.** On the signup page titled "Does this look right?", the card reads
   "Venue Pro $100 /mo" and the button reads "Start subscription — $100/mo". The partner may have a promo code at
   Stripe, so the amount we show can be wrong. The "Venue Pro" name implies there are other plans. Phase 1 removes
   both from that page and from `/owner/billing/setup`, which shows the same card. The public `/info` pricing card
   stays as it is (your call).
2. **Partners can fix their own geofence.** Phases 2–3 add a **Venue Location** page to the Partner Dashboard menu.
   There a partner can move the pin, use "Use my current location", and set the radius. It uses the same map and
   dial as signup.

**Known limit (your decision, recorded here):** the radius range stays 50–200 m, the same as signup. The game
always treats a radius under 300 m as 300 m and adds at least 120 m for phone GPS error (`lib/geofence.ts`). So
**changing the radius in this range does not change who can play. Moving the pin does.** The page will guide
partners to fix the pin. If you later want the radius to matter, change only the two constants
`SIGNUP_RADIUS_MIN`/`SIGNUP_RADIUS_MAX` (see Open questions).

No database migration, feature flag, cron job or paid-service change is needed. `main` is frozen during App Store
review, so all work goes on `after-app-review` and nothing is pushed to `main` until you confirm approval.

## Decisions already made (Andrew, 2026-11-03) — do not re-ask

| # | Question | Answer |
|---|----------|--------|
| D1 | Where the price and "Venue Pro" come off | Signup review step + its button, and `/owner/billing/setup`. **Not** `/info` (its pricing card stays). **Not** the add-venue quote, partner emails, or the `/owner/billing` page, which all show the real amount from Stripe/the bill. |
| D2 | New button wording | **"Continue to checkout"**. Card text: "You'll see your price on Stripe's secure checkout, where you can also enter a promo code. Cancel anytime." (Stripe Checkout already has `allow_promotion_codes: true`, `app/api/owner/billing/checkout/route.ts:325`, so this is true.) |
| D3 | What partners can change | **Pin + radius.** Not the address, name, or anything else. |
| D4 | Partner radius range | **50–200 m**, the existing `SIGNUP_RADIUS_MIN`/`SIGNUP_RADIUS_MAX` in `lib/selfServeSignup.ts`. |

Defaults chosen by the planner (Andrew can override; listed again under Open questions):

- **D5 Own page, not a dashboard sheet:** `/owner/venue-location`, menu row "Venue Location" (hint "Where players
  can join", Lucide `MapPin`), placed directly after "Game Settings". A page keeps the Google Maps script out of the
  dashboard bundle and needs no new `OWNER_SHEET_IDS` entry.
- **D6 Pin move cap 1 km:** a partner may move the pin at most 1,000 m from the saved pin per save. A bigger move
  is refused with "That's far from your saved location — email support and we'll move it for you." This stops a
  mis-drag from moving the venue to another town, and stops a partner from opening their venue to players far
  away.
- **D7 Out-of-range existing radius is kept:** many admin-created venues have a radius over 200 m (admin range is
  25–2000). Saving the pin alone must **never** shrink that radius. The server accepts `radius` equal to the
  stored value even when it is outside 50–200. A *changed* radius must be within 50–200.

---

## Phase 1 — Remove plan name + price from signup and billing setup

**Model / effort:** Sonnet 5.5, low effort.
**Goal:** No "Venue Pro" and no dollar amount appear on any page before Stripe Checkout in the signup and
subscribe flow (D1, D2).
**Out of scope:** `/info`, partner emails (`lib/email/partnerEmailCopy.ts`), `/owner/billing`, add-venue quote,
admin billing.

Changes:

1. `components/signup/steps/ReviewStep.tsx` (~line 102–111): replace the price card. Drop the `Venue Pro`
   eyebrow, the amount and the period. Keep one short card with the D2 text. Update the file's header comment
   ("the only new information on the page is the price…").
2. `components/signup/SignupWizard.tsx:303`: the review-step label becomes `"Continue to checkout"`. Remove the
   `SIGNUP_PRICE_LABEL` import (line 23).
3. `lib/selfServeSignup.ts:88–94`: delete `SIGNUP_PRICE_LABEL` and its comment. It then has no callers.
4. `app/owner/billing/setup/page.tsx:211–227`: same treatment. Drop the "Venue Pro" eyebrow and `$100 /mo`. The
   button becomes "Continue to checkout" (keep "Redirecting to payment…" while paying). Use the same card text as
   D2. Leave "Cancel and start over" untouched.
5. Stale comment: `components/signup/signupMotion.ts:21` says "this flow ends at a $100/mo Checkout". Reword it to
   "a paid Checkout".
6. New contract test `tests/signup-no-price-copy-contract.test.ts`: reads the source text of `ReviewStep.tsx`,
   `SignupWizard.tsx` and `app/owner/billing/setup/page.tsx`, and fails on `Venue Pro` or `/\$\d/`. Comments in
   those files must not quote a price either, or the test fails. Keep it simple.

Checks: `npx tsc --noEmit`, `npm run lint`, `npm run test`. Look for tests that snapshot the old button text with
`grep -rn "Start subscription" tests`. Visual check: a scratchpad clone with mocked routes (see the memory note
"Dev server lock / no broad pkill"). Do not use Andrew's `next dev` on :3000. A phone screenshot at 375 px of
the review step is enough.

Cost: none (copy only).

---

## Phase 2 — Server: read and save a venue's pin + radius (owner)

**Model / effort:** Opus 5.5, medium effort (an auth boundary plus a write to `venues`).
**Goal:** Two owner-authenticated routes and one pure rules file. No UI.
**Out of scope:** the page and menu row (Phase 3); address/name editing; admin routes (unchanged).

1. **`lib/venueLocationRules.ts`** (pure, no `server-only`, shared with Phase 3's client):
   - `validateOwnerVenueLocation({ saved: {lat, lon, radius}, next: {lat, lon, radius} })` returns
     `{ ok: true }` or `{ ok: false, code, message }`.
   - Coordinates must be finite and in range. Reuse `isValidGeofenceCoordinates` from `lib/geofence.ts` and
     `isPlaceholderVenueRow`'s (0,0) idea from `lib/venueClaim.ts`; never re-derive them. A (0,0) pin is refused.
   - Move cap D6: `calculateDistanceMeters(saved, next) <= OWNER_PIN_MOVE_MAX_METERS` (1000, exported constant).
     If the saved pin is null or (0,0), refuse (`no_saved_pin`, "email support").
   - Radius D7: an integer. Either equal to `saved.radius`, or within
     `SIGNUP_RADIUS_MIN..SIGNUP_RADIUS_MAX` (import those, never literals).
   - All partner-facing words in one exported `VENUE_LOCATION_COPY` object.
2. **`GET` + `PATCH /api/owner/venues/location`** (`app/api/owner/venues/location/route.ts`). Copy the shape of
   `app/api/owner/venues/share-details/route.ts`: `requireOwnerAuth`, then `auth.venueIds.includes(venueId)`
   **before any read or write**, then 403. `Cache-Control: no-store`.
   - GET `?venueId=` returns `{ ok, venue: { id, name, latitude, longitude, radius } }`. One select.
   - PATCH `{ venueId, latitude, longitude, radius }`: one select of the saved row, then
     `validateOwnerVenueLocation`, then one `update` of `latitude, longitude, radius` only. Log one line
     `[OwnerVenueLocation] updated venue=<id> moved_m=<n> radius=<old>-><new>` (no owner email). That log is the
     audit trail.
   - **`place_id`:** find out what `venues.place_id` is used for (`grep -rn "place_id" lib app`). Admin's
     `GeofenceEditor` clears its `placeId` copy when the pin stops belonging to the looked-up Place. If anything
     relies on `place_id` matching the pin (e.g. `findNearbyVenue` dedupe), decide whether the partner write
     should leave it alone (likely) and record the reason in the handoff.
3. **`GET /api/owner/maps-key`**. The map needs a browser key, but `/api/admin/maps-key` is admin-only and
   `/api/signup/maps-key` 404s when `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` is off. Admin-activated partners must
   be able to use this page whatever that flag is. Add an owner-auth route that returns
   `publicBrowserGoogleMapsKey()` from `lib/googleMapsKeys.ts`, or 503 when it's unset. **No fallback to the
   server key.** This is a public-ish surface, so follow CLAUDE.md "Two Google Maps keys". Read
   `tests/self-serve-signup-contract.test.ts` first. It pins which files may read which key, so add the new route
   wherever the test expects.
4. **Tests** `tests/api.owner.venues-location.test.ts`: no session → 401; another owner's venue → 403 with no DB
   call; GET shape; PATCH happy path; move of more than 1 km refused; (0,0) refused; radius 600 kept when
   unchanged; radius changed to 600 refused; radius changed to 120 accepted; non-integer radius refused. Add
   rules-only unit tests for `lib/venueLocationRules.ts`.

Facts the next agent needs:
- Players' geofence is checked in two places, both reading `venues.radius/latitude/longitude`: the client prefilter
  `filterVenuesInRange` (`lib/joinVenueList.ts`), and the server `app/api/join/profile/route.ts:227`
  (`getGeofenceThresholdMeters`). The server reads the row fresh on every join. The client venue list is cached in
  `sessionStorage` for 5 minutes (`lib/venues.ts`, `tp_venues_cache_v1`). **A saved change reaches a new player
  at once and a player already looking at the list within 5 minutes.** Say so on the page (Phase 3).
- `getGeofenceThresholdMeters` = `max(300, radius) + clamp(accuracy × 1.5, 120, 5000)` (or +320 with no accuracy).
  Do not change it in this plan.
- God Mode accounts bypass the geofence and are unaffected.
- There is no DB `CHECK` on `venues.radius`; the rules file is the only guard.

Cost: per page open, 1 auth check + 1 select (+1 for the maps key). Per save, 1 auth + 1 select + 1 update.
Partners rarely open this page, so the cost is negligible. No cron, no polling.

---

## Phase 3 — Partner Dashboard "Venue Location" page

**Model / effort:** Sonnet 5.5, medium effort.
**Goal:** `/owner/venue-location` (D5), where a partner adjusts pin + radius with the existing `GeofenceEditor`.
**Out of scope:** new map components, admin screens, signup's GeofenceStep (unchanged), any "test my location"
diagnostic (possible follow-up).

1. **Page** `app/owner/venue-location/page.tsx`. Model the shell on `app/owner/game-settings/page.tsx`:
   `OwnerShell` dark, `backTo` dashboard, the same venue `Dropdown` when the partner has more than one venue, and
   `ownerAuthRecoveryPath` on a 401 (never a bare `/owner/login` push).
2. **Editor:** `components/admin/GeofenceEditor.tsx` with `mapsKeyEndpoint="/api/owner/maps-key"`,
   `min={SIGNUP_RADIUS_MIN}`, `max={SIGNUP_RADIUS_MAX}`, `presets={SIGNUP_RADIUS_PRESETS}`, `hideAdvanced`,
   `startLocked` (protects against accidental drags; the partner taps "Edit location & geofence" first). Mount it
   inside the same light panel signup uses (`rounded-ht-lg bg-slate-200/90 p-3`, see
   `components/signup/steps/GeofenceStep.tsx`). Do **not** re-theme or fork `GeofenceEditor`.
   - **Trap — radius outside 50–200 (D7):** check how `RadiusDial`/`clampRadius` treat a starting value of 600
     with `max=200`. If the editor clamps on mount and fires `onChange`, the page would save a shrunk radius. The
     page must send the **stored** radius unless the partner actually moved the dial. If the dial can't show
     600, show the current radius as text ("Currently 600 m — set by Hightop") and let the dial only replace it
     on purpose.
   - **Check:** confirm whether `startLocked` defers loading the Google Maps script until the tap. If it loads on
     mount, note it in the handoff. Do not change the component for it.
3. **Save:** one Save button, disabled until something changed. PATCH `/api/owner/venues/location`, show the
   server's message on refusal, and on success show "Saved. New players can join from the new spot right away."
4. **Helper copy** (all in `VENUE_LOCATION_COPY`; minimal, per the design rule): one line above the editor:
   "Players can't join? Stand inside your venue and tap **Use my current location**." Do not explain the 300 m
   floor to partners.
5. **Menu row** in `components/owner/menu/ownerMenuItems.ts`: `{ id: "venue-location", label: "Venue Location",
   hint: "Where players can join", icon: MapPin, href: "/owner/venue-location" }` after `game-settings`. Widen
   the `id` union. Update `tests/owner-menu-contract.test.ts` (it pins the order).
6. **Native app:** `/owner` is already web-only (`lib/nativeLinkOut.ts`); nothing to do. Confirm in the handoff.
7. **Partner Manual:** if `components/owner/PartnerManual.tsx` has a section on geofence or join problems, add one
   sentence pointing to Venue Location. Skip it if no such section exists.

Checks: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (not at the same time as typecheck).
Text-size floor (12 px) and the `ht-light-surface` rule apply (`tests/light-surface-css-contract.test.ts`).
Browser-check from a scratchpad clone with **mocked** `/api/owner/*` routes and no `.env.local` (shared production
DB). Never save a real venue from a dev server. Add a short section K to
`docs/partner-dashboard-app-redesign-device-checklist.md` for Andrew's phone pass: open from the menu, unlock, drag
the pin, use current location, save, reload shows the saved pin, a venue with radius over 200 m keeps it after a
pin-only save, a move over 1 km is refused.

---

## Phase 4 — Review + release prep

**Model / effort:** Opus 5.5, medium effort.
**Goal:** Fresh-eyes review of Phases 1–3 (`/code-review high` on the branch diff), then fix anything real. Also:
- Update CLAUDE.md with **one short bullet** (owner location route + rules file + D6/D7 traps) and no more.
- Write the release note for Andrew: what to check on his phone (checklist section K) and that no env var or
  migration is needed.
- Do **not** push `main`, deploy, or touch Production env until Andrew confirms App Store approval (memory: "main
  frozen during App Store review").

**Outcome (2026-11-03):** the review found 9 problems, all in `app/owner/venue-location/page.tsx` and
`lib/venueLocationRules.ts`. They are numbered R1–R9 below, in the order the review ranked them. Phases 5–7 fix
them, and the CLAUDE.md bullet and release note move to Phase 8 so they describe the fixed code.

| # | Problem (short) | Phase |
|---|-----------------|-------|
| R1 | Out-of-range radius: a deliberate dial move to 200 m (or 50 m) is swallowed by the D7 echo guard | 5 |
| R2 | Venue switch during a save: a late PATCH reply for venue A overwrites venue B's state | 6 |
| R3 | `loadVenues` has no catch and no `res.ok` check, so a 500 or offline error reads "No venue found" | 6 |
| R4 | `hasUsablePin` only checks for null; a (0,0) or invalid pin shows an editor the server always refuses | 7 |
| R5 | "Currently 600 m … stays" notice stays on screen after the partner changes the dial | 5 |
| R6 | Null stored radius falls back to 50 m and a pin-only save writes it | 5 |
| R7 | `shownRadius` copies the editor's private formula and guesses intent from equal values | 5 |
| R8 | Saved message leaves out the 5-minute delay for players who already have the venue list open | 7 |
| R9 | Switching venues throws away unsaved edits with no warning | 6 |

Live data checked read-only on 2026-11-03 (16 venues): **1** has a radius over 200 m, **2** have a radius under
50 m, **3** sit at (0,0), and **0** have a null radius or null coordinates. So R1, R4 and R5 affect real venues
today. R6 affects none yet, but the column allows null.

---

## Phase 5 — Radius intent: the editor says when the dial moved (R1, R5, R6, R7)

**Model / effort:** Opus 5.5, medium effort. It touches the shared `GeofenceEditor`, and a mistake here causes
the D7 regression: a pin-only save shrinking an admin-set radius.
**Goal:** the page changes the radius **only** when the partner used the dial or a size chip, and never guesses
from equal values.
**Out of scope:** `RadiusDial` behavior, signup/admin/add-venue callers (they must behave exactly as before),
the 50–200 range (D4), and server rules (unchanged; the server already accepts an unchanged radius).

**Why the current guard fails (R1, R7).** The editor shows `clampRadius(snapRadius(radius))`, which is 200 for a
stored 600. Every pin move emits that shown value. The page treats "emitted radius === shown radius" as an echo
and keeps 600. A partner who deliberately taps the "Patio and parking 200 m" chip emits 200 too, so the page
can't tell that tap from an echo. The page also copies the editor's private formula (`shownRadius`), which will
drift silently if the editor's snapping ever changes.

**Fix.** The editor tells the page which control changed.

1. **`components/admin/GeofenceEditor.tsx`:** add one optional prop,
   `onRadiusChange?: (radius: number) => void`. Call it inside `handleRadiusChange`, and nowhere else, with the
   clamped value, just before the existing `emit(...)`. Don't change anything else: no new field on
   `GeofenceEditorValue` (`tests/venue-activation.geofence-editor.test.ts:60,80,111` assert the emitted object
   exactly, and five other callers read it). Callers that omit the prop behave exactly as before. Add a JSDoc line:
   "Fires only when the partner used the dial or a size chip, never for a pin move, GPS fix or manual entry."
2. **`app/owner/venue-location/page.tsx`:**
   - `handleEditorChange` sets only `pin`, `source` and clears `statusMessage`. It **never** calls `setRadius`.
   - New `handleRadiusChange = (next: number) => setRadius(next)`, passed as `onRadiusChange`.
   - Delete `shownRadius`, and drop the `clampRadius`/`snapRadius` imports. Rewrite the D7 header comment to
     describe the new rule: the radius changes only through `onRadiusChange`.
3. **R5, the notice.** Key it on the **current** radius, not the stored one:
   `radius !== null && radius === storedRadius && (radius < SIGNUP_RADIUS_MIN || radius > SIGNUP_RADIUS_MAX)`.
   Once the partner picks a new size, the notice goes away. Reword `VENUE_LOCATION_COPY.radiusKept` so it also
   covers the editor's locked summary card and the selected chip, which both show the clamped value (200 or 50):
   `` `Your geofence is ${meters} m, set by Hightop. The dial can't show that size, so it stays unless you pick a new one.` ``
4. **R6, null radius.** Pass `radius ?? SIGNUP_RADIUS_DEFAULT` (150) to the editor. Save sends that same
   `radiusToSave = radius ?? SIGNUP_RADIUS_DEFAULT`, which is what the dial shows. Keep
   `changed = pinMoved || (radius !== null && radius !== saved.radius)`, so opening the page alone doesn't enable
   Save. A pin move then writes 150, the value on screen, never a silent 50. Import `SIGNUP_RADIUS_DEFAULT` from
   `lib/selfServeSignup.ts`; never hard-code 150.

**Known limit (record it in the handoff, no code needed):** for a 600 m venue, dragging the dial (or using the
arrow keys) to the far end does **not** fire. `RadiusDial` skips a change when `next === value`
(`components/admin/RadiusDial.tsx:101,150`), and its shown value is already 200. Tapping the 200 m chip always
fires (`RadiusDial.tsx:199`), and so does dragging to 190 m. Don't change `RadiusDial` for this. The new
`radiusKept` copy ("pick a new one") points partners to the chips.

**Tests:**
- `tests/venue-activation.geofence-editor.test.ts`: tapping a size chip calls `onRadiusChange` with its value.
  Map drag, "Use my current location" and Advanced lat/long entry never call it. Leave the existing exact-object
  assertions as they are; they prove the emitted shape didn't change.
- `tests/owner-venue-location-page-contract.test.ts`: replace the `value.radius === shownRadius(current)` regex
  with these checks: the page passes `onRadiusChange=`, `handleEditorChange`'s body contains no `setRadius`, the
  file contains no `shownRadius`, and the editor gets `radius ?? SIGNUP_RADIUS_DEFAULT`.
- If the repo can render the page in Vitest without much setup, also add a behavior test (mock `fetch`). Stored
  600: a pin drag leaves the PATCH body at `radius: 600`, and a 200 chip tap sends `radius: 200`. Stored null: a
  pin drag sends 150. If that setup costs too much, say so in the handoff and rely on checklist N.

**Checks:** `npx tsc --noEmit`, `npm run lint`, `npm run test`. Add to checklist section N in
`docs/partner-dashboard-app-redesign-device-checklist.md`: "On the 600 m venue, tap the 200 m chip: Save becomes
active, and after saving and reloading the radius is 200 m and the 'set by Hightop' note is gone." Do the
browser check from a scratchpad clone with mocked `/api/owner/*` routes only.

Cost: none. This is client logic only, with no new requests.

---

## Phase 6 — Loading, saving and switching venues safely (R2, R3, R9)

**Model / effort:** Sonnet 5.5, medium effort.
**Goal:** a failed load shows an error with a way to retry, a save can't land on the wrong venue, and switching
venues doesn't silently throw away edits.
**Out of scope:** leaving the page with unsaved edits (Back, closing the tab). This phase doesn't add a
`beforeunload` prompt; note it as a possible follow-up. Server routes are unchanged.

1. **R3, venue list load (`loadVenues`).**
   - Add a `catch`, and treat `!res.ok || !json.ok` as a failure. Read the JSON with `.catch(() => ({}))` so a
     non-JSON 500 page doesn't throw.
   - On failure, set a new `venuesError` state, leave `venues` empty, and show `COPY.venuesLoadFailed`
     ("Couldn't load your venues.") with one **Try again** button. The button bumps a `venuesReloadKey` state that
     the effect depends on. "No venue found for this account." shows only after a load that **succeeded** and
     returned an empty list.
   - No automatic retry or polling (CLAUDE.md cost rule). A retry happens only when the partner taps.
   - Keep the 401 → `ownerAuthRecoveryPath` branch first, as it is now.
2. **R2, save racing a venue switch.**
   - Pass `disabled={saving}` to the venue `Dropdown` (it already supports `disabled`, see
     `components/ui/Dropdown.tsx:10`).
   - Also guard in code, because a disabled control isn't a guarantee: keep `selectedVenueIdRef` (a `useRef`
     updated whenever `selectedVenueId` changes). In `handleSave`, capture `const venueId = selectedVenueId`
     before the `fetch`. After the response, if `selectedVenueIdRef.current !== venueId`, drop the reply: no
     `applySaved` and no message. The save still happened on the server for venue A, which is correct.
   - The GET effect already uses a `cancelled` flag; leave it as it is.
3. **R9, unsaved edits on a venue switch.** Replace `onChange={setSelectedVenueId}` with `handleVenueChange`:
   if the venue is the same, do nothing. If `changed` is true and
   `!window.confirm(COPY.discardChanges)`, keep the current venue (the Dropdown is controlled, so it stays). Then
   `setSelectedVenueId(next)`. Copy: `discardChanges: "Discard your unsaved location changes?"`. There is
   precedent for `window.confirm` in `/owner` at `app/owner/billing/setup/page.tsx:165`.
4. New copy keys go in `VENUE_LOCATION_COPY` (`lib/venueLocationRules.ts`). The page keeps no inline strings.

**Tests:** extend `tests/owner-venue-location-page-contract.test.ts`: `loadVenues` checks `res.ok`, the Dropdown
gets `disabled={saving}`, `handleSave` compares `selectedVenueIdRef.current`, and the Dropdown's `onChange` is
`handleVenueChange` and calls `window.confirm`. Add a render test if Phase 5 set one up.

**Checks:** tsc, lint, test. Add to checklist N: "With two venues, drag venue A's pin, then pick venue B: a
'Discard…' prompt appears. Cancel keeps A and its edit." Run a mocked-route browser check of a 500 from
`/api/owner/venues`: the error shows, and Try again recovers.

Cost: none in normal use. A failed load adds one request per tap of Try again.

---

## Phase 7 — Pin check shared with the server, and honest "Saved" copy (R4, R8)

**Model / effort:** Sonnet 5.5, low effort.
**Goal:** the page decides "this venue has no usable pin" with the same rule the server uses, and the saved
message tells partners about the 5-minute delay.
**Out of scope:** fixing the 3 venues at (0,0). That's admin/support work, and the page keeps telling those
partners to email support.

1. **R4, `lib/venueLocationRules.ts`.** Export the private `isUsablePin` as
   `isUsableVenuePin(latitude: number | null, longitude: number | null): boolean`. It returns false when either
   value is null, then runs `isValidGeofenceCoordinates` and `!isPlaceholderVenueRow` as it does now.
   `validateOwnerVenueLocation` calls it, so the server keeps one rule. The file is already pure and has no
   `server-only` (`lib/venueClaim.ts` is pure too), so the client can import it.
2. **Page:** `hasUsablePin = saved !== null && isUsableVenuePin(saved.latitude, saved.longitude)`. A (0,0) or
   out-of-range pin now shows `COPY.noSavedPin` (email support) instead of a map centered in the Atlantic.
3. **R8, saved copy.** Plan Phase 2 said the page must state the 5-minute venue-list cache (`lib/venues.ts`,
   `VENUE_CACHE_TTL_MS = 5 * 60 * 1000`). Change `VENUE_LOCATION_COPY.saved` to:
   "Saved. New players see it now; anyone already on the venue list, within 5 minutes."
   If `VENUE_CACHE_TTL_MS` ever changes, this copy must change too. Put a comment next to `saved` that names the
   constant.

**Tests:** add rules unit tests for `isUsableVenuePin`: null, (0,0), lat 91 and NaN are false; a real pin is
true. All existing `validateOwnerVenueLocation` tests must still pass unchanged. In the page contract test,
check that the page imports `isUsableVenuePin` and contains no hand-rolled `saved.latitude !== null` pin check.

**Checks:** tsc, lint, test. Add to checklist N: "A venue at 0,0 (ask Andrew which test venue) shows the 'email
support' message, not a map."

Cost: none.

---

## Phase 8 — Re-review + release prep (takes over Phase 4's remaining items)

**Model / effort:** Opus 5.5, medium effort.
**Goal:** run `/code-review high` again on the branch diff (Phases 1–7), fix anything real, then finish
Phase 4's release prep against the fixed code:
- One short CLAUDE.md bullet: the owner location route, the rules file, and the D6/D7 traps. Mention that the
  radius changes only via `GeofenceEditor`'s `onRadiusChange`.
- The release note for Andrew: the phone checks (checklist section N, including the new Phase 5–7 lines), and the
  fact that no env var or migration is needed.
- Same freeze as Phase 4: don't push `main`, deploy, or touch Production env until Andrew confirms App Store
  approval.

---

## Open questions for Andrew (none block Phase 1)

1. **Radius range (D4).** As chosen, the dial doesn't change who can play. If you later want it to: set
   `SIGNUP_RADIUS_MIN = 300` and `SIGNUP_RADIUS_MAX = 800` (signup and this page both follow).
2. **Pin move cap (D6).** Is 1 km right? Raise it if partners at large sites (stadiums, fairgrounds) need it.
3. **Page vs menu placement (D5).** Venue Location as its own menu row after Game Settings. Say so if you'd
   rather have it inside Game Settings.
