# CODEX READY-TO-SUBMIT: Pick 'Em 6-Slot Refinement

Copy each prompt from below and paste directly into Claude Codex. No modifications needed.

---

# PROMPT 1: Update Ad Slot Registry + Types for 6 Pick 'Em Slots

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
3. Renumber entry 070 to 077 (Join Inline Venue List)

Find current entries (around lines 47-49):
```typescript
  { id: "065", label: "Pick 'Em Inline (Between Cards)", pageKey: "pickem",   slot: "inline-content",                 trigger: "on-load"  },
  { id: "066", label: "Bingo Inline (Under Grid)",   pageKey: "sports-bingo", slot: "inline-content",                 trigger: "on-load"  },
  { id: "067", label: "Fantasy Inline (Feed)",       pageKey: "fantasy",      slot: "inline-content",                 trigger: "on-load"  },
  { id: "068", label: "Live Trivia Inline (Lobby)",  pageKey: "live-trivia",  slot: "inline-content",                 trigger: "on-load"  },
  { id: "069", label: "Predictions Inline (Market List)", pageKey: "pickem",  slot: "inline-content",                 trigger: "on-load"  },
  { id: "070", label: "Join Inline Venue List",      pageKey: "join",         slot: "inline-content",                 trigger: "on-load"  },
```

REPLACE with (keep 066-068 as-is, remove 065 and 069, add 071-076, renumber 070 to 077):
```typescript
  { id: "066", label: "Bingo Inline (Under Grid)",   pageKey: "sports-bingo", slot: "inline-content",                 trigger: "on-load"  },
  { id: "067", label: "Fantasy Inline (Feed)",       pageKey: "fantasy",      slot: "inline-content",                 trigger: "on-load"  },
  { id: "068", label: "Live Trivia Inline (Lobby)",  pageKey: "live-trivia",  slot: "inline-content",                 trigger: "on-load"  },
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
- Keep all entries before 065 (001-064) EXACTLY as-is
- Only modify/remove 065 and 069
- Keep 066-068 EXACTLY as-is
- Add new 071-076 entries
- Renumber 070 to 077
- Maintain exact formatting
- Do NOT modify helper functions

OUTPUT:
Provide complete updated /types/index.ts and /lib/adSlotRegistry.ts files.
```

---

# PROMPT 2: Update Admin Form + Placement Builder for Pick 'Em Slots

```
=== CODEX TASK ===
Update admin Create Ads form and Placement Builder to show 6 specific Pick 'Em inline slots.

=== FILE 1: /components/admin/sections/adFormShared.tsx ===

PART A: Update AD_SLOT_OPTIONS (around line 35-50)

Find current array:
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

ADD these 6 NEW entries BEFORE the closing bracket:
```typescript
  { value: "pickem-inline-cards-1-5", label: "Pick 'Em Inline (Cards 1-5)" },
  { value: "pickem-inline-cards-6-10", label: "Pick 'Em Inline (Cards 6-10)" },
  { value: "pickem-inline-cards-11-15", label: "Pick 'Em Inline (Cards 11-15)" },
  { value: "pickem-inline-cards-16-20", label: "Pick 'Em Inline (Cards 16-20)" },
  { value: "pickem-inline-cards-21-25", label: "Pick 'Em Inline (Cards 21-25)" },
  { value: "pickem-inline-cards-26-30", label: "Pick 'Em Inline (Cards 26-30)" },
```

Result:
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

Find the function and the "pickem" case in the switch statement:
```typescript
function getSlotHintForPage(pageKey: AdPageKey, slot: AdSlot): string {
  if (slot === "inline-content") {
    switch (pageKey) {
      case "pickem":
        return "Appears between Pick 'Em prediction cards";
```

UPDATE to:
```typescript
function getSlotHintForPage(pageKey: AdPageKey, slot: AdSlot): string {
  if (slot.startsWith("pickem-inline-cards-")) {
    return "Appears in specific Pick 'Em card range";
  }
  if (slot === "inline-content") {
    switch (pageKey) {
      case "pickem":
        return "Generic inline placement (deprecated for Pick 'Em)";
```

=== FILE 2: /lib/adPlacements.ts ===

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
    slot === "venue-leaderboard-rows-11-20" ||
    slot === "venue-leaderboard-rows-21-30" ||
    slot === "venue-leaderboard-rows-31-40" ||
    slot === "venue-leaderboard-rows-41-50"
  );
}
```

UPDATE the return statement to include 6 new Pick 'Em slots:
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

=== FILE 3: /components/admin/AdPlacementBuilder.tsx ===

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

=== FILE 4: /components/pickem/PickEmGameList.tsx ===

TASK: Update component to use correct slot based on card position

Find the section where InlineSlotAdClient is called (around line 1360-1380):
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

Before this section (around line 1340), add this constant:
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

Then replace the InlineSlotAdClient call:
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

OUTPUT:
Provide complete updated files for all 4:
- /components/admin/sections/adFormShared.tsx
- /lib/adPlacements.ts
- /components/admin/AdPlacementBuilder.tsx
- /components/pickem/PickEmGameList.tsx
```

---

## How to Use

1. **Copy PROMPT 1** section above (starting with "===")
2. **Paste into Claude Codex**
3. **Wait for response, apply changes**
4. **Copy PROMPT 2** section above (starting with "===")
5. **Paste into Claude Codex**
6. **Wait for response, apply changes**
7. **Run:** `npm run type-check`
8. **Test in browser**

Done! Pick 'Em will now have 6 specific inline ad slots with IDs 071-076.
