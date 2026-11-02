# Pick 'Em plan — Phase 7.6 handoff (2026-11-01)

## For Andrew (plain English)
- **What happened:** I re-checked every fix from 7.1 to 7.5.5. They hold up: the money and security fixes do what they say,
  all the automated checks pass, and nothing I found blocks a deploy.
- **Four new findings** (plan §11):
  1. **F21 (worth fixing before anyone creates a Pick 'Em Prize):** in Admin → Rewards, the **Enable** and **Edit** buttons
     don't know the Pick 'Em Prize rules. Turning an ended prize back on can leave two prizes counting the same picks, and
     saving an edit can quietly change a prize's numbers or stop it paying out. Partners can't do this, only Admin. Until 7.6.1
     ships, don't press Enable or Edit on a Pick 'Em Prize (Disable and Delete are fine). I added this to the phone checklist.
  2. **F22 (display):** a finished Pick 'Em Prize stays on the venue's Prizes list for good, marked "Ended". A weekly one-day
     prize would pile up one card a week.
  3. **F23 (rare):** if two grading runs overlap at the moment a game ends, a player could get the same "you won" notification
     and phone push twice. Never seen in production so far (0 duplicates in the last 24).
  4. **F24 (paperwork):** the notes said the "one prize save at a time" migration (`20261102021619`) wasn't applied. It is.
     Every migration in this plan is now applied. I corrected the plan, `CLAUDE.md` and the checklist.
- **Live?** No. Nothing is committed, pushed or deployed (main is still frozen). I wrote nothing to the database; I only read it.
- **What's left:** three small fix phases (7.6.1–7.6.3). Your phone pass (`docs/pickem-college-football-and-prize-device-checklist.md`)
  can happen now, in parallel.
- **A question for you (plan §8 Q7):** archived prizes of *every* kind stay on the venue Prizes list today. For example,
  Pacific Street's archived Live Trivia Challenge still shows up. 7.6.2 fixes this for Pick 'Em Prizes only. Should archived
  prizes of every kind be hidden too? If you don't say, only Pick 'Em changes.

## For the next agent

### 1. Next phase: 7.6.1 (Opus 5.5 · high), then 7.6.2 and 7.6.3 (Sonnet 5.5 · medium)
Specs are in the plan under "### Phase 7.6.1", "### Phase 7.6.2" and "### Phase 7.6.3", with findings in §11.
- **7.6.1:** the admin `challenge-campaigns` PATCH (`app/api/admin/route.ts`, the `updateChallengeCampaign` branch) refuses
  everything except name, image, `displayOrder` and `isActive: false` on a Pick 'Em Prize. Put the rule in a pure helper.
  The admin UI hides Edit and disables Enable on those rows.
- **7.6.2:** `getChallengeCampaignSnapshotForUser` drops an ended Pick 'Em card 24 h after its period ends. The panel header
  doesn't count ended cards.
- **7.6.3:** `recordSettlement` in `lib/pickem.ts` adds `.select("id")` and counts or notifies only for a row it actually changed.
- **Out of scope:** Squares/Bracket prizes go through the same legacy admin PATCH, but they aren't part of this plan, so
  mention them and don't touch them. Hiding archived prizes of other kinds waits for §8 Q7. F7 (TBA kickoffs) stays
  unbuilt (Andrew said leave the default).

### 2. Starting state
- Branch `after-app-review`. Last commit is `407e4da2` (unrelated Category Blitz work). Phases 1–7.6 are all uncommitted in
  the working tree.
- `main` is frozen during App Store review: never push `main`, never `supabase db push`, never change Production env.
- **Migrations:** `supabase migration list`, run read-only on 2026-11-01, shows ALL nine of this plan's migrations applied on
  `pkmxupsayzshvpirkaav`: `20261031182914`, `…185853`, `…191250`, `…200417`, `…203914`, `20261101150024`, `…150026`,
  `…153306`, `20261102021619`. Every SQL change from here needs a NEW migration.
- **Data:** nothing written. Production read 2026-11-01:
  - 6 started pending picks, all NFL: 4 from 2026-07-30 and 2026-08-02, which the 7.4 cancel will end at the first run, and 2
    for the 2026-11-02 01:20Z game.
  - 13 won picks unpaid. They will be paid 10 points each at the first run.
  - 0 Pick 'Em Prizes, 0 `pickem_prize_save_leases` rows, and 7 of 13 `challenge_campaigns` inactive.

### 3. Decisions already made (don't re-ask)
- Plan §2 (D1–D13), §8 Q4 yes (7.1b), Q5 leave the default (no TBA change), Q6 yes (7.1c).
- 7.6 picks no in-place patches: every fix is its own sub-phase, as in the rest of Phase 7.
- None of F21–F23 blocks deploying Phases 1–7.5.5. 7.6.1 should land before the first Pick 'Em Prize is created.

### 4. Files changed in 7.6 (docs only)
- `docs/pickem-college-football-and-prize-plan.md`:
  - status line
  - Phase 7 table (rows for 7.6, 7.6.1–7.6.3 and the phone pass)
  - Phase 7.6 section, plus new 7.6.1–7.6.3 specs
  - §8 Q7
  - §9 F11 row marked applied
  - new §11 with the findings
- `CLAUDE.md`, Pick 'Em section:
  - heading now says all nine migrations are applied
  - 7.1c and 7.5.3 marked applied
  - a 7.6 line with the admin Enable/Edit warning
- `docs/pickem-college-football-and-prize-device-checklist.md`: 6.4 note (migration applied) and a closing warning about
  admin Enable/Edit.
- No code changed.

### 5. Facts and traps
- **Handoffs have been wrong about what is applied.** Check with `supabase migration list` (read-only; prints JSON). It works
  from this Mac. `supabase db dump` needs Docker and does not.
- The venue page fetches `/api/challenge-campaigns?includeInactive=true&includeResolved=true`. The route only filters when
  those are false, so archived prizes reach the panel. `listChallengeCampaigns` has no venue-panel filter.
- `updateChallengeCampaign` (`lib/challengeCampaigns.ts`) writes whatever generic fields it is given. The admin edit form
  (`ChallengesSection.tsx` `handleCreateOrEdit`) re-sends all of them on save, including `venueIds`, `scheduleType`,
  `activeDays`, `pointsRequiredToWin`, `gameTypes` and `isActive`. For a Pick 'Em Prize, `points_required_to_win` IS N in
  "Get N right".
- The prize sweep skips any Pick 'Em Prize whose `venue_ids` isn't exactly one venue (`[PickEmPrize] sweep-error`, "prize is
  not for exactly one venue"), and keeps skipping it.
- `recordSettlement` has no `.select()`, so a no-op conditional update looks like success. `settleAdminPickEmGame` (7.5.1)
  already does it right: copy that.
- The three live-trivia inventory trigger functions are SECURITY DEFINER, so 7.1c's revokes on the refreshers don't affect them.
- To run a scratch Node script against production: `NODE_PATH=$PWD/node_modules node --env-file=.env.local <script>`.
  A script outside the repo can't otherwise find `@supabase/supabase-js`.
- The same four Sports Bingo star-index date tripwires fail in `npm run test`. They are unrelated and have failed since Phase 1.

### 6. Build / run / test, and what was verified
- `npx tsc --noEmit`: clean.
- eslint on every changed and new `.ts`/`.tsx`: clean.
- `npm run build`: passes.
- `npm run test`: 6,038 pass, 13 skipped, 4 fail (the unrelated tripwires above).
- SQL proofs, all pass: `npm run test:pickem-points-sql`, `test:pickem-lines-sql`, `test:pickem-prizes-sql`,
  `test:pickem-prize-awards-sql`, `test:pickem-prize-lease-sql`, `test:player-write-lockdown-sql`, `test:security-definer-sql`.
- Don't run typecheck and build at the same time: build regenerates `.next/types`.
- **Unverified:** real provider payloads for a cancelled or postponed college game (7.3 is built from synthetic data), a real
  college Saturday end to end, and everything in the phone checklist.

### 7. Open questions for Andrew
- §8 Q7: hide archived prizes of every kind from the venue Prizes panel? Default: no change outside Pick 'Em.

### 8. Recommended first steps for 7.6.1
1. Read plan §11 F21 and "### Phase 7.6.1".
2. Read `app/api/admin/route.ts` around the `resource === "challenge-campaigns"` PATCH branch (≈ line 1674), and
   `components/admin/sections/ChallengesSection.tsx` (`toggleActive`, `bulkPatch`, `beginEdit`, and the row buttons ≈ line 1452).
3. Write the pure refusal helper and its tests first, then the route check (one read of `reward_definition_id` by id), then the UI.
4. Run `npx tsc --noEmit`, eslint on the touched files, and `npm run test`. Write `…_PHASE_7.6.1_HANDOFF.md` and point the plan's
   status line at it.
