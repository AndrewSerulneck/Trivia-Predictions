# CODEX PROMPTS: Pick 'Em Inline Ad Slots Refinement

**Goal:** Create 6 unique Pick 'Em inline ad slots (cards 1-5, 6-10, 11-15, 16-20, 21-25, 26-30) with specific 3-digit IDs, update registry, forms, and placement builder.

**Total Prompts:** 2 (sequential, second depends on first)
**Expected Total Time:** 30-45 minutes

---

## PROMPT 1: Update Ad Slot Registry + Types for 6 Pick 'Em Slots

**Model:** Claude Codex (claude-3.5-sonnet)
**Complexity:** ⭐⭐⭐ (Medium — careful type updates)
**Time:** 10-15 minutes
**Status:** CRITICAL — must execute first

```
=== CODEX TASK ===
Update /lib/adSlotRegistry.ts and /types/index.ts to add 6 unique Pick 'Em inline ad slots.

BACKGROUND:
Currently, Pick 'Em uses generic "inline-content" slot for all inline ads.
We need 6 specific slots: one for each 5-card interval (cards 1-5, 6-10, 11-15, 16-20, 21-25, 26-30).
These slots will have IDs 071-076.
New slot names in types: pickem-inline-cards-1-5, pickem-inline-cards-6-10, etc.

=== FILE 1: /types/index.ts ===

TASK: Add 6 new slot types to AdSlot union

Find the AdSlot type definition (around line 1-20):
```typescript
export type AdSlot =
  | "header"
  | "inline-content"
  | "sidebar"
  | "mid-content"
  | "leaderboard-sidebar"
  | "footer"
  | "mobile-adhesion"
  | "popup-on-entry"
  | "popup-on-scroll"
  | "venue-leaderboard-rows-1-10"
  | "venue-leaderboard-rows-11-20"
  | "venue-leaderboard-rows-21-30"
  | "venue-leaderboard-rows-31-40"
  | "venue-leaderboard-rows-41-50";
```

ADD these 6 new entries before the closing semicolon:
```typescript
  | "pickem-inline-cards-1-5"
  | "pickem-inline-cards-6-10"
  | "pickem-inline-cards-11-15"
  | "pickem-inline-cards-16-20"
  | "pickem-inline-cards-21-25"
  | "pickem-inline-cards-26-30";
```

Result should be:
```typescript
export type AdSlot =
  | "header"
  | "inline-content"
  | "sidebar"
  | "mid-content"
  | "leaderboard-sidebar"
  | "footer"
  | "mobile-adhesion"
  | "popup-on-entry"
  | "popup-on-scroll"
  | "venue-leaderboard-rows-1-10"
  | "venue-leaderboard-rows-11-20"
  | "venue-leaderboard-rows-21-30"
  | "venue-leaderboard-rows-31-40"
  | "venue-leaderboard-rows-41-50"
  | "pickem-inline-cards-1-5"
  | "pickem-inline-cards-6-10"
  | "pickem-inline-cards-11-15"
  | "pickem-inline-cards-16-20"
  | "pickem-inline-cards-21-25"
  | "pickem-inline-cards-26-30";
```

=== FILE 2: /lib/adSlotRegistry.ts ===

TASK: 
1. Remove entries 065 and 069 (old Pick 'Em Inline entries)
2. Add 6 new Pick 'Em specific entries with IDs 071-076
3. Update/relocate entry 070 (Join Inline Venue List) to account for ID gaps

CURRENT STATE (lines 47-48):
```typescript
  { id: "065", label: "Pick 'Em Inline (Between Cards)", pageKey: "pickem",   slot: "inline-content",                 trigger: "on-load"  },
  ...
  { id: "069", label: "Predictions Inline (Market List)", pageKey: "pickem",  slot: "inline-content",                 trigger: "on-load"  },
  { id: "070", label: "Join Inline Venue List",       pageKey: "join",         slot: "inline-content",                 trigger: "on-load"  },
```

CHANGE:
1. Delete entry 065 (old Pick 'Em Inline generic)
2. Delete entry 069 (Predictions entry)
3. Renumber entry 070 to 077 (Join Inline Venue List)
4. Replace with these 6 NEW entries before the closing bracket:

```typescript
  // PICK 'EM - 6 SPECIFIC INLINE SLOTS
  { id: "071", label: "Pick 'Em Inline (Cards 1-5)",   pageKey: "pickem",       slot: "pickem-inline-cards-1-5",        trigger: "on-load"  },
  { id: "072", label: "Pick 'Em Inline (Cards 6-10)",  pageKey: "pickem",       slot: "pickem-inline-cards-6-10",       trigger: "on-load"  },
  { id: "073", label: "Pick 'Em Inline (Cards 11-15)", pageKey: "pickem",       slot: "pickem-inline-cards-11-15",      trigger: "on-load"  },
  { id: "074", label: "Pick 'Em Inline (Cards 16-20)", pageKey: "pickem",       slot: "pickem-inline-cards-16-20",      trigger: "on-load"  },
  { id: "075", label: "Pick 'Em Inline (Cards 21-25)", pageKey: "pickem",       slot: "pickem-inline-cards-21-25",      trigger: "on-load"  },
  { id: "076", label: "Pick 'Em Inline (Cards 26-30)", pageKey: "pickem",       slot: "pickem-inline-cards-26-30",      trigger: "on-load"  },
  // OTHER
  { id: "077", label: "Join Inline Venue List",        pageKey: "join",         slot: "inline-content",                 trigger: "on-load"  },
];
```

IMPORTANT:
- Keep all other entries (001-064, 067-068) EXACTLY as-is
- Only update the 6 Pick 'Em inline entries
- Renumber Join Inline from 070 to 077
- Maintain exact formatting/indentation
- Do NOT modify helper functions (lookupSlotId, etc.)

OUTPUT:
Provide complete updated /types/index.ts and /lib/adSlotRegistry.ts files with changes applied.
```

---

## PROMPT 2: Update Admin Form + Placement Builder for Pick 'Em Slots

**Model:** Claude Codex (claude-3.5-sonnet)
**Complexity:** ⭐⭐⭐⭐ (High — form logic, placement builder, slot compatibility)
**Time:** 15-25 minutes
**Status:** CRITICAL — must execute after Prompt 1

```
=== CODEX TASK ===
Update admin Create Ads form and Placement Builder to show 6 specific Pick 'Em inline slots.

=== FILE 1: /components/admin/sections/adFormShared.tsx ===

PART A: Update AD_SLOT_OPTIONS (around line 35-50)

CURRENT (includes generic "inline-content"):
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

CHANGE: Add these 6 NEW Pick 'Em slot entries BEFORE the closing bracket:
```typescript
  { value: "pickem-inline-cards-1-5", label: "Pick 'Em Inline (Cards 1-5)" },
  { value: "pickem-inline-cards-6-10", label: "Pick 'Em Inline (Cards 6-10)" },
  { value: "pickem-inline-cards-11-15", label: "Pick 'Em Inline (Cards 11-15)" },
  { value: "pickem-inline-cards-16-20", label: "Pick 'Em Inline (Cards 16-20)" },
  { value: "pickem-inline-cards-21-25", label: "Pick 'Em Inline (Cards 21-25)" },
  { value: "pickem-inline-cards-26-30", label: "Pick 'Em Inline (Cards 26-30)" },
```

Result should be:
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
  { value: "pickem-inline-cards-1-5", label: "Pick 'Em Inline (Cards 1-5)" },
  { value: "pickem-inline-cards-6-10", label: "Pick 'Em Inline (Cards 6-10)" },
  { value: "pickem-inline-cards-11-15", label: "Pick 'Em Inline (Cards 11-15)" },
  { value: "pickem-inline-cards-16-20", label: "Pick 'Em Inline (Cards 16-20)" },
  { value: "pickem-inline-cards-21-25", label: "Pick 'Em Inline (Cards 21-25)" },
  { value: "pickem-inline-cards-26-30", label: "Pick 'Em Inline (Cards 26-30)" },
  { value: "inline-content", label: "Inline Content" },
];
```

PART B: Update getSlotHintForPage helper (around line 150-180)

Find the switch statement for "inline-content":
```typescript
function getSlotHintForPage(pageKey: AdPageKey, slot: AdSlot): string {
  if (slot === "inline-content") {
    switch (pageKey) {
      case "pickem":
        return "Appears between Pick 'Em prediction cards";
      case "sports-bingo":
        return "Appears within Bingo game area";
      ...
```

UPDATE the "pickem" case to:
```typescript
      case "pickem":
        if (slot.startsWith("pickem-inline-cards-")) {
          return "Appears in specific Pick 'Em card range";
        }
        return "Generic inline placement (deprecated for Pick 'Em)";
```

ADD NEW SECTION before the final return statement:
```typescript
  if (slot.startsWith("pickem-inline-cards-")) {
    return "Specific Pick 'Em inline ad slot for card range shown";
  }
```

PART C: Update slot compatibility logic in /lib/adPlacements.ts

Find isSlotCompatibleWithAdType function (around line 225-245):
```typescript
export function isSlotCompatibleWithAdType(slot: AdSlot, adType: AdType): boolean {
  if (adType === "popup") {
    return slot === "popup-on-entry" || slot === "popup-on-scroll";
  }
  if (adType === "banner") {
    return slot === "mobile-adhesion" || slot === "header" || slot === "footer" || slot === "sidebar";
  }
  return (
    slot === "leaderboard-sidebar" ||
    slot === "inline-content" ||
    slot === "mid-content" ||
    slot === "venue-leaderboard-rows-1-10" ||
    ...all venue rows...
    slot === "venue-leaderboard-rows-41-50"
  );
}
```

UPDATE inline section to add Pick 'Em slots:
```typescript
  return (
    slot === "leaderboard-sidebar" ||
    slot === "inline-content" ||
    slot === "mid-content" ||
    slot === "venue-leaderboard-rows-1-10" ||
    slot === "venue-leaderboard-rows-11-20" ||
    slot === "venue-leaderboard-rows-21-30" ||
    slot === "venue-leaderboard-rows-31-40" ||
    slot === "venue-leaderboard-rows-41-50" ||
    slot === "pickem-inline-cards-1-5" ||
    slot === "pickem-inline-cards-6-10" ||
    slot === "pickem-inline-cards-11-15" ||
    slot === "pickem-inline-cards-16-20" ||
    slot === "pickem-inline-cards-21-25" ||
    slot === "pickem-inline-cards-26-30"
  );
}
```

=== FILE 2: /components/admin/AdPlacementBuilder.tsx ===

TASK: Update PAGES array to show 6 Pick 'Em inline slots instead of generic

Find the "pickem" entry in PAGES array (around line 90-100):
```typescript
  {
    id: "pickem",
    label: "Pick'Em",
    slots: [
      { key: "pickem-popup-on-entry", label: "Entry Popup", description: "Appears on game load" },
      { key: "pickem-popup-on-scroll", label: "Scroll Popup", description: "Triggered on scroll" },
      { key: "pickem-inline", label: "Inline Content", description: "Between prediction cards" },
      { key: "pickem-banner", label: "Banner", description: "Mobile adhesion" },
    ],
  },
```

REPLACE with:
```typescript
  {
    id: "pickem",
    label: "Pick'Em",
    slots: [
      { key: "pickem-popup-on-entry", label: "Entry Popup", description: "Appears on game load" },
      { key: "pickem-popup-on-scroll", label: "Scroll Popup", description: "Triggered on scroll" },
      { key: "pickem-inline-cards-1-5", label: "Inline (Cards 1-5)", description: "After 5th game card" },
      { key: "pickem-inline-cards-6-10", label: "Inline (Cards 6-10)", description: "After 10th game card" },
      { key: "pickem-inline-cards-11-15", label: "Inline (Cards 11-15)", description: "After 15th game card" },
      { key: "pickem-inline-cards-16-20", label: "Inline (Cards 16-20)", description: "After 20th game card" },
      { key: "pickem-inline-cards-21-25", label: "Inline (Cards 21-25)", description: "After 25th game card" },
      { key: "pickem-inline-cards-26-30", label: "Inline (Cards 26-30)", description: "After 30th game card" },
      { key: "pickem-banner", label: "Banner", description: "Mobile adhesion" },
    ],
  },
```

=== FILE 3: /components/pickem/PickEmGameList.tsx ===

TASK: Update component to use correct slot based on card position

CURRENT CODE (around line 1360-1380, approx):
```typescript
{shouldRenderAdBreak && (
  <InlineSlotAdClient
    slot="inline-content"
    venueId={venueId}
    pageKey="pickem"
    adType="inline"
    displayTrigger="on-load"
    placementKey="pickem-inline"
    sequenceIndex={sequenceIndex}
    showPlaceholder
  />
)}
```

CHANGE: Before rendering the component, add slot mapping logic.

Find where `shouldRenderAdBreak` is determined (likely around line 1340):
Add this constant BEFORE the loop/render section:
```typescript
const PICKEM_INLINE_SLOTS: Record<number, AdSlot> = {
  1: "pickem-inline-cards-1-5",
  2: "pickem-inline-cards-6-10",
  3: "pickem-inline-cards-11-15",
  4: "pickem-inline-cards-16-20",
  5: "pickem-inline-cards-21-25",
  6: "pickem-inline-cards-26-30",
};
```

Then update the InlineSlotAdClient call:
```typescript
{shouldRenderAdBreak && (
  <InlineSlotAdClient
    slot={PICKEM_INLINE_SLOTS[sequenceIndex] ?? "pickem-inline-cards-1-5"}
    venueId={venueId}
    pageKey="pickem"
    adType="inline"
    displayTrigger="on-load"
    placementKey="pickem-inline"
    sequenceIndex={sequenceIndex}
    showPlaceholder
  />
)}
```

IMPORTANT NOTES:
- Do NOT modify /types/index.ts in this prompt (done in Prompt 1)
- Do NOT change ad serving logic (/lib/ads.ts)
- Only update form display, placement builder display, and component slot usage
- Maintain backward compatibility where possible
- No database schema changes needed

OUTPUT:
Provide complete updated files for:
- /components/admin/sections/adFormShared.tsx
- /lib/adPlacements.ts
- /components/admin/AdPlacementBuilder.tsx
- /components/pickem/PickEmGameList.tsx

Confirm that all 6 Pick 'Em inline slots are now:
✅ Available in Create Ads form
✅ Visible in Placement Builder
✅ Used correctly in PickEmGameList component
✅ Each with unique 3-digit ID (071-076)
```

---

## EXECUTION CHECKLIST

### Before Starting:
- [ ] You have both Prompt 1 and Prompt 2
- [ ] Ready to submit to Claude Codex

### Executing Prompt 1:
- [ ] Copy "PROMPT 1" section
- [ ] Submit to Codex
- [ ] Review output for correct types and registry entries
- [ ] Verify IDs 071-076 are present
- [ ] Apply changes to actual files

### Executing Prompt 2:
- [ ] Copy "PROMPT 2" section
- [ ] Submit to Codex
- [ ] Review output for form, placement builder, component changes
- [ ] Verify all 4 files updated
- [ ] Apply changes to actual files

### Final Verification:
```bash
npm run type-check  # Should pass with no errors
```

Test in browser:
- [ ] Create Ads form shows 6 Pick 'Em slot options
- [ ] Placeholder ads show IDs 071-076
- [ ] Placement Builder shows 6 Pick 'Em slots
- [ ] Can create ads for each of the 6 Pick 'Em slots
- [ ] Ads appear at correct positions (after 5th, 10th, 15th, 20th, 25th, 30th cards)

---

## RESULT

After both prompts complete:

✅ **Pick 'Em has 6 unique inline ad slots** with IDs 071-076
✅ **Each slot is page-specific** (not generic "inline-content")
✅ **Admin can place up to 6 different ads** on Pick 'Em
✅ **Create Ads form** shows all 6 slots as options with clear labels
✅ **Placement Builder** shows all 6 slots for Pick 'Em page
✅ **Component** uses correct slot based on card position
✅ **Registry** maps each ID to specific card range
✅ **Slot compatibility** includes new Pick 'Em slots for inline ad type
✅ **Zero ambiguity** — each slot has unique 3-digit ID and purpose

---

## NEXT STEPS AFTER CODEX COMPLETES

1. Apply all changes from Codex output
2. Run `npm run type-check` — should pass
3. Test in browser:
   - Admin form shows 6 Pick 'Em slots
   - Placement Builder shows 6 slots
   - Can create test ads for each slot
   - Verify placeholder ads show correct IDs
4. Optional: Request updated Ad Slot Registry document showing final state
```

Now let me create a quick reference card for you:
<function_calls>
<invoke name="create_file">
<parameter name="content"># CODEX QUICK REFERENCE: Pick 'Em 6-Slot Refinement

## The Change

**Before:** Pick 'Em uses generic `"inline-content"` slot — no distinction between different card ranges
**After:** 6 specific slots with unique IDs (071-076) — one for each 5-card interval

---

## New Pick 'Em Slots

| Slot ID | Label | Slot Name | Position |
|---------|-------|-----------|----------|
| **071** | Pick 'Em Inline (Cards 1-5) | `pickem-inline-cards-1-5` | After 5th card |
| **072** | Pick 'Em Inline (Cards 6-10) | `pickem-inline-cards-6-10` | After 10th card |
| **073** | Pick 'Em Inline (Cards 11-15) | `pickem-inline-cards-11-15` | After 15th card |
| **074** | Pick 'Em Inline (Cards 16-20) | `pickem-inline-cards-16-20` | After 20th card |
| **075** | Pick 'Em Inline (Cards 21-25) | `pickem-inline-cards-21-25` | After 25th card |
| **076** | Pick 'Em Inline (Cards 26-30) | `pickem-inline-cards-26-30` | After 30th card |

---

## Files Being Updated

| File | Changes | Complexity |
|------|---------|-----------|
| `/types/index.ts` | Add 6 new slot types | ⭐⭐ Low |
| `/lib/adSlotRegistry.ts` | Replace old 065/069 with 071-076 | ⭐⭐ Low |
| `/components/admin/sections/adFormShared.tsx` | Add 6 slots to dropdown + hints | ⭐⭐⭐ Medium |
| `/lib/adPlacements.ts` | Add 6 slots to compatibility matrix | ⭐⭐⭐ Medium |
| `/components/admin/AdPlacementBuilder.tsx` | Add 6 slots to PAGES array | ⭐⭐⭐ Medium |
| `/components/pickem/PickEmGameList.tsx` | Map sequenceIndex to correct slot | ⭐⭐⭐ Medium |

---

## Execution Flow

```
PROMPT 1 (10-15 min)
├─ Update /types/index.ts
└─ Update /lib/adSlotRegistry.ts

        ↓ (wait for output)

PROMPT 2 (15-25 min)
├─ Update /components/admin/sections/adFormShared.tsx
├─ Update /lib/adPlacements.ts
├─ Update /components/admin/AdPlacementBuilder.tsx
└─ Update /components/pickem/PickEmGameList.tsx

        ↓

VERIFY (10 min)
├─ npm run type-check
├─ Test admin form
├─ Test placement builder
└─ Test ad rendering
```

---

## Key Details

**ID Changes:**
- Old 065: "Pick 'Em Inline (Between Cards)" → REMOVED
- Old 069: "Predictions Inline" → REMOVED
- Old 070: "Join Inline Venue List" → RENUMBERED to 077
- New 071-076: 6 specific Pick 'Em slots

**Slot Naming Convention:**
- Format: `pickem-inline-cards-{start}-{end}`
- Examples: `pickem-inline-cards-1-5`, `pickem-inline-cards-6-10`
- Type: Added to AdSlot union in /types/index.ts

**Component Logic:**
- PickEmGameList maps `sequenceIndex` (1-6) to correct slot
- Falls back to first slot (071) if sequenceIndex is out of range

---

## What Admin Sees

**Create Ads Form:**
```
Ad Type: Inline
Page: Pick 'Em
Slot: [dropdown with 6 options]
  ☐ Pick 'Em Inline (Cards 1-5)
  ☐ Pick 'Em Inline (Cards 6-10)
  ☐ Pick 'Em Inline (Cards 11-15)
  ☐ Pick 'Em Inline (Cards 16-20)
  ☐ Pick 'Em Inline (Cards 21-25)
  ☐ Pick 'Em Inline (Cards 26-30)
```

**Placement Builder:**
Same 6 slots shown under Pick 'Em page

**Placeholder Ads:**
Instead of generic "inline-content", will show:
```
ID: 071 - Pick 'Em Inline (Cards 1-5)
ID: 072 - Pick 'Em Inline (Cards 6-10)
... etc
```

---

## Copy-Paste Commands

**Submit Prompt 1:**
```
Open CODEX_PROMPTS_PICKEM_SLOTS.md
Copy "PROMPT 1: Update Ad Slot Registry + Types for 6 Pick 'Em Slots" section
Paste into Claude Codex
```

**Submit Prompt 2:**
```
Open CODEX_PROMPTS_PICKEM_SLOTS.md
Copy "PROMPT 2: Update Admin Form + Placement Builder for Pick 'Em Slots" section
Paste into Claude Codex
```

**Verify:**
```bash
npm run type-check
```

---

## Success Criteria

✅ Type definitions include 6 new Pick 'Em slots
✅ Registry has IDs 071-076 for 6 Pick 'Em slots
✅ Admin form dropdown shows 6 Pick 'Em slot options
✅ Placement Builder shows 6 Pick 'Em slot positions
✅ PickEmGameList component uses correct slot per card range
✅ Placeholder ads show correct IDs (071-076)
✅ No TypeScript errors
✅ Can create and save ads for each of 6 slots
✅ Ads appear at correct card positions in Pick 'Em

---

## Rate Limits

If you hit rate limits:
- **Prompt 1 is critical** — do this first
- **Prompt 2 depends on Prompt 1** — do this second
- Space them 10-15 minutes apart if hitting limits
