# VISUAL GUIDE: Pick 'Em 6-Slot System

## Current Problem → After Fix

```
BEFORE (GENERIC SLOT - NO DISTINCTION)
═════════════════════════════════════════════════════════════════

Pick 'Em Game Cards:
  [Card 1]
  [Card 2]
  [Card 3]
  [Card 4]
  [Card 5]
  ┌──────────────────────────────────────┐
  │  Ad Slot: "inline-content" ❌        │ ← GENERIC (no ID)
  │  (Could be anywhere)                │   No distinction
  └──────────────────────────────────────┘
  [Card 6]
  [Card 7]
  [Card 8]
  [Card 9]
  [Card 10]
  ┌──────────────────────────────────────┐
  │  Ad Slot: "inline-content" ❌        │ ← SAME GENERIC SLOT!
  │  (Could be anywhere)                │   Admin can't tell
  └──────────────────────────────────────┘
  [Card 11]
  ...

PROBLEM: Admin can't distinguish between ad slots
RESULT: Placeholder shows "inline-content" with no ID


AFTER (6 SPECIFIC SLOTS WITH IDs)
═════════════════════════════════════════════════════════════════

Pick 'Em Game Cards:
  [Card 1]
  [Card 2]
  [Card 3]
  [Card 4]
  [Card 5]
  ┌──────────────────────────────────────┐
  │  ID: 071                             │ ✅ SPECIFIC
  │  Slot: pickem-inline-cards-1-5      │   After 5th card
  │  Label: "Pick 'Em Inline (1-5)"     │
  └──────────────────────────────────────┘
  [Card 6]
  [Card 7]
  [Card 8]
  [Card 9]
  [Card 10]
  ┌──────────────────────────────────────┐
  │  ID: 072                             │ ✅ UNIQUE ID
  │  Slot: pickem-inline-cards-6-10     │   After 10th card
  │  Label: "Pick 'Em Inline (6-10)"    │
  └──────────────────────────────────────┘
  [Card 11]
  [Card 12]
  [Card 13]
  [Card 14]
  [Card 15]
  ┌──────────────────────────────────────┐
  │  ID: 073                             │ ✅ UNIQUE ID
  │  Slot: pickem-inline-cards-11-15    │   After 15th card
  │  Label: "Pick 'Em Inline (11-15)"   │
  └──────────────────────────────────────┘
  [Card 16]
  ...

BENEFIT: Admin knows exactly which ad slot to use
RESULT: Placeholder shows "ID: 071" with specific label
SCALABILITY: 6 slots = can handle up to 30 game cards
```

---

## Admin Form UI Change

```
BEFORE
──────────────────────────────────────────────────────────

Create Ad
Page: Pick 'Em
Ad Type: Inline
Slot: [Dropdown]
  ☑ Inline Content    ← ONE generic option

Problem: Can't specify which card range


AFTER
──────────────────────────────────────────────────────────

Create Ad
Page: Pick 'Em
Ad Type: Inline
Slot: [Dropdown]
  ☑ Pick 'Em Inline (Cards 1-5)      ← NEW: 6 specific options
  ☐ Pick 'Em Inline (Cards 6-10)
  ☐ Pick 'Em Inline (Cards 11-15)
  ☐ Pick 'Em Inline (Cards 16-20)
  ☐ Pick 'Em Inline (Cards 21-25)
  ☐ Pick 'Em Inline (Cards 26-30)

💡 Appears in specific Pick 'Em card range

Benefit: Admin sees exactly where each slot appears
```

---

## Placement Builder UI Change

```
BEFORE
──────────────────────────────────────────────────────────

Pick 'Em
  ├─ Entry Popup
  ├─ Scroll Popup
  ├─ Inline Content  [Drag ads here]  ← ONE generic slot
  └─ Banner

Problem: Can't place different ads for different card ranges


AFTER
──────────────────────────────────────────────────────────

Pick 'Em
  ├─ Entry Popup
  ├─ Scroll Popup
  ├─ Inline (Cards 1-5)    [Drag ads here]  ID: 071
  ├─ Inline (Cards 6-10)   [Drag ads here]  ID: 072
  ├─ Inline (Cards 11-15)  [Drag ads here]  ID: 073
  ├─ Inline (Cards 16-20)  [Drag ads here]  ID: 074
  ├─ Inline (Cards 21-25)  [Drag ads here]  ID: 075
  ├─ Inline (Cards 26-30)  [Drag ads here]  ID: 076
  └─ Banner

Benefit: Admin can place 6 different ads for different card ranges
```

---

## ID Allocation

```
PRE-EXISTING (001-064)
└─ All pop-ups, banners, leaderboard slots
   [UNCHANGED]

INLINE SLOT UPDATES (065-077)
├─ 065: [REMOVED - old generic Pick 'Em]
├─ 066: Bingo Inline (Under Grid) [UNCHANGED]
├─ 067: Fantasy Inline (Feed) [UNCHANGED]
├─ 068: Live Trivia Inline (Lobby) [UNCHANGED]
├─ 069: [REMOVED - old Predictions]
├─ 070: [RENUMBERED to 077]
├─ 071: Pick 'Em Inline (Cards 1-5) [NEW]
├─ 072: Pick 'Em Inline (Cards 6-10) [NEW]
├─ 073: Pick 'Em Inline (Cards 11-15) [NEW]
├─ 074: Pick 'Em Inline (Cards 16-20) [NEW]
├─ 075: Pick 'Em Inline (Cards 21-25) [NEW]
├─ 076: Pick 'Em Inline (Cards 26-30) [NEW]
└─ 077: Join Inline Venue List [RENUMBERED from 070]

Total IDs: 001-068, 071-077 (77 total)
New IDs: 071-076 (6 for Pick 'Em)
Removed: 065, 069 (2 generic slots)
```

---

## Slot Naming Convention

```
PATTERN: pickem-inline-cards-{start}-{end}

Examples:
├─ pickem-inline-cards-1-5    → After 5th card
├─ pickem-inline-cards-6-10   → After 10th card
├─ pickem-inline-cards-11-15  → After 15th card
├─ pickem-inline-cards-16-20  → After 20th card
├─ pickem-inline-cards-21-25  → After 25th card
└─ pickem-inline-cards-26-30  → After 30th card

Consistency: Matches venue leaderboard pattern
├─ venue-leaderboard-rows-1-10
├─ venue-leaderboard-rows-11-20
└─ etc.
```

---

## Component Logic Flow

```
PickEmGameList.tsx
│
├─ Render game cards
│
├─ After every 5th card:
│  ├─ Calculate sequenceIndex (1, 2, 3, 4, 5, 6)
│  │
│  ├─ Map to PICKEM_INLINE_SLOTS:
│  │  ├─ 1 → pickem-inline-cards-1-5
│  │  ├─ 2 → pickem-inline-cards-6-10
│  │  ├─ 3 → pickem-inline-cards-11-15
│  │  ├─ 4 → pickem-inline-cards-16-20
│  │  ├─ 5 → pickem-inline-cards-21-25
│  │  ├─ 6 → pickem-inline-cards-26-30
│  │  └─ fallback → pickem-inline-cards-1-5
│  │
│  ├─ Call InlineSlotAdClient with mapped slot
│  │
│  └─ Ad system finds matching ads in ad registry
│     │
│     └─ Render ad for that specific slot
│
└─ Continue rendering cards
```

---

## Example: 25 Game Cards

```
USER SEES:
──────────────────────────────────────────────────────────

[Card 1]  [Card 2]  [Card 3]  [Card 4]  [Card 5]
═════════════════════════════════════════════════════════════
                      [AD 1]                          ← ID: 071
                 After 5 cards
═════════════════════════════════════════════════════════════
[Card 6]  [Card 7]  [Card 8]  [Card 9]  [Card 10]
═════════════════════════════════════════════════════════════
                      [AD 2]                          ← ID: 072
                 After 10 cards
═════════════════════════════════════════════════════════════
[Card 11] [Card 12] [Card 13] [Card 14] [Card 15]
═════════════════════════════════════════════════════════════
                      [AD 3]                          ← ID: 073
                 After 15 cards
═════════════════════════════════════════════════════════════
[Card 16] [Card 17] [Card 18] [Card 19] [Card 20]
═════════════════════════════════════════════════════════════
                      [AD 4]                          ← ID: 074
                 After 20 cards
═════════════════════════════════════════════════════════════
[Card 21] [Card 22] [Card 23] [Card 24] [Card 25]
═════════════════════════════════════════════════════════════
                      [AD 5]                          ← ID: 075
                 After 25 cards
═════════════════════════════════════════════════════════════

ADMIN PLACED:
├─ Ad 1 on Slot 071 (Cards 1-5)
├─ Ad 2 on Slot 072 (Cards 6-10)
├─ Ad 3 on Slot 073 (Cards 11-15)
├─ Ad 4 on Slot 074 (Cards 16-20)
└─ Ad 5 on Slot 075 (Cards 21-25)

Slots 076 (Cards 26-30) not used (only 25 cards)
```

---

## Type System Update

```
/types/index.ts
│
└─ AdSlot union type
   │
   ├─ [existing types...]
   ├─ "venue-leaderboard-rows-1-10"
   ├─ "venue-leaderboard-rows-11-20"
   ├─ "venue-leaderboard-rows-21-30"
   ├─ "venue-leaderboard-rows-31-40"
   ├─ "venue-leaderboard-rows-41-50"
   │
   ├─ [NEW] "pickem-inline-cards-1-5"      ✅
   ├─ [NEW] "pickem-inline-cards-6-10"     ✅
   ├─ [NEW] "pickem-inline-cards-11-15"    ✅
   ├─ [NEW] "pickem-inline-cards-16-20"    ✅
   ├─ [NEW] "pickem-inline-cards-21-25"    ✅
   ├─ [NEW] "pickem-inline-cards-26-30"    ✅
   │
   └─ [other slots...]
```

---

## Data Flow

```
ADMIN CREATES AD
   │
   ├─ Select: Page = "Pick 'Em"
   ├─ Select: Ad Type = "Inline"
   ├─ Select: Slot = "pickem-inline-cards-1-5" ✅
   ├─ Upload image
   ├─ Set dates/targeting
   │
   └─ SAVE AD
      │
      └─ AD STORED IN DATABASE
         ├─ slot: "pickem-inline-cards-1-5"
         ├─ pageKey: "pickem"
         ├─ adType: "inline"
         └─ ... other fields ...


USER VISITS PICK 'EM PAGE
   │
   └─ PickEmGameList renders
      │
      ├─ Loop through 30 game cards
      │
      ├─ After card 5:
      │  └─ InlineSlotAdClient(slot="pickem-inline-cards-1-5")
      │     │
      │     └─ API queries: Find ads for slot "pickem-inline-cards-1-5"
      │        │
      │        └─ Returns: Admin's saved ad with ID: 071
      │           │
      │           └─ DISPLAYS AD
      │
      ├─ After card 10:
      │  └─ InlineSlotAdClient(slot="pickem-inline-cards-6-10")
      │     │
      │     └─ API queries: Find ads for slot "pickem-inline-cards-6-10"
      │        │
      │        └─ Returns: Admin's saved ad with ID: 072
      │           │
      │           └─ DISPLAYS AD
      │
      └─ ... pattern repeats for remaining slots ...
```

---

**Key Benefit:** Each ad slot now has a **unique 3-digit ID (071-076)** that corresponds to a **specific card position (1-5, 6-10, etc.)**. Admin knows exactly where ads will appear. Zero ambiguity. 🎯
