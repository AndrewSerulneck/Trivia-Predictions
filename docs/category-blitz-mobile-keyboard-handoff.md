# Category Blitz Mobile Keyboard Handoff

## Current Problem

Category Blitz is still failing on mobile Safari/iOS when a user taps an answer field and the soft keyboard opens.

Observed user report after the latest pushed tested fixes, including `cbz-locked-layout-v6`:

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

### `12bab8c Lock Category Blitz mobile keyboard layout`

Files changed:

- `app/globals.css`
- `components/category-blitz/CategoryBlitzGame.tsx`
- `components/venue/GameLandingExperience.tsx`
- `docs/category-blitz-mobile-keyboard-handoff.md`
- `tests/category-blitz-mobile-shell-contract.test.ts`

Intent:

- Execute the original "next agent plan" directly.
- Stop using `visualViewport.offsetTop` to position the Category Blitz root.
- Replace `100svh` wrapper locks with one app-controlled `--cbz-layout-height`.
- Make all Category Blitz parent wrappers use the same locked height.
- Make the hidden keyboard proxy a normal-sized invisible input instead of a 1px input.

Notable implementation details:

- Debug marker changed to `cbz-locked-layout-v6`.
- `VIEWPORT_FRAME_CLASS` became:
  - `fixed inset-x-0 top-0`
  - `h-[var(--cbz-layout-height,100lvh)]`
  - `w-screen`
  - `overflow-hidden`
- `useCategoryBlitzViewportFrame()` now writes only:
  - `--cbz-layout-height`
- Removed previous CSS variables:
  - `--cbz-vv-top`
  - `--cbz-vv-left`
  - `--cbz-vv-height`
  - `--cbz-vv-width`
  - `--cbz-vv-stable-height`
  - `--cbz-vv-stable-width`
- `html.tp-category-blitz-game-active` and `body.tp-category-blitz-game-active` now use:
  - `height: var(--cbz-layout-height, 100lvh) !important`
  - matching `min-height` / `max-height`
- `GameLandingExperience.tsx` Category Blitz wrappers now use:
  - `h-[var(--cbz-layout-height,100lvh)]`
  - matching `min-height` / `max-height`
  - `bg-slate-950`
- Added `data-category-blitz-route-shell` to the route wrapper.
- Added `data-category-blitz-game-root` to Category Blitz roots.
- Debug panel now reports:
  - app shell rect
  - main rect
  - route wrapper rect
  - game root rect
  - game surface rect
  - answer list rect
- Hidden keyboard proxy changed from `h-px w-px` to:
  - `h-11`
  - `w-[calc(100vw-2rem)]`
  - `text-base`
  - `caret-transparent`
  - fixed near the top safe area

Result:

- Local verification passed:
  - `npx vitest run tests/category-blitz-mobile-shell-contract.test.ts`
  - `npx tsc --noEmit`
  - `npm run lint`
- Commit was pushed to `billing-guard-and-discounts`.
- User tested on real mobile device and reported this also failed.
- The magenta background gap is still present.

What this rules out:

- The issue is probably not caused only by `visualViewport.offsetTop`.
- The issue is probably not caused only by a parent wrapper still using `100svh`.
- The issue is probably not caused only by the keyboard proxy being a 1px input.
- The current "fixed full-height root plus hidden proxy input" strategy may be fundamentally fighting iOS Safari's keyboard model.

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
- `html/body` are locked to `var(--cbz-layout-height, 100lvh)` and `overflow: hidden`.
- A hidden fixed input receives keyboard focus.
- Visible answer rows are buttons, not inputs.
- The answer list is the only intended scroll container.

Despite this, iOS still shows the magenta background gap after `cbz-locked-layout-v6`.

Current untested follow-up:

- `cbz-keyboard-mode-v7` changes the strategy from hidden keyboard proxy to deliberate keyboard mode.
- The active answer is edited in a normal pinned native input above the keyboard.
- A fixed slate keyboard shield covers the lower page while editing so parent/background layers cannot show through.

## Strong Suspicions / Next Debugging Targets

### 1. The magenta gap may be from a layer outside the Category Blitz fixed root

`GameLandingExperience.tsx` and `AppShell.tsx` still provide route-level wrappers around Category Blitz. The magenta may be the game landing background or page background showing after a child frame shrinks/moves.

Important: v6 already gave the known Category Blitz wrappers `--cbz-layout-height`, so if the gap remains, the visible magenta may come from:

- the fixed `playingBackgroundClassName` layer in `GameLandingExperience.tsx`
- the `GAME_CARD_BG_BY_KEY["category-blitz"]` background
- the route still rendering the previous background behind the fixed root
- a browser compositing issue where the fixed child is clipped by an ancestor despite CSS height locks

Next experiment:

- Temporarily remove or neutralize the Category Blitz fixed magenta background layer while testing.
- Set the route shell, page shell, game root, answering screen, and answer list to clearly different solid debug colors.
- Use a `?cbzDebug=1` real-device screenshot to identify which exact layer is visible in the gap.
- Consider rendering Category Blitz through a top-level portal into `document.body`, outside `GameLandingExperience` and `PageShell`, while gameplay is active.

### 2. The current hidden input strategy may still let iOS Safari reserve/pan viewport space

Even after v6 made the proxy input normal-sized and invisible, the gap remained.

This suggests the issue may be caused by iOS Safari's handling of any focused text-editing element inside a browser page, not by the exact proxy dimensions.

Next experiments:

- Replace the invisible `<input>` proxy with a `contentEditable` keyboard receiver.
- Alternatively, use visible native inputs again but place the entire game inside a keyboard-aware `visualViewport` layout that intentionally resizes only the answer list.
- Test whether iOS still creates the magenta gap if the keyboard opens from a simple standalone fixed input page with the same parent wrappers. This can isolate app shell vs. Category Blitz logic.

### 3. A bottom sheet / keyboard-mode layout may be more reliable than fighting the keyboard

The previous attempts tried to keep the whole game visually fixed while the iOS keyboard opens. Safari may not allow that reliably in normal browser mode.

Next experiment:

- When an answer row is active and `visualViewport.height` drops, switch to a deliberate keyboard mode:
  - Header remains pinned at top.
  - Active answer row is pinned just above the keyboard/accessory area.
  - Other rows collapse or become an internal scroll list above the active row.
  - The magenta/background gap is covered by a fixed solid game-colored panel.
- This would be an intentional mobile keyboard layout instead of trying to preserve the exact no-keyboard layout.

### 4. Fullscreen/PWA install mode may be the only way to fully avoid browser chrome behavior

If the product requirement is literally "app feel" with no Safari keyboard/browser chrome effects, normal Safari tabs may continue to fight the layout.

Next experiment:

- Test the route as an iOS Home Screen web app with `viewport-fit=cover` and standalone display.
- This may not be acceptable as the only solution, but it helps determine whether Safari tab chrome is the main source of the gap.

### 5. The URL/accessory bar may be the visual gap, not the web page

The supplied screenshot shows a Safari URL/accessory area above the keyboard. Some of the visible magenta may be browser-controlled space or the page background exposed behind Safari's accessory controls.

Next experiment:

- In a debug build, set `html`, `body`, `AppShell`, route shell, and Category Blitz root all to the same dark `slate-950` while preserving gameplay content.
- If the magenta disappears but layout is still compressed, the problem is background bleed rather than content positioning.
- If a dark gap remains, the issue is keyboard obstruction/compression rather than magenta background specifically.

## Updated Recommended Next Agent Plan

The prior viewport-lock plan has already been executed and failed as `12bab8c` / `cbz-locked-layout-v6`. Do not repeat it.

The current untested attempt is `cbz-keyboard-mode-v7`. Test that first.

### Phase 1: Get a new debug screenshot from the v7 build

Use the live URL with `?cbzDebug=1`, tap the first answer, and screenshot with the keyboard open.

Record:

- `v`, should be `cbz-keyboard-mode-v7`
- `active`, should be `input:keyboard-proxy`
- `proxy`, should be `1`
- `rowInputs`, should be `0`
- `scrollY`
- `innerH`
- `vvH`
- `vvTop`
- `frame`
- `shell`
- `main`
- `route`
- `root`
- `game`
- `list`

This is now essential. Without the debug values, future attempts are guessing.

If v7 succeeds, the likely root cause was the old hidden-proxy input combined with inadequate lower-page shielding.

If v7 fails, continue below.

### Phase 2: Identify the visible magenta layer

Make a temporary diagnostic branch or local patch:

- Set `html/body` background to black only while `tp-category-blitz-game-active`.
- Set `GameLandingExperience` Category Blitz route shell background to red.
- Set the fixed playing background layer to blue or hide it.
- Set `CategoryBlitzGame` root background to green.
- Set `AnsweringScreen` root background to slate/black.

Ask Andrew for one more keyboard-open screenshot.

Outcome:

- If the gap is red/blue/magenta, the parent/background layer is exposed.
- If the gap is green/black but content is missing, the root covers the gap but internal layout is compressed/clipped.
- If browser accessory controls cover everything regardless of colors, the issue may be browser UI rather than DOM background.

### Phase 3: Try a body-level portal for gameplay

If parent/background layers are exposed:

- Render active Category Blitz gameplay through `createPortal(..., document.body)`.
- Keep the normal route wrapper mounted only as a placeholder.
- Portal root should be:
  - `position: fixed`
  - `inset: 0`
  - `height: var(--cbz-layout-height, 100lvh)`
  - `background: slate-950`
  - `z-index` above app shell and route backgrounds

This tests whether ancestor clipping/compositing is the cause.

### Phase 4: Try a deliberate keyboard-mode layout

If the portal still fails:

- Stop trying to keep all rows visible in the same layout.
- On keyboard open, use `visualViewport.height` as the available content height.
- Keep the header visible.
- Pin the active answer row in a fixed strip above the keyboard.
- Scroll/collapse the remaining rows within the available top area.
- Cover the entire area behind the keyboard accessory zone with a solid game background.

### Phase 5: Replace the proxy input only after layout layers are identified

If the debug colors prove the DOM layers are stable but Safari still pans/compresses:

- Test a `contentEditable` proxy.
- Test a single visible native input in a pinned keyboard strip.
- Compare both on real iPhone Safari.

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

Confirmed after push:

- Andrew tested `cbz-locked-layout-v6` on a real mobile device and the magenta gap still appeared.
- The next required evidence is a `?cbzDebug=1` screenshot from the v7 build, with the debug panel visible while the keyboard is open.

## Current Follow-Up Attempt: `cbz-keyboard-mode-v7`

This pass changes the core strategy.

Files changed:

- `components/category-blitz/CategoryBlitzGame.tsx`
- `tests/category-blitz-mobile-shell-contract.test.ts`
- this handoff doc

What changed:

- Added `useCategoryBlitzKeyboardState()`.
- Tracks keyboard-open state from `visualViewport`.
- Writes:
  - `--cbz-keyboard-inset`
  - `--cbz-visual-height`
- Replaced the hidden/invisible proxy input behavior with a normal pinned native input.
- The pinned editor is marked with `data-category-blitz-pinned-editor`.
- The input is still the only native text input and is marked with `data-category-blitz-keyboard-input`.
- The answer rows remain buttons/display controls; there are still no native inputs inside the answer list.
- Added a fixed lower-page shield marked `data-category-blitz-keyboard-shield`.
- The shield height is `calc(var(--cbz-keyboard-inset,0px)+8rem)` and uses `bg-slate-950`.
- The pinned editor sits above the keyboard using:
  - `bottom-[calc(var(--cbz-keyboard-inset,0px)+max(env(safe-area-inset-bottom),0.75rem))]`
- Debug marker changed to `cbz-keyboard-mode-v7`.
- Debug now reports:
  - `pinnedEditorRect`
  - `keyboardShieldRect`

Why:

- The previous fixed-root/hidden-proxy strategy kept failing on real iOS Safari.
- v7 gives Safari a normal focused input in a visible, stable place and covers the area where magenta previously leaked through.

Verification completed locally:

- `npx vitest run tests/category-blitz-mobile-shell-contract.test.ts`
- `npx tsc --noEmit`
- `npm run lint`

Still needed before trusting it:

- Commit/push
- Real iPhone Safari test
