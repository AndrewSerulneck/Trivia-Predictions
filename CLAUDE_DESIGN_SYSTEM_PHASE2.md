# Claude: Design System Migration — Phase 2

## Your Mission

Update **component styles** across the entire codebase from legacy `.tp-*` class names and hardcoded colors to new `.ht-*` names and CSS custom properties. This is **Phase 2 of 4** — components will now *look* dramatically different.

**Files to edit:** ~50 component files  
**Complexity:** HIGH (surgical replacements across many files)  
**Estimated time:** 3–4 hours  
**Key skills:** CSS custom properties, Tailwind utilities, component architecture

---

## Context: What Phase 2 Does

### Before Phase 2
- Components still use `.tp-card`, `.tp-comic-card` class names
- Hardcoded hex colors like `#0f172a`, `#f8fafc` scattered throughout TSX
- Button styles still use old shadow/border patterns
- Bingo and Leaderboard tables use warm legacy palettes

### After Phase 2
- All `.tp-*` renamed to `.ht-*`
- All hardcoded colors replaced with `var(--ht-*)`
- Buttons, cards, modals, badges updated to new design
- Bingo felt and Leaderboard borders use cool-ice accents
- **Website looks like "a live scoreboard in a premium sports bar"** ✅

### What stays the same
- Component logic, props, and TypeScript structures (NO refactoring)
- DOM hierarchy and accessibility (NO changes)
- Just **styles and class names** change

---

## Strategy: Work in Layers

To avoid chaos, Phase 2 is split into **5 logical layers**:

1. **Layer A: UI primitives** (`/components/ui/` folder)
   - Buttons, cards, modals, inputs, badges
   - These are foundational; all other components depend on them

2. **Layer B: Game-specific cards** 
   - Trivia, Bingo, Pick 'Em, Fantasy game card components
   - Uses game-specific gradients and accents

3. **Layer C: Layout shells & containers**
   - PageShell, AppShell, GameLandingExperience
   - Wraps content and applies page-level accents

4. **Layer D: Data visualization**
   - LeaderboardTable, ActivityTimeline, CareerStats
   - Tables and lists with accent-colored borders

5. **Layer E: Forms & joins**
   - JoinFlow, ad forms, input sequences
   - Text colors, button states, focus rings

**Within each layer, you'll make edits in order.** Don't skip ahead.

---

## LAYER A: UI Primitives

### Files in this layer
- `/components/ui/PageShell.tsx`
- `/components/ui/AppShell.tsx`
- `/components/ui/BouncingBallLoader.tsx`
- `/components/ui/HightopLogo.tsx`
- `/components/ui/LeftHamburgerMenu.tsx`
- `/components/ui/LeftHamburgerNav.tsx`
- `/components/ui/MobileBottomNav.tsx`
- `/components/ui/NotificationBell.tsx`
- And other UI files...

### What to do in Layer A

**For each file:**

1. **Search for `.tp-` class names** and replace with `.ht-` equivalent:
   - `.tp-card` → `.ht-dark-card`
   - `.tp-comic-card` → `.ht-dark-card`
   - `.tp-hud-card` → `.ht-dark-card`
   - `.tp-game-card-btn` → `.ht-game-card-btn` (keep, add .ht prefix)
   - Any other `.tp-*` → `.ht-*`

2. **Search for hardcoded hex colors** and replace with CSS custom properties:
   - `#0f172a` → `var(--ht-surface)`
   - `#1e293b` → `var(--ht-elevated)`
   - `#334155` → `var(--ht-elevated-2)`
   - `#f8fafc` → `var(--ht-fg-primary)`
   - `#e2e8f0` → `var(--ht-fg-secondary)`
   - `#94a3b8` → `var(--ht-fg-muted)`
   - Any cyan colors → `var(--ht-cyan-*)`
   - Any amber colors → `var(--ht-amber-*)`
   - etc.

3. **Update inline styles** in JSX:
   - Change `backgroundColor: "#0f172a"` → `backgroundColor: "var(--ht-surface)"`
   - Change `color: "#f8fafc"` → `color: "var(--ht-fg-primary)"`
   - Change `borderColor: "rgba(255,255,255,0.08)"` → `borderColor: "var(--ht-border-hairline)"`

4. **Update Tailwind utilities** in className strings:
   - `bg-slate-900` → `bg-ht-surface`
   - `text-slate-50` → `text-ht-primary`
   - `border-slate-700` → `border-ht-strong`
   - `shadow-lg` → `shadow-ht-card`
   - etc.

5. **Verify button states** — ensure hover/active states use transform/opacity only (no lightening):
   - On hover: `transform: scale(0.98)` or `opacity: 0.9`
   - NOT `bg-opacity-20` or lightening the background

6. **Test in browser** — run `npm run dev`, navigate to a page using the component, verify it looks correct

---

## LAYER A — Detailed Edit Examples

### Example 1: `/components/ui/PageShell.tsx`

**Search for this pattern:**
```typescript
className="flex flex-col gap-4 p-4 bg-slate-900 border border-slate-700 rounded-lg"
```

**Replace with:**
```typescript
className="flex flex-col gap-4 p-4 bg-ht-surface border border-ht-strong rounded-ht-lg"
```

**Or if using inline styles:**
```typescript
style={{
  backgroundColor: "#0f172a",
  borderColor: "#334155",
  color: "#f8fafc"
}}
```

**Replace with:**
```typescript
style={{
  backgroundColor: "var(--ht-surface)",
  borderColor: "var(--ht-strong)",
  color: "var(--ht-fg-primary)"
}}
```

---

### Example 2: Button with icon

**Before:**
```typescript
<button
  className="px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-50 font-bold hover:bg-slate-800"
  style={{ boxShadow: "0 8px 24px rgba(0, 0, 0, 0.40)" }}
>
  Click me
</button>
```

**After:**
```typescript
<button
  className="px-4 py-2 bg-ht-surface border border-ht-soft rounded-ht-md text-ht-primary font-bold hover:opacity-90 transition-opacity"
  style={{ boxShadow: "var(--ht-shadow-card)" }}
>
  Click me
</button>
```

**Key changes:**
- `bg-slate-900` → `bg-ht-surface`
- `border-slate-600` → `border-ht-soft`
- `rounded-lg` → `rounded-ht-md`
- `text-slate-50` → `text-ht-primary`
- `hover:bg-slate-800` → `hover:opacity-90 transition-opacity` (opacity, not color change)
- `boxShadow: "..."` → `boxShadow: "var(--ht-shadow-card)"`

---

### Example 3: Card with accent border

**Before:**
```typescript
<div
  className="p-4 bg-slate-900 border border-slate-200 rounded-2xl"
  style={{ borderColor: "#22d3ee" }}
>
  Content
</div>
```

**After:**
```typescript
<div
  className="p-4 bg-ht-surface border-2 rounded-ht-lg"
  style={{ borderColor: "var(--ht-cyan-400)" }}
>
  Content
</div>
```

**Or using Tailwind (if cyan is the page accent):**
```typescript
<div className="p-4 bg-ht-surface border-2 border-cyan-400 rounded-ht-lg">
  Content
</div>
```

---

## LAYER A — Step-by-step process

### Step 1: List all files needing updates

Read `/components/ui/` to understand which files exist. Prioritize:
1. Buttons, cards, modals (foundational)
2. Loaders, logos (simple)
3. Navigation (bottom nav, hamburger)

### Step 2: Update each file

**For each UI file:**

```bash
# Do NOT edit yet — just understand the pattern
1. Read the file to understand current state
2. Search for .tp-* class names
3. Search for hardcoded colors (#0f172a, #f8fafc, etc.)
4. Make targeted replacements (class names first, then colors)
5. Verify the file syntax is correct
6. Test in browser
```

### Step 3: Validate Layer A

Once all UI files are updated:
```bash
npm run dev
# Navigate to a page that uses buttons, cards, modals
# Verify they look correct with new colors and styles
# Check DevTools for any CSS errors
```

---

## LAYER B: Game-Specific Cards

### Files in this layer
- `/components/trivia/TriviaGame.tsx`
- `/components/trivia/TriviaAppFrame.tsx`
- `/components/bingo/BingoThemeScope.tsx`
- `/components/bingo/ActionPop.tsx`
- `/components/pickem/PickEmGameList.tsx`
- `/components/fantasy/FantasyHome.tsx`
- Game identity cards and rule panels

### What to do in Layer B

**For each file:**

1. **Update game gradient references:**
   - Live Trivia cards: Use `var(--ht-game-live)` for gradient, `var(--ht-game-live-edge)` for border
   - Speed Trivia cards: Use `var(--ht-game-trivia)` and `var(--ht-game-trivia-stripe)`
   - Bingo cards: Use `var(--ht-game-bingo)` and `var(--ht-game-bingo-edge)` (cool ice, NOT warm)
   - Pick 'Em cards: Use `var(--ht-game-pickem)` and `var(--ht-game-pickem-edge)`
   - Fantasy cards: Use `var(--ht-game-fantasy)` and `var(--ht-game-fantasy-edge)`

2. **Update semantic type classes:**
   - Game titles: Add `className="ht-display"` or `ht-h1`
   - Game rules: Use `.ht-body` or `.ht-caption`
   - Question text: Use `.ht-question`
   - Eyebrow labels: Use `.ht-eyebrow` with accent color

3. **Replace all `.tp-*` names with `.ht-*`**

4. **Replace all hardcoded colors with `var(--ht-*)`**

---

## LAYER C: Layout Shells & Containers

### Files in this layer
- `/components/venue/GameLandingExperience.tsx`
- `/components/venue/VenueHubClient.tsx`
- `/components/activity/ActiveGamesPanel.tsx`
- `/components/challenges/PendingChallengesPanel.tsx`
- etc.

### What to do in Layer C

These files set page-level accents. Update to use page accent tokens:

```typescript
// For home/venue pages
style={{ borderColor: "var(--ht-page-home)" }}  // cyan

// For leaderboard
style={{ borderColor: "var(--ht-page-leaderboard)" }}  // amber

// For activity
style={{ borderColor: "var(--ht-page-activity)" }}  // blue

// For prizes
style={{ borderColor: "var(--ht-page-prizes)" }}  // gold
```

---

## LAYER D: Data Visualization

### Files in this layer
- `/components/leaderboard/LeaderboardTable.tsx`
- `/components/activity/ActivityTimeline.tsx`
- `/components/activity/CareerStatsPanel.tsx`
- `/components/fantasy/PointsLedger.tsx`
- Tables, timelines, and lists

### What to do in Layer D

**For LeaderboardTable specifically:**
- Border colors: Use `var(--ht-page-leaderboard)` (amber, NOT warm)
- Row backgrounds: Alternate between `var(--ht-surface)` and `var(--ht-elevated)`
- Text: `var(--ht-fg-primary)` for names, `var(--ht-fg-muted)` for scores/metadata
- Remove any legacy brown/wood-frame styling

**For ActivityTimeline:**
- Timeline line: Use `var(--ht-page-activity)` (blue)
- Event badges: Use accent colors matching event type
- Text: `var(--ht-fg-secondary)` for body, `var(--ht-fg-muted)` for timestamps

---

## LAYER E: Forms & Joins

### Files in this layer
- `/components/join/JoinFlow.tsx`
- `/components/admin/sections/adFormShared.tsx`
- `/components/ads/AdvertisingIntakeForm.tsx`
- Input sequences, PIN entry, form fields

### What to do in Layer E

**Focus on:**
1. Input styling:
   - `backgroundColor: var(--ht-elevated)`
   - `borderColor: var(--ht-border-soft)` (default), `var(--ht-focus-ring)` (on focus)
   - `color: var(--ht-fg-primary)` (text), `var(--ht-fg-dim)` (placeholder)

2. Button states:
   - Idle: `bg-ht-surface border-ht-soft`
   - Hover: `opacity-90`
   - Active/disabled: `opacity-60`

3. Focus rings:
   - Use `outline: 2px solid var(--ht-cyan-400)` or `boxShadow: var(--ht-focus-ring)`

4. Error states:
   - `color: var(--ht-rose-500)`
   - `borderColor: var(--ht-rose-500)`

---

## Global Find & Replace Patterns

Use these patterns to speed up replacements. **Apply to all Phase 2 files:**

### Pattern 1: Class name replacements

| Legacy | New |
|--------|-----|
| `.tp-card` | `.ht-dark-card` |
| `.tp-comic-card` | `.ht-dark-card` |
| `.tp-hud-card` | `.ht-dark-card` |
| `.tp-button` | `.ht-button` (or use Tailwind) |
| `.tp-input` | `.ht-input` (or use Tailwind) |

### Pattern 2: Color replacements

| Legacy (hex) | New (token) |
|---|---|
| `#020617` | `var(--ht-canvas)` |
| `#0f172a` | `var(--ht-surface)` |
| `#1e293b` | `var(--ht-elevated)` |
| `#334155` | `var(--ht-elevated-2)` |
| `#f8fafc` | `var(--ht-fg-primary)` |
| `#e2e8f0` | `var(--ht-fg-secondary)` |
| `#94a3b8` | `var(--ht-fg-muted)` |
| `#64748b` | `var(--ht-fg-dim)` |
| `rgba(255,255,255,0.08)` | `var(--ht-border-hairline)` |
| `rgba(255,255,255,0.12)` | `var(--ht-border-soft)` |
| `rgba(255,255,255,0.20)` | `var(--ht-border-strong)` |

### Pattern 3: Tailwind utility replacements

| Legacy | New |
|--------|-----|
| `bg-slate-900` | `bg-ht-surface` |
| `bg-slate-800` | `bg-ht-elevated` |
| `bg-slate-700` | `bg-ht-elevated-2` |
| `text-slate-50` | `text-ht-primary` |
| `text-slate-200` | `text-ht-secondary` |
| `text-slate-400` | `text-ht-muted` |
| `text-slate-500` | `text-ht-dim` |
| `border-slate-700` | `border-ht-strong` |
| `border-slate-600` | `border-ht-soft` |
| `rounded-lg` | `rounded-ht-lg` |
| `rounded-2xl` | `rounded-ht-2xl` |
| `rounded-full` | `rounded-ht-pill` |
| `shadow-lg` | `shadow-ht-card` |
| `shadow-xl` | `shadow-ht-modal` |

---

## Testing After Each Layer

After completing each layer, run:

```bash
npm run dev
# Navigate to pages that use components from that layer
# Check colors, shadows, borders, text
# Open DevTools → Elements, inspect a component
# Verify class names use .ht-* and colors use var(--ht-*)
```

---

## Validation Checklist — Full Phase 2

Once all 5 layers are done:

### 1. Search for legacy patterns
```bash
# Should return 0 results:
grep -r "\.tp-card" src/
grep -r "\.tp-comic-card" src/
grep -r "\.tp-button" src/
grep -r "#0f172a" src/
grep -r "#f8fafc" src/
grep -r "rgba(255,255,255,0.08)" src/
```

### 2. Check for remaining .tp-* class names
```bash
grep -r "\.tp-" src/components/ | grep -v "\.tp-vh" | grep -v "\.tp-admin-theme"
# Should only show theme modifiers and --tp-vh variable references
```

### 3. Spot-check 5 pages
- `/` (home) — cyan accents, dark background
- `/venue/[id]` — cyan accents, game cards with gradients
- `/leaderboard` — amber accents, table with accent borders
- `/bingo` — green felt with cool-ice border (NOT warm)
- `/trivia/live` — broadcast gradient (should already be correct from Phase 1)

### 4. DevTools inspection
- Open any page
- Inspect a card: `background-color` should be `rgb(15, 23, 42)` (which is `#0f172a`)
- Inspect a button: `border-color` should use `var(--ht-*)` or resolved RGB value
- No hardcoded `#0f172a` or `#f8fafc` in inline styles

### 5. Responsive check
- Open `/venue/[id]` on mobile (375px width)
- Cards should have correct spacing and not overflow
- Text should be readable, colors correct
- Buttons should be tappable (min 44px)

---

## Key Principles for Phase 2

✅ **Only change styles, never logic**  
✅ **Always use CSS custom properties instead of hardcoded hex**  
✅ **Rename all `.tp-*` → `.ht-*` for consistency**  
✅ **Use semantic type classes (`.ht-display`, `.ht-body`, `.ht-eyebrow`)**  
✅ **Game gradients must match their identity (Live Trivia = cyan/blue/violet, etc.)**  
✅ **Exit pill stays warm (the only exception to dark aesthetic)**  
✅ **Bingo uses cool-ice border, NOT warm orange**  
✅ **Hover states use opacity/transform, never color changes**  

---

## What Happens Next (Phase 3)

Once Phase 2 is validated:

**Phase 3** will update:
- Page-level layouts and spacing (using `--ht-space-*` scale)
- Game landing screens with gradients
- Hamburger drawer styling
- Bottom navigation (venue switcher)
- Responsive adjustments

---

## Complexity & Effort

**Phase 2 is HIGH complexity because:**
- 50+ files need updates
- Multiple patterns (class names, hex colors, inline styles, Tailwind utilities)
- Must be surgical — no over-refactoring
- Requires frequent validation (DevTools inspection)

**Estimated time: 3–4 hours** with verification pauses.

---

## Summary: Phase 2 Mission

✅ Rename all `.tp-*` class names → `.ht-*`  
✅ Replace all hardcoded `#0f172a`, `#f8fafc`, etc. → `var(--ht-*)`  
✅ Update Tailwind utilities to use new color scale  
✅ Apply semantic type classes (`.ht-display`, `.ht-body`, etc.)  
✅ Update button/card/input/modal styles to new design  
✅ Apply game-specific gradients (Live Trivia, Bingo, Pick 'Em, Fantasy, Speed Trivia)  
✅ Reskin Bingo and Leaderboard with cool-ice accents  
✅ Verify no legacy patterns remain  

**Phase 2 is complete when:**
- All 5 layers updated
- No `.tp-*` class names in components (except theme modifiers)
- No hardcoded legacy hex colors in component files
- All 5 spot-check pages look correct
- DevTools inspection confirms `var(--ht-*)` usage

Ready to start Phase 2?
