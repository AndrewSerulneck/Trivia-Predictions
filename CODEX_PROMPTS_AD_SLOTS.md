# CODEX PROMPTS: Fix Inline Ad Slot Ambiguity

**Goal:** Eliminate generic "leaderboard-sidebar" fallback by mapping all inline ads to page-specific slots with 3-digit IDs.

**Total Prompts:** 3 (independent, can execute in any order)
**Expected Total Time:** 40-65 minutes
**Rate Limit Strategy:** Codex is more efficient than Claude, but space prompts 15+ minutes apart if hitting limits.

---

## PROMPT 1: Update Ad Slot Registry with Refined Mapping

**Model:** Claude Codex (claude-3.5-sonnet backend)
**Complexity:** ⭐⭐ (Low-Medium — straightforward data mapping)
**Time:** 5-10 minutes
**Status:** Optional (nice to have, no blockers)

```
=== CODEX TASK ===
Update /lib/adSlotRegistry.ts to add new inline slot entries (IDs 065-070).

CURRENT FILE: /lib/adSlotRegistry.ts (first 75 lines shown)
```typescript
import type { AdPageKey, AdSlot, AdDisplayTrigger } from "@/types";

export type SlotRegistryEntry = {
  id: string;               // 3-digit string e.g. "001"
  label: string;            // human-readable name
  pageKey: AdPageKey;
  slot: AdSlot;
  trigger: AdDisplayTrigger;
  roundNumber?: number;
};

export const AD_SLOT_REGISTRY: SlotRegistryEntry[] = [
  // JOIN
  { id: "001", label: "Join Entry Pop-Up",          pageKey: "join",         slot: "popup-on-entry",                 trigger: "on-load"  },
  { id: "003", label: "Join Inline Content",         pageKey: "join",         slot: "inline-content",                 trigger: "on-load"  },
  { id: "004", label: "Join Mobile Banner",          pageKey: "join",         slot: "mobile-adhesion",                trigger: "on-load"  },
  // ... more entries ...
  { id: "064", label: "Fantasy Mobile Banner (Scroll)", pageKey: "fantasy",   slot: "mobile-adhesion",                trigger: "on-scroll"},
];
```

TASK:
1. Keep all existing entries (IDs 001-064) UNCHANGED
2. Add these 6 NEW entries to AD_SLOT_REGISTRY array BEFORE the closing bracket:
   - ID 065: Pick 'Em Inline (Between Cards)
   - ID 066: Bingo Inline (Under Grid)  
   - ID 067: Fantasy Inline (Feed)
   - ID 068: Live Trivia Inline (Lobby)
   - ID 069: Predictions Inline (Market List)
   - ID 070: Join Inline Venue List

3. For each new entry use:
   - pageKey: appropriate page ("pickem", "sports-bingo", "fantasy", "live-trivia", "join")
   - slot: "inline-content" for all
   - trigger: "on-load" for all
   - roundNumber: undefined (omit) for all

4. Add this helper function AFTER AD_SLOT_REGISTRY closes:

export function getInlineSlotsByPage(pageKey: AdPageKey): SlotRegistryEntry[] {
  return AD_SLOT_REGISTRY.filter(
    (e) => e.pageKey === pageKey && 
    (e.slot === "inline-content" || 
     e.slot.startsWith("venue-leaderboard-rows-"))
  );
}

IMPORTANT NOTES:
- Do NOT modify type definitions
- Do NOT change lines 1-10 (imports and types)
- Do NOT modify existing entries
- Only add new entries and the helper function
- Maintain exact formatting/indentation

OUTPUT:
Provide COMPLETE updated file with all changes applied.
```

---

## PROMPT 2: Update 8 Components to Use Correct Slot Names

**Model:** Claude Codex (claude-3.5-sonnet backend)  
**Complexity:** ⭐⭐⭐ (Medium — straightforward replacements, minor logic)
**Time:** 15-25 minutes
**Status:** CRITICAL — must execute

```
=== CODEX TASK ===
Fix 8 components that hardcode slot="leaderboard-sidebar" to use correct page-specific slots.

TASK OVERVIEW:
Replace generic "leaderboard-sidebar" with correct slots in these 8 files.
For VENUE leaderboard, use smart logic to map sequenceIndex to correct row range.
For other pages, use "inline-content".

=== FILE 1: /components/leaderboard/LeaderboardTable.tsx ===
Lines 243 and 262: Two InlineSlotAdClient components with slot="leaderboard-sidebar"

CURRENT CODE (line 243):
```
                      <td colSpan={3} className="px-3 py-3">
                        <InlineSlotAdClient
                          slot="leaderboard-sidebar"
                          venueId={venueId}
                          pageKey="venue"
                          adType="inline"
                          displayTrigger="on-load"
                          placementKey="venue-leaderboard-inline"
                          sequenceIndex={sequenceIndex}
                          showPlaceholder
                        />
                      </td>
```

CURRENT CODE (line 262):
```
                    <td colSpan={3} className="px-3 py-3">
                      <InlineSlotAdClient
                        slot="leaderboard-sidebar"
                        venueId={venueId}
                        pageKey="venue"
                        adType="inline"
                        displayTrigger="on-load"
                        placementKey="venue-leaderboard-inline"
                        sequenceIndex={sequenceIndex}
                        showPlaceholder
                      />
                    </td>
```

REQUIRED CHANGES:
Add this constant BEFORE the component returns JSX (around line 15-20):
```typescript
const VENUE_LEADERBOARD_SLOTS: Record<number, AdSlot> = {
  1: "venue-leaderboard-rows-1-10",
  2: "venue-leaderboard-rows-11-20",
  3: "venue-leaderboard-rows-21-30",
  4: "venue-leaderboard-rows-31-40",
  5: "venue-leaderboard-rows-41-50",
};
```

Then replace slot="leaderboard-sidebar" on both lines:
Replace with: slot={VENUE_LEADERBOARD_SLOTS[sequenceIndex] ?? "venue-leaderboard-rows-1-10"}

=== FILE 2: /app/leaderboard/page.tsx ===
Line 48: InlineSlotAdClient with slot="leaderboard-sidebar"

CURRENT CODE:
```
        <InlineSlotAdClient
          slot="leaderboard-sidebar"
          venueId={venueId}
          pageKey="venue"
          adType="inline"
          displayTrigger="on-load"
          placementKey="venue-leaderboard-inline"
          sequenceIndex={1}
          showPlaceholder
        />
```

CHANGE: Replace slot="leaderboard-sidebar" with slot="venue-leaderboard-rows-1-10"

=== FILE 3: /components/pickem/PickEmGameList.tsx ===
Line 1369: InlineSlotAdClient with slot="leaderboard-sidebar"

CURRENT CODE:
```
        <InlineSlotAdClient
          slot="leaderboard-sidebar"
          venueId={venueId}
          pageKey="pickem"
          adType="inline"
          displayTrigger="on-load"
          placementKey="pickem-inline"
          sequenceIndex={sequenceIndex}
          showPlaceholder
        />
```

CHANGE: Replace slot="leaderboard-sidebar" with slot="inline-content"

=== FILE 4: /components/bingo/SportsBingoHome.tsx ===
Lines 1697 and 1794: Two InlineSlotAdClient components with slot="leaderboard-sidebar"

CURRENT CODE (line 1697):
```
        <InlineSlotAdClient
          slot="leaderboard-sidebar"
          venueId={venueId}
          pageKey="sports-bingo"
          adType="inline"
          displayTrigger="on-load"
          placementKey="bingo-inline"
          sequenceIndex={1}
          showPlaceholder
        />
```

CURRENT CODE (line 1794):
```
        <InlineSlotAdClient
          slot="leaderboard-sidebar"
          venueId={venueId}
          pageKey="sports-bingo"
          adType="inline"
          displayTrigger="on-load"
          placementKey="bingo-inline"
          sequenceIndex={2}
          showPlaceholder
        />
```

CHANGE: Replace slot="leaderboard-sidebar" with slot="inline-content" in BOTH instances.

=== FILE 5: /components/fantasy/FantasyHome.tsx ===
Line 2644: InlineSlotAdClient with slot="leaderboard-sidebar"

CURRENT CODE:
```
        <InlineSlotAdClient
          slot="leaderboard-sidebar"
          venueId={venueId}
          pageKey="fantasy"
          adType="inline"
          displayTrigger="on-load"
          placementKey="fantasy-inline"
          sequenceIndex={sequenceIndex}
          showPlaceholder
        />
```

CHANGE: Replace slot="leaderboard-sidebar" with slot="inline-content"

=== FILE 6: /components/predictions/PredictionMarketList.tsx ===
Line 1242: InlineSlotAdClient with slot="leaderboard-sidebar"

CURRENT CODE:
```
          <InlineSlotAdClient
            slot="leaderboard-sidebar"
            venueId={venueId}
            pageKey="join"
            adType="inline"
            displayTrigger="on-load"
            placementKey="predictions-inline"
            sequenceIndex={sequenceIndex}
            showPlaceholder
          />
```

CHANGE: Replace slot="leaderboard-sidebar" with slot="inline-content"

=== FILE 7: /components/join/JoinFlow.tsx ===
Line 1540: InlineSlotAdClient with slot="leaderboard-sidebar"

CURRENT CODE:
```
                        <InlineSlotAdClient
                          slot="leaderboard-sidebar"
                          venueId={venueId}
                          pageKey="join"
                          adType="inline"
                          displayTrigger="on-load"
                          placementKey="join-inline"
                          sequenceIndex={sequenceIndex}
                          showPlaceholder
                        />
```

CHANGE: Replace slot="leaderboard-sidebar" with slot="inline-content"

=== FILE 8: /components/ui/InlineSlotAdClient.tsx ===
Line 16: Default prop value

CURRENT CODE:
```typescript
export function InlineSlotAdClient({
  slot = "leaderboard-sidebar",
  venueId,
  ...
```

CHANGE: Replace slot = "leaderboard-sidebar" with slot = "inline-content"
(This provides a better default fallback)

OUTPUT:
Provide complete updated code for each file with changes applied.
Focus on accuracy of the slot assignments and logic.
```

---

## PROMPT 3: Update Admin Form to Reflect New Slot Structure

**Model:** Claude Codex (claude-3.5-sonnet backend)
**Complexity:** ⭐⭐⭐⭐ (High — form logic, conditional rendering)
**Time:** 20-30 minutes
**Status:** CRITICAL — must execute after Prompt 2

```
=== CODEX TASK ===
Update admin Create Ads form to show correct inline slot options per page.
Remove "leaderboard-sidebar" from form options.
Add page-specific hint text for inline ads.

=== FILE 1: /components/admin/sections/adFormShared.tsx ===

PART A: Update AD_SLOT_OPTIONS (around line 35-46)

CURRENT:
```typescript
export const AD_SLOT_OPTIONS: Array<{ value: AdSlot; label: string }> = [
  { value: "popup-on-entry", label: "Popup (Entry)" },
  { value: "popup-on-scroll", label: "Popup (Scroll)" },
  { value: "mobile-adhesion", label: "Banner" },
  { value: "venue-leaderboard-rows-1-10", label: "Leaderboard (Rows 1-10)" },
  { value: "venue-leaderboard-rows-11-20", label: "Leaderboard (Rows 11-20)" },
  { value: "venue-leaderboard-rows-21-30", label: "Leaderboard (Rows 21-30)" },
  { value: "venue-leaderboard-rows-31-40", label: "Leaderboard (Rows 31-40)" },
  { value: "venue-leaderboard-rows-41-50", label: "Leaderboard (Rows 41-50)" },
  { value: "inline-content", label: "Inline Content" },
  { value: "mid-content", label: "Mid Content" },
];
```

CHANGE: Remove "mid-content" line (not used). Keep all others exactly as shown:
```typescript
export const AD_SLOT_OPTIONS: Array<{ value: AdSlot; label: string }> = [
  { value: "popup-on-entry", label: "Popup (Entry)" },
  { value: "popup-on-scroll", label: "Popup (Scroll)" },
  { value: "mobile-adhesion", label: "Banner" },
  { value: "venue-leaderboard-rows-1-10", label: "Leaderboard (Rows 1-10)" },
  { value: "venue-leaderboard-rows-11-20", label: "Leaderboard (Rows 11-20)" },
  { value: "venue-leaderboard-rows-21-30", label: "Leaderboard (Rows 21-30)" },
  { value: "venue-leaderboard-rows-31-40", label: "Leaderboard (Rows 31-40)" },
  { value: "venue-leaderboard-rows-41-50", label: "Leaderboard (Rows 41-50)" },
  { value: "inline-content", label: "Inline Content" },
];
```

PART B: Add helper function (add after defaultAdDraft() function, around line 140)

Add this function:
```typescript
function getSlotHintForPage(pageKey: AdPageKey, slot: AdSlot): string {
  if (slot === "inline-content") {
    switch (pageKey) {
      case "pickem":
        return "Appears between Pick 'Em prediction cards";
      case "sports-bingo":
        return "Appears within Bingo game area";
      case "fantasy":
        return "Appears in Fantasy player feed";
      case "live-trivia":
        return "Appears in Live Trivia lobby content";
      case "join":
        return "Appears between venue listings";
      default:
        return "Inline ad placement";
    }
  }
  if (slot.startsWith("venue-leaderboard-rows-")) {
    return "Appears on Venue leaderboard at this row range";
  }
  return "";
}
```

PART C: Update slot description display in form (find where slot is displayed to user, around line 400-450)

Find the section showing slot options and add hint display:
```typescript
{/* Slot selection */}
<div>
  <label className="block text-sm font-semibold text-gray-700">Ad Slot</label>
  <select
    value={draft.slot}
    onChange={(e) => updateDraft({ slot: e.target.value as AdSlot })}
    className="mt-1 w-full..."
  >
    {slotOptions.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
  {/* ADD THIS HINT TEXT */}
  {slotHint && (
    <p className="mt-2 text-xs text-gray-500 italic">
      💡 {slotHint}
    </p>
  )}
</div>
```

Add this line near top of component JSX section (around line 300):
```typescript
const slotHint = getSlotHintForPage(draft.pageKey, draft.slot);
```

=== FILE 2: /lib/adPlacements.ts ===

TASK: Verify (no changes needed, just audit)
- Check line ~228 in isSlotCompatibleWithAdType() function
- Verify it includes: "venue-leaderboard-rows-1-10" through "venue-leaderboard-rows-41-50"
- Verify it includes: "inline-content"
- This logic is CORRECT; no changes needed
- Just confirm it's as expected

OUTPUT:
Provide complete updated files with all changes applied.
Confirm that slot options and form display align with backend placement logic.
```

---

## EXECUTION CHECKLIST

Use this when submitting prompts to Codex:

### Before Executing Any Prompt:
- [ ] Copy prompt text exactly (no modifications)
- [ ] Note the file paths you'll need
- [ ] Have the current code ready in separate window

### Prompt 1 (Optional):
- [ ] Execute: "Update Ad Slot Registry..."
- [ ] Verify: New entries 065-070 added
- [ ] Verify: Helper function added
- [ ] Save result to temp file

### Prompt 2 (CRITICAL):
- [ ] Execute: "Fix 8 Components..."
- [ ] Verify: All 8 files updated
- [ ] Verify: Venue leaderboard uses slot mapping logic
- [ ] Verify: Other pages use "inline-content"
- [ ] Save result to temp file
- [ ] Apply changes to actual files

### Prompt 3 (CRITICAL):
- [ ] Execute: "Update Admin Form..."
- [ ] Verify: AD_SLOT_OPTIONS updated
- [ ] Verify: Helper function added
- [ ] Verify: Hint text renders in form
- [ ] Save result to temp file
- [ ] Apply changes to actual files

### Final Verification:
- [ ] Run type check: `npm run type-check` or similar
- [ ] Verify no TypeScript errors
- [ ] Test admin form in browser
- [ ] Test ad rendering on each page
- [ ] Verify Placement Builder shows correct slots

---

## RATE LIMIT STRATEGY

Codex has better rate limits than Claude, but if you hit limits:

**Optimal Spacing:**
- Execute Prompt 2 (most critical)
- Wait 10-15 minutes
- Execute Prompt 3 (builds on Prompt 2 results)
- Wait 10-15 minutes
- Execute Prompt 1 (optional, lowest priority)

**If you get "rate limited" error:**
1. Wait 30 seconds and retry same prompt
2. If still limited, wait 5-10 minutes
3. Try next prompt in queue
4. Circle back to failed prompt after 30 minutes

**Token-saving tips for Codex:**
- Submit one prompt at a time (don't chain multiple in one submission)
- Each prompt is self-contained (can wait between them)
- Provide exact file line numbers (saves explanation tokens)
- Use code blocks (Codex optimized for code, not prose)

---

## AFTER ALL PROMPTS COMPLETE

I will generate:
✅ Definitive Ad Slot Registry document (all 70 slots with 3-digit IDs)
✅ Visual mapping of slot IDs to website positions
✅ Admin reference guide
✅ Updated documentation

This will be your source of truth going forward.
