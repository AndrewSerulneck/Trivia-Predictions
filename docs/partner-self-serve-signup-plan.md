# Partner Self-Serve Signup — Plan

**Goal:** anyone who taps "Create Owner Account" can become a paying subscriber
without an admin pre-activating their venue. One full-screen, mobile-first
question flow: name → email → password → address → map pin + radius → Stripe.

**Ends:** the admin-must-activate-the-venue-first prerequisite. Admin
Activate-a-Venue (`components/admin/mobile/ActivateVenueFlow.tsx`) **stays** —
ops still needs it for offline-billed venues and support fixes. It stops being a
*prerequisite*, it does not get deleted.

---

## 0. Decisions (locked 2026-09-07)

| Question | Decision |
| --- | --- |
| Venue name | Auto-filled from the Google Places business prediction, editable on the address screen. No extra step. Same rule as `businessNameFromPrediction` in `ActivateVenueFlow.tsx`. |
| Venue visibility | Rows are created **before** Checkout (Checkout needs a `venueId`) with `venues.hidden = true`. The Stripe webhook flips it false on first activation. `lib/venues.ts:137,150` already filters on it. |
| Duplicate venues | Proximity check after the pin step. Unowned match → "Is this your venue?" claim path. Owned match → sign-in / support. Never silently create a second row for one bar. |
| Country | US-only. Country renders as a locked "United States" line, `DEFAULT_VENUE_COUNTRY` unchanged. |
| Radius | 50–200 m for self-serve only. Admin keeps 25–2000 m. |
| Email verification | None pre-payment. A completed Stripe payment is the real gate; `email_confirm: true` stays. |

## 1. What already exists (do not rebuild)

- **Map + drag pin + live circle** — `components/admin/VenueMapPicker.tsx` (Google Maps JS).
- **Radius dial** — `components/admin/RadiusDial.tsx`, log-scale math in `lib/geofenceEditor.ts`.
- **Both composed** — `components/admin/GeofenceEditor.tsx`.
- **Places autocomplete + session-token billing** — `components/admin/useAddressLookup.ts`.
- **Venue form shape / payload / validation** — `lib/adminVenueForm.ts`, server gate `createAdminVenue` in `lib/admin.ts:1945`.
- **Stripe Checkout** — `POST /api/owner/billing/checkout` (double-bill guards, abandoned-incomplete sweep, promo codes).
- **Welcome email** — fires automatically on first subscription activation, `maybeSendWelcomeEmail` in `app/api/webhooks/stripe/route.ts:493`. Idempotent via `welcome_email_sent_at`. **Step (f) is already done.**
- **Owner session** — `lib/ownerSession.ts` / `requireOwnerAuth`.
- **Navigation primitives** — `ExitBackButton`, `WizardFooter`. The wizard MUST use these (`tests/navigation-controls-contract.test.ts`).

## 2. The gap

Every map/Places route above is behind `requireAdminAuth`
(`app/api/admin/maps-key`, `app/api/admin/places`). A signed-out stranger can
reach none of it. And `/owner/register` today only *looks up* a venue that an
admin already created; it cannot create one.

---

## 3. Flow

```
/owner/signup   (full-bleed, one question per screen, no OwnerShell card)

 1  Your name
 2  Your email
 3  Create a password
 4  Where is your venue?      Places search → street / city / state / ZIP
                              + venue name (auto-filled, editable)
                              + "United States" (locked)
                              manual-entry escape hatch
 5  Set your geofence         map, drag pin, radius dial 50–200 m
                              → duplicate check on continue
 6  Review                    compact confirm card, then "Start subscription"
 ─  Stripe Checkout           hosted, out-of-app
 ─  return → /owner/billing?success=subscribed
              webhook: unhide venue + welcome email → /owner/dashboard
```

Nothing is written to the database until step 6 is submitted. Steps 1–5 live in
client state only.

---

## 4. Phases

### Phase 0 — Foundations
**Model: Sonnet 5 · Effort: Low**

- Flag `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED`, single reader
  `isSelfServeSignupEnabled()` in a new `lib/selfServeSignup.ts`. Off = today's
  `/owner/register` venue-lookup flow, fully inert. Same reversible convention as
  `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED`.
- Migration (new timestamped file; never edit existing ones):
  - `venues.self_serve_created_at timestamptz null` — marks a row the abandoned
    sweep in Phase 6 is allowed to delete. Without it the sweep could reap a
    hidden venue an admin created on purpose (e.g. the Category Blitz global room).
  - `signup_attempts (id, ip_hash text, created_at timestamptz)` + index on
    `(ip_hash, created_at)` — backs the rate limiter.
- Shared types in `lib/selfServeSignup.ts`: `SignupDraft` (the client-held
  answers), `SignupStep`, `SIGNUP_RADIUS_MIN = 50`, `SIGNUP_RADIUS_MAX = 200`.

**Verify:** `npx tsc --noEmit`, migration applies.

#### Phase 0 — As-built (2026-09-07, Sonnet 5)

**Shipped, all three deliverables:**

1. **Flag + reader.** `lib/selfServeSignup.ts` created. `isSelfServeSignupEnabled()`
   reads `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` via the same `truthy()` helper
   `lib/domainSplit.ts` uses (`1|true|yes|on`). It is the **single reader** — Phase 1/5/7
   must call it, never re-read the env var. Module is edge/browser-safe (no
   `server-only`, no Node built-ins). Flag is **not yet added to any `.env`** — it is
   absent, so `isSelfServeSignupEnabled()` returns `false` and nothing engages. Andrew
   adds the env var per the Phase 7 runbook.

2. **Migration.** `supabase/migrations/20260907130000_partner_self_serve_signup_foundations.sql`.
   - `venues.self_serve_created_at timestamptz` (nullable, no default) — `ADD COLUMN IF NOT EXISTS`.
   - `signup_attempts (id uuid pk, ip_hash text not null, created_at timestamptz not null default now())`
     + `idx_signup_attempts_ip_hash_created_at ON (ip_hash, created_at)`.
   - `signup_attempts` follows `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`: RLS
     `ENABLE` + `FORCE`, `REVOKE ALL … FROM anon, authenticated`, one
     `FOR ALL TO service_role` policy. No FK (rate-limiter ledger, server-only).
   - **NOT applied to any database from this session** — no Supabase CLI or db script
     in the repo (`package.json` has none; `supabase` binary not installed). Andrew /
     next phase must run it against the Supabase project before Phase 1 code is
     exercised. `npx tsc --noEmit` passes; SQL is standard and mirrors
     `20260727120100_nfl_pickem_tiebreakers.sql`'s conventions.
     - **RESOLVED 2026-09-07, after Phase 3:** Andrew ran `supabase db push`
       ("Applying migration 20260907130000_… / Finished supabase db push").
       `venues.self_serve_created_at` and `signup_attempts` now exist. Every
       "run the migration first" warning below this point is historical — do
       not act on one.

3. **Shared types/constants** in `lib/selfServeSignup.ts`:
   - `SIGNUP_RADIUS_MIN = 50`, `SIGNUP_RADIUS_MAX = 200` (plan-mandated names/values),
     plus `SIGNUP_RADIUS_DEFAULT = 150`.
   - `SIGNUP_RADIUS_PRESETS` (50/100/150/200 with the plan's Phase-2 copy) — added
     now so Phase 2 just wires `RadiusDial`'s new `presets` prop to it. Typed as
     `ReadonlyArray<RadiusPreset>`, importing `RadiusPreset` from `lib/geofenceEditor.ts`.
   - `SIGNUP_STEPS` (`readonly` tuple: name, email, password, address, geofence, review)
     and `SignupStep = (typeof SIGNUP_STEPS)[number]`.
   - `SignupDraft` — client-held answers. Fields: `name`, `email`, `password`,
     `venueName`, `street`, `city`, `state`, `zipCode`, `placeId`,
     `latitude: number | null`, `longitude: number | null`, `radius: number`.
     No `country` field (locked to `DEFAULT_VENUE_COUNTRY`, rendered not collected).
     `BLANK_SIGNUP_DRAFT` exported alongside.

**Handoff notes for Phase 1 (Opus 5 — public map + Places, rate limited):**

- ~~**Run the migration first** (see above) — `lib/rateLimit.ts` reads/writes
  `signup_attempts` and it does not exist in any DB yet.~~ *Applied 2026-09-07.*
- `lib/rateLimit.ts`: hash IP with `crypto` (Node) SHA-256, salt = `SESSION_SECRET`.
  This file **is** server-only (unlike `lib/selfServeSignup.ts`) — add `import "server-only"`.
  Sliding window = `SELECT count(*) FROM signup_attempts WHERE ip_hash = $1 AND created_at > now() - $window`,
  then insert the attempt. Use `lib/supabaseAdmin.ts` (service role) — RLS blocks anon.
- The flag gate on every `/api/signup/*` route: `if (!isSelfServeSignupEnabled()) return 404`
  — import `isSelfServeSignupEnabled` from `lib/selfServeSignup.ts`, do not re-read the env.
- Mirror `app/api/admin/maps-key/route.ts` and `app/api/admin/places/route.ts` for the
  new `/api/signup/maps-key` and `/api/signup/places` — swap `requireAdminAuth` for
  `isSelfServeSignupEnabled()` + `rateLimit()`.
- `useAddressLookup` refactor: the plan wants an **endpoint parameter**, not a fork.
  Current file is `components/admin/useAddressLookup.ts` (note: plan §1 mislabels its
  path — it's under `components/admin/`). Phase 1 adds
  `components/signup/useSignupAddressLookup.ts` as the thin wrapper.
- **Ops prerequisite** (record on `docs/self-serve-signup-runbook.md`, which Phase 7
  creates — until then note it in this doc): `GOOGLE_MAPS_API_KEY` needs an
  HTTP-referrer restriction for `hightopchallenge.com` before the flag flips.
- No `.env` changes were made in Phase 0; `SESSION_SECRET` already exists for the
  session-cookie feature (`lib/serverSession.ts`).

---

### Phase 1 — Public map + Places surface, rate limited
**Model: Opus 5 · Effort: Medium-High** *(security boundary + it costs money per call)*

This is the phase to get right. Every route here is reachable by an
unauthenticated stranger and every call bills Google.

- `lib/rateLimit.ts` — Supabase-table-backed sliding window over
  `signup_attempts`, keyed on a **hashed** IP (`x-forwarded-for` → SHA-256 with
  `SESSION_SECRET` as salt; never store a raw IP). No in-memory limiter —
  serverless instances don't share state. Returns `{ allowed, retryAfterSeconds }`.
- `GET /api/signup/maps-key` — mirrors `app/api/admin/maps-key/route.ts` but
  gated on the flag + rate limiter instead of `requireAdminAuth`.
  **Ops prerequisite, not code:** `GOOGLE_MAPS_API_KEY` must have an HTTP-referrer
  restriction for `hightopchallenge.com` before this ships, or the key is
  scrapeable off a public page. Record it on the runbook.
- `POST /api/signup/places` — autocomplete + details, same shape as
  `app/api/admin/places/route.ts`. Rate limited harder than maps-key (Places
  Autocomplete is billed per session, Details per call).
- `components/signup/useSignupAddressLookup.ts` — thin wrapper that points
  `useAddressLookup`'s fetch at `/api/signup/places`. **Refactor
  `useAddressLookup` to take an endpoint parameter rather than forking it** —
  one implementation, one billing-session accounting.

**Verify:** `npm run test`, plus new `tests/api.signup.rate-limit.test.ts`
(window boundary, hash stability, flag-off returns 404).

#### Phase 1 — As-built (2026-09-07, Opus 5)

**Shipped.** `npx tsc --noEmit`, `npm run lint`, `npm run build` and `npm run test`
(2016 passed / 219 files, nothing newly skipped) all clean. New
`tests/api.signup.rate-limit.test.ts` — 12 tests, all passing.

**Still inert:** `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` remains absent from every
`.env`, so both new routes 404 in every environment. Nothing shipped here is
reachable yet.

##### 1. `lib/rateLimit.ts` (new, `import "server-only"`)

- `deriveRequesterIp(request)` — left-most `x-forwarded-for` hop, else
  `x-real-ip`, else `""`. Copies `app/api/auth/username/update/route.ts`'s helper
  rather than inventing a second convention. **An empty IP collapses every
  unidentifiable caller into one shared bucket** — that is deliberate: it fails in
  the more-limiting direction.
- `hashRequesterIp(bucket, ip)` — `SHA-256(bucket + ":" + ip + ":" + SESSION_SECRET)`,
  hex. **Deviation worth knowing: the bucket name is folded into the hash**, so
  one `ip_hash` column carries independent per-route windows with no extra column
  and no second migration. Consequence: you cannot recover "all attempts by this
  IP" across buckets, and you must never compare hashes across buckets. With no
  `SESSION_SECRET` (local dev) it falls back to a fixed literal — the salt exists
  to stop IP recovery from a DB dump, which local dev does not need.
- `SIGNUP_RATE_LIMITS` — the per-bucket quotas, `as const satisfies Record<string, RateLimitRule>`:
  `mapsKey` 10/60s, `placesPredict` 20/60s, `placesDetails` 10/60s, and
  **`signupSubmit` 5/3600s, pre-declared for Phase 5** so that phase adds no new
  constant. A partner filling the wizard once spends ~1 maps-key, ~4–8 predicts,
  1–2 details.
- `rateLimit(request, bucket)` — **one** Supabase round trip: the oldest `max`
  attempts for this hash inside the window
  (`.select("created_at").eq(ip_hash).gte(created_at, since).order(asc).limit(max)`).
  Full result ⇒ denied, and row 0 is the attempt whose expiry frees the next slot,
  which is where `retryAfterSeconds` comes from. Under quota ⇒ insert this attempt,
  allow.
- **Two decisions to not silently reverse:**
  - **Fails CLOSED.** Supabase unconfigured, table missing, or query/insert error ⇒
    `{ allowed: false, unavailable: true }` and a 503. A public route that spends
    money per request must not degrade into an open one. The missing-table branch
    logs `[SignupRateLimit] signup_attempts-missing` naming the migration file, so
    "flag flipped before migration applied" is a loud, obvious failure rather than
    a silent open door.
  - **Denied calls are NOT recorded.** One row == one Google-billed call. Recording
    denials would let a hammering client inflate our own DB as a side effect of
    being blocked.
- `rateLimitResponse(result)` — the single 429/503 shape every `/api/signup/*`
  route returns (`{ ok: false, error }` + `Retry-After` + `Cache-Control: no-store`).
  Use it in Phase 5; do not hand-roll a second shape.
- `pruneSignupAttempts(olderThanSeconds = 24h)` — exported but **called by nothing
  yet**. The limiter never prunes inline (an un-awaited delete is unreliable in
  serverless). **Phase 6: call this from the `/api/cron/signup-sweep` cron** —
  `signup_attempts` otherwise grows unbounded.

##### 2. Routes

- **`GET /api/signup/maps-key`** — flag check → `rateLimit(request, "mapsKey")` →
  the key. Payload identical to the admin route. `Cache-Control: no-store`.
- **`POST /api/signup/places`** — flag check → body discriminates:
  `{ placeId, sessionToken }` → `placesDetails` bucket → `getAddressDetails`;
  `{ query, sessionToken }` → `placesPredict` bucket → `getAddressPredictions`.
  Query and placeId are length-capped (200 / 512) before anything else.

  **Deviation from the plan text — read this.** §4 Phase 1 says to mirror
  `app/api/admin/places/route.ts`. That route is *not* what the autocomplete UI
  uses: `useAddressLookup` calls **`/api/geolocation/predict`** and
  **`/api/geolocation/details`**, which return a different (structured
  `AddressPrediction` / `AddressDetails`) shape. `/api/admin/places` serves an
  older flat-`Suggestion` shape that no wizard code path consumes. So
  `/api/signup/places` mirrors the **geolocation** pair, and does both halves in
  one route so the hook can point both fetches at a single endpoint and one Places
  session token spans the whole lookup. `/api/admin/places` was left untouched.

  One behavior to preserve: **a query shorter than 3 chars returns
  `{ ok: true, predictions: [] }` before the limiter runs.** It never reaches
  Google, so it must not burn a slot. Phase 8's "every `/api/signup/*` route calls
  the rate limiter" tripwire must be written to tolerate that conditional call —
  the route does call `rateLimit`, just not on the free path.

##### 3. `useAddressLookup` endpoint parameter (not a fork)

`components/admin/useAddressLookup.ts` now takes
`endpoints: AddressLookupEndpoints = ADMIN_ADDRESS_LOOKUP_ENDPOINTS` — a
module-level constant, so the default argument keeps a stable identity across
renders (`predictEndpoint` / `detailsEndpoint` are `useCallback` deps). The two
admin callers (`ActivateVenueFlow`, `VenuesSection`) pass nothing and are
byte-for-byte unchanged in behavior; `tests/admin-mobile.address-lookup-sequencing.test.ts`
still passes untouched.

`components/signup/useSignupAddressLookup.ts` is the thin wrapper —
`useSignupAddressLookup()` = `useAddressLookup(SIGNUP_ADDRESS_LOOKUP_ENDPOINTS)`,
both endpoints `/api/signup/places`. Identical return surface. **Phase 4's address
step should import this, never `useAddressLookup` directly, and never fork it.**

##### 4. Extra, beyond the plan's letter: `mapsKeyEndpoint`

The plan's Phase 1 says "public map" but only specified the *route*. `VenueMapPicker`
hardcoded `fetch("/api/admin/maps-key")`, which would have left Phase 4 unable to
render a map for a signed-out stranger. So the same parameterise-don't-fork
treatment was applied:

- `VenueMapPicker` takes `mapsKeyEndpoint?: string`, defaulting to the exported
  `ADMIN_MAPS_KEY_ENDPOINT` (`/api/admin/maps-key`). It is in the key-fetch
  effect's dep array.
- `GeofenceEditor` takes `mapsKeyEndpoint?: string` and passes it straight through.

**Phase 4 must pass `mapsKeyEndpoint="/api/signup/maps-key"` on its
`GeofenceEditor`** or the public map will 401 against the admin route. Every
existing admin caller omits the prop and is unchanged.

---

**Handoff notes for Phase 2 (Sonnet 5 — bounded radius):**

- Phase 2's work is confined to `lib/geofenceEditor.ts`, `components/admin/RadiusDial.tsx`
  and `components/admin/GeofenceEditor.tsx`. Phase 1 already touched
  `GeofenceEditorProps` (added `mapsKeyEndpoint`) — your `min`/`max`/`presets` props
  are purely additive alongside it; there is no conflict, just don't drop the prop
  while editing the type.
- `SIGNUP_RADIUS_PRESETS` is already written in `lib/selfServeSignup.ts` (Phase 0),
  typed as `ReadonlyArray<RadiusPreset>`. Wire `RadiusDial`'s new `presets` prop to
  it; do not redefine the values.
- The acceptance test the plan names — callers passing nothing behave
  bit-identically — is the whole point of the phase. Same discipline Phase 1 used
  for the two default parameters above.

**Handoff notes for Phase 3/4 (Opus 5 — shell, motion, six screens):**

1. **Migration: DONE.** Andrew applied
   `supabase/migrations/20260907130000_partner_self_serve_signup_foundations.sql`
   via `supabase db push` on 2026-09-07, after Phase 3. `signup_attempts` and
   `venues.self_serve_created_at` exist, so `rateLimit` now behaves normally —
   a hammered route returns **429**, not the fail-closed **503**. Ignore every
   "run the migration first" line elsewhere in this doc; they predate this.
   (If you *do* see a 503 plus `[SignupRateLimit] signup_attempts-missing` in the
   server log, you are pointed at a different Supabase project, not a missing
   migration.)
2. **To exercise the flow locally:** set `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED=1`
   in `.env.local` (Andrew must do this — the agent must never touch `.env.local`)
   and confirm `GOOGLE_MAPS_API_KEY` is set. Flag off = both routes 404, which is
   a correct 404 and not a bug.
3. **Wiring, exactly:** address step → `useSignupAddressLookup()` from
   `@/components/signup/useSignupAddressLookup`. Geofence step → `GeofenceEditor`
   with `mapsKeyEndpoint="/api/signup/maps-key"` (plus Phase 2's `min={50} max={200}`
   and `presets={SIGNUP_RADIUS_PRESETS}`, and `hideAdvanced`).
4. **Handle 429/503 in the UI.** Both routes return `{ ok: false, error }` with a
   `Retry-After` header. `useAddressLookup` surfaces `payload.error` as its `error`
   string already, so the address field shows a usable message with no extra work —
   but the map's own key fetch only sets a generic "Maps key unavailable", so the
   geofence step should not treat a failed map load as fatal to the flow.
5. Draft `sessionStorage` persistence (plan §4 Phase 4) must exclude `password` —
   `SignupDraft` in `lib/selfServeSignup.ts` includes it, so strip that key
   explicitly on write rather than persisting the object wholesale.

**Handoff notes for Phase 5 (`POST /api/owner/signup`):**

- Use `rateLimit(request, "signupSubmit")` — the bucket and its 5/hour window are
  already defined. Return `rateLimitResponse(limit)` verbatim; do not invent a
  second 429 shape.
- Remember `rateLimit` fails closed: a Supabase outage makes signup submit return
  503. That is intended, but the client copy should say "try again in a moment",
  not "you're going too fast".

**Handoff notes for Phase 6:**

- Call `pruneSignupAttempts()` from `/api/cron/signup-sweep`. Nothing prunes
  `signup_attempts` today.

**Handoff notes for Phase 7 (runbook) — ops prerequisites to record:**

1. **`GOOGLE_MAPS_API_KEY` must carry an HTTP-referrer restriction for
   `hightopchallenge.com` (and `play.hightopchallenge.com` after the domain split)
   before the flag is flipped.** `/api/signup/maps-key` hands the key to any
   unauthenticated caller by design — the restriction is the only thing that makes
   that safe, and it is an ops step outside this repo. This is Risk #1 in §6.
   Note that the *same* key is already handed to admins by `/api/admin/maps-key`,
   so adding the referrer restriction must be verified against the admin venue form
   too, not just signup.
2. ~~**Apply the Phase 0 migration** before setting the flag, in that order.~~
   *Applied to the Supabase project 2026-09-07 (`supabase db push`). The runbook
   should still record migration-before-flag as the ORDER for any future
   environment, but there is nothing outstanding here today.*
3. Flag-on order: migration → referrer restriction confirmed → env var → deploy.
   Reversal is removing/zeroing `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED`, which
   404s both routes again.
4. Smoke test for the runbook: with the flag on and signed out,
   `curl -i https://<host>/api/signup/maps-key` returns 200 once and 429 with a
   `Retry-After` after 10 calls in a minute; with the flag off it returns 404.

**Handoff notes for Phase 8 (contract tripwires) — what Phase 1 guarantees:**

- No `/api/signup/*` route imports `requireAdminAuth` (assert it).
- Every `/api/signup/*` route imports `isSelfServeSignupEnabled` and `rateLimit`.
  Assert the *import*, not a naive "calls rateLimit unconditionally" — the places
  route's sub-3-character early return deliberately precedes the limiter.
- `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` is read in exactly one place,
  `lib/selfServeSignup.ts`.
- No raw IP is ever inserted into `signup_attempts` —
  `tests/api.signup.rate-limit.test.ts` already pins this for maps-key; a static
  assert that `lib/rateLimit.ts` is the only writer of that table would complete it.

---

### Phase 2 — Bounded radius
**Model: Sonnet 5 · Effort: Medium**

`RADIUS_MIN`/`RADIUS_MAX` are module constants baked into the log-scale math,
the presets and the keyboard step. Signup needs 50–200 without touching admin's
25–2000.

- Thread optional `min`/`max` through `dialFractionToRadius`,
  `radiusToDialFraction`, `clampRadius`, `snapRadius`, `radiusKeyStep`,
  defaulting to today's constants. **Callers that pass nothing must behave
  bit-identically** — that is the acceptance test.
- `RadiusDial` and `GeofenceEditor` take `min`/`max` props and pass them down.
- `SIGNUP_RADIUS_PRESETS` in `lib/selfServeSignup.ts`: 50 "Just the building" /
  100 "Bar and patio" / 150 "Standard" / 200 "Patio and parking". `RadiusDial`
  takes a `presets` prop instead of importing `RADIUS_PRESETS` directly.
- Snap grid inside 50–200 should be 10 m, not 25 — 25 m gives only 7 stops
  across the whole range.

**Verify:** `npm run test` + `tests/lib.geofence-editor-bounds.test.ts`
(default-args regression, 50/200 clamping, snap grid, dial fraction round-trip).

#### Phase 2 — As-built (2026-09-07, Sonnet 5)

**Shipped.** `npx tsc --noEmit`, `npm run lint`, and `npm run test`
(2028 passed / 219 files — the 12 new `tests/lib.geofence-editor-bounds.test.ts`
cases plus Phase 1's 2016, nothing newly skipped) all clean.

**Still inert:** no `.env`, route, or `app/` change here. This phase only widened
`lib/geofenceEditor.ts` / `RadiusDial` / `GeofenceEditor` with optional props.
Every existing admin caller passes nothing and is byte-for-byte unchanged in
behavior — `tests/venue-activation.radius-dial.test.ts` and
`tests/venue-activation.geofence-editor.test.ts` pass untouched.

##### 1. `lib/geofenceEditor.ts` — optional `(min, max)` domain

- `dialFractionToRadius`, `radiusToDialFraction`, `clampRadius`, `snapRadius`,
  `radiusKeyStep` each grew trailing `min = RADIUS_MIN, max = RADIUS_MAX`
  parameters. **Passing nothing is bit-identical to before** — pinned by
  `tests/lib.geofence-editor-bounds.test.ts`'s "passing the admin constants
  explicitly matches passing nothing" loop.
- **Snap grid is domain-derived, via a new private `radiusSnapStep(radius, min,
  max)`.** Rule: `max - min <= 400` ⇒ flat **10 m** grid; otherwise the legacy
  `radius < 500 ? 25 : 50`. The 400 m span cutoff is the whole mechanism — I did
  **not** add a `step` param (the plan didn't ask for one, and a derived step
  keeps every call site from having to know the grid). Admin's span is 1975 ⇒
  legacy grid, unchanged. Signup's span is 150 ⇒ 10 m ⇒ 16 stops across 50–200
  instead of the ~7 that 25 m would give.
  - **If a future caller wants a wide custom domain with the fine grid (or vice
    versa), this heuristic breaks and you'll want an explicit `snapStep` prop.**
    Nothing needs it today.
- `radiusDescription` grew an optional `presets` arg (default `RADIUS_PRESETS`)
  so the signup dial's plain-language hint reads off signup's chips, not admin's.

##### 2. `RadiusDial` — `min` / `max` / `presets` props

- All three optional, defaulting to `RADIUS_MIN` / `RADIUS_MAX` / `RADIUS_PRESETS`.
  Threaded into every math call, the `--tp-dial-pct` effect (added `min`/`max` to
  its dep array), `emitFromClientX` (same), the keyboard handler (`Home` → `min`,
  `End` → `max`, PageUp/Down snap within the domain), the `aria-valuemin`/`max`
  attributes and the "25–2000 m" readout label (now `{min}–{max} m`).
- **Presets grid columns are now dynamic:** `presets.length % 3 === 0 ?
  "grid-cols-3" : "grid-cols-2"`. Admin's 3 chips ⇒ `grid-cols-3` (unchanged);
  signup's 4 ⇒ `grid-cols-2` (2×2). Two literal class strings, not an
  interpolated Tailwind class.

##### 3. `GeofenceEditor` — pass-through

- `min` / `max` (default to the `RADIUS_MIN`/`RADIUS_MAX` constants) / `presets`
  (undefined default — `RadiusDial` fills it in). Threaded into the local
  `value = clampRadius(snapRadius(radius, min, max), min, max)` and the `emit`
  callback's `clampRadius(next.radius, min, max)` (added `min`/`max` to its
  `useCallback` deps), then handed to `RadiusDial`. Nothing else in the editor
  needed to change — Phase 1's `mapsKeyEndpoint` prop is untouched and sits
  alongside the new ones.

**Handoff notes for Phase 3/4 (the six screens):**

- Phase 4's geofence step: `<GeofenceEditor mapsKeyEndpoint="/api/signup/maps-key"
  min={SIGNUP_RADIUS_MIN} max={SIGNUP_RADIUS_MAX} presets={SIGNUP_RADIUS_PRESETS}
  hideAdvanced ... />` — import all three signup constants from
  `@/lib/selfServeSignup`. Do **not** pass raw `50`/`200` literals; Phase 8's
  contract test asserts the bounds live only in `lib/selfServeSignup.ts`.
- The draft's `radius` already defaults to `SIGNUP_RADIUS_DEFAULT` (150) via
  `BLANK_SIGNUP_DRAFT`, which is a valid signup preset and mid-domain — the dial
  renders on-grid with no `onChange` on mount.
- `GeofenceEditor` now clamps anything it emits to 50–200, so the draft can never
  hold an out-of-band radius even if `sessionStorage` is tampered with. Phase 5
  still must re-validate server-side regardless (`createAdminVenue` only clamps to
  25–2000) — the plan §4 Phase 5 step 2 already calls this out.
- No visual change to the admin venue forms shipped here; the admin device
  checklist does not need a re-pass for Phase 2.

---

### Phase 3 — The signup shell and its motion system
**Model: Opus 5 · Effort: High** *(this is the phase the request is actually about)*

The "takes over the screen" surface. Build the container and the animation
vocabulary **before** any question content exists, so all six screens inherit one
feel instead of six hand-tuned ones.

- `components/signup/SignupShell.tsx` — full-bleed, `100dvh`, safe-area aware,
  dark canvas (`bg-ht-canvas`), no `OwnerShell` card. Slots: hairline progress
  rail, `ExitBackButton` top-left, one content region, `WizardFooter` pinned
  above the keyboard.
- `components/signup/SignupStepTransition.tsx` — framer-motion (already a
  dependency). One directional slide+fade, ~260 ms, custom cubic-bezier ease,
  direction derived from step delta so Back reverses. `AnimatePresence`
  `mode="wait"`.
- Motion rules, applied everywhere:
  - Content enters staggered ~40 ms per element, never all at once.
  - The progress rail animates its width on every step change.
  - `prefers-reduced-motion` collapses every transition to a plain fade.
  - No spring bounce, no confetti, no mascots. Restrained = official.
- Focus and keyboard: autofocus the single input on each step; `enterkeyhint`
  advances; `inputMode`/`autoComplete` correct per field so iOS fills them.
- One question per screen, one input, one line of helper text maximum. No
  paragraphs.

**Verify:** `npm run test` (navigation contract — the shell must not hand-roll
Back or Next), `npx tsc --noEmit`, `npm run lint`.

**Cannot be verified headless.** Add `docs/self-serve-signup-device-checklist.md`
covering: iOS Safari keyboard overlap, `100dvh` on a notched device, installed-PWA
launch, Android Chrome address-bar collapse, reduced-motion. Only Andrew closes it.

#### Phase 3 — As-built (2026-09-07, Opus 5)

**Shipped.** `npx tsc --noEmit`, `npm run lint`, `npm run build` and `npm run test`
(2036 passed / 220 files — Phase 2's 2028 plus 8 new; the 13 skipped are the
pre-existing `tests/api.nfl-pickem.test.ts` block, nothing newly skipped) all clean.

**Still inert.** No route was created, nothing imports these components yet, and
`NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` is still absent from every `.env`. The one
change outside `components/signup/` is a single entry in `AppShell`'s
`FULLSCREEN_PATHS` for a path that does not resolve until Phase 4 — inert by
definition.

##### 1. `components/signup/signupMotion.ts` — the vocabulary, as data

Every animated number in the flow lives here, in a **React-free, framer-free**
module, so tests can assert the numbers directly instead of scanning JSX:
`SIGNUP_EASE` `[0.22, 0.9, 0.24, 1]`, `SIGNUP_STEP_DURATION` 0.26,
`SIGNUP_REDUCED_DURATION` 0.12, `SIGNUP_STAGGER_DELAY` 0.04,
`SIGNUP_CONTENT_DELAY` 0.06, `SIGNUP_ITEM_RISE` 10, `SIGNUP_STEP_TRAVEL` 28,
`SIGNUP_RAIL_DURATION` 0.34, plus `signupTransition(reduce, duration?)`,
`signupStaggerDelay(reduce)` and `signupProgressFraction(stepIndex, stepCount)`.

**The rule this creates, and the tripwire that enforces it:** no `duration:`,
`ease: [`, `staggerChildren:` or `type: "spring"` literal may appear in any
`components/signup/*.tsx`. That is asserted in
`tests/components.signup-shell-motion.test.ts`. If a Phase 4 screen wants a
different timing, change the token — the whole point of building this before the
content was to stop six screens from being hand-tuned into six different feels.

`signupProgressFraction` deliberately returns `1/6`, not `0`, on step 1: a rail
that starts empty reads as "you have accomplished nothing" the moment the screen
appears.

##### 2. `components/signup/SignupStepTransition.tsx`

`AnimatePresence mode="wait" initial={false}`, one directional slide (28px) +
fade at 260 ms on `SIGNUP_EASE`.

- **Direction is derived inside the component, not passed in** — it is not part
  of the prop surface at all. Pass `stepIndex`; the component remembers the last
  one it rendered and compares. Five of the six screens would otherwise have to
  repeat the same logic and one of them would get it wrong.
- Derivation uses React's **adjust-state-during-render** pattern
  (`if (stepIndex !== lastIndex) { setDirection(...); setLastIndex(...) }`), not a
  ref and not an effect. A ref is what the repo's `react-hooks/refs` eslint rule
  forbids reading during render (it fails `npm run lint` — I hit this), and an
  effect commits one frame with the stale direction, which is precisely the frame
  AnimatePresence samples when it starts the exit.
- The direction reaches the **exiting** element through `custom` on both
  `AnimatePresence` and the `motion.div` — that is the only channel an already-
  removed child can read. Without it, Back animates out forwards.
- `initial={false}` means the first step does not slide in on first paint; the
  stagger (below) provides the entrance instead. Deliberate — a horizontal slide
  on cold load reads as a page that arrived late.

##### 3. `components/signup/SignupStagger.tsx` — `SignupStagger` + `SignupStaggerItem`

Container carries `initial`/`animate`; framer propagates the variant *names* to
the items, so an item takes no props. That is why this is two components rather
than a `delay` prop each screen counts out by hand. Under reduced motion the
stagger interval AND the rise both collapse to 0 — everything fades in together.

##### 4. `components/signup/SignupQuestion.tsx` — the one-question layout

Eyebrow → title → helper → answer slot, staggered, in that order.

**`title` and `helper` are typed `string`, not `ReactNode`.** That is the
enforcement mechanism for the plan's "one question per screen, one input, one
line of helper text maximum. No paragraphs." There is nowhere to put a paragraph
or a bullet list. If a Phase 4 screen needs more words, the answer is another
step, not a wider type.

##### 5. `components/signup/SignupTextField.tsx` — the one input

Carries the plan's focus/keyboard rules so no screen re-derives them:

- **`inputMode` and `autoComplete` are REQUIRED props**, not optional. They are
  the difference between iOS offering to fill the name/email/strong-password and
  offering nothing. A field with genuinely no autofill meaning passes
  `autoComplete="off"` explicitly, and that is visible in review.
- Autofocus via `requestAnimationFrame` in an effect (not React's `autoFocus`),
  because AnimatePresence mounts the incoming step after the outgoing exit
  completes. **See the ⚠️ in §6 below — this is the one thing most likely to be
  genuinely broken on a real iPhone.**
- `enterKeyHint` (default `"next"`) + an `onEnter` callback. Enter is
  `preventDefault`-ed, so wrapping a step in a `<form>` for password-manager
  affordances is safe — it cannot double-fire.
- `ht-input` (16px, `--ht-text-base`) so iOS never zooms on focus. Do not shrink it.

##### 6. `components/signup/SignupShell.tsx`

Full-bleed `bg-ht-canvas`, four slots in this order and no others: progress rail
(flush to the top edge) → `ExitBackButton` top-left + "Step N of 6" → one
scrolling content region (wrapped in `SignupStepTransition`, `max-w-md` centred)
→ `WizardFooter tone="dark" variant="sticky"`.

- **Height is `h-[var(--tp-vh,100dvh)]`, and this is load-bearing.** `--tp-vh`
  (`components/ui/ViewportHeightSync.tsx`, mounted in `app/layout.tsx`) tracks
  `visualViewport.height`, so it *shrinks when the iOS soft keyboard opens* —
  which is what keeps the sticky footer above the keyboard rather than under it.
  `100dvh` is only the pre-hydration fallback. `h-screen` is the exact bug the
  var exists to fix; the test asserts `h-screen` never appears here.
- The shell composes `ExitBackButton` + `WizardFooter` and renders neither
  `StepBackButton` nor `NextButton` — `tests/navigation-controls-contract.test.ts`
  fails any file but `WizardFooter` that does, and it still passes untouched.
- Exit href defaults to **`marketingHref("/info")`**, never `/` (CLAUDE.md: `/`
  is the *player* sign-in). `useExitNavigation` still prefers real history, so
  this is the cold-open / installed-PWA fallback. `onExit` is exposed for a
  Phase 4 "discard your answers?" confirmation.
- The progress rail animates `scaleX` on an `origin-left` bar, not `width` — a
  transform composites and never reflows the header beneath it. It carries
  `role="progressbar"` + `aria-valuenow/min/max`.
- Safe areas: `pt-[max(env(safe-area-inset-top),10px)]` on the header row and
  `pl-/pr-[env(safe-area-inset-left/right)]` on the container (landscape notch).
  The bottom inset is already `WizardFooter`'s job — do not pay it twice.

##### 7. The one change outside `components/signup/`

`components/ui/AppShell.tsx` — **`"/owner/signup"` added to `FULLSCREEN_PATHS`.**
Without it the wizard would have inherited the standard app shell's
`max-w-[720px]` clamp, `pb-24` and two decorative blur blobs, which is the
opposite of a takeover. `/owner/*` is not in `GAME_SCREEN_PATHS` and stays out —
signup is not a game screen, and `body` is already `--ht-canvas` so nothing
bleeds through. **If the route is ever renamed, this list must move with it.**
No other route's classification changed; `npm run build` output is unchanged.

Not needed, checked: `proxy.ts` already exempts all of `/owner/*` from the cookie
gate, so `/owner/signup` is publicly reachable with no proxy change.

##### 8. `tests/components.signup-shell-motion.test.ts` (new, 8 tests)

Beyond the plan's letter, but this is a phase headless tooling otherwise cannot
touch at all. Scoped to *motion tokens + shell composition* only:
reduced-motion collapse, no-overshoot ease, progress-fraction bounds, the
primitives-not-reimplemented rule, `--tp-vh`, the no-literal-timings tripwire,
per-component `useReducedMotion`, and the derived direction.

**Phase 8: do not duplicate these in `tests/self-serve-signup-contract.test.ts`.**
Leave that file to the rate limiter, radius bounds and route auth. The one
overlap the plan names — "the wizard renders `WizardFooter`, not raw
`NextButton`/`StepBackButton`" — is already covered here *and* globally by
`tests/navigation-controls-contract.test.ts`; a third copy adds nothing.

##### 9. `docs/self-serve-signup-device-checklist.md` (new)

Eight sections, staged so nothing is lost between phases: §1 takeover/safe areas,
§2 keyboard, §3 autofocus ⚠️, §4 motion, §5 navigation, §6 autofill *(Phase 4)*,
§7 address+map *(Phase 4)*, §8 end-to-end *(Phase 6)*. Its header repeats the
three prerequisites (migration → Maps referrer restriction → flag). **Only Andrew
closes it**, and §1–§5 cannot be run until Phase 4 creates the route.

---

**Handoff notes for Phase 4 (Opus 5 — the six question screens):**

1. **The shell already does the chrome. Your page owns state only.** Expected
   shape of `app/owner/signup/page.tsx`:

   ```tsx
   <SignupShell
     stepIndex={index}
     stepCount={SIGNUP_STEPS.length}
     onBack={index > 0 ? goBack : undefined}
     onNext={advance}
     nextLabel={step === "review" ? "Start subscription — $100/mo" : "Next"}
     nextDisabled={!isStepValid}
     footerHint={error}
   >
     {renderStep()}
   </SignupShell>
   ```
   Do **not** add a second Back, a page-level header, or your own footer. Do not
   wrap the shell in `OwnerShell`.

2. **Every screen is `<SignupQuestion …><SignupTextField …/></SignupQuestion>`**
   for steps 1–3. Steps 4–6 use `SignupQuestion` for the heading and put their
   own content (Places field, `GeofenceEditor`, review card) in the slot — wrap
   each block in `SignupStaggerItem` so it joins the same entrance rhythm rather
   than popping in whole.

3. **Do not hand-roll timings.** Import from
   `@/components/signup/signupMotion`. `tests/components.signup-shell-motion.test.ts`
   fails on a literal `duration:`/`ease: [`/`staggerChildren:`/`type: "spring"`
   in any `components/signup/*.tsx`, including yours.

4. **Wiring carried forward from Phases 1 and 2, unchanged:**
   - Address step → `useSignupAddressLookup()` from
     `@/components/signup/useSignupAddressLookup`. Never `useAddressLookup`
     directly, never a fork.
   - Geofence step → `<GeofenceEditor mapsKeyEndpoint="/api/signup/maps-key"
     min={SIGNUP_RADIUS_MIN} max={SIGNUP_RADIUS_MAX}
     presets={SIGNUP_RADIUS_PRESETS} hideAdvanced … />`, all three constants
     imported from `@/lib/selfServeSignup`. No raw `50`/`200` literals — Phase 8
     asserts the bounds live only in that module.
   - `GeofenceEditor` already clamps its emitted radius to 50–200, so a tampered
     `sessionStorage` draft cannot carry an out-of-band value. Phase 5 must still
     re-validate server-side (`createAdminVenue` only clamps to 25–2000).

5. **`sessionStorage` draft: strip `password` explicitly on write.** It is a
   field on `SignupDraft`, so persisting the object wholesale writes it. Read
   back with the same shape and leave `password` `""`.

6. **429/503 copy.** Both `/api/signup/*` routes return `{ ok: false, error }`
   plus `Retry-After`. `useAddressLookup` already surfaces `payload.error`, so
   the address field shows something usable for free. The map's own key fetch
   only sets a generic "Maps key unavailable" — **a failed map load must not be
   fatal to the flow**; the partner can still continue with the Places
   coordinates. The migration is applied as of 2026-09-07, so the limiter behaves
   normally — the throttle you should design copy for is a **429** with
   `Retry-After`. A **503** now means Supabase is genuinely unreachable (`rateLimit`
   fails closed by design), so that copy should say "try again in a moment", not
   "you're going too fast".

7. **⚠️ The autofocus/keyboard risk is real and is yours to close.** `mode="wait"`
   means the incoming field is focused ~260 ms after the tap, and iOS Safari may
   refuse to raise the soft keyboard that far from the gesture. §3 of the device
   checklist has the fix order — (a) focus the incoming field in the same tick as
   the tap, (b) shorten `SIGNUP_STEP_DURATION`, (c) `mode="popLayout"` as a last
   resort because it changes the feel. **Do not apply any of them speculatively**;
   headless testing will report success either way. Get Andrew to check §3 first.

8. **Two things I deliberately did not build**, so you decide with the content in
   front of you: a per-step *validation* contract (the shell just takes
   `nextDisabled`), and the review step's static map thumbnail. The plan's §4
   Phase 4 item 6 notes `/api/admin/venue-map` needs a `/api/signup/venue-map`
   sibling under the rate limiter, **or** reuse the live `GeofenceEditor` map
   read-only. If you add the route, it must import `isSelfServeSignupEnabled` and
   `rateLimit` like its two siblings — Phase 8 asserts that on every
   `/api/signup/*` route.

9. Check for interference from `OwnerRecoveryRedirectGuard` and
   `AuthNavigationGuard` (both mounted in `app/layout.tsx`) on a signed-out
   `/owner/signup`. `/owner/register` works today so this is probably fine, but
   nothing has yet loaded a signed-out `/owner/*` page that holds long-lived
   client state across six steps.

**Handoff note for Phase 6:** nothing here touches billing. §8 of the device
checklist holds the two end-to-end items (Stripe test-mode run; backgrounded
phone restores the draft *without* the password) — close them there.

---

### Phase 4 — The six question screens
**Model: Opus 5 · Effort: High**

`app/owner/signup/page.tsx` plus `components/signup/steps/*`.

1. **Name** — one input.
2. **Email** — `type="email"`, inline format validation on blur, not per keystroke.
3. **Password** — min 8 (matches `/api/owner/auth/register`), reveal toggle,
   a quiet strength rail. No rules list until a rule is broken.
4. **Address** — Places search field. Selecting a prediction fills street/city/
   state/ZIP/lat/lng/placeId **and** the venue name (business predictions only —
   reuse the `/^\d/` test from `businessNameFromPrediction`). Editable venue-name
   line beneath. "Enter it by hand" reveals the raw fields *and* the GPS button,
   because typed text yields no coordinates — that recovery path is why the admin
   flow works in the field, keep it. Country locked to "United States".
5. **Geofence** — `GeofenceEditor` with `min={50} max={200}`,
   `hideAdvanced`, signup presets. Pin seeds from the Places result; "Use my
   current location" overrides it. Copy: "Players inside this circle can play."
6. **Review** — venue name, address, radius, a static map thumbnail
   (`/api/admin/venue-map` needs a `/api/signup/venue-map` sibling under the same
   rate limiter, or reuse the live map read-only), plus price. One button:
   "Start subscription — $100/mo".

Draft state persists to `sessionStorage` so a backgrounded phone doesn't lose the
form. Never persist the password — hold it in memory only.

**Verify:** `npm run test`, `npm run lint`, `npx tsc --noEmit`. Device checklist
entries for each step's keyboard behavior.

#### Phase 4 — As-built (2026-09-07, Opus 5)

**Shipped.** `npx tsc --noEmit`, `npm run lint`, `npm run build` and `npm run test`
(2047 passed / 221 files — Phase 3's 2036 plus 11 new in
`tests/lib.signup-draft.test.ts`; the 13 skipped are still the pre-existing
`tests/api.nfl-pickem.test.ts` block) all clean. `npm run test:god-mode-join`
(34) and `npm run test:pwa-contract` (20) also pass untouched.

**Still inert.** `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` is absent from every
`.env`, so `/owner/signup` is a real 404 and all three `/api/signup/*` routes
404. `/owner/register` is untouched — the cutover is Phase 7's.

**One thing to know about the flag that was not true before this phase:**
`/owner/signup` builds as **`○ (Static)`**. The flag is a `NEXT_PUBLIC_*` value
inlined at build time, so *setting the env var only takes effect on the next
build/deploy*. That matches Phase 7's documented flag-on order (env var → deploy)
but it is now load-bearing rather than incidental — say so in the runbook.

##### 1. Route + wizard split

- **`app/owner/signup/page.tsx`** — a **server** component whose only job is
  `if (!isSelfServeSignupEnabled()) notFound()`. Flag-off is then a genuine 404,
  the same answer the API routes give, rather than a page that renders and hides
  itself. Everything else is one client component.
- **`components/signup/SignupWizard.tsx`** — state and nothing else: step index,
  the draft, pin provenance, the footer hint, the submit. No page-level header,
  no second Back, no second footer; all chrome is Phase 3's `SignupShell`.

##### 2. Deviation: Next is NEVER disabled by validation

Phase 3's handoff sketched `nextDisabled={!isStepValid}`. It is **not** wired that
way. `signupStepIssue(step, draft)` returns a *message*, Next always fires, and an
incomplete step surfaces that message as the shell's `footerHint` — directly above
the thumb that just tapped it.

This is `ActivateVenueFlow`'s decision, taken for its stated reason: a greyed,
inert Continue tells a partner that something is wrong but not *what*, and on the
address step "what" can be any of five fields. `nextDisabled` is reserved for the
one genuinely inert state, a submit in flight. **Do not "restore" the disabled
gate in a later phase** without also solving the naming problem.

##### 3. Validation lives in `lib/selfServeSignup.ts`, on purpose

New exports there — `SIGNUP_PASSWORD_MIN_LENGTH` (8, matching
`/api/owner/auth/register`), `isValidSignupEmail`, `hasSignupPin`,
`hasSignupAddress`, `signupStepIssue`, `validateSignupDraft`, and
`SIGNUP_PRICE_LABEL`.

They are in the shared, pure, edge-safe module rather than in the wizard because
**Phase 5 must reuse `validateSignupDraft` verbatim as its server-side gate.** The
client check is a UX affordance and never a gate — but two different rule sets
would be worse than either. `validateSignupDraft` walks `SIGNUP_STEPS` in order and
returns the first unmet one, so the server's error text names the same screen the
partner would have seen.

##### 4. `components/signup/signupDraft.ts` — and the one rule it exists for

`readSignupDraft` / `writeSignupDraft` / `clearSignupDraft` /
`signupDraftHasAnswers`, over **sessionStorage** (not localStorage: the draft
should die with the tab — a shared phone behind a bar must not offer the next
person someone else's half-typed signup).

- **The password is stripped by a named destructure**, not a blocklist loop, so a
  field added to `SignupDraft` later is persisted by default and the one omission
  is legible in review. `tests/lib.signup-draft.test.ts` asserts the plaintext
  never appears in the serialized payload.
- **Reads are validated, not trusted.** A tampered payload yields `""` for a
  non-string, `null` for an out-of-range coordinate (a wrong pin is worse than no
  pin), and a *clamped* radius (it has a legitimate default and a hard domain).
- **Nothing throws.** Private Browsing, "block all cookies" and a full quota all
  make these calls throw; a wizard that white-screens because it could not save a
  draft is far worse than one that quietly forgets it.
- Restore happens in a mount effect, never in `useState`'s initializer — reading
  storage during render would hydrate a different tree than the server sent. The
  mirror-back effect is gated on a `hydrated` **state** value, not a ref: a ref
  flipped inside the restore effect already reads `true` when the write effect
  runs later in the *same commit*, and it would write the still-blank draft
  straight over the one just read. Batched state makes the write effect skip that
  pass and first fire on the commit carrying the restored draft. Do not
  "simplify" it back to a ref.

##### 5. The six screens (`components/signup/steps/`)

1. **`NameStep`** — one `SignupTextField`, `autoComplete="name"`.
2. **`EmailStep`** — validates **on blur, never per keystroke**. Every email is
   invalid while it is being typed ("a@" is a legitimate intermediate state), so a
   per-keystroke check means watching a red error for the whole answer. `touched`
   clears on the next edit.
3. **`PasswordStep`** — reveal toggle, and a three-segment strength rail with **no
   number and no rules checklist**; the single hard rule (8 chars) appears as text
   only once the field is non-empty and still short. `autoComplete="new-password"`
   is load-bearing: it is what makes Keychain/1Password *generate* rather than try
   to fill. `passwordStrength()` is exported for the test — it returns `0` below
   the floor and never `0` at or above it, so an *allowed* password can never
   render as a failure.
4. **`AddressStep`** — `useSignupAddressLookup()` (never `useAddressLookup`
   directly). Prediction tap fills street/city/state/ZIP/lat/lng/placeId and, only
   for a business prediction, the venue name — the `/^\d/` rule is copied
   verbatim from `ActivateVenueFlow.businessNameFromPrediction` so both surfaces
   name a venue identically. "Enter it by hand" reveals the raw fields, the locked
   `Country: United States` line **and** a "Use my current location" button.
   *That GPS button is not redundant with step 5's:* without it a hand-typed venue
   reaches step 5 with no pin, where `GeofenceEditor` renders its dashed
   placeholder and a disabled dial — which reads as a broken screen.
5. **`GeofenceStep`** — `GeofenceEditor` with `mapsKeyEndpoint="/api/signup/maps-key"`,
   `min={SIGNUP_RADIUS_MIN}`, `max={SIGNUP_RADIUS_MAX}`,
   `presets={SIGNUP_RADIUS_PRESETS}`, `hideAdvanced`. No raw `50`/`200` literals.
   **Theming deviation:** `GeofenceEditor` is a light-surface admin component and
   the signup canvas is dark. It is mounted inside a deliberate light panel
   (`rounded-ht-lg bg-slate-200/90 p-3`) rather than re-themed — re-theming it
   would put every admin venue screen at risk for one new caller, and the map is a
   light object anyway. **This is the one Phase 4 judgement a headless pass cannot
   make; it is on the device checklist (§7).**
6. **`ReviewStep`** — static map thumbnail, four summary rows, the price card, and
   the duplicate-venue panel. The map is **non-fatal**: `onError` hides it and the
   summary and button still work. A partner must never be unable to pay because a
   thumbnail 429'd.

##### 6. New route: `GET /api/signup/venue-map` + a `venueMap` limiter bucket

The plan's Phase 4 item 6 offered two options; this took the first. Public sibling
of `/api/admin/venue-map`, same gate as its two siblings (flag → limiter, never
`requireAdminAuth`), new `venueMap: { windowSeconds: 60, max: 10 }` bucket.

- Radius is clamped to the **signup** bounds, not admin's 25–2000 — the caller is
  a stranger and a query string is trivially edited.
- Coordinates are validated **before** the limiter, for the same reason
  `/api/signup/places` returns early on a sub-3-character query: a request that
  never reaches Google must not spend the partner's quota. **Phase 8's "every
  `/api/signup/*` route calls the limiter" tripwire must tolerate this too** —
  assert the *import*, as Phase 1 already advised.
- Unlike `/api/signup/maps-key`, the API key never leaves the server here, so the
  Google referrer restriction (Risk #1) does **not** protect this route. The rate
  limiter is its entire defence.

##### 7. Small additive changes to Phase 3 components

`SignupTextField` grew three optional props — `onFocus` (re-open the prediction
list), `onBlur` (the email step's blur validation), and `"search"` in the `type`
union (which additionally turns off autocorrect/autocapitalise, because a phone
rewriting a bar name mid-query is what makes a Places lookup return nothing).
Every existing call site is unaffected. `inputMode`/`autoComplete` stay **required**.

##### 8. Checked, as Phase 3 asked (item 9): the layout guards are clean

`AuthNavigationGuard` returns early for any path starting `/owner` (an explicit,
commented exemption — the Partner Dashboard has its own auth), and
`OwnerRecoveryRedirectGuard` only acts on a `type=recovery` URL hash. Neither can
touch a signed-out `/owner/signup`. No change was needed.

##### 9. `tests/lib.signup-draft.test.ts` (new, 11 tests)

Scoped to the two things in Phase 4 that are pure logic and costly to get wrong:
the password never reaching storage, and the step gate Phase 5 is about to reuse
as its server validator. **Phase 8: do not duplicate these in
`tests/self-serve-signup-contract.test.ts`** — leave that file to route auth, the
radius-bounds locality assert and the rate limiter.

---

**Handoff notes for Phase 5 (Opus 5 — `POST /api/owner/signup`):**

1. **The client contract is already written — match it, don't redesign it.**
   `SignupWizard.submit()` POSTs JSON to `/api/owner/signup`:
   `{ name, email (lowercased), password, venueName, street, city, state
   (uppercased), zipCode, placeId, latitude, longitude, radius, claimVenueId? }`
   and expects:
   - **200** `{ ok: true, venueId }`
   - **409** `{ ok: false, error, code: "venue_available" | "venue_claimed",
     venue: { id, name, address } }` — the client renders the "Is this your
     venue?" / "already has an owner" panel from `venue`, and a claim re-POSTs
     the identical body plus `claimVenueId`.
   - **409** `{ ok: false, error, code: "email_taken" }` — falls through to the
     footer hint, so put the sign-in guidance **in `error`** ("An account with
     this email already exists — sign in at /owner/login instead").
   - **429 / 503** — `rateLimitResponse(limit)` verbatim, `{ ok: false, error }`.
     The client shows `error` as-is, so that copy IS the user-facing copy.
   - Anything else → `payload.error`, else a generic message.
   Until this route exists the client special-cases **404** with "Signup isn't
   available yet" (a 404 has an HTML body and would otherwise read as a JSON
   parse failure). You can delete nothing for that — it stays correct as a
   flag-off/deploy-skew guard.
2. **Use `validateSignupDraft` from `@/lib/selfServeSignup` on the parsed body.**
   It is the same function the wizard gates on, it is pure and edge-safe, and it
   is where the 50–200 m rule lives on the server path — `createAdminVenue` only
   clamps to 25–2000, so nothing else enforces it. Do not hand-roll a second
   rule set.
3. `rateLimit(request, "signupSubmit")` — the bucket and its 5/hour window are
   already defined. `rateLimitResponse(limit)` verbatim; no second 429 shape.
   Remember it **fails closed**: a Supabase outage returns 503, which is why the
   client's generic copy says "try again", not "you're going too fast".
4. **`placeId` and `latitude`/`longitude` can disagree, legitimately.** The
   client clears `placeId` whenever the pin detaches from the looked-up Place
   (GPS, map drag, typed coordinates) — the same rule `ActivateVenueFlow`
   applies. Treat the coordinates as canonical and `placeId` as advisory; never
   re-geocode from `placeId` and overwrite the pin.
5. `latitude`/`longitude` arrive as `number | null` (JSON numbers, not strings).
   `validateSignupDraft` rejects null, but parse defensively anyway — the body is
   attacker-controlled.
6. **On success the client goes to `/owner/billing/setup`, not to Checkout
   directly.** That page already owns the `/api/owner/billing/checkout` POST with
   its bfcache and double-tap hardening, and step 8 of your route (set the owner
   session cookie) is what makes it work. **This is a seam Phase 6 may replace**
   with the direct checkout POST the plan describes — if you do, the only change
   is the last two lines of `SignupWizard.submit()`. Do not duplicate the
   checkout call in the meantime.
7. The country is never submitted. It is rendered from `DEFAULT_VENUE_COUNTRY`
   and locked (plan §0, US-only) — set it server-side from that same constant.
8. `venues.self_serve_created_at` and `hidden = true` are yours (steps 6–7).
   Phase 6's webhook flips `hidden` and Phase 6's sweep keys off
   `self_serve_created_at`, so a row created without it is a row the sweep will
   never reap and the webhook will never reveal.

**Handoff note for Phase 6:** the review screen's price card and the footer button
both read `SIGNUP_PRICE_LABEL` from `lib/selfServeSignup.ts` — display copy only,
matching the literal `/owner/billing/setup` and `/info` already show. The real
amount is the Stripe price. If the plan price ever changes, grep `"$100"`; there
are four places.

**Handoff note for Phase 7 (runbook):** add the static-prerender fact from the top
of this section — the flag is inlined at build time, so **env var, then redeploy**,
in that order, or nothing changes. And `/api/signup/venue-map` now exists: the §6
smoke test should cover all three routes, not two.

**Handoff note for Phase 8:** `tests/lib.signup-draft.test.ts` and
`tests/components.signup-shell-motion.test.ts` already cover the draft, the step
gate and the motion system. The contract test's remaining jobs are: no
`/api/signup/*` route imports `requireAdminAuth`; all **three** import
`isSelfServeSignupEnabled` and `rateLimit` (assert the *import* — both
`/api/signup/places` and `/api/signup/venue-map` deliberately call the limiter
after an early return); `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` is read only in
`lib/selfServeSignup.ts`; and the 50/200 bounds appear only there.

---

### Phase 5 — `POST /api/owner/signup`
**Model: Opus 5 · Effort: High** *(multi-table create with no transaction)*

One route that does what `/api/owner/auth/register` + admin venue creation do
today, in the right order, with every partial-failure path unwound.

Order, and the reason for it:

1. Rate-limit check (same limiter as Phase 1, stricter window).
2. Validate the whole payload server-side. **Re-enforce 50–200 m here** —
   `createAdminVenue` only clamps to 25–2000, so the client bound is not a gate.
   Reuse `validateVenueForm`'s server twin, do not trust the client.
3. **Duplicate check.** `calculateDistanceMeters` (`lib/geofence`) against every
   venue within ~150 m of the pin.
   - Match with a row in `venue_owner_venues` → 409 `venue_claimed`, client shows
     sign-in / support.
   - Match with no owner → 409 `venue_available` + the venue's id/name/address.
     The client shows "Is this your venue?"; confirming re-posts with
     `claimVenueId` and **links to the existing row instead of creating one**
     (it stays visible if it already was — don't hide a live venue).
   - No match → create.
4. Create the Supabase auth user (`email_confirm: true`).
5. Insert `venue_owners`.
6. Create the venue via `createAdminVenue`, then set `hidden = true` and
   `self_serve_created_at = now()`.
7. Insert `venue_owner_venues`.
8. Set the owner session cookie, return `{ ok, venueId }`.

**Unwind on failure at any step**, in reverse — the existing register route
already does this for steps 4/5 (`auth.admin.deleteUser` on owner-row failure);
extend the same discipline to the venue rows. There is no cross-table
transaction available through the JS client, so this is explicit and must be
written deliberately, not assumed.

Also: an email that already has a `venue_owners` row must return 409 with a
sign-in link, not a raw Supabase error.

**Verify:** `tests/api.owner.signup.test.ts` — happy path, each unwind branch,
radius bound rejection, both duplicate branches, duplicate email, rate limit.
Then `npm run test` and `npm run test:venue-fk-guard` (new venue rows).

---

#### Phase 5 — As-built (2026-09-07, Opus 5)

**Shipped.** `npx tsc --noEmit`, `npm run lint`, `npm run build` and `npm run test`
(2079 passed / 224 files — Phase 4's 2047 plus 29 new in
`tests/api.owner.signup.test.ts` and 3 in `tests/lib.admin.create-venue-self-serve.test.ts`;
the 13 skipped are still the pre-existing `tests/api.nfl-pickem.test.ts` block) all
clean. `npm run test:venue-fk-guard` (2) and `npm run test:god-mode-join` (34) pass
untouched.

**Still inert.** `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` is absent from every `.env`,
so `POST /api/owner/signup` 404s in every environment exactly as its three
`/api/signup/*` siblings do. `/owner/register` is untouched — the cutover is Phase 7's.
The route builds as `ƒ` (dynamic), so unlike the page it does **not** need a rebuild to
see the env var; the page still does, which is why the runbook's order stands.

**No migration.** Phase 0's `venues.self_serve_created_at` and `signup_attempts` are
everything this phase needed.

##### 1. The route, and the one place its gate order differs from its siblings

`app/api/owner/signup/route.ts`. Order is **flag → rate limiter → validation →
duplicate check → writes**.

That puts the limiter *before* validation, which **reverses** `/api/signup/places`
and `/api/signup/venue-map`, where an invalid request returns early so it never
spends a partner's Google quota. The inversion is deliberate and should not be
"made consistent": on those routes the limiter protects a Google bill, so a request
that never reaches Google must not cost a slot. Here it protects the *accounts
table*, and a malformed body is precisely the shape a scripted signup spammer
sends — so it must cost one of the five.

##### 2. `validateSignupDraft` is the whole validator, and `draftFromBody` feeds it

The body is reshaped into a real `SignupDraft` and handed to
`validateSignupDraft` verbatim — one rule set, and the error text names the same
screen the partner would have seen. Two coercion details are load-bearing:

- **`coordinate()` type-guards instead of calling `Number(value)`.** `Number(null)`
  and `Number("")` are both **`0`**, so the terse version turns a missing pin into
  the coordinates (0, 0) — an in-range point in the Gulf of Guinea that
  `validateSignupDraft` accepts happily. The client sends `null` for an unset pin,
  so this is the ordinary path, not a hypothetical. It was a real bug, caught by
  the test, not by review.
- **The password is TRIMMED.** `/api/owner/auth/login` trims before exchanging
  credentials, so storing an untrimmed password here would create an account its
  own owner could never sign into. Do not "stop mangling the password" without
  changing login in the same commit.

One route-level check sits alongside the shared validator: a venue name must
contain at least one letter or digit, mirroring `normalizeVenueId` inside
`createAdminVenue`. Without it a venue called `"!!!"` passes every shared rule and
then fails four writes later with no actionable message.

##### 3. Duplicate + claim resolution — and the gate on `claimVenueId`

`findNearbyVenue` is a latitude/longitude **bounding box** in Postgres (there is no
geo index) narrowed by real `calculateDistanceMeters` in JS. The box is always a
superset of the circle. Near a pole or across the antimeridian the longitude bound
is dropped rather than clamped, so a match is never silently missed.
`SIGNUP_DUPLICATE_RADIUS_METERS = 150` lives in `lib/selfServeSignup.ts` beside the
radius bounds; it shares 150 with `SIGNUP_RADIUS_DEFAULT` **by coincidence, not by
meaning** — do not collapse them.

- **Hidden venues are included** in the scan. A hidden row is usually somebody
  else's abandoned self-serve signup at the same address; offering it as a claim is
  right, and the Phase 6 webhook reveals it on first payment like any other.
- Rows with null coordinates, or the literal `(0, 0)` the Category Blitz global room
  uses, are skipped — they are not places.
- **`claimVenueId` is never trusted as proof of anything.** The claim path re-fetches
  that venue and re-checks (a) it is within 150 m of the *submitted pin* and (b) it
  still has no owner. Without (a), posting any venue id in the product would make
  the poster its owner. That is the single most important assertion in the test
  file — `"REFUSES a claimVenueId that is not at the submitted pin"`.
- A claim **never flips `hidden`**. A live venue must not be hidden by someone
  claiming it, and an admin-created one must never become sweepable.
- **But claiming a HIDDEN venue refreshes its `self_serve_created_at`** — see §5a.

##### 4. Deviation: the email check runs BEFORE the duplicate scan

The plan's step order puts the duplicate check at 3 and the account at 4. The
`venue_owners`-by-email lookup was moved ahead of the duplicate scan: if this email
already has a partner account, "sign in instead" is the only useful answer whatever
the venue geometry says, and learning it only after tapping through "Is this your
venue?" would be two dead ends instead of one. It is one indexed lookup.

This does let an unauthenticated caller probe whether an email has a partner
account — but `/api/owner/auth/register` already answers the same question, and
this route is capped at 5 attempts/hour per IP.

##### 5a. Deviation: claiming a hidden venue restarts its unpaid clock

The plan said a claim touches neither `hidden` nor `self_serve_created_at`. It
turns out it must touch the second one, and the reason is a Phase 6 interaction
worth stating plainly:

`self_serve_created_at` means "this hidden row has been unpaid since X", and Phase
6's sweep deletes hidden, unpaid rows older than 7 days. A partner who claims
somebody's abandoned signup from three weeks ago **inherits that stamp** — so
without a refresh the sweep would delete their venue out from under them while they
were still on the Stripe Checkout page. There is no way to fix this from the sweep
side alone: `venue_owner_venues` has no `created_at`, so the sweep cannot tell a
just-claimed row from a long-dead one.

The refresh is deliberately narrow: only when the venue is **hidden** (a live venue
is never stamped — stamping one would hand the sweep an admin-created venue), only
**after** the link insert succeeded (if the link fails we unwind, and the row must
keep its original stamp so it stays sweepable), and **non-fatal** (the account and
link exist; the partner must be allowed to go pay, and the cost of a miss is one
stale row, only if they then abandon Checkout). Three tests pin those three rules.

##### 5. `unwind()` IS the rollback

There is no cross-table transaction, so `authUserId` / `ownerId` / `createdVenueId`
are captured the moment each row exists and `unwind()` deletes them in reverse.
Three things about it:

- **Each step is independently guarded.** A failed unwind step must not prevent the
  ones after it, or a 500 leaves more debris than it had to.
- **`venue_owners` is deleted explicitly** even though `auth_id` cascades from
  `auth.users`. The unwind must be legible on its own and must not silently stop
  working if that FK is ever changed.
- **`createdVenueId` is null on a claim**, so unwinding a claim can never delete
  somebody else's venue. Pinned by
  `"on a CLAIM, unwinding the link never deletes the venue it was claiming"`.

##### 6. One shared change: `createAdminVenue` grew two optional inputs

`hidden?: boolean` and `selfServeCreatedAt?: string` (`lib/admin.ts`). Both are
**omitted from the insert entirely** when undefined, so every admin caller is
byte-identical — `hidden` keeps its `false` column default, `self_serve_created_at`
stays null. `tests/lib.admin.create-venue-self-serve.test.ts` pins exactly that.

The plan said "create the venue via `createAdminVenue`, then set `hidden = true` and
`self_serve_created_at = now()`". It is done in the **insert** instead, on purpose: a
venue created visible and hidden a moment later is briefly joinable by players, and
if that follow-up UPDATE failed the row would be left visible with a null
`self_serve_created_at` — which is precisely the shape Phase 6's sweep is forbidden
to touch and the webhook will never reveal. One insert has neither failure mode.
**They must always be set together.**

##### 7. Known residual: two simultaneous claims

`venue_owner_venues` is `UNIQUE (owner_id, venue_id)`, not unique on `venue_id`
alone, so two different people claiming the same venue in the same instant could
both get a link row. The ownership re-check immediately before the insert plus the
5/hour limiter make the window very small, and it does not exist at all for a
newly-created venue. The fix is a unique index on `venue_owner_venues(venue_id)`,
which needs a migration **and** a check that no venue today legitimately has two
owner rows. Deliberately not done blind in this phase — **scheduled as Phase 5a §3**,
with the precondition query written out.

##### 8. `tests/api.owner.signup.test.ts` (new, 26 tests)

Gates (flag, limiter), validation (radius bounds, missing pin, bad email, nameless
venue, non-numeric latitude), `email_taken` on both paths, all three duplicate
branches, all four claim branches, the happy path (including that `hidden` +
`selfServeCreatedAt` land together and that `country` comes from
`DEFAULT_VENUE_COUNTRY`, never the body), and every unwind. The Supabase mock is a
small chainable builder that is also thenable, because `.delete().eq(...)` and a
bare `.insert(...)` are awaited with no terminal call.

---

**Handoff notes for Phase 6 (Opus 5 — payment handoff, unhide, sweep):**

1. **The client already routes to `/owner/billing/setup`, not to Checkout.** That is
   the seam the plan says you may replace with a direct `POST
   /api/owner/billing/checkout`. If you take it, the ONLY change is the last two
   lines of `SignupWizard.submit()` — the route returns `{ ok: true, venueId }` and
   sets `tp_owner_sess` either way. **Recommendation: leave it.**
   `/owner/billing/setup` owns the bfcache and double-tap hardening that the plan
   itself calls load-bearing, and duplicating the checkout POST in the wizard would
   be a second, unhardened call site for the riskiest route in the repo.
2. **`maybeRevealVenue(sub)` has everything it needs.** Venues created by this route
   carry `hidden = true` **and** a non-null `self_serve_created_at`, always both,
   always in the same insert. The `self_serve_created_at is not null` guard is what
   keeps the reveal off the Category Blitz global room — do not relax it to a plain
   `hidden = true` match.
3. **The sweep's predicate can stay as the plan wrote it** — `hidden = true` AND
   `self_serve_created_at < now() - 7 days` AND no `billing_subscriptions` row — but
   only because §5a above exists. Do NOT additionally exclude venues that have a
   `venue_owner_venues` row: every venue this route creates has one, so that filter
   would mean the sweep reaps nothing, ever. The stamp is the clock; a claim
   restarts it; `venue_owner_venues` is not a signal of anything.
3a. **Phase 5a §1(b) adds a second job to your sweep** — reconciling orphaned
   `auth.users` rows under a triple guard (no `venue_owners`, no `accounts`, no
   `users`, older than 24h). Read Phase 5a §1 before writing any auth-user deletion:
   `auth.users` is shared with two PLAYER tables via `ON DELETE SET NULL`, so an
   unguarded delete silently detaches a player's identity rather than erroring.
4. **Call `pruneSignupAttempts()` from `/api/cron/signup-sweep`.** It is exported
   from `lib/rateLimit.ts` and called by nothing; `signup_attempts` grows unbounded
   until you do. Phase 1 flagged this and it is still open.
5. **The sweep must delete in the same order `unwind()` does** — venue, then
   `venue_owners`, then the auth user — and must respect `test:venue-fk-guard`'s
   cascade rules. `unwind()` in this route is a working, tested reference
   implementation of that teardown; read it before writing the sweep's.
6. `vercel.json` cron config is Andrew's to change (CLAUDE.md). Write the route and
   flag the one-line cron entry for him; do not edit that file.
7. **A live Stripe test-mode run is the only real verification.** Three new items are
   already on `docs/self-serve-signup-device-checklist.md` §8 covering the
   Phase 5 seam: the `tp_owner_sess` cookie surviving the redirect to
   `/owner/billing/setup`, the venue staying invisible to players until the webhook
   reveals it, and the `email_taken` hint.

**Handoff note for Phase 7 (runbook):** three facts to record beyond Phase 4's.
(a) The *page* `/owner/signup` is static-prerendered, so the flag needs env var
**then redeploy**; the four API routes are dynamic and pick the env var up without
one — so a mid-rollout deploy skew shows as a live wizard whose submit 404s, which
is exactly what the client's 404 special-case says. (b) There are now **four**
routes to smoke-test, not three: add `POST /api/owner/signup`. (c) `signupSubmit` is
5 per hour per IP — a real bar with staff behind one NAT can hit that during a demo;
say so, and say that the 429 copy is `rateLimitResponse`'s.

**Handoff note for Phase 8 (contract tripwires):** the tripwire list from Phase 4
still stands, with two additions. `app/api/owner/signup/route.ts` lives outside
`/api/signup/*` but is the same public surface — assert it too imports
`isSelfServeSignupEnabled` and `rateLimit` and never `requireAdminAuth`. And
`SIGNUP_DUPLICATE_RADIUS_METERS` joins the 50/200 bounds in the "only defined in
`lib/selfServeSignup.ts`" assert. Do not duplicate
`tests/api.owner.signup.test.ts`'s coverage — that file owns the unwind and claim
branches.

---

### Phase 5a — Signup hardening (the three things Phase 5 left open)
**Model: Opus 5 · Effort: Medium** *(small surface, but item 1 is a safety constraint and item 3 needs a production data check)*

Phase 5 shipped with three known-open items. None of them is a reason to hold the
flag — with `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` off the route is a 404 — but
items 1 and 2 must land **before** the flag flips, because both are only reachable
once strangers can POST to it. Item 3 can land after.

This is deliberately one small phase and not several. Most of what looks alarming
about a four-row, no-transaction create was closed inside Phase 5 and is pinned by
`tests/api.owner.signup.test.ts`; what follows is the genuine remainder.

---

#### 1. `auth.users` IS SHARED WITH PLAYERS — a standing prohibition, and the orphan lockout it leaves

**The finding, which is not written down anywhere else and is the reason this phase
exists.** `auth.users` is not the venue-owner credential store. Two player tables
reference it as well:

- `accounts.auth_id uuid references auth.users(id) **on delete set null**` — `20260528000000_global_accounts.sql:19`
- `users.auth_id uuid references auth.users(id) **on delete set null**` — `20260214153000_initial_schema.sql:17`

and `app/api/join/profile/route.ts` actively reads and writes both (it back-fills
`users.auth_id` at line ~676). So a given `auth.users` row may belong to a **player**,
and the FK is `SET NULL`: deleting it does not error, it silently detaches that
player's account from their identity.

**Therefore, a prohibition — write it into the route and into `CLAUDE.md`:** no
signup or owner code path may adopt, delete, or reset the password of a
**pre-existing** `auth.users` row. Deleting an auth user is legitimate ONLY for one
this same request just created (which is exactly, and only, what Phase 5's
`unwind()` does). The tempting fix for the problem below — "the email has no
`venue_owners` row, so just adopt or delete the stale auth user and continue" — is an
**account-takeover vector against players**. Do not build it.

**The problem that leaves.** `unwind()`'s `deleteUser` can fail, or the function can
die between `createUser` and the `venue_owners` insert (serverless timeout, deploy
mid-request). That leaves an auth user with no owner profile, and the partner is
then wedged: `POST /api/owner/signup` answers "an account with this email already
exists — sign in at /owner/login instead", and `/api/owner/auth/login` answers
`INVALID_LOGIN_MESSAGE` (401) because `venue_owners` has no matching `auth_id`
(`app/api/owner/auth/login/route.ts:65`). Both doors are shut and there is no
self-service recovery. Rare, but the blast radius is a paying customer who cannot
sign up at all.

*(Worth knowing while you are in here: `/api/owner/auth/login` already
self-heals the **other** orphan shape — an owner whose venues have all been deleted
gets their links, auth user and owner row torn down at line ~94. That path is
aligned with Phase 6's sweep and needs no change. It does nothing for an auth user
with no `venue_owners` row at all, which is the shape above.)*

**Solution, in two parts.**

**(a) Tell the truth in the 409.** The `already registered` branch is reached only
*after* the `venue_owners`-by-email pre-check found nothing — so at that point the
route knows the account has no owner profile and "sign in instead" is provably
wrong. Return a distinct message pointing at support, and emit a structured,
greppable `[OwnerSignup] orphan-auth-user` log line so these are discoverable
without waiting for a complaint. **Keep the `email_taken` code** — the client
renders `error` verbatim as the footer hint, so this needs no client change.

**(b) Reconcile in Phase 6's sweep, under a triple guard.** The sweep is already the
"collect abandoned signup debris" job. Extend it to delete an `auth.users` row only
when **all** of these hold: no `venue_owners` row, no `accounts` row, no `users`
row, and `created_at` older than 24h. That triple check is precisely what makes the
deletion safe given the shared FK above — any one of them alone is not enough.
Log-only for one week, same as the venue sweep.

**Tripwire:** a static test over `supabase/migrations/` asserting the set of tables
carrying an `auth.users` FK is exactly `{venue_owners, accounts, users}`. A fourth
consumer then fails the test instead of quietly invalidating (b)'s guard. Model it
on `tests/lib.venue-fk-cascade-guard.test.ts`, which already walks migrations in
filename order for exactly this kind of question.

---

#### 2. No length caps on a public, unauthenticated write

`draftFromBody` trims every field and caps none of them. `validateSignupDraft` only
tests non-emptiness. So one request can carry a multi-megabyte `venueName` into
`venues.name` — a `text` column — and that string is then rendered in the player
venue list and on the venue TV screen. The limiter caps this at 5/hour per IP, which
bounds the rate but not the damage. Note the sibling routes already do this:
`/api/signup/places` length-caps `query` (200) and `placeId` (512) **before anything
else**, and Phase 4's handoff called that ordering out.

**Solution.** A `SIGNUP_FIELD_LIMITS` table in `lib/selfServeSignup.ts` — the same
module that already holds the shared validation, so the wizard's `maxLength` and the
server's gate read one source rather than drifting. Suggested: `name` 120,
`email` 254 (RFC 5321), `password` 200 (bcrypt-adjacent inputs should be bounded),
`venueName` 120, `street` 200, `city` 100, `state` 2, `zipCode` 10, `placeId` 512.

Two decisions to make deliberately:

- **Reject over-length, do not truncate.** Silently storing a clipped venue name is
  worse than telling the partner their name is too long — they would discover it on
  the TV screen in front of customers.
- **Cap the raw body too.** Reject a `Content-Length` over ~16 KB before
  `request.json()` runs, so an oversized body is refused rather than parsed. Vercel
  accepts request bodies up to 100 MB; nothing stops a 100 MB POST reaching the JSON
  parser today.

Extend `signupStepIssue` so the wizard surfaces the same message as a footer hint
rather than only failing server-side — that keeps the "one rule set" property
Phase 4 established.

---

#### 3. Two simultaneous claims can both win

`venue_owner_venues` is `UNIQUE (owner_id, venue_id)` — not unique on `venue_id`
alone (`20260627100000_venue_owner_billing.sql:11`). Phase 5 re-checks ownership
immediately before the link insert, which narrows the window to the gap between that
check and the insert, but does not close it. It does not exist at all for a
newly-created venue; only claims can race.

**Solution.** A migration adding `CREATE UNIQUE INDEX IF NOT EXISTS
venue_owner_venues_venue_id_key ON venue_owner_venues (venue_id);` — the database is
the only place this can be made atomic.

**Precondition, and it is not optional:** that index fails to build if any venue
today already has two owner rows. Run the check first —

```sql
select venue_id, count(*) from venue_owner_venues group by venue_id having count(*) > 1;
```

— and **record the result in the runbook**. If it returns rows, that is a real
product question for Andrew (is co-ownership intended?), not something to
auto-resolve by deleting somebody's access. Do not ship the migration until it
returns empty.

**Route change:** catch the unique violation (`23505`) on the link insert and
convert it to the existing 409 `venue_claimed` response instead of the current
generic 500. The client already renders that branch, so this is server-side only.

---

#### 4. Two one-line robustness fixes, while you are in the file

- `findNearbyVenue`'s `.limit(200)` is **unordered**. If the box ever did hold more
  than 200 venues, the 200 returned would be arbitrary and the nearest could be
  missed — creating a duplicate venue rather than offering the claim. A 300 m box
  will not hold 200 venues in this product, so this is robustness, not a live bug:
  add `.order("latitude", { ascending: true })` so the result is at least
  deterministic and reproducible from a log.
- `venues.name` is what `normalizeVenueId` slugifies into the venue id, and the
  uniqueness loop in `createAdminVenue` appends `-2`, `-3`, … There is no cap on
  that loop. With item 2's name limit in place this is bounded in practice; if you
  want it bounded in principle, fail after ~50 attempts rather than looping.

---

#### Explicitly NOT in this phase

- **One venue per email.** A partner with two bars cannot self-serve the second one
  — the second signup returns `email_taken`. That is a product decision, not a
  defect; the plan never scoped multi-venue self-serve. Record it as a known limit
  in `docs/self-serve-signup-runbook.md` (Phase 7) so support knows the answer is
  "admin adds the second venue", not "it's broken".
- **Re-hiding a lapsed subscriber's venue.** Still out of scope, per Phase 6.

**Verify:** `tests/api.owner.signup.test.ts` gains the over-length rejections, the
orphan-auth-user copy, and the `23505` → `venue_claimed` conversion; the new
`auth.users`-FK tripwire; then `npm run test`, `npm run test:venue-fk-guard` (item 3
adds a migration), `npx tsc --noEmit`, `npm run lint`, `npm run build`.

---

#### Phase 5a — As-built (2026-09-07, Opus 5)

**Shipped in full, including the item 3 migration** — its precondition was
verified against production, not deferred (§5). `npx tsc --noEmit`, `npm run lint`,
`npm run build` and `npm run test` (**2090 passed / 225 files** — Phase 5's 2079
plus 10 new in `tests/api.owner.signup.test.ts` and 4 in the new
`tests/lib.auth-users-fk-guard.test.ts`; the 13 skipped are still the
pre-existing `tests/api.nfl-pickem.test.ts` block) all clean.
`npm run test:venue-fk-guard` (2) passes untouched.

**Still inert.** `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` is absent from every
`.env`, so `POST /api/owner/signup` still 404s everywhere. Nothing here changes
that.

**One migration to apply:**
`20260907140000_venue_owner_venues_unique_venue.sql` (`supabase db push`). It is
a unique index on a 4-row table — it either builds instantly or fails loudly, and
the precondition check above says it builds.

##### 1. The `auth.users` FK set is SEVEN tables, not three

The plan's §1 said the tripwire should assert the set is exactly
`{venue_owners, accounts, users}`. **It is not.** Walking every migration turns
up seven consumers:

| Table | Column | On delete | Whose |
| --- | --- | --- | --- |
| `users` | `auth_id` | **set null** | player |
| `accounts` | `auth_id` | **set null** | player |
| `username_change_attempts` | `requester_auth_id` | **set null** | player |
| `username_change_audit` | `changed_by_auth_id` | **set null** | player |
| `category_blitz_submissions` | `auth_id` | **cascade** | player |
| `category_blitz_session_participants` | `auth_id` | **cascade** | player |
| `venue_owners` | `auth_id` | **cascade** | owner |

(`category_blitz_submissions` was declared as `scategories_submissions` in
`20260628130000_scategories.sql` and renamed by
`20260628170000_rename_scategories_to_category_blitz.sql`. The tripwire replays
that rename by hand — a regex walk sees the name in the CREATE TABLE.)

This makes the finding **worse, not better**, and it changes Phase 6's job:
deleting an orphaned `auth.users` row does not only risk detaching a player's
identity, it can **CASCADE-delete their Category Blitz gameplay rows**. The
plan's triple guard (no `venue_owners`, no `accounts`, no `users`) is a good
approximation — a player almost always has a `users` or `accounts` row, and both
cascade tables carry a `user_id NOT NULL` — but it is an approximation, and it
is now cheap not to make one. **Check all seven.**

`tests/lib.auth-users-fk-guard.test.ts` pins the set, the per-table on-delete
rule, and that `venue_owners` is the only partner-credential consumer. An eighth
consumer fails it with the guard it invalidates named in the message.

The standing prohibition is now written in **three** places, deliberately: this
plan, `CLAUDE.md` (its own top-level section, above "Architecture & Database
Patterns"), and a block comment on the exact branch in
`app/api/owner/signup/route.ts` that is tempted to violate it.

##### 2. Item 1(a): the orphan 409 tells the truth

`route.ts`'s `already registered` branch. Reaching it means the
`venue_owners`-by-email pre-check found nothing **and** Supabase still says the
email is taken — so the route knows there is no owner profile and
`/owner/login`'s 401 is guaranteed. It now returns support-contact copy
(`partnerships@hightopchallenge.com`, the only real address in the product,
from `app/info/page.tsx:789`) and logs `[OwnerSignup] orphan-auth-user` with the
email.

**The `email_taken` code is kept** — the client renders `payload.error` verbatim
as the footer hint (`SignupWizard.tsx:168`), so this needed no client change, and
`code: "email_taken"` is what routes it away from the "Is this your venue?"
branch at line 157. The test asserts the new copy, the kept code, *and* that
`deleteUser` was never called on this path.

##### 3. Item 2: `SIGNUP_FIELD_LIMITS`, and where it is enforced

`lib/selfServeSignup.ts` — the same module holding the shared validation, so the
wizard's `maxLength` and the server gate read one number. Values are the plan's
suggested table verbatim.

Enforcement is **inside `signupStepIssue`**, not in a separate server-only check.
That is the load-bearing choice: `validateSignupDraft` loops the steps, so the
route gets it for free, *and* the wizard surfaces an over-length field as a
footer hint on the screen that collected it — the "one rule set" property Phase 4
established. Two ordering details:

- **The email length check runs BEFORE `EMAIL_PATTERN`.** A megabyte-long local
  part still matches that pattern; it is not a size gate.
- **`state` and `placeId` get their own messages.** `"That state is too long"` is
  useless; it says `"Use the two-letter state abbreviation (CO, TX…)"`. `placeId`
  is never typed by a partner, so an over-length one means the lookup or the body
  is malformed, and the only actionable instruction is "search for your address
  again."

**Reject, never truncate** — per the plan. Pinned by a test asserting the limit
number appears in the 400's message, and by a companion test that every field at
*exactly* its limit still returns 200.

The five wizard inputs now read `SIGNUP_FIELD_LIMITS.*` instead of literals
(`NameStep`, `EmailStep`, `PasswordStep`, `AddressStep` ×5). One of them moved:
`PasswordStep` was `maxLength={128}` and is now 200. **`AddressStep.tsx:145` was
deliberately left at a literal 200** — that is the Places *search* box, not a
draft field, and it is separately capped by `/api/signup/places`'s
`MAX_QUERY_LENGTH`. Do not "finish the job" by pointing it at
`SIGNUP_FIELD_LIMITS`.

##### 4. Item 2's body cap: `readBoundedBody`, and what it does not do

`SIGNUP_MAX_BODY_BYTES = 16 * 1024`. `readBoundedBody` checks `Content-Length`
**first** and returns a 413 before the body is read at all, then re-checks the
decoded length because the header is absent on a chunked request and is in any
case caller-supplied.

**The second check buffers what it rejects.** That is a deliberate trade, stated
in the code: refusing a header-less 100 MB POST without buffering means
hand-rolling a streaming reader over `request.body`, and every real client
(browser `fetch` with a string body, `curl`) sets the header. If someone later
wants the strict version, that is where to put it.

The 413 costs a rate-limit slot — the limiter runs before the body is read, and
an oversized body is exactly the shape a scripted abuser sends. Pinned.

##### 5. Item 3: the route half shipped, the migration did **not**

`route.ts` now catches `23505` on the `venue_owner_venues` insert and converts it
to the existing 409 `venue_claimed` (unwinding first). It is **gated on
`claimTarget`**: a freshly created venue cannot collide, because nobody can hold
a link to an id that did not exist a moment ago — so a 23505 on the create path
is a real, unexplained failure and must stay a 500. Both branches are pinned.

**The migration shipped too**, after the precondition was verified against
production rather than assumed:

```
$ npm run signup:check-claim-precondition
venue_owner_venues rows: 4
distinct venues:         4
venues with >1 owner:    0
CLEAN — safe to ship the venue_owner_venues(venue_id) unique index.
```

`supabase/migrations/20260907140000_venue_owner_venues_unique_venue.sql` adds
`create unique index if not exists venue_owner_venues_venue_id_key on
public.venue_owner_venues (venue_id)`. The 23505 branch above is inert until this
is applied and live afterwards.

**`scripts/check-venue-owner-duplicates.cjs` / `npm run
signup:check-claim-precondition` is the permanent version of that check.**
PostgREST cannot GROUP BY, so it pages the (small) table and groups in JS; it is
read-only, and it exits 2 with the offending venues listed if the answer ever
stops being clean. Re-run it before dropping and rebuilding this index. It
follows the repo's existing `node --env-file=.env.local` convention, which is how
every other production-touching script here gets its credentials.

##### 6. Item 4: the two one-liners

- `findNearbyVenue` now does `.order("latitude", { ascending: true }).limit(200)`.
  Robustness, not a live bug — a 300 m box does not hold 200 venues — but an
  arbitrary slice could miss the nearest match and create a duplicate venue
  instead of offering the claim. Pinned by a test that reads the recorded
  `.order` call.
- `createAdminVenue`'s venue-id uniqueness loop (`lib/admin.ts`) now throws after
  50 collisions instead of `while (true)`-ing around a network call. **This is a
  shared admin path, not signup-only** — the new error is
  `"Could not generate a unique venue id. Try a more distinct venue name."`, and
  50 collisions on one name is a data problem, not a naming one.

##### 7. Deviations from the plan text

1. **Seven FK consumers, not three** (§1 above). The plan's number was wrong; the
   tripwire asserts reality and the Phase 6 guard must widen.
2. **Item 1(b) is not in this phase** — it never was; the plan assigns the sweep
   reconciliation to Phase 6, and this phase only supplies the tripwire and the
   prohibition it depends on.
3. **The item 3 migration shipped after all.** It was initially deferred as
   blocked on production access; the precondition is answerable from the repo via
   `npm run signup:check-claim-precondition` (§5 above), it returned clean, and
   the migration went in the same phase as the route half. Nothing about Phase 5a
   is outstanding.

---

**Handoff notes for Phase 6 (Opus 5 — payment handoff, unhide, sweep):**

Phase 5's seven handoff notes all still stand unchanged. These are **in addition**
to them, not a replacement — read both lists.

8. **Your orphaned-auth-user guard must check SEVEN tables, not three.** The
   plan's §1 text says `{venue_owners, accounts, users}`; that set is wrong and
   the as-built table in §1 above is right. Two of the four extra consumers are
   `ON DELETE CASCADE`, so an under-guarded delete does not merely detach a
   player's identity — it **deletes their Category Blitz submissions and
   participant rows**. Before deleting an `auth.users` row, assert no row
   references it in: `venue_owners`, `accounts`, `users`,
   `username_change_attempts`, `username_change_audit`,
   `category_blitz_submissions`, `category_blitz_session_participants` — plus the
   24h age check. `tests/lib.auth-users-fk-guard.test.ts` is the list's source of
   truth; if it fails after a migration, your sweep is the thing that broke.
9. **Log-only for one week**, per the plan, and grep `[OwnerSignup]
   orphan-auth-user` to size the problem before enabling deletion. That log line
   exists now and carries the email.
10. **`unwind()` in `app/api/owner/signup/route.ts` is still the reference
    teardown** (Phase 5 note 5), and it is unchanged by this phase apart from the
    23505 branch that calls it.

11. **Query production rather than assuming it.** The repo has a first-class way
    to do this — `node --env-file=.env.local scripts/<name>.cjs`, the convention
    every other production-touching script uses (see `package.json`). It loads
    the service-role key without the key being read or printed. Phase 5a used it
    to settle the §3 precondition and to verify the two facts below. **Do not
    write a handoff note asking Andrew to run SQL by hand when this exists.**
12. **The `self_serve_created_at is not null` reveal guard is verified against
    real data, not just reasoning.** Production has exactly **two** hidden venues
    today, and both are Category Blitz global rooms
    (`category-blitz-global-room` and `hc-cbz-live` — note there are TWO, both at
    (0, 0), both with `self_serve_created_at = null`). So today a plain
    `hidden = true` predicate in either the reveal or the sweep would match the
    global rooms and nothing else. **Keep the stamp guard** (Phase 5 note 2); it
    is currently the only thing separating those two rows from a self-serve one.
13. **Phase 5a §3 is done** — the `venue_owner_venues (venue_id)` unique index
    shipped as `20260907140000_venue_owner_venues_unique_venue.sql`. Nothing is
    blocked on you for it. Re-run `npm run signup:check-claim-precondition` only
    if that index ever has to be dropped.

**Handoff note for Phase 7 (runbook):** Phase 5's three facts stand, plus four.
(d) `POST /api/owner/signup` now has a **413** response (body over 16 KB) and a
**400** for any over-length field — support should know these are refusals, not
bugs, and that nothing is ever silently truncated. (e) The orphaned-auth-user
409 points partners at `partnerships@hightopchallenge.com`; support's answer is
to delete the stale `auth.users` row **only after** confirming it has no row in
any of the seven FK tables in §1 (or to wait for Phase 6's sweep). (f) Record the
known limit the plan calls out explicitly: **one venue per email** — a partner
with two bars gets `email_taken` on the second, and the answer is "admin adds the
second venue via Activate-a-Venue", not "it's broken". (g) The `venue_owner_venues`
precondition result — 4 rows, 4 venues, 0 duplicates as of 2026-09-07 — is
recorded in the migration header and reproducible via `npm run
signup:check-claim-precondition`; copy it into the runbook.

**Handoff note for Phase 8 (contract tripwires):** Phases 4 and 5's lists stand,
plus: `SIGNUP_FIELD_LIMITS` and `SIGNUP_MAX_BODY_BYTES` join
`SIGNUP_DUPLICATE_RADIUS_METERS` and the 50/200 radius bounds in the "only
defined in `lib/selfServeSignup.ts`" assert — and add the converse, that
`components/signup/steps/*.tsx` contains no bare numeric `maxLength` except
`AddressStep.tsx`'s Places search box (§3 above says why that one is exempt). Do
not duplicate `tests/lib.auth-users-fk-guard.test.ts`; it owns the FK question
outright.

---

### Phase 6 — Payment handoff, unhide, and sweep
**Model: Opus 5 · Effort: Medium-High** *(billing code — the riskiest surface in the repo)*

- On signup success the client immediately POSTs `/api/owner/billing/checkout`
  with the new `venueId` and redirects. **No changes to that route** — its
  double-bill guards are load-bearing and were hardened over ten phases.
- **Webhook: unhide on first activation.** In `runFirstSyncFollowers`
  (`app/api/webhooks/stripe/route.ts:475`), alongside `maybeSendWelcomeEmail`,
  add `maybeRevealVenue(sub)`: on first sync, set `hidden = false` where
  `venue_id` matches and `self_serve_created_at is not null`. Idempotent, never
  throws — same contract as the welcome email. The `self_serve_created_at` guard
  is what stops it ever unhiding the Category Blitz global room.
- **Cancellation does not re-hide.** A lapsed subscriber's venue staying visible
  is an existing product question, not this plan's — do not change it here.
- **Abandoned-signup sweep.** New cron `/api/cron/signup-sweep` (daily, added to
  `vercel.json` — flag it for Andrew to add, do not alter cron config unasked):
  delete venues where `hidden = true` and `self_serve_created_at < now() - 7 days`
  and no `billing_subscriptions` row, plus their owner rows and auth users.
  **Must respect `test:venue-fk-guard`'s cascade rules.** Dry-run mode first;
  ship logging-only for one week before enabling deletion.
- Welcome email: already correct, no work. Confirm `venue.name` reads well when
  it came from a Places business name.

**Verify:** `tests/api.webhooks.stripe.reveal-venue.test.ts` (first sync unhides,
retry is a no-op, non-self-serve venue untouched), `tests/api.cron.signup-sweep.test.ts`.
Then a **live Stripe test-mode run end to end** — this cannot be unit-tested away.

#### Phase 6 — As-built (2026-09-07, Opus 5)

**Shipped.** `npx tsc --noEmit`, `npm run lint`, `npm run build` and `npm run test`
(**2148 passed / 227 files** — Phase 5a's 2090 plus 10 in
`tests/api.webhooks.stripe.reveal-venue.test.ts`, 35 in
`tests/api.cron.signup-sweep.test.ts` and 3 added to
`tests/lib.email.welcomeEmail.test.ts`; the 13 skipped are still the pre-existing
`tests/api.nfl-pickem.test.ts` block) all clean. `npm run test:venue-fk-guard` (2),
`npm run test:god-mode-join` (34) and `tests/lib.auth-users-fk-guard.test.ts` (4)
pass untouched.

**No migration.** Phase 0's `venues.self_serve_created_at` and `signup_attempts`
are still everything this flow needs.

**Deletes nothing on deploy.** The two sweep jobs ship LOG-ONLY behind their own
env flags — `SIGNUP_SWEEP_DELETE_ENABLED` and `SIGNUP_SWEEP_AUTH_DELETE_ENABLED`,
neither set anywhere. The only thing the cron deletes out of the box is expired
`signup_attempts` rows, which nothing reads.

---

##### 1. THE FINDING: the plan's orphan guard would have deleted 765 PLAYER sessions

This is the reason to read this section before touching the sweep.

Phase 5a §1 established that an `auth.users` row may belong to a player, and
widened the guard from three tables to seven. That was right and it was still not
enough. Queried against production on 2026-09-07 (`npm run
signup:check-orphan-auth-users`, a new read-only script):

```
auth.users scanned: 966
  venue_owners.auth_id:                        4 references
  accounts.auth_id:                          106
  users.auth_id:                             160
  username_change_attempts.requester_auth_id:  0
  username_change_audit.changed_by_auth_id:    0
  category_blitz_submissions.auth_id:       1849
  category_blitz_session_participants.auth_id: 0

orphans (referenced by NONE of the seven):   768
  emailless — anonymous PLAYER sessions:     765
  with an email — candidate signup debris:     3
```

**79% of every `auth.users` row in production is an orphan by the seven-table
test, and every one of those is a player.** `lib/auth.ts:89`'s
`signInAnonymously()` — three call sites in `components/join/JoinFlow.tsx` (1389,
1742, 2621) — mints an emailless `auth.users` row for every anonymous visit, and a
visitor who never finishes joining a venue never gets an `accounts` or `users`
row. The plan's predicate ("no `venue_owners`, no `accounts`, no `users`, older
than 24h") matches all 765 of them exactly.

The guard that makes the job safe is therefore **not** in the plan at all:

> **The orphan sweep only ever considers an auth user that HAS AN EMAIL.**

`POST /api/owner/signup` always sets one (`createUser({ email, password,
email_confirm: true })`); `signInAnonymously()` never does. That single filter
takes the candidate set from 765 to 3. Do not remove it, and do not "generalize"
the job to clean up anonymous sessions — that is a different job with a different
risk profile and it is not in this plan.

The remaining 3 are `sim-cb-legacy-8dc0992c@example.invalid` and two
`backfill_*@tp-auth-backfill.internal` — fixtures and a backfill artifact, not
partners. They are excluded by a second filter on **reserved, non-routable
domains** (RFC 2606 / 6761: `.invalid`, `.internal`, `.test`, `.example`,
`.localhost`). With both filters production has **zero** sweep-eligible orphans
today, which is the correct answer.

And a third guard, because the two above are judgment and judgment goes stale:
**`ORPHAN_MAX_DELETES_PER_RUN = 25`.** More candidates than that in one run and
the job deletes *nothing*, logs `[SignupSweep] orphan-scan-exceeded-cap`, and
returns. The premise of the job is that owner-signup debris is rare; a large
candidate set means some code path is minting emailed auth users this sweep does
not understand, and the right response to that is to stop, not to proceed 25 at a
time.

---

##### 2. `maybeRevealVenue` — one more first-sync follower

`app/api/webhooks/stripe/route.ts`. Added to `runFirstSyncFollowers` **ahead of**
`maybeSendWelcomeEmail`, so the venue is live before the email tells the partner
it is. Same contract as the welcome email: only on a write that really happened
AND is that subscription's first sync, idempotent, never throws.

```
update venues set hidden = false
  where id = <sub.metadata.venueId>
    and hidden = true
    and self_serve_created_at is not null
```

Three notes:

- **The `self_serve_created_at is not null` guard is the whole safety story.**
  Re-verified against production this phase: the only hidden venues are
  `category-blitz-global-room` and `hc-cbz-live`, both stamp-null, both at (0,0).
  A plain `hidden = true` predicate would put an internal pooling room in every
  player's venue list. `tests/api.webhooks.stripe.reveal-venue.test.ts` asserts
  the literal filter is present in the source, because a fixture cannot prove a
  filter exists.
- **Idempotence comes from `hidden = true` being in the predicate**, not from a
  separate sent-at column. A retry matches zero rows.
- **The stamp is NOT cleared on reveal.** It is the row's provenance, and it costs
  nothing: the sweep cannot reap a revealed venue anyway (it requires `hidden =
  true` *and* no `billing_subscriptions` row, and a paid venue fails both — note a
  *cancelled* subscriber still keeps its row, which is exactly why the sweep's
  billing predicate is "has no row" rather than "has no active row").

---

##### 3. `lib/signupSweep.ts` + `/api/cron/signup-sweep`

The route is thin; the logic is in `lib/signupSweep.ts` so it is testable and so
`AUTH_USER_FK_CONSUMERS` has one home. Three jobs per run:

1. **`pruneSignupAttempts()`** — Phase 1 exported it and nothing called it, so
   `signup_attempts` grew unbounded. Always on; it deletes only expired
   rate-limit rows.
2. **`sweepAbandonedSignupVenues()`** — `hidden = true` AND
   `self_serve_created_at < now() - 7 days` AND no `billing_subscriptions` row.
   Exactly the plan's predicate, and deliberately **no** filter on
   `venue_owner_venues` (Phase 5 handoff note 3: every venue this flow creates has
   a link row, so that filter would mean the sweep reaps nothing, ever).
3. **`reconcileOrphanedAuthUsers()`** — §1 above.

**Deletion order is venue → `venue_owners` → auth user**, matching `unwind()` in
`app/api/owner/signup/route.ts`, which remains the reference teardown. Deleting
the venue cascades every `venue_id` FK (`tests/lib.venue-fk-cascade-guard.test.ts`
proves none is RESTRICT), which is why the sweep reads a venue's owners *before*
the delete — the link rows go with it.

Four things it refuses to do, each pinned by a test:

- **It will not delete an owner who still holds another venue or another
  subscription.** An owner can legitimately hold more than one venue (an admin
  can add a second via Activate-a-Venue), so "their abandoned venue was swept"
  does not mean "delete the account."
- **It will not delete an auth user that any of the seven FK tables references** —
  a partner who also plays at their own bar shares that row. When the guard does
  not clear, the auth row is left behind on purpose and logged
  (`[SignupSweep] auth-user-kept`). An extra orphan beats a broken player.
- **Every read failure fails closed.** "I could not check" and "nothing
  references it" are opposite answers and never collapse into the same branch.
- **`SWEEP_MAX_VENUES_PER_RUN = 50`**, and going over it deletes *nothing* rather
  than an arbitrary 50 — same reasoning as the orphan cap.

`?dryRun=1` forces report-only on both sweeps regardless of the flags, so the job
can be exercised by hand against production without deleting anything. One
greppable `[SignupSweep] run …` summary line per run carries the counts.

**Deliberately NOT gated on `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED`**, unlike
every `/api/signup/*` route. Debris outlives a flag: if the wizard is switched on,
used, and switched back off, its hidden venues and stale attempts still need
collecting. The predicates scope this job, not the feature flag.

---

##### 4. `vercel.json` — ANDREW'S ONE-LINE CHANGE (not made)

Per CLAUDE.md, cron config was not touched. The entry to add:

```json
{ "path": "/api/cron/signup-sweep", "schedule": "0 8 * * *" }
```

Until it is added the route exists and is reachable with the `CRON_SECRET` bearer
token but never runs on its own — which is a fine state to sit in, since both
sweeps are log-only anyway.

---

##### 5. The payment handoff was left alone, on purpose

Phase 5's handoff note 1 recommended keeping `/owner/billing/setup` as the seam
rather than POSTing `/api/owner/billing/checkout` from the wizard. Taken. That
page owns the bfcache and double-tap hardening the plan itself calls load-bearing
(`app/owner/billing/setup/page.tsx` — `pageshow`+`persisted` filtering, `paying`
cleared only on a genuine restore), and duplicating the checkout POST in the
wizard would be a second, unhardened call site for the riskiest route in the repo.
`SignupWizard.submit()` is unchanged. **No changes to
`/api/owner/billing/checkout`**, as the plan requires.

---

##### 6. The welcome email needed a fix after all

The plan's line was "confirm `venue.name` reads well when it came from a Places
business name." It does not, and the reason is not cosmetic:
`lib/email/welcomeEmail.ts` interpolates `venueName` and `ownerName` into an HTML
string **unescaped**. That was fine when only an admin could set them. As of this
flow both are typed by an unauthenticated stranger on `/owner/signup`.

The everyday case is punctuation, not attack: **"Bar & Grill"** is one of the most
common bar names there is, and a bare `&` in HTML starts an entity reference.
`escapeHtml` now covers `& < >` on the HTML branch only.

- The **plain-text branch is deliberately left raw** — it is not markup, and
  escaping it would put a literal `&amp;` in front of the partner.
- **Quotes and apostrophes are deliberately NOT escaped.** Both values land in
  element text, never in an attribute, so they need no escaping there, and
  "Joe's Bar" / "O'Neil" are common enough that `&#39;` everywhere would be noise
  for nothing.

Three tests in `tests/lib.email.welcomeEmail.test.ts` pin it, including that the
text part stays literal.

---

##### 7. New script: `npm run signup:check-orphan-auth-users`

`scripts/check-orphaned-auth-users.cjs`, read-only, same
`node --env-file=.env.local` convention as `signup:check-claim-precondition`. It
runs the sweep's exact predicate and prints the split from §1 (emailless vs
emailed, by month, with a sample). It exits 2 when anything is sweep-eligible.

**This is the dry run for `SIGNUP_SWEEP_AUTH_DELETE_ENABLED`** — the plan's
"log-only for one week" in a form that does not require waiting a week. Run it
before that flag is ever set, and understand every address it lists.

---

##### 8. Tests

- `tests/api.webhooks.stripe.reveal-venue.test.ts` (10) — first sync unhides;
  the update is scoped by venue id and by `hidden = true`; the stamp guard is
  present in the source; a later state change on a tracked subscription is a
  no-op; an unsettled subscription reveals nothing; no `venueId` metadata is a
  no-op; a reveal error and a reveal throw both still return 200 and still send
  the welcome email; and `maybeRevealVenue` runs before `maybeSendWelcomeEmail`.
- `tests/api.cron.signup-sweep.test.ts` (35) — the cron gate; pruning always
  runs; both sweeps' dry-run/enabled split and their independence; every refusal
  in §3; the emailless / reserved-domain / under-24h orphan filters; a
  parameterised case per FK consumer (`it.each` over `AUTH_USER_FK_CONSUMERS`, so
  an eighth table gets a test for free); both caps; and `?dryRun=1` overriding
  each flag. The Supabase mock models the real `ON DELETE CASCADE` on
  `venue_owner_venues.venue_id`, because the sweep's owner-cleanup branch is
  unreachable without it.

---

**Handoff notes for Phase 7 (Sonnet 5 — cutover):**

Phase 5's three runbook facts (a)–(c) and Phase 5a's (d)–(g) all still stand.
These are in addition.

1. **`docs/self-serve-signup-runbook.md` is yours to write, and Phase 6 adds two
   env vars to it** — `SIGNUP_SWEEP_DELETE_ENABLED` and
   `SIGNUP_SWEEP_AUTH_DELETE_ENABLED`, both absent, both `1|true|yes|on` to
   enable, **both to stay absent at cutover**. They are not part of flipping the
   feature on; they are enabled later, separately, after a week of reading the
   sweep's log lines. Say plainly that the second one is the dangerous one and
   that `npm run signup:check-orphan-auth-users` must return clean first.
2. **Flag Andrew's `vercel.json` cron entry in the runbook** (§4 above). It is
   one line and it is his to make; nothing else in Phase 6 needs it.
3. **Record the §1 finding in the runbook in one sentence**, because it is the
   thing support will get wrong: *an `auth.users` row with no email is an
   anonymous player session, never a partner, and must never be deleted to "fix"
   a signup.* Phase 5a's (e) tells support to delete a stale auth row after
   checking the seven FK tables — that advice is still right for an **emailed**
   row and would be actively harmful applied to an emailless one.
4. **`GET /api/cron/signup-sweep?dryRun=1` is the safest smoke test you have**
   for the whole data model — it exercises the venue predicate, the seven-table
   guard and the ledger prune without writing anything but the prune. Put it in
   the smoke-test list next to the four route checks.
5. The reveal has **no observable outside the webhook**. Do not write a runbook
   step that says "check the venue appears after signup" — it appears after
   *payment*, and on the 3-D Secure path that is a different Stripe event than
   the happy path. `docs/self-serve-signup-device-checklist.md` §8a has the
   correct wording.

**Handoff notes for Phase 8 (Sonnet 5 — contract tripwires):**

Phases 4, 5 and 5a's lists all stand, plus:

6. **Assert the sweep's guards statically, not just behaviorally.**
   `lib/signupSweep.ts` must contain the email filter and the seven-table list,
   and `AUTH_USER_FK_CONSUMERS` must equal `EXPECTED` in
   `tests/lib.auth-users-fk-guard.test.ts` — those two lists are maintained by
   hand in two files and an eighth FK consumer must fail loudly in both. That is
   the single highest-value tripwire this phase leaves you.
7. **`app/api/cron/signup-sweep/route.ts` must call `isCronAuthorized`** and must
   NOT import `isSelfServeSignupEnabled` (§3 explains why it is deliberately
   ungated) — worth pinning so a future reader does not "fix" the missing flag.
8. Do not duplicate `tests/api.cron.signup-sweep.test.ts` or
   `tests/api.webhooks.stripe.reveal-venue.test.ts`; between them they own the
   sweep's refusals and the reveal's guard.

**Still open after Phase 6** (neither is a Phase 6 defect):

- **Re-hiding a lapsed subscriber's venue** — explicitly out of scope per the
  plan, still is. A cancelled subscriber's venue stays visible.
- **One venue per email** — Phase 5a's known limit, unchanged.

---

### Phase 7 — Cutover
**Model: Sonnet 5 · Effort: Low-Medium**

- `/owner/register` redirects to `/owner/signup` when the flag is on; keeps
  today's venue-lookup behavior when off.
- `/owner/login`'s "Create one" link and `/info`'s partner CTA point at
  `/owner/signup` (via `marketingHref` where they cross the domain boundary).
- Add a prominent partner CTA to `/info` — today the only way in is
  Partner Login → "Create one", which is buried.
- Docs: update `SYSTEM_CONTEXT.md` §0 and `CLAUDE.md` to say venue activation is
  no longer an admin prerequisite; note admin Activate-a-Venue survives for ops.
- Write `docs/self-serve-signup-runbook.md`: env vars, the Google Maps referrer
  restriction, flag-on order, smoke tests, and the one-flag reversal.

**Verify:** `npm run build`, `npm run test`, `npm run lint`.

#### Phase 7 — As-built (2026-09-07, Sonnet 5)

**Shipped.** `npx tsc --noEmit`, `npm run lint`, `npm run build` and `npm run test`
(**2138 passed / 226 files + 1 skipped file**; the 13 skipped tests are still the
pre-existing `tests/api.nfl-pickem.test.ts` block, nothing newly skipped) all
clean. No new test file — Phase 7 is wiring + docs; Phase 8 owns the contract
tripwires.

**Still inert.** `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` is still absent from every
`.env`. With the flag off (today): `/owner/register` renders the legacy
venue-lookup form exactly as before, `/owner/signup` and every `/api/signup/*`
route 404, and `signupEntryPath()` resolves to `/owner/register` so the new
`/info` and `/owner/login` links point there. Nothing about the running product
changed.

##### 1. `lib/selfServeSignup.ts` — new `signupEntryPath()`

`signupEntryPath()` returns `"/owner/signup"` when the flag is on, else
`"/owner/register"`. It is the ONE place that decides where "create an owner
account" points, and it calls `isSelfServeSignupEnabled()` (still the single env
reader — `signupEntryPath` is a helper beside it, not a second reader). `/owner/*`
stays on the apex through the domain split (only `/` relocates), so the return is
always a bare relative path — no `marketingHref` wrapping, contrary to the plan
text's "(via marketingHref where they cross the domain boundary)": there is no
boundary to cross here.

##### 2. `/owner/register` is now a server component that redirects

`app/owner/register/page.tsx` became a **server** component (mirroring
`app/owner/signup/page.tsx`): `if (isSelfServeSignupEnabled()) redirect("/owner/signup")`,
else render the legacy form. The client form moved verbatim to
`components/owner/OwnerRegisterForm.tsx` (`"use client"`, exported as
`OwnerRegisterForm`) — byte-identical behavior, only the file boundary changed.
Both `/owner/register` and `/owner/signup` build as `○ (Static)`, so the flag —
a build-time-inlined `NEXT_PUBLIC_*` value — **only takes effect on redeploy**;
the four API routes are dynamic and switch without one. This is the deploy-skew
the client's 404 special-case already covers.

##### 3. `/owner/login` "Create an account" link

`app/owner/login/page.tsx` now imports `signupEntryPath` and uses it as the
`Link href`. Nothing else on that page changed; its "Back to Home Page" still
targets `marketingHref("/info")`.

##### 4. `/info` — prominent partner CTAs (`app/info/page.tsx`)

Before Phase 7 the only route to signup from the marketing home was Partner Login
→ "Create an account", two clicks deep. Added, all pointed at `SIGNUP_HREF`
(a module const = `signupEntryPath()`):

- **Hero:** the second primary button changed from "Partner Venue Login" to
  **"Get Your Venue Started"** (→ signup). Partner *login* moved down to an
  unobtrusive outline link ("Already a partner? Sign in") in the second button
  row next to "See the Games".
- **Sticky nav (desktop):** "Partner Login" demoted to a plain text link, and a
  solid cyan **"Get Started"** button (→ signup) added beside it.
- **Mobile menu:** "Partner Login" stays as a text link; a full-width **"Get Your
  Venue Started"** button (→ signup) added below it.
- **Pricing card:** the "Get Started" button's `href` changed from `#contact` to
  `SIGNUP_HREF`, with a new one-line "Prefer to talk first? Contact us." caption
  beneath it so the contact form is still one tap away.

The contact form, its section, and the "More coming soon → Contact us" card are
untouched — the plan keeps the contact path, it just stops being the *only* path.

##### 5. Docs

- **`SYSTEM_CONTEXT.md` §0** — new bullet before "Terminology": partner
  self-serve signup ends the admin-activation prerequisite; the wizard's shape;
  the flag; **admin Activate-a-Venue survives for ops** (offline billing, second
  venue per owner, support). Links the plan + the new runbook.
- **`SYSTEM_CONTEXT.md` "Partner / Owner surface"** — `/owner/signup` added to the
  pages list, with the note that it does NOT use `OwnerShell` (it is a full-bleed
  `SignupShell` takeover in `FULLSCREEN_PATHS`), and that `/owner/register` is now
  a redirect-or-legacy-form server component.
- **`CLAUDE.md`** — new `## Partner Self-Serve Signup` section before the
  `auth.users` prohibition: the wizard, the flag + single reader + build-time
  inlining, Activate-a-Venue surviving, the public Google-billed routes + the
  referrer restriction (Risk #1), and the un-flag-gated log-only sweep with the
  "emailless auth user = player, never delete" rule.
- **`docs/self-serve-signup-runbook.md`** — new. Sections: mental model + instant
  reversal; the env-var table (master flag set to `1`; `SIGNUP_SWEEP_*` stay
  absent); the Google Maps referrer restriction (with the admin-venue-form
  re-verification); migration-before-flag for future environments; the ordered
  cutover; the sweep's separate later enablement gated on
  `npm run signup:check-orphan-auth-users` returning clean; flag-off and flag-on
  `curl` smoke tests for all four routes plus the `?dryRun=1` data-model check;
  a support-notes section (413 / 400 / `email_taken` / orphan-409 / 429-vs-503);
  and the two known-open non-defects. Folds in Phase 5's runbook facts (a)–(c),
  Phase 5a's (d)–(g), and Phase 6's five Phase-7 handoff points.
- **`docs/self-serve-signup-device-checklist.md`** — one line added to the
  prerequisites block pointing at the runbook for the ordered ops steps.

##### 6. Deliberately NOT done

- **Setting any env var** — the agent never touches `.env*`. The runbook is the
  handoff. Andrew set `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED=1` (`.env` + Vercel)
  on 2026-09-07; `GOOGLE_MAPS_BROWSER_KEY` is still his to create and set (§7).
- **The contract tripwire test** — that is Phase 8's, and Phase 8's handoff notes
  (below, and in Phases 4/5/5a/6) already enumerate every assertion.

##### 7. Follow-up (2026-09-07, same session) — cron entry + the Maps key split

Andrew asked for the two "someone else does this" items to be done directly.

- **`vercel.json`** — added `{ "path": "/api/cron/signup-sweep", "schedule": "0 8 * * *" }`
  (daily 08:00 UTC), on his explicit instruction (CLAUDE.md's "do not alter
  unasked" is now satisfied). Vercel attaches the `CRON_SECRET` bearer
  automatically, same as the other 14 crons. Both sweep jobs are still log-only,
  so this only starts the daily `[SignupSweep] run …` line and the
  `signup_attempts` prune.
- **The Google Maps key is now a two-key model** (`lib/googleMapsKeys.ts`, new).
  The plan's Risk #1 said "add an HTTP-referrer restriction to
  `GOOGLE_MAPS_API_KEY`" — but that **single key is also used server-side** by
  `lib/geolocation.ts` (Places v1), the `venue-map` routes (Static Maps) and
  `/api/admin/places`, and a server `fetch` carries no `Referer`, so a referrer
  restriction would 403 every one of those (admin venue map, player join-flow
  address lookup, the signup server routes). The correct split:
  - `browserGoogleMapsKey()` → `GOOGLE_MAPS_BROWSER_KEY` (referrer-restricted;
    served to strangers by `/api/signup/maps-key`), **falling back to
    `GOOGLE_MAPS_API_KEY` when unset** — so this commit changes nothing until
    Andrew sets the new var.
  - `serverGoogleMapsKey()` → `GOOGLE_MAPS_API_KEY` (server-only, must NOT be
    referrer-restricted).
  - `app/api/admin/maps-key/route.ts` and `app/api/signup/maps-key/route.ts` now
    call `browserGoogleMapsKey()`. The server routes are untouched (they already
    read `GOOGLE_MAPS_API_KEY` directly, which is now formally the server key).
  - `.env.example` documents both; runbook §2 has the details.
    `tests/api.signup.rate-limit.test.ts` still passes unchanged (it sets
    `GOOGLE_MAPS_API_KEY`, which the fallback returns).
  - `CLAUDE.md`'s signup section updated to describe the two keys.
- **The browser key now exists** (created via `gcloud` on 2026-09-08, project
  `hightop-challenge`): `hightop-maps-browser`, uid
  `ed2e8331-c7dd-4608-aed3-85383d0ae56f`, referrer-restricted to our hosts +
  `*.vercel.app` + `localhost:3000`, API target Maps JavaScript API only. Also
  enabled **Maps Static API** on the project — it was missing, which would have
  broken the review-step thumbnail *and* the existing admin venue-map. The server
  key ("Maps Platform API Key", uid `38c3…`) was left untouched. The only
  outstanding step is Andrew setting `GOOGLE_MAPS_BROWSER_KEY` in `.env` + Vercel
  and redeploying — until then the fallback keeps serving the server key, so the
  flag must stay off. Full detail + the `get-key-string` command: runbook §2.

**Handoff notes for Phase 8 (Sonnet 5 — contract tripwires + device sign-off):**

All prior phases' Phase-8 handoff notes still stand (Phases 1, 4, 5, 5a, 6). Net
additions from Phase 7:

1. **`signupEntryPath` is the only new surface.** If Phase 8's "flag read in
   exactly one file" assertion greps for `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED`,
   it still passes — `signupEntryPath` calls `isSelfServeSignupEnabled()`, it does
   not re-read the env. Assert that `lib/selfServeSignup.ts` is still the only
   file containing the literal env-var name.
2. **`app/owner/register/page.tsx` must NOT import `requireAdminAuth`** and is a
   server component that imports `isSelfServeSignupEnabled` — worth a line if the
   tripwire already enumerates the owner/signup route surface.
3. **`components/owner/OwnerRegisterForm.tsx` is legacy-only.** It is rendered
   solely by the flag-off branch of `/owner/register`. No new test needed; the
   existing `tests/admin-mobile.address-lookup-sequencing.test.ts` etc. do not
   touch it, and the two-step lookup flow was already un-tested before Phase 7.
3a. **`lib/googleMapsKeys.ts` (follow-up §7).** Optional tripwire: `browser` vs
   `server` key helpers exist, `/api/signup/maps-key` and `/api/admin/maps-key`
   call `browserGoogleMapsKey()` (not `process.env.GOOGLE_MAPS_API_KEY` directly),
   and no `/api/signup/*` route ever returns `serverGoogleMapsKey()`. Low value —
   the split is documented and the fallback makes a mistake here non-breaking, not
   silently insecure.
4. Device checklist: nothing new to run for Phase 7 specifically — the CTA links
   are covered by §5 (navigation) and §1 (takeover) once the flag is on. Andrew
   still owns the file.

**Still open after Phase 7** (unchanged, neither a Phase 7 defect):

- Re-hiding a lapsed subscriber's venue — out of scope per the plan.
- One venue per email — Phase 5a's known limit.

---

### Phase 8 — Test pass and device sign-off
**Model: Sonnet 5 · Effort: Medium**

- `tests/self-serve-signup-contract.test.ts` — static tripwires: the signup route
  never imports `requireAdminAuth`; every `/api/signup/*` route calls the rate
  limiter; signup radius bounds are not hardcoded anywhere but
  `lib/selfServeSignup.ts`; the wizard renders `WizardFooter`, not raw
  `NextButton`/`StepBackButton`.
- Full suite: `npm run test`, `npm run test:god-mode-join` (join flow reads the
  venue list this plan writes to), `npm run test:venue-fk-guard`,
  `npm run test:pwa-contract`.
- Andrew closes `docs/self-serve-signup-device-checklist.md` on a real phone.
  Nothing headless can sign this off.

#### Phase 8 — As-built (2026-09-07, Sonnet 5)

**Shipped.** `npx tsc --noEmit`, `npm run lint`, `npm run test`
(**2156 passed / 227 files + 1 skipped file**; the 13 skipped tests are still the
pre-existing `tests/api.nfl-pickem.test.ts` block, nothing newly skipped),
`npm run test:god-mode-join` (34), `npm run test:venue-fk-guard` (2) and
`npm run test:pwa-contract` (20) all clean. One new file:
`tests/self-serve-signup-contract.test.ts` — 18 tests.

**Still inert.** No `app/`, `lib/`, `components/` or `.env` change. Phase 8 is a
test file plus this note. `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` and
`GOOGLE_MAPS_BROWSER_KEY` state is exactly as Phase 7 left it (see "Outstanding"
below).

##### `tests/self-serve-signup-contract.test.ts` — what it pins

Static-only (reads source, strips comments first so prose naming `requireAdminAuth`
never trips a "must not appear" assert). Every check is a boundary that no
behavioural test would catch reopening at a call site.

1. **Route auth boundary** — for all four public surfaces
   (`app/api/signup/{maps-key,places,venue-map}/route.ts` **and**
   `app/api/owner/signup/route.ts`): no `requireAdminAuth` reference; imports
   `isSelfServeSignupEnabled` from `@/lib/selfServeSignup`; imports `rateLimit`
   from `@/lib/rateLimit`. Asserts the **import**, not an unconditional call —
   `places` (sub-3-char query) and `venue-map` (bad coordinates) deliberately
   return before the limiter so a request that never reaches Google burns no slot.
2. **Flag env var read once** — `process.env.NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED`
   appears in exactly one file under `app/` + `components/` + `lib/`:
   `lib/selfServeSignup.ts`. (The bare name in prose comments elsewhere is fine;
   the test greps for the `process.env.` prefix.)
3. **Radius bounds + field limits defined once** — `SIGNUP_RADIUS_MIN`,
   `SIGNUP_RADIUS_MAX`, `SIGNUP_DUPLICATE_RADIUS_METERS`, `SIGNUP_FIELD_LIMITS`,
   `SIGNUP_MAX_BODY_BYTES` each have their `const … =` assignment only in
   `lib/selfServeSignup.ts`. Plus: `GeofenceStep.tsx` passes `min={SIGNUP_RADIUS_MIN}`
   / `max={SIGNUP_RADIUS_MAX}` and no `min={50}`/`max={200}` literal props; and no
   `components/signup/**/*.tsx` carries a bare-numeric `maxLength={…}` **except**
   `AddressStep.tsx`'s one Places-box literal (that `<input>` is not a
   `SignupDraft` field, so it has no `SIGNUP_FIELD_LIMITS` entry — Phase 5a §3).
4. **The cron sweep stays un-flag-gated** — `app/api/cron/signup-sweep/route.ts`
   references `isCronAuthorized`, does **not** reference `isSelfServeSignupEnabled`
   (§3 of Phase 6 explains why the sweep must run with the flag off), and does not
   reference `requireAdminAuth`.
5. **`signup_attempts` has one writer** — only `lib/rateLimit.ts` contains
   `.from("signup_attempts")`.
6. **The sweep's `auth.users` guard is spelled out in code** — `lib/signupSweep.ts`
   keeps the `if (!email) continue` filter (an emailless auth row is an anonymous
   player, never a partner) and lists all seven `AUTH_USER_FK_CONSUMERS` table
   names. Does **not** duplicate `tests/lib.auth-users-fk-guard.test.ts`, which
   still owns the migration-level FK/on-delete question outright.
7. **`/owner/register` cutover** — the page redirects via `isSelfServeSignupEnabled`
   and never imports `requireAdminAuth`.
8. **The Google Maps key split** — both `app/api/signup/maps-key/route.ts` and
   `app/api/admin/maps-key/route.ts` call `browserGoogleMapsKey()` and neither
   reads `process.env.GOOGLE_MAPS_API_KEY` directly; no `/api/signup/*` route
   mentions `serverGoogleMapsKey`.
9. **Navigation primitives** — no `components/signup/*` file imports `NextButton`
   or `StepBackButton`; `SignupShell.tsx` imports `WizardFooter`. (Also covered
   globally by `tests/navigation-controls-contract.test.ts`; kept here as a
   feature-local guard, not triplicated into the motion test per Phase 3's note.)

**Deliberately NOT added**, per the earlier phases' explicit "do not duplicate"
notes: draft persistence / step gate (`tests/lib.signup-draft.test.ts`), motion
tokens + shell composition (`tests/components.signup-shell-motion.test.ts`), rate
limiter window/hash (`tests/api.signup.rate-limit.test.ts`), unwind/claim branches
(`tests/api.owner.signup.test.ts`), sweep refusals
(`tests/api.cron.signup-sweep.test.ts`), the reveal guard
(`tests/api.webhooks.stripe.reveal-venue.test.ts`), and the FK-set question
(`tests/lib.auth-users-fk-guard.test.ts`).

---

## Outstanding after Phase 8 (plan complete)

The build is done. Two ops steps and two accepted-scope gaps remain — none is a
code defect, and nothing here blocks the others.

### Ops steps to flip the feature on (order matters — `docs/self-serve-signup-runbook.md`)

1. **`GOOGLE_MAPS_BROWSER_KEY` is not set in `.env` / Vercel yet.** The key itself
   exists (`hightop-maps-browser`, created via `gcloud` 2026-09-08, uid
   `ed2e8331-c7dd-4608-aed3-85383d0ae56f`, referrer-restricted, Maps JS + Maps
   Static enabled). Until the env var is set and deployed, `browserGoogleMapsKey()`
   falls back to the **server** key `GOOGLE_MAPS_API_KEY`, which is *not*
   referrer-restricted — so `/api/signup/maps-key` would hand strangers an
   unrestricted key. **The flag must stay off until this var is set + deployed.**
   This is Risk #1.
2. **`NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED`.** Andrew set it to `1` in `.env` +
   Vercel on 2026-09-07, but it is a `NEXT_PUBLIC_*` value **inlined at build
   time** — `/owner/signup` and `/owner/register` build as `○ (Static)`, so it
   only takes effect on the next **redeploy**, and must not be redeployed live
   before step 1. The four API routes are dynamic and switch without a redeploy,
   which is the deploy-skew the wizard's client 404 special-case already covers.
3. **Migration** `20260907130000_partner_self_serve_signup_foundations.sql` — already
   applied to the Supabase project (`supabase db push`, 2026-09-07). Recorded here
   only as the order for any *future* environment: migration → referrer key → flag.
4. **`SIGNUP_SWEEP_DELETE_ENABLED` / `SIGNUP_SWEEP_AUTH_DELETE_ENABLED`** stay
   **absent** at cutover. The `/api/cron/signup-sweep` cron (`vercel.json`, daily
   08:00 UTC) is live but log-only. Enable the venue-delete half only after a week
   of reading `[SignupSweep]` log lines; enable the **auth**-delete half (the
   dangerous one) only after `npm run signup:check-orphan-auth-users` returns clean.
5. **Device checklist** `docs/self-serve-signup-device-checklist.md` — only Andrew
   can close it. §1–§7 need the flag on in a preview deploy. The sharpest open
   item is **§3 (autofocus / iOS soft keyboard)**: `AnimatePresence mode="wait"`
   focuses the incoming field ~260 ms after the tap and iOS Safari may refuse to
   raise the keyboard that far from the gesture. Fix order is in §3; do **not**
   apply any of it speculatively — headless testing reports success either way.

### Accepted-scope gaps (documented, not bugs)

- **Re-hiding a lapsed subscriber's venue** — out of scope per the plan. A
  cancelled subscriber's venue stays visible until an admin acts. **Now has its
  own plan:** `docs/lapsed-venue-rehide-plan.md` (drafted 2026-09-08, not
  started — deliberately queued behind this plan's code review and flag flip,
  because it touches the Stripe webhook).
- **One venue per email** — Phase 5a's known limit. A second venue for an existing
  owner still goes through admin Activate-a-Venue
  (`components/admin/mobile/ActivateVenueFlow.tsx`), which is retained for exactly
  this, offline-billed venues, and support fixes.
- **Two simultaneous claims of the same hidden venue** — Phase 5a §3 shipped the
  `venue_owner_venues (venue_id)` unique index
  (`20260907140000_venue_owner_venues_unique_venue.sql`), so the second claim now
  fails at the DB rather than creating a duplicate owner link. The losing request's
  user-facing copy is generic; acceptable for the race's rarity.

### If you are the LLM tying up loose ends

Nothing in this repo is left half-written. The only actions remaining are Andrew's
ops steps above and his device pass. Do **not**:
- flip any env var or edit `.env*` / `vercel.json`;
- "restore" the `nextDisabled` validation gate (Phase 4 §2 — it was removed on
  purpose, matching `ActivateVenueFlow`);
- add a transaction around `POST /api/owner/signup`'s multi-table create (Risk #2
  — every unwind path is hand-written and individually tested; changing it needs
  its own plan);
- re-theme `GeofenceEditor` for the dark signup canvas (Phase 4 §5 — it is mounted
  in a deliberate light panel; re-theming risks every admin venue screen);
- delete an emailless `auth.users` row to "fix" a signup (CLAUDE.md standing
  prohibition; `tests/lib.auth-users-fk-guard.test.ts` is the tripwire).

---

## 5. Model / effort summary

| Phase | Model | Effort |
| --- | --- | --- |
| 0 · Foundations | Sonnet 5 | Low |
| 1 · Public map + Places, rate limited | **Opus 5** | Medium-High |
| 2 · Bounded radius | Sonnet 5 | Medium |
| 3 · Shell + motion system | **Opus 5** | High |
| 4 · Six question screens | **Opus 5** | High |
| 5 · `POST /api/owner/signup` | **Opus 5** | High |
| 5a · Signup hardening | **Opus 5** | Medium |
| 6 · Payment handoff + unhide + sweep | **Opus 5** | Medium-High |
| 7 · Cutover | Sonnet 5 | Low-Medium |
| 8 · Tests + device sign-off | Sonnet 5 | Medium |

Opus for the four phases where a mistake costs money or leaks a boundary
(public Google-billed routes, multi-table create with no transaction, billing
webhook) and for the two that are pure product craft. Sonnet for the mechanical
ones. No Haiku phase — nothing here is bulk transformation.

## 6. Risks

1. **Public Google Maps key.** Highest-consequence item. The referrer restriction
   is an ops step outside the code; the flag must not flip before it is confirmed.
2. **No cross-table transaction** in Phase 5. Every unwind path is hand-written
   and must be tested individually.
3. **Venue spam.** Rate limiting plus `hidden = true` plus the sweep contains it;
   a hidden venue is invisible to every player, so the blast radius of a fake
   signup is a dead row.
4. **Billing webhook is the most-hardened file in the repo.** Phase 6 adds one
   idempotent follower and touches nothing else.
5. **Radius refactor regression.** Phase 2's default-argument equivalence test is
   what protects admin's existing flow.
6. **`auth.users` is shared with player accounts** (`accounts.auth_id` and
   `users.auth_id`, both `ON DELETE SET NULL`). Any owner-side code that deletes or
   adopts a pre-existing auth user can silently detach a player's identity. Phase 5's
   `unwind()` is safe because it only ever deletes an auth user it just created;
   Phase 5a §1 makes that a written rule and adds the tripwire. This is the sharpest
   edge in the whole plan and it is not obvious from the owner code alone.
