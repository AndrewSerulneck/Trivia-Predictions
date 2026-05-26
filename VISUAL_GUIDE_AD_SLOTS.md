# 🎨 VISUAL GUIDE: Ad Slot Fixes

## Current Problem → After Codex Fixes

```
BEFORE (ALL INLINE ADS ARE GENERIC)
════════════════════════════════════════════════════════════════

JOIN PAGE
  Entry Pop-Up ..................... Slot: popup-on-entry
  Inline (between venues) .......... Slot: "leaderboard-sidebar"  ❌ GENERIC
  Mobile Banner .................... Slot: mobile-adhesion

VENUE HOME PAGE
  Entry Pop-Up ..................... Slot: popup-on-entry
  Scroll Pop-Up .................... Slot: popup-on-scroll
  Leaderboard Ad (rows 1-10) ....... Slot: "leaderboard-sidebar"  ❌ GENERIC
  Leaderboard Ad (rows 11-20) ...... Slot: "leaderboard-sidebar"  ❌ SAME! AMBIGUOUS!
  Leaderboard Ad (rows 21-30) ...... Slot: "leaderboard-sidebar"  ❌ SAME! AMBIGUOUS!
  Leaderboard Ad (rows 31-40) ...... Slot: "leaderboard-sidebar"  ❌ SAME! AMBIGUOUS!
  Leaderboard Ad (rows 41-50) ...... Slot: "leaderboard-sidebar"  ❌ SAME! AMBIGUOUS!
  Mobile Banner .................... Slot: mobile-adhesion

PICK 'EM PAGE
  Entry Pop-Up ..................... Slot: popup-on-entry
  Scroll Pop-Up .................... Slot: popup-on-scroll
  Between Cards Ad ................. Slot: "leaderboard-sidebar"  ❌ GENERIC (reused)
  Mobile Banner .................... Slot: mobile-adhesion

BINGO PAGE
  Entry Pop-Up ..................... Slot: popup-on-entry
  Scroll Pop-Up .................... Slot: popup-on-scroll
  Grid Inline Ad ................... Slot: "leaderboard-sidebar"  ❌ GENERIC (reused)
  Mobile Banner .................... Slot: mobile-adhesion

FANTASY PAGE
  Entry Pop-Up ..................... Slot: popup-on-entry
  Scroll Pop-Up .................... Slot: popup-on-scroll
  Feed Inline Ad ................... Slot: "leaderboard-sidebar"  ❌ GENERIC (reused)
  Mobile Banner .................... Slot: mobile-adhesion

PROBLEM: Admin can't distinguish between 5+ uses of "leaderboard-sidebar"


AFTER (ALL INLINE ADS ARE SPECIFIC)
════════════════════════════════════════════════════════════════

JOIN PAGE
  Entry Pop-Up ..................... Slot: popup-on-entry ................. ID: 001
  Inline (between venues) .......... Slot: inline-content ................. ID: 070
  Mobile Banner .................... Slot: mobile-adhesion ................ ID: 004

VENUE HOME PAGE
  Entry Pop-Up ..................... Slot: popup-on-entry ................. ID: 010
  Scroll Pop-Up .................... Slot: popup-on-scroll ................ ID: 011
  Leaderboard Ad (rows 1-10) ....... Slot: venue-leaderboard-rows-1-10 .... ID: 012 ✅
  Leaderboard Ad (rows 11-20) ...... Slot: venue-leaderboard-rows-11-20 ... ID: 013 ✅
  Leaderboard Ad (rows 21-30) ...... Slot: venue-leaderboard-rows-21-30 ... ID: 014 ✅
  Leaderboard Ad (rows 31-40) ...... Slot: venue-leaderboard-rows-31-40 ... ID: 015 ✅
  Leaderboard Ad (rows 41-50) ...... Slot: venue-leaderboard-rows-41-50 ... ID: 016 ✅
  Mobile Banner .................... Slot: mobile-adhesion ................ ID: 017/018

PICK 'EM PAGE
  Entry Pop-Up ..................... Slot: popup-on-entry ................. ID: 050
  Scroll Pop-Up .................... Slot: popup-on-scroll ................ ID: 051
  Between Cards Ad ................. Slot: inline-content ................. ID: 065 ✅ UNIQUE!
  Mobile Banner .................... Slot: mobile-adhesion ................ ID: 053

BINGO PAGE
  Entry Pop-Up ..................... Slot: popup-on-entry ................. ID: 040
  Scroll Pop-Up .................... Slot: popup-on-scroll ................ ID: 041
  Grid Inline Ad ................... Slot: inline-content ................. ID: 066 ✅ UNIQUE!
  Mobile Banner .................... Slot: mobile-adhesion ................ ID: 043

FANTASY PAGE
  Entry Pop-Up ..................... Slot: popup-on-entry ................. ID: 060
  Scroll Pop-Up .................... Slot: popup-on-scroll ................ ID: 061
  Feed Inline Ad ................... Slot: inline-content ................. ID: 067 ✅ UNIQUE!
  Mobile Banner .................... Slot: mobile-adhesion ................ ID: 063

BENEFIT: Every slot is unique + has 3-digit ID
BENEFIT: Admin can say "Place ad on Slot 012" with ZERO ambiguity
BENEFIT: Claude knows exactly where Slot 045 appears on website
```

---

## Admin Form Changes

```
BEFORE (FORM SHOWS GENERIC SLOTS)
════════════════════════════════════════════════════════════════

Step 1: Select Page
  ☐ Join
  ☐ Venue Home Page
  ☐ Speed Trivia
  ☐ Live Trivia
  ☐ Sports Bingo
  ☐ Pick 'Em
  ☐ Fantasy

Step 2: Select Ad Type
  ☐ Pop-Up
  ☐ Banner
  ☐ Inline

Step 3: Select Slot
  ☐ Popup (Entry)
  ☐ Popup (Scroll)
  ☐ Banner
  ☐ Inline Content          ← Same for ALL pages! ❌
  ☐ Mid Content             ← Removed


AFTER (FORM SHOWS PAGE-SPECIFIC SLOTS + HINTS)
════════════════════════════════════════════════════════════════

Step 1: Select Page
  ☐ Join
  ☐ Venue Home Page
  ☐ Speed Trivia
  ☐ Live Trivia
  ☐ Sports Bingo
  ☐ Pick 'Em              ← Selected
  ☐ Fantasy

Step 2: Select Ad Type
  ☐ Pop-Up
  ☐ Banner
  ☐ Inline               ← Selected

Step 3: Select Slot
  ☐ Popup (Entry)
  ☐ Popup (Scroll)
  ☐ Banner
  ☐ Inline Content       ← Selected

💡 Appears between Pick 'Em prediction cards    ← NEW HINT! ✅

═══════════════════════════════════════════════════════════════

When user selects VENUE + INLINE:

Step 3: Select Slot
  ☐ Popup (Entry)
  ☐ Popup (Scroll)
  ☐ Banner
  ☐ Leaderboard (Rows 1-10)      ← NEW! Page-specific ✅
  ☐ Leaderboard (Rows 11-20)     ← NEW! ✅
  ☐ Leaderboard (Rows 21-30)     ← NEW! ✅
  ☐ Leaderboard (Rows 31-40)     ← NEW! ✅
  ☐ Leaderboard (Rows 41-50)     ← NEW! ✅

💡 Appears on Venue leaderboard at this row range    ← HINT! ✅
```

---

## 3 Codex Prompts Visual Flow

```
START
  │
  ├─→ PROMPT 1 (Optional, can skip)
  │   Update Ad Slot Registry
  │   Add entries 065-070
  │   Time: 5-10 min
  │   ⏭️
  │
  ├─→ PROMPT 2 (CRITICAL)
  │   Fix 8 Components
  │   Replace slot="leaderboard-sidebar" in 10 places
  │   Time: 15-25 min
  │   ⏭️
  │
  ├─→ PROMPT 3 (CRITICAL, depends on Prompt 2)
  │   Update Admin Form
  │   Add slots + hints
  │   Time: 20-30 min
  │   ⏭️
  │
  └─→ VERIFY
      npm run type-check
      Test in browser
      ✅ Done!

TOTAL TIME: 40-65 minutes
CRITICAL PATH: Prompt 2 → Prompt 3
OPTIONAL: Prompt 1 (nice to have)
```

---

## Files Modified Summary

```
8 COMPONENTS UPDATED (Prompt 2)
═════════════════════════════════

✏️ /components/leaderboard/LeaderboardTable.tsx
   Lines: 243, 262
   Changes: 2× slot mapping logic added

✏️ /app/leaderboard/page.tsx
   Lines: 48
   Changes: 1× slot updated

✏️ /components/pickem/PickEmGameList.tsx
   Lines: 1369
   Changes: 1× slot updated

✏️ /components/bingo/SportsBingoHome.tsx
   Lines: 1697, 1794
   Changes: 2× slot updated

✏️ /components/fantasy/FantasyHome.tsx
   Lines: 2644
   Changes: 1× slot updated

✏️ /components/predictions/PredictionMarketList.tsx
   Lines: 1242
   Changes: 1× slot updated

✏️ /components/join/JoinFlow.tsx
   Lines: 1540
   Changes: 1× slot updated

✏️ /components/ui/InlineSlotAdClient.tsx
   Lines: 16
   Changes: 1× default prop updated

───────────────────────────────────────────────────────

2 CORE FILES UPDATED (Prompt 3)
═════════════════════════════════

✏️ /components/admin/sections/adFormShared.tsx
   Changes: 1) Update AD_SLOT_OPTIONS
            2) Add getSlotHintForPage() helper
            3) Add hint text display

✏️ /lib/adPlacements.ts
   Changes: Verify only (no changes needed)

───────────────────────────────────────────────────────

1 REGISTRY FILE UPDATED (Prompt 1, optional)
═════════════════════════════════════════════

✏️ /lib/adSlotRegistry.ts
   Changes: 1) Add entries 065-070
            2) Add getInlineSlotsByPage() helper
```

---

## Result: Complete Ad Slot System

```
BEFORE
──────
Generic slot naming: "leaderboard-sidebar" × 10 uses
No 3-digit ID system in actual code (just registry)
Admin form doesn't distinguish slots
Ambiguous where ads appear


AFTER
──────
✅ Specific slots: venue-leaderboard-rows-1-10, inline-content, etc.
✅ 3-digit IDs working end-to-end: 001-070
✅ Admin form shows page-specific slots with hints
✅ Every position on website has unique identifier
✅ Claude can reference "Slot 045" with zero ambiguity
✅ 8 components updated to use correct slots
✅ System is scalable and maintainable
✅ Backward compatible with existing ads
```

---

## How to Use This Guide

1. **Print this page** (optional, for reference)
2. **Open CODEX_READY_TO_SUBMIT_PROMPTS.md**
3. **Copy Prompt 2, submit to Codex**
4. **Apply changes from Codex output**
5. **Copy Prompt 3, submit to Codex**
6. **Apply changes from Codex output**
7. **Run npm run type-check**
8. **Test in browser**
9. **Done!**

---

**Still confused? → Check CODEX_QUICK_REFERENCE.md**
**Need detailed info? → Check CODEX_PROMPTS_AD_SLOTS.md**
**Ready to submit? → Copy from CODEX_READY_TO_SUBMIT_PROMPTS.md**
