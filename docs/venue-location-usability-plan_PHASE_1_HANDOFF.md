# Venue Location usability — Phase 1 handoff (2026-11-05)

## For Andrew

Phase 1 is built locally. Venue Location now shows the saved pin and full configured geofence before
editing, with a filled cyan **Edit location & geofence** button. Both requested paragraphs are removed.
Editing still requires that button, and a saved 600 m radius remains 600 m until a size is deliberately
chosen. Maps loading failures show a short message while the edit action remains usable.

Nothing is committed, pushed or live. The 80 focused tests, TypeScript and source lint checks pass. Browser appearance,
the full regression suite/build and phone checks remain for Phases 2–3. Andrew explicitly authorized
skipping the live Maps cost measurement because this tool will be used infrequently; no further cost
measurement answer is needed to continue this plan.

## For the next agent

### 1. Next phase: goal and scope

Execute Phase 2 of `docs/venue-location-usability-plan.md`: extend remaining regressions, run the full
local gates, and inspect the actual page/global CSS in a scratch browser at 350, 390 and 1280 px with
mocked owner APIs and a fake Google Maps SDK. The new actual-map lifecycle tests already exist; extend
them rather than replacing them with a passive map stub. Phase 3 then reviews and prepares release/device
documentation; it has not started.

Phase 1 model recommendation: GPT-6.1 (Codex) / high, as selected by Andrew in the plan. Phase 2 remains
GPT-6.1 (Codex) / medium for the specified verification matrix; Phase 3 uses the same model / medium.
No subagents or model switches were requested or used in Phase 1.

Out of scope: production publication, new paid services, migrations, database repairs, auth/billing/player
eligibility changes, reopening the unpaid-claim decision, redesigning admin/signup, or adding telemetry,
polling or an activation flag for this preview.

### 2. Starting state and data

- Repository: `/Users/andrewserulneck/Documents/Trivia-Predictions`.
- Branch: `after-app-review`.
- HEAD remains `637e39e97cdd7543c5c676a5d8ed79210539ec19`
  (`Share to social: Facebook Post now (hidden), code-review fixes (Phases 6, 8-21) + game themes`).
- At entry, `AGENTS.md` and `CLAUDE.md` were modified and the Phase 0 plan/handoff were untracked.
  Those existing instruction edits are preserved. Phase 1 application/tests/docs are also uncommitted.
  No commit, push, PR, preview deployment or production deployment was performed or independently checked.
- No live database/venue data, browser key, cookie or `.env.local` value was read or changed. No migration,
  import, paid Maps request, server, backup or data-repair script ran. All API/Maps test responses are fake.
  Test stdout referring to `venue-1` updates comes from mocked API tests, not a real venue write.
- No backup/undo log is required. Roll back only this phase's application/test changes if necessary;
  preserve the prior instruction/planning edits. Do not use a blanket restore/reset of the working tree.
- `CLAUDE.md` still freezes `main` pushes, linked database pushes and production changes pending Andrew's
  App Store approval. The Phase 1 request supplies no such approval.

### 3. Decisions already made

- All four requested outcomes are settled: filled Edit action, visible locked map, and removal of both
  quoted paragraphs. The newer plan overrides the old hidden-map/helper paragraph requirements.
- Keep `startLocked`; only the partner page passes `lockedView="map"`. Admin's locked edit summary
  remains the default and makes no Maps request until unlocked; signup/desktop remain unlocked by default.
- Keep one map at one stable position in the editor tree; toggle only the controls below it. Unlocking
  must not fetch another key or construct another `google.maps.Map`.
- Map geometry uses the actual parent radius in this presentation. The dial/presets retain their 50–200 m
  range and clamped/snapped value. Pin-only/GPS/manual edits do not declare radius intent; only the
  dial/chips call `onRadiusChange`. The page still ignores `onChange.radius` for saving (D7).
- Keep the 1,000 m server movement cap, null→150 m display/save fallback, owner scoping, explicit save,
  discard confirmation, auth recovery and existing radius exception note. No player admission changes.
- No new design color was added. `VENUE_LOCATION.editAction` uses the existing cyan/slate palette and
  includes a 48 px minimum target, hover/pressed and visible keyboard-focus classes.
- Maps key/network/SDK load failure has no automatic retry. A 20-second bound prevents indefinite
  loading. A document's failed SDK script is remembered; a subsequent mount fails honestly instead of
  silently adding another script. Reloading the document can try again.
- **Cost answer on 2026-11-05:** after being asked about live view/unlock counts, Maps billing usage or an
  authenticated preview, Andrew replied: **“That's ok to skip for this. This tool won't be used often.”**
  This explicitly waives Phase 1's measurement gate. Do not ask it again or leave activation pending.

### 4. Files changed and seams

- `app/owner/venue-location/page.tsx`: opts into `lockedView="map"`, retains `startLocked`, adds
  `ht-light-surface` to the existing light wrapper and removes `COPY.helper`. `handleVenueChange` clears
  the old saved preview and enters loading in the same render as the selection change, preventing the
  old venue map from appearing under the new heading before the GET effect runs.
- `components/admin/GeofenceEditor.tsx`: new optional `lockedView?: "summary" | "map"` (default summary).
  `displayRadius` separates actual map geometry from the dial's `value`. The existing summary early
  return remains for admin; map presentation keeps `VenueMapPicker` as the first child across unlock.
  Map presentation renders summary/Edit while locked and existing GPS/dial/advanced controls after unlock.
  `readOnly = locked || disabled`; event handlers also guard mutations. Its latest committed state is
  copied into a ref in a layout effect, not during render (required by the React lint rule).
- `components/admin/VenueMapPicker.tsx`: new `readOnly?: boolean` (default false). Marker construction
  sets `draggable: !readOnly`; the setter updates it on unlock/save. Drag callbacks consult current
  committed refs and restore the saved/draft position on a blocked stale event. The inspection map uses
  `gestureHandling: "cooperative"`; edit instructions disappear in read-only mode. Initial bounds fit
  waits for a nonzero size (ResizeObserver or initial measured rect), fits with 40 px padding and retains
  deferred fitting during dial drags. Material refits now clear pending state to avoid a second release fit.
  Key HTTP errors, invalid key payload, network/SDK errors, constructor errors and stalled loads show a
  generic unavailable state. Fetch abort/timer/ready-queue cleanup prevents late state updates or retries.
- `lib/themeTokens.ts`: new `VENUE_LOCATION.editAction` Tailwind class token; existing palette only.
- `lib/venueLocationRules.ts`: removes the unused `helper` copy key; updates the `radiusKept` comment.
  All validation functions, refusal copy and actual exception-note wording remain unchanged.
- `tests/venue-map-picker.render.test.ts` (new): real editor and map, fake Google API and ResizeObserver;
  15 tests covering construction/mutation lock, blocked late drag, usable-size fitting, deferred refits,
  default editability, key/network/SDK/stall failures, 25/50/150/200/600 m geometry, single map across unlock,
  pin/GPS radius preservation, explicit 200 m replacement, admin deferred loading and editing after failure.
- `tests/owner-venue-location-page.render.test.ts`: map stub now honors read-only and exposes its radius;
  new before/after-unlock case checks map identity, 600 m preview, absent copy and disabled Save. Existing
  pin-only save, explicit size, null fallback, failed-load/save and discard-switch tests remain.
- `tests/owner-venue-location-page-contract.test.ts`: pins the new presentation/light scope/helper removal.
- `tests/venue-activation.phase4-mount.test.ts`: corrects the stale “exactly one startLocked caller” comment.
- `docs/venue-location-usability-plan.md`: status, local implementation facts and Andrew's cost exception.
- `docs/venue-location-usability-plan_PHASE_1_HANDOFF.md`: this handoff.

### 5. Cost baseline, traps and limitations

The unmeasured source baseline remains 2 owner HTTP requests / 6 DB selects before Edit; unlocking adds
1 key HTTP request / 2 auth selects / 1 Maps construction. Proposed entry now incurs those same totals
(3 HTTP / 8 selects / 1 map), with zero additional key requests or map constructions on unlock. SDK reuse
is per document; venue switches, reloads and manual retry/remounts each count as another usable view.
Saves remain 4 DB operations. No player/game fan-out, cron, polling or view-triggered writes were added.

For `V` usable views/day and prior unlock fraction `p`, incremental maps/day = `V(1-p)` and DB selects/day
= `2V(1-p)`. At an illustrative `p=20%`, 10 views/day adds 240 maps and 480 selects per 30 days; 1,000
views/day adds 24,000 maps and 48,000 selects. These are scenarios, not traffic measurements. Bytes,
Google billable SKU/rate/free allowance, cache behavior and dollars are unknown. Andrew waived collection;
there is no evidence of actual recurring cost yet and nothing was deployed.

Traps:

- Do not reconnect the map radius to the dial's `value`, drop `startLocked`, or introduce a second locked
  map branch: those reintroduce the geometry, accidental-drag or billable-reconstruction problems.
- The actual map tests matter; page/editor map stubs alone cannot prove Google's marker mutation gate.
- The fallback detects configuration/SDK/initialization failure, not every possible later tile or Google
  billing/referrer-overlay error. Real Maps tiles/key restrictions still need live/device observation.
- Dial keyboard/drag movement to its already-shown end value still does not fire a size change, as before.
  The 200 m chip deliberately fires even when the dial already shows 200. Keep that explicit intent path.
- The configured circle is not a promise about player admission; the independent 300 m minimum/GPS
  allowance in `lib/geofence.ts` is unchanged and has no new product copy.
- `npm run lint` also scans old ignored scratch checkouts and their generated bundles under `tmp/`.
  The initial command was stopped with Ctrl-C after it began parsing those files; nothing was deleted.
  Use `npm run lint -- --ignore-pattern 'tmp/**'` for an equivalent source lint without archived builds.
  A first source-lint run caught the render-time ref write; it was fixed with layout-effect syncing.

### 6. Verification and exact commands

Run from the repository root using the installed Node/npm dependencies (no live environment needed):

```sh
npx vitest run tests/owner-venue-location-page-contract.test.ts tests/owner-venue-location-page.render.test.ts tests/venue-activation.geofence-editor.test.ts tests/venue-activation.phase4-mount.test.ts tests/lib.venueLocationRules.test.ts tests/api.owner.venues-location.test.ts tests/light-surface-css-contract.test.ts tests/venue-map-picker.render.test.ts
npx tsc --noEmit
npm run lint -- --ignore-pattern 'tmp/**'
git diff --check
```

Final focused run on 2026-11-05: **8 files, 80 passed, zero failed/skipped**, 1.19 seconds. Includes
unchanged server/rules tests plus real map lifecycle tests with fake Google constructors. Typecheck passed.
Changed-file ESLint and repository source lint (excluding archived `tmp/**`) passed after the ref fix.
`git diff --check` passed. All behavior checks here are Vitest/jsdom; no browser screenshots or live APIs.

Phase 2 must still run the full `npm run test` and `npm run build`, plus the remaining acceptance/browser
matrix. Never build concurrently with typecheck. Do not run browser writes on Andrew's :3000 server:
use a scratch checkout without `.env.local`, mocked routes and an unused port (such as 3107). A fresh
scratch checkout may need `npx next typegen` before typecheck. Preserve private/ignored evidence directories.

### 7. Open questions and remaining checks

No product or cost clarification is pending. Physical-device/real Google Maps behavior, computed button
fill/focus/global CSS, mobile scrolling, long names, overflow and screenshots are unverified. Native and
player geofence behavior were not modified. App Store approval and publication remain outside this request.

### 8. Recommended first steps

Read the project rules and current plan, then check status to preserve later work. Continue with Phase 2
using GPT-6.1 (Codex) / medium. Extend auth/no-pin/response-scoping/switch tests, keyboard activation and
the remaining failure cases; do not redo already-proven basic editor tests. Run the full gates and the
scratch browser matrix, label fake-SDK evidence explicitly, and write the Phase 2 handoff before marking
that phase complete. Phase 1 is local implementation only; do not label it live.
