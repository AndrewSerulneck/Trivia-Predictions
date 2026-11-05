# Venue Location usability plan

**Status (2026-11-05): Complete locally; Phases 0–3 and all follow-ups finished, accepted by Andrew.
Final review: 168 focused tests pass; device checklist and release handoff updated.
Earlier full suite: 6,492 passed / 13 skipped / four unchanged stale sports-snapshot failures.
Venue Location work committed locally on `after-app-review`; no branch push requested.
Isolated draft PR #10 remains held unmerged.
No production release. Physical-device/real-Google observations remain unperformed.**
Publication hold: [draft PR #10](https://github.com/AndrewSerulneck/Trivia-Predictions/pull/10);
[isolation and release handoff](venue-location-isolated-pr-2026-11-05.md).
Final handoff: [Phase 3](venue-location-usability-plan_PHASE_3_HANDOFF.md).
Address extension/handoff: [2026-11-05 record](venue-address-change-2026-11-05.md).
Handoffs: [Phase 0](venue-location-usability-plan_PHASE_0_HANDOFF.md),
[Phase 1](venue-location-usability-plan_PHASE_1_HANDOFF.md),
[Phase 2](venue-location-usability-plan_PHASE_2_HANDOFF.md),
[Phase 3](venue-location-usability-plan_PHASE_3_HANDOFF.md).
Each completed or interrupted phase must write `venue-location-usability-plan_PHASE_<N>_HANDOFF.md`
beside this plan and update this status line.

## For Andrew

Show the venue pin and its geofence as soon as Venue Location opens. Keep changes locked until the partner
taps a clearly filled **Edit location & geofence** button. Remove both requested paragraphs. The map becomes
the main object on the page, with less text around it.

This also needs one accuracy fix: the existing editor draws a saved 600 m radius as 200 m because it uses
the radius dial's limit. The visible circle should show the actual saved radius, including before editing.
The available replacement sizes remain 50–200 m. Player eligibility rules stay as they are.

Showing the map immediately adds Google Maps loads for partners who currently leave without tapping Edit.
The cost model is below; actual traffic, bytes and billing are not measured. During Phase 1, Andrew explicitly
waived that measurement gate because this tool will be used infrequently. All implementation/review phases and follow-ups are complete locally; publication has not occurred.

## Scope and decisions

Andrew's requests on 2026-11-05 are settled; do not ask them again:

1. Make **Edit location & geofence** visibly clickable.
2. Remove **“Locked so a stray tap can't move the pin or resize the radius. Tap to make changes.”**
3. Show the saved location and geofence before tapping Edit.
4. Remove **“Players can't join? Stand inside your venue and tap Use my current location.”**

Additional requests authorized with Phase 2 on 2026-11-05:

5. Remove the page subtitle **“Where players can join”** (the dashboard menu hint is outside this request).
6. Use the venue name above the map as the venue dropdown, so it appears once. Keep one-venue names as
   plain headings, and keep multi-venue switching available during loading/error/support states.
7. Make the containing card meet the app header to save vertical space. The page opts into a new
   `OwnerShell.flushHeader` prop; all other shell callers retain their spacing.

Latest follow-up (2026-11-05), superseding the earlier GPS/pin-details presentation requirements:
Andrew gave complete replacement instructions: remove the entire pin-details/GPS box (provenance,
coordinates, Check link, current-location action and explanatory text), remove the paragraph beneath the
map, and keep the existing Geofence Size box. No replacement map instruction, address editing, radius
redesign or added controls. Keep the existing Edit lock, venue selector and explicit Save behavior.
This is implemented only for the partner page via `hidePinDetails`; admin/signup defaults stay intact.
Evidence and updated handoff: [Phase 2 follow-up](venue-location-usability-plan_PHASE_2_HANDOFF.md#phase-2-cleanup-follow-up--2026-11-05).

**Later address extension:** Andrew separately requested Change address and confirmed it should replace
the address and move the pin, including over 1 km. This supersedes the earlier no-address-editing scope
and permits explicit Places lookup. Ordinary pin-only saves retain the 1 km cap. The compact section,
confirmed behavior, costs and evidence are in [the address record](venue-address-change-2026-11-05.md).

**Editor close follow-up:** the Geofence Size box has a cyan **Close** button that returns to the locked preview.
Closing preserves draft pin/radius/address changes and does not save; reopening keeps the same map.
Keyboard focus returns to Edit. Close is disabled during Save. See the Phase 2 handoff's latest appendix.

Implementation choices: retain deliberate unlocking; use one existing cyan action treatment with dark text,
a 48 px minimum target, hover/pressed/keyboard-focus states and an actual `<button type="button">`.
Remove the lock emoji from this page's action. Keep the dark page shell and shared light map/editor panel;
add `ht-light-surface` to that panel so its control classes work as intended. Avoid extra cards or new
explanatory paragraphs. The latest follow-up above removes **Use my current location** from this partner page.

Preserve pin-only saves, explicit radius intent (`onRadiusChange`), the 1 km pin-only cap, Save state,
venue-switch confirmation, stale-response guards, load retries, owner scoping and auth recovery. No automatic
GPS request, save, polling or background geocoding; no new service, migration, player eligibility change or billing gate.
Signup and admin keep their current default editor presentation and loading behavior.

This is a follow-up to `signup-price-copy-and-partner-geofence-plan.md`. It supersedes that plan's requested
helper paragraph and partner-only hidden-map presentation. D4/D7 and the ordinary pin-only D6 limit remain;
the authorized address extension supersedes D3 for verified address selection. Andrew accepted
the unpaid-claim risk on 2026-11-03; do not reopen that decision under this UI work.

## Original system and causes (historical, before Phase 1)

| File / function | Finding and implication |
|---|---|
| `app/owner/venue-location/page.tsx` | Loads `/api/owner/venues`, then the selected venue's `/api/owner/venues/location`. Passes `startLocked`, `hideAdvanced`, owner Maps endpoint and signup radius bounds to the shared editor. Renders `COPY.helper` above it. |
| `components/admin/GeofenceEditor.tsx` | `if (locked)` returns only a white summary card; `VenueMapPicker` is never mounted. This is the direct cause of the missing map, rather than a missing saved coordinate. The same branch contains the unwanted lock paragraph and white outlined action. |
| `app/globals.css` / light panel | Unlayered `button:not(:disabled):where(:not(.ht-light-surface *))` overrides Tailwind button borders/weight outside a light-surface scope. The partner page's light editor wrapper lacks that scope. White fill plus a faint border also makes the action weak. Confirm final computed styles in a browser. |
| `components/admin/VenueMapPicker.tsx` | Always creates a draggable marker; has no read-only prop. Uses one SDK script per document, but creates a map per component mount. Add an explicit mutation lock before showing it while locked. |
| `GeofenceEditor` radius handling | `value = clampRadius(snapRadius(radius, min, max), min, max)` drives both map and dial. A stored 600 m therefore draws 200 m, although the page correctly preserves 600 on pin-only saves. Separate display geometry from the dial value for the new presentation. |
| `VenueMapPicker` framing/loading | `fitToCircle` is used on material radius changes and recenter, but not directly on initial construction. Fit the initial circle after map sizing. SDK failure currently calls its ready queue without checking for `window.google.maps`, allowing a blank map; the new preview needs an honest unavailable state. |
| `lib/venueLocationRules.ts` | Owns `VENUE_LOCATION_COPY.helper` and radius/save/refusal copy. Remove the unused helper entry when removing its only rendering use. Keep validation unchanged. |
| Shared consumers | `components/admin/mobile/ActivateVenueFlow.tsx` locks edit mode; `components/admin/sections/VenuesSection.tsx` and `components/signup/steps/GeofenceStep.tsx` use the default unlocked editor. Opt in only the partner page. |

The map represents the stored/configured radius, not a guarantee of the exact player admission boundary.
`lib/geofence.ts` still applies a 300 m minimum plus GPS allowance. Do not change or add new product copy
about those rules in this plan.

## Phases and models

Andrew selected GPT-6.1 in Codex for this plan. Use GPT-6.1 (Codex) for the following phases, varying effort
by the work. Follow an explicit later model choice from Andrew and record any change in the handoff.

| Phase | Model / effort | Reason |
|---|---|---|
| 0 — Analyze and write this plan — complete | GPT-6.1 (Codex) / high | Existing session investigated shared map behavior, radius correctness and cost; more analysis than a mechanical documentation edit. |
| 1 — Implement map preview and page presentation — complete locally | GPT-6.1 (Codex) / high | Shared renderer lifecycle, interaction locking and unclamped display geometry span multiple files. |
| 2 — Regression and browser verification — complete locally | GPT-6.1 (Codex) / medium | Specified behavior matrix, compact layout follow-up and focused regressions; existing components and palette. |
| 3 — Review and release handoff — complete locally | GPT-6.1 (Codex) / medium | Review the result, record evidence and prepare the phone/release checklist. |

### Phase 1 — Implement the visible, locked map and clearer action

Goal: a partner can inspect their saved location immediately, then deliberately enter editing.
Scope: the shared editor/map seam, partner page, necessary tokens/copy and behavior tests alongside the change.

1. Before the cost-affecting change, complete the measurement gate below and record the baseline in this plan
   or a linked evidence note. **Exception authorized by Andrew on 2026-11-05: skip live measurement for this
   infrequently used tool (exact reply recorded below).** Retain the source-derived estimate and reuse one map.
   If a material recurring increase is indicated, tell Andrew the estimate and lower-cost option before
   implementing the cost-affecting part.
2. Add an opt-in editor presentation such as `lockedView?: "summary" | "map"`, default `"summary"`.
   Pass `lockedView="map"` only from `/owner/venue-location`. Keep `startLocked`.
   Refactor this presentation to render **one map at one stable position in the React tree** before and after
   unlocking; conditionally render its action/controls below. Unlocking must not remount the map, fetch the
   key again or construct another `google.maps.Map`.
3. Add `readOnly?: boolean` to `VenueMapPicker`, default false. The preview passes `locked || disabled`.
   Set marker dragging off initially, update it when the prop changes, and guard drag callbacks with the
   latest read-only state. Extend the local Google marker type for its setter. A stale drag event cannot
   emit an edit while locked or saving. Panning/zooming may inspect the map without moving the pin; retain
   normal touch page scrolling. Hide edit-specific map instructions while read-only.
4. For the opt-in presentation, pass the actual parent radius to the circle and summary; keep the snapped,
   clamped value exclusively for the dial/presets. The page already falls back from null to 150 m. A stored
   600 m remains 600 through unlocking, GPS and pin movement until `onRadiusChange` deliberately changes it.
   Retain the existing out-of-range note and its accurate replacement-size explanation. Do not normalize
   stored values on mount or fire change callbacks merely to display them.
5. Fit the entire initial circle with padding after the map has a usable size, including saved radii above
   200 m; retain the existing deferred refit behavior during dial dragging. Surface key/SDK/network failure
   as a short unavailable state instead of a permanent blank/loading panel. Keep the page and editing
   action usable, retain draft values, and avoid automatic request retries or a general loader rewrite.
6. In `GeofenceEditor`, use a filled cyan action for the map presentation, removing the lock paragraph from
   this presentation. Keep the existing default summary presentation for admin. Put the action classes in
   `lib/themeTokens.ts`, reusing the existing palette; follow the brand source/token convention if a new
   design value is actually needed. Provide visible `focus-visible` treatment and keyboard activation.
7. In the partner page, add `ht-light-surface` to the existing light wrapper, remove the `COPY.helper`
   paragraph and remove its unused key from `VENUE_LOCATION_COPY`. Keep the venue heading, saved-radius
   exception note, map, edit action and existing save flow. Do not recreate the two removed paragraphs
   elsewhere on this page, including after unlocking. Keep the normal GPS control's functional help/errors.

Exit: the intended UI works locally with mocked data; focused tests for the changed interactions pass.
Write `venue-location-usability-plan_PHASE_1_HANDOFF.md`, including changed props, lifecycle decisions,
cost baseline, limitations and exact verification commands.

### Phase 2 — Verify behavior, geometry and appearance

Extend `tests/owner-venue-location-page.render.test.ts`,
`tests/venue-activation.geofence-editor.test.ts` and the page contract as appropriate. Add a focused
`tests/venue-map-picker.render.test.ts` using a fake Google Maps API and ResizeObserver so the actual
map component is tested; a stub that ignores read-only state cannot prove the lock works.

Acceptance cases:

- Before Edit: map, saved pin and full circle visible; both removed paragraphs absent; no GPS request,
  PATCH, enabled radius control or draggable pin. Save remains disabled.
- Edit by pointer and keyboard: controls become available, no save/change callback fires just from
  unlocking, and the same map instance/key request is retained. Action visibly reads as a button.
- Saved 50, 150, 200 and 600 m: map reflects each actual value. For 600, unlocking and pin/GPS changes
  retain 600; selecting the 200 m chip deliberately changes the circle and saved radius to 200.
  Null radius displays 150 without enabling Save. Include a positive legacy radius below 50 (e.g. 25).
- Fake Maps tests assert initial `draggable: false`, setter updates after unlock, blocked stale drag
  callbacks while locked/saving, initial bounds fitting and one construction across unlocking.
- Existing save failure, non-JSON load failure/retry, no-pin/placeholder support state, 401 recovery,
  multi-venue discard confirmation and response scoping continue to work. Switching venues shows the
  new venue's circle and returns to the locked view without briefly displaying the old venue as current.
- Maps key 503 / SDK failure displays an honest fallback, makes no automatic retry and preserves data.
- Admin edit still starts with its summary and no map load; admin create/desktop and signup retain their
  defaults. Update stale comments in tests claiming there is only one `startLocked` caller.

Run the focused command in the Phase 0 handoff, adding the new map test. Then run, sequentially:

```sh
npx tsc --noEmit
npm run lint
npm run test
npm run build
```

Use a scratch checkout without `.env.local`, an unused port (e.g. 3107), mocked API routes and a fake Maps SDK
for screenshots at 350, 390 and 1280 px. Do not use Andrew's :3000 server or save a real venue. Check computed
button fill/border/text/focus styles with real global CSS, long venue names, no horizontal overflow, full
circle framing and mobile scroll gestures. Record which checks used fakes; those do not prove live Google
tiles, key restrictions or actual phone touch behavior. No new paid test API is needed.

Exit: all four requested outcomes demonstrated; meaningful regressions pass, with unrelated failures
identified by evidence. Write `venue-location-usability-plan_PHASE_2_HANDOFF.md` with screenshots and counts.

### Phase 3 — Review and release handoff

Review the diff against the original four requests, accepted follow-ups and Phase 2 evidence. Extend section N of
`docs/partner-dashboard-app-redesign-device-checklist.md`: open without Edit and see pin/circle; inspect
without moving it; verify the filled action and deleted copy; unlock and check controls; inspect a legacy
radius; test actual mobile scrolling and Maps loading/failure. Reuse a designated test venue for any
later authorized save; viewing a map must never write location data.

Record local commit/push/preview/deployment facts separately and the outstanding physical-device checks.
The current branch is `after-app-review`; `CLAUDE.md` holds `main` pushes and production changes until
Andrew confirms App Store approval. This planning request does not provide that confirmation. Prepare a
reviewable local change; publication is outside this request. After an eventual authorized release,
compare actual map usage/bytes to the baseline and report any material difference. UI rollback reverts
only these changes; no migration, venue data repair or data undo is needed.

Exit: write `venue-location-usability-plan_PHASE_3_HANDOFF.md`, update this plan's status and link the
final evidence. Do not label the feature live based on local screenshots or passing tests.

## Cost model and measurement gate

Source-derived baseline, per successful first page open with one usable selected venue:

- Today before Edit: 2 owner HTTP requests, 6 DB selects (2 auth selects + 1 payload select per route),
  zero map key requests or Maps constructions from this editor. On Edit: +1 key HTTP request,
  +2 auth selects and +1 map construction; SDK downloads once per document if not already loaded.
- Proposed: the same totals as today's edited visit, incurred on page entry. Unlock adds zero requests
  and zero constructions. Saves remain 4 DB operations: 2 auth selects + 1 location select + 1 update.
  No fan-out over players/games, no cron, no polling, no new writes from viewing. A selected-venue switch
  remounts the editor through the existing load branch; count its map separately. Manual retries/reloads
  also count separately. The venue-list/auth reads scale with the owner's venue count, not player count.

Let `V` be usable selected-venue views/day, including reloads/switches/manual retries, and `p` the fraction
that currently unlock. Additional maps/day = `V × (1-p)`; additional DB selects/day = `2V × (1-p)`.
For **illustration only**, at `p = 20%` and 30 days/month:

| Volume scenario | Map constructions before → after / day | Additional / month | Additional DB selects / month |
|---|---|---|---|
| 10 views/day | 2 → 10 | 240 | 480 |
| 1,000 views/day | 200 → 1,000 | 24,000 | 48,000 |

**Phase 1 decision, 2026-11-05:** asked Andrew whether view/unlock counts, Maps billing usage or an
authenticated preview session were available before changing page-entry loading. Andrew replied:
**“That's ok to skip for this. This tool won't be used often.”** This explicitly waives the measurement
gate for Phase 1; proceed with the requested preview without adding an activation flag or another service.
No live key, cookie, `.env.local` value, billing account or venue record was accessed. Source-derived
request/query estimates above remain the baseline; they are not measured production usage. Local fake-Google
tests verify one key request/one map construction across unlock, zero automatic retries and zero GPS requests
on entry. Real bytes, tile/SDK cache behavior and dollars remain unknown. No recurring production usage changes
occur until publication; compare actual usage after an eventual authorized release if available.

Actual current `V`, `p`, Google billing/free allowance and transfer bytes are unknown. These scenarios
are not measurements. Before Phase 1's map-loading change, measure current pre/post-unlock request counts,
map constructions and transferred bytes using an authorized browser session/hosted preview if available;
record SDK-cold versus SDK-warm navigation and one venue switch. Keep API keys/cookies out of evidence.
Use available aggregate usage/billing for actual volume and current rates; do not invent a dollar estimate
or access secrets to obtain it. If unavailable, record that dependency and complete unaffected UI work.

If `B` is measured incremental map/key/tile transfer per newly mapped view, additional transfer/day is
approximately `V × (1-p) × B`; multiply by 30 for monthly. Separate cached SDK bytes from per-view tiles.
Estimate money using the account's actual billable map SKU/rate and free allowance, rather than equating
script downloads to billable map loads. If material, report the estimate before implementation/deployment.
The existing tap-to-load behavior is cheaper but fails the requested preview; an alternative static preview
would need separate pricing, accurate circle rendering and cache analysis. Do not silently add another
paid map service or parallel static/live maps.

## Evidence from Phase 0

2026-11-05: read the canonical project rules, page, editor, map, location rules/API, owner auth/list queries,
previous plan/handoff, design rules, global CSS and existing regressions. Starting branch `after-app-review`,
HEAD `637e39e97cdd7543c5c676a5d8ed79210539ec19`; working tree was clean before these docs.
Focused local Vitest baseline: **7 files, 64 tests passed**, 1.06 s. Tests use mocks; no live data or paid
Maps API was accessed. Live hosting, real browser appearance, current traffic/billing and App Store approval
were not checked. These are Phase 0 historical results; Phase 1 evidence is in its handoff.


## Phase 2 evidence (2026-11-05)

See [Phase 2 handoff](venue-location-usability-plan_PHASE_2_HANDOFF.md) for exact commands, paths and remaining
limits. The three additional layout requests are implemented locally. Browser verification found the legacy
small-phone `min-height: 36px !important` rule overriding the Edit target; the action token now also sets
`h-[48px]`. No global CSS was changed.

- Focused: 8 files / 95 passing tests. Typecheck and source lint pass; production build generates 232 pages.
- Full suite: 6,453 pass / 13 environment skips / 4 failures in unchanged NFL/MLB snapshot freshness tests.
  Their snapshots were generated 2026-10-14, beyond the 14-day maximum. A separate 58-test run reproduces
  those same 4 failures / 54 passes; `git diff --exit-code HEAD --` on those tests, helpers and snapshots is
  clean. No sports snapshot was refreshed and no unrelated code was changed.
- Isolated scratch browser: Chromium + WebKit at 350, 390 and 1280 px, real app/global CSS, mocked owner
  routes and a diagrammatic fake Maps SDK. Six layout cases and four 390 px key/SDK failure cases pass.
  Enter/Space/pointer editing, visible 2 px focus outline, 48 px cyan action, one venue label, long names,
  zero horizontal overflow, zero card/header gap, cooperative map configuration and Chromium simulated touch
  scroll pass. Unlock keeps one map/key request; venue switches relock correctly. Zero browser GPS/PATCH.
- Preserved ignored evidence: `tmp/venue-location-phase2-2026-11-05/` (scripts, JSON, screenshots and logs).
  Real Google tiles/bounds accuracy/referrer restrictions and physical-device gestures remain unverified.
  No production release, migrations, live venue writes, paid Maps test or new recurring operations.


## Phase 3 completion — 2026-11-05

Andrew requested the final phase and accepted the work as done. Reviewed the final preview/cleanup,
venue selector/header, minimal confirmation, signed address relocation and branded Close behavior.
No application change was needed. Final combined run: **168 tests / 10 files pass**, zero failures/skips;
source/test hashes are preserved in `tmp/venue-location-phase3-2026-11-05/source-sha256.json` and remained
unchanged through this documentation phase. Final review/test evidence is in that ignored directory.

Section N of `docs/partner-dashboard-app-redesign-device-checklist.md` now matches the final UI and
separates automated fake-SDK evidence from unperformed real-device/Google observations. Existing broader
lint/type/build/browser evidence and four unrelated full-suite freshness failures are recorded precisely
in [the final handoff](venue-location-usability-plan_PHASE_3_HANDOFF.md). No new full-bank/provider job,
live venue write, deployment or paid test was run. No further implementation phase or answer is pending.
Publication and actual usage comparison belong to a later separately authorized release.
