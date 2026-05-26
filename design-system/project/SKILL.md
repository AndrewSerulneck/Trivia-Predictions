---
name: hightop-challenge-design
description: Use this skill to generate well-branded interfaces and assets for Hightop Challenge, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping the venue-based trivia & sports prediction platform.
user-invocable: true
---

Read the README.md file within this skill first; it contains the full content
fundamentals, visual foundations, and iconography guidance. Then explore the
other available files:

- **`colors_and_type.css`** — single source of truth for every design token.
  Canvas/surface ladder, accent palettes, **page-level accents** (cyan home /
  amber leaderboard / blue activity / gold prizes / slate FAQs / rose danger),
  **five game color identities**, exit pill, type scale, radii, shadows,
  spacing, and the `tp-glow-pulse` animation. Import this from any HTML
  artifact.
- **`assets/`** — logo (`brand/hightop-logo.svg`), five game icon PNGs,
  player silhouette, checkmark. Copy these into your output; do not redraw.
- **`preview/`** — design-system specimen cards (type, colors, spacing,
  components, brand). The `colors-game-identities.html` card is the canonical
  spec for the five game identities; `component-live-round-break.html` and
  `component-live-postgame.html` are the round-break and post-game leaderboard
  specs that the live show MUST grow toward.
- **`ui_kits/web/`** — fully-built interactive prototype with **seven
  surfaces**: Join → Venue (3-tab swipable carousel) → Game Landing → Live
  Showdown → Bingo Board → Activity → Post-game. Reuse `components.jsx`
  primitives (`AccentCard`, `Button`, `ExitPill`, `StatusBadge`,
  `FeedbackBanner`, `GameTile`, `TopBar`, `VenueSwitcher`, `VenueCarousel`,
  `HamburgerDrawer`) and follow the patterns in `screens.jsx` and
  `more-screens.jsx` when building new player-facing screens.

## The 7-Point Brand Check

Apply this to every player-facing component you build. **All 7 must pass.**

```
□ Background is bg-slate-950 (page) or bg-slate-900 (card)?
□ Card border is 1px tinted at /30–/60 from the section's accent color?
□ Section label is uppercase tracking-[0.14em] font-black text-sm in accent-300?
□ All text on dark surfaces uses slate-50 / slate-300 / slate-400 (never slate-600)?
□ Primary button uses accent-500 bg with text-slate-950?
□ Back/exit uses .tp-exit-pill (warm red gradient pill)?
□ No white cards, no cream backgrounds, no comic drop shadows?
```

## Critical rules to remember while designing

1. **One dark canvas.** Every player-facing surface uses `--ht-canvas`
   (`#020617`). No cream, no white, no light-gray card backgrounds.
2. **The accent tells you where you are.** Cyan = home base / informational /
   focus / Live Trivia. Emerald = answering / success. Amber = countdowns /
   leaderboard / closest-guess. Fuchsia = answer reveal / intermission.
   Rose = error / wrong / danger. Blue = activity / career. Gold = prizes.
3. **The exit pill is the only warm element on screen** — warm-red gradient
   pill with the dark structural border. Never use rose for back/exit.
4. **Five game identities, each themed to its gameplay** (canonical hexes in
   `colors_and_type.css`):
   - Live Trivia = cyan→blue→violet broadcast gradient
   - Speed Trivia = electric yellow / lime racing stripes on near-black
   - Sports Bingo = casino felt green w/ gold trim and a **cool-ice sky-300
     border** (the cool border cuts cleanly against the warm exit pill on the
     same screen)
   - Pick 'Em = sportsbook ticket — diagonal navy-vs-magenta split with
     ticket-yellow accent
   - Fantasy = coach's chalkboard — deep forest with chalk grid + X/O play
5. **No legacy `.tp-comic-card` / cream gradient / 8px ink offset shadow.**
   No Kalam font on player-facing surfaces. No `.bg-stadium-turf` repeating
   green. These belong to the comic era and are dead. Keep `.tp-comic-card`
   only for admin-panel internal use.
6. **Mobile-first.** Design at phone widths (~390px content) before
   anything else. Tap targets ≥ 44px. Inputs ≥ 16px font-size on iOS
   (otherwise focus zooms the page).
7. **Venue navigation is 3 tabs** — Games / Leaderboard / Challenges — at the
   top of the venue page, with **swipable carousel** between them. Game
   selection inside the Games tab uses the iOS-style gradient tiles. No
   6-tab persistent bottom nav.
8. **Tone is short, second-person, imperative.** All-caps eyebrows with
   `letter-spacing: 0.14em`. Sentence-case body. No periods on rule
   bullets. Tabular numerals on every changing number.
9. **Iconography is Lucide** (2px stroke). Don't hand-roll SVGs; let Lucide
   choose unless brand assets (game icons, logo) are involved.

## How the accent gradients translate to Tailwind

```jsx
// Default dark card with accent border
<section className="bg-slate-900 border border-cyan-400/30 rounded-2xl p-4">
  <p className="text-sm font-black uppercase tracking-[0.14em] text-cyan-300">
    Section label
  </p>
  <h2 className="text-2xl font-black text-white mt-2">Card title</h2>
  <p className="text-slate-300 mt-2">Body copy with slate-300, never slate-600.</p>
</section>

// Primary CTA
<button className="bg-cyan-500 text-slate-950 font-black rounded-xl py-3 px-5
                   active:translate-y-px active:brightness-95">
  Join Live Trivia!
</button>

// Exit pill — class already exists in globals.css
<button className="tp-exit-pill px-4 py-2 inline-flex items-center gap-2">
  <span className="text-xs">←</span> Back to Venue
</button>
```

## If creating visual artifacts

Copy assets out of `assets/` and create static HTML files that `@import`
(or `<link>`) `colors_and_type.css`. Use the preview cards in `preview/` as
visual references — they show exactly how each accent / card / state
should look on dark.

## If working on production code (the Hightop Challenge Next.js app)

Read the rules here to become an expert in designing with this brand, then
apply them via Tailwind class strings that mirror the token names. Use the
patterns above as templates. The brief lists ~28 production components that
still need to be migrated from the legacy comic look to the dark-native
language — when migrating one, run it through the 7-point brand check and
the component is brand-complete when all 7 pass.

## If the user invokes this skill without other guidance

Ask them what they want to build or design, ask some questions, and act as
an expert designer who outputs HTML artifacts _or_ production code,
depending on the need.
