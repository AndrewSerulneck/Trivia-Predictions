# Complete Visual Overhaul — Quick Execution Reference

## TL;DR

Your website **doesn't look like the mockups** because:

1. ❌ Components use incorrect button/card/input styling
2. ❌ Game landing pages missing gradient backgrounds
3. ❌ Navigation structure (hamburger, navbar) wrong layout
4. ❌ Leaderboard/post-game cards missing spec styling
5. ❌ Forms and inputs not matching spec focus states

**Solution:** Execute **5 sequential Claude prompts** (10–14 hours of HIGH-EFFORT work).

---

## The 5 Prompts (In Order)

### Prompt 1: Global Styles Enforcement
**Time:** 1.5–2 hours | **Intelligence:** MAXIMUM
- Rebuild `/app/globals.css` with 80+ new rules
- Add semantic type classes (`.ht-display`, `.ht-body`, `.ht-eyebrow`, etc.)
- Add component base classes (`.ht-card`, `.ht-btn-primary`, `.ht-input`)
- Extend Tailwind config with new utilities

**Files modified:** 2 (globals.css, tailwind.config.ts)

---

### Prompt 2: UI Component Library Alignment
**Time:** 2–2.5 hours | **Intelligence:** MAXIMUM
- Update 30+ button/card/input/tab components
- Replace `bg-slate-*` with `bg-ht-*`
- Apply exact shadows/borders/padding from spec
- Add focus rings to ALL interactive elements

**Files modified:** 30+ components

---

### Prompt 3: Game Landing Screens & Gradients
**Time:** 1.5–2 hours | **Intelligence:** MAXIMUM
- Apply game gradients to 5 landing pages:
  - Live Trivia: cyan → blue → violet
  - Speed Trivia: yellow/lime stripes on black
  - Bingo: casino green + COOL ICE border (not warm)
  - Pick'Em: navy ↔ magenta split
  - Fantasy: dark forest
- Ensure gradient persists as user scrolls
- Use `backgroundAttachment: "fixed"`

**Files modified:** 5 game pages

---

### Prompt 4: Navigation & Page Layout Overhaul
**Time:** 2–2.5 hours | **Intelligence:** HIGH
- Hamburger drawer: Move username/points to ABSOLUTE TOP (sticky)
- Top nav: Venue name CENTERED, alerts button locked RIGHT
- Add countdown section to page shell (upcoming live trivia)
- Bottom nav: Correct styling + safe-area padding
- Venue hub: Game cards in proper grid

**Files modified:** 5 navigation files, page shell

---

### Prompt 5: Final Polish & QA
**Time:** 1.5–2 hours | **Intelligence:** HIGH
- Leaderboard: Rank badges (1st=gold, 2nd=silver, 3rd=bronze)
- Post-game: Champion banner with crown, podium, round breakdown
- Forms: Focus ring styling on all inputs
- Responsive testing: 375px, 768px, 1024px, 1440px
- Remove all legacy patterns (`--tp-*`, old hex colors)

**Files modified:** 15+ components, all pages

---

## How to Execute Each Prompt

### Step 1: Open the Master Prompt File
```bash
Open: /CLAUDE_COMPLETE_VISUAL_OVERHAUL_PROMPT.md
```

### Step 2: For Each Prompt (1–5):
1. **Copy the prompt template** (e.g., "PROMPT 1 OF 5: Global Styles...")
2. **Start a NEW Claude conversation**
3. **Paste the prompt**
4. **Set effort level to HIGH or MAXIMUM** (enable extended thinking if available)
5. **Wait for Claude's 3-bullet execution plan**
6. **Review the plan** — confirm all files covered
7. **Review the code**
8. **Run `npm run dev` and test**
9. **Validate using the checklist in the prompt**
10. **Move to Prompt 2**

### Step 3: Between Each Prompt
```bash
npm run dev
# Visit pages and compare to mockups in /.github/design-mockups/
# Take screenshots at 375px, 768px, 1024px
# Verify colors match /design-system/project/preview/component-*.html
```

---

## Reference Files

Keep these open while executing:

1. **Design Spec Files:**
   - `/design-system/project/colors_and_type.css` — color tokens
   - `/design-system/project/preview/component-buttons.html` — button spec
   - `/design-system/project/preview/component-card.html` — card spec
   - `/design-system/project/preview/component-inputs.html` — input spec
   - `/design-system/project/preview/component-leaderboard-row.html` — table spec
   - `/design-system/project/preview/component-live-postgame.html` — post-game spec

2. **Mockup Screenshots:**
   - `/.github/design-mockups/buttons.png`
   - `/.github/design-mockups/bingo-page.png`
   - `/.github/design-mockups/live-trivia-post-game.png`
   - `/.github/design-mockups/venue-home-page.png`
   - `/.github/design-mockups/hamburger-drawer.png`

3. **Your Website:**
   - `localhost:3000/trivia/live`
   - `localhost:3000/bingo/home`
   - `localhost:3000/leaderboard`
   - `localhost:3000/venue/[id]`
   - `localhost:3000/join`

---

## Color Palette (For Quick Reference)

### Surfaces
- Canvas (bg): `#020617`
- Surface (cards): `#0f172a`
- Elevated (inputs): `#1e293b`
- Elevated-2 (nested): `#334155`

### Text
- Primary (headings, body): `#f8fafc`
- Secondary: `#e2e8f0`
- Muted (labels): `#94a3b8`
- Dim (placeholder): `#64748b`

### Accents
- Cyan: `#06b6d4` (primary, focus)
- Emerald: `#10b981` (success)
- Amber: `#f59e0b` (countdown)
- Fuchsia: `#d946ef` (intermission)
- Rose: `#f43f5e` (error)

### Game Gradients
- Live Trivia: `linear-gradient(132deg, #0ea5e9 0%, #2563eb 42%, #7c3aed 100%)`
- Speed Trivia: Yellow/lime stripes on `#0a0a0f`
- Bingo: Green felt `#0c3a2e` + cyan border `#7dd3fc` (COOL, not warm)
- Pick'Em: Navy `#1a2f72` ↔ Magenta `#6b1a4e` split
- Fantasy: Dark forest `#0a3128`

### Page Accents
- Home: Cyan
- Leaderboard: Amber
- Activity: Blue
- Prizes: Gold
- FAQs: Slate

### Shadows
- Card: `0 8px 24px rgba(0, 0, 0, 0.40)`
- Modal: `0 20px 60px rgba(0, 0, 0, 0.55)`
- Glow (cyan): `0 0 0 1px rgba(34, 211, 238, 0.30), 0 8px 28px rgba(34, 211, 238, 0.18)`

### Spacing (4px grid)
- 1: 4px | 2: 8px | 3: 12px | 4: 16px | 5: 20px | 6: 24px | 8: 32px | 10: 40px | 12: 48px

### Radii
- sm: 8px | md: 12px | lg: 16px | xl: 20px | 2xl: 24px | pill: 9999px

---

## Non-Negotiable Requirements

✅ **For Every Component Update:**
1. No hardcoded colors — use `var(--ht-*)`
2. No ad-hoc padding — use spacing tokens
3. All interactive elements have focus rings
4. Semantic type classes used (`.ht-eyebrow`, `.ht-body`, etc.)
5. No `.tp-*` class names (legacy)
6. Responsive at 375px, 768px, 1024px, 1440px

✅ **For Every Page:**
1. Game landing: Has correct gradient background
2. Navigation: Hamburger + navbar correct structure
3. Countdown: Shows if live trivia starting soon
4. Spacing: All margins/padding use tokens
5. Shadows: Uses exact shadow tokens

---

## Validation After Each Prompt

**Quick 5-minute validation:**

```bash
npm run dev
# Visit: localhost:3000/trivia/live
# DevTools → Inspect any button
# Check computed styles:
#   background: #22d3ee (cyan-400) ✅ or something else ❌
#   padding: 12px 20px (or similar) ✅ or random ❌
#   border-radius: 12px ✅ or random ❌
```

**Screenshots (at each breakpoint):**
- 375px (iPhone SE)
- 768px (iPad)
- 1024px (desktop)
- 1440px (large desktop)

Compare to: `/.github/design-mockups/buttons.png`, etc.

---

## Timeline

- Prompt 1: 1.5–2h → foundation complete
- Prompt 2: 2–2.5h → components look right
- Prompt 3: 1.5–2h → game identity gradients applied
- Prompt 4: 2–2.5h → navigation/layout correct
- Prompt 5: 1.5–2h → final polish + QA

**Total: ~10–14 hours of execution time** (split across multiple Claude conversations)

---

## After All 5 Prompts

Your website will:
- ✅ Look **EXACTLY** like the design mockups
- ✅ Use exact colors from design spec
- ✅ Have correct typography hierarchy
- ✅ Have correct component styling
- ✅ Have game gradients applied
- ✅ Have correct navigation structure
- ✅ Be fully responsive (375px–1440px)
- ✅ Have zero legacy patterns
- ✅ Be production-ready

---

## Need Help?

If a prompt gets stuck:
1. **Review the 3-bullet execution plan** — is it comprehensive?
2. **Check the reference files** — is Claude using the correct colors/sizes?
3. **Re-run the prompt** — sometimes Claude needs a second attempt
4. **Break it into smaller prompts** — if one prompt is too large, split it

**You've got this. Execute the 5 prompts and your website transforms.** 🚀
