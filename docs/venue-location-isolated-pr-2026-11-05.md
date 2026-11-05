# Venue Location isolated PR — 2026-11-05

## For Andrew

Venue Location is isolated onto a branch based directly on main. It is prepared for a draft PR only;
it is not approved for merging during App Store review. The native app loads the production website,
so deploying even this limited change still replaces the shared site during review. The original
work remains on `after-app-review`. Nothing here changes production data or App Store submissions.

## For the next agent

### Scope and starting state

This is a publication handoff, not another implementation phase. Phases 0–3 are complete locally.
Their handoffs describe the original workspace and historical validation, not this isolated PR.
The isolated branch `venue-location-only-2026-11-05` starts at main
`7033a606245b1f45ef85b3c9d6b37ff118a413d5` (tree
`ea69bd5445042fca167e7939b5543e2ea82e4ee4`). Preparation directory:
`/tmp/venue-location-only-pr-2026-11-05`. Its local origin points to the original workspace;
do not push to that origin. GitHub publishing uses the connected GitHub tools.
Original workspace: `/Users/andrewserulneck/Documents/Trivia-Predictions`, branch
`after-app-review`, HEAD `637e39e97cdd7543c5c676a5d8ed79210539ec19`; original feature edits
remain uncommitted there. Preserve all unrelated work.

### Included work and decisions

- Venue Location page: saved map/circle visible immediately, compact editing, branded Close,
  one venue heading/selector, flush header, radius control, concise Saved confirmation.
- Address replacement: authenticated Places search/selection, preview/Undo, signed owner/venue
  relocation token and one atomic save. Andrew explicitly approved moving the pin to a replacement
  address even over 1 km. Ordinary pin moves retain their 1 km limit; legacy radii stay preserved
  unless explicitly changed. Address design and cost estimates: `venue-address-change-2026-11-05.md`.
- Required main prerequisites: Venue Location menu entry, authenticated owner maps-key route,
  location route/rules, two owner address rate buckets, cyan location tokens.
- Shared GeofenceEditor/VenueMapPicker changes retain admin/signup defaults; OwnerShell spacing
  changes are opt-in. Related tests, plan/handoffs/checklist and Andrew's minimal-copy rule in
  AGENTS.md/CLAUDE.md are included.
- Main's self-serve contract test now admits the authenticated owner maps-key caller as well as
  signup. Main's signup price copy and implementation remain unchanged.

All other after-app-review commits are excluded: no messaging, game, billing-price, native,
player-route, migration, dependency, workflow or deployment-config changes. Root layout, proxy,
player geofence/geolocation, native helpers and signup implementation are byte-identical to main.
The theme-token change is only the appended VENUE_LOCATION export; the rate-limit change is
only the two new owner address buckets. No new environment variable, cron, data migration,
backup, undo log, paid live request or venue write occurred. No production deploy is authorized.

### Validation of this main-based candidate

Node dependencies are symlinked from the original workspace's node_modules. No .env.local was
copied or read. Run commands in the isolated directory. Build needs normal Google Fonts access.

- `npx next typegen` then `npx tsc --noEmit`: pass (sequential with build).
- `npm run lint`: pass; final test-only caller-list change also passes targeted ESLint.
- `npm run build`: pass, 221 pages.
- `git diff --check`: pass.
- Focused command below: 13 files, 247 tests pass, including native-app and owner-menu checks.
- `npm test`: 5,643 pass / 13 skip / four unchanged stale sports-index failures (454 files:
  449 pass / four fail / one skip). Failures are the MLB/NFL star-index tests and their freshness
  tests: generated October 14, beyond their 14-day limit on November 5. Those tests and data
  are unchanged from main. Do not refresh unrelated sports snapshots under this PR.

```sh
npx vitest run tests/owner-venue-location-page-contract.test.ts tests/owner-venue-location-page.render.test.ts tests/venue-activation.geofence-editor.test.ts tests/venue-activation.phase4-mount.test.ts tests/lib.venueLocationRules.test.ts tests/api.owner.venues-location.test.ts tests/light-surface-css-contract.test.ts tests/venue-map-picker.render.test.ts tests/api.owner.venue-address.test.ts tests/api.signup.rate-limit.test.ts tests/owner-menu-contract.test.ts tests/native-app-contract.test.ts tests/self-serve-signup-contract.test.ts
```

Private local evidence/logs: `tmp/venue-location-isolated-pr-2026-11-05/` in the original workspace.
Original application manifest: `tmp/venue-location-phase3-2026-11-05/source-sha256.json`;
all 21 original source/test hashes remain unchanged. Real-device, Google referrer/Places and
live venue-save checks remain unperformed as documented in the Phase 3 handoff/checklist.

### Merge decision and next steps

Andrew authorized a separate PR and a merge ONLY if it cannot risk delaying review; otherwise
he is content to wait. That condition is not established: native/capacitor.config.json loads
https://play.hightopchallenge.com. Owner pages link out, but main still deploys the same site
serving the reviewing app. Keep the PR draft and unmerged, with no auto-merge. No further input
is required to leave it held. After Andrew confirms review approval or explicitly changes the
release instruction, recheck the exact PR diff, current main, CI and deployment state before
publishing. Do not merge the whole after-app-review branch. No model switch or new phase is needed.
