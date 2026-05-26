# CODEX SUBMISSION QUICK REFERENCE

## 🎯 Three Prompts to Fix Ad Slot Ambiguity

### PROMPT SEQUENCE & TIMING

```
PROMPT 1: Registry Update (optional, nice-to-have)
         ↓ wait 10-15 min if needed
PROMPT 2: Fix 8 Components (CRITICAL)
         ↓ wait 10-15 min if needed
PROMPT 3: Update Admin Form (CRITICAL, depends on Prompt 2)
```

---

## 📋 PROMPT 1: Registry Update
**Model:** Claude Codex (claude-3.5-sonnet)
**Complexity:** ⭐⭐ Low-Medium
**Time:** 5-10 min
**Status:** Optional
**Must Do:** No

**What:** Add entries 065-070 to `/lib/adSlotRegistry.ts`

**File location:** `/lib/adSlotRegistry.ts`

**Key changes:**
- Add 6 new entries (IDs 065-070)
- Add helper function `getInlineSlotsByPage()`
- Keep all existing entries unchanged

---

## 📋 PROMPT 2: Fix 8 Components  
**Model:** Claude Codex (claude-3.5-sonnet)
**Complexity:** ⭐⭐⭐ Medium
**Time:** 15-25 min
**Status:** CRITICAL
**Must Do:** YES

**What:** Replace hardcoded `slot="leaderboard-sidebar"` with correct slots

**Files to update (8 total):**
1. `/components/leaderboard/LeaderboardTable.tsx` — Lines 243, 262
2. `/app/leaderboard/page.tsx` — Line 48
3. `/components/pickem/PickEmGameList.tsx` — Line 1369
4. `/components/bingo/SportsBingoHome.tsx` — Lines 1697, 1794
5. `/components/fantasy/FantasyHome.tsx` — Line 2644
6. `/components/predictions/PredictionMarketList.tsx` — Line 1242
7. `/components/join/JoinFlow.tsx` — Line 1540
8. `/components/ui/InlineSlotAdClient.tsx` — Line 16

**Key change for Venue Leaderboard:**
Add slot mapping logic to `LeaderboardTable.tsx`:
```typescript
const VENUE_LEADERBOARD_SLOTS: Record<number, AdSlot> = {
  1: "venue-leaderboard-rows-1-10",
  2: "venue-leaderboard-rows-11-20",
  3: "venue-leaderboard-rows-21-30",
  4: "venue-leaderboard-rows-31-40",
  5: "venue-leaderboard-rows-41-50",
};
```
Then use: `slot={VENUE_LEADERBOARD_SLOTS[sequenceIndex] ?? "venue-leaderboard-rows-1-10"}`

**Key change for Other Pages:**
All other components: Replace `slot="leaderboard-sidebar"` with `slot="inline-content"`

---

## 📋 PROMPT 3: Update Admin Form
**Model:** Claude Codex (claude-3.5-sonnet)
**Complexity:** ⭐⭐⭐⭐ High
**Time:** 20-30 min
**Status:** CRITICAL
**Must Do:** YES

**What:** Update form to show correct slots + add hint text

**Files to update (2 total):**
1. `/components/admin/sections/adFormShared.tsx` — Multiple sections
2. `/lib/adPlacements.ts` — Verify only (no changes)

**Key changes:**
- Remove "mid-content" from `AD_SLOT_OPTIONS`
- Add `getSlotHintForPage()` helper function
- Add hint text display in form
- Verify slot compatibility logic (no changes needed)

---

## 🚀 SUBMISSION INSTRUCTIONS

### For PROMPT 1 (Optional):
1. Copy text from `CODEX_PROMPTS_AD_SLOTS.md` section "PROMPT 1"
2. Submit to Claude Codex
3. Review output for correctness
4. Save changes to file (or skip if not urgent)

### For PROMPT 2 (CRITICAL):
1. Copy text from `CODEX_PROMPTS_AD_SLOTS.md` section "PROMPT 2"
2. Submit to Claude Codex
3. Review output carefully:
   - Verify all 8 files are included
   - Check Venue leaderboard has mapping logic
   - Check other pages use "inline-content"
4. Apply changes to actual codebase

### For PROMPT 3 (CRITICAL):
1. Copy text from `CODEX_PROMPTS_AD_SLOTS.md` section "PROMPT 3"
2. Submit to Claude Codex
3. Review output:
   - Verify AD_SLOT_OPTIONS updated
   - Verify helper function added
   - Verify hint text logic correct
4. Apply changes to actual codebase

---

## ⚠️ RATE LIMIT HANDLING

If Codex returns "rate limited" error:
- **First attempt:** Wait 30 seconds, retry
- **Still limited:** Skip to next prompt
- **After 30 min:** Retry original prompt
- **Still stuck:** Try Prompt 1 (lowest priority)

---

## ✅ VERIFICATION AFTER ALL CHANGES

After applying all 3 prompts:

1. **TypeScript Check:**
   ```bash
   npm run type-check
   ```
   Should pass with no errors

2. **Ad System Tests:**
   - Check Join page loads ads
   - Check Venue leaderboard shows correct ads (rows 1-10, 11-20, etc)
   - Check Pick 'Em shows inline ads between cards
   - Check Bingo shows inline ads
   - Check Fantasy shows inline ads

3. **Admin Form Test:**
   - Create new ad
   - Select venue page + inline ad type
   - Verify slot dropdown shows all 5 leaderboard row options
   - Verify hint text shows: "Appears on Venue leaderboard at this row range"

4. **Placement Builder Test:**
   - Verify slots match between Create Ads and Placement Builder

---

## 📊 SUCCESS CRITERIA

After completing all prompts:
- ✅ No "leaderboard-sidebar" hardcoded in components
- ✅ Venue leaderboard ads use proper row slots (012-016)
- ✅ Other inline ads use "inline-content" with sequenceIndex
- ✅ Admin form shows correct slots per page
- ✅ Hint text helps admins understand each slot
- ✅ TypeScript passes with no errors
- ✅ All 8 components update without breaking existing functionality

---

## 📁 REFERENCE FILES

These files contain the full prompts:
- `CODEX_PROMPTS_AD_SLOTS.md` — Complete detailed prompts for Codex

These files will be modified:
- `/lib/adSlotRegistry.ts` (Prompt 1)
- `/components/leaderboard/LeaderboardTable.tsx` (Prompt 2)
- `/app/leaderboard/page.tsx` (Prompt 2)
- `/components/pickem/PickEmGameList.tsx` (Prompt 2)
- `/components/bingo/SportsBingoHome.tsx` (Prompt 2)
- `/components/fantasy/FantasyHome.tsx` (Prompt 2)
- `/components/predictions/PredictionMarketList.tsx` (Prompt 2)
- `/components/join/JoinFlow.tsx` (Prompt 2)
- `/components/ui/InlineSlotAdClient.tsx` (Prompt 2)
- `/components/admin/sections/adFormShared.tsx` (Prompt 3)
