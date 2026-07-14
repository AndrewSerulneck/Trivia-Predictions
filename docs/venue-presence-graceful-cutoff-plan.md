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

- Apply the new `venue_presence_events` migration in Supabase before relying on production telemetry.
- Add production env overrides only if early monitoring shows false positives or overly permissive checks.

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
