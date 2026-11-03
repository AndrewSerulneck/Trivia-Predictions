# Signup price copy + partner geofence — Phase 2 handoff (2026-11-03)

## For Andrew (plain English)

The server side of "partners can fix their own geofence" is built. Two new behind-the-scenes addresses
now exist: one reads a venue's pin and radius, the other saves them. A third hands the partner's page the
Google Maps key. There is **no screen yet**; partners can't see or use any of this until Phase 3 adds the
"Venue Location" page. The safety rules you approved are enforced on the server:

- A partner can only touch their own venue.
- The pin can move at most 1 km per save (D6). A bigger move gets "email support".
- Saving only the pin never shrinks a radius an admin set above 200 m (D7). A *changed* radius must be 50–200 m.
- Only the pin and radius are saved. Name, address and the Google Place id are never touched.

Committed on `after-app-review` (not `main`, not deployed). No migration, no env var, no cost change.
Nothing needs you before Phase 3.

## For the next agent (Phase 3)

### 1. Goal and scope
Phase 3 = the `/owner/venue-location` page + "Venue Location" menu row, exactly as the plan's Phase 3
section says (`docs/signup-price-copy-and-partner-geofence-plan.md`). Out of scope: new map components,
admin screens, signup's `GeofenceStep`, any "test my location" tool, and any change to the Phase 2 routes
unless you find a bug.

### 2. Starting state
- Branch `after-app-review`. Phase 1 + Phase 2 are committed there (see `git log -3`); nothing pushed to
  `main`, nothing deployed, no `supabase db push`, no env change. The same push also carries the earlier
  CLAUDE.md slim-down (feature rules moved into each plan doc's "Standing rules" section), as a separate commit.
- No data was changed. Phase 2 tests use mocks only; no request was made against the shared production DB.
- `main` stays frozen until Andrew confirms App Store approval (CLAUDE.md branch rule).

### 3. Decisions already made (don't re-ask)
D1–D7 in the plan. Phase 2 added:
- **`/api/owner/maps-key` uses `publicBrowserGoogleMapsKey()` (no fallback to the server key), 503 when
  unset.** It is owner-authenticated, but any self-serve signup becomes a partner, so it is treated like the
  public route. It is **not** flag-gated, so admin-activated partners get the map with
  `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` off. Ops consequence: if `GOOGLE_MAPS_BROWSER_KEY` is unset in an
  environment, the Venue Location map won't load there (logs `[OwnerMapsKey] browser-key-unset`).
- **`place_id` is left alone on a partner save.** `grep -rn place_id lib app` shows it is read and written only
  by `lib/admin.ts` (admin venue create/update and display). `findNearbyVenue` / `lib/venueClaim.ts` dedupe on
  distance, not `place_id`. Signup passes `placeId` as advisory only. A ≤1 km pin nudge keeps the same
  business, so a stale-but-still-correct `place_id` is harmless, and clearing it would lose admin data.

### 4. Files
- **`lib/venueLocationRules.ts`** (new, pure, client-safe; imports only `lib/geofence`, `lib/selfServeSignup`,
  `lib/venueClaim`, which are all pure):
  - `OWNER_PIN_MOVE_MAX_METERS = 1000`.
  - `validateOwnerVenueLocation({ saved: {latitude, longitude, radius} (nullable), next })` →
    `{ ok: true, movedMeters }` or `{ ok: false, code, message }`. The codes are `invalid_coordinates`,
    `placeholder_pin`, `no_saved_pin`, `moved_too_far`, `invalid_radius` and `radius_out_of_range`. The check
    order is: next coords valid → next not (0,0) → saved pin usable → distance ≤ cap → radius integer →
    radius unchanged OR within `SIGNUP_RADIUS_MIN..MAX`.
  - `VENUE_LOCATION_COPY`: all partner-facing words, including `saved` ("Saved. New players can join from the
    new spot right away.") and `helper` ("Players can't join? Stand inside your venue and tap Use my current
    location."). Phase 3 must take its copy from here, adding any new strings to this object.
- **`app/api/owner/venues/location/route.ts`** (new):
  - `GET ?venueId=` → `{ ok: true, venue: { id, name, latitude, longitude, radius } }`. Numbers or `null`;
    `decimal` columns are coerced from strings.
  - `PATCH { venueId, latitude, longitude, radius }` (all three must be JSON numbers, else 400) → one select,
    then the rules, then one `update({ latitude, longitude, radius })`. Success →
    `{ ok: true, venue: {...} }`; refusal → **400 `{ ok: false, code, error }`**, where `error` is the
    partner-facing message the page should show as-is. 403 for another owner's venue (before any DB call),
    401 from `requireOwnerAuth` (body carries `code`, use `ownerAuthRecoveryPath`), 404 unknown venue,
    generic 500 on DB error. All responses are `Cache-Control: no-store`.
  - The audit log line is `[OwnerVenueLocation] updated venue=<id> moved_m=<n> radius=<old>-><new>`.
- **`app/api/owner/maps-key/route.ts`** (new): `{ ok: true, apiKey }` or 401/503.
- **`tests/lib.venueLocationRules.test.ts`** (new, 8 tests), **`tests/api.owner.venues-location.test.ts`**
  (new, 13 tests, covering every case listed in the plan plus the maps-key route).
- **`tests/self-serve-signup-contract.test.ts`** (changed): the Maps key split now covers three routes. The
  owner route must call `publicBrowserGoogleMapsKey()` and never `browserGoogleMapsKey()` or
  `serverGoogleMapsKey`, and the allowed callers of `publicBrowserGoogleMapsKey()` are exactly the signup and
  owner maps-key routes.

### 5. Facts and traps
- **D7 trap for Phase 3 (still open):** the page must send the **stored** radius unless the partner actually
  moved the dial. If `GeofenceEditor`/`RadiusDial` clamps 600 → 200 on mount and fires `onChange`, the server
  will accept 200 (it is in range) and the radius silently shrinks. The server cannot tell this apart from a
  real choice, so the page has to guard it.
- **Pin precision:** `venues.latitude` is `decimal(10,8)`. A value round-trips at 8 decimals, so the page's
  "changed?" check should compare with a tolerance, or compare what GET returned against the editor value.
- **A pin-only nudge always passes the radius rule** (unchanged radius) and the move cap is measured from the
  **saved** pin, not the previous save in the session. Several saves can therefore walk the pin further than
  1 km. That is accepted: each save is logged.
- `"error" in x` narrowing fails on `as const` object-literal unions (TS normalises them); use a
  discriminant like `found`. That is why `loadVenue` returns `found: true/false`.
- The 4 failing tests in `npm run test` are the pre-existing, date-based MLB/NFL star-index staleness tripwires
  (`tests/lib.sportsBingo.{mlb,nfl}-star-index*.test.ts`). They are unrelated; refreshing them calls paid
  external APIs, so leave them.

### 6. Build / test / verification
- `npx tsc --noEmit` clean; `npx eslint` on all changed files clean; `npm run test` = 6,103 pass / 13 skip /
  4 fail (the tripwires above).
- **Not verified:** nothing was exercised against a real server or DB (mocked unit tests only). `npm run build`
  was not run in Phase 2; Phase 3 runs it.
- Phase 3 browser checks: use a scratchpad clone with **mocked** `/api/owner/venues/location` and
  `/api/owner/maps-key`, with no `.env.local`. Never PATCH a real venue from a dev server (dev and prod share
  one DB).

### 7. Open questions for Andrew
Same as the plan's list (radius range, 1 km cap, page placement). None block Phase 3.

### 8. Recommended first steps (Phase 3: Sonnet 5.5, medium)
1. Read `components/admin/GeofenceEditor.tsx` + its `RadiusDial`/`clampRadius` path with a starting radius of
   600 and `max=200`. Settle the D7 guard first.
2. Copy the shell of `app/owner/game-settings/page.tsx`; fetch GET + maps key; mount the editor as the plan
   says; on Save, PATCH and show `error` from a 400 verbatim.
3. Add the menu row + update `tests/owner-menu-contract.test.ts`, then add checklist section K.
