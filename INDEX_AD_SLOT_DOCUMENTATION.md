# 📑 COMPLETE REFERENCE INDEX: Ad Slot Ambiguity Fix

Welcome! You've just received a complete system for fixing ad slot ambiguity in your Trivia-Predictions app. This file is your index to all the documentation.

---

## 🚀 QUICK START (TL;DR)

1. **What's the problem?** All inline ads use `"leaderboard-sidebar"` — impossible to distinguish between different pages
2. **What's the solution?** Use Codex to update 8 components + admin form to use page-specific slots
3. **How long?** 40-65 minutes for code changes + 15 min testing = ~75-80 minutes total
4. **What do I do?** Open `CODEX_READY_TO_SUBMIT_PROMPTS.md` and copy/paste 2-3 prompts to Codex

---

## 📚 DOCUMENTATION FILES (in recommended reading order)

### 🟢 Start Here
**File:** `FINAL_SUMMARY_AD_SLOT_FIX.md`
- Overview of problem and solution
- What's being changed and why
- How to proceed step-by-step
- Success checklist
- **Read this first** ← You are here now

### 🟡 Then Look At This
**File:** `VISUAL_GUIDE_AD_SLOTS.md`
- Before/After diagrams
- Visual representation of slot changes
- Admin form UI changes
- Codex prompt flow diagram
- File modification summary
- **Read before submitting prompts**

### 🟠 Reference During Submission
**File:** `CODEX_QUICK_REFERENCE.md`
- Quick reference card
- Model/complexity levels per prompt
- File locations to update
- Rate limit handling
- Verification checklist
- **Keep this open while working**

### 🔴 When Ready to Submit to Codex
**File:** `CODEX_READY_TO_SUBMIT_PROMPTS.md`
- 3 copy-paste-ready prompts
- Exactly formatted for Codex input
- No modifications needed
- **Copy section headings and paste into Codex**

### 📋 Complete Reference (if needed)
**File:** `CODEX_PROMPTS_AD_SLOTS.md`
- Full detailed prompts with explanations
- Background context for each change
- Detailed file locations
- Constraints and important notes
- **Reference only if Codex asks questions**

---

## 🎯 THE 3 CODEX PROMPTS

| # | Name | What | Model | Time | Critical? | Do First? |
|---|------|------|-------|------|-----------|-----------|
| 1 | Registry Update | Add entries 065-070 to `/lib/adSlotRegistry.ts` | Sonnet | 5-10m | No | No (optional) |
| 2 | Fix 8 Components | Replace `slot="leaderboard-sidebar"` in 8 files | Sonnet/Opus | 15-25m | **YES** | **YES** |
| 3 | Update Admin Form | Add slots + hints to `/components/admin/sections/adFormShared.tsx` | Opus | 20-30m | **YES** | After #2 |

---

## 📊 WHAT CHANGES

### Components Updated (Prompt 2 — 8 files, 10 instances):
- `/components/leaderboard/LeaderboardTable.tsx` — 2 instances
- `/app/leaderboard/page.tsx` — 1 instance
- `/components/pickem/PickEmGameList.tsx` — 1 instance
- `/components/bingo/SportsBingoHome.tsx` — 2 instances
- `/components/fantasy/FantasyHome.tsx` — 1 instance
- `/components/predictions/PredictionMarketList.tsx` — 1 instance
- `/components/join/JoinFlow.tsx` — 1 instance
- `/components/ui/InlineSlotAdClient.tsx` — 1 instance

### Admin Form Updated (Prompt 3):
- `/components/admin/sections/adFormShared.tsx` — Form slots + hint text
- `/lib/adPlacements.ts` — Verify only (no changes needed)

### Registry Updated (Prompt 1 — optional):
- `/lib/adSlotRegistry.ts` — Add entries 065-070 + helper function

---

## ⏱️ ESTIMATED TIMELINE

| Phase | Time | What |
|-------|------|------|
| **Planning** | 5 min | Read `FINAL_SUMMARY_AD_SLOT_FIX.md` + `VISUAL_GUIDE_AD_SLOTS.md` |
| **Prompt 2** | 15-25 min | Submit to Codex, review output, apply changes |
| **Prompt 3** | 20-30 min | Submit to Codex, review output, apply changes |
| **Prompt 1** | 5-10 min | (Optional) Submit to Codex, apply changes |
| **Verification** | 10-15 min | `npm run type-check` + browser testing |
| **Total** | **55-95 min** | Complete fix applied and tested |

---

## ✅ SUCCESS CRITERIA

After completing all prompts and changes:

- [ ] No `slot="leaderboard-sidebar"` hardcoded in components
- [ ] Venue leaderboard uses: `venue-leaderboard-rows-1-10` through `venue-leaderboard-rows-41-50`
- [ ] Other pages use: `inline-content` (generic with `sequenceIndex` for position)
- [ ] Registry has entries 065-070 added (if Prompt 1 executed)
- [ ] Admin form shows page-specific slots with hint text
- [ ] Form shows 5 separate leaderboard row slots (not generic)
- [ ] TypeScript check passes: `npm run type-check` ✅
- [ ] Ads render correctly on all pages in browser
- [ ] No breaking changes to existing ads
- [ ] Can reference ads by 3-digit Slot ID (e.g., "Slot 045")

---

## 🚨 RATE LIMITING STRATEGY

Claude may rate limit you. Here's what to do:

**Before you start:**
- Prompt 2 is most critical (do this first)
- Prompt 3 depends on Prompt 2 results
- Prompt 1 is optional (lowest priority)

**If you get rate limited:**
1. Wait 30 seconds, try same prompt again
2. Still limited? Move to next prompt
3. After 5-10 min, circle back to failed prompt

**Spacing:** Try to space prompts 10-15 minutes apart if possible

---

## 🔍 DOCUMENT PURPOSES AT A GLANCE

```
FINAL_SUMMARY_AD_SLOT_FIX.md
└─ Executive summary, what's happening, how to proceed
  
VISUAL_GUIDE_AD_SLOTS.md
└─ Before/after diagrams, visual flows, change summaries

CODEX_QUICK_REFERENCE.md
└─ One-page cheat sheet, quick lookup, checklist

CODEX_READY_TO_SUBMIT_PROMPTS.md
├─ PROMPT 1: Add registry entries (optional)
├─ PROMPT 2: Fix 8 components (critical)
└─ PROMPT 3: Update admin form (critical)

CODEX_PROMPTS_AD_SLOTS.md
├─ Same as above but with more detail/explanation
└─ Reference only
```

---

## 🎓 WHAT YOU'LL LEARN

By executing these prompts and applying the changes, you'll understand:
- How ad slots work in your system
- How to distinguish between different inline ad placements
- How admin forms work with slot selection
- How to use the 3-digit ID system for precision
- How to scale ad placement as new pages/positions are added

---

## 🔗 NEXT STEPS

**Ready to start?**

1. ✅ You're reading the index (this file)
2. ⏭️ Read `FINAL_SUMMARY_AD_SLOT_FIX.md` (overview)
3. ⏭️ Read `VISUAL_GUIDE_AD_SLOTS.md` (visual reference)
4. ⏭️ Open `CODEX_READY_TO_SUBMIT_PROMPTS.md`
5. ⏭️ Copy Prompt 2, submit to Codex
6. ⏭️ Apply changes
7. ⏭️ Copy Prompt 3, submit to Codex
8. ⏭️ Apply changes
9. ⏭️ Run type check + test
10. ⏭️ Done! ✅

**Questions?**
- "What's the problem?" → `FINAL_SUMMARY_AD_SLOT_FIX.md`
- "Show me visually" → `VISUAL_GUIDE_AD_SLOTS.md`
- "Quick lookup" → `CODEX_QUICK_REFERENCE.md`
- "Ready to submit" → `CODEX_READY_TO_SUBMIT_PROMPTS.md`
- "Need details?" → `CODEX_PROMPTS_AD_SLOTS.md`

---

## 📍 File Location

All documentation files are in your workspace root:
```
/Users/andrewserulneck/Documents/Trivia-Predictions/
├── CODEX_PROMPTS_AD_SLOTS.md
├── CODEX_QUICK_REFERENCE.md
├── CODEX_READY_TO_SUBMIT_PROMPTS.md
├── FINAL_SUMMARY_AD_SLOT_FIX.md
├── VISUAL_GUIDE_AD_SLOTS.md
└── INDEX_AD_SLOT_DOCUMENTATION.md ← You are here
```

---

## 🎯 TL;DR FOR BUSY PEOPLE

**The Problem:** All inline ads called `"leaderboard-sidebar"` → can't distinguish between different pages
**The Solution:** 3 Codex prompts update 8 components + admin form to use specific slots
**How long:** ~75 minutes total
**Success metric:** Every ad slot has unique 3-digit ID, admin form shows page-specific slots
**Start:** Open `CODEX_READY_TO_SUBMIT_PROMPTS.md` and copy Prompt 2

---

**Good luck! You're about to create a fully specified, unambiguous ad slot system. 🚀**

*Last updated: May 25, 2026*
