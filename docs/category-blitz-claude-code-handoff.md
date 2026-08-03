# Category Blitz iOS Keyboard Handoff For Claude Code

## Read First

Project rules are in `CLAUDE.md` and `SYSTEM_CONTEXT.md`. Do not touch `.env.local`. Existing unrelated billing/ad work may be dirty in this worktree; stage or commit only Category Blitz files if asked.

This doc is for the unresolved Category Blitz mobile Safari keyboard bug. The most recent attempted fix was committed and pushed as:

- `356fefd Rework Category Blitz mobile keyboard layout`
- Branch: `billing-guard-and-discounts`

Andrew tested that pass on a real mobile device and reported that it still did not work.

## The Bug

On iPhone Safari, when a player taps an answer field in Category Blitz and the soft keyboard opens:

- A large magenta background gap appears above the keyboard.
- Much of the answer area becomes disrupted, pushed, or blocked.
- The game stops feeling like a fixed app surface.
- The user wants the keyboard to be usable without disturbing the rest of the page.

Earlier screenshot reference:

- `/Users/andrewserulneck/Downloads/Hightop Challenge 6.png`

The screenshot showed:

- Category Blitz answer rows visible only in the upper part of the screen.
- A magenta band between the game content and keyboard/accessory area.
- Safari keyboard and URL/accessory controls visible.

## Product Requirement

- Category Blitz gameplay should behave like an app screen.
- Game content should not reveal the venue/game background when the keyboard opens.
- The legal footer beginning "Use of this platform is restricted..." must never be visible inside games.
- The legal footer should only appear on the Venue Home Page after scrolling to the bottom.
- The answer list can scroll internally, but the page itself should not scroll during gameplay.

## Current Relevant Files

- `components/category-blitz/CategoryBlitzGame.tsx`
- `components/venue/GameLandingExperience.tsx`
- `components/ui/AppShell.tsx`
- `app/globals.css`
- `tests/category-blitz-mobile-shell-contract.test.ts`
- `docs/category-blitz-mobile-keyboard-handoff.md`

## Current Code State After `356fefd`

`components/category-blitz/CategoryBlitzGame.tsx`:

- Debug marker: `cbz-portal-visual-frame-v8`
- Imports `createPortal` from `react-dom`.
- Active gameplay is rendered with `createPortal(content, document.body)`.
- Root class is `VIEWPORT_FRAME_CLASS`, currently:
  - `fixed`
  - `z-[100]`
  - `[left:var(--cbz-visible-left,0px)]`
  - `[top:var(--cbz-visible-top,0px)]`
  - `h-[var(--cbz-visible-height,100svh)]`
  - `w-[var(--cbz-visible-width,100vw)]`
  - `overflow-hidden`
  - `bg-slate-950`
- `useCategoryBlitzVisibleViewportFrame()` writes:
  - `--cbz-visible-left`
  - `--cbz-visible-top`
  - `--cbz-visible-width`
  - `--cbz-visible-height`
- The old `--cbz-layout-height` and `--cbz-keyboard-inset` runtime strategy is removed.
- Answer rows are buttons/display rows, not native inputs.
- There is one native input, marked `data-category-blitz-editor-input`.
- The editor sits in normal CSS grid flow, marked `data-category-blitz-editor`.
- Answering screen grid:
  - invite/status row
  - header/timer row
  - scrollable answer-list row
  - editor row

`components/venue/GameLandingExperience.tsx`:

- Category Blitz active gameplay route shell is now dark/inert.
- While Category Blitz is playing, the fixed route background layer uses `bg-slate-950` instead of the magenta/branded game background.
- The Category Blitz play wrapper uses `h-[100svh]`, `max-h-[100svh]`, `overflow-hidden`, `bg-slate-950`.

`app/globals.css`:

- `html.tp-category-blitz-game-active, body.tp-category-blitz-game-active`:
  - `width: 100%`
  - `height: 100%`
  - `min-height: 100%`
  - `overflow: hidden`
  - `overscroll-behavior: none`
  - `background-color: #020617`
  - `background-image: none`
- `body.tp-category-blitz-game-active`:
  - `position: fixed`
  - `inset: 0`

`components/ui/AppShell.tsx`:

- `/category-blitz` is already in fullscreen/game route lists.
- Legal notice only renders on exact venue home routes:
  - `const isVenueHome = /^\/venue\/[^/]+\/?$/.test(pathname ?? "");`
  - `const showLegalNotice = !isAdmin && isVenueHome;`

## Attempted Fixes So Far

### 1. Fullscreen Shell + Footer Removal

Commit:

- `35115fc Fix Category Blitz mobile shell`

Intent:

- Treat `/category-blitz` as a fullscreen game route.
- Remove shell padding/footer behavior from game routes.
- Hide the legal notice footer outside Venue Home.
- Lock `html/body` while Category Blitz gameplay is mounted.
- Add internal answer-list scrolling.

Implementation:

- Added `/category-blitz` to fullscreen/game paths in `AppShell.tsx`.
- Changed legal notice to exact venue-home only.
- Added `tp-category-blitz-game-active` classes on gameplay mount.
- Locked `html/body` to `100svh` with `overflow: hidden`.

Result:

- Legal footer problem appears solved.
- iOS keyboard layout/gap persisted.

### 2. Single Hidden Keyboard Proxy

Commit:

- `d266798 Stabilize Category Blitz mobile keyboard`

Intent:

- Remove native inputs from all 12 answer rows.
- Stop Safari from panning the page to reveal focused row inputs.
- Use one hidden fixed input as the keyboard receiver.

Implementation:

- Answer rows became buttons.
- Added one hidden fixed input marked `data-category-blitz-keyboard-input`.
- Tapping a row focused that input with `focus({ preventScroll: true })`.
- Input changes updated the active answer row.
- Answer list used internal `scrollBy`, not page `scrollIntoView`.

Result:

- Still failed on real iPhone Safari.

### 3. VisualViewport Diagnostics + Stable Frame

Commit:

- `fe95f72 Harden Category Blitz mobile keyboard layout`

Intent:

- Add real-device diagnostics.
- Track iOS `visualViewport`.
- Avoid Safari panning before focus.
- Keep game frame from shrinking to keyboard-reduced viewport height.

Implementation:

- Added debug panel enabled by `?cbzDebug=1`.
- Debug marker: `cbz-stable-frame-v5`.
- Root was fixed and sized by visual viewport vars:
  - `--cbz-vv-top`
  - `--cbz-vv-left`
  - `--cbz-vv-height`
  - `--cbz-vv-width`
  - stable height/width variants
- Then changed height behavior to preserve largest stable height.
- Focus happened from `onPointerDown` with `event.preventDefault()`.

Result:

- Still failed on real iPhone Safari.

### 4. Locked Keyboard-Closed Layout Height

Commit:

- `12bab8c Lock Category Blitz mobile keyboard layout`

Intent:

- Stop using `visualViewport.offsetTop`.
- Use one app-controlled locked height.
- Make parent wrappers share the same locked height.
- Make hidden proxy input normal-sized instead of 1px.

Implementation:

- Debug marker: `cbz-locked-layout-v6`.
- Root class became fixed `inset-x-0 top-0`.
- Root height: `h-[var(--cbz-layout-height,100lvh)]`.
- `useCategoryBlitzViewportFrame()` wrote `--cbz-layout-height`.
- `html/body` and `GameLandingExperience` wrappers also used `--cbz-layout-height`.
- Hidden keyboard proxy became normal-sized but invisible.

Result:

- Still failed on real iPhone Safari.

What this likely rules out:

- Not only a bad `visualViewport.offsetTop`.
- Not only parent wrappers still using `100svh`.
- Not only the proxy input being 1px.

### 5. Normal Pinned Editor + Keyboard Shield

Commit:

- `1f2c687 Add Category Blitz keyboard mode editor`

Intent:

- Give Safari a real visible input rather than a hidden proxy.
- Pin the editor above the keyboard.
- Cover the lower page with a dark shield so magenta cannot leak through.

Implementation:

- Debug marker: `cbz-keyboard-mode-v7`.
- Added `useCategoryBlitzKeyboardState()`.
- Wrote:
  - `--cbz-keyboard-inset`
  - `--cbz-visual-height`
- Added fixed editor marked `data-category-blitz-pinned-editor`.
- Added fixed dark shield marked `data-category-blitz-keyboard-shield`.
- Editor bottom used:
  - `bottom-[calc(var(--cbz-keyboard-inset,0px)+max(env(safe-area-inset-bottom),0.75rem))]`
- Answer rows remained buttons.

Result:

- Still failed on real iPhone Safari.

### 6. Body Portal + Current VisualViewport Frame

Commit:

- `356fefd Rework Category Blitz mobile keyboard layout`

Intent:

- Follow the 5.6 Sol recommendation:
  - Body-level portal.
  - One normal visible native input.
  - Visual-viewport-sized interaction frame.
  - CSS grid with scrollable answers and editor row.
  - Uniform dark background underneath everything.
- Stop preserving the keyboard-closed layout behind the keyboard.

Implementation:

- Debug marker: `cbz-portal-visual-frame-v8`.
- Rendered active game root into `document.body`.
- Root now uses live `visualViewport.height`, not largest stable height.
- Removed `--cbz-layout-height`.
- Removed `--cbz-keyboard-inset`.
- Removed pinned editor.
- Removed keyboard shield.
- Editor is normal-flow grid row.
- Category Blitz active route shell/background forced to slate/dark.

Verification before push:

- `npx vitest run tests/category-blitz-mobile-shell-contract.test.ts`
- `npx tsc --noEmit`
- `npm run lint`
- `git diff --check`

Result:

- Andrew tested on real mobile device and reported it still did not work.

## Important Suspicions Now

At this point, repeated CSS/viewport/focus strategies have failed. Claude Code should consider possibilities outside the exact answer-editor implementation.

### A. The magenta may be browser-controlled or theme-color related

If all DOM layers are dark but Safari still shows magenta, the band may be:

- Safari accessory/browser UI area using a page theme color.
- A cached/composited snapshot layer.
- A viewport/chrome area not actually part of the DOM.

Check:

- `app/layout.tsx` metadata/theme-color.
- Any `<meta name="theme-color">`.
- PWA/mobile web app manifest colors.
- Global CSS/background layers outside `AppShell`.

### B. There may be another fixed overlay still active

Search for fixed/bottom overlays that can appear during games:

- `components/ui/MobileAdhesionAd.tsx`
- `components/ui/PopupAds.tsx`
- `components/analytics/*`
- transition overlays in `components/ui` or `components/venue`
- any ad or legal/footer layer that uses `position: fixed`

The debug panel only reports selected layers. A different fixed sibling could still paint over or under the portal.

### C. `body { position: fixed }` may be causing a Safari-specific compositing failure

The current v8 still locks `body.tp-category-blitz-game-active` with:

- `position: fixed`
- `inset: 0`

On iOS Safari, fixed body plus focused input plus visual viewport resizing can behave badly. A possible next experiment is:

- Remove `body { position: fixed }` for Category Blitz.
- Instead set:
  - `html, body { overflow: hidden; background: #020617; }`
  - portal root fixed to visual viewport.
- Add a `touchmove` preventer only outside the answer list if needed.

### D. The route-level wrapper may still be participating despite the portal

React context crosses portals, but DOM layout does not. Still, the original route remains mounted under the portal:

- `GameLandingExperience`
- `PageShell`
- `data-venue-game-scroll`

If the route shell is still doing `h-[100svh]` and Safari changes what `svh` means during keyboard open, it may expose a background or affect compositing.

Possible experiment:

- When Category Blitz is active, render only a tiny dark placeholder in `GameLandingExperience`, not the whole `VenuePresenceBoundary` host with `h-[100svh]`.
- Or move the portal boundary above `GameLandingExperience`.

### E. The correct solution may be a dedicated route shell for Category Blitz

Category Blitz may need to bypass the generic game landing/onboarding shell during active play:

- `/category-blitz/play` could render a custom route-level fullscreen component.
- The tutorial/onboarding remains on Venue Home.
- Active game page avoids `GameLandingExperience`, `PageShell`, generic backgrounds, game transition wrappers, and route placeholders entirely.

This is likely the cleanest next architectural direction if v8 still fails.

## Recommended Next Steps For Claude Code

1. Reproduce with `?cbzDebug=1` on the exact live build if possible.
2. Ask Andrew for a keyboard-open screenshot that includes the debug panel.
3. Inspect whether the visible magenta is DOM-painted:
   - Temporarily set every possible DOM background to black/dark.
   - Also set `theme-color` and manifest colors to black/dark if present.
4. Test removing `body.tp-category-blitz-game-active { position: fixed }`.
5. Audit all fixed overlays and ad layers active on `/category-blitz/play`.
6. Consider building a dedicated Category Blitz active-play route shell that does not use `GameLandingExperience` or `PageShell`.
7. Keep the legal footer venue-home-only.
8. Keep answer rows as display controls unless deliberately running a throwaway test.

## Current Debug Checklist

Use `?cbzDebug=1`, tap an answer, and capture:

- Debug marker/version.
- `active`.
- `editorInputs`.
- `rowInputs`.
- `scrollY`.
- `innerH`.
- visual viewport size and offsets.
- `frame`.
- `route`.
- `root`.
- `editor`.
- `list`.
- `bodyBackground`.
- `shellBackground`.

Interpretation:

- If `rootRect` is not close to visual viewport height, the visual viewport hook is wrong.
- If `rootRect` is correct but `editorRect` is below it, CSS grid sizing is wrong.
- If web backgrounds are dark but magenta remains, inspect theme color/browser UI/cached compositing.
- If `scrollY` changes significantly, Safari is still page-panning despite the portal.

## Guardrails

- Do not repeat the old `--cbz-layout-height` strategy.
- Do not repeat the hidden input proxy strategy.
- Do not repeat the fixed pinned editor plus keyboard shield strategy without a deliberately isolated experiment.
- Do not show the legal footer in games.
- Do not stage unrelated billing/ad work.
