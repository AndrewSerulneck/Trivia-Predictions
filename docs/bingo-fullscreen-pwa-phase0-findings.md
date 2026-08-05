# Phase 0 findings — where the pixels actually go (Bingo landscape)

**Status:** measurement only, 2026-08-04. No product code changed.
**Method:** derived from the CSS and JSX cascade, not from a browser. Per
`docs/bingo-fullscreen-pwa-plan.md` §4 no headless run was made; a headless browser has no
browser chrome, so it cannot measure the quantity in question. Numbers marked *(device)* are
the ones this phase could not derive and that Phase 6 must measure on a real phone.

## Reference viewport

iPhone-class notched device, iOS Safari, landscape, **844 × 390 CSS px**.

- `rem = 16px`. The `html { font-size: 14px/13px }` overrides in `app/globals.css:855` and
  `:1418` key off `max-width: 430px/380px`, so they apply in **portrait only**. Every `rem`
  below therefore resolves at 16px, and the same CSS yields *different* pixel budgets in the
  two orientations.
- `isLandscapeGameView` is true — `(orientation: landscape) and (max-height: 560px)`
  (`SportsBingoHome.tsx:946`).
- The `@media (orientation: landscape) and (max-height: 430px)` compaction block
  (`globals.css:350`) **applies**. The `max-width: 700px` and `600px` blocks (`:450`, `:473`)
  do **not** (844 > 700).

## 1. The landscape shell already covers all app chrome — but one thing outranks it

`SportsBingoHome.tsx:2211` renders the landscape view through
`createPortal(landscapeContent, document.body)` as a `position: fixed; z-[1300]` element sized
from `visualViewport` (`:962-1000`). So the surrounding chrome costs **zero painted pixels**:

| Chrome | Mounted in landscape? | Painted cost | Note |
|---|---|---|---|
| `MobileBottomNav` | **Never — not imported anywhere in the repo** | 0 | dead component; not in `app/layout.tsx` |
| `PageShell` compact header (`z-[1000]`) | **Not rendered.** `/bingo` passes `playingHidesShellNav`, so `showUserStatus`/`showPageTitle` are false → `hasCompactHeaderContent` false → header *and* spacer both skipped (`PageShell.tsx:59-91`) | 0 | |
| `AppShell` | Mounted; `/bingo` is a `GAME_SCREEN_PATH` → `main` gets `flex-1 pb-24` (`AppShell.tsx:81`) | 0 painted | the 96px `pb-24` still lengthens the document; irrelevant while the scroll lock holds |
| `AnimationOverlay` `z-[1200]` | mounted | 0 | below the shell |
| **`MobileAdhesionAd` `z-[1600]`** | mounted, `md:hidden` | **0 on most phones; ~72–80px overlaying the bottom of the board on SE-class** | see below |
| `PopupAds` `z-[5000]`, `GlobalTransitionOverlay` `z-[6500]` | transient | full-screen when shown | by design, not persistent chrome |

**The adhesion-ad exception.** `MobileAdhesionAd` is `fixed inset-x-0 bottom-0 z-[1600]`
(`MobileAdhesionAd.tsx:357`) — **above** the shell's `z-[1300]` — and its only route exclusion
is `/category-blitz` (`:42`). It is hidden by `md:hidden` at ≥768px, and Tailwind's default
`md` breakpoint is unchanged in `tailwind.config.ts`. Current iPhone landscape widths (812–956)
are all ≥768, so it is hidden there. **iPhone SE / 8 land at 667px wide in landscape, where it
renders on top of the board** (`AdBanner` adhesion image is `max-h-[64px]` plus safe-area
padding). Phase 1 should exclude `/bingo` from the adhesion ad while `isLandscapeGameView`, or
accept a covered board on small phones.

## 2. Vertical pixel budget, top of display → board → bottom of display

`H` = `visualViewport.height` = the shell's height (`--bingo-landscape-vh`). The shell is
pinned to the visual viewport, which on iOS Safari already excludes browser chrome — so
`390 − H` is exactly the browser's take.

| # | Band | Height (px) | Drawn by | Owner | Reclaimable |
|---|---|---|---|---|---|
| 1 | Safari top chrome | 0 *(device)* | Safari (iPhone landscape puts its controls at the bottom) | browser | — |
| 2 | shell `padding-top` | 5.6 (`max(env(safe-area-inset-top), 0.35rem)`; top inset is 0 in landscape *(device)*) | `globals.css:353` | app | yes, ~5.6 |
| 3 | header row | **42.2** on iPhone / 49.2 where the fullscreen button renders | `SportsBingoHome.tsx:2029`, `globals.css:357-388` | app | **yes, all of it** |
| 4 | grid row-gap | 6.4 (`0.4rem`) | `globals.css:352` | app | yes, with #3 |
| 5 | **board stage** | `H − 77.6` (`max-height: calc(vh − 4.85rem)`) | `globals.css:394` | payload | — |
| 6 | shell `padding-bottom` | **21** (`max(env(safe-area-inset-bottom), 0.35rem)`; home indicator *(device)*) | `globals.css:354` | app | **yes in Safari** — see below; load-bearing in fullscreen/standalone |
| 7 | Safari bottom toolbar | `390 − H`, est. **40–56** *(device)* | Safari | browser | only via URL-bar collapse (§4) or Layer B/C |

Header height derivation (#3): border 1px×2 + padding `0.35rem`×2 (11.2) + content, where
content = `max(text block, controls)`. Text block = 10px eyebrow (`leading-none`) + 4px `mt-1`
+ 15px `h1` (`globals.css:362`, `line-height: 1`) = 29. Controls = 1.8rem (28.8) pills, or
2.25rem (36) when the fullscreen button renders. On iPhone the button does not render (§5), so
29 wins → **42.2px**.

The app's own `4.85rem` (77.6px) clamp matches the measured 75.2px of app chrome to within
2px, which confirms the board is **height-bound**, not width-bound.

**Band 6 is double-paid in Safari.** `env(safe-area-inset-bottom)` reserves the home-indicator
strip against the *physical display*, but the shell is already inset above Safari's own bottom
toolbar, which covers that strip. Those 21px buy nothing in Safari. They become genuinely
load-bearing the moment the app is fullscreen or standalone — so this must be made conditional,
not deleted.

### Inside the board (all app-owned, all inside band 5)

At `H = 340` (Safari toolbar ≈ 50px) the board is `340 − 77.6 = 262.4px` square (the width cap,
`calc(vw − 16rem)` = 588px, is nowhere near binding).

| Band | px | Source |
|---|---|---|
| border `2px` × 2 | 4 | `SportsBingoHome.tsx:714` |
| padding `0.4rem` × 2 | 12.8 | `globals.css:406` |
| B-I-N-G-O letters row (`text-lg`, `leading-none`) | 18 | `:716` |
| letters `margin-bottom` | 4.8 | `globals.css:410` |
| 4 × `gap-1.5` row gaps | 24 | `:726` |
| **25 squares** | **39.8 tall × 44.3 wide each** | remainder |

**63.6px — 24% of the board — is board chrome, not squares.** Each square then spends `py-1` +
1px border, leaving ~30 × 34px of text box for an **8px** font
(`globals.css:414`) with `line-clamp-3` and a 16-character `shortenLabel` cap. That is the
reported "prop text too small to read," quantified.

## 3. Horizontal budget — the layout is height-starved and width-rich

`844 = 44 (left inset) + 36 (arrow) + 6.4 + [1fr] + 6.4 + ~164 (aside) + 6.4 + 36 (arrow) + 44
(right inset)` → the 1fr centre column is **~500px wide** while the square board only uses
**262px**. There is roughly **240px of horizontal slack**.

Widening cannot help a 5×5 square board directly. What the slack *is* good for is **hosting the
header's contents**, which is what makes reclamation #1 below cheap rather than a trade-off.
(Landscape `safe-area-inset-left/right` values are *(device)*; the slack conclusion holds at
either 0 or 44px per side.)

## 4. The URL-bar collapse lever

**(a) Is the scroll lock plausibly why the bar never collapses? Yes, twice over.**
`globals.css:250-257` puts `overflow: hidden !important` **and** `touch-action: none !important`
on `html`/`body` while `tp-bingo-landscape-active` is set (`SportsBingoHome.tsx:1663`). iOS
Safari collapses its toolbar in response to a user scroll gesture on a scrollable document.
Here (i) the document has no scrollable overflow, and (ii) `touch-action: none` means Safari
never even interprets the drag as a pan. Note the shell's own `touch-action: pan-x`
(`globals.css:318`) is inert: the effective touch-action is the intersection down the DOM
ancestor chain, and `body`'s `none` wins. The shell's board-swipe still works because it is
implemented with JS `touchstart`/`touchend` handlers, which `touch-action` does not block.

**(b) What a minimal sliver technique looks like against this specific CSS.** Add a
landscape-scoped variant of the lock that keeps `overscroll-behavior: none !important` but
relaxes to `overflow-y: auto` + `touch-action: pan-y` on `html`/`body`, gives the document ~1px
of extra scroll height, and then — from inside a real user gesture, not `orientationchange` —
scrolls by 1px. Programmatic `scrollTo` alone does not collapse the toolbar on modern iOS; it
must ride a user gesture, which makes this the same trigger Phase 2 already needs. No layout
work is required to *use* the reclaimed space: the measurement effect
(`SportsBingoHome.tsx:962`) listens to `visualViewport` `resize`/`scroll`, so the shell grows
into a collapsed toolbar on its own.

**(c) Risks.**
1. Re-opening rubber-banding, which this lock exists to stop. Removing it wholesale is off the
   table; any change must be landscape-scoped and keep `overscroll-behavior: none`.
2. **`ScrollRescueGuard` becomes hostile.** It is global with no route exclusion
   (`components/ui/ScrollRescueGuard.tsx:236-242`, capture-phase `wheel`/`touchmove`). Bingo
   landscape does **not** register with `lib/scrollLock.ts`, so `hasActiveScrollLocks()` is
   false and the guard's early-outs never fire. On a stalled vertical drag it calls
   `hardRecoverDocumentScroll()` (`lib/scrollLock.ts:201`), which writes inline
   `overflowY: auto` and `touchAction: manipulation` onto `html`/`body`, then `window.scrollBy`s.
   **Today this is harmless only because the `!important` in `tp-bingo-landscape-active` outranks
   an inline declaration.** Any Phase 1/2 change that drops that `!important` or relaxes those
   properties hands control of the lock to this guard. Treat it as a tripwire.
3. The shell chases `visualViewport.offsetTop` during the collapse animation; expect a frame or
   two of jitter mid-gesture.
4. Yield is uncertain and *(device)*-dependent — even fully collapsed, iOS Safari keeps a
   toolbar sliver in landscape. Contrast with reclamations #1/#2, which are deterministic.

## 5. The iOS/Android split, from the code

`isFullscreenAvailable()` (`SportsBingoHome.tsx:142`) returns true if any of
`document.fullscreenEnabled`, `document.webkitFullscreenEnabled`,
`element.requestFullscreen`, `element.webkitRequestFullscreen` is truthy. On **iPhone Safari**
all four are falsy — the unprefixed API is absent, `webkitFullscreenEnabled` is `false`, and
`webkitRequestFullscreen` exists on `HTMLVideoElement` only, never on the shell's `HTMLElement`.
iPad Safari and Android Chrome have the unprefixed API. *(device: confirm in Phase 6.)*

Therefore, where the fullscreen button would be, **an iPhone player sees no button at all**
(`:2069` is gated on `isFullscreenSupported`) and instead gets a dead grey pill reading
**"Fullscreen unavailable in this browser."** (`:2087`, message from `:2014`). That pill is
`display: none` only at `max-width: 700px` (`globals.css:468`) — so it is **hidden on SE-class
phones and shown on every modern iPhone**, which is exactly backwards from useful. It should be
suppressed when the API is known-absent rather than advertised.

## 6. Recommendation to Phase 1

**The app is eating more of the landscape screen than Safari is.** App-owned chrome inside the
shell is **75.2px** of the 390px display (19%); Safari's take is an estimated 40–56px (10–14%).
That answers the question this phase existed to ask: **Phase 1 is the cure and the PWA track is
upside**, and the conclusion is robust — it holds even if the on-device toolbar measures 90px.

Highest-yield reclamations, in order:

1. **Delete the header row (bands 3+4, ≈49px).** Relocate the board counter, Active/Scored
   tabs and status pill into the ~240px of unused horizontal slack (§3) — the right-hand aside
   or the arrow columns. This is the single largest app-owned band and the width to absorb it
   already exists. Drop the "Fullscreen unavailable" pill entirely (§5).
2. **Make the bottom safe-area inset conditional (band 6, 21px).** Pay it only when actually
   fullscreen or standalone; in Safari it sits behind Safari's own toolbar.
3. **Trim the board's internal chrome (≈17px of the 63.6px).** The B-I-N-G-O letters row costs
   22.8px with its margin, and the four 6px row gaps cost 24px — 18% of the board between them.

Together #1–#3 grow each square from **39.8 × 44.3px to roughly 58 × 60px (+38% linear)** at an
unchanged `H = 340`, which supports raising the square font from 8px toward 11px and relaxing
`shortenLabel`'s 16-character cap. If Layers B/C later remove the browser toolbar as well
(`H = 390`), squares reach ~65–69px — but note that Phase 1 alone delivers the larger share of
that.

Two cheap cleanups Phase 1 can fold in: `globals.css:321-324`
(`.tp-game-page .tp-page-main .tp-bingo-landscape-shell .text-*`) is **dead** — the shell
portals to `document.body`, outside `.tp-page-main`, so neither those rules nor the
`.tp-game-page .tp-page-main .text-*` inflation they were written to undo can match. Their
values are Tailwind's defaults, so deleting them changes nothing. Likewise
`tp-bingo-screen-shake` (`SportsBingoHome.tsx:2024`, `:2226`) is defined nowhere in the repo.
