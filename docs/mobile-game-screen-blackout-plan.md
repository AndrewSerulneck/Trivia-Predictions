# Mobile game-screen blackout fix — plan + handoff

**Symptom (reported 2026-08-04):** on Pick 'Em (not NFL Pick 'Em), Speed Trivia,
Live Trivia, Fantasy, and Prop Bet Bingo, the bottom ~1/3 of the screen renders
black on mobile — buttons, tutorial "Next"/"Back" controls, and ad/overlay
content below that line don't appear or can't be reached. Category Blitz is
NOT affected. Desktop is NOT affected (confirmed with user 2026-08-04).

## Root cause

Commit `35115fc` ("Fix Category Blitz mobile shell", 2026-08-01) added a hard
`100svh` viewport clamp to [components/ui/AppShell.tsx](../components/ui/AppShell.tsx),
intending it only for Category Blitz, but applied it to the shared
`isGameScreen` check instead — which also matches `/trivia`, `/bingo`,
`/pickem`, `/fantasy`, `/predictions`, `/active-games`, `/pending-challenges`.

Before that commit, non-Category-Blitz game routes got only `bg-slate-950` on
the shell wrapper and `flex-1 pb-24` on `<main>`. After it, they got:
- wrapper: `h-[100svh] min-h-[100svh] max-h-[100svh] overflow-hidden`
- main: `h-full min-h-0 overflow-hidden p-0`

Those routes render through `GameLandingExperience` → `PageShell` **without**
`lockViewport`, so their content is laid out at `min-h-[100dvh]` plus a fixed
header spacer (~5.35rem, see [PageShell.tsx:40](../components/ui/PageShell.tsx#L40)),
all inside a box hard-capped at `100svh`. On iOS Safari, `dvh` (large/dynamic
viewport, chrome collapsed) is taller than `svh` (small viewport, chrome
expanded) by roughly the browser-chrome height (~90–130px) — so content is
laid out taller than the box that clips it, and nothing can scroll to reach
the clipped part: the outer wrapper is `overflow-hidden`/`max-height`-capped,
and the inner `overflow-y-auto` div never overflows *itself* because it's
sized `min-h-[100dvh]` — it grows to fit content instead of scrolling it. The
clipped strip paints as the wrapper's `bg-slate-950` — the black band.

Category Blitz is unaffected because its gameplay renders through a
body-level `position: fixed` portal (`CategoryBlitzPlayShell.tsx`), which
never participates in this AppShell flow at all — the clamp is genuinely
needed there, just not shared.

**Secondary, smaller contributor** (explains some missing overlays/ads even
where scrolling looks okay): `.animate-tp-surface-enter` in
[app/globals.css:1816](../app/globals.css#L1816) uses
`animation-fill-mode: both` ending on a non-`none` transform
(`transform: scale(1) translateY(0)`), which permanently makes that div a
containing block for `position: fixed` descendants. Any fixed-position
overlay/ad rendered inside that tree gets positioned against the div (and
clipped by its `overflow: hidden` ancestor) instead of against the real
viewport.

## Scope decision (confirmed with user 2026-08-04)

- Blank-bottom bug is **mobile only** (iOS/Android). Desktop unaffected.
- Fix = **restore normal scrolling** on the five non-Category-Blitz game
  routes to their exact pre-`35115fc` behavior. Do NOT give them
  Category-Blitz-style locked/fixed app-feel shells as part of this fix —
  that would be a much larger, separate effort with its own risk, and
  isn't needed to resolve the bug.

## Phase status

### Phase 1 — Narrow the clamp to Category Blitz — **DONE (2026-08-04)**
Model used: Sonnet 5. Effort: low.

Changed [components/ui/AppShell.tsx](../components/ui/AppShell.tsx):
- Added `isCategoryBlitzRoute = !isAdmin && Boolean(pathname?.startsWith("/category-blitz"))`.
- `mainClassName`: only `isCategoryBlitzRoute` gets
  `"h-full min-h-0 overflow-hidden p-0"`; plain `isGameScreen` (the other five
  routes) now falls back to `"flex-1 pb-24"`, matching pre-`35115fc` behavior.
- Wrapper className: only `isCategoryBlitzRoute` gets
  `"h-[100svh] min-h-[100svh] max-h-[100svh] overflow-hidden bg-slate-950"`;
  plain `isGameScreen` now gets just `"bg-slate-950"` (no clamp), also
  matching pre-`35115fc`.
- `GAME_SCREEN_PATHS`/`FULLSCREEN_PATHS` arrays themselves are unchanged —
  Category Blitz still needs to be in both; only the *behavior keyed off*
  `isGameScreen` was split.
- Added an inline comment on `isCategoryBlitzRoute` explaining why (points
  back to this doc) so the split isn't "fixed" back together by a future
  refactor without re-reading the rationale.

Also updated [tests/category-blitz-mobile-shell-contract.test.ts](../tests/category-blitz-mobile-shell-contract.test.ts):
- The existing test asserting the clamp (previously keyed on the
  `": isGameScreen"` branch, which is exactly the regression this bug is
  about) now targets `": isCategoryBlitzRoute"` instead.
- Added a new test, `"does NOT clamp the other game routes..."`, that
  positively asserts the plain-`isGameScreen` main/wrapper branches contain
  no `overflow-hidden` / `h-[100svh]` / `max-h-[100svh]` — a regression guard
  so this can't quietly get re-merged a third time. (This file already caught
  one prior regression this same commit introduced — the legal-notice
  narrowing — so this is precedent, see the test file's own comments.)

Verified: `npx vitest run tests/category-blitz-mobile-shell-contract.test.ts`
→ 13/13 pass (was 11, +2 from the split). `npx tsc --noEmit` → clean.
**Not yet run:** full `npm run lint`, full `npm run test`, or any browser
verification — that's Phases 2–4 below.

---

### Phase 2 — Regression sweep (rename from original plan's "Phase 5") — **DONE (2026-08-04)**
Model used: Sonnet 5. Effort: low.

Ran all four checks against the Phase 1 diff, nothing further changed:
```
npx tsc --noEmit                                → clean, no output
npm run lint                                    → clean (eslint .), no warnings/errors
npm run test                                    → 158 files passed | 1 skipped (159)
                                                   1342 tests passed | 13 skipped (1355)
npm run category-blitz:verify-mobile-shell      → 25 passed, 0 failed
```

**Correction to this plan file:** the script name in the original Phase 2
instructions (`npm run verify:category-blitz-mobile-shell`) doesn't exist —
`npm run` (no args) shows the real name is
`category-blitz:verify-mobile-shell` (`package.json:15`, wired to
`scripts/verify-category-blitz-mobile-shell.cjs` per commit bb46c41). Used
the correct name; script ran clean — all 25 checks passed (game-root sizing,
no stray magenta overlay, layout-projection retirement, keyboard-open
compactChrome behavior, row-input ownership). This positively confirms
Category Blitz's own mobile shell is untouched by the Phase 1
`isGameScreen`/`isCategoryBlitzRoute` split — i.e. Phase 4's "quick sanity
check" concern (that splitting the branches might have accidentally
un-clamped Category Blitz too) is already addressed by this run, not just by
grepping the source.

**Checked for a second instance of the regression pattern:** grepped
`npm run test` output and the one other AppShell-adjacent test file,
`tests/components.app-shell-legal-notice.test.ts` (5 tests, all pass) — it
asserts legal-notice-banner behavior only, no clamp/`overflow-hidden`/
`isGameScreen` assertions at all, so it isn't a second instance of the same
regression pattern. No other test file references `isGameScreen`,
`h-[100svh]`, or `max-h-[100svh]` outside
`tests/category-blitz-mobile-shell-contract.test.ts` (already updated in
Phase 1). Nothing to fix here.

**Handoff to Phase 3 (Opus 5):** the mechanical/lint/type/unit-test surface
is fully clean — go straight to the CSS judgment call
(`.animate-tp-surface-enter` in `app/globals.css` around line 1816) per the
existing Phase 3 instructions below. No blockers, no unexpected findings
carried forward from Phase 2.

### Phase 3 — Fix the persistent-transform containing block — **DONE (2026-08-04)**
Model used: Opus 5. Effort: medium.

**Took candidate fix (1), plus a second fix the original plan missed.**

Changed [app/globals.css](../app/globals.css):
1. `@keyframes tp-surface-enter` `to` keyframe:
   `transform: scale(1) translateY(0)` → `transform: none`. Visually identical
   end state; removes the persistent containing block. (This was the planned fix.)
2. **`.animate-tp-surface-enter`'s `will-change: transform, opacity` →
   `will-change: opacity`.** This was NOT in the plan and fix (1) alone would
   have been insufficient: per spec, `will-change` naming a property that can
   create a containing block (`transform`, `filter`, `perspective`) creates one
   *by itself*, regardless of the property's actual value. Since this class is
   never removed from the element, the `will-change: transform` hint would have
   kept the exact bug alive after (1). `will-change: opacity` is safe — opacity
   creates a stacking context but not a containing block for fixed descendants —
   and it's the half that actually matters for a fade.

   Candidate fix (2) from the original plan (strip the class on `animationend`)
   was therefore not needed and not taken — no JS, no lifecycle to get wrong.
3. Added explanatory comments on both the keyframe and the class pointing back
   to this doc, so neither gets "tidied" back.

Added a regression test in
[tests/category-blitz-mobile-shell-contract.test.ts](../tests/category-blitz-mobile-shell-contract.test.ts)
— `"never leaves a persistent transform/will-change containing block on the
game surface wrapper"` — asserting the `to` keyframe uses `transform: none`
and the class's `will-change` contains no transform. (Same file as Phase 1's
guard; it already reads `app/globals.css`, so no new fixture wiring.)

**The pre-change audit the plan asked for — result: no deliberate reliance
found, fix is safe.** `.animate-tp-surface-enter` has exactly one usage:
`GameLandingExperience.tsx:321`, the long-lived `[data-venue-game-scroll]`
wrapper around gameplay children. Every `position: fixed` descendant reachable
from there falls into one of two groups, and neither wanted the div as its
containing block:
- **Full-viewport `inset-0` overlays** (want the viewport by definition):
  `PickEmGameList.tsx:1355`, `SportsBingoSelectBoard.tsx:686`,
  `ReadyPrompt.tsx:38`, `SportsBingoHome.tsx:1944/1962/2616/2665`,
  `FantasyHome.tsx:2369`.
- **Offset-positioned elements that already portal to `document.body`** — i.e.
  someone previously hit this exact bug and worked around it per-component:
  `SportsBingoHome.tsx:2023` (landscape shell, `createPortal` at :2212) and
  `FantasyHome.tsx:3237` (sticky submit CTA, `createPortal`). Precedent for the
  portal-as-escape-hatch is documented in `AccountMenu.tsx:73-74`.
  `FantasyHome.tsx:2344` (`top-[5.25rem]`, header-relative) and `:3213` (toast
  at `bottom: calc(6.75rem + safe-area)`) use offsets, but both are written
  against viewport/header geometry, not against the animated div's box.
- Ads (`MobileAdhesionAd`, `PopupAds`) render at `app/layout.tsx:102-103` —
  **outside** the animated subtree entirely, so the plan's "explains some
  missing ads" hypothesis is wrong for those two specifically. They were never
  descendants. Their bottom-clipping was the Phase 1 `100svh` clamp, not this.

Those per-component `createPortal` workarounds are now redundant but were
**left in place on purpose** — removing them is behavior-neutral cleanup with
nonzero risk (portals also escape `z-index`/`overflow` stacking, not just the
containing block), out of scope for a bug fix.

**Noted, not changed (out of scope, flagged for whoever cares later):**
- `.animate-tp-popup-sheet-up`/`-down` ([globals.css:1726/1732](../app/globals.css#L1726))
  are also `both` on transformed keyframes, but they animate the popup sheet
  itself (a short-lived overlay), not a long-lived container hosting other
  fixed elements. Same pattern, no known symptom.
- `.animate-tp-surface-enter` / `-exit` are absent from the
  `prefers-reduced-motion` block at [globals.css:1778](../app/globals.css#L1778)
  which covers the popup-sheet and fade classes. Likely an oversight, unrelated
  to this bug.

Verified after the change: `npx vitest run tests/category-blitz-mobile-shell-contract.test.ts`
→ 14/14 (was 13, +1). `npx tsc --noEmit` clean. `npm run lint` clean.
`npm run test` → 158 files passed | 1 skipped, 1343 passed | 13 skipped
(+1 vs Phase 2, exactly the new test). `npm run category-blitz:verify-mobile-shell`
→ 25 passed, 0 failed (Category Blitz still unaffected).

**Handoff to Phase 4 (browser verification):**
- Both code fixes are in and green on every automated surface. Nothing is
  blocked; Phase 4 is purely the real-browser pass.
- Phase 4's "quick sanity check before a full browser pass" is already
  satisfied: Phase 3 touched only `app/globals.css` (plus a test), never
  `AppShell.tsx`, and the `category-blitz:verify-mobile-shell` run above
  re-confirms the clamp branches still hold for Category Blitz.
- **What to look for that's specific to Phase 3's fix** (Phase 1's fix is the
  scroll/black-band one): open a game to the *playing* state, then trigger an
  in-game full-screen overlay and confirm it covers the whole viewport rather
  than being inset/clipped. Cheapest triggers: Speed Trivia's `ReadyPrompt`
  (`fixed inset-0 z-[1400]`, shows on entering a round) and Bingo's board-select
  modal (`SportsBingoSelectBoard.tsx:686`). If either renders offset from the
  top or clipped at the bottom, fix (2) didn't take.
- Note the 360ms entrance animation still applies a real transform *while it
  runs* — that's unavoidable without JS and is fine. Don't assert overlay
  geometry during the first ~400ms after a game surface mounts.
- Reminder for the browser pass: the script name is
  `npm run category-blitz:verify-mobile-shell` (the original plan text's
  `npm run verify:category-blitz-mobile-shell` does not exist).

<details>
<summary>Original Phase 3 instructions (for reference)</summary>

Model: Opus 5. Effort: medium (needs judgment, not mechanical).

Target: `.animate-tp-surface-enter` in
[app/globals.css](../app/globals.css) around line 1816
(`animation: tp-surface-enter 360ms cubic-bezier(0.22, 1, 0.36, 1) both;`).
The `to` keyframe of `tp-surface-enter` ends on
`transform: scale(1) translateY(0)` — not `none` — so with
`animation-fill-mode: both` the transform never clears, permanently making
that element a `position: fixed` containing block for its descendants.

Two candidate fixes:
1. Change the `to` keyframe to `transform: none` (visually identical end
   state, since `scale(1) translateY(0)` is a no-op transform anyway) — this
   should be the preferred fix, it just removes the containing-block side
   effect with zero visual change.
2. Or strip the class on `animationend` if (1) has some interaction with
   `will-change: transform` that matters (unlikely, but check).

**Before changing it:** grep for every `position: fixed` element that can be
a *descendant* of a `.animate-tp-surface-enter`-classed container (search
`animate-tp-surface-enter` usages, then look at what's rendered inside those
components) and confirm none of them were deliberately relying on being
positioned against that div instead of the viewport — e.g. some overlay may
have been placed with `top`/`left` values computed *assuming* the containing
block is the animated div, as a workaround rather than a coincidence. If any
such deliberate reliance is found, judgment call needed on whether to fix the
overlay's positioning too, or leave this specific instance alone. This is the
part of Phase 3 that needs a strong model, not the CSS edit itself.

</details>

### Phase 4 — Browser verification — **DONE (2026-08-04)**
Model used: Opus 5. Effort: medium.

**Outcome: Phase 1's fix verified working. Phase 3's fix was verified NOT
working and had to be re-fixed here.** Details below.

#### Harness

Playwright (already a transitive dep at `node_modules/playwright` — no install
needed), Chromium, viewport **390×664** (short iPhone-like screen), `isMobile`,
`hasTouch`, iOS Safari UA, auth cookies built the same way
`scripts/verify-category-blitz-mobile-shell.cjs` does. Real venue/user
(`brunswick-grove` / `Andrew`), dev server on :3000. Routes driven: `/pickem`,
`/trivia`, `/trivia/live`, `/fantasy`, `/bingo`, then `/category-blitz`.

**Final result: 66 hard checks passed, 0 failed.**

#### Finding 1 — Phase 3's CSS fix did not work. Re-fixed.

The browser measured, with Phase 3's changes fully in place, computed
`transform: matrix(1, 0, 0, 1, 0, 0)` on `.animate-tp-surface-enter`, and a
`position: fixed; inset: 0` descendant rendering **200×200 at the div's own
position instead of 390×664 at the viewport origin** — i.e. the containing-block
bug Phase 3 set out to remove was still fully present.

Phase 3's reasoning had a gap. Changing the `to` keyframe to `transform: none`
does nothing under a forwards-filling mode: the browser retains the animation's
final *interpolated* value, and `none` interpolates as the identity matrix,
which still establishes a containing block. A standalone probe of all the
candidate declarations made this unambiguous:

| declaration | computed transform | fixed child |
|---|---|---|
| `both` + `to { transform: none }` (Phase 3's fix) | `matrix(1,0,0,1,0,0)` | **contained** |
| `both` + `to { scale(1) translateY(0) }` (original bug) | `matrix(1,0,0,1,0,0)` | **contained** |
| `forwards` + `to { transform: none }` | `matrix(1,0,0,1,0,0)` | **contained** |
| **`backwards`** + `to { transform: none }` | `none` | **viewport ✓** |
| no fill mode + `to { transform: none }` | `none` | viewport ✓ |
| `backwards` + `will-change: transform, opacity` | `none` | **contained** |

The fix applied in this phase: **`animation-fill-mode: both` → `backwards`** in
`.animate-tp-surface-enter` ([app/globals.css](../app/globals.css)). Visually
identical — the element's base style is already `transform: none; opacity: 1`,
exactly what the `to` keyframe holds, and the probe confirms `opacity: 1` at
rest — but the fill is dropped when the animation ends, so the computed
transform returns to `none`. Still no JS, so the plan's candidate fix (2)
(strip the class on `animationend`) remains unnecessary.

Phase 3's *other* change was independently confirmed **correct and load-bearing**:
the last table row shows `will-change: transform` re-creates the containing block
by itself even with `backwards` in place. Both halves are required.

The keyframe's `transform: none` was kept (it is the honest end state) but its
comment was rewritten — the old comment asserted the keyframe was the fix, which
is exactly the wrong thing to leave for the next reader.

Test updated (`tests/category-blitz-mobile-shell-contract.test.ts`, same test
Phase 3 added): it now also asserts the animation shorthand contains `backwards`
and contains neither `both` nor `forwards`. Without that, the static guard would
have happily passed the broken CSS — as it did through all of Phase 3.

#### Finding 2 — the plan's suggested verification approach can't detect this bug

Two traps, both hit and worked around:

1. **Headless Chromium has no browser chrome, so `svh === lvh === dvh === 664`.**
   Re-applying the pre-`35115fc` Tailwind classes changes *no geometry at all*
   there — a "control" that can never fail. The harness instead applies the
   pre-fix clamp with an explicit pixel height standing in for the shorter iOS
   `svh` (viewport − 100px), leaving content laid out against the full-height
   `dvh`. That reproduces the real iOS geometry, and it fires: **180–189px of
   content trapped** on every one of the five routes.
2. **`overflow: hidden` boxes are still scrollable from script.**
   `scrollIntoView()` cheerfully scrolls them, so "can I get the button on
   screen?" reports success even on genuinely broken layout. The bug condition
   is stated directly instead: content overflows a box whose computed
   `overflow-y` is `hidden`, with no user-scrollable ancestor. Reachability
   checks drive real `mouse.wheel` scrolling and sample after every step.

The Phase 3 probe likewise carries a **negative control** (same probe against the
old `both` declaration) that must detect the bug, so a probe that silently stops
measuring anything fails loudly.

#### Results — the five affected routes

All five pass, at 390×664:
- `.tp-app-shell` has no `max-height` clamp and is not `overflow: hidden`;
  `<main>` is not `overflow: hidden` — pre-`35115fc` behavior restored.
- The document scrolls, and the shell is tall enough to contain its content.
- **Every visible control is reachable by real user scrolling** (5 / 10 / 3 / 13 / 4
  controls respectively).
- Pick 'Em and Fantasy render the tutorial: **"Back" and "Next" are fully
  on-screen, hit-testable and unobstructed** — the reported blocker is gone.
  Confirmed in screenshots, not just measurements.
- Positive control fires on all five: with the pre-fix clamp at a simulated iOS
  `svh`, 180–189px of content becomes unreachable.

Note on the other three routes: `/trivia` lands on category-select, `/trivia/live`
on a "Join Live Trivia!" CTA, and `/bingo` on the board-purchase screen — they
have no Back/Next because of live-data state, not because of the shell. Their
controls were verified reachable by the generic check instead. `/bingo`'s inline
sponsored ad slot renders in full.

**Expected, not a bug:** ~150–165px of `bg-slate-950` sits below the last content
when fully scrolled. That is `<main>`'s `pb-24` plus the shell's
`min-height: 100lvh` — exactly the pre-`35115fc` layout this fix restores. It is
*reachable* empty space, which is categorically different from the reported bug
(content that could not be reached at all).

#### Category Blitz — not regressed

- `/category-blitz`: `.tp-app-shell` **is** still clamped (`max-height` set,
  `overflow-y: hidden`), `<main>` **is** still `overflow: hidden`, and the page
  does not scroll. The Phase 1 branch split did not un-clamp it.
- `npm run category-blitz:verify-mobile-shell` → **25 passed, 0 failed**.

#### Regression sweep after this phase's change

```
npx tsc --noEmit                            → clean
npm run lint                                → clean
npm run test                                → 158 files passed | 1 skipped
                                               1343 passed | 13 skipped (1356)
npm run category-blitz:verify-mobile-shell  → 25 passed, 0 failed
```

One flake seen on an earlier run: `tests/lib.sportsBingo.player-props.test.ts`
("builds NBA board using BallDontLie player profiles"). Confirmed **not** caused
by this work — it passes in isolation both with and without the working-tree
changes (verified via `git stash`), and passed on the clean re-run above.

#### Remaining limitation (honest scope)

Headless Chromium cannot render iOS Safari's actual collapsing chrome, so the
`svh`/`dvh` delta is *simulated*, not real. The simulation reproduces the exact
geometry the bug depends on and the control proves the harness is sensitive to
it — but a real-device pass on iOS Safari is still the only true acceptance gate,
same caveat `docs/category-blitz-app-feel-plan.md` records for its own harness.
The Phase 3 containing-block finding is **not** subject to this caveat: that
behavior is spec-level and was measured directly.

**Optional follow-up (not done, out of scope):** the driver used here lives only
in this session's scratchpad. Given this exact regression has now landed twice,
promoting it to `scripts/verify-game-screen-scroll.cjs` alongside the Category
Blitz harness would be cheap. The static test guards in
`tests/category-blitz-mobile-shell-contract.test.ts` now cover both fixes, so
this is a nice-to-have rather than a gap.

<details>
<summary>Original Phase 4 instructions (for reference)</summary>

Model: Opus 5. Effort: medium.

Use the `/verify` skill (project skill for driving venue-scoped games
end-to-end with Playwright). Test at a mobile viewport where `dvh ≠ svh` is
pronounced (iPhone-like: short screen height, e.g. 390×664 with Safari-style
UA, or use Playwright's mobile device presets with a simulated URL-bar
collapse if the harness supports it — check what `/verify` already does for
Category Blitz's own mobile testing in
`scripts/verify-category-blitz-mobile-shell.cjs` for the pattern used there).

Confirm for each of: Pick 'Em, Speed Trivia, Live Trivia, Fantasy, Prop Bet
Bingo:
- Tutorial "Next"/"Back" buttons are visible and clickable (this was the
  reported blocker — users literally couldn't get into the games).
- Page scrolls normally to reach all content, no black band at the bottom.
- Any bottom ad/overlay (`MobileAdhesionAd` etc.) renders where expected.

Then **re-verify Category Blitz is untouched** — keyboard behavior, no
magenta band regression (the whole reason `35115fc`/`bb46c41` exist per
[docs/category-blitz-app-feel-plan.md](category-blitz-app-feel-plan.md)).
This is the actual regression risk of the Phase 1 change: confirm splitting
`isGameScreen`/`isCategoryBlitzRoute` didn't accidentally also un-clamp
Category Blitz itself. Quick sanity check before a full browser pass: grep
`AppShell.tsx` and confirm `isCategoryBlitzRoute` still gets the clamp
branches (should be untouched by Phase 3, which only touches globals.css).

</details>

## Reference: current AppShell.tsx logic after Phase 1

```
isAdmin           → main: "h-full min-h-0"; wrapper: fixed inset-0 ... overflow-hidden
isCategoryBlitzRoute → main: "h-full min-h-0 overflow-hidden p-0"; wrapper: h-[100svh]/max-h-[100svh]/overflow-hidden/bg-slate-950
isGameScreen (other 5 routes) → main: "flex-1 pb-24"; wrapper: "bg-slate-950" only
isFullscreen (non-game fullscreen, e.g. /info, /venue/, /coming-soon) → main: "min-h-0 p-0"; wrapper: ""
else (normal app pages) → main: "flex-1 pb-24"; wrapper: "mx-auto flex flex-col max-w-[720px] ..."
```

`FULLSCREEN_PATHS` and `GAME_SCREEN_PATHS` arrays are unchanged — Category
Blitz is still a member of both. Only the *behavior* keyed off `isGameScreen`
now has a Category-Blitz-specific carve-out (`isCategoryBlitzRoute`).
