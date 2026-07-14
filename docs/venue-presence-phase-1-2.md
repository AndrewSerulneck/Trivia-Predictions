# Venue Presence Enforcement: Phases 1 and 2

## Phase 1 Contract

The join flow already verifies a user's GPS position before creating or resolving a venue-scoped profile. The missing control is continued presence after login. The server contract is now:

- Successful venue entry creates an active venue presence lease.
- Heartbeats refresh that lease only when the server confirms the user remains within the venue radius plus GPS accuracy buffer.
- Gameplay mutations should require an active lease before accepting scoring, picks, claims, or card/entry creation.
- API responses expose stable codes for the client and friendly `userMessage` text only.

## Stable Presence Codes

- `AUTH_REQUIRED`
- `VENUE_PRESENCE_REQUIRED`
- `VENUE_PRESENCE_EXPIRED`
- `VENUE_OUT_OF_RANGE`
- `VENUE_LOCATION_UNAVAILABLE`
- `VENUE_PROFILE_MISMATCH`
- `VENUE_PRESENCE_UNAVAILABLE`

The UI must never render raw backend errors. Phase 3 should map these codes to the branded animated access overlay.

## Mutation Surfaces To Guard

- `app/api/trivia/live/submit-answer/route.ts`
- `app/api/category-blitz/rounds/[id]/submit/route.ts`
- `app/api/pickem/picks/route.ts`
- `app/api/bingo/cards/route.ts`
- `app/api/fantasy/entries/route.ts`
- `app/api/predictions/route.ts`
- `app/api/prizes/redeem-challenge/route.ts`

Read-only routes can remain available unless a specific game mode needs a stricter spectator cutoff.

## Phase 2 Backend Artifacts

- `venue_presence_sessions` table stores one lease per user and venue.
- `lib/venuePresence.ts` owns distance verification, lease renewal, active-lease lookup, and user-safe API responses.
- `POST /api/venue-presence/heartbeat` refreshes or revokes access.
- Join success writes the first lease after the existing geofence check succeeds.
- Core mutation routes now call the shared guard through `maybeRequireActiveVenuePresence*`.
- Mutation blocking is rollout-gated by `VENUE_PRESENCE_ENFORCEMENT=1` until the Phase 3 branded overlay is ready.

Coordinates are not stored in the presence table. It keeps coarse diagnostics only: distance, GPS accuracy, status, and expiry.
