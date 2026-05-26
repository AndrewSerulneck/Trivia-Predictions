# 🚀 CODEX READY-TO-SUBMIT PROMPTS

These are the three prompts formatted exactly as they should be submitted to Claude Codex.
Copy each prompt from this file and paste into Claude Codex interface.

---

# PROMPT 1: Update Ad Slot Registry
*Optional but recommended (adds registry entries 065-070)*

```
UPDATE /lib/adSlotRegistry.ts:

1. Keep all existing entries (IDs 001-064) UNCHANGED

2. Before the closing bracket of AD_SLOT_REGISTRY array, add these 6 NEW entries:
```

```typescript
  { id: "065", label: "Pick 'Em Inline (Between Cards)", pageKey: "pickem",       slot: "inline-content", trigger: "on-load" },
  { id: "066", label: "Bingo Inline (Under Grid)",      pageKey: "sports-bingo", slot: "inline-content", trigger: "on-load" },
  { id: "067", label: "Fantasy Inline (Feed)",          pageKey: "fantasy",      slot: "inline-content", trigger: "on-load" },
  { id: "068", label: "Live Trivia Inline (Lobby)",     pageKey: "live-trivia",  slot: "inline-content", trigger: "on-load" },
  { id: "069", label: "Predictions Inline (Market)",    pageKey: "join",         slot: "inline-content", trigger: "on-load" },
  { id: "070", label: "Join Inline (Venue List)",       pageKey: "join",         slot: "inline-content", trigger: "on-load" },
```

3. After the AD_SLOT_REGISTRY array closes, add this helper function:

```typescript
export function getInlineSlotsByPage(pageKey: AdPageKey): SlotRegistryEntry[] {
  return AD_SLOT_REGISTRY.filter(
    (e) => e.pageKey === pageKey && 
    (e.slot === "inline-content" || 
     e.slot.startsWith("venue-leaderboard-rows-"))
  );
}
```

4. Do NOT change anything else in the file

OUTPUT: Provide complete updated /lib/adSlotRegistry.ts file
```

---

# PROMPT 2: Fix 8 Components (slot="leaderboard-sidebar" → correct slots)
*CRITICAL - must execute*

```
Fix these 8 files by replacing generic slot="leaderboard-sidebar" with correct page-specific slots:

=== FILE 1: /components/leaderboard/LeaderboardTable.tsx ===

Before the component returns JSX (around line 15-20), add:
```

```typescript
const VENUE_LEADERBOARD_SLOTS: Record<number, AdSlot> = {
  1: "venue-leaderboard-rows-1-10",
  2: "venue-leaderboard-rows-11-20",
  3: "venue-leaderboard-rows-21-30",
  4: "venue-leaderboard-rows-31-40",
  5: "venue-leaderboard-rows-41-50",
};
```

Then find the TWO instances of:
```
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
```

Replace slot="leaderboard-sidebar" with:
```
slot={VENUE_LEADERBOARD_SLOTS[sequenceIndex] ?? "venue-leaderboard-rows-1-10"}
```

=== FILE 2: /app/leaderboard/page.tsx ===

Find the InlineSlotAdClient component around line 48 with slot="leaderboard-sidebar"

Replace: slot="leaderboard-sidebar"
With: slot="venue-leaderboard-rows-1-10"

=== FILE 3: /components/pickem/PickEmGameList.tsx ===

Find the InlineSlotAdClient component around line 1369 with slot="leaderboard-sidebar"

Replace: slot="leaderboard-sidebar"
With: slot="inline-content"

=== FILE 4: /components/bingo/SportsBingoHome.tsx ===

Find TWO instances of InlineSlotAdClient with slot="leaderboard-sidebar" (around lines 1697 and 1794)

Replace BOTH: slot="leaderboard-sidebar"
With: slot="inline-content"

=== FILE 5: /components/fantasy/FantasyHome.tsx ===

Find the InlineSlotAdClient component around line 2644 with slot="leaderboard-sidebar"

Replace: slot="leaderboard-sidebar"
With: slot="inline-content"

=== FILE 6: /components/predictions/PredictionMarketList.tsx ===

Find the InlineSlotAdClient component around line 1242 with slot="leaderboard-sidebar"

Replace: slot="leaderboard-sidebar"
With: slot="inline-content"

=== FILE 7: /components/join/JoinFlow.tsx ===

Find the InlineSlotAdClient component around line 1540 with slot="leaderboard-sidebar"

Replace: slot="leaderboard-sidebar"
With: slot="inline-content"

=== FILE 8: /components/ui/InlineSlotAdClient.tsx ===

Find line 16 with:
```
export function InlineSlotAdClient({
  slot = "leaderboard-sidebar",
```

Replace: slot = "leaderboard-sidebar"
With: slot = "inline-content"

OUTPUT: Provide complete updated code for all 8 files with changes applied.
```

---

# PROMPT 3: Update Admin Form (show correct slots + hints)
*CRITICAL - must execute after Prompt 2*

```
Update /components/admin/sections/adFormShared.tsx to show correct inline slots per page with hint text.

=== CHANGE 1: Update AD_SLOT_OPTIONS ===

Find AD_SLOT_OPTIONS array (around line 35-46) and update it to:

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

(Remove the "mid-content" entry if present)

=== CHANGE 2: Add helper function ===

Add this function after the defaultAdDraft() function (around line 140):

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

=== CHANGE 3: Add hint text display in form JSX ===

Find the slot selection field in the form (look for where slotOptions are rendered, around line 400-450).

Add this variable near the top of the component's JSX return statement:

```typescript
const slotHint = getSlotHintForPage(draft.pageKey, draft.slot);
```

Then in the slot selection UI section, after the <select> closing tag, add:

```tsx
{slotHint && (
  <p className="mt-2 text-xs text-gray-500 italic">
    💡 {slotHint}
  </p>
)}
```

Example context (find similar pattern in existing form):
```tsx
<select
  value={draft.slot}
  onChange={(e) => updateDraft({ slot: e.target.value as AdSlot })}
  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
>
  {slotOptions.map((option) => (
    <option key={option.value} value={option.value}>
      {option.label}
    </option>
  ))}
</select>
{slotHint && (
  <p className="mt-2 text-xs text-gray-500 italic">
    💡 {slotHint}
  </p>
)}
```

OUTPUT: Provide complete updated /components/admin/sections/adFormShared.tsx file with changes applied.
```

---

## 📋 HOW TO USE THESE PROMPTS

1. **Read CODEX_QUICK_REFERENCE.md first** — Understand the flow
2. **For Prompt 1:** Copy the "PROMPT 1" section above, submit to Claude Codex
3. **Wait 10-15 min if rate limited**
4. **For Prompt 2:** Copy the "PROMPT 2" section above, submit to Claude Codex
5. **Wait 10-15 min if rate limited**  
6. **For Prompt 3:** Copy the "PROMPT 3" section above, submit to Claude Codex

Each prompt is self-contained and can be executed independently if you get rate limited.

---

## ⚠️ IMPORTANT NOTES

- **Do NOT modify /types/index.ts** — All slot types already exist
- **Do NOT modify /lib/adPlacements.ts** — Slot compatibility logic is already correct
- **Do VERIFY /lib/adPlacements.ts** exists and has the right logic (Prompt 3 includes verification step)
- **Apply changes after Codex returns** — Copy-paste Codex output to actual files
- **Run type check after all changes:** `npm run type-check`

---

## ✅ FINAL RESULT

After all 3 prompts complete and changes are applied:
- ✅ All inline ads use correct page-specific slots
- ✅ Venue leaderboard uses proper row slots (012-016)
- ✅ Admin form shows correct slots with helpful hints
- ✅ 3-digit ID system is fully functional (001-070)
- ✅ No more "leaderboard-sidebar" ambiguity
- ✅ System is documented and maintainable

---

## 📚 FILES CREATED FOR REFERENCE

These files are now in your workspace:
- `CODEX_PROMPTS_AD_SLOTS.md` — Complete detailed prompts
- `CODEX_QUICK_REFERENCE.md` — Quick reference card
- `CODEX_READY_TO_SUBMIT_PROMPTS.md` — This file (ready to copy/paste)
