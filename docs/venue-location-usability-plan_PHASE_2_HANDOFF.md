# Venue Location usability — Phase 2 handoff (2026-11-05)

## For Andrew

Phase 2 is complete locally. “Where players can join” is removed, the venue name above the map is now
its selector, and the surrounding card meets the page header. There is one venue name instead of two.
The saved pin/circle still appears before Edit, with a cyan button that stays 48 px high on small phones.

95 focused tests, TypeScript, source lint, the production build and Chromium/WebKit browser checks pass.
The full suite has 6,453 passes, 13 skips and four unrelated failures because existing sports snapshots
are older than their 14-day limit. Nothing was committed, pushed or deployed. Phase 3 review/documentation
and actual-phone/real-Google checks remain; no answer or permission is needed to prepare Phase 3.

**Later cleanup follow-up (same date):** the partner pin-details/GPS box and map paragraph are now removed;
the Geofence Size box is unchanged. 98 focused tests and isolated browser/type/lint checks pass. See the
[follow-up record](#phase-2-cleanup-follow-up--2026-11-05) below; it supersedes earlier GPS visibility requirements.

## For the next agent

### 1. Next phase and scope

Execute **Phase 3** of `docs/venue-location-usability-plan.md`: review all seven settled requests against
the diff/evidence, extend section N of `docs/partner-dashboard-app-redesign-device-checklist.md`, record
release/device limits and write `docs/venue-location-usability-plan_PHASE_3_HANDOFF.md` before completion.
Do not redo the implementation or reopen the accepted cost-measurement waiver.

Plan recommendations remain **GPT-6.1 (Codex) / medium** for Phases 2 and 3: specified UI/verification and
review documentation. The executing environment identifies the Codex/GPT-6 family; its exact selected
runtime version is not independently exposed. No alternate model or subagent was invoked.

Out of scope: publication, pushing main, production settings, migrations, new paid services/telemetry,
refreshing sports snapshots, data repairs, player geofence rules, auth/billing changes or redesigning
admin/signup. Andrew requested Phase 2 and the three layout additions, not Phase 3 execution or release.

### 2. Starting state, source and data

- Repository: `/Users/andrewserulneck/Documents/Trivia-Predictions`.
- Branch: `after-app-review`; HEAD: `637e39e97cdd7543c5c676a5d8ed79210539ec19`
  (`Share to social: Facebook Post now (hidden), code-review fixes (Phases 6, 8-21) + game themes`).
- All Phase 0–2 plan/application/test work remains uncommitted. No commit, push, PR, hosted preview or
  deployment was performed or checked. Existing `AGENTS.md`/`CLAUDE.md` edits are preserved untouched.
- At entry Phase 1 had already modified the page, shared editor/map, theme tokens, location copy,
  page/render/activation tests and added `tests/venue-map-picker.render.test.ts`. Preserve that work.
- No real venue was saved; no migration, import, data backup/repair or undo script was needed. No live
  key/cookie or `.env.local` value was inspected. Normal root build loads its existing environment;
  the browser server used a separate source copy excluding **every `.env*` file**, no production secrets.
- Browser scratch: `/tmp/venue-location-phase2-scratch` (macOS physical path `/private/tmp/...`), with
  repository dependencies symlinked and its own `.next`. Tests used `http://127.0.0.1:3107`, never :3000.
  Its dev server was stopped after verification; restart instructions are below.
- Rollback is source-only. Revert only the relevant edits; do not reset the dirty tree or delete ignored
  evidence. No data undo log exists because no live data was changed.
- The App Store freeze in `CLAUDE.md` still applies. No approval of App Store/publication was inferred.

### 3. Decisions already made

Original settled requests: saved map visible while locked, filled Edit button, removal of the stray-tap
lock paragraph and “Players can't join?” helper from the partner page. Shared admin summary retains its
existing copy/default behavior. Radius rules, 1 km per-save cap, explicit Save, null→150, owner scoping,
retries and auth recovery remain.

Andrew's Phase 2 additions, 2026-11-05:

1. Remove the **page subtitle** “Where players can join.” The dashboard menu's hint is a separate surface.
2. Make the **name above the map the dropdown**. Use the existing accessible `Dropdown` within the h2;
   one-venue accounts get a plain heading. Keep the selector present through location loading/errors and
   support states so an owner can choose another venue even if one venue cannot load.
3. Make the **containing card meet the app header**. New `OwnerShell.flushHeader` removes its dark-content
   top padding only when opted in; this page uses a square top edge. Other pages keep their spacing.

Maintain one stable map on unlock, `readOnly = locked || disabled`, actual saved map radius including
25/600 m, and radius intent only from `onRadiusChange`. Do not normalize on mount or use the dial value
for map geometry. Only a deliberate replacement changes 600 to 200.

Cost authorization persists: Andrew's exact Phase 1 answer was **“That's ok to skip for this. This tool
won't be used often.”** Source baseline remains 3 entry HTTP requests / 8 DB selects / one map; unlock
adds zero. Each venue switch/remount counts separately. At illustrative 10 views/day and 20% prior-unlock
rate, 240 extra map loads / 480 selects per 30 days; at 1,000/day, 24,000 / 48,000. Real volume, bytes and
billing remain unknown. Phase 2 adds no recurring operations; release has not happened.

### 4. Files changed in this phase

- `app/owner/venue-location/page.tsx`: removes `subtitle`, passes `flushHeader`, uses one outer panel and
  one h2 containing either the venue-name `Dropdown` or plain single-venue name. Removes the separate
  selector row/duplicate name. The saved editor/Save group keeps its behavior; errors/loading remain
  below the heading. Existing Phase 1 `handleVenueChange` clearing the previous preview stays intact.
- `components/owner/OwnerShell.tsx`: optional `flushHeader?: boolean`, default false, dark variant only.
  Its only new effect is omitting `pt-5` from the content wrapper when true.
- `lib/venueLocationRules.ts`: deletes unused `pageSubtitle`. Validation/copy functions are unchanged.
- `lib/themeTokens.ts`: `VENUE_LOCATION.editAction` adds **`h-[48px]`** alongside `min-h-[48px]` and explains
  why. Browser verification found global small-phone `min-height: 36px !important` overrides the minimum;
  an explicit height fixes this locally, without new CSS or `!` classes.
- `tests/owner-venue-location-page.render.test.ts`: now 24 tests (was 10). Adds heading-as-selector,
  selector recovery after failed load, stored 25/50/150/200/600/null entry checks, no GPS/write, no-pin
  and (0,0) support states, stale GET across venue switches, both 401 codes across all three routes,
  disabled controls while saving and failed-draft retry. Existing pin-only/radius/discard tests remain.
- `tests/venue-activation.geofence-editor.test.ts`: adds pending GPS success + stale drag/dial callback
  protection after disabling. Corrects the old comment about where real-map tests live.
- `tests/owner-venue-location-page-contract.test.ts`: pins subtitle removal and flush opt-in alongside
  Phase 1 lock/map/radius contracts.
- `docs/venue-location-usability-plan.md`: Phase 2 status, three new requests, model rationale and evidence.
- `docs/venue-location-usability-plan_PHASE_2_HANDOFF.md`: this handoff.
- Ignored `tmp/venue-location-phase2-2026-11-05/`: reproducible browser scripts, JSON, screenshots and logs.
  The existing real-map test from Phase 1 was retained unchanged; it tests actual map/editor code with
  fake Google constructors/ResizeObserver, not merely the page's passive map stub.

### 5. Facts, traps and permissions

- Legacy global CSS at narrow widths enforces `min-height: 36px !important`, even within light surfaces.
  Do not remove the new explicit height or broadly change that shared rule under this plan.
- A regular global `svg { height: auto }` rule initially clipped the **test fixture SVG**, not the real
  map. The fixture now sets its own SVG height to 100%. Screenshots explicitly say SIMULATED MAP.
- Browser keyboard menu tests must wait for the option to receive focus after ArrowDown; the shared
  Dropdown focuses on requestAnimationFrame. Sending End/Enter immediately is a test race.
- WebKit/macOS Tab navigation preferences differ. Tests focus the button, issue ArrowRight to establish
  keyboard modality, then verify `:focus-visible` and activate with Enter; failure tests also use Space.
- `npm run dev -- --webpack` sets both Turbopack (in package script) and webpack and fails. Use the direct
  Next binary below. Broad rsync `--exclude=native` accidentally omits `components/native`; exclusions
  must be root-anchored (`--exclude=/native/`). The final scratch source includes those components.
- Local server binding and Playwright launch required sandbox escalation; automatic review allowed both.
  No approval was rejected and no user clarification is pending.
- Source lint must exclude archived scratch builds: `npm run lint -- --ignore-pattern 'tmp/**'`.
  This matches Phase 1's workaround; no lint configuration was changed.

### 6. Build, test and browser evidence

From the repository root (installed Node/npm dependencies required), final checks ran in the plan's
sequence: typecheck → source lint → full tests → build. No typecheck/build concurrency.

```sh
npx vitest run tests/owner-venue-location-page-contract.test.ts tests/owner-venue-location-page.render.test.ts tests/venue-activation.geofence-editor.test.ts tests/venue-activation.phase4-mount.test.ts tests/lib.venueLocationRules.test.ts tests/api.owner.venues-location.test.ts tests/light-surface-css-contract.test.ts tests/venue-map-picker.render.test.ts
npx tsc --noEmit
npm run lint -- --ignore-pattern 'tmp/**'
npm run test
npm run build
git diff --check
```

Focused: **8 files / 95 pass / zero skip/fail**. Typecheck, source lint and production build pass;
**232 pages** generated. Full final run: **493 files: 488 pass / 4 fail / 1 skip; 6,453 tests pass /
4 fail / 13 environment skips** (6,470 total). All failures are existing snapshot staleness assertions:

- `tests/lib.sportsBingo.mlb-star-index-freshness.test.ts:36`
- `tests/lib.sportsBingo.mlb-star-index.test.ts:422`
- `tests/lib.sportsBingo.nfl-star-index-freshness.test.ts:33`
- `tests/lib.sportsBingo.nfl-star-index.test.ts:312`

The snapshot generation times are `2026-10-14T15:34:29.633Z` (NFL) and `2026-10-14T15:34:29.938Z` (MLB),
both older than the unchanged 14-day maximum on 2026-11-05. Evidence of independence: `git diff --exit-code
HEAD --` on those four files, `lib/sportsBingoNflStars.ts`, `lib/sportsBingoMlbStars.ts` and both corresponding
`data/sports-bingo/*-star-index.json` returned clean. Running just those four files reproduced precisely
**4 failures / 54 passes**, without venue-location imports. Do not “fix” this by changing dates or limits.

Browser commands (start the already-prepared no-env scratch server in one terminal, then scripts from
repository root; server/browser process sandbox permissions may be needed):

```sh
cd /tmp/venue-location-phase2-scratch
node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3107
# Separate terminal, repository root:
node tmp/venue-location-phase2-2026-11-05/browser.cjs
node tmp/venue-location-phase2-2026-11-05/failures.cjs
```

Browser evidence uses real page/editor/map/global CSS, fake owner responses and a **diagrammatic fake
Google SDK**. Every `/api/*` is intercepted; all non-local browser origins are blocked. No live Google
SDK/tiles/key, real location, cookie or venue record is used. Scratch webpack development build, not a
hosted/production preview. Production compilation is separately verified by `npm run build`.

Chromium **and** WebKit at **350, 390, 1280 px** pass:

- One long venue name/selector, no requested paragraphs/subtitle, zero horizontal overflow and **0 px**
  card/header gap. A configured 600 m circle is supplied to the fake SDK and drawn fully in its frame.
- Cyan Edit computed fill `rgb(34, 211, 238)`, dark text `rgb(2, 6, 23)`, **48 px** height, border
  `rgb(229, 231, 235)`; keyboard focus is visible with a **2 px** outline `rgb(6, 182, 212)`.
- Before Edit: no dial/GPS/PATCH, disabled Saved, marker not draggable. Enter/pointer unlock enables
  controls, retaining **one** map/key request. Explicit 200 m choice changes the circle; selection
  cancellation preserves the draft; confirmed keyboard selection switches to the 50 m venue and relocks.
- A venue switch adds one key/map, as expected; **zero browser GPS/PATCH** throughout. No page errors.
- Maps is configured `gestureHandling: "cooperative"`. Chromium CDP simulated one-finger swipes scroll
  the document at 350/390; this does not prove genuine Google touch handling or phone behavior.

Four additional 390 px cases (both engines × key 503 / blocked SDK) show honest fallback, preserve the
600 m draft, keep Edit/Space/GPS controls usable, retain disabled Save without changes and make **one**
key request, no automatic retry/GPS/write. SDK failure blocks the SDK request before network delivery.

Evidence under `tmp/venue-location-phase2-2026-11-05/`:

- `browser.cjs`, `failures.cjs`, `chromium-results.json`, `webkit-results.json`, `failure-results.json`.
- `{chromium,webkit}-{350,390,1280}-{locked,focus,editing}.png` (18 principal layout screenshots),
  plus six debug captures/layout JSON and four `{engine}-390-{key503,sdk}.png` fallback screenshots.
- Focused/typecheck/lint/full-test/build/baseline/browser log files copied from `/tmp/venue-location-phase2-*.log`.

Useful screenshots: [350 px locked](../tmp/venue-location-phase2-2026-11-05/chromium-350-locked.png),
[390 px WebKit](../tmp/venue-location-phase2-2026-11-05/webkit-390-locked.png),
[1280 px editing](../tmp/venue-location-phase2-2026-11-05/chromium-1280-editing.png).

### 7. Open questions and limits

No developer answer is pending. Actual Google tiles, referrer/billing restrictions, live bounds rendering,
real GPS and physical-device scrolling remain unverified. The fake bounds fitting proves the application
supplies actual radii and calls fitBounds with 40 px padding; its diagram cannot certify Google geometry.
No real venue save was attempted. Physical checks belong to the upcoming review/device checklist.

### 8. Recommended first steps

Read the plan and diff; inspect the linked screenshots/JSON and preserve all ignored evidence. Execute
Phase 3 using the plan's GPT-6.1 (Codex) / medium recommendation, update the device checklist and record the
four unrelated baseline failures explicitly. Do not call this live or refresh unrelated sports data.
Record any later authorized commit/push/deployment separately; the present work is local only.


## Phase 2 cleanup follow-up — 2026-11-05

### Developer summary

Removed the entire partner pin-details/GPS box and the paragraph beneath the map. After Edit, only the
map and existing Geofence Size box remain inside the editor. No replacement instruction or address
fields were added. Local only; nothing committed, pushed or deployed. Phase 3 remains next.

### Next-agent scope and decisions

Andrew's latest complete instructions supersede the earlier request to retain the GPS control. Remove
“Pin already on file”, entrance guidance, coordinates, Check, current-location action and its help;
remove the entire map instruction paragraph; keep the Geofence Size box as-is. Do not resume the
interrupted address-editing investigation or change radius layout/copy. No code was changed during
that investigation. Retain Edit locking, one stable map, actual saved radius, explicit radius intent,
venue selection, save validation and failure recovery. Admin/signup keep their defaults.

Next work remains Phase 3 review/device checklist, GPT-6.1 (Codex) / medium per the existing plan; no
agents or model changes were used. Publication and live venue writes remain outside this request.

### State, files and cost

Branch `after-app-review`, HEAD `637e39e97cdd7543c5c676a5d8ed79210539ec19`, still entirely uncommitted.
Existing instruction/Phase 0–2 edits remain intact. No live data changes, backups, migrations or undo log.
No new service, network request, query, write, polling or billable operation; per-view/unlock/save costs
are identical to the preceding implementation. No paid or live Maps request was made for verification.

- `components/admin/GeofenceEditor.tsx`: optional `hidePinDetails = false`; partner presentation omits
  the locked summary text/card and the unlocked details/GPS card, retaining the Edit button and radius
  controls. Threads that presentation into the map's `hideInstructions` prop.
- `components/admin/VenueMapPicker.tsx`: optional `hideInstructions = false` hides the map paragraph.
  In this compact presentation, fallback says only “Map unavailable.” rather than suggesting a removed
  GPS control. Marker lock/drag, framing and SDK lifecycle are unchanged.
- `app/owner/venue-location/page.tsx`: opts into `hidePinDetails`. No address/API/schema changes.
- `tests/owner-venue-location-page.render.test.ts`: adds the page-level removed-box/retained-controls check.
- `tests/venue-map-picker.render.test.ts`: adds real editor/map coverage for omitted copy/controls, one
  map across unlock, editable pin preserving 600 m, and fallback without an unavailable GPS suggestion.
- This handoff and the plan record the superseding instructions and current verification evidence.

### Checks and evidence

The same eight-file focused command in section 6 now passes **98 tests**, zero skips/failures. Changed-file
ESLint passes. Typecheck passes in the no-env scratch source copy with all five changed source/test files.
Root `npx tsc --noEmit` encountered an unrelated generated-file conflict:
`.next/types/routes.d 2.ts:310` duplicates `LayoutProps` from `.next/types/routes.d.ts`. Additional generated
`app 2`, `app 3`, `package 2.json`, and `validator 2.ts` appeared in that directory; none were modified or
deleted. Use the scratch checkout rather than treating generated duplication as an application type error.

```sh
# Repository root: same focused Vitest command in section 6, then:
npx eslint components/admin/GeofenceEditor.tsx components/admin/VenueMapPicker.tsx app/owner/venue-location/page.tsx tests/owner-venue-location-page.render.test.ts tests/venue-map-picker.render.test.ts
git diff --check
# Scratch source copy (no .env*), after copying those five changed files:
cd /tmp/venue-location-phase2-scratch
npx tsc --noEmit
node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3107
# Repository root, separate terminal:
node tmp/venue-location-cleanup-2026-11-05/browser.cjs
node tmp/venue-location-cleanup-2026-11-05/failures.cjs
```

Chromium/WebKit pass at 350/390/1280 px using the same fake SDK/mocked APIs and real CSS. The updated
script explicitly checks removal of provenance/entrance/map/GPS text and the Check/GPS controls after
unlock. Existing keyboard/pointer editing, marker/radius behavior, venue switching, framing, no overflow,
zero GPS/write and simulated Chromium scrolling checks pass. Four key/SDK failure cases also pass.
Inspected `tmp/venue-location-cleanup-2026-11-05/webkit-390-editing.png`: map immediately precedes Geofence
Size; removed box and paragraph are absent. Scripts, JSON, screenshots and logs are preserved in that
ignored directory. The scratch server was stopped after verification. Sandbox escalation for local
server/browser processes was allowed; no rejection or user approval is pending.

No full-suite/build rerun was needed for this scoped presentation removal; preceding results above are
historical, including four unchanged sports-snapshot failures. Actual Google tiles/phone gestures remain
unverified. No developer question is open. Begin Phase 3 with these latest screenshots and instructions.


## Confirmation-copy follow-up — 2026-11-05

For Andrew: the location-save confirmation now says only **“Saved.”** Both `AGENTS.md` and `CLAUDE.md`
now require minimal product copy: necessary actions/decisions/error recovery only, no redundant labels,
obvious instructions, unsolicited helper paragraphs or implementation details. Review copy before finishing.

For the next agent: Phase 3 remains next with the same model/effort and scope. Branch `after-app-review`,
HEAD `637e39e97cdd7543c5c676a5d8ed79210539ec19`; everything remains uncommitted/unpushed/undeployed.
`lib/venueLocationRules.ts` changes `VENUE_LOCATION_COPY.saved` and removes its obsolete timing comment;
`tests/owner-venue-location-page.render.test.ts` checks the exact “Saved.” confirmation on successful retry.
The two instruction-file additions preserve their existing edits. No behavior/data/cost/API changes,
backup or undo log; revert only these copy/doc edits if necessary. No developer answer is pending.
Verified `npx vitest run tests/owner-venue-location-page.render.test.ts tests/lib.venueLocationRules.test.ts`:
**35 passed / 2 files**, zero skips/failures; `git diff --check` passes. No broader rebuild/browser run
needed for this text-only change. Follow the new product-copy rule in future implementation/review.


## Address extension — 2026-11-05

Andrew subsequently authorized Change address **and** moving the pin, including over 1 km. The new
section is built locally; it searches only after Search, previews a selected address/pin, supports Undo
and uses the existing Save/“Saved.” flow. Signed owner/venue-scoped lookup results permit full relocation
without weakening ordinary pin-only movement or radius validation. No live venue was changed.

The authoritative extension handoff is `docs/venue-address-change-2026-11-05.md`: branch/commit/data state,
settled answer, files, costs, exact commands, screenshot paths, traps and remaining device/release work.
Current focused set is **150 pass**, full suite **6,492 pass / 13 skip / four unchanged stale-snapshot
failures**; isolated typecheck/source lint/233-page build and Chromium/WebKit 350/390/1280 checks pass.
Phase 3 remains next and must include the address extension in review. Nothing committed/pushed/deployed.


## Editor close follow-up — 2026-11-05

For Andrew: an X in the Geofence Size header now closes the controls and locks the pin again. Unsaved
changes remain available to reopen or Save. No explanatory copy or new section was added. Local only;
nothing committed, pushed or deployed. Phase 3 review/device checklist remains next.

For the next agent: preserve the existing dirty work. Repository
`/Users/andrewserulneck/Documents/Trivia-Predictions`, branch `after-app-review`, HEAD remains
`637e39e97cdd7543c5c676a5d8ed79210539ec19`. No live data, backup, migration, import or undo log; this is
presentation/interaction state only. Closing/reopening adds zero HTTP/DB/Maps constructions and never
saves. Retain the original map instance and pending address/pin/radius drafts. Rollback only these edits.

- `components/admin/GeofenceEditor.tsx`: X appears only for `lockedView="map"` + `startLocked`, keeping
  default admin/create/signup behavior. Close resets transient dial editing, cancels acceptance of any
  old GPS callback, sets locked, and returns keyboard focus to the Edit button through a layout effect.
  Edit has an expanded-state/control reference; Close is disabled while saving. Draft values remain
  parent-owned and untouched. Pending GPS cannot apply after a close/reopen cycle in shared presentations.
- `lib/themeTokens.ts`: `VENUE_LOCATION.closeAction` uses existing slate/cyan tokens and a 44×44 px target
  with keyboard focus styling. No new CSS/color or helper paragraph.
- `tests/venue-map-picker.render.test.ts`: actual editor/map with fake Google API verifies close/reopen,
  retained 200 m draft, one map/key, blocked stale drags, focus restoration, disabled Close/default create
  absence, and late GPS suppression after close/reopen.
- `tests/owner-venue-location-page.render.test.ts`: pin-only and radius edits survive close/reopen and
  remain saveable while collapsed. Closing alone makes no PATCH. Earlier address and save tests remain.
- This plan/handoff record the follow-up; no address/API/security rules changed.

Verification (installed Node/npm dependencies):

```sh
npx vitest run tests/venue-map-picker.render.test.ts tests/owner-venue-location-page.render.test.ts tests/venue-activation.geofence-editor.test.ts tests/venue-activation.phase4-mount.test.ts tests/owner-venue-location-page-contract.test.ts
npx eslint components/admin/GeofenceEditor.tsx lib/themeTokens.ts tests/venue-map-picker.render.test.ts tests/owner-venue-location-page.render.test.ts
git diff --check
# No-env scratch copy, with these four files copied in:
cd /tmp/venue-location-phase2-scratch
npx tsc --noEmit
node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3107
# Repository root, separate terminal:
node tmp/venue-editor-close-2026-11-05/browser.cjs
```

**89 tests / 5 files pass**, changed-file ESLint/typecheck/diff check pass. Root's generated-type duplication
is untouched; typecheck uses the existing no-env scratch checkout. No full-suite/build rerun was needed
for this narrow UI follow-up; broader results above remain historical.

Chromium and WebKit at **350, 390, 1280 px** pass with real app/global CSS and fake APIs/Google SDK.
Six cases verify a 44×44 close target, Space and pointer closing, Edit focus restoration, hidden dial,
locked pin, preserved 200 m draft, reopening via Enter and saving while collapsed. Exactly one map/key
per case; zero writes on close, one explicit Save. No overflow/page errors. Inspected
`tmp/venue-editor-close-2026-11-05/webkit-350-open.png`; the X is visible beside Geofence Size.
Preserved ignored evidence: `tmp/venue-editor-close-2026-11-05/` (script, `results.json`, twelve open/closed
screenshots and run logs). Server/browser sandbox escalation was allowed; server stopped afterward.

No developer answer or approval is pending. Real phone/Google gestures remain unverified as before.
Recommended next step/model: Phase 3 review + device checklist, GPT-6.1 (Codex) / medium per the plan;
include closing/reopening and preserving unsaved edits. No subagents or alternate model were used.


### Close button branding update — 2026-11-05

Andrew requested a labeled, branded button instead of the X. `GeofenceEditor.tsx` now renders **Close**
(also its accessible name); the unused Lucide X import is removed. `VENUE_LOCATION.closeAction` in
`lib/themeTokens.ts` uses the same cyan fill, dark bold text, rounded corners and focus treatment as Edit,
with a 44 px height. The two existing close-interaction test files now query “Close”. Behavior, data,
cost, branch/commit/uncommitted state and Phase 3 next steps remain as recorded above. No new model,
phase, backend/API change, live venue write, commit/push/deployment or developer question.

Verification: `npx vitest run tests/venue-map-picker.render.test.ts tests/owner-venue-location-page.render.test.ts`
passes **59 tests / 2 files**; changed-file ESLint, scratch `npx tsc --noEmit` and `git diff --check` pass.
The no-env scratch server/browser commands above apply with the updated harness
`node tmp/venue-editor-close-brand-2026-11-05/browser.cjs`. Chromium/WebKit 350/390/1280 cases verify
visible “Close”, cyan fill `rgb(34, 211, 238)`, dark text `rgb(2, 6, 23)`, 44 px minimum target, keyboard
focus, retained drafts, one map/key and explicit Save. Evidence is preserved in ignored
`tmp/venue-editor-close-brand-2026-11-05/` (script, results, screenshots, logs). These use fake Maps/API
responses and real CSS, not live Google/device checks. The scratch server was stopped afterward.
