# Complete Visual & Structural Overhaul — Master Prompt

## Executive Summary

Your website currently has correct **CSS foundation** (from Phase 1–2) but **misses critical pixel-perfect alignment** to the mockups in:
- `/design-system/project/preview/*.html` (component specs)
- `/design-system/project/colors_and_type.css` (color/type system)
- `/.github/design-mockups/*.png` (page layouts)

This master prompt breaks the overhaul into **5 sequential, focused sub-prompts**, each with explicit execution plans, file modifications, and validation checkpoints.

**Total estimated work: 10–14 hours of HIGH-EFFORT Claude work**  
**Intelligence required: MAXIMUM (for Prompts 1–3, High for Prompts 4–5)**

---

## The Core Gap: What's Missing

### What You Have ✅
- CSS tokens correctly defined in `/app/globals.css`
- Tailwind config extended with color tokens
- Component structure in place (Phase 2)
- Page layouts exist (Phase 3)

### What's Missing ❌
- **Layout precision:** Game buttons not in correct grid, spacing wrong
- **Component pixel-perfection:** Cards lack exact shadows/borders/padding from spec
- **Typography enforcement:** Not all text uses correct font weight/size/spacing
- **Game gradients:** Not applied to landing screens / backgrounds
- **UI polish:** Hover states, focus rings, transitions don't match spec
- **Responsive breakpoints:** May be off by a few pixels
- **Navbar/header structure:** Venue name centering, alert button placement wrong
- **Hamburger drawer:** Username/points placement needs overhaul
- **Countdown section:** Missing entirely or wrong styling
- **Leaderboard table:** Rank badges, row styling not matching spec
- **Post-game cards:** Missing crown icon, champion banner styling
- **Form inputs:** Focus states, borders not matching spec
- **Buttons:** Exit pill styling, dimensions, hover not correct

---

## Validation Strategy

**Before executing prompts:**
1. Open `/design-system/project/preview/component-buttons.html` in browser → **reference image**
2. Open your local `/trivia/live` page → **compare to spec**
3. Note differences in: colors, sizing, shadows, padding, borders, spacing
4. Execute prompt, then **compare side-by-side again**

**After each prompt execution:**
- [ ] DevTools inspect element → verify colors match spec
- [ ] Measure padding/spacing → matches token scale (4px grid)
- [ ] Test hover/focus → smooth transitions, correct colors
- [ ] Screenshot at 375px, 768px, 1024px → compare to PNG mockups

---

# PROMPT 1 OF 5: Global Styles Enforcement & Theme Tokens

**Intelligence Required: MAXIMUM**  
**Estimated Time: 1.5–2 hours**  
**Priority: CRITICAL (foundation)**

## Mission

Rebuild `/app/globals.css` to become an **exhaustive, non-negotiable specification** for all visual properties. This is the single source of truth that all components must obey.

## Execution Plan (MUST output before any code)

**Files to create/modify:**
1. `/app/globals.css` — **COMPLETE REWRITE** with 150+ CSS rules (currently 1158 lines, will expand to 1400+ lines)
   - Add `html`, `body` base styles (background, font-family, line-height, -webkit-font-smoothing)
   - Add semantic `.ht-*` type classes (`.ht-display`, `.ht-h1`, `.ht-h2`, `.ht-question`, `.ht-body`, `.ht-caption`, `.ht-eyebrow`, `.ht-tabular`)
   - Add component base styles (`.ht-card`, `.ht-btn-primary`, `.ht-btn-exit`, `.ht-input`, `.ht-select`)
   - Add utility classes (`.ht-focus-ring`, `.ht-truncate-2`, `.ht-truncate-3`)
   - Ensure NO inline styles bypass this specification

2. `/tailwind.config.ts` — **EXTEND theme with component utilities**
   - Add `@apply` utilities that reference the new CSS classes
   - Ensure Tailwind respects the color tokens (no Tailwind primitives override spec)

**Scope:** GLOBAL — every future component must inherit from these base styles.

---

## Prompt Template for Claude (Copy-Paste Ready)

```markdown
# PROMPT 1: Global Styles Enforcement — Atomic Type Classes & Component Bases

You are a frontend architect tasked with establishing the absolute specification for global styles 
across a Next.js application. Your work here will be inherited by 150+ component files and must be 
EXHAUSTIVE, NON-NEGOTIABLE, and PIXEL-PERFECT to match the design specifications.

## Your Task

**BEFORE you write ANY code, output a 3-bullet execution plan:**
- Bullet 1: Files you will modify (and WHY — what gap each fills)
- Bullet 2: Total number of CSS rules you will add/modify (estimate)
- Bullet 3: Key design principles you will enforce (3–5 bullets)

**AFTER the execution plan, implement:**

### 1. Base Typography Classes

In `/app/globals.css`, add these semantic type classes AFTER the `:root` CSS custom properties block:

```css
/* Semantic Type Classes — MANDATORY for all text */

.ht-display {
  font-family: var(--ht-font-display);
  font-size: 44px;
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.02em;
  text-transform: uppercase;
}

.ht-h1 {
  font-family: var(--ht-font-display);
  font-size: 36px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: 0.04em;
}

.ht-h2 {
  font-family: var(--ht-font-display);
  font-size: 30px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: 0.02em;
}

.ht-question {
  font-family: var(--ht-font-body);
  font-size: 36px;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: 0.04em;
}

.ht-body {
  font-family: var(--ht-font-body);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--ht-fg-primary);
}

.ht-caption {
  font-family: var(--ht-font-body);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--ht-fg-secondary);
}

.ht-eyebrow {
  font-family: var(--ht-font-body);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ht-cyan-300);
}

.ht-tabular {
  font-family: var(--ht-font-body);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
```

### 2. Base Component Classes

Add these base component styles (they will be inherited / extended by React components):

```css
/* Base card — used by CardFrame, GameCard, RulesCard, etc. */
.ht-card {
  border-radius: var(--ht-radius-lg);
  background: var(--ht-surface);
  border: 1px solid var(--ht-border-hairline);
  box-shadow: var(--ht-shadow-card);
  padding: var(--ht-space-6);
}

.ht-card.accent {
  border-color: rgba(34, 211, 238, 0.60);
}

/* Base button — primary action */
.ht-btn-primary {
  font-family: var(--ht-font-body);
  font-size: 14px;
  font-weight: 900;
  padding: var(--ht-space-3) var(--ht-space-5);
  border-radius: var(--ht-radius-md);
  background: var(--ht-cyan-400);
  color: #0f172a;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}

.ht-btn-primary:hover {
  background: var(--ht-cyan-500);
  transform: translateY(-1px);
}

.ht-btn-primary:active {
  transform: translateY(0);
}

.ht-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* Exit pill — ONLY warm element on screen */
.ht-btn-exit {
  background: linear-gradient(to right, var(--ht-exit-from), var(--ht-exit-via), var(--ht-exit-to));
  border: 1px solid var(--ht-exit-border);
  color: var(--ht-exit-text);
  border-radius: var(--ht-radius-pill);
  padding: var(--ht-space-3) var(--ht-space-5);
  font-family: var(--ht-font-body);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 1px 3px rgba(28, 43, 58, 0.35);
}

.ht-btn-exit:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(28, 43, 58, 0.5);
}

/* Base input — form fields */
.ht-input {
  background: var(--ht-elevated);
  border: 1px solid var(--ht-border-soft);
  border-radius: var(--ht-radius-md);
  padding: var(--ht-space-3) var(--ht-space-4);
  font-family: var(--ht-font-body);
  font-size: 14px;
  font-weight: 600;
  color: var(--ht-fg-primary);
  transition: all 0.15s ease;
}

.ht-input::placeholder {
  color: var(--ht-fg-dim);
}

.ht-input:focus {
  outline: none;
  background: var(--ht-elevated-2);
  border-color: var(--ht-cyan-400);
  box-shadow: var(--ht-focus-ring);
}

/* Utility classes */
.ht-focus-ring {
  box-shadow: var(--ht-focus-ring);
}

.ht-truncate-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ht-truncate-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

### 3. HTML & Body Base

Replace your current `html, body` rules with:

```css
html, body {
  margin: 0;
  padding: 0;
  background: var(--ht-canvas);
  color: var(--ht-fg-primary);
  font-family: var(--ht-font-body);
  font-weight: 600;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

html {
  height: 100%;
}

body {
  min-height: 100%;
  overflow-x: hidden;
}
```

### 4. Extend `/tailwind.config.ts`

Add these `@apply` utilities so Tailwind respects the spec:

```typescript
// In your Tailwind extend.components block:

const withOpacityValue = (variable) => {
  return `hsla(var(${variable}), <alpha-value>)`
}

// Add to extend.components:
{
  '.ht-card': {
    '@apply': 'rounded-ht-lg bg-ht-surface border border-ht-hairline shadow-ht-card p-ht-6'
  },
  '.ht-btn-primary': {
    '@apply': 'px-ht-5 py-ht-3 rounded-ht-md bg-ht-cyan-400 text-slate-900 font-900 text-sm hover:bg-ht-cyan-500 active:scale-95 transition-all'
  },
  '.ht-input': {
    '@apply': 'bg-ht-elevated border border-ht-soft rounded-ht-md px-ht-4 py-ht-3 font-600 text-sm text-ht-primary placeholder-ht-dim focus:bg-ht-elevated-2 focus:border-ht-cyan-400 focus:ring-ht-focus-ring'
  },
}
```

### Validation Checklist

After modifying these files:

- [ ] `/app/globals.css` now contains 80+ new CSS rules (count them)
- [ ] All semantic type classes present (`.ht-display` through `.ht-tabular`)
- [ ] All component base classes present (`.ht-card`, `.ht-btn-*`, `.ht-input`)
- [ ] `html, body` rules updated
- [ ] No hardcoded colors in these base styles (all use `var(--ht-*)`)
- [ ] DevTools: Inspect `<html>` element → verify it has `background: #020617` (from var)
- [ ] DevTools: Add class `.ht-body` to a div → verify font is Nunito, size 16px, weight 600
- [ ] Tailwind build completes without errors

### Key Principles Enforced

1. **SINGLE SOURCE OF TRUTH** — All styles originate in globals.css or Tailwind config, NEVER in component files
2. **TOKEN OBEDIENCE** — Every color, font, size, radius uses a CSS custom property from `:root`
3. **SEMANTIC CLASSES** — Text hierarchy (display, h1, h2, body, caption) is MANDATORY
4. **NO EXCEPTIONS** — Any component that breaks these rules is a bug to be fixed

**Output format:**
- 3-bullet execution plan FIRST
- Then the complete code (CSS rules in globals.css, Tailwind extensions)
- Then validation instructions
- NO SPECULATION — use the exact specs from the design system
```

---

# PROMPT 2 OF 5: UI Component Library Alignment

**Intelligence Required: MAXIMUM**  
**Estimated Time: 2–2.5 hours**  
**Priority: CRITICAL (affects 30+ components)**

## Mission

Update **every button, input, card, badge, and tab component** to use the exact styling from the design spec `.html` files. This is the layer that makes the website LOOK right.

## Execution Plan (MUST output before code)

**Files to inspect and modify:**
- `/components/ui/PageShell.tsx` — page wrapper
- `/components/ui/LeftHamburgerMenu.tsx` — hamburger drawer
- `/components/ui/MobileBottomNav.tsx` — bottom nav
- `/components/ui/NotificationBell.tsx` — notification dropdown
- `/components/trivia/TriviaGame.tsx` — live game screen
- `/components/trivia/TriviaAppFrame.tsx` — game frame/wrapper
- `/components/trivia/ReadyPrompt.tsx` — "enter lobby" screen
- `/components/bingo/BingoThemeScope.tsx` — bingo background wrapper
- `/components/leaderboard/LeaderboardTable.tsx` — leaderboard
- `/components/predictions/PredictionMarketList.tsx` — predictions
- All `/components/ui/` button-like components

**Key changes:**
- Replace all `bg-slate-*`, `text-slate-*` with `bg-ht-*`, `text-ht-*`
- Apply exact shadows from spec (`.ht-card`, `.ht-modal`, `.ht-glow-cyan`)
- Add focus rings to all interactive elements
- Apply semantic type classes (`.ht-eyebrow`, `.ht-body`, `.ht-caption`)
- Update button dimensions to match spec (padding, border-radius)
- Fix tab styling (active border, accent color)

## Prompt Template

```markdown
# PROMPT 2: UI Component Library Alignment — Pixel-Perfect Button, Card, Input, Tab Styling

You are updating every visual component to match the HTML spec files in 
`/design-system/project/preview/component-*.html`. Your changes will affect 40+ React components 
and must be EXACT — pixel-for-pixel matching.

## Your Task

**BEFORE you write ANY code, output a 3-bullet execution plan:**
- Bullet 1: List of 15–20 component files you will modify (group by category: buttons, cards, inputs, tabs)
- Bullet 2: Key spec files you will reference for each category (e.g., `/design-system/project/preview/component-buttons.html`)
- Bullet 3: Non-negotiable changes (list 5–7 key overhauls, e.g., "Remove all bg-slate-*, replace with bg-ht-* from spec")

## Step 1: Button Component Updates

### Reference Spec
Open `/design-system/project/preview/component-buttons.html` → you will match this EXACTLY.

**Spec extract:**
- Primary button: `background: var(--ht-cyan-400); color: #0f172a; font-weight: 900; padding: 12px 18px; border-radius: 12px`
- Exit pill: `gradient(#a93d3a → #c8573e → #e9784e); border-radius: 9999px; min-height: 44px; padding: 0 18px`
- Ghost button: `background: rgba(34, 211, 238, 0.12); color: var(--ht-cyan-200); border: 1px solid rgba(34, 211, 238, 0.40)`
- Answer/locked: `background: var(--ht-emerald-500); color: #0f172a; border-radius: 14px; font-weight: 900`

### Implementation

Update ALL button components to use this pattern:

```typescript
// Example: PrimaryButton.tsx (or wherever your button lives)

export const PrimaryButton = ({ children, disabled, className, ...props }) => (
  <button
    className={cn(
      "px-5 py-3 rounded-ht-md font-900 text-sm transition-all",
      "bg-ht-cyan-400 text-slate-900 hover:bg-ht-cyan-500",
      "active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
      className
    )}
    disabled={disabled}
    {...props}
  >
    {children}
  </button>
)

// Example: ExitPillButton.tsx

export const ExitPillButton = ({ children, className, ...props }) => (
  <button
    className={cn(
      "min-h-11 px-ht-5 rounded-ht-pill font-700 text-sm transition-all",
      "bg-gradient-to-r from-ht-exit-from via-ht-exit-via to-ht-exit-to",
      "text-ht-exit-text border border-ht-exit-border",
      "hover:shadow-lg hover:translate-y-[-2px]",
      className
    )}
    {...props}
  >
    {children}
  </button>
)

// Example: GhostButton.tsx

export const GhostButton = ({ children, className, ...props }) => (
  <button
    className={cn(
      "px-4 py-2 rounded-ht-md font-700 text-sm transition-all",
      "bg-cyan-400/12 text-ht-cyan-200 border border-cyan-400/40",
      "hover:bg-cyan-400/20 active:scale-95",
      className
    )}
    {...props}
  >
    {children}
  </button>
)
```

## Step 2: Card Component Updates

### Reference Spec
Open `/design-system/project/preview/component-card.html` → match this.

**Spec extract:**
- Default card: `background: #0f172a; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; shadow: 0 8 24 / 0.40; padding: 18px`
- Accent card: `border: 1px solid rgba(cyan-400, 0.60); eyebrow: cyan-300`

### Implementation

Update ALL card components (CardFrame, RulesCard, GameCard, etc.):

```typescript
// Example: CardFrame.tsx

export const CardFrame = ({ children, accent = false, className, ...props }) => (
  <div
    className={cn(
      "rounded-ht-lg bg-ht-surface border shadow-ht-card p-ht-6",
      accent ? "border-cyan-400/60" : "border-ht-hairline",
      className
    )}
    {...props}
  >
    {children}
  </div>
)

// Example: GameCard.tsx

export const GameCard = ({ title, eyebrow, accent, children, className, ...props }) => (
  <div
    className={cn(
      "rounded-ht-lg bg-ht-surface border shadow-ht-card p-ht-6",
      accent ? "border-cyan-400/60" : "border-ht-hairline",
      className
    )}
    {...props}
  >
    {eyebrow && <div className="ht-eyebrow mb-2">{eyebrow}</div>}
    {title && <div className="ht-h2">{title}</div>}
    {children}
  </div>
)
```

## Step 3: Input Component Updates

### Reference Spec
Open `/design-system/project/preview/component-inputs.html` → match this.

**Spec extract:**
- Background: `#1e293b` (elevated)
- Border: `1px solid rgba(255,255,255,0.12)`
- Focus: `border-color: cyan-400; box-shadow: var(--ht-focus-ring)`
- Padding: `12px 16px`
- Border-radius: `12px`

### Implementation

```typescript
// Example: TextInput.tsx

export const TextInput = ({ className, ...props }) => (
  <input
    className={cn(
      "w-full bg-ht-elevated border border-ht-soft rounded-ht-md px-ht-4 py-ht-3",
      "font-600 text-sm text-ht-primary placeholder-ht-dim",
      "focus:outline-none focus:bg-ht-elevated-2 focus:border-ht-cyan-400",
      "focus:shadow-ht-focus-ring transition-all",
      className
    )}
    {...props}
  />
)
```

## Step 4: Tab Component Updates

### Reference Spec
Open `/design-system/project/preview/` for tab examples (if exists; else use spec from leaderboard post-game).

**Spec pattern:**
- Active tab: `border-b-2 border-cyan-400; text-cyan-300`
- Inactive tab: `border-b-2 border-transparent; text-ht-fg-secondary`

### Implementation

```typescript
// Example: TabControl.tsx

export const TabControl = ({ tabs, activeTab, onChange, className, ...props }) => (
  <div className={cn("flex gap-4 border-b border-ht-border-strong", className)} {...props}>
    {tabs.map(tab => (
      <button
        key={tab.id}
        onClick={() => onChange(tab.id)}
        className={cn(
          "pb-3 px-2 font-700 text-sm transition-colors border-b-2",
          activeTab === tab.id
            ? "border-ht-cyan-400 text-ht-cyan-300"
            : "border-transparent text-ht-fg-secondary hover:text-ht-fg-primary"
        )}
      >
        {tab.label}
      </button>
    ))}
  </div>
)
```

## Step 5: Focus Ring Enforcement

Every interactive element (button, input, link, checkbox) must have a focus ring:

```typescript
// Add this to your utility file:

export const focusRingClasses = "focus:outline-none focus:ring-2 focus:ring-ht-cyan-400 focus:ring-offset-2 focus:ring-offset-ht-canvas"

// Then use in components:
<button className={`ht-btn-primary ${focusRingClasses}`}>
  Action
</button>
```

## Step 6: Validation

After updating components:

- [ ] All buttons use `.ht-btn-primary`, `.ht-btn-exit`, or `.ht-btn-ghost` classes (no inline styles)
- [ ] All cards use `.ht-card` or component wrapper (no hardcoded colors)
- [ ] All inputs use `.ht-input` (no inline styles)
- [ ] All text uses semantic type classes (`.ht-body`, `.ht-eyebrow`, etc.)
- [ ] No `bg-slate-*`, `text-slate-*`, `border-slate-*` classes remain
- [ ] Focus rings on ALL interactive elements
- [ ] Hover states use opacity or color changes (not bare CSS)
- [ ] Shadows use `shadow-ht-*` utilities

### Testing Checklist

- [ ] Open local app → `/join` page
  - Inputs have focus ring when clicked
  - Button is cyan, has correct padding
  - Text follows semantic classes
- [ ] Open `/leaderboard` page
  - Table rows have correct styling
  - Rank badges match spec colors
  - Eyebrows are uppercase, tracked, cyan-300
- [ ] Open trivia game page
  - Question text uses `.ht-question` class
  - Buttons have correct dimensions
  - Card shadows are visible

### Output Format

1. 3-bullet execution plan FIRST
2. Code updates for each file (show the COMPLETE updated component, not diffs)
3. Validation checklist
4. NO SPECULATION — reference the spec files for every color/size/radius/shadow

---

**Next Prompt (3/5) will handle Page Layouts & Responsiveness**
```

---

# PROMPT 3 OF 5: Game Landing Screens & Gradient Styling

**Intelligence Required: MAXIMUM**  
**Estimated Time: 1.5–2 hours**  
**Priority: CRITICAL (visual identity)**

## Mission

Apply game-specific gradients and styling to the 5 game landing screens. Each game must have its **continuous visual identity** from venue hub button → landing rules card → live gameplay.

## Execution Plan

**Files to modify:**
- `/app/trivia/page.tsx` — Live Trivia landing
- `/app/bingo/page.tsx` — Bingo landing
- `/app/pickem/page.tsx` — Pick'Em landing
- `/app/fantasy/page.tsx` — Fantasy landing
- Any game card wrapper components

**Key changes:**
- Apply `var(--ht-game-live)` gradient to Live Trivia
- Apply `var(--ht-game-trivia)` stripe pattern to Speed Trivia
- Apply `var(--ht-game-bingo)` (casino felt) to Bingo
- Apply `var(--ht-game-pickem)` (navy/magenta split) to Pick'Em
- Apply `var(--ht-game-fantasy)` (dark forest) to Fantasy

## Prompt Template

```markdown
# PROMPT 3: Game Landing Screens & Gradient Identity Styling

Your mission: Make each game's landing page instantly recognizable by its continuous gradient identity. 
Every game has a specific background gradient that runs from the venue hub button through the entire game experience.

## Your Task

**BEFORE you write ANY code, output a 3-bullet execution plan:**
- Bullet 1: List the 5 game files you will modify and their gradient tokens
- Bullet 2: Confirm the gradient values for each game (from `/app/globals.css`)
- Bullet 3: Describe how you will apply each gradient (background-image, background-color blend, radial/linear)

## Step 1: Live Trivia Landing

**File:** `/app/trivia/page.tsx`

**Gradient token:** `var(--ht-game-live)` = `linear-gradient(132deg, #0ea5e9 0%, #2563eb 42%, #7c3aed 100%)`  
**Edge token:** `var(--ht-game-live-edge)` = `#67e8f9` (cyan-300)

**Implementation:**

Wrap the page content in this gradient container:

```tsx
<div
  style={{
    background: "var(--ht-game-live)",
    backgroundAttachment: "fixed",
    minHeight: "100vh",
  }}
  className="relative p-4"
>
  {/* Rules card with edge accent */}
  <div className="ht-card accent" style={{ borderColor: "var(--ht-game-live-edge)" }}>
    <div className="ht-eyebrow">Live Trivia</div>
    <h1 className="ht-h1">Join the live broadcast</h1>
    {/* Rules content */}
    <button className="ht-btn-primary mt-6">Enter Lobby</button>
  </div>
</div>
```

## Step 2: Speed Trivia Landing

**File:** `/app/trivia/speed` (if exists) or speed variant

**Gradient tokens:**
- Base: `var(--ht-game-trivia-base)` = `#0a0a0f`
- Pattern: `var(--ht-game-trivia-stripe)` (yellow/lime stripes)

**Implementation:**

```tsx
<div
  style={{
    background: `
      var(--ht-game-trivia-stripe),
      var(--ht-game-trivia-base)
    `,
  }}
  className="relative min-h-screen"
>
  {/* Content */}
</div>
```

## Step 3: Sports Bingo Landing

**File:** `/app/bingo/page.tsx`

**Critical:** This gradient uses a COOL ICE border (`#7dd3fc`), NOT warm orange.

**Gradient token:** `var(--ht-game-bingo)` = radial gradients + `#0c3a2e` (casino felt green)  
**Edge token:** `var(--ht-game-bingo-edge)` = `#7dd3fc` (cool ice, NOT warm)

**Implementation:**

```tsx
<div
  style={{
    background: "var(--ht-game-bingo)",
    backgroundAttachment: "fixed",
    minHeight: "100vh",
  }}
  className="relative p-4"
>
  {/* Rules card */}
  <div
    className="ht-card accent"
    style={{
      borderColor: "var(--ht-game-bingo-edge)",
      borderWidth: "2px",
    }}
  >
    <div className="ht-eyebrow" style={{ color: "var(--ht-game-bingo-primary)" }}>
      Sports Bingo
    </div>
    <h1 className="ht-h1">Mark your card</h1>
    {/* Rules content */}
    <button className="ht-btn-primary mt-6">Start Board</button>
  </div>
</div>
```

## Step 4: Pick'Em Landing

**File:** `/app/pickem/page.tsx`

**Gradient token:** `var(--ht-game-pickem)` = `linear-gradient(115deg, #1a2f72 0%, #1a2f72 48%, #6b1a4e 52%, #6b1a4e 100%)`  
(Navy on left, Magenta on right — sportsbook ticket style)  
**Edge token:** `var(--ht-game-pickem-edge)` = `#fde68a` (ticket-yellow)

**Implementation:**

```tsx
<div
  style={{
    background: "var(--ht-game-pickem)",
    backgroundAttachment: "fixed",
    minHeight: "100vh",
  }}
  className="relative p-4"
>
  <div
    className="ht-card accent"
    style={{
      borderColor: "var(--ht-game-pickem-edge)",
      borderWidth: "2px",
    }}
  >
    <div className="ht-eyebrow" style={{ color: "var(--ht-game-pickem-edge)" }}>
      Pick 'Em
    </div>
    <h1 className="ht-h1">Make your picks</h1>
    {/* Rules content */}
    <button className="ht-btn-primary mt-6">View Contests</button>
  </div>
</div>
```

## Step 5: Fantasy Landing

**File:** `/app/fantasy/page.tsx`

**Gradient token:** `var(--ht-game-fantasy)` = `#0a3128` (deep forest)  
**Edge token:** `var(--ht-game-fantasy-edge)` = `rgba(254, 243, 199, 0.55)` (chalk cream)

**Implementation:**

```tsx
<div
  style={{
    background: "var(--ht-game-fantasy)",
    backgroundAttachment: "fixed",
    minHeight: "100vh",
  }}
  className="relative p-4"
>
  <div
    className="ht-card accent"
    style={{
      borderColor: "var(--ht-game-fantasy-edge)",
      borderWidth: "2px",
    }}
  >
    <div className="ht-eyebrow" style={{ color: "var(--ht-game-fantasy-primary)" }}>
      Fantasy
    </div>
    <h1 className="ht-h1">Build your roster</h1>
    {/* Rules content */}
    <button className="ht-btn-primary mt-6">Enter Contest</button>
  </div>
</div>
```

## Step 6: Validation

After implementing gradients:

- [ ] Live Trivia page background is cyan → blue → violet gradient
- [ ] Bingo page background is GREEN felt, border is CYAN (cool ice), NOT orange
- [ ] Pick'Em page background is navy ↔ magenta diagonal split
- [ ] Fantasy page background is dark forest green
- [ ] Speed Trivia (if applicable) shows yellow/lime stripes on near-black
- [ ] All cards have the correct edge border color (matches game identity)
- [ ] Gradient persists as user scrolls (use `backgroundAttachment: "fixed"`)
- [ ] No hardcoded color hex codes — all use `var(--ht-game-*)`

### Testing Checklist

- [ ] Navigate to `/trivia` → see cyan → blue → violet gradient
- [ ] Navigate to `/bingo` → see casino green + cyan border (NOT orange)
- [ ] Navigate to `/pickem` → see navy/magenta split
- [ ] Navigate to `/fantasy` → see dark forest
- [ ] Screenshot each game landing page at 375px, 768px, 1024px
- [ ] Compare to PNG mockups in `/.github/design-mockups/`

### Output Format

1. 3-bullet execution plan FIRST
2. Complete code for each game landing file
3. Validation checklist
4. NO HARDCODED COLORS — all gradients use CSS custom properties

---

**Next Prompt (4/5) will handle Page Layout Precision & Navbar/Drawer Overhauls**
```

---

# PROMPT 4 OF 5: Page Layout Precision & Navigation Overhaul

**Intelligence Required: HIGH**  
**Estimated Time: 2–2.5 hours**  
**Priority: HIGH (UX/usability)**

## Mission

Rebuild **navbar/header structure, hamburger drawer, bottom nav, countdown section,** and **page layout precision** to match the mockups pixel-for-pixel.

## Execution Plan

**Files to modify:**
- `/components/navigation/LeftHamburgerMenu.tsx` — hamburger drawer (move username/points to absolute top)
- `/components/navigation/MobileBottomNav.tsx` — bottom nav styling
- `/components/ui/PageShell.tsx` — page wrapper (add countdown section conditionally)
- `/app/layout.tsx` — top-level nav bar (ensure venue name centered, alerts right)
- `/app/venue/[venueId]/page.tsx` — venue hub layout

**Key changes:**
- Hamburger drawer: Username + points display moved to **absolute top**
- Top nav: Venue name **perfectly centered**, alerts button **locked right**
- Page shell: Add **countdown to live trivia** section (near top, with "Enter Lobby" button)
- Bottom nav: Correct spacing and styling
- All padding uses `var(--ht-space-*)` tokens

## Prompt Template

```markdown
# PROMPT 4: Page Layout Precision — Navbar, Drawer, Countdown, Page Shell Overhaul

Your mission: Rebuild the navigation layer to match the mockup structure EXACTLY. Every pixel 
counts — venue name centering, hamburger drawer hierarchy, countdown section presence.

## Your Task

**BEFORE you write ANY code, output a 3-bullet execution plan:**
- Bullet 1: List navigation files you will modify and WHY (what structural change each makes)
- Bullet 2: Describe the 5 key layout changes (hamburger drawer hierarchy, navbar centering, countdown section, etc.)
- Bullet 3: Confirm spacing tokens you will use (pad-4, pad-6, gap-4, etc.)

## Key Changes

### 1. Hamburger Drawer — Username to Absolute Top

**File:** `/components/navigation/LeftHamburgerMenu.tsx`

Current structure (WRONG):
```
- Menu items
- At bottom: username + points
```

New structure (CORRECT):
```
- Username + points (FIXED at top)
  - Profile icon
  - "@username"
  - "1,234 pts" (using tabular-nums)
- Divider
- Menu items
```

**Implementation:**

```tsx
export const LeftHamburgerMenu = ({ isOpen, onClose, user, points }) => (
  <div
    className={cn(
      "fixed inset-y-0 left-0 w-64 bg-ht-surface border-r border-ht-border-soft",
      "transform transition-transform z-40",
      isOpen ? "translate-x-0" : "-translate-x-full"
    )}
  >
    {/* FIXED: Username + Points at absolute top */}
    <div className="sticky top-0 bg-ht-surface p-ht-6 border-b border-ht-border-soft">
      <div className="flex items-center gap-ht-4 mb-ht-4">
        <div className="w-10 h-10 rounded-full bg-ht-elevated flex items-center justify-center">
          👤
        </div>
        <div className="flex-1 min-w-0">
          <div className="ht-caption truncate">@{user.username}</div>
          <div className="ht-tabular font-900 text-ht-cyan-300">{points}</div>
        </div>
      </div>
    </div>

    {/* Menu items below */}
    <nav className="flex flex-col gap-ht-2 p-ht-4">
      {/* Menu item components */}
    </nav>
  </div>
)
```

### 2. Top Nav Bar — Venue Name Centered, Alerts Right

**File:** `/app/layout.tsx` (or wherever your top nav lives)

**Implementation:**

```tsx
export const TopNav = ({ venueName, notificationCount }) => (
  <header
    className="fixed top-0 left-0 right-0 h-16 bg-ht-surface border-b border-ht-border-soft"
    style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
  >
    <div className="flex items-center justify-between px-ht-4 h-full gap-ht-4">
      {/* Left: Hamburger menu trigger */}
      <button className="w-10 h-10 flex items-center justify-center">
        ☰
      </button>

      {/* Center: Venue name */}
      <h1 className="flex-1 text-center ht-h2 truncate">
        {venueName}
      </h1>

      {/* Right: Notification bell */}
      <button className="w-10 h-10 flex items-center justify-center relative">
        🔔
        {notificationCount > 0 && (
          <span className="absolute top-0 right-0 w-4 h-4 bg-ht-rose-500 rounded-full text-10px font-900 flex items-center justify-center">
            {notificationCount}
          </span>
        )}
      </button>
    </div>
  </header>
)
```

### 3. Page Shell — Add Countdown Section

**File:** `/components/ui/PageShell.tsx`

Add a **conditional countdown section** that appears when a live trivia is starting soon:

```tsx
export const PageShell = ({ children, hasUpcomingLiveTrivia = false, countdownSeconds = 0 }) => (
  <div className="min-h-screen bg-ht-canvas pt-20 pb-24">
    {/* Countdown Banner (if applicable) */}
    {hasUpcomingLiveTrivia && (
      <div
        className="mx-4 mb-6 p-6 rounded-ht-lg"
        style={{
          background: "var(--ht-game-live)",
          border: "1px solid var(--ht-game-live-edge)",
        }}
      >
        <div className="ht-eyebrow mb-2">Live Trivia Starting Soon</div>
        <div className="flex items-end justify-between">
          <div>
            <div className="ht-h2 mb-2">Join the broadcast</div>
            <div className="ht-body text-ht-cyan-200">
              Round 1 starts in{" "}
              <span className="ht-tabular font-900">{formatCountdown(countdownSeconds)}</span>
            </div>
          </div>
          <button className="ht-btn-primary">Enter Lobby →</button>
        </div>
      </div>
    )}

    {/* Main content */}
    <main className="max-w-4xl mx-auto px-4">{children}</main>
  </div>
)
```

### 4. Bottom Nav — Correct Styling

**File:** `/components/navigation/MobileBottomNav.tsx`

**Implementation:**

```tsx
export const MobileBottomNav = ({ activeTab, onTabChange }) => (
  <nav
    className="fixed bottom-0 left-0 right-0 bg-ht-surface border-t border-ht-border-soft"
    style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
  >
    <div className="flex justify-around items-center h-20">
      {navItems.map(item => (
        <button
          key={item.id}
          onClick={() => onTabChange(item.id)}
          className={cn(
            "flex flex-col items-center gap-1 px-4 py-2 transition-colors",
            activeTab === item.id
              ? "text-ht-cyan-300 font-900"
              : "text-ht-fg-secondary font-600"
          )}
        >
          <span className="text-xl">{item.icon}</span>
          <span className="text-10px">{item.label}</span>
        </button>
      ))}
    </div>
  </nav>
)
```

### 5. Venue Hub Layout — Game Cards Grid

**File:** `/app/venue/[venueId]/page.tsx`

**Implementation:**

```tsx
export default function VenueHub() {
  return (
    <PageShell>
      <div className="space-y-6">
        {/* Game buttons in 2-column grid */}
        <div className="grid grid-cols-2 gap-ht-4">
          <GameButton
            title="Live Trivia"
            gradient="var(--ht-game-live)"
            icon="🎪"
          />
          <GameButton
            title="Speed Trivia"
            gradient="var(--ht-game-trivia-base)"
            icon="⚡"
          />
          <GameButton
            title="Sports Bingo"
            gradient="var(--ht-game-bingo-base)"
            icon="🎲"
          />
          <GameButton
            title="Pick 'Em"
            gradient="var(--ht-game-pickem)"
            icon="🎯"
          />
          <GameButton
            title="Fantasy"
            gradient="var(--ht-game-fantasy)"
            icon="🏆"
          />
        </div>
      </div>
    </PageShell>
  )
}
```

## Validation

After implementing changes:

- [ ] Hamburger drawer: Username + points FIXED at top (sticky)
- [ ] Top nav: Venue name perfectly centered
- [ ] Top nav: Alerts button locked to right
- [ ] Countdown section appears when live trivia starting soon
- [ ] Bottom nav safe-area padding respected
- [ ] All spacing uses tokens (no ad-hoc padding)
- [ ] Responsive at 375px, 768px, 1024px

### Testing Checklist

- [ ] Open hamburger drawer → username at top (doesn't scroll with menu items)
- [ ] Check top nav → venue name centered (screenshot)
- [ ] Check for countdown section on home page (if live trivia soon)
- [ ] Tap countdown "Enter Lobby" button → navigates to lobby
- [ ] Bottom nav visible and tappable at 375px

### Output Format

1. 3-bullet execution plan FIRST
2. Complete code for each modified file
3. Validation checklist with screenshots
4. NO MAGIC NUMBERS — all spacing/sizes use tokens

---

**Next Prompt (5/5) will handle Final QA, Leaderboard Styling, Post-Game Cards, and Responsive Testing**
```

---

# PROMPT 5 OF 5: Final Visual Polish & Comprehensive QA

**Intelligence Required: HIGH**  
**Estimated Time: 1.5–2 hours**  
**Priority: HIGH (visual completeness + QA)**

## Mission

Final sweep: **Leaderboard styling, post-game cards, form inputs, responsive testing**, and removal of all remaining legacy patterns.

## Execution Plan

**Files to modify:**
- `/components/leaderboard/LeaderboardTable.tsx` — leaderboard rows + rank badges
- Trivia post-game card component — champion banner, podium, stats
- Form components — inputs, selects, checkboxes
- All pages — responsive testing at 4 breakpoints

**Key changes:**
- Leaderboard: Rank badges exactly matching spec (1st=gold, 2nd=silver, 3rd=bronze)
- Post-game: Champion banner with crown, podium, round breakdown
- Forms: All inputs use focus-ring styling
- Responsive: Test and fix at 375px, 768px, 1024px, 1440px

## Prompt Template

See CLAUDE_DESIGN_SYSTEM_PHASE4.md for the complete Phase 4 QA prompt.

---

# SUMMARY: 5-PROMPT EXECUTION STRATEGY

| # | Focus | Time | Intelligence | Files | Status |
|---|-------|------|---------------|----|--------|
| **1** | Global Styles + Base Classes | 1.5–2h | MAXIMUM | globals.css, tailwind.config.ts | READY |
| **2** | UI Components (Buttons, Cards, Inputs, Tabs) | 2–2.5h | MAXIMUM | 30+ components | READY |
| **3** | Game Gradients & Landing Screens | 1.5–2h | MAXIMUM | 5 game pages | READY |
| **4** | Navigation Layout & Page Structure | 2–2.5h | HIGH | navbar, drawer, countdown, page shell | READY |
| **5** | Final Polish & Comprehensive QA | 1.5–2h | HIGH | leaderboard, post-game, forms, responsive | READY |

**TOTAL: 10–14 hours of Claude work at MAXIMUM/HIGH effort**

---

# EXECUTION CHECKLIST

Before starting **any** prompt:

- [ ] Read this file completely
- [ ] Understand the gap (design spec vs. current state)
- [ ] Open comparison tabs:
  - Tab 1: `/design-system/project/preview/component-*.html`
  - Tab 2: Your local app (`localhost:3000/page`)
- [ ] Screenshot the mockups for reference

Execute prompts **in order: 1 → 2 → 3 → 4 → 5**

After each prompt:
- [ ] Wait for Claude to output the **3-bullet execution plan**
- [ ] Review the plan — confirm it covers ALL files needed
- [ ] Review the code
- [ ] Run `npm run dev` and test the changes
- [ ] Validate using the checklist in the prompt
- [ ] Move to next prompt

---

# KEY PRINCIPLES — NON-NEGOTIABLE

1. **PIXEL-PERFECT MATCHING** — Every color, size, shadow, radius must match the design spec files
2. **NO SPECULATION** — All values from `/design-system/project/colors_and_type.css` or `.html` specs
3. **ATOMIC TOKENS** — Every color/size/spacing is a CSS custom property, never hardcoded
4. **SEMANTIC CLASSES** — Text hierarchy (display, h1, h2, body, caption) is MANDATORY
5. **RESPONSIVE VERIFICATION** — Test at 375px, 768px, 1024px, 1440px after every prompt
6. **ZERO LEGACY PATTERNS** — No `.tp-*` classes, no old hex colors, no ad-hoc inline styles
7. **SINGLE SOURCE OF TRUTH** — All styles originate from globals.css or Tailwind config

---

# FINAL NOTE

This is a **COMPLETE redesign**. Don't expect it to be quick. Each prompt is designed to be executed 
by Claude with MAXIMUM effort and full comprehension of the design spec.

When you're done, your website will look **EXACTLY** like the design mockups. 

Ready to begin?
