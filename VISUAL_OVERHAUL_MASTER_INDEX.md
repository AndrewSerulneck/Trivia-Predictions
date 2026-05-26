# 🎨 Complete Visual Overhaul — Master Index

## Overview

Your website has the **correct design system foundation** but **fails to visually implement it** across components and pages. This master index guides you through a **5-prompt exhaustive overhaul** to make your website look **pixel-perfect** compared to the design mockups.

---

## 📚 Documentation Files (4 Total)

Read these in order:

### 1. **START HERE:** `/DESIGN_GAP_ANALYSIS.md`
   - **What:** Detailed analysis of what's wrong
   - **Why read:** Understand the gap between spec and reality
   - **Time:** 15 min
   - **Key insight:** Components have correct tokens but don't apply them

### 2. **EXECUTE:** `/CLAUDE_COMPLETE_VISUAL_OVERHAUL_PROMPT.md`
   - **What:** 5 complete prompt templates for Claude
   - **Why read:** Contains the actual prompts to execute
   - **Time:** 1 hour (read all 5)
   - **Key sections:**
     - PROMPT 1: Global Styles (1.5–2h)
     - PROMPT 2: UI Components (2–2.5h)
     - PROMPT 3: Game Gradients (1.5–2h)
     - PROMPT 4: Navigation Layout (2–2.5h)
     - PROMPT 5: Final Polish (1.5–2h)

### 3. **QUICK REF:** `/CLAUDE_VISUAL_OVERHAUL_QUICK_REFERENCE.md`
   - **What:** Condensed execution guide + color palette
   - **Why read:** Keep open during execution for quick lookup
   - **Time:** 5 min (per prompt)
   - **Key sections:** TL;DR, 5-prompt overview, color palette, validation steps

### 4. **CHECKLIST:** `/VISUAL_OVERHAUL_ACTION_PLAN.md`
   - **What:** Step-by-step execution checklist
   - **Why read:** Follow this to execute prompts 1–5
   - **Time:** 2 min (per prompt)
   - **Key sections:** Pre-flight checks, per-prompt setup/execute/validate

---

## 🎯 Quick Start (5 Steps)

1. **Read `/DESIGN_GAP_ANALYSIS.md`** (15 min)
   - Understand what's broken

2. **Read `/CLAUDE_COMPLETE_VISUAL_OVERHAUL_PROMPT.md`** (1 hour)
   - Understand all 5 prompts

3. **Follow `/VISUAL_OVERHAUL_ACTION_PLAN.md`** (10–14 hours)
   - Execute Prompt 1 → Validate → Prompt 2 → Validate → ... → Prompt 5 → Validate

4. **Use `/CLAUDE_VISUAL_OVERHAUL_QUICK_REFERENCE.md`** (ongoing)
   - Quick lookup during execution

5. **Validate with side-by-side comparison** (end)
   - Compare final result to design specs

---

## 📋 The 5 Prompts Explained

### Prompt 1: Global Styles Enforcement
- **Time:** 1.5–2 hours
- **Intelligence:** MAXIMUM
- **Files modified:** 2 (globals.css, tailwind.config.ts)
- **Outcome:** 80+ new CSS rules, semantic type classes, base components
- **Result:** Every component automatically inherits correct styling

### Prompt 2: UI Component Library Alignment
- **Time:** 2–2.5 hours
- **Intelligence:** MAXIMUM
- **Files modified:** 30+
- **Outcome:** Buttons, cards, inputs, tabs all match spec exactly
- **Result:** Entire component library looks consistent and professional

### Prompt 3: Game Landing Screens & Gradients
- **Time:** 1.5–2 hours
- **Intelligence:** MAXIMUM
- **Files modified:** 5 game pages
- **Outcome:** Each game has continuous gradient identity
- **Result:** Each game instantly recognizable by visual identity

### Prompt 4: Navigation & Page Layout Overhaul
- **Time:** 2–2.5 hours
- **Intelligence:** HIGH
- **Files modified:** 5+ navigation files
- **Outcome:** Hamburger drawer restructured, navbar centered, countdown section added
- **Result:** Navigation feels polished and world-class

### Prompt 5: Final Polish & Comprehensive QA
- **Time:** 1.5–2 hours
- **Intelligence:** HIGH
- **Files modified:** 15+ detail components
- **Outcome:** Leaderboard styling, post-game cards, form focus rings, responsive QA
- **Result:** Website feels complete and production-ready

---

## 🎨 The Design System (Reference)

### Colors
```
Surfaces:  #020617 (canvas), #0f172a (surface), #1e293b (elevated), #334155 (elevated-2)
Text:      #f8fafc (primary), #e2e8f0 (secondary), #94a3b8 (muted), #64748b (dim)
Accents:   Cyan #06b6d4, Emerald #10b981, Amber #f59e0b, Fuchsia #d946ef, Rose #f43f5e
Games:     Live (cyan→blue→violet), Speed (yellow stripes), Bingo (green+cyan border), Pick'Em (navy↔magenta), Fantasy (forest)
```

### Typography
```
Display:   Bree Serif, 44px, 700, uppercase
H1:        Bree Serif, 36px, 700
H2:        Bree Serif, 30px, 700
Question:  Nunito, 36px, 800
Body:      Nunito, 16px, 600 [DEFAULT]
Caption:   Nunito, 14px, 600
Eyebrow:   Nunito, 11px, 900, uppercase, tracked
Tabular:   Nunito, font-variant-numeric: tabular-nums
```

### Spacing (4px grid)
```
1: 4px | 2: 8px | 3: 12px | 4: 16px | 5: 20px | 6: 24px | 8: 32px | 10: 40px | 12: 48px
```

### Shadows
```
Card:      0 8px 24px rgba(0,0,0,0.40)
Modal:     0 20px 60px rgba(0,0,0,0.55)
Glow:      0 0 0 1px rgba(34,211,238,0.30), 0 8px 28px rgba(34,211,238,0.18)
```

### Radii
```
sm: 8px | md: 12px | lg: 16px | xl: 20px | 2xl: 24px | pill: 9999px
```

---

## ✅ Success Criteria

After all 5 prompts, your website:

- ✅ Matches design spec colors exactly (no guessing)
- ✅ Uses semantic type classes (no hardcoded font sizes)
- ✅ Has consistent component styling (buttons, cards, inputs)
- ✅ Has game gradients (each game visually distinct)
- ✅ Has correct navigation structure
- ✅ Has full responsive support (375px–1440px)
- ✅ Has final polish (leaderboard, post-game, forms)
- ✅ Is production-ready 🚀

---

## 📊 Timeline

| Phase | Prompts | Time | Cumulative |
|-------|---------|------|-----------|
| Foundation | 1–2 | ~4h | 4h |
| Identity | 3–4 | ~4–5h | 8–9h |
| Polish | 5 | ~2h | 10–14h |

**Realistic expectation: 2–3 days of execution** (spread across multiple Claude conversations)

---

## 🚀 How to Execute

### Session 1 (Prompts 1–2, ~6 hours)
```bash
1. Start Claude conversation #1
2. Copy Prompt 1 from /CLAUDE_COMPLETE_VISUAL_OVERHAUL_PROMPT.md
3. Paste into Claude
4. Wait for 3-bullet execution plan, review, apply changes
5. Validate: npm run dev, compare to spec
6. Copy Prompt 2 from same file
7. Paste into Claude
8. Wait for 3-bullet plan, review, apply changes
9. Validate: npm run dev, compare to spec
```

### Session 2 (Prompts 3–4, ~5 hours)
```bash
1. Start Claude conversation #2 (fresh)
2. Copy Prompt 3 from /CLAUDE_COMPLETE_VISUAL_OVERHAUL_PROMPT.md
3. Paste into Claude
4. Apply changes, validate
5. Copy Prompt 4
6. Paste into Claude
7. Apply changes, validate
```

### Session 3 (Prompt 5, ~2 hours)
```bash
1. Start Claude conversation #3 (fresh)
2. Copy Prompt 5 from /CLAUDE_COMPLETE_VISUAL_OVERHAUL_PROMPT.md (or use /CLAUDE_DESIGN_SYSTEM_PHASE4.md)
3. Paste into Claude
4. Apply changes, validate with comprehensive checklist
```

---

## 📖 Reading Order

**For the impatient:**
1. `/VISUAL_OVERHAUL_ACTION_PLAN.md` (3 min) → Start executing
2. Keep `/CLAUDE_VISUAL_OVERHAUL_QUICK_REFERENCE.md` open during execution

**For the thorough:**
1. `/DESIGN_GAP_ANALYSIS.md` (15 min) → Understand the problem
2. `/CLAUDE_COMPLETE_VISUAL_OVERHAUL_PROMPT.md` (1 hour) → Read all 5 prompts
3. `/VISUAL_OVERHAUL_ACTION_PLAN.md` (ongoing) → Execute each prompt
4. `/CLAUDE_VISUAL_OVERHAUL_QUICK_REFERENCE.md` (ongoing) → Quick lookup

---

## 🔗 Key Reference Files

### Design Specs (from `/design-system/project/`)
- `colors_and_type.css` — Color tokens, typography scale, spacing
- `preview/component-buttons.html` — Button spec
- `preview/component-card.html` — Card spec
- `preview/component-inputs.html` — Input spec
- `preview/component-leaderboard-row.html` — Leaderboard spec
- `preview/component-live-postgame.html` — Post-game spec

### Mockups (from `/.github/design-mockups/`)
- `buttons.png`
- `bingo-page.png`
- `live-trivia-post-game.png`
- `venue-home-page.png`
- `hamburger-drawer.png`
- Plus 9 more

---

## ⚠️ Critical Points

1. **Bingo border is CYAN, not orange**
   - Spec: `#7dd3fc` (cool-ice)
   - If you see warm orange: Prompt 3 failed
   - Re-run Prompt 3 with this feedback

2. **All colors use CSS custom properties**
   - Never hardcoded hex in component files
   - Exception: Inline `style={{ color: "var(--ht-*)" }}` is OK

3. **Semantic type classes are mandatory**
   - `.ht-body` for paragraphs
   - `.ht-eyebrow` for labels
   - `.ht-h1`, `.ht-h2` for headings
   - No arbitrary font sizes

4. **Focus rings required on ALL interactive elements**
   - Buttons, inputs, links, checkboxes
   - All use cyan color: `var(--ht-focus-ring)`

5. **Responsive testing required at 4 breakpoints**
   - 375px (mobile)
   - 768px (tablet)
   - 1024px (desktop)
   - 1440px (large desktop)

---

## 🆘 Support

If you get stuck during execution:

1. **Check `/CLAUDE_VISUAL_OVERHAUL_QUICK_REFERENCE.md`** for quick answers
2. **Compare your result to `/design-system/project/preview/component-*.html`** side-by-side
3. **Ask Claude:** "The color doesn't match. Spec says #22d3ee (cyan-400), but I see [different color]. Can you refactor?"
4. **Re-run the prompt** with specific feedback

---

## 🎉 When You're Done

Once all 5 prompts are complete and validated:

1. Your website matches the design mockups **pixel-for-pixel** ✅
2. All colors come from CSS custom properties ✅
3. All typography uses semantic classes ✅
4. All components have consistent styling ✅
5. All games have distinct visual identity ✅
6. Navigation is polished and correct ✅
7. Forms are accessible with focus rings ✅
8. Responsive design verified at all breakpoints ✅
9. **Ready for production** 🚀

---

## 📞 Questions?

Refer to:
- **"What's the gap?"** → `/DESIGN_GAP_ANALYSIS.md`
- **"How do I execute?"** → `/VISUAL_OVERHAUL_ACTION_PLAN.md`
- **"What colors/sizes?"** → `/CLAUDE_VISUAL_OVERHAUL_QUICK_REFERENCE.md`
- **"What's in Prompt X?"** → `/CLAUDE_COMPLETE_VISUAL_OVERHAUL_PROMPT.md`

---

## 🚀 Ready?

**Start with `/DESIGN_GAP_ANALYSIS.md` and work your way through.**

Your website is about to look **amazing**. 

Let's go. 🎨
