# Hightop Challenge — Claude Design Brief
## Complete Dark-Native Brand Identity: Every Element, Every Screen

---

## WHAT THIS BRIEF IS FOR

This is a comprehensive design brief for **Claude Design** to produce pixel-precise design
specifications, component-level Tailwind class recommendations, and visual mockups for the
**Hightop Challenge** web app — a venue-based trivia and sports prediction platform.

The app has been **partially migrated** to a dark-native design language. Roughly 60% of
components are still in an old "light mode / comic card" aesthetic that must be brought in
line with the dark broadcast identity already established in the Live Trivia screens.

Your job: design every untouched component and screen in a way that is **visually
impressive, internally consistent, and brand-complete**. Reference the Live Trivia game
screen as your north star — that is the finished look every other screen should grow toward.

---

## SECTION 1: BRAND IDENTITY & DESIGN PHILOSOPHY

### The One-Sentence Brief
Every screen should feel like a **live scoreboard inside a premium sports bar at night** —
dark, electric, high-contrast, with glowing accent colors that tell you which game you're in.

### What "Brand Complete" Means Here
- Every surface is dark. No white, cream, or light-gray card backgrounds anywhere in the
  player-facing app.
- Every section is labeled in a specific accent color. The accent tells you where you are.
- Every interactive element (button, input, tab) uses the same dark-native button grammar.
- The back/exit button is always a warm red gradient pill — the only warm element on screen.
- Every game has its own color identity that runs continuously from the hub button through
  the landing page into the live gameplay.

### What the Brand is NOT
- No green turf or grass backgrounds
- No cream (`#fff9f0`, `#fff7ea`) card backgrounds anywhere on player-facing screens
- No flat 8px offset "comic book" box shadows (`.tp-comic-card`, `.tp-hud-card`)
- No `border-slate-200`, `border-gray-200`, or other light borders
- No `text-slate-600`, `text-slate-700`, `text-gray-600` as primary text on dark surfaces
  (those are light-on-light colors; dark surfaces need `text-slate-300` or brighter)

---

## SECTION 2: THE DARK CANVAS SYSTEM

These are the exact values the codebase has already defined (in `app/globals.css`):

```
Page background:   #020617   (CSS var: --tp-canvas,    Tailwind: bg-slate-950)
Card surface:      #0f172a   (CSS var: --tp-surface,   Tailwind: bg-slate-900)
Elevated surface:  #1e293b   (CSS var: --tp-elevated,  Tailwind: bg-slate-800)
Subtle border:     #334155   (CSS var: --tp-border-subtle, Tailwind: border-slate-700)
Primary text:      #f8fafc   (CSS var: --tp-text-primary, Tailwind: text-slate-50)
Muted text:        #94a3b8   (CSS var: --tp-text-muted,   Tailwind: text-slate-400)
Disabled text:     #475569                              Tailwind: text-slate-600
```

**The Card Pattern (universal):**
```
background:    bg-slate-900
border:        border border-[accent]/30  (1px, tinted from the section's accent color)
border-radius: rounded-2xl  (16px)
padding:       p-4
```
Depth is created by background contrast (slate-950 page behind slate-900 card), NOT shadows.

**The Elevated Card Pattern (modals, overlays):**
```
background:    bg-slate-900
border:        border border-white/8
box-shadow:    0 24px 48px rgba(0,0,0,0.6)
border-radius: rounded-3xl
```

---

## SECTION 3: THE ACCENT COLOR SYSTEM

Every section of the site has an accent color. The accent controls:
- Section label text color
- Card border tint
- Primary button background
- Progress bar fill
- Active state highlights
- Input focus ring

### Page-Level Accents (non-game screens)

| Page / Context         | Accent     | Hex       | Tailwind      |
|------------------------|------------|-----------|---------------|
| Venue Hub (home)       | Cyan       | `#06b6d4` | cyan-500      |
| Login / Join flow      | Cyan       | `#06b6d4` | cyan-500      |
| Leaderboard            | Amber      | `#f59e0b` | amber-500     |
| Activity / Career      | Blue       | `#60a5fa` | blue-400      |
| Prizes / Redeem        | Gold       | `#d89a4f` | custom --tp-gold |
| FAQs / Info pages      | Slate      | `#94a3b8` | slate-400     |
| Error / Danger         | Rose       | `#f43f5e` | rose-500      |
| Notifications          | Cyan       | `#06b6d4` | cyan-500      |

**Cyan = home base.** It is the "you are in the lobby" signal. Any screen that is not a
specific game should default to cyan unless another page accent above applies.

### Game-Level Accents

| Game          | Primary     | Hex       | Secondary    | Hex       |
|---------------|-------------|-----------|--------------|-----------|
| Live Trivia   | Cyan        | `#06b6d4` | Emerald      | `#10b981` |
| Speed Trivia  | Blue        | `#2563eb` | Violet       | `#7c3aed` |
| Bingo         | Orange      | `#f97316` | Amber        | `#f59e0b` |
| Pick 'Em      | Indigo      | `#4f46e5` | Cyan         | `#06b6d4` |
| Fantasy       | Violet      | `#7c3aed` | Cyan         | `#06b6d4` |

### The Accent Application Pattern (copy this exactly)

```
Section label:     text-[accent-300]  tracking-[0.14em] uppercase font-black text-sm
Card border:       border-[accent-400]/30  (use /60 for "active" or "focused" cards)
Card background:   bg-slate-900
Highlight text:    text-[accent-200]
Active fill:       bg-[accent-500]  or  bg-[accent-400]
Dark tint bg:      bg-[accent-950]/30   (subtle colored well behind content)
Input focus:       focus:border-[accent-400] focus:ring-1 focus:ring-[accent-400]/30
```

---

## SECTION 4: THE TYPOGRAPHY SYSTEM

**Fonts already loaded:**
- `Bree Serif` — Display, headings, H1–H3, game titles
- `Nunito` (400, 600, 700, 800) — Body, buttons, inputs, all UI copy
- `Kalam` (400, 700) — Score callouts, fun one-off moments only

**Type Scale:**

| Role          | Tailwind Classes                              | Usage                          |
|---------------|-----------------------------------------------|--------------------------------|
| Display XL    | `text-5xl font-black tabular-nums`            | Timers, countdowns, big scores |
| Display L     | `text-4xl font-black`                         | RIGHT / WRONG, major feedback  |
| Display M     | `text-3xl font-extrabold`                     | Question text, primary CTAs    |
| Heading       | `text-2xl font-black`                         | Card titles, phase headings    |
| Sub-heading   | `text-xl font-semibold`                       | List items, rule lines         |
| Body          | `text-base font-semibold`                     | General UI copy                |
| Label         | `text-sm font-black uppercase tracking-[0.14em]` | Section labels (ALL CAPS)   |
| Caption       | `text-xs font-semibold`                       | Metadata, timestamps           |

**Critical rules:**
- Section labels are ALWAYS: `uppercase tracking-[0.14em] font-black text-sm text-[accent-300]`
- Game timers use `tabular-nums` — prevents layout shift as digits change
- No multi-line ALL-CAPS unless it's a section label
- Body text on dark surfaces: `text-slate-200` or `text-slate-300`, never `text-slate-600`

---

## SECTION 5: THE BUTTON SYSTEM

### Primary CTA (the main action for the current screen)
```
background:    bg-[accent-500]  (game or page accent color)
text:          text-slate-950   (dark text on bright button — high contrast)
border-radius: rounded-xl
font:          font-black
padding:       py-3 px-5
border:        none
active:        active:translate-y-px active:brightness-95
disabled:      opacity-50 cursor-not-allowed
```

### Secondary Action
```
background:    transparent
border:        1px solid [accent-400]/50
text:          text-[accent-300]
border-radius: rounded-xl
hover:         hover:bg-[accent-950]/40
```

### Back / Exit Navigation (THE WARM ELEMENT — use everywhere for exit/back)
The CSS class `.tp-exit-pill` already exists in `app/globals.css`. Use it universally.
```
background:    linear-gradient(to right, #a93d3a, #c8573e, #e9784e)
border:        1px solid #1c2b3a
text:          text-[#fff7ea]  font-black
border-radius: rounded-full (pill)
min-height:    44px
active:        scale-95 brightness-90
```
This warm red/orange gradient is the **only warm-palette element** that appears site-wide
(outside of the game hub buttons themselves). Its warmth makes it immediately findable
as "the way out" against a screen full of cool dark surfaces.

### Ghost / Tertiary
```
background:    bg-white/5
border:        1px solid white/15
text:          text-slate-300
border-radius: rounded-xl
hover:         bg-white/10
```

### Destructive (delete, leave game, etc.)
```
background:    bg-rose-950/40
border:        1px solid rose-500/50
text:          text-rose-300
border-radius: rounded-xl
```

### Input Fields
```
background:    bg-slate-800
border:        border border-slate-600 rounded-xl
text:          text-white text-base font-semibold
placeholder:   text-slate-500
focus:         border-[accent-400] ring-1 ring-[accent-400]/30
error:         border-rose-400/60 ring-1 ring-rose-400/20
```

---

## SECTION 6: NAVIGATION CHROME (CRITICAL — NOT YET MIGRATED)

### 6a. Left Hamburger Menu — `components/ui/LeftHamburgerMenu.tsx`

**Current state:** Uses `bg-white` panels, `border-slate-300` borders, `text-slate-700`.

**Target design:**
- Menu trigger button: `bg-slate-900 border border-slate-700` icon button, `text-white`
- Slide-out panel background: `bg-slate-900` with `border-r border-slate-800`
- Nav items: `text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-xl`
- Active nav item: `text-cyan-300 bg-cyan-950/30 border-l-2 border-cyan-400`
- Section dividers: `border-slate-800`
- User info section at top: `bg-slate-800/60 rounded-2xl` with `text-white` username, `text-cyan-300` points/rank
- Overlay/scrim behind open menu: `bg-slate-950/80 backdrop-blur-sm`
- Close button: `.tp-exit-pill` or ghost `text-slate-400`

### 6b. Mobile Bottom Navigation — `components/ui/MobileBottomNav.tsx`

**Current state:** Uses `bg-white/95 border-slate-200`.

**Target design:**
- Container: `bg-slate-900/95 border-t border-slate-800 backdrop-blur-md`
- Safe area padding for notch: `pb-[env(safe-area-inset-bottom)]`
- Inactive tab icon + label: `text-slate-500`
- Active tab icon + label: `text-cyan-400`
- Active tab indicator: thin `bg-cyan-400` bar at top edge of tab, or `bg-cyan-950/50` background pill
- No white anywhere — all dark

### 6c. Notification Bell — `components/ui/NotificationBell.tsx`

**Current state:** Uses `bg-white` notification cards, `border-[#eadbcc]` warm borders.

**Target design:**
- Bell icon: `text-slate-400` idle, `text-cyan-300` when unread badge is present
- Unread badge: `bg-rose-500` dot, `text-white` count
- Dropdown panel: `bg-slate-900 border border-slate-700 rounded-2xl shadow-[0_24px_48px_rgba(0,0,0,0.6)]`
- Notification item: `bg-slate-800/40 border border-slate-700/50 rounded-xl`
- Unread item: `border-cyan-400/30 bg-cyan-950/20`
- Timestamp: `text-slate-500 text-xs`
- Notification body: `text-slate-300`
- "Mark all read" CTA: `text-cyan-400 text-sm font-semibold`

---

## SECTION 7: PAGE SHELL & LAYOUT CHROME

### 7a. PageShell — `components/ui/PageShell.tsx`

**Current state:** Uses `.tp-page-header-compact` with `bg-[#fff7ea]/92` (warm cream header), `.tp-comic-card` for content.

**Target design:**
- Header strip: `bg-slate-900/95 border-b border-slate-800 backdrop-blur-md`
- Page title in header: `text-xl font-black text-white`
- Sub-title / breadcrumb: `text-[accent-300] text-sm font-black uppercase tracking-[0.14em]`
- Content area background: `bg-slate-950` (the page canvas)
- Content card (replaces `.tp-comic-card`): `bg-slate-900 border border-[accent]/20 rounded-2xl`
- The `.tp-comic-card` class should be kept only for admin-panel use; PageShell should
  use `.tp-dark-card` instead (already defined in globals.css)

### 7b. AppShell Footer — `components/ui/AppShell.tsx`

**Current state:** `.tp-comic-card` legal footer.

**Target design:**
- Footer background: `bg-slate-900 border-t border-slate-800`
- Legal copy: `text-slate-600 text-xs`
- Links: `text-slate-500 hover:text-slate-300`
- No warm tones, no comic shadows

### 7c. Decorative Blur Circles (AppShell non-game pages)

**Current state:** Orange, red, amber blur blobs.

**Target design:** Soften to be barely visible on dark canvas:
- A single `bg-cyan-500/4 blur-3xl` orb at top-right
- A single `bg-violet-500/4 blur-3xl` orb at bottom-left
- These hint at the brand palette without competing with content

---

## SECTION 8: LEADERBOARD — `components/leaderboard/LeaderboardTable.tsx`

**Accent: Amber**

**Current state:** Empty/error states use `bg-slate-50`, `bg-amber-50`, `bg-white`.

**Target design (ALL states):**
- Table container: `bg-slate-900 border border-amber-400/30 rounded-2xl`
- Section label: `text-amber-300 uppercase tracking-[0.14em] font-black text-sm`
- Header row: `bg-slate-800/60 border-b border-slate-700`
- Header cell text: `text-amber-300 text-xs uppercase tracking-[0.1em] font-black`
- Data rows: `border-b border-slate-800/60`
- Row hover: `bg-slate-800/40`
- Rank number (top 3): gold `text-amber-300 font-black`, others `text-slate-400`
- User's own row: `bg-amber-950/20 border-l-2 border-amber-400`
- Username: `text-slate-200 font-semibold`
- Points: `text-amber-200 font-black`
- Loading skeleton: `bg-slate-800/50 animate-pulse rounded`
- Empty state: `bg-slate-800/40 border border-slate-700 rounded-xl text-slate-400`
- Error state: `bg-rose-950/20 border border-rose-400/40 rounded-xl text-rose-300`
- Error retry button: Secondary style with rose accent

---

## SECTION 9: ACTIVITY & CAREER — `components/activity/`

**Accent: Blue (`text-blue-300`, `border-blue-400/30`)**

Files: `ActiveGamesPanel.tsx`, `ActivityTimeline.tsx`, `CareerStatsPanel.tsx`

**Current state:** All three use `bg-slate-50`, `border-slate-200`, `bg-blue-50`, `text-slate-600`.

### ActiveGamesPanel
- Container: `bg-slate-900 border border-blue-400/30 rounded-2xl`
- Section label: `text-blue-300 uppercase tracking-[0.14em] font-black text-sm`
- Game item card: `bg-slate-800/60 border border-slate-700/60 rounded-xl`
- Game name: `text-slate-200 font-semibold`
- Game status badge: Active = `bg-blue-500/20 border-blue-400/40 text-blue-300`, Ended = `bg-slate-700 text-slate-400`
- Score/rank: `text-blue-200 font-black`
- "Join" CTA: Primary style, blue accent

### ActivityTimeline
- Container: `bg-slate-900 border border-blue-400/30 rounded-2xl`
- Timeline item: `bg-slate-800/40 border-l-2 border-blue-400/40 pl-4`
- Timeline dot: `bg-blue-400` circle
- Event title: `text-slate-200 font-semibold`
- Event time: `text-slate-500 text-xs`
- Positive event (win, correct): `border-l-emerald-400` dot `bg-emerald-400`
- Negative event (loss, wrong): `border-l-rose-400` dot `bg-rose-400`
- Divider line between items: `bg-slate-800`

### CareerStatsPanel
- Container: `bg-slate-900 border border-blue-400/30 rounded-2xl`
- Stat grid cards: `bg-slate-800/60 border border-slate-700/50 rounded-xl`
- Stat value (number): `text-3xl font-black text-blue-200` (large hero number)
- Stat label: `text-slate-500 text-xs uppercase tracking-wide font-semibold`
- Top stat (gold): `text-amber-300` value, small trophy icon
- Overall win rate bar: `bg-slate-700` track, `bg-blue-400` fill, `rounded-full`

---

## SECTION 10: CHALLENGES — `components/challenges/`

**Accent: Cyan (venue-level challenges are home-base features)**

Files: `PendingChallengesPanel.tsx`, `ChallengeRedeemPanel.tsx`

**Current state:** 18+ light-mode matches in PendingChallengesPanel. Heavily outdated.

### PendingChallengesPanel
- Container: `bg-slate-900 border border-cyan-400/30 rounded-2xl`
- Section label: `text-cyan-300 uppercase tracking-[0.14em] font-black text-sm`
- Challenge card: `bg-slate-800/60 border border-slate-700/60 rounded-xl p-4`
- Challenge title: `text-slate-200 font-semibold`
- Challenge description: `text-slate-400 text-sm`
- Progress bar: `bg-slate-700` track, `bg-cyan-400` fill
- Progress label: `text-cyan-300 text-xs font-semibold`
- Reward badge: `bg-amber-950/30 border border-amber-400/40 rounded-full text-amber-300 text-xs font-black px-2 py-0.5`
- Completed state: `border-emerald-400/30 bg-emerald-950/20`
- Completed label: `text-emerald-300 text-xs uppercase tracking-wide font-black`
- Empty state: `bg-slate-800/40 border border-slate-700 rounded-xl text-slate-400`
- "Redeem" button: Primary style, amber accent (rewards = gold)

### ChallengeRedeemPanel
- Same dark card pattern
- Redeem CTA: `bg-amber-400 text-slate-950 font-black rounded-xl`
- Confirmed/success state: `bg-emerald-950/20 border border-emerald-400/40 text-emerald-300`

---

## SECTION 11: PREDICTIONS PAGE — `components/predictions/PredictionMarketList.tsx`

**Accent: Sky (`text-sky-300`, `border-sky-400/30`)**

**Current state:** 22+ light-mode matches. Entire component is white/cream.

**Note:** Standalone Predictions has been retired and consolidated into Pick 'Em. This
component still exists for legacy predictions display. Style it as a subdued view-only
list rather than an active game.

- Page header: `bg-slate-900 border-b border-slate-800` with sky accent section label
- Market card: `bg-slate-900 border border-sky-400/30 rounded-2xl`
- Market title: `text-slate-200 font-semibold`
- Market status (open/closed/settled): Open = `text-sky-300`, Closed = `text-slate-500`, Settled = `text-emerald-300`
- Outcome options: `bg-slate-800 border border-slate-700 rounded-xl`
- Selected outcome: `border-sky-400/60 bg-sky-950/30`
- Locked prediction badge: `bg-sky-950/30 border border-sky-400/40 text-sky-300`
- Odds/probability: `text-slate-400 text-sm`
- Warning banner (existing light `bg-amber-50`): replace with `bg-amber-950/30 border border-amber-400/40 text-amber-200`
- "Not joined" notice: replace with `bg-slate-800/60 border border-slate-700 text-slate-400`
- Action buttons: Secondary style with sky accent

---

## SECTION 12: PICK 'EM — `components/pickem/`

**Accent: Indigo, with Cyan for selected picks**
**Already partially migrated** — verify and complete.

Files: `PickEmGameList.tsx` (main, mostly done), `PickEmRecentPicks.tsx`, `PickEmSportSelect.tsx`

### PickEmRecentPicks
- Container: `bg-slate-900 border border-indigo-400/30 rounded-2xl`
- Section label: `text-indigo-300 uppercase tracking-[0.14em] font-black text-sm`
- Pick history item: `bg-slate-800/40 border border-slate-700/60 rounded-xl`
- Win result: `text-emerald-400 font-black`
- Loss result: `text-rose-400 font-black`
- Pending result: `text-slate-400 font-semibold`
- Team name: `text-slate-200`
- Date: `text-slate-500 text-xs`

### PickEmSportSelect
- Sport filter pills: Inactive = `bg-slate-800 border border-slate-700 text-slate-400`, Active = `bg-indigo-500/20 border border-indigo-400/60 text-indigo-300`
- Filter section: `bg-slate-900 border-b border-slate-800`

---

## SECTION 13: SPORTS BINGO — `components/bingo/`

**Accent: Orange**
**Already heavily migrated** — verify selection flow screens.

Files: `SportsBingoHome.tsx` (done), `SportsBingoSelectBoard.tsx`, `SportsBingoSelectGame.tsx`, `SportsBingoSelectSport.tsx`

### Selection Flow (all three `Select*` files)
These are pre-game screens where the user picks their board/game/sport before playing.

- Page background: The `.tp-bingo-theme` CSS class is already defined — apply it here. It
  adds an orange radial gradient overlay on top of the dark canvas.
- Card items (board choices, game choices, sport choices):
  `bg-slate-800/60 border border-orange-400/30 rounded-2xl`
- Selected item: `border-orange-400/80 bg-orange-950/30`
- Selected checkmark: `bg-orange-500 text-white rounded-full`
- Item label: `text-slate-200 font-semibold`
- Item sublabel/count: `text-orange-300 text-sm`
- Primary CTA ("Select This Board" etc.): `bg-orange-500 text-white font-black rounded-xl`
- Back button: `.tp-exit-pill` with `style={{ boxShadow: "0 0 0 2px #020617" }}` for
  contrast against the orange background (same fix used in `SportsBingoHome.tsx`)

---

## SECTION 14: FANTASY — `components/fantasy/FantasyHome.tsx`

**Accent: Violet**
**Already partially migrated** — verify player draft pool and points ledger.

### Player Draft Pool Rows
- Pool container: `bg-slate-900 border border-violet-400/30 rounded-2xl`
- Player row: `bg-slate-800/40 border-b border-slate-800 hover:bg-slate-800/80`
- Player name: `text-slate-200 font-semibold`
- Player stat line: `text-slate-400 text-sm`
- Player position badge: `bg-violet-950/40 border border-violet-400/40 text-violet-300 text-xs font-black rounded-full px-2`
- "Draft" button: `bg-violet-500/20 border border-violet-400/60 text-violet-300`
- Drafted indicator: `bg-emerald-500/20 border border-emerald-400/40 text-emerald-300`
- Top performer badge: `bg-amber-950/30 border border-amber-400/40 text-amber-300` with star icon

### PointsLedger — `components/fantasy/PointsLedger.tsx`
- Container: `bg-slate-900 border border-violet-400/30 rounded-2xl`
- Ledger row: `border-b border-slate-800/60`
- Credit entry: `text-emerald-400 font-semibold`
- Debit entry: `text-rose-400 font-semibold`
- Net total: `text-violet-200 font-black text-xl`
- Date/label: `text-slate-500 text-xs`

---

## SECTION 15: PRIZES — `components/prizes/PrizeWalletPanel.tsx`

**Accent: Gold (`#d89a4f`, CSS var `--tp-gold`)**

- Container: `bg-slate-900 border border-[#d89a4f]/30 rounded-2xl`
- Section label: `text-[#d89a4f] uppercase tracking-[0.14em] font-black text-sm`
- Prize card: `bg-slate-800/60 border border-[#d89a4f]/30 rounded-xl`
- Prize name: `text-slate-200 font-semibold`
- Prize value: `text-[#d89a4f] font-black text-xl`
- Expiry date: `text-slate-500 text-xs`
- "Redeem" CTA: `bg-[#d89a4f] text-slate-950 font-black rounded-xl`
- Redeemed (greyed): `opacity-50 border-slate-700`

---

## SECTION 16: AD COMPONENTS — `components/ui/`

**Files: `AdBanner.tsx`, `PopupAds.tsx`, `MobileAdhesionAd.tsx`**

Ads should feel integrated, not jarring. They must sit inside the dark system.

- Ad container frame: `bg-slate-800/60 border border-slate-700/50 rounded-xl`
- Ad label: `text-slate-600 text-[10px] uppercase tracking-[0.1em]` (legally required "AD" label, kept minimal)
- Popup ad modal: `bg-slate-900 border border-white/8 rounded-3xl shadow-[0_24px_48px_rgba(0,0,0,0.7)]`
- Popup close button: Ghost style `text-slate-400 hover:text-white`
- Image placeholder (loading): `bg-slate-800 animate-pulse rounded-lg`
- Mobile adhesion banner: `bg-slate-900 border-t border-slate-800`
- Close button on adhesion: `bg-slate-800 border border-slate-700 text-slate-400 rounded-full`

---

## SECTION 17: APP-LEVEL PAGES

### FAQs — `app/faqs/page.tsx`
**Accent: Slate**
- FAQ accordion cards: `bg-slate-900 border border-slate-700/60 rounded-2xl`
- Question text: `text-slate-200 font-semibold`
- Answer text: `text-slate-400`
- Expanded state: `border-slate-600`
- Expand icon: `text-slate-400`

### Leaderboard Page — `app/leaderboard/page.tsx`
- Alert/notice banner: `bg-amber-950/30 border border-amber-400/40 rounded-xl text-amber-200`
  (replaces current `bg-amber-50 border-amber-300 text-amber-900`)

### Venue Loading Skeleton — `app/venue/[venueId]/loading.tsx`
- All skeleton placeholders: `bg-slate-800/50 animate-pulse rounded-xl`
- No `bg-white/85` or `border-slate-200`

---

## SECTION 18: GAME IDENTITY PANELS

### Game Landing / Identity Panel — `components/venue/GameIdentityPanel.tsx`

This panel appears on the game landing screen before a user enters a game.

- Panel wrapper: `bg-slate-900 border border-[game-accent]/40 rounded-2xl`
- The game gradient overlay (from `GAME_PAGE_THEME_BY_KEY`) should use subtle `rgba` on a `bg-slate-900` base
- Game title: `text-2xl font-black text-white`
- Game subtitle: `text-[game-accent-300] text-sm font-black uppercase tracking-[0.14em]`
- Rules list: `text-slate-300 text-sm`
- "Enter Game" CTA: Primary style with game accent
- Back button: `.tp-exit-pill`

### Game Landing Experience — `components/venue/GameLandingExperience.tsx`

- Follow same dark card + game accent pattern
- The hero gradient for each game should be rendered as a subtle
  `bg-gradient-to-br` bleed behind the card, not as the card background itself

---

## SECTION 19: ANIMATION SYSTEM (ALREADY CORRECT — PRESERVE)

The following animations are already dark-native and must NOT be changed:
- `tp-surface-enter` / `tp-surface-exit` — page transitions
- `tp-points-burst` / `tp-points-flow` — points collection effects
- `bingo-pop` — bingo square mark animation
- `tp-countdown-pop` — countdown timer tick animation
- `tp-firework` / `tp-rain` — celebration effects
- `animate-pulse` (Tailwind) — LIVE badge, skeleton loaders

**One new animation to add (`app/globals.css`):**
```css
@keyframes tp-glow-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(6, 182, 212, 0.4); }
  50%       { box-shadow: 0 0 0 6px rgba(6, 182, 212, 0); }
}
.tp-glow-pulse { animation: tp-glow-pulse 2s ease-in-out infinite; }
```
Apply to: LIVE status dots, pre-game join button, active challenge progress.

---

## SECTION 20: GLOBALS.CSS UPDATES NEEDED — `app/globals.css`

### Retire as primary patterns (keep for admin only):
- `.tp-comic-card` — add `/* admin-only */` comment
- `.tp-hud-card` — add `/* admin-only */` comment

### Add:
```css
/* Dark-native game card — the universal player-facing card surface */
.tp-game-card {
  background: var(--tp-surface);       /* #0f172a */
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px;
  padding: 16px;
}
```

### Verify body background stays:
```css
body { background: var(--tp-canvas); }  /* #020617 — no green turf gradient */
```

---

## SECTION 21: FULL COMPONENT MIGRATION CHECKLIST

### NOT YET MIGRATED — implement using specs above:
1. `components/ui/LeftHamburgerMenu.tsx` — Section 6a
2. `components/ui/MobileBottomNav.tsx` — Section 6b
3. `components/ui/NotificationBell.tsx` — Section 6c
4. `components/ui/PageShell.tsx` — Section 7a
5. `components/ui/AppShell.tsx` footer — Section 7b
6. `components/leaderboard/LeaderboardTable.tsx` — Section 8
7. `components/activity/ActiveGamesPanel.tsx` — Section 9
8. `components/activity/ActivityTimeline.tsx` — Section 9
9. `components/activity/CareerStatsPanel.tsx` — Section 9
10. `components/challenges/PendingChallengesPanel.tsx` — Section 10
11. `components/challenges/ChallengeRedeemPanel.tsx` — Section 10
12. `components/predictions/PredictionMarketList.tsx` — Section 11
13. `components/pickem/PickEmRecentPicks.tsx` — Section 12
14. `components/pickem/PickEmSportSelect.tsx` — Section 12
15. `components/bingo/SportsBingoSelectBoard.tsx` — Section 13
16. `components/bingo/SportsBingoSelectGame.tsx` — Section 13
17. `components/bingo/SportsBingoSelectSport.tsx` — Section 13
18. `components/fantasy/PointsLedger.tsx` — Section 14
19. `components/prizes/PrizeWalletPanel.tsx` — Section 15
20. `components/ui/AdBanner.tsx` — Section 16
21. `components/ui/PopupAds.tsx` — Section 16
22. `components/ui/MobileAdhesionAd.tsx` — Section 16
23. `app/faqs/page.tsx` — Section 17
24. `app/leaderboard/page.tsx` — Section 17
25. `app/venue/[venueId]/loading.tsx` — Section 17
26. `components/venue/GameIdentityPanel.tsx` — Section 18
27. `components/venue/GameLandingExperience.tsx` — Section 18
28. `app/globals.css` — Section 20

### ALREADY MIGRATED — use as reference examples:
- `components/trivia/TriviaGame.tsx` — Speed Trivia, blue accent, dark native
- `components/bingo/SportsBingoHome.tsx` — Orange accent, dark native
- `components/pickem/PickEmGameList.tsx` — Indigo accent, dark native, split-stripe matchup cards
- `components/fantasy/FantasyHome.tsx` — Violet accent, dark native
- `components/venue/VenueHubClient.tsx` — Cyan accent, dark native hub
- Live Trivia screens (`app/trivia/live/`) — THE GOLD STANDARD

---

## SECTION 22: THE 7-POINT BRAND CHECK (apply to every component)

```
□ Background is bg-slate-950 (page) or bg-slate-900 (card)?
□ Card border is 1px tinted at /30–/60 from the section's accent color?
□ Section label is uppercase tracking-[0.14em] font-black text-sm in accent-300?
□ All text on dark surfaces uses slate-50 / slate-300 / slate-400 (never slate-600)?
□ Primary button uses accent-500 bg with text-slate-950?
□ Back/exit uses .tp-exit-pill (warm red gradient pill)?
□ No white cards, no cream backgrounds, no comic drop shadows?
```

All 7 must pass. If any box is unchecked, the component is not brand-complete.
