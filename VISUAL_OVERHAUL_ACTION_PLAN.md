# Complete Visual Overhaul — Execution Action Plan

## 🎯 Mission
Transform your website to match the design mockups **pixel-for-pixel** using a **5-prompt sequential strategy**.

---

## 📋 Pre-Execution Checklist

Before you start ANY prompts, verify:

- [ ] Read `/CLAUDE_COMPLETE_VISUAL_OVERHAUL_PROMPT.md` (full master prompt)
- [ ] Read `/CLAUDE_VISUAL_OVERHAUL_QUICK_REFERENCE.md` (quick ref)
- [ ] Read `/DESIGN_GAP_ANALYSIS.md` (understand the gap)
- [ ] `/design-system/project/preview/` folder exists and has `.html` files
- [ ] `/.github/design-mockups/` folder exists with PNG screenshots
- [ ] Local app runs: `npm run dev` → `localhost:3000` works
- [ ] Have DevTools open ready to inspect elements

---

## 🚀 Execution Strategy

### Phase A: Foundation (Prompts 1–2, ~4 hours)
These establish the design system enforcement. **CRITICAL for everything that follows.**

### Phase B: Visual Identity (Prompts 3–4, ~4–5 hours)
These make the website **look distinctive** by game and **navigate correctly**.

### Phase C: Polish & QA (Prompt 5, ~2 hours)
This brings it all home and validates everything.

---

## 📍 PROMPT 1: Global Styles Enforcement

**Status:** ⏳ READY TO EXECUTE

### Setup
```bash
# 1. Open file:
/CLAUDE_COMPLETE_VISUAL_OVERHAUL_PROMPT.md

# 2. Find section:
# "PROMPT 1 OF 5: Global Styles Enforcement & Theme Tokens"

# 3. Copy the entire "Prompt Template for Claude (Copy-Paste Ready)"
#    section (starts with "# PROMPT 1: Global Styles...")
```

### Execute
```
1. Start NEW Claude conversation
2. Set intelligence: MAXIMUM (enable extended thinking if available)
3. Paste the Prompt 1 template
4. Press Send
5. WAIT for Claude's 3-bullet execution plan FIRST
6. Review the plan (should list: globals.css, tailwind.config.ts, +80 CSS rules)
7. Review the code after the plan
8. Copy-paste the changes into your files
```

### Validate
```bash
# After Claude's code:
npm run dev

# Test:
1. Open DevTools on any page
2. Inspect <html> element
3. Computed style: background should show #020617 (from var)
4. Add class "ht-body" to any <div>
5. Font should be Nunito, size 16px, weight 600

# If all ✓ : Move to Prompt 2
# If ❌ : Re-run Prompt 1 or ask Claude for debugging
```

---

## 📍 PROMPT 2: UI Component Library Alignment

**Status:** ⏳ READY TO EXECUTE

### Setup
```bash
# 1. Open file:
/CLAUDE_COMPLETE_VISUAL_OVERHAUL_PROMPT.md

# 2. Find section:
# "PROMPT 2 OF 5: UI Component Library Alignment"

# 3. Copy the "Prompt Template" section
```

### Execute
```
1. Start NEW Claude conversation (or continue from Prompt 1)
2. Set intelligence: MAXIMUM
3. Paste the Prompt 2 template
4. Press Send
5. WAIT for 3-bullet execution plan
6. Review the file list (should be 30+ components grouped by type)
7. Review the code
8. Apply changes to your component files
```

### Validate
```bash
npm run dev

# Visit pages and compare:
1. Open /design-system/project/preview/component-buttons.html in browser
2. Open localhost:3000/join in another tab
3. Look at both buttons side-by-side
4. Compare:
   - Color ✓?
   - Size ✓?
   - Padding ✓?
   - Hover effect ✓?
   - Shadow ✓?

# If most ✓ : Move to Prompt 3
# If ❌ : Claude may need to refine Component 2 details
```

---

## 📍 PROMPT 3: Game Landing Screens & Gradients

**Status:** ⏳ READY TO EXECUTE

### Setup
```bash
# 1. Open file:
/CLAUDE_COMPLETE_VISUAL_OVERHAUL_PROMPT.md

# 2. Find section:
# "PROMPT 3 OF 5: Game Landing Screens & Gradient Styling"

# 3. Copy the "Prompt Template"
```

### Execute
```
1. Start NEW Claude conversation
2. Set intelligence: MAXIMUM
3. Paste the Prompt 3 template
4. Press Send
5. WAIT for 3-bullet execution plan
6. Review the 5 game files it will modify
7. Review the gradient tokens it will apply
8. Review the code
9. Apply changes to game landing pages
```

### Validate (CRITICAL)
```bash
npm run dev

# TEST EACH GAME:
1. Open localhost:3000/trivia
   - Should see: Cyan → Blue → Violet gradient background
   - Screenshot ✓

2. Open localhost:3000/bingo
   - Should see: Green casino felt background
   - Border should be CYAN (#7dd3fc), NOT warm orange
   - Screenshot ✓
   - **THIS IS CRITICAL** — if border is warm, Prompt 3 failed

3. Open localhost:3000/pickem
   - Should see: Navy ↔ Magenta diagonal split
   - Screenshot ✓

4. Open localhost:3000/fantasy
   - Should see: Dark forest green
   - Screenshot ✓

# If all ✓ : Move to Prompt 4
# If Bingo border is WARM ❌ : Re-run Prompt 3 with feedback
```

---

## 📍 PROMPT 4: Navigation & Page Layout Overhaul

**Status:** ⏳ READY TO EXECUTE

### Setup
```bash
# 1. Open file:
/CLAUDE_COMPLETE_VISUAL_OVERHAUL_PROMPT.md

# 2. Find section:
# "PROMPT 4 OF 5: Page Layout Precision & Navigation Overhaul"

# 3. Copy the "Prompt Template"
```

### Execute
```
1. Start NEW Claude conversation
2. Set intelligence: HIGH
3. Paste the Prompt 4 template
4. Press Send
5. WAIT for 3-bullet execution plan
6. Review the nav files it will modify
7. Review the changes to drawer, navbar, countdown, page shell
8. Review the code
9. Apply changes to your navigation components
```

### Validate
```bash
npm run dev

# TEST NAVIGATION:
1. Open hamburger drawer
   - Username + Points should be at ABSOLUTE TOP (sticky)
   - Does it scroll down with menu items? ❌ WRONG
   - Does it stay at top? ✓ CORRECT

2. Look at top nav
   - Venue name should be CENTERED (not left-aligned)
   - Alerts button should be at right
   - Screenshot ✓

3. Check home page
   - Should see countdown section if live trivia starting soon
   - Gradient background (from Prompt 3)
   - "Round 1 starts in XX:XX" text
   - "Enter Lobby →" button

# If all ✓ : Move to Prompt 5
# If ❌ : Note specific issue and re-run Prompt 4
```

---

## 📍 PROMPT 5: Final Polish & Comprehensive QA

**Status:** ⏳ READY TO EXECUTE

### Setup
```bash
# 1. Open file:
/CLAUDE_DESIGN_SYSTEM_PHASE4.md

# (Use Phase 4 doc for final QA, or create new if you prefer)

# OR copy the equivalent section from:
/CLAUDE_COMPLETE_VISUAL_OVERHAUL_PROMPT.md
# "PROMPT 5 OF 5: Final Visual Polish & Comprehensive QA"
```

### Execute
```
1. Start NEW Claude conversation
2. Set intelligence: HIGH
3. Paste the Prompt 5 template
4. Press Send
5. Review 3-bullet execution plan
6. Focus areas:
   - Leaderboard rank badge styling
   - Post-game card polish
   - Form input focus rings
   - Responsive testing at 4 breakpoints
7. Apply changes
8. Run full testing suite (see Validation below)
```

### Validate (COMPREHENSIVE)
```bash
npm run dev

# TEST LEADERBOARD:
1. Open localhost:3000/leaderboard
   - Rank badges visible (1st=gold, 2nd=silver, 3rd=bronze)
   - Row styling matches spec
   - "You" badge on your row
   - Screenshot ✓

# TEST POST-GAME SCREEN:
1. Navigate to end of a trivia game (if in-dev, mock it)
   - Champion banner visible with crown
   - Podium shows 1st/2nd/3rd
   - Round breakdown with bars
   - Stat strip at bottom
   - Screenshot ✓

# TEST FORMS:
1. Open localhost:3000/join
   - Click input field
   - Should see cyan focus ring
   - Screenshot ✓

# TEST RESPONSIVE (at each breakpoint):
1. DevTools → Device toolbar
2. 375px (iPhone SE):
   - No horizontal scroll ✓
   - Buttons tappable ✓
   - Text readable ✓
   - Screenshot ✓

3. 768px (iPad):
   - Multi-column layout works ✓
   - Spacing balanced ✓
   - Screenshot ✓

4. 1024px (Desktop):
   - Max-width applied ✓
   - Centered content ✓
   - Screenshot ✓

5. 1440px (Large Desktop):
   - Content not stretched ✓
   - Still centered ✓
   - Screenshot ✓

# TEST BROWSERS:
1. Chrome: ✓
2. Safari: ✓
3. Firefox: ✓

# FINAL CHECK:
npm run build
# Should complete without errors

# If all ✓ : LAUNCH! 🚀
# If ❌ : Note issues and ask Claude for final tweaks
```

---

## ✅ Completion Checklist

Once you've executed all 5 prompts and passed validation:

- [ ] Prompt 1: Global styles complete (80+ new CSS rules)
- [ ] Prompt 2: 30+ components updated to match spec
- [ ] Prompt 3: All 5 game gradients applied correctly
- [ ] Prompt 4: Navigation structure correct (hamburger, navbar, countdown)
- [ ] Prompt 5: Final polish, leaderboard, post-game, forms, responsive QA

### Final Validation

Open these side-by-side and compare:

| Design Spec | Your Website | Match? |
|-------------|-------------|--------|
| `/design-system/project/preview/component-buttons.html` | `localhost:3000/join` | ✅ |
| `/design-system/project/preview/component-card.html` | Any page with cards | ✅ |
| `/design-system/project/preview/component-inputs.html` | `localhost:3000/join` form | ✅ |
| `/design-system/project/preview/component-leaderboard-row.html` | `localhost:3000/leaderboard` | ✅ |
| `/design-system/project/preview/component-live-postgame.html` | Post-game screen | ✅ |
| `/design-system/project/preview/colors-game-identities.html` | Game landing pages | ✅ |
| `/.github/design-mockups/hamburger-drawer.png` | Your hamburger | ✅ |
| `/.github/design-mockups/venue-home-page.png` | Your home page | ✅ |

If all ✅ → **Website is complete and production-ready** 🚀

---

## 📊 Timeline Estimate

| Phase | Prompts | Time | Cumulative |
|-------|---------|------|-----------|
| A | 1–2 | ~4h | 4h |
| B | 3–4 | ~4–5h | 8–9h |
| C | 5 | ~2h | 10–11h |

**Total: 10–14 hours of Claude work** (split across multiple conversations)

---

## 🆘 If You Get Stuck

### Issue: Prompt output is incomplete
**Solution:** Copy-paste the 3-bullet execution plan back to Claude and ask: "Please complete this code" or "Can you refactor this into smaller chunks?"

### Issue: Code doesn't apply cleanly
**Solution:** Ask Claude for a diff or refactored version of just the affected file

### Issue: Styles don't match spec
**Solution:** Compare to `/design-system/project/preview/component-*.html` and provide Claude with the exact spec values (colors, sizes, shadows)

### Issue: One game gradient is wrong
**Solution:** Check `/app/globals.css` for the correct `--ht-game-*` token value and ask Claude to verify

### Issue: Bingo border is warm orange (not cool cyan)
**Solution:** This is a Prompt 3 failure. Re-run with feedback: "The border should be #7dd3fc (cool cyan), not warm orange. Use var(--ht-game-bingo-edge) which is defined in globals.css."

---

## 🎬 Ready?

1. **Read the three supporting docs:**
   - `/CLAUDE_COMPLETE_VISUAL_OVERHAUL_PROMPT.md` (master, contains all 5 prompt templates)
   - `/CLAUDE_VISUAL_OVERHAUL_QUICK_REFERENCE.md` (quick ref during execution)
   - `/DESIGN_GAP_ANALYSIS.md` (understand what's wrong)

2. **Execute Prompts 1–5 in order**

3. **Validate after each prompt**

4. **Ship when all 5 are complete** ✅

---

## 🚀 Let's Go

**You have everything you need. Execute the prompts and transform your website.**

The mockups will become reality. Pixel-for-pixel.

Start with Prompt 1. Good luck! 🎨
