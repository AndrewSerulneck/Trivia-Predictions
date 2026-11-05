# Venue Location usability — Phase 0 handoff (2026-11-05)

## For Andrew

The analysis and phased plan are ready in `docs/venue-location-usability-plan.md`. The plan covers a clearly
filled Edit button, removal of both paragraphs and a visible map before editing. It also preserves saved
geofence sizes that exceed the dial's range. No application changes are built or live. Implementing the
plan and checking it on a phone remain; map usage/cost needs a baseline before changing when maps load.

## For the next agent

### 1. Next phase goal and scope

Phase 1 implements the map/editor and partner page changes in the plan. Use GPT-6.1 (Codex) / high,
as Andrew selected; record any explicitly requested later model change. No sub-agents were used for
Phase 0. The request was analysis plus a separate plan; implementation has not been requested in this turn.
Out of scope: production publication, database/rules/auth/billing changes, player geofence admission,
new services and redesigning signup/admin.

### 2. Starting state

- Branch: `after-app-review`.
- HEAD: `637e39e97cdd7543c5c676a5d8ed79210539ec19`
  (`Share to social: Facebook Post now (hidden), code-review fixes (Phases 6, 8-21) + game themes`).
- Working tree was clean before Phase 0. Only this handoff and the new plan were added, uncommitted.
  No commit, push or deployment was performed. Remote/hosting state was not independently checked.
- No live data was read or changed; no backups or undo log were necessary. No scripts/migrations ran.
  Tests used fake venue rows and mocked fetches. No browser key or `.env.local` values were accessed.
- `CLAUDE.md` freezes `main`/production until Andrew confirms App Store approval. That confirmation is
  absent from this task. Preserve any subsequent unrelated workspace work.

### 3. Decisions already made

Andrew explicitly wants the Edit action to look clickable, both quoted paragraphs removed and the pin/circle
visible without tapping Edit. Keep unlocking as the gate to changes. The plan chooses a filled cyan action
and the existing dark shell/light editor; it does not ask Andrew to repeat those requests.

Keep 50–200 m choices, 1 km pin cap per save, `onRadiusChange` as the sole radius mutation path and pin-only
preservation of out-of-range radii. The map must depict the configured radius, not the dial's clamped radius.
Player admission still has its separate minimum/GPS tolerance. Default admin/signup presentation stays intact.
Andrew accepted the old unpaid-claim risk on 2026-11-03; don't add a billing gate.

### 4. Files and how they fit

Created:
- `docs/venue-location-usability-plan.md`: source findings, decisions, phased model table, implementation
  seam, regression/browser matrix, release boundary and cost measurement gate.
- `docs/venue-location-usability-plan_PHASE_0_HANDOFF.md`: this handoff.

Relevant existing files:
- `app/owner/venue-location/page.tsx`: owner venue/location fetches, `applySaved`, `handleEditorChange`,
  `handleRadiusChange`, `handleSave`, dirty/switch guards and shared editor mount.
- `components/admin/GeofenceEditor.tsx`: `locked` early return hides the map; `value` clamps both map/dial;
  `useCurrentLocation`, `handleMapDrag`, `handleRadiusChange` emit changes.
- `components/admin/VenueMapPicker.tsx`: singleton SDK loader, map/marker/circle construction, refs,
  radius-sync/deferred-fit effects, ResizeObserver and imperative `recenter`. No read-only API yet.
- `lib/venueLocationRules.ts`: shared validation plus `VENUE_LOCATION_COPY.helper` to remove.
- `lib/themeTokens.ts`: home for the action's presentation classes; use existing palette.
- `app/globals.css`: unlayered dark button rule and `ht-light-surface` opt-out. Don't change global rules;
  scope the existing light wrapper on the partner page.
- `app/api/owner/maps-key/route.ts`, `app/api/owner/venues/location/route.ts`, `lib/requireOwnerAuth.ts`,
  `lib/ownerVenueList.ts`: read for source-derived request/DB cost counts; no changes planned.
- Prior context: `docs/signup-price-copy-and-partner-geofence-plan.md` and its Phase 8 handoff. That
  handoff's appended update resolves its earlier stale statements about uncommitted work and Q1.

### 5. Facts and traps

- Don't fix visibility by dropping `startLocked`: it would expose dragging immediately.
- Don't render a second map in the locked branch: unlocking would recreate it and can add billable loads.
- The white outlined Edit button is affected by dark unlayered button border/weight rules because the
  wrapper is not `ht-light-surface`. Confirm computed styles using real global CSS.
- A 600 m stored radius currently feeds the map as 200 m, even though saving the pin correctly retains 600.
  The new preview should display 600 and remain 600 until a deliberate size choice.
- Initial map construction does not directly fit its circle. Existing radius/resize effects don't
  reliably provide initial full-circle framing. Verify initial sizing, including large radii.
- SDK `onerror` drains callbacks as though ready; without `window.google.maps`, this can leave blank UI.
  Add a bounded failure state for the preview without a broad loader redesign or automatic retries.
- Existing editor/page tests mock out the actual map. A new fake-Google test of `VenueMapPicker` itself
  is required to prove read-only marker updates and reuse, rather than trusting a passive stub.
- An old test comment says only admin mobile uses `startLocked`; the partner page is also a caller.
- `lib/googleMapsLoader.ts`, `lib/ownerAuth.ts` and `tests/venue-activation.map-picker.test.ts` do not exist;
  the relevant loader is inside `VenueMapPicker`, auth is `requireOwnerAuth`, and map tests need adding.
- No escalation, production data access, external messages or publication was requested or performed.

### 6. Build/run/test and results

Existing installed Node/npm dependencies were sufficient. Baseline command, from repository root:

```sh
npx vitest run tests/owner-venue-location-page-contract.test.ts tests/owner-venue-location-page.render.test.ts tests/venue-activation.geofence-editor.test.ts tests/venue-activation.phase4-mount.test.ts tests/lib.venueLocationRules.test.ts tests/api.owner.venues-location.test.ts tests/light-surface-css-contract.test.ts
```

Result on 2026-11-05: 7 files / 64 tests passed, 1.06 seconds; no failures/skips. No full suite, lint,
typecheck, build, browser session, screenshot, device or live Maps check was run in this docs-only phase.
After implementation add the new map test, run focused tests, then `npx tsc --noEmit`, `npm run lint`,
`npm run test`, `npm run build` sequentially. Fresh scratch checkouts may need `npx next typegen` first.
Browser testing must use a scratch checkout without `.env.local`, mocked API/Maps and an unused port such
as `npm run dev -- --port 3107`; Andrew's :3000 server must not be used for tests that write data.

### 7. Open questions and dependencies

No product clarification is needed for the four requested changes. Actual map view counts/unlock fraction,
transfer sizes and account billing are unmeasured; follow the plan's cost gate before the cost-affecting
implementation. Illustrative 10/1,000 daily views are scenarios, not current traffic. Real phone and live
Maps verification remain future checks. App Store approval/publication authorization is not supplied here.

### 8. Recommended first steps

Read `CLAUDE.md`, `SYSTEM_CONTEXT.md` and the new plan. Recheck branch/status. When implementation is
requested, measure the map baseline, then implement the opt-in stable map presentation with a read-only
marker gate and actual-radius circle. Add behavior coverage while changing it. Don't let the old plan's
helper paragraph or tap-to-load UI override Andrew's newer requests. Finish each phase with its own
detailed handoff and updated plan status, including partial work if interrupted.

## Planning-rule amendment (2026-11-05)

Andrew corrected the model-family assumption: plans made by GPT-6.1 in Codex should name Codex models,
rather than defaulting to Claude. The plan now names GPT-6.1 (Codex) for every phase, with high effort for
analysis/implementation and medium for verification/review. This supersedes its original Claude recommendations.

`AGENTS.md` now states that the planning agent uses its own family and Andrew's selected session model.
`CLAUDE.md` §Model and effort per phase removes the conflicting Claude fallback and specifies effort by
complexity without changing family. The same preference was added and verified in
`/Users/andrewserulneck/.codex/AGENTS.md` for future Codex projects, using an approved sandbox escalation
because that file is outside the workspace. No application behavior or data changed. The repository
instruction edits and these two planning docs remain uncommitted; no push or deployment was performed.
Verification: checked all phase rows and the next-phase handoff name GPT-6.1 (Codex), confirmed the old
Claude-default rule is absent from current project instructions, and ran `git diff --check`. No application
tests were rerun for this documentation-only amendment.
