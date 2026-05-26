# Hightop Challenge — Design System

> "Every screen should feel like a live scoreboard inside a premium sports bar at night —
> dark, electric, high‑contrast, with glowing accent colors that tell you which game you're in."

This system covers the **player‑facing** mobile web app — the venue trivia and sports
prediction platform built on Next.js + Tailwind. The product is **mobile‑first by
default**; everything in this kit is designed at phone widths and only progressively
enhanced upward.

## What Hightop Challenge is

A QR‑joined, venue‑locked competition platform. A player scans a code at a
participating bar / sports lounge, gets an anonymous username pinned to that
venue, then plays a rotating menu of games against the rest of the room for
gift‑certificate prizes. Five games share the same shell:

| Game | Path | Loop |
|------|------|------|
| **Hightop Speed Trivia** | `/trivia` | 15 questions, 15s each, 3 rounds an hour |
| **Hightop Live Trivia** (Showdown) | `/trivia/live` | Synchronized 30s write‑in answers, server‑timed |
| **Hightop Sports Bingo™** | `/bingo` | Player‑prop / box‑score squares fill in live |
| **Hightop Pick 'Em™** | `/pickem` | Pick winners across NBA/MLB/NFL/NHL/Soccer |
| **Hightop Fantasy™** | `/fantasy` | One NBA lineup vs the venue, real‑time scoring |

The cross‑cutting surfaces are: **Join → Venue Hub → Game Landing → Live Game →
Leaderboard / Activity**, plus a hamburger menu, mobile bottom nav, ad slots,
and an admin console (which uses its own theme).

## Source materials

- **GitHub repo:** <https://github.com/AndrewSerulneck/Trivia-Predictions> (the
  `main` branch was sampled). Reading [`app/globals.css`](https://github.com/AndrewSerulneck/Trivia-Predictions/blob/main/app/globals.css),
  [`app/trivia/live/page.tsx`](https://github.com/AndrewSerulneck/Trivia-Predictions/blob/main/app/trivia/live/page.tsx),
  [`components/venue/GameIdentityPanel.tsx`](https://github.com/AndrewSerulneck/Trivia-Predictions/blob/main/components/venue/GameIdentityPanel.tsx)
  and [`lib/venueGameCards.ts`](https://github.com/AndrewSerulneck/Trivia-Predictions/blob/main/lib/venueGameCards.ts)
  will give you the highest information density per file. Anyone iterating on
  this system should browse those four files first.
- **Brand assets:** lifted from `public/brand/` of that repo — logo, game icon
  PNGs, header image, stadium‑lights overlay (omitted for size).

## The Migration Problem (read this first)

The codebase is mid‑rebuild. There are **two** competing visual languages in
the codebase and your job is to push everything toward language #2:

| | ❌ LEGACY ("comic card") | ✅ NORTH STAR (dark broadcast) |
|---|---|---|
| Background | cream `#fff9f0`, `#f7ede0` | slate‑950 `#020617` |
| Card | `.tp-comic-card` / `.tp-hud-card` (cream gradient + 8px ink offset shadow) | `.tp-dark-card` — `#0f172a` w/ `1px rgba(255,255,255,0.08)` border |
| Borders | `border-slate-200`, `border-[#3b2412]` ink | accent‑colored at 50‑60% alpha (`border-cyan-400/60`) |
| Body text | `text-slate-700/600` | `text-slate-100/200`, with accent‑colored eyebrows |
| Typography | Kalam (handwritten) | Nunito 600‑900, Bree Serif for game titles |
| Backgrounds | `.bg-stadium-turf` repeating green | flat dark surface, accent gradients only |

`app/trivia/live/page.tsx` (the Live Showdown screen) is the **canonical
realization** of language #2. Everything else should grow toward it.

## Index of this folder

```
README.md                 ← you are here
colors_and_type.css       ← single source of truth for tokens — import first
SKILL.md                  ← Agent-Skills compatible manifest
preview/                  ← cards rendered in the Design System tab
fonts/                    ← see note below (loaded via Google Fonts)
assets/                   ← logos, game icons, silhouettes
ui_kits/web/              ← the player-facing web app UI kit (7 surfaces)
  README.md
  index.html              ← interactive click-through demo
  components.jsx          ← shared primitives
  screens.jsx             ← Join / VenueHub / GameLanding / LiveShowdown / Leaderboard / Challenges
  more-screens.jsx        ← Activity / BingoBoard / LiveRoundBreak / LivePostGame
  ios-frame.jsx           ← iOS device chrome
```

### Where to find each foundation

| Concern | Look here |
|---|---|
| Page-level accents (cyan home, amber leaderboard, etc.) | `preview/colors-page-accents.html` + `colors_and_type.css` `--ht-page-*` |
| Game color identities (the 5 distinct gameplay-themed gradients) | `preview/colors-game-identities.html` + `colors_and_type.css` `--ht-game-*` |
| Type primitives + scale | `preview/type-*.html` |
| Card / button / input patterns | `preview/component-*.html` |
| Live Trivia between-round leaderboard | `preview/component-live-round-break.html` |
| Live Trivia post-game summary | `preview/component-live-postgame.html` |
| Bingo board pattern | `preview/component-bingo-board.html` |
| Hamburger drawer | `preview/component-hamburger-drawer.html` |
| Notification dropdown | `preview/component-notification-dropdown.html` |
| Activity timeline + career stats | `preview/component-activity.html` |
| Venue 3-tab switcher | `preview/component-bottom-nav.html` *(renamed asset: Venue switcher)* |
| Logo (neon concepts) | `preview/brand-logo.html` |
| Original game icons | `preview/brand-game-icons.html` |
| Lucide icon usage | `preview/iconography-lucide.html` |

## Fonts

Hightop loads **Bree Serif** (game titles, section headlines) and **Nunito**
(everything else, weights 400/600/700/800/900) directly from Google Fonts —
there are no font files in the original repo, so the `fonts/` folder is empty
on purpose and `colors_and_type.css` `@import`s them from the Google CDN.

**Substitution note:** The legacy stack also referenced **Kalam** (handwritten,
used in the bingo turf / leaderboard "scoreboard" look). It is *intentionally
omitted* here — Kalam belongs to the comic era and should not appear on any
player‑facing surface in the dark‑native rebuild. If you need a handwritten
look for an internal/admin tool, load it separately.

---

## CONTENT FUNDAMENTALS

Hightop is written like a pub announcer reading off a chalkboard — short,
loud, second‑person, and unafraid to *tell* the player what to do. It is the
opposite of polite SaaS copy.

### Voice

- **Second person, imperative.** "Type your answer." "Join Live Trivia!"
  "Stay ready for the next one." "Pick today's winners. Prove it."
- **Short declaratives** over compound sentences. The Live Showdown rules
  read like dares: *"Do not close your browser or switch tabs during live play."*
- **Confident, slightly cocky** — Pick 'Em's tagline is literally *"Think you
  can pick today's winners? Prove it."* The voice has stakes.
- **"You" not "we"**. "We" only appears in legal/system copy. The product
  never talks about itself in the first person.

### Casing

- **ALL CAPS** for ribbon labels, status badges, and feedback states:
  `RIGHT`, `WRONG`, `LIVE TRIVIA RULES`, `CLOSEST GUESS SCORING`,
  `SPONSOR SPOTLIGHT`. Always paired with `letter-spacing: 0.12–0.14em`.
- **Title Case** for game names: *Hightop Speed Trivia*, *Hightop Sports
  Bingo™*. The ™ is part of the brand on the three competition products
  (Bingo, Pick 'Em, Fantasy) and is preserved verbatim.
- **Sentence case** for everything else — rules bullets, error toasts,
  emcee announcements.
- **No oxford-period bullets.** Rules are written as imperative fragments,
  no terminating period: *"15 questions per round"*, *"15 seconds per question"*.

### Tone of system messages

- Errors are blunt and human: *"Join a venue first."* *"Venue session not
  found. Rejoin your venue."* — not "An error has occurred."
- Punishments are stated as rules, not warnings: *"Forfeited Question. No
  closing your browser or changing tabs during Live Trivia!"*
- The emcee comments engine (`lib/liveShowdownComments.ts`) has a chatty,
  smack‑talk register meant to read like a real MC mid‑round.

### Emoji

- **Rare and functional**, never decorative. Only two appear in the live
  product:
  - 🎯 marks Closest‑Guess (numeric) questions
  - ✓ inside Pick 'Em selection chips
- **No emoji in headings, ever.** Game titles, eyebrows, and CTAs stay clean.

### Numbers & units

- Points are written **`+10 points`** for awards, **`0 points`** for misses
  — no commas, no "pts" abbreviation in the headline state.
- Timers are mm:ss for sub‑hour and hh:mm:ss for the lobby countdown, always
  with `font-variant-numeric: tabular-nums` so they don't jitter.

### A few examples lifted directly

> **Eyebrow:** `LIVE TRIVIA RULES` &nbsp;·&nbsp; `ROUND 2 · QUESTION 7` &nbsp;·&nbsp; `ANSWER REVEAL`
>
> **Status:** `Next Live Trivia Showdown in 00:14:32`
>
> **Rule:** *"Players get 30 seconds to type their answers."*
>
> **Feedback:** `RIGHT` &nbsp;/&nbsp; `+10 points`  …  `WRONG` &nbsp;/&nbsp; `0 points`
>
> **CTA:** *Join Live Trivia!* &nbsp;·&nbsp; *Submit* &nbsp;·&nbsp; *Answer Locked!*

---

## VISUAL FOUNDATIONS

### Colors

- **One canvas.** `--ht-canvas: #020617` (slate‑950). No alternate page
  background. Bingo *used to* paint the whole page with an orange turf
  gradient — that's dead. Game color identity is now expressed inside the
  game's card / inside the rules panel, not on the body.
- **One default card.** `--ht-surface: #0f172a` (slate‑900) with a
  `rgba(255,255,255,0.08)` hairline border. Nested elements step up:
  `#1e293b` then `#334155`.
- **Five game gradients** — each themed to its own gameplay. The gradient
  runs **continuously** from the venue hub button through the landing rules
  page into live gameplay. Memorize them — they ARE the game's identity:

  | Game | Look | Stops / Base | Edge accent |
  |------|------|--------------|-------------|
  | Live Trivia | Broadcast — cyan→blue→violet gradient with question-mark scatter | `#0ea5e9 → #2563eb → #7c3aed` | `cyan-300` |
  | Speed Trivia | Racing — electric yellow + lime diagonal stripes on near-black + lightning bolt | base `#0a0a0f`, stripes `#facc15 / #84cc16` | `#facc15` (yellow-400) |
  | Sports Bingo | Casino felt + gold trim + slot reel (cherry · 7 · BAR) + 77 numerals | felt `#0c3a2e`, gold inner trim `#c89b3a` | **`#7dd3fc` (sky-300) — cool ice border** that cuts cleanly against the warm exit pill |
  | Pick 'Em | Sportsbook ticket — diagonal navy-vs-magenta split + perforated dashes + tilted ✓ stamp | `#1a2f72 → #6b1a4e` | `#fde68a` (ticket-yellow) |
  | Fantasy | Coach's chalkboard — deep forest + chalk grid + X/O play diagram + dashed arrow | `#0a3128` | chalk-cream `rgba(254,243,199,0.55)` |

- **Accent semantics inside the dark shell** — what an accent color means is
  contextual, not absolute:

  | Accent | Meaning |
  |--------|---------|
  | **Cyan** | Default informational / focus rings / Live Trivia broadcast / home base |
  | **Emerald** | "Active / answering now", success, +points |
  | **Amber** | Countdowns, "next up", closest-guess flag, **Leaderboard page** |
  | **Fuchsia** | Answer reveal, intermission ("between" states) |
  | **Rose** | Wrong answer, errors, forfeit (NEVER for the exit pill) |
  | **Blue (`#60a5fa`)** | Activity & Career page |
  | **Gold (`#d89a4f`)** | Prize wallet, redeem |
  | **Slate (`#94a3b8`)** | FAQs / info pages |
  | **Warm red gradient** | The exit/back pill — the **only** warm element on screen |

### Type

- **Bree Serif** (slab) for game titles and the big rules card display
  copy — always `text-shadow: 0 1px 0 rgba(12,18,28,0.8), 0 3px 0
  rgba(12,18,28,0.58), 0 0 12px rgba(255,255,255,0.5)` for the embossed
  scoreboard feel.
- **Nunito** 400/600/700/800/900 for everything else. UI weight is **600**;
  buttons and feedback states are **900**.
- **Scale** is mobile‑first; root font‑size drops to **14px** below 430px
  and **13px** below 380px (iPhone SE), with a `.tp-game-page` modifier that
  multiplies all `text-*` utilities by 1.6 inside live game surfaces.
- **Tabular numerals everywhere** numbers can change — scores, countdowns,
  remaining‑picks badge.

### Backgrounds, imagery, motifs

- **No full‑bleed imagery on player‑facing screens.** The header image
  (`brand/hightop-challenge-header.jpeg`) is reserved for legal / about /
  marketing surfaces. Live gameplay is flat dark with one accent border.
- **No turf, no stadium‑lights overlay, no repeating patterns.** These
  exist in the asset folder but are legacy; the broadcast aesthetic is the
  *absence* of texture. A subtle, decorative `?` field is the only allowed
  pattern, and only inside the game rules card.
- **Gradients are reserved for the five game identities and the exit pill.**
  No accidental bluish‑purple gradients elsewhere.

### Cards

- **Radius:** 16px default (`rounded-2xl`), 20–24px for the rules card,
  9999px (full pill) for buttons and badges. Inputs are 12px.
- **Border:** always a 1px hairline at `rgba(255,255,255,0.08)`. When a
  card carries section meaning, the border swaps to the accent color at
  50–60% alpha — e.g. `border-cyan-400/60` for Live Showdown header, or
  `border-amber-400/60` for the lobby countdown card.
- **Shadow:** dark, soft — `0 8px 24px rgba(0,0,0,0.40)`. The 8px hard‑offset
  ink shadow from `.tp-comic-card` is forbidden.
- **Inner glow** (cyan halo around primary CTAs) is permitted on idle states:
  `0 0 0 1px rgba(34,211,238,0.30), 0 8px 28px rgba(34,211,238,0.18)`.

### Buttons

- All interactive elements get a base treatment: `border-radius: 12px`,
  `border: 1px solid rgba(255,255,255,0.12)`, `font-weight: 600`,
  `transition: all 150ms`.
- **Press state:** `transform: translateY(1px)`. iOS‑style game cards
  (`.tp-game-card-btn`) use a stronger `scale(0.91)` spring instead.
- **Hover state on touch‑first product is essentially absent** — mobile is
  primary. On hover‑capable devices, dim background a step (`bg-cyan-100/20`
  patterns appear in the source). Don't lighten on hover; it looks broken
  on dark surfaces.
- **Exit pill** — `background: linear-gradient(to right, #a93d3a, #c8573e,
  #e9784e)`, `border: 1px solid #1c2b3a`, `border-radius: 9999px`,
  `min-height: 44px`. Active state: `scale(0.95)` and `filter:
  brightness(0.9)`.

### Inputs

- `background: #1e293b`, `border: 1px solid #334155`, `border-radius: 12px`,
  `font-weight: 600`. On iOS, minimum `font-size: 16px` (no focus zoom).
- **Focus ring is always cyan**: `border-color: #22d3ee; box-shadow: 0 0 0
  2px rgba(34,211,238,0.18)`. Outline is removed; the cyan halo *is* the
  focus state.
- Placeholders use Segoe UI fallback at `font-weight: 500; color: #64748b`.

### Borders & dividers

- `rgba(255,255,255,0.08)` for default hairlines.
- `rgba(255,255,255,0.20)` for tab/section dividers.
- Game card outer borders use a **3px white at 60–65% alpha** as the
  "scoreboard chrome" — only on the gradient‑filled game cards.

### Animation

- **House easing:** `cubic-bezier(0.22, 1, 0.36, 1)` for entrances,
  `cubic-bezier(0.16, 1, 0.3, 1)` for exits, `cubic-bezier(0.16, 0.84,
  0.2, 1)` for points/coin flows.
- **House timings:** 280–360ms for surface transitions, 480–640ms for
  celebratory moments (countdown pop, bingo square pop, fireworks).
- **Animation library:** `tp-pop`, `tp-bounce-hover`, `tp-countdown-pop`,
  `tp-points-flow`, `tp-points-burst`, `tp-firework`, `tp-rain`,
  `tp-surface-exit`/`-enter`, `bingo-pop`. All defined in `globals.css`.
  No spring physics outside of `.tp-game-card-btn` (which uses CSS
  `transform: scale(0.91)` on `:active`).
- **Reduce motion** is honored implicitly by the use of `transform`+
  `opacity` only — but there is no explicit `prefers-reduced-motion` block,
  which is a documented gap.

### Layout rules

- **`max-width: 28rem` (448px)** for the main column in live game surfaces;
  the venue hub uses a horizontally‑snapped 3-tab carousel (Games /
  Leaderboard / Challenges).
- **Venue switcher** at the top of every venue page — segmented 3-tab pill
  with swipe-to-page horizontal carousel between Games, Leaderboard, and
  Challenges. **No persistent 6-tab bottom nav.** Other pages (Activity,
  Prizes, FAQs) live behind the hamburger drawer.
- **Sticky back pill** at the top of every gameplay screen, inside a
  `position: sticky; top: 0; z-index: 30` container.
- **Safe‑area aware** — every fixed element uses
  `padding-bottom: max(env(safe-area-inset-bottom), …)`.

### Transparency & blur

- The mobile bottom nav uses `bg-white/95 backdrop-blur` in the legacy
  build; in the dark rebuild this becomes `bg-slate-950/85 backdrop-blur`
  with a `rgba(255,255,255,0.08)` top border. (Documented gap — the bottom
  nav has not been migrated yet.)
- **Modals/popups** use a `bg-black/75` to `bg-black/80` scrim and the
  panel itself is a normal `--ht-surface` card with an accent border.
  No glass / acrylic blur on the panel itself.

### Imagery vibe (where it appears)

- The five game icons (`assets/brand/*_icon.png`) are illustrated, warm,
  saturated stadium‑themed cartoons. They appear at small sizes inside
  the venue hub carousel buttons — never as full‑bleed hero imagery.
- The logotype (`assets/brand/hightop-logo.svg`) is a top‑hat + ribbon mark.
  It only appears on the join / branding header.
- No photography. Player silhouettes are flat SVG.

---

## ICONOGRAPHY

The repo uses **`lucide-react`** (v0.564) as its icon system — outlined,
2px stroke, geometric. Anywhere you need a glyph in production, reach for
Lucide first. We pull the same library from a CDN in the UI kit so the
look matches the running app exactly.

- **Library:** Lucide — <https://unpkg.com/lucide-static@0.564.0> (icon set
  loaded via the `lucide` script in our UI kit demo).
- **Stroke weight:** 2px (Lucide default). Do not mix with filled icon
  sets like Heroicons solid.
- **Size grid:** 16 / 20 / 24px. Inline icons in body copy are 16;
  button/CTA icons are 20; navigation icons are 24.
- **Color:** inherits `currentColor`. On dark surfaces, icons take the
  same accent that the surrounding eyebrow / border uses — so the Live
  Showdown header gets cyan icons, the Bingo card gets amber, etc.

### Custom / branded assets

| Asset | Path | Usage |
|---|---|---|
| Logo (top‑hat ribbon mark) | `assets/brand/hightop-logo.svg` | Header / join screen / loading splash |
| Header banner (raster) | `assets/brand/hightop-challenge-header.jpeg` | Legal / marketing surfaces only |
| Game icons (×5) | `assets/brand/{trivia,live_trivia,bingo,pickem,fantasy}_icon.png` | Venue hub carousel buttons, "active games" rail |
| Speed Trivia variant | `assets/brand/speed_trivia_icon.png` | Speed Trivia hub button |
| Player silhouette | `assets/player-silhouette.svg` | Empty avatar fallback |
| Checkmark glyph | `assets/checkmark.svg` | Selection state on Pick 'Em |

The stadium‑lights overlay PNG/JPG (`brand/stadium-lights-overlay*`) ships
with the repo but is **not used in the dark rebuild** — it was a decorative
overlay for the old comic look. Kept available for reference; do not
reintroduce it on player‑facing screens.

### Unicode characters used as icons

A handful of single characters are used inline and aren't replaced by
Lucide glyphs. Keep these as text (they reflow with the surrounding
typography):

- `←` back arrow inside the exit pill
- `•` rule bullets
- `?` decorative scatter inside Trivia game cards
- `✓` Pick 'Em selection (also available as a PNG/SVG checkmark asset)
- `🎯` (the lone emoji) — Closest‑Guess question flag

### Drawing your own SVGs

**Don't.** Use Lucide. If a Lucide icon doesn't exist for what you need,
ask before reaching for a custom asset. The brand's visual cohesion comes
from icon consistency.

---

## Caveats & known gaps

- No font files ship in the repo — Google Fonts is the source. If the
  user needs offline / self‑hosted fonts, ask for the woff2 files.
- The legacy 6-tab `MobileBottomNav.tsx` in production code is **superseded**
  by the new 3-tab venue switcher (`preview/component-bottom-nav.html`,
  asset name "Venue switcher"). When migrating, replace the global nav with
  the in-venue segmented pill.
- The hamburger drawer and notification dropdown specifications in this kit
  are designed but **not yet implemented in production**. They are the next
  things to migrate from the comic look (`LeftHamburgerMenu.tsx`,
  `NotificationBell.tsx`).
- Logo: two **neon-tube wordmark concepts** ship in `preview/brand-logo.html`
  alongside the original top-hat SVG. Direction (A slab / B script+block)
  is pending user selection.
- The **bingo turf** background and **leaderboard "wood frame"** table in
  the legacy code use legacy palettes (`#4a2e18`, `#1f5136`, Kalam font).
  They are documented here as legacy and **reskinned** in this kit to match
  the dark broadcast — see `preview/component-leaderboard-row.html` and
  `preview/component-bingo-board.html`.
