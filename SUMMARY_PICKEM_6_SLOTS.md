# SUMMARY: Pick 'Em 6-Slot Refinement

## What You Asked For

> Inline ads for Pick 'Em don't populate where they are supposed to. Create 6 specific Pick 'Em inline ad slots (cards 1-5, 6-10, 11-15, 16-20, 21-25, 26-30). Each needs a unique 3-digit ID. Update the registry, Create Ads form, and Placement Builder.

## What I Created

**2 Codex prompts** that will:

1. **Add 6 new slot types** to `/types/index.ts`
2. **Update registry** with IDs 071-076 (replacing old generic 065 & 069)
3. **Update admin form** dropdown to show 6 Pick 'Em slots
4. **Update Placement Builder** to show 6 Pick 'Em slots
5. **Update PickEmGameList component** to use correct slot per card range

---

## New Pick 'Em Slots

| ID | Name | Position | Slot Type |
|-----|------|----------|-----------|
| **071** | Pick 'Em Inline (Cards 1-5) | After 5th card | `pickem-inline-cards-1-5` |
| **072** | Pick 'Em Inline (Cards 6-10) | After 10th card | `pickem-inline-cards-6-10` |
| **073** | Pick 'Em Inline (Cards 11-15) | After 15th card | `pickem-inline-cards-11-15` |
| **074** | Pick 'Em Inline (Cards 16-20) | After 20th card | `pickem-inline-cards-16-20` |
| **075** | Pick 'Em Inline (Cards 21-25) | After 25th card | `pickem-inline-cards-21-25` |
| **076** | Pick 'Em Inline (Cards 26-30) | After 30th card | `pickem-inline-cards-26-30` |

---

## Files Ready to Submit

Located in your workspace:

### For Detailed Reference:
- `CODEX_PROMPTS_PICKEM_SLOTS.md` — Full prompts with explanations

### For Copy-Paste:
- `CODEX_READY_PICKEM_SLOTS.md` — Ready-to-submit prompts (use this one!)

### Quick Reference:
- `CODEX_QUICK_REFERENCE_PICKEM.md` — One-page summary

---

## How to Execute

**Step 1: Open the ready-to-submit file**
```
Open: CODEX_READY_PICKEM_SLOTS.md
```

**Step 2: Submit Prompt 1 to Codex**
```
Copy: "# PROMPT 1: Update Ad Slot Registry + Types..." section
Paste: Into Claude Codex interface
Wait: For response (~10-15 min)
Apply: Changes to files
```

**Step 3: Submit Prompt 2 to Codex**
```
Copy: "# PROMPT 2: Update Admin Form + Placement Builder..." section
Paste: Into Claude Codex interface
Wait: For response (~15-25 min)
Apply: Changes to files
```

**Step 4: Verify**
```bash
npm run type-check  # Should pass with no errors
```

**Step 5: Test in browser**
- Admin form shows 6 Pick 'Em slot options
- Placeholder ads show IDs 071-076
- Placement Builder shows 6 Pick 'Em slots

---

## Files Being Modified

**Prompt 1 (Types + Registry):**
- `/types/index.ts` — Add 6 slot types to AdSlot union
- `/lib/adSlotRegistry.ts` — Replace 065/069 with 071-076, renumber 070→077

**Prompt 2 (Admin UI + Component):**
- `/components/admin/sections/adFormShared.tsx` — Add 6 slots to form dropdown
- `/lib/adPlacements.ts` — Add 6 slots to inline ad compatibility
- `/components/admin/AdPlacementBuilder.tsx` — Add 6 slots to PAGES
- `/components/pickem/PickEmGameList.tsx` — Map sequenceIndex to correct slot

---

## Key Changes

**Before:**
- Pick 'Em inline ads use generic `"inline-content"` slot
- No distinction between different card ranges
- Placeholder shows "inline-content" (no ID)
- Admin form shows single "Inline Content" option

**After:**
- Pick 'Em has 6 specific slots: `pickem-inline-cards-1-5` through `pickem-inline-cards-26-30`
- Each slot appears at specific card position (every 5 cards)
- Placeholder shows unique IDs: 071, 072, 073, 074, 075, 076
- Admin form shows 6 distinct options with clear labels
- Placement Builder shows 6 distinct slots under Pick 'Em page

---

## What Admin Sees

**Create Ads Form (Pick 'Em + Inline selected):**
```
Slot: [Dropdown]
  ☑ Pick 'Em Inline (Cards 1-5)    ← ID: 071
  ☐ Pick 'Em Inline (Cards 6-10)   ← ID: 072
  ☐ Pick 'Em Inline (Cards 11-15)  ← ID: 073
  ☐ Pick 'Em Inline (Cards 16-20)  ← ID: 074
  ☐ Pick 'Em Inline (Cards 21-25)  ← ID: 075
  ☐ Pick 'Em Inline (Cards 26-30)  ← ID: 076

💡 Appears in specific Pick 'Em card range
```

**Placement Builder (Pick 'Em page):**
```
Pick 'Em
├─ Entry Popup
├─ Scroll Popup
├─ Inline (Cards 1-5)      [Drag ads here] ← ID: 071
├─ Inline (Cards 6-10)     [Drag ads here] ← ID: 072
├─ Inline (Cards 11-15)    [Drag ads here] ← ID: 073
├─ Inline (Cards 16-20)    [Drag ads here] ← ID: 074
├─ Inline (Cards 21-25)    [Drag ads here] ← ID: 075
├─ Inline (Cards 26-30)    [Drag ads here] ← ID: 076
└─ Banner
```

---

## Ad Rendering on Pick 'Em Page

**If 15 game cards:**
- After card 5: Show ad from Slot 071
- After card 10: Show ad from Slot 072
- After card 15: Show ad from Slot 073
- No slots 074, 075, 076 displayed

**If 30 game cards:**
- After card 5: Show ad from Slot 071
- After card 10: Show ad from Slot 072
- After card 15: Show ad from Slot 073
- After card 20: Show ad from Slot 074
- After card 25: Show ad from Slot 075
- After card 30: Show ad from Slot 076

---

## ID Reassignment

**Removed (no longer used):**
- `065` — Old generic "Pick 'Em Inline (Between Cards)"
- `069` — Old "Predictions Inline (Market List)"

**Renumbered (to close gap):**
- `070` → `077` (Join Inline Venue List) — moved to after Pick 'Em slots

**Added (new):**
- `071-076` — 6 specific Pick 'Em inline card range slots

**Unchanged:**
- `001-064` — All existing slots remain as-is
- `066-068` — Other inline slots (Bingo, Fantasy, Live Trivia)

---

## Success Checklist

After executing both prompts and applying changes:

- [ ] `/types/index.ts` has 6 new slot types (pickem-inline-cards-*)
- [ ] `/lib/adSlotRegistry.ts` has IDs 071-076 with correct labels
- [ ] `/components/admin/sections/adFormShared.tsx` shows 6 Pick 'Em slots in dropdown
- [ ] `/lib/adPlacements.ts` includes 6 new slots in compatibility matrix
- [ ] `/components/admin/AdPlacementBuilder.tsx` shows 6 slots under Pick 'Em
- [ ] `/components/pickem/PickEmGameList.tsx` maps sequenceIndex to correct slot
- [ ] `npm run type-check` passes with no errors
- [ ] Admin form dropdown shows 6 Pick 'Em options with clear labels
- [ ] Placement Builder shows 6 Pick 'Em card range positions
- [ ] Placeholder ads show IDs 071-076 (not "inline-content")
- [ ] Can create ads for all 6 slots
- [ ] Ads render at correct card positions (5, 10, 15, 20, 25, 30)

---

## Rate Limits

If you hit Claude rate limits:
- **Prompt 1** is critical (do first)
- **Prompt 2** depends on Prompt 1 (do second)
- Space them 10-15 minutes apart if needed

---

## Next Steps

1. ✅ You have 2 copy-paste prompts ready
2. ⏭️ Open `CODEX_READY_PICKEM_SLOTS.md`
3. ⏭️ Copy Prompt 1, submit to Codex
4. ⏭️ Apply Prompt 1 changes
5. ⏭️ Copy Prompt 2, submit to Codex
6. ⏭️ Apply Prompt 2 changes
7. ⏭️ Run `npm run type-check`
8. ⏭️ Test in browser

Done! Pick 'Em will have 6 unambiguous inline ad slots with unique 3-digit IDs (071-076).

---

**Questions?**
- Quick ref: `CODEX_QUICK_REFERENCE_PICKEM.md`
- Detailed: `CODEX_PROMPTS_PICKEM_SLOTS.md`
- Copy-paste: `CODEX_READY_PICKEM_SLOTS.md` ← **Use this one**
