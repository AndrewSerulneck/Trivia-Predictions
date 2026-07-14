# Venue Presence Graceful Cutoff Plan

## Goal

Prevent users from continuing venue-scoped gameplay after they leave a partner venue, while keeping the experience polished, friendly, and recoverable.

Users should never see backend or developer language. If access is paused, the app should clearly tell them their venue access has been revoked or paused and that they must return to the venue to continue playing.

## Core Product Behavior

When a user is inside the venue:

- The app verifies location during join.
- The server creates a short-lived venue presence lease.
- The client periodically sends location heartbeats.
- The server extends the lease only when the user remains in range.
- Gameplay mutations are accepted while the lease is active.

When a user leaves the venue or location can no longer be confirmed:

- Gameplay controls are disabled.
- The user stays signed in.
- The game shows a branded access overlay.
- Submissions, picks, claims, and scoring actions are blocked.
- The user can tap **Recheck Location** after returning to the venue.

## User-Facing Messaging

### Confirmed Out Of Range

Title:

> You’ve left the venue

Body:

> Your game access has been paused because you’re no longer within range of this partner venue.
>
> Return to the venue to keep playing.

Primary action:

> Recheck Location

Secondary action:

> Back to Venue Home

### Location Temporarily Unclear

Title:

> Checking your venue access

Body:

> We’re having trouble confirming you’re still at the venue. Stay nearby while we recheck your location.

Primary action:

> Recheck Location

### Location Permission Disabled

Title:

> Location access is off

Body:

> To keep playing, turn location access back on and recheck from inside the venue.

Primary action:

> Recheck Location

## UX Requirements

- Use a Hightop-branded overlay or full-screen interstitial.
- Include graphics or animation, such as a venue pin, radius pulse, Hightop logo animation, or subtle location ring.
- Disable gameplay controls underneath the overlay.
- Keep the user’s game context visible where possible, but prevent all scoring actions.
- Never render raw API errors.
- Never show terms like `403`, `lease`, `geofence`, `token`, `session expired`, `VENUE_OUT_OF_RANGE`, or backend/developer wording.
- All server codes must be mapped to client-safe copy before display.

## Backend Contract

The server uses stable presence codes:

- `AUTH_REQUIRED`
- `VENUE_PRESENCE_REQUIRED`
- `VENUE_PRESENCE_EXPIRED`
- `VENUE_OUT_OF_RANGE`
- `VENUE_LOCATION_UNAVAILABLE`
- `VENUE_PROFILE_MISMATCH`
- `VENUE_PRESENCE_UNAVAILABLE`

The client should map these codes into friendly overlay states.

## Phased Rollout

| Phase | Work | Codex Model | Intelligence |
|---|---|---:|---|
| 1 | Architecture pass: identify mutation APIs, define lease schema/contracts, and document rollout | 5.5 | High |
| 2 | Backend foundation: migration, server helper, heartbeat API, join lease creation, and guarded mutation routes | 5.5 | High |
| 3A | Build branded `VenueAccessOverlay` with graphics, animation, safe copy, and disabled-control behavior | 5.4 | Medium-High |
| 3B | Add shared client mapper from server presence codes to overlay states and user-facing copy | 5.4 | Medium |
| 3C | Add client heartbeat/watch-position guard to venue and game pages | 5.4 | Medium-High |
| 4 | Turn on enforcement for gameplay mutations once overlay and heartbeat are live | 5.5 | High |
| 5 | QA mocked geolocation: in-range, leaving range, denied permission, poor accuracy, expired lease, re-entry | 5.4 | Medium |
| 6 | Production hardening: telemetry, threshold tuning, operator diagnostics, false-positive monitoring | 5.5 | High |

## Implementation Status

Completed:

- Phase 1 architecture and route mapping.
- Phase 2 backend foundation.
- Phase 3 branded overlay, shared client mapper, and heartbeat/watch-position guard.
- Phase 4 gameplay mutation enforcement switch is enabled in local/example env with `VENUE_PRESENCE_ENFORCEMENT=1`.
- Phase 5 mocked geolocation QA coverage for in-range, leaving range, denied permission, poor accuracy, expired lease, and re-entry.
- Phase 6 production hardening:
  - Runtime tuning knobs for lease TTL, minimum venue radius, accuracy buffers, accuracy multiplier, diagnostics window, and quick-recovery false-positive window.
  - Privacy-safe `venue_presence_events` telemetry table for verified checks, pauses, location uncertainty, expiry, profile mismatch, and unavailable checks. Events store user/venue IDs plus coarse distance, allowed-distance, accuracy, status, source, and timestamps; they do not store raw latitude or longitude.
  - Owner-scoped `GET /api/owner/venue-presence` diagnostics endpoint.
  - Partner Dashboard Venue Access panel with active, paused, quick-return, and recent-issue indicators.
- Vercel project env now has `VENUE_PRESENCE_ENFORCEMENT=1` for Production, Preview, and Development; a new deployment is required for existing deployed Functions to pick it up.
- `venue_presence_sessions` migration.
- `lib/venuePresence.ts` server helper.
- `POST /api/venue-presence/heartbeat`.
- Initial lease creation after successful venue join.
- Mutation guards across core venue gameplay routes.

Pending:

- Add production env overrides only if early monitoring shows false positives or overly permissive checks.

Confirmed applied (2026-07-14): both `venue_presence_sessions` and `venue_presence_events`
are live and reachable on the production Supabase project (`pkmxupsayzshvpirkaav`) — verified
via a direct `select ... limit 1` against each table with the service role client. The
`venue_presence_events` migration item above is no longer pending.

## Rollout Switch

Mutation blocking is enabled by:

```bash
VENUE_PRESENCE_ENFORCEMENT=1
```

Phase 4 turns this on after the Phase 3 client overlay and heartbeat guard are in place. Set `VENUE_PRESENCE_ENFORCEMENT=0` only for emergency rollback or focused local testing.

Phase 6 adds optional production tuning knobs:

```bash
VENUE_PRESENCE_TTL_MS=180000
VENUE_PRESENCE_MIN_RADIUS_METERS=300
VENUE_PRESENCE_ACCURACY_BUFFER_MIN_METERS=120
VENUE_PRESENCE_ACCURACY_BUFFER_DEFAULT_METERS=320
VENUE_PRESENCE_ACCURACY_BUFFER_MAX_METERS=5000
VENUE_PRESENCE_ACCURACY_MULTIPLIER=1.5
VENUE_PRESENCE_FALSE_POSITIVE_WINDOW_MS=300000
VENUE_PRESENCE_DIAGNOSTICS_WINDOW_MINUTES=60
```

The server clamps unsafe tuning values before use:

- TTL: 30 seconds to 15 minutes.
- Minimum venue radius: 100 to 2,000 meters.
- Accuracy buffer minimum: 0 to 2,000 meters.
- Accuracy buffer default: 0 to 5,000 meters.
- Accuracy buffer maximum: 500 to 20,000 meters.
- Accuracy multiplier: 0 to 5.
- False-positive quick-recovery window: 1 to 30 minutes.
- Diagnostics window: 5 minutes to 24 hours.

## God Mode Bypass — Oversight & Remediation Plan

> **Oversight (logged 2026-07-14):** The presence system was built as a standalone
> code path that never learned about God Mode. God Mode accounts (Andrew, Marc — the
> `accounts.god_mode` column) are meant to access **any** venue from **anywhere on
> Earth**. Join-time geofencing already honors this (`app/api/join/profile/route.ts:255`,
> `verifyJoinGeofence({ bypass: Boolean(account.god_mode) })`), but the three presence
> layers below do **zero** god-mode checks, so god accounts get their leases expired and
> distance-checked like anyone else and are wrongly cut off:
>
> 1. **Lease creation** — `recordVerifiedVenuePresence` (`lib/venuePresence.ts:371`), called from join at `app/api/join/profile/route.ts:20`.
> 2. **Heartbeat validation** — `verifyVenuePresenceLocation` (`lib/venuePresence.ts:418`), called from `app/api/venue-presence/heartbeat/route.ts:30`.
> 3. **Mutation guards** — `getActiveVenuePresence`/`requireActiveVenuePresence`/`maybeRequireActiveVenuePresence*` (`lib/venuePresence.ts:536-657`), called from the 8 gameplay mutation routes.

### Critical architectural fact (do not miss this)

The presence system keys on **`users.id`**. God Mode lives on **`accounts.god_mode`**,
keyed by **`account_id`**. There is **no** existing server-side `isGodMode(userId)`
helper. The bypass therefore requires a **join**: `users.account_id → accounts.god_mode`.
Not every legacy `users` row necessarily has an `account_id`; a missing/null `account_id`
must resolve to **not** god mode (fail closed to normal geofencing). Never trust the
client `getGodMode()` localStorage flag or any client-sent flag for enforcement — it is a
UX hint only. The server DB column is the sole source of truth.

### Design: centralize the bypass inside `lib/venuePresence.ts`

Threading a flag through the heartbeat route + join route + 8 mutation routes is fragile
(a future mutation route would silently re-break god mode). Instead put the bypass in the
one shared module every layer already calls.

1. **New server helper** `isGodModeUser(userId): Promise<boolean>` in `lib/venuePresence.ts`
   — single query joining `users.account_id → accounts.god_mode` via `supabaseAdmin`.
   Cache results in a short-TTL in-memory map (e.g. 60s) so the 45s heartbeat and every
   mutation don't add a DB round-trip. Null/missing `account_id` → `false`.

2. **`verifyVenuePresenceLocation`** (heartbeat): if `isGodModeUser`, short-circuit
   **before** the location/distance/`userBelongsToVenue` checks and return an `active`
   success (still write a lease via `recordVerifiedVenuePresence` so diagnostics stay
   coherent, tagged so telemetry can distinguish it — optional `source`/status marker).

3. **`getActiveVenuePresence`** (what mutation guards read): if `isGodModeUser`,
   short-circuit **before** the `status !== "active"` and `expires_at <= now` checks and
   return `active`. **This is the most important layer** — even a perfect heartbeat bypass
   is insufficient because the 3-min lease TTL expires between heartbeats or if the client
   heartbeat loop is not running (direct API calls, background tabs). The guard must pass
   for god accounts with **no lease row at all**.

4. **Join lease creation** — pass the already-fetched `account.god_mode` from
   `app/api/join/profile/route.ts:255` down through `userResponse` into
   `recordVerifiedVenuePresence` (or simply rely on `getActiveVenuePresence`'s bypass; the
   join write becomes cosmetic for god users). Prefer wiring it so the first lease is
   written correctly rather than depending on self-correction.

5. **Client** `components/venue/VenuePresenceBoundary.tsx` — optional UX polish only:
   read `getGodMode()` to suppress the access overlay and skip the `watchPosition`/heartbeat
   churn for god accounts. **This changes no enforcement** — step 3 is the real gate.

### Regression safety — verify all three populations after the change

- **Legitimate in-range users (non-god):** unchanged path. Join geofence still runs,
  lease still created, heartbeat still distance-checks, mutation guard still enforces.
  Confirm `isGodModeUser` returns `false` for them (null/normal `account_id`) and no
  code path is skipped.
- **Out-of-range non-god users:** still paused/blocked exactly as today (overlay,
  `VENUE_OUT_OF_RANGE`, mutation guard blocks). The bypass must be reachable **only** when
  `god_mode === true`.
- **God accounts anywhere on Earth:** join any venue, heartbeat from any location stays
  `active`, lease expiry never blocks, all 8 mutation routes accept, overlay never shows.

### Test additions (`tests/lib.venue-presence.test.ts` + phase5)

- god-mode heartbeat from a far-away coordinate → `active` (no `VENUE_OUT_OF_RANGE`).
- god-mode `getActiveVenuePresence` with an **expired** lease → `active` (no `VENUE_PRESENCE_EXPIRED`).
- god-mode mutation guard with **no lease row** → passes.
- non-god user, far away → still `VENUE_OUT_OF_RANGE` (bypass not leaking).
- non-god user, in range → still `active` (no behavior change).
- user with null `account_id` → treated as non-god.

### Implementation status — God Mode bypass (all phases complete, 2026-07-14)

- **Phase A (done):** `isGodModeUser(userId)` server helper in `lib/venuePresence.ts`
  (`users.account_id → accounts.god_mode` join, 60s in-memory cache, null-account and
  error both fail closed to `false`).
- **Phase B (done):** god short-circuits added **before** the distance/belongs checks in
  `verifyVenuePresenceLocation` and **before** the lease-row read in
  `getActiveVenuePresence` (so `requireActiveVenuePresence` / `maybeRequireActiveVenuePresence*`
  and all 8 mutation-guarded routes inherit the bypass).
- **Phase C (done):** `app/api/join/profile/route.ts` threads the already-fetched
  `account.god_mode` into `recordVerifiedVenuePresence` via a `userResponse({ godMode })`
  option, writing a long-lived join lease for god accounts (cosmetic; Phase B is the real
  gate).
- **Phase D (done):** `components/venue/VenuePresenceBoundary.tsx` reads `getGodMode()` and
  suppresses the overlay + skips the `watchPosition`/heartbeat loop for god accounts.
  **UX-only, client-trusted — no enforcement weight.**
- **Phase E (done):** tests written in a **dedicated** `tests/lib.venue-presence-god-mode.test.ts`
  (8 cases) rather than appended to the two existing files — the god path adds a second
  `users` query plus an `accounts` query that the phase5 harness intentionally rejects, so a
  separate mock keeps the phase5 assertions untouched. Two cases use a `sessions.select`
  that throws to prove the `getActiveVenuePresence` short-circuit returns before any lease
  read.
- **Verification:** `npx tsc --noEmit` clean; ESLint clean on all touched files; 59 tests
  pass across `lib.venue-presence*`, `lib.geofence`, and the three `api.join.*` suites
  (god bypass + non-god enforcement + join flows all green).

> **Browser QA (done, 2026-07-14):** ran a real Chromium session (Playwright) with mocked
> geolocation ~8,667 km from the venue for both a god account and a non-god control. Server:
> the god user's heartbeat returned `HTTP 200 active`; the non-god user's returned
> `HTTP 403 VENUE_OUT_OF_RANGE`. Client: the god account made **zero** heartbeat calls (the
> Phase D suppression working as designed) and saw no overlay; the non-god account got the
> branded "You've left the venue" overlay blocking gameplay. Seeded test data was fully torn
> down afterward. Not separately re-driven: an actual mutation-guarded game submission as the
> god user from far away — covered instead by the Phase E unit tests (including the
> no-lease-row and expired-lease cases), which exercise the identical shared helper.

### Recommended model & effort per phase

| Phase | Work | Model | Effort | Why |
|---|---|---|---|---|
| A | `isGodModeUser` helper + users→accounts join + cache | **Opus 4.8** | Medium | The `users.id` vs `accounts.god_mode` join and null-`account_id` fail-closed are the exact spots a lesser pass fumbles. |
| B | Short-circuit in `verifyVenuePresenceLocation` + `getActiveVenuePresence` (+ `requireActiveVenuePresence` inherits) | **Opus 4.8** | High | Widest blast radius; must not weaken the non-god enforcement path across 8 mutation routes. |
| C | Wire `god_mode` through join lease creation | Sonnet 5 | Low | Mechanical param threading; already-fetched value. |
| D | Client overlay/heartbeat suppression in `VenuePresenceBoundary.tsx` | Sonnet 5 | Low-Med | UX-only, no security weight. |
| E | Tests (6 cases above) + `tsc --noEmit` + focused vitest | **Opus 4.8** | Medium | Tests are the regression proof for all three populations; worth the stronger model to make them airtight. |

Net recommendation: run phases **A, B, E on Opus 4.8** (the security-load-bearing ones);
C and D are safe on Sonnet 5.

### Effort level per phase (scope & footprint)

- **Phase A — Medium.** One new `isGodModeUser` helper (~30–40 LOC) plus a small in-memory
  TTL cache. Low line count but non-trivial reasoning: the `users.account_id → accounts.god_mode`
  join, null-`account_id` fail-closed, and cache invalidation window must all be correct.
  ~1 file touched (`lib/venuePresence.ts`).
- **Phase B — High.** The core change. Short-circuits inserted into `verifyVenuePresenceLocation`
  and `getActiveVenuePresence` (and `requireActiveVenuePresence` inherits it). Small diff
  (~15–25 LOC) but the **highest blast radius** — it sits under all 8 mutation-guarded routes,
  so every edit must preserve the non-god enforcement path exactly. Careful placement (bypass
  before distance/expiry/`userBelongsToVenue` checks) is what makes this High despite low LOC.
  ~1 file (`lib/venuePresence.ts`).
- **Phase C — Low.** Thread the already-fetched `account.god_mode` from
  `app/api/join/profile/route.ts` through `userResponse` into `recordVerifiedVenuePresence`.
  Mechanical param passing, no new logic. ~2 files, ~10 LOC.
- **Phase D — Low-Medium.** Client UX only: read `getGodMode()` in
  `components/venue/VenuePresenceBoundary.tsx` to suppress the overlay and skip the
  `watchPosition`/heartbeat loop for god accounts. Medium only because of React effect/cleanup
  wiring; zero security weight. ~1 file, ~20–30 LOC.
- **Phase E — Medium.** Six new test cases across `tests/lib.venue-presence.test.ts` and
  `tests/lib.venue-presence-phase5.test.ts`, plus `npx tsc --noEmit` and focused vitest runs.
  Effort is in constructing mock accounts/leases for each of the three populations, not volume.
  ~2 test files.

Rough total: **~2 core lib files + 2 route/client files + 2 test files**, with the security
weight concentrated in Phases A, B, and E.

## Verification So Far

Completed checks:

- `npx tsc --noEmit`
- Focused ESLint on touched files
- Focused join/geofence tests:
  - `tests/api.join.profile.test.ts`
  - `tests/api.join.account.test.ts`
  - `tests/api.join.venue-profile-with-account.test.ts`
  - `tests/lib.geofence.test.ts`
- Phase 4:
  - `npx vitest run tests/lib.venue-presence.test.ts`
  - `npx tsc --noEmit --pretty false`
  - `vercel env ls` confirmed `VENUE_PRESENCE_ENFORCEMENT` exists for Production, Preview, and Development.
- Phase 5:
  - `npx vitest run tests/lib.venue-presence.test.ts tests/lib.venue-presence-phase5.test.ts`
  - Phase 5 test matrix covers:
    - in-range heartbeat stays active
    - leaving range pauses access
    - denied permission maps to the location-off overlay copy
    - poor GPS accuracy remains recoverable via the expanded threshold
    - expired lease returns `VENUE_PRESENCE_EXPIRED` and persists the expired status
    - re-entry restores active access on the next verified heartbeat
- Phase 6:
  - `tests/lib.venue-presence.test.ts` covers default threshold behavior, env-based threshold tuning, and clamp bounds for unsafe values.
  - `tests/lib.venue-presence-phase5.test.ts` now verifies telemetry writes for active and out-of-range mocked heartbeats.
