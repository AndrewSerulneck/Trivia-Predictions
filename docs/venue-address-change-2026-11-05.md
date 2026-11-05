# Venue address change — 2026-11-05

Status: complete locally. Change address now searches, previews and saves a replacement address and
pin, including moves over 1 km. 150 focused tests, typecheck, source lint, Chromium/WebKit checks and
production build pass. Full suite: 6,492 pass / 13 skip / four existing stale-snapshot failures.
Nothing committed, pushed or deployed. Existing Venue Location Phase 3 release review remains separate.

Andrew asked for a Change address section and confirmed: **“Yes—replace the address and move the pin”**,
including moves over 1 km. This supersedes the old D3 prohibition on address edits and allows a different
location only through an explicit, server-verified address selection. Pin-only edits retain the 1 km cap.
No deployment, live venue write or migration was requested.

Implementation: collapsed Change address section → explicit Search → choose a result → preview the new
pin/address → existing Save location. Undo restores the draft pin from before address selection. The
current radius is preserved, including legacy 600 m. No new GPS button or verbose help. Search uses
existing Google Places functions, not a new service or per-keystroke autocomplete. A signed 30-minute
result, bound to owner and venue, avoids a second Details call during Save/retry. Save validates radius
and pin distance from the selected address, then writes address and coordinates in one venue UPDATE.

Cost baseline and estimate before release: ordinary page opens/unlock/pin-only saves incur no new
API requests or database operations; the page bundle adds the small address-search UI. Per completed address selection: one explicit prediction request +
one selected-place Details request, no fan-out to details for all results, no automatic retries. Each
request adds 2 owner-auth selects + one atomic rate-limit RPC. Save retains its previous 2 auth selects,
one venue select and one UPDATE. A failed Save can retry the signed selection without a paid lookup.
Search retries, choosing another result and redoing an expired selection each count separately.

Planning transfer estimate: approximately 8 KB extra browser JSON per completed selection including
request bodies, at most five predictions, selected details and signed token. This is a planning estimate,
not measured Google transfer. At 10 completed changes/day: 20 Google calls/day (600/30 days), 60 additional
DB operations/day (1,800/month), about 80 KB/day (2.4 MB/month). At 1,000/day: 2,000 Google calls/day
(60,000/month), 6,000 DB operations/day (180,000/month), about 8 MB/day (240 MB/month). One full lookup
retry doubles those figures. Limits: 10 searches/minute and 5 details/minute per authenticated owner,
shared across venues/IPs, enforced by the existing DB limiter. Signing adds no DB operation.

Actual traffic, Google billing/free allowances and dollars are unknown. No new live paid measurement is
needed to test this; APIs are mocked. The lower-cost manual-address option would not move the pin
automatically, which Andrew explicitly declined. Existing map instance is retained; only camera/geometry
updates. No polling, cron, new table, provider or whole-database work. Compare actual Places usage with
these per-change counts after a separately authorized release.

Model recommendation: GPT-6.1 (Codex), high effort for owner scoping, signed relocation, atomic address
writes and shared map behavior. Runtime exposes Codex/GPT-6 family; exact selected version is not
independently exposed. No model switch or subagent was invoked.


## Handoff for the next agent

1. **Next goal/scope:** include this extension in Phase 3 of `docs/venue-location-usability-plan.md`.
   Review the implementation and extend the device checklist with explicit search, selection, pin
   preview, Undo, Save/failure retry and a relocation over 1 km. No new phase, publication, migration,
   sports-snapshot refresh, live venue write, address-field redesign or geocoding provider is authorized.
   Recommended model/effort remains GPT-6.1 (Codex), medium for review; implementation used the plan's
   high-effort recommendation for auth/data/shared-map work. No subagents or alternate models were used.
2. **Starting state:** repository `/Users/andrewserulneck/Documents/Trivia-Predictions`, branch
   `after-app-review`, HEAD `637e39e97cdd7543c5c676a5d8ed79210539ec19`. All earlier instruction/UI/test/plan
   edits remain uncommitted and are preserved. No commit, push, PR, hosted preview or deployment occurred.
   No real address/venue/key/cookie or `.env.local` value was read/changed. No data backup or undo log is
   necessary because no live data was changed. Rollback is limited to these source edits; do not reset
   the dirty tree. `CLAUDE.md` still holds main/production changes pending App Store approval.
3. **Settled decisions:** Andrew explicitly chose “Yes—replace the address and move the pin” when asked
   whether Change address includes moves over 1 km. Old D3 is superseded for this feature; ordinary
   pin-only movement remains limited to 1 km. Signed selection permits up to 1 km of entrance adjustment
   around the new Google address. Existing usable saved pins are still required; system placeholders
   cannot be converted. Radius changes still require explicit dial/preset intent. Lookup alone never
   saves. Address changes share the existing Save button/“Saved.” confirmation. No helper paragraphs or
   GPS card were restored. Undo preserves pre-selection pin edits and current radius intent.
4. **Files/seams:**
   - `components/owner/VenueAddressEditor.tsx`: collapsed Change address button, manual Search and up to
     five result buttons. One UUID session spans search/details. Request IDs + AbortController discard
     old query/unmounted results; current selection callback is kept in a layout-effect ref so Undo
     captures pin edits made while details were loading. `onBusyChange` blocks Save during lookup.
   - `app/owner/venue-location/page.tsx`: owns signed selection and previous pin/source, previews the
     chosen pin, adds selection token to PATCH and provides Undo. Selection counts as dirty for
     discard confirmation. Successful Save/venue load/switch clears the selection. Saved address is
     visible only when the section is open; selected replacement appears while pending.
   - `app/api/owner/venues/address/route.ts`: POST query or placeId, owner auth + venue membership before
     quota/provider access, bounded input/results, no-store, generic failures. Reuses existing
     `getAddressPredictions`/`getAddressDetails` in `lib/geolocation.ts`; no provider fork.
   - `lib/ownerVenueAddress.ts`: validates complete US addresses and coordinates; HMAC-SHA256 result
     signed with existing SESSION_SECRET, purpose-separated, owner/venue-bound, 30-minute expiry,
     timing-safe MAC comparison and 8 KB token bound. No additional secret or DB table. Save uses
     verified server-produced address fields, not writable address/owner/name fields from the client.
     Expiry has no unnecessary future-time bound, avoiding false rejection from small clock skew.
   - `app/api/owner/venues/location/route.ts`: GET adds saved address; PATCH verifies optional selection,
     retains current radius validation and validates pin distance relative to the selected address.
     One UPDATE writes pin/radius + street/address/city/state/zip_code/country/place_id. County/region
     are cleared on relocation so old geographic targeting data is not retained. Name/billing/ownership
     remain unchanged. Audit log records actual old→new distance and `address_changed=true`, no address
     text/email/token. Ordinary pin saves keep their existing update fields and audit shape.
   - `lib/rateLimit.ts`: adds owner-keyed search (10/min) and details (5/min) buckets using the existing
     atomic limiter/RPC, no schema change. Quota failure is closed; retries require a user action.
   - `components/admin/VenueMapPicker.tsx`: external pin moves refit the circle after initial sizing;
     actual Google map instance/key request remain stable. Drag-originated changes still skip this path.
   - `lib/venueLocationRules.ts`, `CLAUDE.md`, old signup/geofence plan and current usability plan:
     document the full-address exception without weakening pin-only limits.
   - Tests: `tests/api.owner.venue-address.test.ts` (20), `tests/api.owner.venues-location.test.ts` (17),
     `tests/owner-venue-location-page.render.test.ts` (36), `tests/venue-map-picker.render.test.ts` (18).
     The focused set also includes existing page contract, shared editor, pure rules and rate limiter.
5. **Traps/permissions:** root `.next/types` has pre-existing duplicate generated files (`routes.d 2.ts`
   etc.) from the earlier handoff; use the scratch copy for typecheck/build instead of deleting them.
   Scratch `/tmp/venue-location-phase2-scratch` has no `.env*` and symlinked installed dependencies.
   Never use Andrew's :3000 server. Dev/browser localhost process escalation was allowed. An initial
   scratch build failed only because the sandbox could not resolve Google Fonts; automatic review
   allowed the build's existing Nunito download and it passed. Stop dev before production builds and
   do not copy watched source mid-browser run: Fast Refresh interrupted the first browser attempt.
   No automatic approval review rejected an action and no permission question is pending.
6. **Verification:** root source lint passes with archived `tmp/**` excluded, focused tests pass,
   scratch typecheck passes, and scratch production build generates **233 pages**. Full suite has
   **494 files: 489 pass / 4 fail / 1 skip; 6,492 tests pass / 4 fail / 13 skip (6,509 total)**.
   All four failures are the unchanged NFL/MLB 14-day snapshot freshness checks documented in the
   Phase 2 handoff (both generated 2026-10-14). Final signing validation also has a separate 37-test
   security/API rerun. No full-suite retry or snapshot manipulation was used to hide those failures.

```sh
# Repository root:
npx vitest run tests/api.owner.venue-address.test.ts tests/api.owner.venues-location.test.ts tests/owner-venue-location-page.render.test.ts tests/owner-venue-location-page-contract.test.ts tests/venue-map-picker.render.test.ts tests/venue-activation.geofence-editor.test.ts tests/lib.venueLocationRules.test.ts tests/api.signup.rate-limit.test.ts
npm run lint -- --ignore-pattern 'tmp/**'
npm run test
git diff --check
# No-env scratch copy with current changed files copied in:
cd /tmp/venue-location-phase2-scratch
npx next typegen
npx tsc --noEmit
npm run build
# Browser (start separate scratch dev server only after build exits):
node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3107
# Separate terminal from repository root:
node tmp/venue-address-2026-11-05/browser.cjs
```

Browser evidence: Chromium **and** WebKit at **350/390/1280 px**, real page/editor/map code/global CSS,
fake Google SDK and intercepted owner APIs; all non-local browser origins blocked. Six cases verify
collapsed entry and zero initial lookup/save, 44 px Change address target, explicit search, keyboard
selection, new pin preview, unchanged 600 m radius, one map/key, zero GPS, no overflow/page errors,
explicit Save and “Saved.”. Chromium 390 additionally fails first Save and retries without another
search/details call. Each case records precisely one search, one details request, one map/key and one
Save (two for the failure/retry case). No real Google geometry or live Places result was tested.

Evidence: ignored `tmp/venue-address-2026-11-05/` contains `browser.cjs`, both engine JSON results,
24 `{engine}-{350,390,1280}-{collapsed,search,preview,saved}.png` screenshots and all run logs copied
from `/tmp/venue-address-*.log`. Useful views:
[350 px search](../tmp/venue-address-2026-11-05/webkit-350-search.png),
[390 px selected preview](../tmp/venue-address-2026-11-05/chromium-390-preview.png).
Scratch dev server was stopped after verification. Evidence is simulated, not production release proof.

7. **Open questions:** none. Live Places availability/key restrictions, genuine Google tiles/geometry,
   physical-device gestures and real post-release usage/dollars remain unverified. The existing venue
   cache behavior is unchanged. No additional paid test was run or requested.
8. **First steps:** preserve dirty source and ignored evidence; review this extension with the earlier
   cleanup/confirmation changes, then finish Phase 3's device/release checklist and handoff. Record any
   later separately authorized commit/push/deployment and actual usage distinctly. Do not mark live.
