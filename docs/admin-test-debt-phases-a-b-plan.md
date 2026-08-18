# Admin Test Debt — Phases A & B (stale tests from commit `6c2ff46`)

**Status: Phase A done (commit `eb813e0`, 2026-08-18). Phase B done (2026-08-18) — `npm run test`
fully green, `npx tsc --noEmit` and `npm run lint` clean.** Written 2026-08-17,
extracted from the Appendix of `docs/prop-bingo-nfl-plan.md` so it can be executed independently,
*after* the Prop Bingo code review lands.

## Handoff to Phase B (2026-08-18)

Phase A is committed (`eb813e0`). Baseline re-verified right before that commit and again right
after: **before** — `2 failed | 189 passed | 1 skipped` files, `4 failed | 1736 passed | 13 skipped`
tests, matching this doc's original count exactly. **After Phase A** — `npm run test` shows exactly
`2 failed` files collapsed to **1 failed file** (`tests/venue-activation.phase4-mount.test.ts`),
**4 failed → 3 failed** tests, all three being the Phase B ones listed below. `npx tsc --noEmit` and
`npm run lint` are both clean, unchanged from baseline. Nothing outside
`tests/admin-mobile.section-registry-split.test.ts` was touched.

Do not re-run the Phase A diagnosis — it's re-verified and closed. Start Phase B directly from
"### Diagnosis" below. Ground rule 2 (don't fix product code) and ground rule 3 (treat pre-8/7 docs
as suspect until checked against current source) still apply. Acceptance criterion for Phase B is
unchanged: `npm run test` fully green (0 failures) plus the new lock-coverage tests and the two doc
updates described below, then commit separately from Phase A.

**Do this after the Prop Bingo review, not before.** Neither phase touches Prop Bingo,
`lib/sportsBingo.ts`, `lib/sportsBingoOdds.ts`, or any flag, so folding them into that diff would
only add unrelated surface for a reviewer to read.

---

## The problem

`npm run test` has **4 failing tests on `main`**, in 2 files. They are the *only* failures — verified
2026-08-17: `2 failed | 189 passed | 1 skipped (192)` files, `4 failed | 1736 passed | 13 skipped
(1753)` tests. `npx tsc --noEmit` and `npm run lint` are clean.

**Both files have the same root cause: commit `6c2ff46` "Tweaking Admin Mobile View" (Andrew,
2026-08-07).** That commit made two deliberate, coherent product changes to the admin mobile surface
and updated zero tests and zero docs (`git show 6c2ff46 --stat -- docs/` is empty).

**Neither product change is wrong — the *tests* are stale**, and one of the two changes shipped with
no coverage at all. That second half is the real substance of this work; the test repairs themselves
are mechanical.

### Ground rules for both phases

1. **Confirm the baseline first:** on a clean tree, `npm run test` must show exactly these 4
   failures and nothing else. If you see more, something landed since 2026-08-17 — re-diagnose
   rather than trusting this document.
2. **Do not "fix" the product code in either phase.** Both changes in `6c2ff46` are intentional and
   internally consistent (Phase A verified across four call sites; Phase B documented in the prop's
   own docstring). Reverting either to satisfy a test would be backwards. If you think one is
   actually wrong, that's a conversation with Andrew, not a code change.
3. **`6c2ff46` was a direct hand-edit with no doc updates.** Treat any other assertion about the
   admin-mobile or venue-activation surfaces written before 2026-08-07 as suspect until checked
   against current source. These 4 failures may not be the only stale ones — they're just the only
   ones that happen to be *failing*. A test that passes for the wrong reason is worse.
4. **Acceptance criterion: `npm run test` fully green**, plus the new coverage each phase adds.

The two phases don't interact and can be done in either order, or as two separate commits.

---

## Phase A — mobile admin tab allowlist went 3 → 2 (1 failing test)

**Model: Sonnet 5 · effort: low.** One test file, no product code changes.

**Failing:** `tests/admin-mobile.section-registry-split.test.ts:114` →
*"keeps the mobile allowlist a literal 3-item array, never derived"*
(`AssertionError: expected [...] to have a length of 3 but got 2`).

### Diagnosis (re-verified 2026-08-17 — the test is stale, the code is correct)

`6c2ff46` intentionally removed `"game-settings"` from the mobile admin tab bar, and did so
completely and coherently — all four call sites moved together:

| File | Change in `6c2ff46` |
| --- | --- |
| `components/admin/adminSectionMeta.ts:97` | `MOBILE_SECTION_ORDER` lost `"game-settings"` |
| `components/admin/AdminMobileShell.tsx` | dropped `GameSettingsSection` from its import |
| " | `TAB_ICON` lost the `"game-settings": "🎮"` entry |
| " | `renderSection`'s `case "game-settings"` removed |
| " | nav grid `grid-cols-3` → `grid-cols-2`, tabs enlarged to `min-h-[104px]` |

Current source confirms the end state — `adminSectionMeta.ts:97-100` is now:

```ts
export const MOBILE_SECTION_ORDER = [
  "venue-manage",
  "partner-billing",
] as const satisfies readonly AdminSection[];
```

That is a finished change. Only the test's hardcoded `3` was left behind.

### The fix — do NOT just change `3` to `2`

Read the test's own comment (lines 115–117): the invariant it exists to protect is *"adding a
section to `ADMIN_SECTION_OPTIONS` must never make it reachable on mobile — only editing this
literal list does."* **The count was never the point** — it was a proxy for "this is a hand-written
literal." Hardcoding `2` just re-arms the same tripwire to fire on the next intentional edit.

Assert the property directly instead:

- the match against `/MOBILE_SECTION_ORDER\s*=\s*\[([\s\S]*?)\]\s*as const/` still succeeds — that
  regex only matches an inline array literal, so a derived value like `ADMIN_SECTION_OPTIONS.filter(…)`
  cannot match it. **This is the real guard**;
- every entry is a quoted string literal (`/^"[a-z-]+"$/`) — no spreads, no identifiers, no computed
  members;
- the array is non-empty and small — assert a bound like `≤ 5` rather than an exact count, since the
  tab bar is a fixed-width grid and "small" is the actual product constraint;
- keep `expect(stripped).not.toMatch(/MOBILE_SECTION_ORDER[\s\S]{0,80}ADMIN_SECTION_OPTIONS/)`
  exactly as-is — that's the second half of the derived-value guard;
- **rename the test** — its title still says "3-item". Something like *"keeps the mobile allowlist a
  literal string-array, never derived"*.

### Also add while you're here (currently uncovered)

Nothing asserts that `MOBILE_SECTION_ORDER`, `TAB_ICON` and `AdminMobileShell`'s `renderSection`
switch stay in sync. `TAB_ICON` is typed `Record<MobileSection, string>` so `tsc` catches that one,
but **the switch is not exhaustive-checked**. A one-line test that every id in
`MOBILE_SECTION_ORDER` appears as a `case "<id>":` in `AdminMobileShell.tsx` would have caught a
half-done version of `6c2ff46`.

---

## Phase B — the edit-mode geofence lock (3 failing tests)

**Model: Sonnet 5 · effort: medium.** The test repair is mechanical; the new coverage and the doc
reconciliation are the substance.

**Failing:** all three in `tests/venue-activation.phase4-mount.test.ts` —

- `:54` *"edit mode renders the slider at the venue's radius and no old controls"*
- `:88` *"ArrowRight on the dial then Save submits radius: 175 with the lat/lng unchanged"*
- `:110` *"a dial move keeps source lookup (placeId preserved) while Advanced typing sets manual"*

All three fail identically: `TestingLibraryElementError: Unable to find an accessible element with
the role "slider" and name "Geofence radius"`.

### Diagnosis (re-verified 2026-08-17 — one root cause, tests are stale)

`6c2ff46` added a `startLocked` prop to `components/admin/GeofenceEditor.tsx`
(`:57` type, `:73` default `false`, `:81` `useState`). When locked, the component **returns early at
`:169`** and renders a read-only summary card instead of the map and radius dial — pin label,
`Geofence radius: {value} m`, coordinates, a "Check ↗" maps link, a `🔒 Edit location & geofence`
button (`:193-198`), and the explanatory line *"Locked so a stray tap can't move the pin or resize
the radius. Tap to make changes."*

Its rationale, quoted from the prop's own docstring at `:51`: the dial starts *"locked behind a
summary card"* so a thumb scrolling past the map can't nudge the pin or resize the geofence by
accident.

`components/admin/mobile/ActivateVenueFlow.tsx:432` passes `startLocked={mode === "edit"}`. All three
failing tests render `mode: "edit"`, so the slider genuinely is not in the DOM. **The lock is
uncontrolled and one-way** — once opened it stays open for that form mount.

The three tests that still pass in that file are the ones that never reach the slider: the
`hideAdvanced` test asserts on `ActivateVenueFlow`'s *own* Advanced panel (not the editor's), and the
GPS/create-button tests don't touch the dial.

### The fix

Add one unlock click before each slider query:

```ts
fireEvent.click(screen.getByRole("button", { name: /Edit location & geofence/ }));
```

Prefer a small local `renderUnlockedEditFlow()` helper over three copy-pasted clicks — all three
tests need the identical two steps. (The button's JSX uses `&amp;`, which renders as a literal `&`,
so the regex above matches as written.)

### The more important half: the lock has ZERO test coverage anywhere

Grepped every test touching `GeofenceEditor` / `ActivateVenueFlow`:
`tests/venue-activation.geofence-editor.test.ts` renders the editor directly and never passes
`startLocked` (so it defaults to `false` and passes), and `tests/admin-mobile.activate-venue.test.ts`
never reaches the dial. **That is precisely why this shipped as three red tests rather than one clear
signal.** Add, in `tests/venue-activation.phase4-mount.test.ts`:

- **locked is the default in edit mode** — `mode: "edit"` renders no `role="slider"`, and the summary
  card shows `Geofence radius: 150 m`;
- **create mode is NOT locked** — `mode: "create"` exposes the slider immediately;
- **unlock is one-way** — after clicking through, the slider stays mounted across a re-render;
- **the locked summary is read-only** — it must not be possible to change radius or coordinates
  without unlocking first. **This is the actual product guarantee, and no test asserts it today.**

> **Note the real asymmetry — it is narrower than "create vs. edit".** `startLocked` has exactly one
> caller: `ActivateVenueFlow.tsx:432`. The desktop surface,
> `components/admin/sections/VenuesSection.tsx:654`, passes **no `startLocked` at all**, so the
> desktop editor is unlocked in *both* create and edit. The lock is **mobile-edit-only**, not
> "edit-mode". Write the create-mode test against `ActivateVenueFlow` with `mode: "create"`, and if
> you want to pin the desktop behavior too, assert it separately against `VenuesSection` — don't
> conflate the two into one "create is unlocked" claim.

### Then update the owning docs, which are also stale

`6c2ff46` documented nothing. `docs/venue-activation-map-radius-plan.md` (whose Phase 5 these tests
belong to) describes the edit surface with no mention of a lock, and
`docs/venue-activation-device-checklist.md` has no manual check for it. Add:

- a short as-built note to the plan; and
- a checklist line for the lock's touch behavior on a real phone — **the "stray thumb" case it
  exists to prevent is exactly the kind of thing jsdom cannot verify.**

---

## Suggested execution

1. Confirm the 4-failure baseline on a clean tree.
2. Phase A (small, self-contained) → commit.
3. Phase B: test repair, then the 4 new lock assertions, then the two doc updates → commit.
4. `npm run test` green, `npx tsc --noEmit` clean, `npm run lint` clean.
