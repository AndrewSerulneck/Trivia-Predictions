# Venue Location usability — Phase 3 handoff (2026-11-05)

## For Andrew

The plan is complete and accepted locally. Final review covers the locked map preview, compact page,
Change address, “Saved.” confirmation and branded Close button. The device checklist is updated.
All **168 final focused tests** pass. No further implementation phase or developer answer is pending.

Nothing is committed, pushed or deployed. Real-phone/Google checks remain recorded as unperformed
observations for a later authorized release; they are not unfinished implementation phases.

## For the next agent

### 1. Next goal, scope and model

There is **no next implementation phase**. Andrew explicitly requested Phase 3 and said the work is good
and done on 2026-11-05. Preserve this accepted state. Future publication is a separate task under the
project's branch/release rules. Do not reopen copy/design, add a Phase 4, refresh sports snapshots or
require another approval of the already-settled design/cost/address decisions.

Phase 3 followed the plan's **GPT-6.1 (Codex) / medium** recommendation for review, evidence and final
handoff. The environment identifies the Codex/GPT-6 family; exact selected runtime version is not
independently exposed. No alternate model or subagent was used. No model recommendation is needed for
an unscheduled release task; apply the project's rules when a concrete future task is authorized.

### 2. Source, publication and data state

- Repository: `/Users/andrewserulneck/Documents/Trivia-Predictions`.
- Branch: `after-app-review`.
- HEAD/last commit: `637e39e97cdd7543c5c676a5d8ed79210539ec19`
  (`Share to social: Facebook Post now (hidden), code-review fixes (Phases 6, 8-21) + game themes`).
- Phase 0–3 source, tests, instruction edits and docs remain **uncommitted/unpushed**. No PR, hosted
  preview, release commit or deployment was created or independently checked. There is no deployment ID
  for this work. Local screenshots do not establish production state.
- Phase 3 made **documentation changes only**. The final application/test source manifest contains
  21 SHA-256 hashes at `tmp/venue-location-phase3-2026-11-05/source-sha256.json`; every hash was verified
  unchanged after the review/documentation work. This identifies the reviewed dirty source beyond HEAD.
- No live venue/address/player data, browser key, cookie, production setting or `.env.local` value was
  inspected or changed. No migration, import, backup/repair or data undo script ran. API-test update
  messages refer to mocks. No paid Maps/Places test was performed.
- Scratch source remains `/tmp/venue-location-phase2-scratch` (macOS physical path `/private/tmp/...`),
  with no `.env*` and installed dependencies symlinked. Local browser servers used port 3107 and were
  stopped after verification; Andrew's :3000 server was not used. Phase 3 started no server.
- Preserve existing instruction edits and all ignored evidence. Do not reset the working tree or
  delete generated/private evidence to manufacture a clean status.
- `CLAUDE.md` still holds main pushes, linked DB pushes and Production changes until Andrew confirms
  App Store approval. His acceptance of this implementation/Phase 3 supplies no such confirmation.

### 3. Settled product decisions

Final accepted behavior, including the later requests that supersede the original plan:

1. Show the saved pin and **actual configured radius** immediately, with mutation locked until Edit.
   A 600 m or positive below-50 m legacy radius is depicted as stored; null displays 150 m.
2. Use a filled cyan **Edit location & geofence** button and a filled cyan **Close** text button.
   Close hides editing controls, locks the pin, preserves drafts and returns keyboard focus to Edit.
   Reopening retains the same map/key request. Close is disabled while saving.
3. Remove the subtitle, lock/helper paragraphs, pin-details/GPS card, coordinates, Check link and map
   instruction paragraph from the partner page. Keep the existing Geofence Size box. Do not restore
   “Use my current location” or add new explanatory text. Default admin/signup presentations remain.
4. The venue heading is the multi-venue selector; one venue has a plain heading. No duplicate nearby
   venue name. The outer card meets the header. Existing discard confirmation/loading/error states stay.
5. Save confirms only **“Saved.”** Product-copy rules in both `AGENTS.md` and `CLAUDE.md` require the
   fewest necessary words, without redundant instructions, helper text or implementation details.
6. **Change address** is a separate collapsed section with explicit Search, selection preview and Undo.
   Andrew confirmed **“Yes—replace the address and move the pin”**, including relocations over 1 km.
   This supersedes old D3 for signed address selection; ordinary pin-only saves still have the 1 km cap.
   Radius intent remains explicit through `onRadiusChange`, never the map-drag echo.
7. Address/pin changes save together in one UPDATE. Owner/venue-scoped signed lookup results expire
   after 30 minutes; Save/retry does not repeat the paid Details request. Manual address/name/billing
   fields cannot be substituted into that signature. Usable saved-pin/system-placeholder guards stay.

No developer question remains. Preserve the user's acceptance rather than inventing additional phases.

### 4. Files and review result

Reviewed all changed application seams and relevant regressions; **no new finding required an application
change in Phase 3**. The implementation and exact decisions are also recorded in
`docs/venue-address-change-2026-11-05.md` and the Phase 2 handoff's dated follow-ups.

| Files / functions | Final review |
|---|---|
| `app/owner/venue-location/page.tsx`: `applySaved`, `handleVenueChange`, `handleSave`, `onRadiusChange` | Parent owns drafts; stale venue results are scoped, switching clears old preview, pin-only edits preserve radius, address intent counts as dirty, explicit Save is retained. |
| `components/owner/OwnerShell.tsx`: `flushHeader` | Opt-in removes dark content's top gap; other callers keep their spacing. |
| `components/admin/GeofenceEditor.tsx`: `lockedView`, `hidePinDetails`, `readOnly`, Close | One stable map; actual display radius separated from dial value; mutation guarded; focus and transient editing/GPS state handled on close. Default admin/create/signup retained. |
| `components/admin/VenueMapPicker.tsx`: `readOnly`, `hideInstructions`, bounds fitting/loading | Initial usable-size fit, external relocation refit, marker locking and stale-event guards; no second map on unlock/close; bounded fallback and no automatic retries. |
| `components/owner/VenueAddressEditor.tsx`: `lookup`, request IDs/abort/current callback | Search is explicit; old responses cannot change a new query/venue; busy state blocks Save; selected details/previous pin support preview/Undo. |
| `app/api/owner/venues/address/route.ts`: `POST`; `lib/rateLimit.ts` | Auth/venue scope precede provider/quota; maximum five predictions, one chosen Details call; owner-keyed 10 searches/minute, five Details/minute; failures closed and generic. |
| `lib/ownerVenueAddress.ts`: normalize/create/read token | Valid US address/coordinates, purpose-separated HMAC, owner/venue binding, bounded token, timing-safe signature and expiry checks. Existing SESSION_SECRET only. |
| `app/api/owner/venues/location/route.ts`: `GET`, `PATCH` | Ordinary pin cap retained; signed address supplies new baseline; radius/system-pin guards retained; one scoped UPDATE writes address/pin together, clears stale county/region and records a minimal audit line. |
| `lib/venueLocationRules.ts`, `lib/themeTokens.ts` | Save copy is exactly “Saved.”; original radius/distance rules retained; Edit/Close use existing palette and explicit phone target heights. |

New application files that must accompany any eventual commit: `components/owner/VenueAddressEditor.tsx`,
`app/api/owner/venues/address/route.ts`, `lib/ownerVenueAddress.ts`. New test files:
`tests/api.owner.venue-address.test.ts`, `tests/venue-map-picker.render.test.ts`.

Phase 3 documentation changes:

- `docs/partner-dashboard-app-redesign-device-checklist.md` §N replaces the obsolete hidden-map/GPS/long
  confirmation instructions with final preview, Close, address, failure, real Maps and phone checks.
  Device observations remain unchecked; no physical-device result was invented.
- `docs/venue-location-usability-plan.md` marks the plan complete/accepted locally and links this handoff.
- `AGENTS.md` adds a completed-plan pointer; `SYSTEM_CONTEXT.md` records the accepted local feature and
  publication distinction. Existing `CLAUDE.md` product-copy/geofence rules remain intact.
- `docs/venue-location-usability-plan_PHASE_3_HANDOFF.md`: this handoff.

### 5. Verification and exact commands

Fresh Phase 3 combined run from repository root:

```sh
npx vitest run tests/owner-venue-location-page-contract.test.ts tests/owner-venue-location-page.render.test.ts tests/venue-activation.geofence-editor.test.ts tests/venue-activation.phase4-mount.test.ts tests/lib.venueLocationRules.test.ts tests/api.owner.venues-location.test.ts tests/light-surface-css-contract.test.ts tests/venue-map-picker.render.test.ts tests/api.owner.venue-address.test.ts tests/api.signup.rate-limit.test.ts
git diff --check
```

**10 files / 168 tests passed, zero failures/skips**, 1.84 seconds on 2026-11-05. Evidence:
`tmp/venue-location-phase3-2026-11-05/focused-tests.log`. This consolidates the final preview, cleanup,
address, Close, auth/scoping, radius and shared-consumer checks into one current-source run.

Earlier verification is retained with its actual scope/time, not claimed as new Phase 3 runs:

- Final Close branding: 59 tests; changed-file ESLint and isolated typecheck pass. Chromium/WebKit at
  350/390/1280 verify visible Close, cyan/dark styling, minimum target, keyboard focus, preserved drafts,
  no writes on close, one map/key and explicit Save. Six cases; 12 screenshots and `results.json` under
  `tmp/venue-editor-close-brand-2026-11-05/`.
- Address extension: 150 focused tests, source lint, isolated typecheck and **233-page production build**
  pass. Six Chromium/WebKit 350/390/1280 cases show one search/Details selection, preview and Save;
  Chromium 390 additionally retries a failed Save without another lookup. A final 37-test security/API
  rerun passes. Evidence: `tmp/venue-address-2026-11-05/`.
- Broader suite at the address-extension checkpoint: **6,492 passed / 13 skipped / 4 failed**, 494 files
  (489 pass / 4 fail / 1 skip), 6,509 tests total. All four failures are unchanged NFL/MLB snapshot
  freshness assertions: `tests/lib.sportsBingo.{mlb,nfl}-star-index{,-freshness}.test.ts`. Both snapshots
  were generated 2026-10-14 and exceed their unchanged 14-day limit. Independence/reproduction is in the
  Phase 2 handoff and baseline log. No sports data/date/limit was altered to hide these failures.
- Original geometry/failure and compact page evidence: `tmp/venue-location-phase2-2026-11-05/` and
  `tmp/venue-location-cleanup-2026-11-05/`. Fake Maps key/SDK failures, stored 25/50/150/200/600/null radius,
  long venue names, 0 px header gap and simulated Chromium scroll are covered there.

No application code changed in Phase 3, so broad tests/build/browser runs were not needlessly repeated.
The last production build predates the final small Close presentation changes; final Close had fresh
browser/lint/type checks and the present 168-test combined run. Never describe the older build as an
exact-current-source deployment. Before any later authorized release, run its required gates against
its actual source and record that commit/build/deployment distinctly.

Scratch commands if a new authorized task requires them (copy current changed files first):

```sh
cd /tmp/venue-location-phase2-scratch
npx next typegen
npx tsc --noEmit
npm run build
# Only after build/typecheck exit, if a separate browser run is needed:
node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3107
# Separate terminal from repository root:
node tmp/venue-editor-close-brand-2026-11-05/browser.cjs
node tmp/venue-address-2026-11-05/browser.cjs
```

All browser evidence uses real application/global CSS and a **diagrammatic fake Google SDK**, intercepted
owner APIs and blocked non-local browser origins. Saves are mock responses. It proves application
behavior/configuration, not real Google tiles, keys/billing restrictions, geographic geometry or actual
phone gestures. The selected-address screenshots predate the Close styling follow-up; the Close-brand
screenshots establish the final Close appearance.

### 6. Cost and operational facts

Phase 3 adds zero runtime operations/cost. Current map baseline: one usable selected-venue view costs
three owner HTTP calls/eight DB selects/one map; unlock/Close/reopen add zero. Venue switches/reloads count
as additional views. Ordinary Save retains two auth selects + one venue select + one UPDATE.

Andrew's original measurement-waiver answer remains **“That's ok to skip for this. This tool won't be
used often.”** Do not ask again or add a rollout flag. Maps volume/transfer/dollars remain unmeasured.
At an illustrative 20% prior-unlock rate, 10 views/day adds 240 maps/480 selects per 30 days versus the
old hidden-map design; 1,000/day adds 24,000/48,000. These are scenarios, not measured traffic.

Explicit address selection adds one prediction call and one selected Details call, each with two auth
selects + one rate-limit RPC; no fan-out/per-keystroke calls or retry on Save. At 10 changes/day: 600
Google calls/1,800 DB operations per 30 days; at 1,000/day: 60,000/180,000. Approximate extra browser JSON
is 8 KB per completed selection (2.4 MB/month and 240 MB/month respectively); retries count separately.
Actual Places pricing/free allowance/dollars are unknown. Cost model and design tradeoff are in the
address record. No production usage has changed through deployment under this plan. After an eventual
authorized release, compare real usage with these per-view/per-selection counts if measurements exist.

### 7. Traps, rollback and remaining observations

- Keep one map at one stable tree position. Do not connect actual circle radius to the dial's clamped
  value or accept `onChange.radius` as radius intent.
- Keep signed relocation separate from ordinary pin-only movement; do not broaden writable venue fields
  or add a second paid Details lookup on Save/retry. Address token expiry intentionally requires a fresh
  selection. Clear old county/region on relocation rather than retaining stale geographic labels.
- Root `.next/types` has unrelated duplicate generated files such as `routes.d 2.ts`; prior typecheck
  used the no-env scratch copy. Do not delete/rewrite unrelated artifacts under this completed plan.
- Small-phone global CSS can override minimum heights; explicit 48 px Edit and 44 px Close heights are
  intentional. Only partner content opts into `ht-light-surface`; retain shared admin/signup defaults.
- Source lint excludes archived `tmp/**`: `npm run lint -- --ignore-pattern 'tmp/**'`.
- Starting `npm run dev -- --webpack` conflicts with the package's Turbopack flag; use the direct Next
  command above. Do not copy watched source mid-browser run, which triggers Fast Refresh. Build and
  typecheck are sequential. Sandbox server/browser/font-download escalations were previously allowed;
  none were needed or rejected during Phase 3.
- Rollback is source-only for this local work; no migration/data undo exists. Revert only feature source
  changes, preserving pre-existing instruction work and evidence. After any later release, legitimate
  partner address/location edits would persist through a UI rollback and must not be automatically undone.
- §N of the device checklist retains real Maps/Places/referrer checks, phone touch/scroll/focus/readability,
  authorized test-venue save/relocation/reload and post-release usage observations as **unperformed**.
  They are recorded limits, not an additional implementation phase. No physical device, actual Google
  result, production deployment or live venue write was verified here.

### 8. Open questions and recommended first steps

No developer input is pending. The plan is complete/accepted locally. Read this handoff and the address
record if a separately authorized release or issue arrives. Verify the source manifest before relying on
these exact results, preserve ignored evidence and honor the App Store branch rule. Do not silently
publish based on “we're done,” reopen implementation for optional observations, or invent further work.


## Post-completion publication update — 2026-11-05

Andrew requested a Venue Location-only PR and a merge only if it cannot risk App Store review.
[Draft PR #10](https://github.com/AndrewSerulneck/Trivia-Predictions/pull/10) isolates the work
from main `7033a606245b1f45ef85b3c9d6b37ff118a413d5`; commit
`b2009442f35a9c5b05602f37edc5be6a818fce20`, branch `venue-location-only-2026-11-05`.
It remains draft/unmerged with auto-merge off. Main still serves the reviewing native app,
so the no-review-risk merge condition was not established. No production release occurred.
Original after-app-review source remains uncommitted and unchanged. Fresh isolation checks:
247 focused pass, typecheck/lint/221-page build pass, full suite 5,643 pass / 13 skip / four
unchanged stale sports-index failures. Detailed source scope, exact commands, CI/preview state
and next-agent instructions: [isolated PR record](venue-location-isolated-pr-2026-11-05.md).


## Final instruction — local commit only (2026-11-05)

Andrew requested committing the completed work to `after-app-review` and stopping. This note is included
in that local feature commit. No push, merge, production deployment, live data change, or additional
App Store action is authorized or performed. Draft PR #10 remains unmerged; do not resume publishing
from the earlier conditional request. Main remains unchanged. All 21 original source/test hashes still
match the Phase 3 manifest; this step changes documentation and Git history only. Existing validation
and unperformed device/Google checks above still apply. Unrelated model-policy edits remain unstaged.
