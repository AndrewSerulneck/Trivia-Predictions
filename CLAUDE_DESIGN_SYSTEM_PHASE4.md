# Claude: Design System Migration — Phase 4

## Your Mission

**Final polish, comprehensive QA, and removal of all legacy design tokens.** This is **Phase 4 of 4** — the wrap-up and validation phase.

**Files to audit:** ~150 component + page files  
**Complexity:** MEDIUM (mostly verification and final tweaks)  
**Estimated time:** 1–2 hours  
**Key skills:** Code search, find-and-replace, responsive testing, browser compatibility

---

## Context: What Phase 4 Does

### Before Phase 4
- Components styled (Phase 2 ✅)
- Page layouts and spacing updated (Phase 3 ✅)
- But: Legacy tokens may still be lurking
- Hover states and transitions may need refinement
- Responsive behavior unverified across all breakpoints
- Browser support untested

### After Phase 4
- **Zero legacy tokens** in codebase (`--tp-*`, old color hex values gone)
- **All hover/focus/active states** use new color tokens
- **Responsive design verified** at 375px, 768px, 1024px, 1440px
- **Transitions & animations** smooth and broadcast-appropriate
- **Browser support** confirmed (Chrome, Safari, Firefox)
- **Dark broadcast aesthetic** consistent everywhere
- **Ready for production** ✅

---

## Phase 4 Strategy

Phase 4 has **3 major work streams** — do them in order:

### Work Stream 1: Remove All Legacy Tokens
**Goal:** Find and eliminate every `--tp-*` CSS variable reference

### Work Stream 2: Verify Hover/Focus/Active States
**Goal:** Ensure all interactive elements use new tokens correctly

### Work Stream 3: Full Responsive QA
**Goal:** Test design at 4 breakpoints + all browsers

---

# WORK STREAM 1: Remove All Legacy Tokens

## Task 1.1: Search for Remaining `--tp-*` Variables

In your IDE search (Cmd+Shift+F):

```
Pattern: --tp-
Scope: app/, components/, lib/
```

**Expected results:** Should be very few or none (Phase 1 should have removed most).

**If found:** Replace with new `--ht-*` equivalents.

Example replacements:
```
--tp-vh               → Keep as-is (viewport height utility, not design token)
--tp-card-bg          → var(--ht-surface)
--tp-card-border      → var(--ht-border-soft)
--tp-text-primary     → var(--ht-fg-primary)
--tp-accent-cyan      → var(--ht-cyan-500)
--tp-game-bingo       → var(--ht-game-bingo)
```

---

## Task 1.2: Search for Hardcoded Hex Colors

In IDE search:

```
Pattern: #[0-9a-fA-F]{6}
Scope: app/, components/, lib/ (exclude node_modules)
```

**Expected finds:** Some hardcoded colors in inline styles or Tailwind classes.

**Common patterns to replace:**

```javascript
// LEGACY COLORS
#020617  →  var(--ht-canvas)          [page background]
#0f172a  →  var(--ht-surface)         [card background]
#1e293b  →  var(--ht-elevated)        [elevated surface]
#334155  →  var(--ht-elevated-2)      [more elevated]
#f8fafc  →  var(--ht-fg-primary)      [primary text]
#e2e8f0  →  var(--ht-fg-secondary)    [secondary text]
#94a3b8  →  var(--ht-fg-muted)        [muted text]
#64748b  →  var(--ht-fg-dim)          [dim text]

// LEGACY ACCENT COLORS (replace with new tokens)
#06b6d4  →  var(--ht-cyan-500)        [cyan accent]
#10b981  →  var(--ht-emerald-500)     [emerald accent]
#f59e0b  →  var(--ht-amber-500)       [amber accent]
#d946ef  →  var(--ht-fuchsia-500)     [fuchsia accent]
#f43f5e  →  var(--ht-rose-500)        [rose accent]

// LEGACY GAME COLORS
#0369a1  →  var(--ht-game-live)       [trivia cyan gradient]
#1e40af  →  var(--ht-game-trivia)     [speed trivia]
#15803d  →  var(--ht-game-bingo)      [bingo green]
#1e1b4b  →  var(--ht-game-pickem)     [pickem navy/magenta]
#1a4d2e  →  var(--ht-game-fantasy)    [fantasy forest]
```

**Action if found:**
- Replace with `var(--ht-*)` token
- Test on that component to ensure color looks identical
- Move to next

---

## Task 1.3: Search for Legacy Class Names

In IDE search:

```
Pattern: \.tp-
Scope: app/, components/, lib/
```

**Expected:** `.tp-card`, `.tp-bingo-theme`, `.tp-glow-pulse`, etc.

**Common replacements:**

```
.tp-card              → .ht-dark-card (or just use Tailwind: bg-ht-surface border-ht-soft)
.tp-bingo-theme      → Removed/replaced with inline game gradient styling
.tp-glow-pulse       → .animate-tp-glow-pulse (this one can stay; it's an animation name)
.tp-text-*           → Replace with Tailwind text-* or var(--ht-fg-*)
.tp-bg-*             → Replace with Tailwind bg-ht-* or var(--ht-*)
.tp-button           → Use Tailwind button styles
```

**Action if found:**
- Replace class names with new equivalents
- If custom `.tp-*` class is used, check `/app/globals.css` to see if it's defined
- If defined, replace or remove the class entirely

---

## Task 1.4: Verify `/app/globals.css` Has No `.tp-*` Definitions

Read `/app/globals.css`:

```bash
grep -n "\.tp-" /app/globals.css
```

**Expected:** Only `.tp-button` animations should remain (these are safe to keep).

If you find class definitions like:
```css
.tp-card { /* ... */ }
.tp-surface { /* ... */ }
```

**These should be removed** (they should be replaced by Tailwind utilities or inline styles in Phase 2).

---

## Task 1.5: Final Legacy Token Audit

Run this command to find any remaining `tp` references:

```bash
grep -r "tp-" app/ components/ lib/ --include="*.tsx" --include="*.ts" --include="*.css" | grep -v "animate-tp-glow-pulse" | grep -v "node_modules" | head -20
```

**If nothing found:** ✅ All legacy tokens removed!  
**If results:** Review each and replace with new tokens.

---

# WORK STREAM 2: Verify Hover/Focus/Active States

## Task 2.1: Check Button Hover States

**Files to audit:**
- `/components/ui/` (all UI buttons)
- Game-specific buttons in trivia, bingo, pickem, fantasy

**Pattern to verify:**

```typescript
// GOOD ✅
<button className="bg-ht-surface hover:bg-ht-elevated transition-colors">
  Action
</button>

// BAD ❌ (old color value)
<button className="bg-slate-900 hover:bg-slate-800">
  Action
</button>

// ALSO GOOD ✅ (using opacity)
<button className="bg-ht-elevated hover:opacity-80 transition-opacity">
  Action
</button>
```

**Action:**
- Audit top 10 button components
- Ensure hover uses new Tailwind utilities (bg-ht-*, opacity, etc.)
- Not hardcoded colors

---

## Task 2.2: Check Card Hover States

**Files:**
- `/components/trivia/` game cards
- `/components/bingo/` cards
- `/components/pickem/PickEmGameList.tsx`
- `/components/fantasy/` cards

**Pattern:**

```typescript
// GOOD ✅
<div className="bg-ht-surface hover:shadow-ht-card hover:scale-105 transition-all cursor-pointer">

// BAD ❌
<div style={{ backgroundColor: "#0f172a" }} onMouseEnter={() => ...}>
```

**Action:**
- Ensure cards have smooth hover animations
- Use `shadow-ht-card`, `scale-105`, or `opacity` transitions
- No hardcoded colors in hover state

---

## Task 2.3: Check Focus States on Form Inputs

**Files:**
- `/components/join/JoinFlow.tsx`
- `/components/admin/sections/adFormShared.tsx`
- `/components/ads/AdvertisingIntakeForm.tsx`

**Pattern:**

```typescript
// GOOD ✅
<input
  className="bg-ht-surface border border-ht-hairline focus:border-ht-cyan-500 focus:ring-2 focus:ring-ht-cyan-400"
  placeholder="Enter value"
/>

// BAD ❌
<input
  className="bg-slate-900 border border-gray-700 focus:ring-blue-500"
  placeholder="Enter value"
/>
```

**Action:**
- Audit join flow inputs
- Ensure focus states use `border-ht-*` and `focus:ring-ht-*`
- Accent color should match page accent (cyan for join)

---

## Task 2.4: Check Link/Navigation Hover States

**Files:**
- `/components/navigation/LeftHamburgerMenu.tsx`
- `/components/navigation/MobileBottomNav.tsx`
- Back pills across all pages

**Pattern:**

```typescript
// GOOD ✅
<a href="/venue/123" className="text-ht-primary hover:text-ht-cyan-400 transition-colors">
  Venue
</a>

// BAD ❌
<a href="/venue/123" className="text-slate-50 hover:text-blue-400">
  Venue
</a>
```

**Action:**
- Nav items should use `hover:text-ht-*` with accent color
- Transitions should be smooth (`transition-colors`)

---

## Task 2.5: Verify Active/Selected States

**Files:**
- Tab components (Games / Leaderboard / Challenges)
- Game selector buttons
- Sport selector buttons

**Pattern:**

```typescript
// GOOD ✅
<button
  className={isActive ? "border-b-2 border-ht-cyan-500 text-ht-primary" : "border-b-2 border-transparent text-ht-secondary"}
>
  Games
</button>

// BAD ❌
<button className={isActive ? "border-blue-500" : "border-transparent"}>
  Games
</button>
```

**Action:**
- Active states should use accent color tokens (`var(--ht-*-500)`)
- Inactive should use secondary/muted text color

---

# WORK STREAM 3: Full Responsive QA

## Task 3.1: Mobile (375px) — iPhone SE

**Testing approach:**

1. Run `npm run dev`
2. Open DevTools (Cmd+Option+I)
3. Toggle device toolbar (Cmd+Shift+M)
4. Select "iPhone SE" (375px)

**Test each Tier 1 route:**

- [ ] `/join` — Inputs readable, buttons tappable, no overflow
- [ ] `/venue/[venueId]` — Game cards stack vertically, tabs visible
- [ ] `/trivia/live` — Question readable, buttons easily tapped, score visible
- [ ] `/bingo/home` — 5×5 grid visible (may be small), no horizontal scroll
- [ ] `/pickem` — Game list scrollable, no overflow, ads visible
- [ ] `/fantasy` — Lineup cards stack, scoring readable
- [ ] `/leaderboard` — Table readable (columns may scroll), rank visible
- [ ] `/activity` — Timeline items readable, timestamps small but legible

**Red flags:**
- Horizontal scrollbar
- Text cutoff
- Buttons/taps overlap
- Images overflowing
- Safe-area padding ignored

**If red flag found:**
- Note the component file
- Fix padding/sizing in responsive breakpoints
- Re-test

---

## Task 3.2: Tablet (768px) — iPad

**Testing approach:**

1. DevTools device toolbar
2. Select "iPad" (768px, landscape optional)

**Test each route:**

- [ ] Multi-column layout works (if applicable)
- [ ] Game cards in 2-column grid
- [ ] Leaderboard table readable
- [ ] Spacing feels balanced
- [ ] No awkward gaps

**Red flags:**
- Centered content too narrow
- Spacing inconsistent with mobile
- Card heights misaligned

---

## Task 3.3: Desktop (1024px)

**Testing approach:**

1. DevTools or just resize browser to 1024px

**Test each route:**

- [ ] Content has max-width constraint (not full-width on desktop)
- [ ] Game cards in 3-column grid (if applicable)
- [ ] Leaderboard table with proper column widths
- [ ] Hover states work (buttons, cards, links)
- [ ] Spacing feels broadcast-appropriate

---

## Task 3.4: Desktop (1440px)

**Testing approach:**

1. Full-screen browser on larger monitor (or simulate)

**Test:**

- [ ] Max-width constraint enforced (content centered, not stretched)
- [ ] Card grids balanced (even column distribution)
- [ ] No visual awkwardness

---

## Task 3.5: Browser Compatibility

Test on:
- **Chrome** (latest) — Primary browser
- **Safari** (latest) — iOS/macOS
- **Firefox** (latest) — Desktop

**What to verify:**

```
✅ Colors render correctly (CSS custom properties supported)
✅ Fonts load (Google Fonts not blocked)
✅ Gradients render (linear-gradient syntax)
✅ Animations smooth (transitions, keyframes)
✅ Shadows render (box-shadow with var() syntax)
✅ Responsive units work (max(), env(), etc.)
```

**If issue found:**
- Note browser + behavior
- Likely CSS syntax issue (vendor prefix needed?)
- Consult `/design-system/project/colors_and_type.css` for correct syntax

---

## Task 3.6: Dark Mode Verification

Verify all pages **look correct in dark mode** (they should, since we designed for dark):

1. DevTools → Rendering tab
2. Emulate CSS media feature: `prefers-color-scheme: dark`

**Expected:** No change (app is dark by default) ✅

---

# PHASE 4 VALIDATION CHECKLIST

## ✅ Legacy Token Removal

- [ ] No `--tp-*` CSS variables in codebase (except `--tp-vh`)
- [ ] No hardcoded hex colors (#0f172a, #f8fafc, etc.)
- [ ] No `.tp-*` class names (except animations)
- [ ] `/app/globals.css` cleaned of `.tp-*` class definitions
- [ ] `grep -r "tp-" app/` returns zero results (except animations)

## ✅ Hover/Focus/Active States

- [ ] Buttons use new Tailwind utilities for hover (bg-ht-*, opacity, shadow-*)
- [ ] Cards have smooth hover animations with new tokens
- [ ] Form inputs have focus states with ht-* colors
- [ ] Links/nav use hover text colors with transitions
- [ ] Selected/active states use accent color tokens

## ✅ Responsive Layout

- [ ] 375px (mobile): No overflow, readable, tappable
- [ ] 768px (tablet): Multi-column layout balanced
- [ ] 1024px (desktop): Max-width constraint applied
- [ ] 1440px (large desktop): Content centered, not stretched
- [ ] Safe-area padding respected on all fixed elements

## ✅ Browser Compatibility

- [ ] Chrome: All features work
- [ ] Safari: Colors, fonts, gradients render
- [ ] Firefox: Animations smooth, no glitches
- [ ] Dark mode: No unintended changes

## ✅ Visual Consistency

- [ ] Game gradients correct (cyan/yellow/green/navy/forest)
- [ ] Page accent colors applied (home=cyan, leaderboard=amber, etc.)
- [ ] Bingo theme is cool-ice, NOT warm
- [ ] Back pills sticky with proper padding
- [ ] Spacing atomic (no ad-hoc 13px, 7px, etc.)

## ✅ Performance

- [ ] No console errors
- [ ] No CSS parse warnings
- [ ] No missing Google Fonts
- [ ] Load time < 3 seconds (lighthouse)

---

# ADDITIONAL CLEANUP TASKS

## Task 4.1: Remove `.tp-button` Animation (if unused)

In `/app/globals.css`, search for:

```css
@keyframes tp-button-pulse {
  /* ... */
}
```

If it's not used anywhere in components:

```bash
grep -r "tp-button-pulse\|tp-button" app/ components/
```

If zero results: Remove the animation from globals.css.

---

## Task 4.2: Verify Typography Classes in Use

Check that new `.ht-*` type classes are used correctly:

```bash
grep -r "ht-display\|ht-h1\|ht-h2\|ht-question\|ht-body\|ht-caption\|ht-eyebrow\|ht-tabular" app/ components/ | wc -l
```

**Expected:** Should have decent usage (20+ instances).

If zero: Type classes may not be adopted yet (add in Phase 4 polish).

---

## Task 4.3: Final Lighthouse Audit

Run Lighthouse performance audit:

```bash
npm run build
npm run dev
# Open DevTools → Lighthouse
# Run audit on each Tier 1 page
```

**Targets:**
- Performance: > 80
- Accessibility: > 90
- Best Practices: > 90
- SEO: > 90

If scores low:
- Note issues in console
- Fix critical performance blockers
- Move minor issues to backlog

---

## Task 4.4: Check for Console Errors/Warnings

In DevTools Console on each page:

**Expected:** Zero errors, only warnings about:
- Unused imports (OK, Phase 2 cleanup)
- Experimental APIs (OK if supported)
- Missing favicons (OK, not critical)

**If errors found:**
- Likely CSS parse error or missing asset
- Fix in component or globals.css
- Re-test

---

## Task 4.5: Animation Performance

Test animations on lower-end devices:

```bash
DevTools → Performance tab
```

**Record while:**
- Hovering over cards
- Clicking buttons
- Scrolling leaderboard
- Live trivia updating

**Expected:** 60 FPS (smooth animations).

If jank found:
- Check for expensive animations (shadows, blurs)
- Use `will-change` if needed
- Simplify if necessary

---

# SUMMARY: Phase 4 Completion Criteria

Phase 4 is **COMPLETE** when:

✅ **Zero legacy tokens** — No `--tp-*`, no hardcoded hex colors  
✅ **Interactive states refined** — Hover/focus/active use new tokens  
✅ **Responsive verified** — 375px, 768px, 1024px, 1440px all correct  
✅ **Browsers tested** — Chrome, Safari, Firefox all work  
✅ **Dark mode correct** — App looks intended in dark mode  
✅ **Performance acceptable** — Lighthouse > 80 (Performance)  
✅ **Console clean** — No errors, only expected warnings  
✅ **Visual polish** — All game gradients, accents, spacing atomic  

---

# FINAL HANDOFF

Once Phase 4 passes all validation:

🎉 **Design system migration complete!**

**What's been accomplished:**
- ✅ CSS foundation (Phase 1)
- ✅ Component styling (Phase 2)
- ✅ Page layouts & spacing (Phase 3)
- ✅ Polish & QA (Phase 4)

**Result:**
- Entire codebase uses new "dark broadcast" design system
- Zero legacy tokens remaining
- Responsive design tested across all breakpoints
- All browser compatibility verified
- Ready for production 🚀

---

## Estimated Time: 1–2 hours

**If you need help with any validation tasks, note the specific component/page and I can dive deeper.**

Ready to execute Phase 4?
