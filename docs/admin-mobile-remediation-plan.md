# Admin Mobile — Remediation Plan

Follow-up to `docs/admin-mobile-plan.md`. Closes the ten findings from the
strict code review of the uncommitted `admin-mobile` working diff.

**Slug:** `admin-mobile-remediation` · **Run log:** `docs/admin-mobile-run-log.md`
(append `## Remediation Phase R<N>` entries to the existing file — this is the
same surface and Phase R0 has to amend that file anyway; do not start a second
run log)

---

## 0. Context

The `admin-mobile` phases (0–6) shipped into the working tree uncommitted.
`npx tsc --noEmit`, `npm run lint` and `npm test` all pass. Every finding below
is something the automated gate structurally cannot see: layout math, bundle
composition, response ordering, an a11y tree, a factual claim in UI copy, and
an untracked directory.

Three things from the original run about how these phases actually went, which
this remediation inherits:

- **Phases 4, 5 and 6 never got a browser pass.** `npm run dev` and Playwright
  both required a sandbox approval the agent could not self-grant. That is a
  standing condition, not a one-off — assume it still holds and do not burn a
  phase retrying it in a loop. Everything visual routes to Phase R5.
- **Phase 3 discovered Phase 2's work already in the tree with no run-log
  entry.** The `min-h-[100svh]` in finding 2 and the `next/dynamic` wrappers in
  finding 3 both arrived that way — unrecorded and unverified. That is why both
  are half-done.
- **The Phase 1 run-log entry is factually wrong** and currently instructs
  later phases to distrust the (correct) plan doc. Finding 1 fixes it. Do R0
  first so nobody reads the wrong thing.

---

## 1. Verification of the findings

All ten were re-checked against the tree. **None is a false positive.** Three
need their framing corrected before anyone implements them, and one is a
decision rather than a defect:

- **Finding 1 is correct and the run log is wrong.** `grep` for
  `trackAnthropicUsage|trackGeminiUsage` across `lib app components scripts`
  returns exactly two call sites: `lib/usernameModerator.ts:241`
  (`username_moderation`, Haiku) and `lib/liveTriviaExport.ts:166`
  (`live_trivia_rewrite`, Gemini). `lib/categoryBlitz.ts` contains no match for
  `anthropic` or `Anthropic` at all. `category_blitz_grading` /
  `category_blitz_moderation` appear only at `lib/llmCostTracker.ts:23-24`,
  their own declaration. The plan doc's §1.6 was right; the Phase 1 run-log
  entry invented the call sites.
- **Finding 2's mechanism is right, its label is loose.** There is no `sticky`
  header — `AdminShell.tsx:708` is a plain in-flow `<div>` inside
  `<main className="h-full … overflow-hidden">`. The defect is the same
  either way: with the root at `min-h-[100svh]` (indefinite height), `h-full`
  on `main` and on the content pane at `:724` resolves against nothing, the
  intended inner scroll container stops being a scroll container, the root
  grows past the viewport, and the document scrolls the header away.
  `AdminMobileShell.tsx:73/86/90` is the same shape with the 3-tab `<nav>` as
  the casualty.
- **Finding 6 is real but latent.** `buildVenuePayload` is only reached after
  `validateVenueForm`, which enforces 25–2000, so today nothing can actually
  emit 100. It is a one-token fix and the whole point of the shared module is
  that the next caller may not validate first. Fix it; don't treat it as a
  live bug.
- **Finding 7's test line is not itself the bug.** `tests/admin-mobile.activate-venue.test.ts:91`
  documents current behavior accurately. The bug is that `buildAddressLabel`
  and `buildVenuePayload` disagree about casing. The decision is made in §2/R1
  below so the implementer doesn't have to relitigate it.
- **Finding 10 is a decision, not a defect.** Confirmed zero callers for both
  routes. It costs nothing to delete them, so delete them — but see the trap
  recorded in R0.

---

## 2. Phases

| # | Phase | Findings | Model | Effort |
|---|-------|----------|-------|--------|
| R0 | Truth, hygiene, dead code | 1, 8, 10 | Sonnet 5 | medium |
| R1 | Shared venue-form + address-lookup correctness | 5, 6, 7 | Sonnet 5 | medium |
| R2 | Mobile shell state + bottom-sheet a11y | 4, 9 | Sonnet 5 | low |
| R3 | Definite-height chain in both shells | 2 | **Opus 5** | **high** |
| R4 | Registry split so code-splitting actually splits | 3 | **Opus 5** | **high** |
| R5 | Device + assistive-tech verification | — | Sonnet 5 | low |

Order rationale: R0 is pure subtraction and corrects the shared memory later
phases read. R1 is the shared lib layer both shells sit on, so it can't be
invalidated by markup work. R2 and R3 both edit the two shells — R2's edits are
in an effect and a primitive, R3's are on the root elements, so R3 does not
undo R2. R4 moves imports across every file the earlier phases touched, so it
goes last, after the markup has stopped moving. R5 verifies what only a human
can.

---

### Phase R0 — Truth, hygiene, dead code

**Closes:** findings 1, 8, 10. **Model:** Sonnet 5 · **Effort:** medium —
mechanical text edits, an ignore rule, and two file deletions with a verified
blast radius; no design judgment.

**Files:** `components/admin/sections/LlmCostSection.tsx`,
`docs/admin-mobile-run-log.md`, `.gitignore`, `.scratch/`,
`app/api/admin/answer-grading/route.ts`, `app/api/admin/answer-variants/route.ts`.

1. **Fix the LLM-coverage copy** (`LlmCostSection.tsx:142-146`). Reword to name
   only what is actually instrumented: Username Moderation (Haiku) and Live
   Trivia rewrite (Gemini). Keep the "any other LLM usage is not instrumented"
   sentence — it is the honest part. Do **not** delete
   `category_blitz_grading` / `category_blitz_moderation` from
   `lib/llmCostTracker.ts`; they are unreferenced but harmless, and the Phase 1
   run-log entry shows what happens when someone edits that union in a hurry.
   Leave a one-line comment marking them as unemitted.
2. **Amend the run log's §Phase 1 entry.** Strike the claim that
   `lib/categoryBlitz.ts` calls Haiku, and strike the "do not trust §1.6"
   instruction to later phases — §1.6 of `docs/admin-mobile-plan.md` was
   correct. Replace with the verified two-call-site list. Amend in place with a
   dated correction note; do not silently rewrite history.
3. **Exclude `.scratch/`.** It currently holds `verify-admin-mobile.mjs`, which
   hardcodes absolute local paths and stubs `/api/admin/session` to
   `{ok:true}`. A checked-in recipe for bypassing the admin auth gate is not
   something to commit. Add `.scratch/` to `.gitignore`. Deleting the directory
   is the implementer's call, but the ignore rule is not optional.
4. **Delete the two orphan routes** — the directories only, not the libs.
   **Trap:** their imports are live elsewhere. `lib/triviaAnswerVariants.ts` is
   imported by `lib/liveShowdownGrading.ts` and `lib/scheduledTasks.ts` (which
   re-exports `regenerateAllAnswerVariants`), and
   `explainWriteInAnswerMatchWithVariants` in `lib/liveShowdownGrading.ts` is
   live grading code. Delete `app/api/admin/answer-grading/` and
   `app/api/admin/answer-variants/` and nothing under `lib/`. Record the
   deletion and this boundary in the run log.

**Verify:** `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
`git status --porcelain` must not list `.scratch/`. Re-run the two greps from
§1 and paste the (empty) result for `category_blitz_grading` outside
`llmCostTracker.ts` into the run log so this cannot be re-litigated a third
time.

---

### Phase R1 — Shared venue-form + address-lookup correctness

**Closes:** findings 5, 6, 7. **Model:** Sonnet 5 · **Effort:** medium — the
request-sequencing pattern already exists in-repo to copy, and the one product
decision is made below, so this is pattern-following, not design.

**Files:** `components/admin/useAddressLookup.ts`, `lib/adminVenueForm.ts`,
`tests/admin-mobile.activate-venue.test.ts`.

1. **Request sequencing in `useAddressLookup`.** Copy the pattern from
   `components/admin/DeleteVenueModal.tsx:55-91` — a `requestIdRef`, bumped on
   entry, compared before every `setState`. Apply to **both** `loadPredictions`
   (:84) and `select` (:140), and bump the ref in `reset` so a cleared field
   can't be repopulated by an in-flight response. Priority order if effort has
   to be cut: `loadPredictions` first — a stale prediction list is *silently*
   wrong and the salesperson then taps it, writing both the wrong street and
   the wrong geofence pin. The `select` race needs two taps on two different
   predictions inside one flight window and produces a visibly wrong address,
   so it is the lesser half. Do both anyway; it is the same ref.
   Also guard the existing `loading` flag — with two flights in the air the
   first `finally` clears it while the second is still running.
2. **Radius fallback** (`lib/adminVenueForm.ts:157`). `Number.parseInt(form.radius, 10) || 100`
   emits a third magic number matching neither `DEFAULT_VENUE_RADIUS` (150,
   `:58`) nor the 25–2000 bound. Use `DEFAULT_VENUE_RADIUS`.
3. **State casing** (`:120-125` vs `:164`). **Decision: uppercase wins.** The
   `state` column is already normalized to uppercase at `:164`, `formatAddressDisplay`
   (`:112`) renders straight off that column, and a venue reading
   `"1200 Main St, Denver, co 80202, United States"` on a partner-facing
   surface looks like a data-entry bug. Uppercase `form.state` inside
   `buildAddressLabel` so the composed `address` string and the `state` column
   agree, and update `tests/admin-mobile.activate-venue.test.ts:91` to expect
   `"1200 Main St, Denver, CO 80202, United States"`. Do not "fix" this by
   downcasing the column — `state` is a two-letter code, `validateVenueForm`
   and every read path assume uppercase.

**Verify:** `npx tsc --noEmit`, `npm run lint`, `npm test`. Extend
`tests/admin-mobile.activate-venue.test.ts` with a radius-fallback case
(empty/garbage `radius` string → 150) and add a unit test for the sequencing:
resolve two mocked `/api/geolocation/predict` calls out of order and assert the
older one is discarded. The sequencing fix is unit-testable — do not defer it
to R5.

---

### Phase R2 — Mobile shell state + bottom-sheet a11y

**Closes:** findings 4, 9. **Model:** Sonnet 5 · **Effort:** low — one clamp
copied from two sibling call sites, and one conditional render whose blast
radius is already verified below.

**Files:** `components/admin/AdminShell.tsx`,
`components/admin/mobile/MobileBottomSheet.tsx`,
`components/admin/mobile/ActivateVenueFlow.tsx`.

1. **Clamp `activeSection` on the stored-preference path**
   (`AdminShell.tsx:512-527`). `handleChooseMode` and `handleSwitchToMobile`
   both clamp into `MOBILE_SECTIONS`; `setModeState(stored ?? "chooser")` at
   `:523` does not. A returning admin whose `activeSection` is `venue-users`
   gets `AdminMobileShell`'s `safeSection` fallback (`AdminMobileShell.tsx:49`)
   rendering Venues while `activeSection` still says Venue Users — so
   "⋯ → Switch to Desktop" drops them somewhere they never were. Apply the same
   clamp when `stored === "mobile"`. Keep the existing eslint-disable and the
   `[authState, deepLinked]` dep list; do not add `activeSection` to it, that
   would re-run the effect on every in-shell navigation.
2. **Stop rendering `MobileBottomSheet` children while closed**
   (`MobileBottomSheet.tsx:34-47`). `aria-hidden={!open}` over mounted tabbable
   buttons is an `aria-hidden-focus` violation — keyboard and VoiceOver users
   reach Grant/Discount/Revoke in `BillingSection` and the map sheet while the
   sheet is visually off-screen. Gate the children on `open`, and add `inert`
   plus `pointer-events-none` on the panel when closed so the transition still
   animates without being reachable mid-flight.
   **Blast radius, already checked — this is safe:** all three consumers are
   stateless while closed. `AdminMobileShell.tsx:109-130` holds two plain
   buttons; `BillingSection.tsx:655-737` derives everything from
   `detailVenueId` + `partners` and already `return null`s when no partner
   matches; `ActivateVenueFlow.tsx:654` already gates `VenueMapPicker` on
   `mapOpen` manually. No consumer keeps transient form state inside a closed
   sheet, so unmounting cannot lose input. Once the primitive does it, delete
   the now-redundant manual gate in `ActivateVenueFlow` (keep the surrounding
   copy).

**Verify:** `npx tsc --noEmit`, `npm run lint`, `npm test`. Add a test asserting
`MobileBottomSheet` renders no children when `open={false}`. The a11y outcome
itself — that VoiceOver's rotor no longer lands on the billing actions — is
**human-only**; it goes on the R5 checklist.

---

### Phase R3 — Definite-height chain in both shells

**Closes:** finding 2. **Model:** **Opus 5** · **Effort:** **high** — this is
viewport-height layout on mobile Safari, the exact CSS class that produced the
35115fc blackout regression, and the fix cannot be confirmed by any tool in
this environment. Judgment about *which* fix to choose is the whole phase.

**Files:** `components/admin/AdminShell.tsx` (root `:673`, `main` `:706`,
content pane `:724`), `components/admin/AdminMobileShell.tsx` (`:73`, `:86`,
`:90`).

**Read first, before writing any CSS:** `docs/bingo-fullscreen-pwa-run-log.md`
and `docs/mobile-game-screen-blackout-plan.md`. The recorded failure mode is a
blanket `h-[100svh]` clamp leaking onto surfaces that needed to grow, plus a
containing-block gotcha (`to { transform: none }` under fill-mode
`both`/`forwards` does not clear a containing block; `will-change: transform`
creates one on its own). Do not re-introduce that pattern by reflex.

**The defect.** Both shells were changed from a definite height to
`min-h-[100svh]` while keeping children that depend on a definite parent:

- `AdminShell.tsx` — root `min-h-[100svh] flex`, `main` `h-full … overflow-hidden`,
  content pane `h-full flex-1 overflow-y-auto`. The percentage heights resolve
  against an indefinite parent, the inner pane stops scrolling, the root grows,
  and the document scrolls the `h-14` header (`:708`) off the top.
- `AdminMobileShell.tsx` — root `min-h-[100svh] flex flex-col`, `main` `flex-1
  overflow-y-auto`, `nav` `flex-none`. `flex-1` grows to content, so the 3-tab
  bar sits below the fold on any long section. **Venues list and Partner
  Billing are exactly the two long sections**, and they are two of the three
  tabs — the primary navigation of the mobile shell is unreachable on its own
  primary screens.

**Two candidate fixes — pick per shell, justify in the run log.**

- *Restore a definite height* (`h-[100svh]` on the root, keeping the inner
  `overflow-y-auto`). Restores the intended app-shell scroll containment and
  keeps `main`'s `overflow-hidden` meaningful. This is the one that is one typo
  away from the historical regression, and `svh` (small viewport height) is the
  correct unit here precisely because it is toolbar-invariant. Scope it to
  these two components' Tailwind classes only — no global CSS, nothing that can
  leak to a game route.
- *Pin the chrome instead* (`sticky top-0` on the header, `sticky bottom-0` on
  the mobile `<nav>`, plus matching padding on the scroll container, keeping
  `min-h-[100svh]`). Lets the document scroll, which is the more forgiving
  behavior under a dynamic toolbar, and cannot black anything out. Costs the
  inner-pane scroll containment, which the desktop shell's `overflow-hidden`
  currently assumes.

The mobile shell already carries `pb-[env(safe-area-inset-bottom)]` on the nav
and `pt-[env(safe-area-inset-top)]` on the header — whichever fix is chosen
must keep both intact, and a pinned nav must keep the safe-area padding *inside*
the pinned element, not on a parent.

Whatever is chosen, the invariant to state in the run log is: **`main`'s
`overflow-hidden` and the content pane's `h-full` must either both be
meaningful or both be removed.** The current state — keeping them while
removing the height they depend on — is the actual bug, and leaving a
vestigial `h-full` behind will make the next reader repeat this analysis.

**Verify:** `npm run build`, `npx tsc --noEmit`, `npm run lint`, `npm test`, and
`npm run test:pwa-contract` — that suite guards landscape CSS against leaking
into portrait, the same failure mode as 35115fc. Grep the diff for any `h-screen`,
`100vh` or `h-[100svh]` outside these two component files and revert it if
present. **Headless verification is worthless here** (per `CLAUDE.md`: no
browser chrome, so a headless pass reports success on a bug that is still
there). Everything real goes to R5.

---

### Phase R4 — Registry split so code-splitting actually splits

**Closes:** finding 3. **Model:** **Opus 5** · **Effort:** **high** — module
and bundle architecture across the RSC/client boundary, touching every entry
point into the admin surface. Getting the boundary wrong here is invisible to
tsc and lint and silently keeps the ~17k-line eager bundle.

**Files:** `components/admin/adminSections.tsx`,
`components/admin/adminSectionComponents.tsx`,
`components/admin/AdminConsole.tsx`, `components/admin/AdminShell.tsx`,
`components/admin/AdminMobileShell.tsx`,
`components/admin/mobile/MobileVenuesSection.tsx`, `app/admin/page.tsx`,
`app/admin/[section]/page.tsx`, plus a new metadata module.

**The defect.** Phase 3 extracted `next/dynamic` wrappers into
`adminSectionComponents.tsx`, but `adminSections.tsx:1-21` still statically
imports all ~20 of the same components to populate its `component:` field. Both
shells import `adminSections.tsx` for `ADMIN_NAV_GROUPS` / `MOBILE_SECTION_ORDER`
/ `MOBILE_SECTIONS` / `sectionLabel`, so the static graph reaches every section
anyway and nothing is split. The `next/dynamic` layer is currently pure
overhead. Confirmed importers of `adminSections`: `app/admin/page.tsx:2`,
`app/admin/[section]/page.tsx:3`, `AdminShell.tsx:13`, `AdminConsole.tsx:4`,
`AdminMobileShell.tsx:5,9`, `MobileVenuesSection.tsx:5`. The two `app/` ones are
server components pulling in `getAdminSectionBySlug` — they still drag the
client-component references into the client graph.

**The shape.** Split into three modules along the boundary that matters:

1. **Metadata, component-free** — the `AdminSection` union, `ADMIN_SECTION_OPTIONS`
   (ids/labels/slugs, minus `component:`), `ADMIN_NAV_GROUPS`, `MIGRATED_SECTIONS`,
   `MOBILE_SECTION_ORDER`, `MOBILE_SECTIONS`, `getAdminSectionBySlug`,
   `sectionLabel`. Zero component imports, so it stays cheap for the `app/`
   server components and both shells. **Move `sectionLabel` here** —
   `AdminMobileShell.tsx:19` currently defines its own local copy over
   `ADMIN_SECTION_OPTIONS`; one definition, imported by both shells.
2. **Dynamic components** — `adminSectionComponents.tsx`, unchanged, imported
   only by the two shells at their render sites.
3. **The legacy static map** — the `component:` field, whose only consumer is
   `AdminConsole.tsx:100`, in its own module imported *only* by `AdminConsole`.
   `AdminConsole` is the older duplicate console (plan §0 problem 7) and is out
   of scope to delete here — but it must not be allowed to hold the whole
   bundle hostage. Pointing its map at the dynamic wrappers instead is an
   acceptable alternative if it turns out simpler; decide and record which.

`MOBILE_SECTION_ORDER` must stay a **literal 3-item array**, never derived from
`ADMIN_SECTION_OPTIONS` — that is a deliberate Phase 3 invariant (a new section
cannot leak onto mobile) and this refactor must not quietly break it.

**Verify:** `npm run build` is the gate, not tsc — compare the reported route
size / first-load JS for `/admin` before and after and record both numbers in
the run log. A refactor that type-checks but doesn't move the number has failed.
Confirm the built chunk graph no longer reaches every section from `/admin`'s
entry. Then `npx tsc --noEmit`, `npm run lint`, `npm test`, and click through
desktop → every nav group, mobile → all three tabs, and a `/admin?section=<slug>`
deep link, to confirm no section 404s into `LegacyPanel` because its registry
entry lost its component.

---

### Phase R5 — Device + assistive-tech verification

**Closes:** nothing on its own — it is the sign-off gate for R2 and R3.
**Model:** Sonnet 5 · **Effort:** low — the agent's job is amending a checklist;
the verification itself is Andrew's.

**Files:** `docs/admin-mobile-device-checklist.md`,
`docs/admin-mobile-run-log.md`.

Append to the existing checklist (do not rewrite it — the Phase 6 items are
still open):

- **R3, iPhone Safari:** scroll Venues and Partner Billing to the bottom on the
  mobile shell. The 3-tab bar must remain visible and tappable the whole time,
  with the toolbar both expanded and collapsed. Rotate to landscape and repeat.
- **R3, iPhone Safari, desktop mode:** the `h-14` header must stay put while
  the content pane scrolls under it.
- **R3, Android Chrome:** same two, plus the collapsing-URL-bar transition.
- **R3, regression sweep:** open Category Blitz and one other game route on the
  same build and confirm no black band — the historical failure was CSS leaking
  off this exact pattern.
- **R2, VoiceOver (iOS) / TalkBack (Android):** with the Partner Billing detail
  sheet closed, swipe through the whole screen. Grant / Extend / Discount /
  Custom rate / Revoke must not be announced or focusable. Open the sheet and
  confirm they are.
- **R1, on venue wifi:** type an address fast enough to fire overlapping
  lookups, then tap a prediction. The street line and the map pin must match
  the prediction that was tapped.
- **R4:** first paint of `/admin` on a cold cache over a phone connection.

**Only a human on a real device can close any of these.** Per `CLAUDE.md`,
headless browsers have no browser chrome and will report success on a bug that
is still there; and per the R2/R3 notes above, no automated check in this repo
observes the dynamic toolbar or the accessibility tree. Do not report any R5
item as done from a build, a test run, or a headless pass — record them as open
and hand them to Andrew, exactly as Phase 6 did.

---

## 3. Constraints all phases follow

Everything in `docs/admin-mobile-plan.md` §3 still applies, plus:

- `CLAUDE.md` and `SYSTEM_CONTEXT.md` govern. Read both.
- Tailwind utilities only; no custom CSS, no CSS modules, no inline `style={{}}`
  (the `components/venue-screen/*` exception does not reach the admin surface).
- Strict TypeScript, no `any`, `@/` absolute imports, arrow-function components.
- Do not modify `lib/supabaseAdmin.ts`, `vercel.json`, or existing migrations.
- Do not add a `middleware.ts`. `proxy.ts` is the live edge gate.
- No service worker, no install promotion on `/admin` — the PWA is players-only.
- Each phase appends a `## Remediation Phase R<N>` entry to
  `docs/admin-mobile-run-log.md` before finishing, including any deviation and
  anything a later phase must not trust. R0's correction to the Phase 1 entry
  is the standing example of why.

---

## 4. Open items for Andrew

1. **The R5 device pass**, including the still-open Phase 6 items. Nothing on
   that checklist can be closed by an agent in this environment.
2. **`.scratch/verify-admin-mobile.mjs`** — R0 gitignores it. Say whether it
   should also be deleted outright; it stubs the admin session endpoint to
   `{ok:true}` and is worth not keeping around loose.
3. **`AdminConsole.tsx` / `/admin/[section]`** — the duplicate console is
   what forces R4's third module to exist. Deleting it would simplify the
   registry to two modules. Out of scope here (plan §0 problem 7); worth
   scheduling.
