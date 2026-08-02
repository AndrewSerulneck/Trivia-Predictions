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

## Latest Pass: `cbz-portal-visual-frame-v8`

This pass follows the recommendations from the 5.6 Sol review and intentionally abandons the v6/v7 "preserve the keyboard-closed height and lift an editor above the keyboard" strategy.

Architectural changes:

- Active Category Blitz gameplay now renders through a React body-level portal (`createPortal(content, document.body)`), while the normal route wrapper remains a dark inert host.
- The game root is sized to the current `visualViewport`, not the largest observed/keyboard-closed viewport:
  - `--cbz-visible-left`
  - `--cbz-visible-top`
  - `--cbz-visible-width`
  - `--cbz-visible-height`
- The old `--cbz-layout-height` and `--cbz-keyboard-inset` approach was removed from active gameplay.
- The fixed pinned editor and keyboard shield were removed.
- Answer rows remain buttons/display rows. There is still only one native text input, but it now lives in normal CSS grid flow as the final row of the answering screen.
- The answering screen uses a grid shape:
  - invite/status row
  - header/timer row
  - internally scrollable answers row
  - normal-flow editor row
- Category Blitz active route backgrounds are forced to slate/dark so the magenta branded layer should not be visible underneath gameplay if Safari pans or composites the viewport.
- `html/body.tp-category-blitz-game-active` now lock scrolling and paint a dark background, but no longer lock their height to `--cbz-layout-height`.

Expected real-device behavior:

- With the keyboard open, the Category Blitz root should shrink to the visible viewport instead of preserving the full pre-keyboard layout.
- The editor should remain visible as the bottom row of the game grid.
- The answer list should be the only scrolling gameplay region.
- No magenta band should appear above the keyboard.

Debug marker:

- `cbz-portal-visual-frame-v8`

Recommended test URL:

- Add `?cbzDebug=1` while testing on iPhone Safari.

Useful debug expectations:

- `rootRect` height should be close to `visualViewport.height` while the keyboard is open.
- `editorRect` should be inside `rootRect`.
- `scrollY` should stay near `0`.
- `editorInputs` should be `1`.
- `rowInputs` should be `0`.
- `bodyBackground` and `shellBackground` should be dark, not magenta.

## Important Current Behavior To Inspect

In `CategoryBlitzGame.tsx`, current architecture is now:

- Active gameplay renders through a body-level portal.
- Top-level Category Blitz root is `fixed` and sized by current `visualViewport` variables.
- `html` and `body` get `tp-category-blitz-game-active` while the game is mounted.
- `html/body` are scroll-locked and painted dark, but are not height-locked to the keyboard-closed viewport.
- Visible answer rows are buttons, not inputs.
- One normal-flow editor input receives text entry.
- The answer list is the only intended scroll container.

## If `cbz-portal-visual-frame-v8` Still Fails

Ask for a real iPhone Safari screenshot with `?cbzDebug=1` and keyboard open. The most important values are:

- `v`: should be `cbz-portal-visual-frame-v8`
- `active`: should be `input:editor-input`
- `editorInputs`: should be `1`
- `rowInputs`: should be `0`
- `scrollY`
- `innerH`
- visual viewport size and offsets
- `frame`
- `route`
- `root`
- `editor`
- `list`
- `bodyBackground`
- `shellBackground`

Interpretation:

- If `rootRect` is not close to the visual viewport height, the viewport-frame hook is not matching iOS Safari's live viewport values.
- If `rootRect` is correct but `editorRect` sits below it, the grid/editor sizing is wrong.
- If `rootRect` and `editorRect` are correct but magenta still appears, another fixed layer above or outside the portal is painting over the game.
- If all web layers report dark backgrounds and magenta still appears, the visible band may be Safari accessory/browser UI using the page theme color or a cached screenshot layer.

## Guardrails

- Do not restore `--cbz-layout-height` for active gameplay.
- Do not restore the fixed pinned editor or keyboard shield without a separate throwaway experiment.
- Do not bring back native inputs inside the answer rows.
- Do not show the legal footer on any game route.
- Do not use page-level scrolling to keep answers visible.
- Keep scrolling confined to the answer list.
- Do not stage/commit unrelated billing/docs/assets work currently dirty in the worktree.
