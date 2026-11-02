# Pick 'Em plan — Phase 7.6.1 handoff (2026-11-01)

## For Andrew (plain English)
- **What changed:** in Admin → Rewards, the buttons can no longer break a Pick 'Em Prize's rules.
  - A Pick 'Em Prize row has **no Edit button**.
  - Once the prize is off, its **Enable** button is greyed out. Hover over it to see why.
  - **Disable** and **Delete** still work.
  - The server refuses these changes too, so they can't happen any other way either.
  - Bulk Enable still turns on the other selected prizes. It then tells you how many it couldn't change and why.
  - Renaming or reordering a Pick 'Em Prize still works.
  - To change a Pick 'Em Prize's games, dates or numbers, archive it and create a new one.
- **Live?** No. Nothing is committed, pushed or deployed (main is still frozen). There's no database change, and I wrote no data.
- **What's left:** 7.6.2 and 7.6.3 (both small). Your phone pass can still happen now. Until this code is deployed, the old
  advice stands: don't press Enable or Edit on a Pick 'Em Prize.
- **Nothing needs you** for this phase. The earlier question (plan §8 Q7: hide archived prizes of every kind?) is still open
  and belongs to 7.6.2.

## For the next agent

### 1. Next phase: 7.6.2 (Sonnet 5.5 · medium), then 7.6.3 (Sonnet 5.5 · medium)
Specs are in the plan under "### Phase 7.6.2" and "### Phase 7.6.3", with findings F22 and F23 in §11.
- **7.6.2:** `getChallengeCampaignSnapshotForUser` (`lib/challengeCampaigns.ts`) drops a Pick 'Em Prize card when
  `pickemPrizeSnapshotState(...).prizeEnded` and its shown period ended more than 24 h ago. An archived prize with no shown
  period is dropped at once. The "Active · N Prizes" header in `VenueChallengesPanel.tsx` doesn't count ended cards.
- **7.6.3:** `recordSettlement` in `settlePendingPickEmPicks` (`lib/pickem.ts`) adds `.select("id")`. It counts and notifies only
  when a row came back. Copy the pattern from `settleAdminPickEmGame` in `lib/admin.ts` (7.5.1).
- **Out of scope:**
  - Squares and Bracket prizes go through the same unguarded legacy PATCH. They aren't part of this plan, so they're left
    alone. If Andrew wants them guarded, the same helper pattern works with their own definition ids.
  - Hiding archived prizes of other kinds waits for §8 Q7.
  - F7 (TBA kickoffs) stays unbuilt.

### 2. Starting state
- Branch `after-app-review`. Last commit is `407e4da2` (unrelated Category Blitz work). Phases 1–7.6.1 are all uncommitted in
  the working tree.
- `main` is frozen during App Store review: never push `main`, never `supabase db push`, never change Production env.
- **Migrations:** 7.6.1 adds none. All nine of this plan's migrations are applied on `pkmxupsayzshvpirkaav` (checked
  read-only in 7.6).
- **Data:** nothing read or written in 7.6.1. As of the 7.6 read, production has 0 Pick 'Em Prizes, so no existing row is
  affected.

### 3. Decisions made (don't re-ask)
- **The rule is an allowlist, not a list of banned fields.** A Pick 'Em Prize accepts only `resource`, `id`, `name`,
  `imageUrl`, `imageScale`, `imageFocusX`, `imageFocusY`, `imageFit`, `displayOrder`, and `isActive` set to exactly `false`.
  Any other field that is present (including `null`) is refused, and so is any other `isActive` value. A field added to
  the PATCH later is refused automatically.
- **`rules` is refused.** A prize built from a definition shows its composed wording, so `rules` isn't editable for it.
- **The row is read only when needed.** The route asks the pure helper first. It reads the row's `reward_definition_id`
  only when the body would be refused for a Pick 'Em Prize, so Disable, rename and reorder cost no extra read. This
  differs from the spec's "read first", but the outcome is the same and it costs less.
- **A failed read fails closed:** it throws, and the PATCH catch returns 500. A missing row or a malformed id returns
  null, and the old behaviour runs.
- **POST needs no guard.** The `challenge-campaigns` POST calls `createChallengeCampaign` without `rewardDefinitionId`, so it
  can't create or change a Pick 'Em Prize.
- **The message lives in client-safe `lib/pickemPrizes.ts`** (`PICKEM_PRIZE_ADMIN_EDIT_MESSAGE`). It is re-exported as
  `REWARD_PICKEM_ADMIN_EDIT_MESSAGE` in `lib/rewards.ts`, the same pattern as the Squares and Bracket messages, so the
  admin list can show it as the Enable button's title.

### 4. Files changed
- `lib/pickemPrizes.ts`: new section "Admin edits":
  - `PICKEM_PRIZE_ADMIN_EDIT_MESSAGE`
  - the private `PICKEM_PRIZE_ADMIN_PATCH_FIELDS` set
  - `pickemPrizeAdminPatchRefusal(body) → string | null`
- `lib/rewards.ts`: imports the message and re-exports it as `REWARD_PICKEM_ADMIN_EDIT_MESSAGE`.
- `lib/challengeCampaigns.ts`: new `getChallengeCampaignDefinitionId(id)`, placed just above `ChallengeCycleWinnerRecord`.
  - It makes one read by id. Ids that fail `CAMPAIGN_ID_PATTERN` return null.
  - It throws on a read error.
- `app/api/admin/route.ts`: in the PATCH `challenge-campaigns` branch, before `updateChallengeCampaign`:
  - if the helper refuses the body, it reads the definition
  - a Pick 'Em Prize gets `409 { ok: false, error }`
  - new imports: the helper, `PICKEM_PRIZE_DEFINITION_ID`, the reader and the message
- `components/admin/sections/ChallengesSection.tsx`:
  - `AdminChallengeCampaign.rewardDefinitionId` (the GET already returns it, via `mapCampaignRow`)
  - Edit is hidden on Pick 'Em rows
  - Enable is `disabled` with the message as its `title` when the row is off
  - `bulkPatch` now checks each response and sets an error such as "N campaign(s) weren't changed. <server reason>"
  - `toggleActive` is unchanged (its Enable can't be pressed on these rows)
- `tests/pickem-prize-admin-patch-guard.test.ts` (new, 34 tests):
  - the helper: the allowed set, every edit-form field refused, unknown fields refused, the message re-export
  - the route with mocks: Enable gives 409, the full re-send gives 409, a second venue gives 409, N changed gives 409;
    Disable, rename and reorder give 200 with no read; other definitions are unchanged; a failed read gives 500 and no write
  - static contracts: the route has one `updateChallengeCampaign` call, guarded first; the UI hides Edit and disables Enable
- Docs:
  - plan status line, Phase 7 table row, 7.6.1 section ("As built") and the F21 row ("Fixed in 7.6.1")
  - the `CLAUDE.md` Pick 'Em section line
  - the device checklist note under section 9

### 5. Facts and traps
- `bulkPatch` used to ignore HTTP status, because `fetch` doesn't throw on a 409. It now reads it. The first refused
  response's JSON gives the reason.
- The reorder arrows send only `{ id, displayOrder }`. They're always allowed and never read the row.
- `updateChallengeCampaign` still accepts every generic field for every other prize kind, and that is unchanged.
- The same four Sports Bingo star-index snapshot tripwires fail in `npm run test`. They're unrelated and date-driven, and
  have failed since Phase 1.
- Don't run typecheck and build at the same time: build regenerates `.next/types`.

### 6. Build, run and test — what was verified
- `npx tsc --noEmit`: clean.
- eslint on all six touched or new files: clean.
- `npx vitest run tests/pickem-prize-admin-patch-guard.test.ts`: 34/34 pass.
- `npm run test`: 6,072 pass, 13 skipped, 4 fail. The 4 are the unrelated tripwires above; the 6,038 from 7.6 plus 34 new
  tests make 6,072.
- `npm run build`: passes.
- **Unverified:**
  - The admin screen in a real browser: the hidden Edit, the greyed Enable with its hover text, and the bulk message.
    There's no Pick 'Em Prize in production to look at, so check it once one exists (or on `venue-hightop-test`).
  - Everything in the phone checklist.

### 7. Open questions for Andrew
- §8 Q7 (for 7.6.2): hide archived prizes of every kind from the venue Prizes panel? The default is no change outside
  Pick 'Em.
- Optional, not asked yet: should Squares and Bracket prizes get the same admin guard? It's outside this plan.

### 8. Recommended first steps for 7.6.2
1. Read plan §11 F22 and "### Phase 7.6.2".
2. Read `getChallengeCampaignSnapshotForUser` (`lib/challengeCampaigns.ts`, around line 3275 now) and `pickemPrizeSnapshotState`.
   Then read the header count in `components/venue/VenueChallengesPanel.tsx`.
3. Add `PICKEM_PRIZE_ENDED_CARD_MS` (24 h), filter in the snapshot, and change the header count. Then add the three tests from
   the spec.
4. Run `npx tsc --noEmit`, eslint on the touched files, and `npm run test`. Write `…_PHASE_7.6.2_HANDOFF.md` and point the
   plan's status line at it.
