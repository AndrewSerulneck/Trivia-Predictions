# Claude: Design System Migration — Phase 3

## Your Mission

Update **page-level layouts and spacing** across all player-facing routes. This is **Phase 3 of 4** — the final visual polish before QA.

**Files to edit:** ~30 page files  
**Complexity:** MEDIUM-HIGH (layout logic + spacing scale)  
**Estimated time:** 2–3 hours  
**Key skills:** Responsive design, spacing scale, grid layouts, game-specific gradients

---

## Context: What Phase 3 Does

### Before Phase 3
- Pages have correct component styling (Phase 2 ✅)
- But spacing, padding, margins still use ad-hoc values
- Game landing screens lack gradients/visual identity
- Bottom nav and hamburger drawer styling incomplete
- Responsive adjustments may be off

### After Phase 3
- All pages use atomic `--ht-space-*` grid (4px base)
- Game landing screens have proper gradients + identities
- Bottom nav (venue switcher) fully styled
- Hamburger drawer matches design
- Responsive adjustments correct
- **Everything feels cohesive and broadcast-like** ✅

### What stays the same
- Component logic and structure (Phase 2 already updated)
- Routes and URL structure (NO route changes)
- Just **layouts, spacing, and top-level styling** change

---

## The Spacing Scale — Your New Grid

All spacing now uses this 4px-based atomic scale:

```
--ht-space-1:  4px   (smallest gap)
--ht-space-2:  8px   (common gap)
--ht-space-3:  12px  (medium gap)
--ht-space-4:  16px  (standard padding)
--ht-space-5:  20px  (larger padding)
--ht-space-6:  24px  (card padding)
--ht-space-8:  32px  (section gap)
--ht-space-10: 40px  (large section gap)
--ht-space-12: 48px  (hero section)
```

**Rule:** Use these tokens instead of arbitrary values like `p-5`, `gap-3`, `mb-6`.

### Common spacing patterns

| Pattern | Old | New |
|---------|-----|-----|
| Button padding | `px-4 py-2` | `px-4 py-2` or `var(--ht-space-4) var(--ht-space-2)` |
| Card padding | `p-6` or `p-8` | `var(--ht-space-6)` or use `--ht-space-*` via Tailwind |
| Gap between cards | `gap-4` | `gap-4` (Tailwind `gap-*` uses 4px base, so `gap-4` = 16px) |
| Page padding | `p-4` | `var(--ht-space-4)` or `p-4` |
| Section margin | `mb-8` | `mb-8` (32px) or `mb-12` (48px) for larger gaps |

---

## Strategy: Work by Page Route

Phase 3 is organized by **URL routes** (not components):

### Tier 1: Core Player Routes (highest priority)
1. `/join` — Join/login flow
2. `/venue/[venueId]` — Venue hub (Games, Leaderboard, Challenges)
3. `/trivia` → `/trivia/live` — Trivia game landing + live
4. `/bingo` → `/bingo/home` — Bingo game landing + live
5. `/pickem` — Pick 'Em landing + game list
6. `/fantasy` — Fantasy landing + live
7. `/leaderboard` — Leaderboard page
8. `/activity` — Activity/career stats page

### Tier 2: Secondary Routes (game-adjacent)
9. `/predict` (if exists) — Prediction markets
10. `/active-games` — Current/pending games
11. `/pending-challenges` — Challenge management
12. `/prizes` / `/redeem-prizes` — Prize wallet

### Tier 3: Utility Routes (low visual priority)
13. `/faqs` — FAQ/help page
14. `/advertise` — Advertiser intake page
15. `/admin` — Admin dashboard (has own theme, skip for now)

---

## Phase 3 Work — By Tier

### TIER 1: Core Routes (Do these first)

#### Route 1: `/join` — Join/Login Flow

**File:** `/app/join/page.tsx`  
**Key components:** `JoinFlow.tsx`

**What to update:**

1. **Page padding:** Use `var(--ht-space-4)` or `var(--ht-space-6)` for page padding
2. **Logo spacing:** Space logo from top with `var(--ht-space-6)` or `var(--ht-space-8)`
3. **Input spacing:** Gap between inputs should be `gap-4` (16px) or `gap-3` (12px)
4. **Button spacing:** Button should be `mt-6` or `mt-8` (24–32px below last input)
5. **Section gaps:** Dividers and section separators use `gap-6` or `gap-8`

**No gradient needed** — join page stays dark background with cyan accents (home accent).

---

#### Route 2: `/venue/[venueId]` — Venue Hub

**Files:** 
- `/app/venue/[venueId]/page.tsx`
- `/components/venue/VenueHubClient.tsx`

**What to update:**

1. **Page background:** Already dark from Phase 1 ✅
2. **Header spacing:** Sticky back pill should have `top: 0; z-index: 30` with safe-area padding
3. **Tab section:** 3-tab carousel (Games / Leaderboard / Challenges) should use `gap-4` between tabs
4. **Card grid:** Game cards should use consistent `gap-4` or `gap-6`
5. **Page padding:** Wrap content in `var(--ht-space-4)` horizontal padding
6. **Tab content spacing:** Content below tabs should have `gap-6` or `gap-8` for section separation

**Accent:** Cyan (`var(--ht-page-home)`)

---

#### Route 3: `/trivia` & `/trivia/live` — Trivia Landing + Live

**Files:**
- `/app/trivia/page.tsx`
- `/app/trivia/live/page.tsx`
- `/components/trivia/TriviaGame.tsx`
- `/components/trivia/TriviaAppFrame.tsx`

**What to update:**

1. **Landing page** (`/trivia`):
   - Hero section: `VenueEntryRulesPanel` with `var(--ht-game-live)` gradient
   - Padding: `var(--ht-space-6)` around rules card
   - Button spacing: `mt-6` or `mt-8` below rules

2. **Live game page** (`/trivia/live`):
   - Should already look correct from Phase 1 (canonical example)
   - Verify: question area has `max-width: 28rem` (448px)
   - Timer/score: Use `--ht-tabular` class for jitter-free numbers
   - Back pill: Sticky at top with safe-area padding

**Accent:** Cyan gradient (`var(--ht-game-live)`)  
**Gradient:** Broadcast (cyan → blue → violet)

---

#### Route 4: `/bingo` & `/bingo/home` — Bingo Landing + Board

**Files:**
- `/app/bingo/page.tsx`
- `/app/bingo/home/page.tsx`
- `/components/bingo/SportsBingoHome.tsx`
- `/components/bingo/BingoThemeScope.tsx`

**What to update:**

1. **Landing page** (`/bingo`):
   - Rules card with `var(--ht-game-bingo)` gradient
   - Cool-ice border: `border: 2px solid var(--ht-game-bingo-edge)`
   - Padding: `var(--ht-space-6)`
   - Button: `mt-6` below rules

2. **Bingo board page** (`/bingo/home`):
   - Board grid: 5×5 squares with consistent `gap-2` or `gap-3` between
   - Square size: Should be responsive, ~70–80px on mobile
   - Score display: `var(--ht-page-leaderboard)` accent (amber, not bingo-specific)
   - Back pill: Sticky top

**Critical:** Bingo background now uses `var(--ht-game-bingo)` (green felt, NOT warm orange) ✅

---

#### Route 5: `/pickem` — Pick 'Em Landing + Game List

**Files:**
- `/app/pickem/page.tsx`
- `/app/pickem/[sportSlug]/page.tsx`
- `/components/pickem/PickEmGameList.tsx`
- `/components/pickem/PickEmSportSelect.tsx`

**What to update:**

1. **Landing page** (`/pickem`):
   - Rules card with `var(--ht-game-pickem)` gradient (navy ↔ magenta split)
   - Ticket-yellow border: `border: 2px solid var(--ht-game-pickem-edge)`
   - Padding: `var(--ht-space-6)`

2. **Game list page** (`/pickem/[sportSlug]`):
   - Game cards: `gap-4` or `gap-6` between rows
   - Each card: `padding: var(--ht-space-4)`
   - Inline ads: Should appear every 5 games (already handled by component)
   - Points display: Use `--ht-tabular` class

**Gradient:** Navy ↔ magenta (`var(--ht-game-pickem)`)

---

#### Route 6: `/fantasy` — Fantasy Landing + Live

**Files:**
- `/app/fantasy/page.tsx`
- `/components/fantasy/FantasyHome.tsx`
- `/components/fantasy/PointsLedger.tsx`

**What to update:**

1. **Landing page** (`/fantasy`):
   - Rules card with `var(--ht-game-fantasy)` gradient (dark forest)
   - Chalk-cream edge: `border: 2px solid var(--ht-game-fantasy-edge)`
   - Padding: `var(--ht-space-6)`

2. **Live/home page**:
   - Lineup: Each player card `p-3` or `p-4` with `gap-3` between
   - Scoring ledger: Use `--ht-tabular` for points
   - Back pill: Sticky top

**Gradient:** Dark forest (`var(--ht-game-fantasy)`)

---

#### Route 7: `/leaderboard` — Leaderboard Page

**Files:**
- `/app/leaderboard/page.tsx`
- `/components/leaderboard/LeaderboardTable.tsx`

**What to update:**

1. **Page layout:**
   - Header: Sticky with `top: 0; z-index: 20`
   - Back pill: Sticky above table with safe-area padding
   - Page padding: `var(--ht-space-4)` horizontal

2. **Table styling:**
   - Header row: Amber accent (`var(--ht-page-leaderboard)`)
   - Data rows: Alternate backgrounds (surface / elevated)
   - Borders: Use `var(--ht-border-strong)` (NOT warm)
   - Padding: `var(--ht-space-3)` inside cells

3. **Spacing:**
   - Gap between sections: `gap-6` or `gap-8`
   - Row height: ~48–52px (comfortable thumb touch)

**Accent:** Amber (`var(--ht-page-leaderboard)`)

---

#### Route 8: `/activity` — Activity & Career Stats

**Files:**
- `/app/activity/page.tsx`
- `/components/activity/ActivityTimeline.tsx`
- `/components/activity/CareerStatsPanel.tsx`

**What to update:**

1. **Activity timeline:**
   - Timeline items: `gap-4` or `gap-3` between events
   - Event card: `padding: var(--ht-space-4)`
   - Timeline line: Blue accent (`var(--ht-page-activity)`)
   - Timestamps: Use `--ht-tabular` class

2. **Career stats:**
   - Stats grid: 2–3 columns with `gap-4`
   - Stat cards: `padding: var(--ht-space-4)`
   - Numbers: Use `--ht-tabular` for alignment

3. **Page layout:**
   - Sections separated by `gap-8`
   - Page padding: `var(--ht-space-4)` horizontal

**Accent:** Blue (`var(--ht-page-activity)`)

---

### TIER 2: Secondary Routes

#### Route 9–12: `/predict`, `/active-games`, `/pending-challenges`, `/prizes`

**General pattern for all:**

1. **Page header:** 
   - Back pill: Sticky top, safe-area padding
   - Title/eyebrow: Use `.ht-eyebrow` + `.ht-h1` or `.ht-h2`

2. **Content spacing:**
   - Section padding: `var(--ht-space-4)` horizontal
   - Section gap: `gap-6` or `gap-8`
   - Item gap: `gap-4` within sections

3. **Accents:**
   - Use page accent tokens (cyan for most, amber for specific pages)
   - Borders: `var(--ht-border-strong)` default, accent color for emphasis

4. **Safe area:**
   - All fixed elements: `padding-bottom: max(env(safe-area-inset-bottom), var(--ht-space-4))`

---

### TIER 3: Utility Routes

#### Route 13–15: `/faqs`, `/advertise`, etc.

**Minimal changes:**
- Page padding: `var(--ht-space-4)`
- Section gap: `gap-6`
- Use appropriate page accent (slate for FAQs, blue for advertise)

---

## Update Pattern: The Template

For **every page file** you update, follow this pattern:

### Step 1: Read the file
```bash
Understand current layout structure
Note any hardcoded padding/margin values
Identify game gradient (if applicable)
```

### Step 2: Update wrapper padding
```typescript
// Before
<div className="p-4 md:p-6">

// After (use consistent spacing)
<div className="p-4 lg:p-6" style={{ padding: `var(--ht-space-4)` }}>
// OR just use Tailwind with explicit values
<div className="px-4 py-6 lg:px-6">
```

### Step 3: Update section gaps
```typescript
// Before
<div className="flex flex-col gap-4">

// After (use spacing scale)
<div className="flex flex-col gap-6">
// OR
<div className="flex flex-col" style={{ gap: `var(--ht-space-6)` }}>
```

### Step 4: Update game gradients (if applicable)
```typescript
// Before
style={{ background: "#some-hex-gradient" }}

// After
style={{ background: `var(--ht-game-trivia)` }}
// OR
className="bg-gradient-to-r from-... to-..." ← replace with var(--ht-game-*)
```

### Step 5: Add back pill styling
```typescript
// Ensure back pill has:
className="fixed top-0 left-4 right-4 z-30 pt-4 lg:pt-6"
// AND safe-area padding
style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
```

### Step 6: Test responsive
```bash
# After each page update:
npm run dev
# Test at: 375px (iPhone SE), 768px (iPad), 1024px (desktop)
```

---

## Game Gradient Reference

Use these in game landing/live pages:

```
Live Trivia:  var(--ht-game-live)      (cyan → blue → violet)
Speed Trivia: var(--ht-game-trivia)    (yellow stripes on black)
Bingo:        var(--ht-game-bingo)     (green felt, cool-ice border)
Pick 'Em:     var(--ht-game-pickem)    (navy ↔ magenta split)
Fantasy:      var(--ht-game-fantasy)   (dark forest, chalk-cream edge)
```

**Critical:** These gradients should appear on the **rules card** and possibly the **background** during live play (depends on design).

---

## Safe Area Handling

On iOS/mobile notches, use:

```typescript
// For fixed elements at bottom:
style={{ paddingBottom: `max(env(safe-area-inset-bottom), ${spaceValue})` }}

// For full-bleed backgrounds:
style={{ paddingBottom: `env(safe-area-inset-bottom)` }}

// In Tailwind (approximate):
className="pb-4 lg:pb-0" // fallback; doesn't handle safe-area in Tailwind natively
```

---

## Validation Checklist — Phase 3

After updating all Tier 1 + Tier 2 routes:

### 1. Spacing consistency
- [ ] All page padding uses 4px multiples (16px, 20px, 24px, etc.)
- [ ] Section gaps consistent (usually `gap-6` or `gap-8`)
- [ ] No ad-hoc `margin: 14px` or `padding: 7px` values
- [ ] Safe-area padding on all fixed elements

### 2. Gradients correct
- [ ] Live Trivia: cyan → blue → violet
- [ ] Bingo: green felt, cool-ice border (NOT warm orange)
- [ ] Pick 'Em: navy ↔ magenta split
- [ ] Fantasy: dark forest with chalk edge
- [ ] Speed Trivia: yellow/lime stripes (if applicable)

### 3. Responsive layout
- [ ] 375px (mobile): No overflow, readable text, tappable buttons
- [ ] 768px (tablet): Adjusted spacing, multi-column layout works
- [ ] 1024px+ (desktop): Proper max-width constraints

### 4. Page accents applied
- [ ] Home/join: Cyan accents
- [ ] Leaderboard: Amber accents
- [ ] Activity: Blue accents
- [ ] Prizes: Gold accents
- [ ] FAQs: Slate accents

### 5. DevTools inspection
```bash
npm run dev
# Visit each Tier 1 page
# Inspect a container element
# Verify:
#   - background uses var(--ht-*) or resolved color
#   - padding/margin values are sensible (16px, 24px, 32px, etc.)
#   - No hardcoded #0f172a, #f8fafc, etc.
```

### 6. Back pill behavior
- [ ] Sticky at top of each page (below safe-area)
- [ ] Stays above content as scroll
- [ ] Has proper padding/safe-area
- [ ] Warm gradient: `#a93d3a → #c8573e → #e9784e`

---

## Key Principles for Phase 3

✅ **Atomic spacing scale** — All gaps/padding use `--ht-space-*` or 4px multiples  
✅ **Game gradients** — Each game has its continuous identity gradient  
✅ **Page accents** — Consistent color coding per route  
✅ **Safe area aware** — All fixed elements respect notches  
✅ **Responsive first** — Test at 375px, 768px, 1024px  
✅ **No hardcoded values** — No `margin: 13px`, `padding: 7px`, etc.  
✅ **Bingo stays cool** — Green felt + ice border, NOT warm  

---

## What Happens Next (Phase 4)

Once Phase 3 is validated:

**Phase 4: Polish & QA** will:
- Final visual polish (shadows, hover states, transitions)
- Remove any remaining `.tp-*` references
- Full responsive QA (mobile, tablet, desktop)
- Animation/transition refinement
- Browser compatibility check
- **Estimated time: 1–2 hours**

---

## Complexity & Effort

**Phase 3 is MEDIUM-HIGH complexity because:**
- ~30 page files need layout/spacing updates
- Responsive behavior must be tested at multiple breakpoints
- Game gradients must be applied correctly (wrong one = visual disaster)
- Safe-area padding adds complexity on mobile

**Estimated time: 2–3 hours** with full responsive testing.

---

## Summary: Phase 3 Mission

✅ Update page layouts to use atomic `--ht-space-*` grid  
✅ Apply game-specific gradients to game landing screens  
✅ Ensure back pill stays sticky with safe-area padding  
✅ Apply page-level accent colors consistently  
✅ Responsive layout verification (375px, 768px, 1024px)  
✅ Remove all hardcoded padding/margin values  

**Phase 3 is complete when:**
- All Tier 1 + Tier 2 routes updated and tested
- Responsive behavior correct at all breakpoints
- DevTools inspection shows proper token usage
- Back pill, gradients, accents all correct
- No ad-hoc spacing values remain

Ready to start Phase 3?
