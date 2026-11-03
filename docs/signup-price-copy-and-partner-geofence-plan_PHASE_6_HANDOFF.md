# Signup price copy + partner geofence — Phase 6 handoff (2026-11-03)

**For Andrew:** the Venue Location page now (R3) shows "Couldn't load your venues." with a **Try again** button when the venue list fails, instead of wrongly saying "No venue found"; (R2) greys out the venue picker while saving and ignores a late save reply if you're already on another venue; (R9) asks "Discard your unsaved location changes?" before switching venues with an unsaved edit. Not live: uncommitted on `after-app-review` with Phases 3 and 5, not pushed or deployed. No migration, env var or cost change (a retry happens only when you tap Try again). Needs you later: the phone pass, checklist section N (two new lines).

**What changed (files):**
- `app/owner/venue-location/page.tsx`: `loadVenues` checks `res.ok`/`json.ok`, has a `catch`, sets `venuesError`; `venuesReloadKey` re-runs the effect on tap; error card + Try again; `selectedVenueIdRef` + `const venueId` in `handleSave` (stale reply dropped, success and error paths); `handleVenueChange` with `window.confirm(COPY.discardChanges)`; Dropdown gets `disabled={saving}`.
- `lib/venueLocationRules.ts`: new copy `venuesLoadFailed`, `tryAgain`, `discardChanges`.
- Tests: `tests/owner-venue-location-page-contract.test.ts` (new Phase 6 case); `tests/owner-venue-location-page.render.test.ts` (500 → error → Try again recovers; empty list → "No venue found"; switch with edit asks, Cancel keeps / OK switches; no prompt when unedited).
- `docs/partner-dashboard-app-redesign-device-checklist.md` section N: two Phase 6 lines.

**Verified:** `npx tsc --noEmit` clean; eslint clean on changed files; `npm run test`: 6,119 pass / 4 fail (the same MLB/NFL star-index tripwires, unrelated). **Not done:** real-browser run (jsdom render tests cover the logic); the save-vs-switch race has only a contract test (the disabled picker makes it hard to trigger); no `beforeunload` prompt (out of scope, possible follow-up).

**Next (Phase 7, Sonnet 5.5, low):** per the plan, export `isUsableVenuePin` from `lib/venueLocationRules.ts` (R4), use it for `hasUsablePin` in the page, and change `VENUE_LOCATION_COPY.saved` to mention the 5-minute venue-list delay (R8, name `VENUE_CACHE_TTL_MS` in a comment). Reuse the render-test setup above. Then Phase 8 (re-review + release prep).
