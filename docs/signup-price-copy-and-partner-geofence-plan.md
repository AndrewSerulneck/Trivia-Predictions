# Signup price copy + partner-adjustable geofence — plan

**Status (2026-11-03):** Phases 1–2 done and committed on `after-app-review`; latest handoff `docs/signup-price-copy-and-partner-geofence-plan_PHASE_2_HANDOFF.md`. Next: Phase 3.
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

---

## Open questions for Andrew (none block Phase 1)

1. **Radius range (D4).** As chosen, the dial doesn't change who can play. If you later want it to: set
   `SIGNUP_RADIUS_MIN = 300` and `SIGNUP_RADIUS_MAX = 800` (signup and this page both follow).
2. **Pin move cap (D6).** Is 1 km right? Raise it if partners at large sites (stadiums, fairgrounds) need it.
3. **Page vs menu placement (D5).** Venue Location as its own menu row after Game Settings. Say so if you'd
   rather have it inside Game Settings.
