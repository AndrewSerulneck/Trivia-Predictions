# Category Blitz Mobile Keyboard Handoff

## Current Problem

Category Blitz is still failing on mobile Safari/iOS when a user taps an answer field and the soft keyboard opens.

Observed user report after the latest pushed fixes:

- The magenta game/background gap is still visible above the iOS keyboard.
- The answer rows are still visually disrupted or blocked while typing.
- The desired behavior is an app-like fixed game surface: keyboard can open for text entry, but the game chrome and answer list should not be pushed off-screen or reveal the background behind the game.

Reference screenshot supplied by Andrew:

- `/Users/andrewserulneck/Downloads/Hightop Challenge 6.png`
- It shows Category Blitz in iOS Safari with the keyboard open.
- The top game content remains visible only partly.
- Below the visible answer rows, a large magenta background band appears above the keyboard.
- The browser URL accessory bar and keyboard are visible.

The screenshot is important because it suggests this is not just a normal "focused item is behind the keyboard" issue. The actual game surface appears to stop before the keyboard, while the page/game background continues behind it.

## Product Requirement

Category Blitz should feel like a mobile app:

- Game route should occupy the whole screen.
- Header/timer/game content should not be pushed up by the keyboard.
- Footer/legal notice should never appear inside games.
- Only the answer list should internally scroll as needed to keep the active answer reachable.
- Venue Home can still show the legal notice only at the very bottom when users scroll all the way down.

## Relevant Files

- `components/category-blitz/CategoryBlitzGame.tsx`
- `components/ui/AppShell.tsx`
- `components/venue/GameLandingExperience.tsx`
- `app/globals.css`
- `tests/category-blitz-mobile-shell-contract.test.ts`

## Commits Already Pushed

### `35115fc Fix Category Blitz mobile shell`

Files changed:

- `app/globals.css`
- `components/category-blitz/CategoryBlitzGame.tsx`
- `components/ui/AppShell.tsx`
- `components/venue/GameLandingExperience.tsx`
- `tests/category-blitz-mobile-shell-contract.test.ts`

Intent:

- Treat `/category-blitz` as a fullscreen game route.
- Remove normal app shell padding/footer behavior from game routes.
- Hide the legal notice footer on game screens and keep it venue-home-only.
- Lock `html` and `body` while Category Blitz gameplay is mounted.
- Add an internal scroll area for answer rows.
- Add an initial CSS variable for keyboard inset.

Notable implementation details:

- `AppShell.tsx` added `/category-blitz` to fullscreen/game route arrays.
- `showLegalNotice` was changed to show only on exact venue home routes:
  - `const isVenueHome = /^\/venue\/[^/]+\/?$/.test(pathname ?? "");`
  - `const showLegalNotice = !isAdmin && isVenueHome;`
- `app/globals.css` added:
  - `html.tp-category-blitz-game-active`
  - `body.tp-category-blitz-game-active`
  - `height/min-height/max-height: 100svh`
  - `overflow: hidden !important`
  - `overscroll-behavior: none !important`

Result:

- Footer/legal notice problem should be fixed.
- Did not fully solve iOS keyboard visual disruption.

### `d266798 Stabilize Category Blitz mobile keyboard`

Files changed:

- `components/category-blitz/CategoryBlitzGame.tsx`
- `tests/category-blitz-mobile-shell-contract.test.ts`

Intent:

- Avoid native input fields inside each answer row.
- Prevent mobile Safari from scrolling the page to reveal focused row-level inputs.
- Use one tiny fixed hidden input as the keyboard receiver.

Notable implementation details:

- Removed visible/native `<input>` elements from answer rows.
- Answer rows became buttons/display controls.
- Added one hidden fixed input with `data-category-blitz-keyboard-input`.
- Tapping a row set `activeAnswerIndex`, then focused the hidden input with:
  - `focus({ preventScroll: true })`
- The hidden input wrote changes into the active answer row.
- The answer list used internal scrolling via `answerListRef`, not `.scrollIntoView()`.

Result:

- The design should have reduced browser-driven page panning.
- User still reproduced the magenta gap/disruption on device.

### `fe95f72 Harden Category Blitz mobile keyboard layout`

Files changed:

- `components/category-blitz/CategoryBlitzGame.tsx`
- `tests/category-blitz-mobile-shell-contract.test.ts`

Intent:

- Add real-device diagnostics.
- Make the viewport frame track iOS `visualViewport`.
- Harden focus timing so Safari does not get a chance to pan the page before the proxy input receives focus.
- Stop the game frame from shrinking to the keyboard-reduced visual viewport height.

Notable implementation details:

- Added opt-in debug panel:
  - Enabled with `?cbzDebug=1`
  - Or `localStorage.setItem("tp:category-blitz-layout-debug", "1")`
  - Current marker: `cbz-stable-frame-v5`
- Debug panel displays:
  - active element marker
  - keyboard proxy count
  - row input count
  - answer row count
  - `scrollY`
  - `innerHeight`
  - `visualViewport.height`
  - `visualViewport.offsetTop`
  - body/html overflow
  - game rect and answer-list rect
  - viewport frame CSS variables
- Added `VIEWPORT_FRAME_CLASS`:
  - `fixed`
  - `left-[var(--cbz-vv-left,0px)]`
  - `top-[var(--cbz-vv-top,0px)]`
  - `h-[var(--cbz-vv-height,100svh)]`
  - `w-[var(--cbz-vv-width,100vw)]`
  - `overflow-hidden`
- Added `useCategoryBlitzViewportFrame()`.
- It writes CSS variables:
  - `--cbz-vv-top`
  - `--cbz-vv-left`
  - `--cbz-vv-stable-height`
  - `--cbz-vv-stable-width`
  - `--cbz-vv-height`
  - `--cbz-vv-width`
- Phase 4 changed `--cbz-vv-height` to use the largest stable height rather than the keyboard-shrunken `visualViewport.height`.
- Added `activeAnswerIndexRef` so the hidden input can handle typing without waiting on React state.
- Removed `disabled` from the hidden input so it is always focusable.
- Row activation now uses `onPointerDown`, calls `event.preventDefault()`, and focuses the hidden input synchronously.

Result:

- Local static checks passed.
- User still reproduced the magenta background gap on real device.

## Verification Already Run

These passed after the latest changes:

- `npx vitest run tests/category-blitz-mobile-shell-contract.test.ts`
- `npx tsc --noEmit`
- `npm run lint`

Important caveat:

- The tests are mostly source-contract/static tests, not a real iOS Safari keyboard test.
- Browser automation on desktop cannot faithfully reproduce iOS Safari keyboard behavior.
- The user’s real device is the source of truth for this bug.

## Important Current Behavior To Inspect

In `CategoryBlitzGame.tsx`, current architecture is:

- Top-level Category Blitz root is `fixed` and sized by CSS variables from `useCategoryBlitzViewportFrame`.
- `html` and `body` get `tp-category-blitz-game-active` while the game is mounted.
- `html/body` are locked to `100svh` and `overflow: hidden`.
- A hidden fixed input receives keyboard focus.
- Visible answer rows are buttons, not inputs.
- The answer list is the only intended scroll container.

Despite this, iOS still shows the magenta background gap.

## Strong Suspicions / Next Debugging Targets

### 1. The fixed game root may be sized or positioned incorrectly on iOS Safari

The current implementation sets:

- `top = visualViewport.offsetTop`
- `height = stable max height`

If iOS Safari shifts `visualViewport.offsetTop` while the keyboard opens, combining a non-zero `top` with stable full height may push the fixed game root downward. The lower part may then extend behind the keyboard while the visible top/bottom relationship creates a gap.

Possible next experiment:

- For Category Blitz, ignore `visualViewport.offsetTop` entirely and keep the game root at `top: 0`.
- Use a stable layout viewport height such as `100dvh`/`100lvh` fallback or an app-defined locked initial height.
- Let only the answer list compensate for keyboard with padding/inset.

### 2. `100svh` on `html/body` may be the wrong lock

The body lock uses `height: 100svh`. On iOS Safari, `svh` can be smaller than the full layout viewport and may interact badly with keyboard/browser chrome states.

Possible next experiment:

- Try locking `html/body` to `100lvh` or a JS-captured `--cbz-layout-height` from initial `window.innerHeight`.
- Avoid updating the root height while the keyboard is open.
- Compare:
  - `100svh`
  - `100dvh`
  - `100lvh`
  - JS initial `window.innerHeight`

### 3. The magenta gap may be from parent route wrapper, not the game root

`GameLandingExperience.tsx` and `AppShell.tsx` still provide route-level wrappers around Category Blitz. The magenta may be the game landing background or page background showing after a child frame shrinks/moves.

Possible next experiment:

- On the actual play state, make Category Blitz render a full-screen fixed overlay independent of parent layout:
  - `position: fixed`
  - `inset: 0`
  - `height: 100lvh` or locked JS height
  - `background: slate-950` or the game mode background
  - highest route-local z-index
- Temporarily set a loud diagnostic background color on each wrapper:
  - AppShell
  - GameLandingExperience
  - CategoryBlitzGame root
  - AnsweringScreen root
  - answer list
- Ask Andrew to take another `?cbzDebug=1` screenshot to identify which layer is visible in the gap.

### 4. The proxy input may still be triggering native viewport panning

Even with `preventScroll`, iOS Safari may still pan to expose the focused input. The hidden input is fixed near the top safe area, but Safari may still react to its focus or selection.

Possible next experiment:

- Move the hidden input to a stable visible-safe location inside the fixed game root, not directly under the browser top chrome.
- Try `top: 50%` or place it just above the keyboard-safe area while opacity remains 0.
- Avoid `h-px/w-px`; use a normal-sized invisible input with `opacity: 0`, no transform, and `caret-color: transparent`.
- Ensure it is not covered by parent transforms or clipping.

### 5. Browser accessory bar may need explicit keyboard-aware layout

The iOS accessory bar between page and keyboard is visible in the screenshot. The effective obscured region may be larger than `innerHeight - visualViewport.height`.

Possible next experiment:

- Calculate keyboard inset from the difference between a locked baseline height and `visualViewport.height + visualViewport.offsetTop`.
- Apply that inset only to the answer list bottom padding.
- Do not use that inset to resize the entire game root.

## Recommended Next Agent Plan

### Phase A: Real-device diagnostics

Use `?cbzDebug=1` on the live URL. Ask Andrew for a screenshot while the keyboard is open.

Record these values from the debug panel:

- `v`
- `active`
- `proxy`
- `rowInputs`
- `scrollY`
- `bodyH`
- `innerH`
- `vvH`
- `vvTop`
- `overflow h/b`
- `frame`
- `game`
- `list`

Interpretation:

- `active` should be `input:keyboard-proxy`.
- `rowInputs` should be `0`.
- `scrollY` should remain `0`.
- If `frame` height is full but `game` rect top/bottom are shifted, root positioning is likely wrong.
- If `game` rect is short, root sizing is likely wrong.
- If gap color matches a parent wrapper, the child is not covering the parent during keyboard open.

### Phase B: Simplify the frame

Try removing `visualViewport.offsetTop` from the root frame:

- Keep root fixed at `top: 0`.
- Keep root height stable.
- Track only keyboard inset for answer list padding.

This is the most likely next fix because the failed implementation may be overreacting to `visualViewport.offsetTop`.

### Phase C: Move from CSS viewport units to a locked JS height

On Category Blitz mount:

- Capture `window.innerHeight` before keyboard focus.
- Store it as `--cbz-layout-height`.
- Use that for the game root height.
- Reset only on orientation change.

Avoid setting root height from `visualViewport.height` during typing.

### Phase D: Isolate parent wrappers

If the gap persists:

- Make the actual gameplay root a fixed overlay with `inset: 0`.
- Temporarily give each wrapper a distinct debug background.
- Find which background is visible in the gap.

### Phase E: Revisit keyboard input strategy

If the root is stable but Safari still pans:

- Reposition/resize hidden proxy input.
- Consider a contenteditable keyboard receiver if native input focus continues to cause unwanted viewport panning.
- Keep answer rows non-input controls.

## Guardrails

- Do not bring back native inputs inside the answer rows unless deliberately testing a throwaway branch.
- Do not show the legal footer on any game route.
- Do not use page-level scrolling to keep answers visible.
- Keep scrolling confined to the answer list.
- Do not stage/commit unrelated billing/docs/assets work currently dirty in the worktree.

## Current Dirty Worktree Warning

At the time this handoff was created, the repo contained many unrelated dirty files for billing/docs/assets work. The Category Blitz work already pushed is clean in:

- `components/category-blitz/CategoryBlitzGame.tsx`
- `tests/category-blitz-mobile-shell-contract.test.ts`

Any future commit for this issue should stage only relevant Category Blitz/mobile shell files.

## Follow-Up Self-Execution: `cbz-locked-layout-v6`

After this handoff was first written, the recommended plan was executed locally in a new pass.

Files changed in that pass:

- `app/globals.css`
- `components/category-blitz/CategoryBlitzGame.tsx`
- `components/venue/GameLandingExperience.tsx`
- `tests/category-blitz-mobile-shell-contract.test.ts`

What changed:

- The Category Blitz root frame no longer uses `visualViewport.offsetTop`.
- The root frame is now fixed at `top: 0` via:
  - `fixed inset-x-0 top-0`
  - `h-[var(--cbz-layout-height,100lvh)]`
- The frame height is now a locked `--cbz-layout-height` value captured from the largest available `window.innerHeight` / `visualViewport.height` and reset only on orientation-style reset.
- `html.tp-category-blitz-game-active` and `body.tp-category-blitz-game-active` now use `var(--cbz-layout-height, 100lvh)` instead of `100svh`.
- Category Blitz-specific wrappers in `GameLandingExperience.tsx` now also use `--cbz-layout-height` instead of `100svh`.
- The route wrapper now has `data-category-blitz-route-shell` so the debug panel can identify its rect.
- The game root now has `data-category-blitz-game-root`.
- Debug version changed to `cbz-locked-layout-v6`.
- Debug panel now reports:
  - app shell rect
  - main rect
  - route wrapper rect
  - game root rect
  - keyboard inset
  - locked layout height
- The invisible keyboard proxy input is no longer 1px. It is now a normal-sized invisible input:
  - `h-11`
  - `w-[calc(100vw-2rem)]`
  - `text-base`
  - `caret-transparent`
  - fixed near the top safe area

Why:

- The v5 implementation may have made the gap worse by combining a stable full height with a non-zero `visualViewport.offsetTop`.
- Parent wrappers still using `100svh` could also clip the game and reveal the magenta background.
- A 1px hidden input may trigger odd iOS Safari focus/zoom/pan behavior.

Verification passed after this pass:

- `npx vitest run tests/category-blitz-mobile-shell-contract.test.ts`
- `npx tsc --noEmit`
- `npm run lint`

Still required:

- Real iPhone Safari testing remains the source of truth. Test with `?cbzDebug=1` and capture a screenshot while the keyboard is open if the gap remains.
