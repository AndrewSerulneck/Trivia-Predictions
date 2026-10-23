# Native app plan — Phase 9f.5 handoff (partner "On shared pictures" box fixes) — 2026-10-23

## For Andrew (plain English)
- **What changed:** three small fixes to the "On shared pictures" box partners see (Schedule → Review, Prize wizard, Game Settings, admin venue form).
  - If the box failed to load, it was stuck. Now there's a **Try again** button.
  - If a partner switched venue without leaving the page, the box could show "…" forever, or show a half-edited choice from the other venue (and could save it to the wrong venue). Now each venue shows only its own details and drafts.
  - If the Instagram handle switch was off but the (hidden) handle box held something invalid, Save refused. Now with the switch off, Save ignores the hidden box and keeps the saved handle; turning it back on later brings the handle back.
- **Live?** No. Nothing is committed, pushed or deployed (you asked for 9f.1–9f.6 in one deploy).
- **Cost:** none. Try again re-runs the same single lookup the box already made.
- **Needs you:** nothing now. Your phone check is item 42 of section J in `docs/native-app-device-checklist.md`, after the deploy.

## For the next agent

### 1. Next phase and scope
**9f.6** (Haiku 4.5 or Sonnet 5.5, low; website only): `components/pickem/PickEmGameList.tsx` `todayWinPoints` should sum each won game's `userPickRewardPoints` (`lib/pickem.ts`) with the same `|| 10` fallback as the history line, not won × 10. Test: a won game worth 20 → the share shows 20. Spec: `docs/native-app-store-plan.md` → 9f.6. Then ONE deploy of 9f.1–9f.6 (+ the 9f.2 app build), the iPhone install (section 9 of `…_PHASE_9F_3_HANDOFF.md`), then 9g. Out of scope: review finding 17 (relative `./` imports in `lib/socialShare/`).

### 2. Starting state
- Branch `main`, last commit `20a97e2`. **Nothing from 9f–9f.5 is committed, pushed or deployed.** No data or database touched (no migration).
- Uncommitted by 9f.5: `components/owner/share/ShareDetailsPanel.tsx`, `lib/venueShareDetails.ts` (`SHARE_DETAILS_COPY.retry`), `tests/share-details-panel.test.ts` (new), the plan's status line + 9f.5 bullet, checklist item 42, this file.
- CLAUDE.md holds someone else's uncommitted POS hunk — never stage it; stage share hunks with `git apply --cached`. Other people's uncommitted files are listed in the 9f.4 handoff §2 (`.codex/`, `.firebaserc`, `.mcp.json`, `firebase.json`, POS docs, deleted `design-system/project/public/info/*.png`, etc.).

### 3. Decisions already made
- Andrew: ship 9f.1–9f.6 in one deploy, then install on his iPhone. Mine (within the plan): a draft/message is also cleared when the venue changes, so returning to A starts clean (not just B being clean).

### 4. Files
- `ShareDetailsPanel.tsx`: `details = loaded(for this key) ?? cache.get(key)`; `draftState` / `messageState` carry their `key` and are only shown for the current key, and an effect clears them when the key changes; `attempt` counter in the load effect's deps drives `retry()` (clears the error, re-runs the GET; `inFlight` is already cleared in `finally`); `save()` validates the handle only when `draft.showInstagram`, else sends `details.instagramHandle`; the save result is written under the key/venueId captured at save start.
- Tests: `tests/share-details-panel.test.ts` (R10 retry, R11 A→B→A + message, R12 off/on).

### 5. Facts and traps
- The module-level `cache` isn't reactive; that's why `loaded` state still exists (it triggers the re-render after a load).
- The panel sits on light and dark hosts; no class changes were made (retry uses the existing `link` tone, ≥12px).

### 6. Build / test / verified
- Sequentially: `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` 441 files + 1 skipped, **5,427 pass / 13 skipped / 0 fail**; `npm run build` OK.
- Not verified in a real browser or on a phone (checklist item 42).

### 7. Open questions
- Still pending: OK to commit and push everything once 9f.6 is done, then install on the iPhone?

### 8. First steps for 9f.6
Read the plan's 9f.6 entry and `PickEmGameList.tsx` `todayWinPoints`; write the failing test first (won game worth 20 → 20); run the four gates sequentially; write `…_PHASE_9F_6_HANDOFF.md`.
