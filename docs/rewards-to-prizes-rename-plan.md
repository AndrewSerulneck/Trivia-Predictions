# Rename "Rewards" → "Prizes" — Plan

> **Status:** All phases (1–9) done 2026-10-18 (latest handoff: `docs/rewards-to-prizes-rename-plan_PHASE_9_HANDOFF.md`); committed locally, **ready to push** (Andrew's call).
> Code review 2026-10-18 found 8 issues → review-fix Phases 6–9 done (§4, "Review fixes"). Push after Phase 9. Each phase ends with
> `docs/rewards-to-prizes-rename-plan_PHASE_<N>_HANDOFF.md`; update this line to point at the latest.
> **Owner:** Andrew.

---

## 1. Summary for Andrew (plain English)

Everywhere a player, partner or admin reads **"Reward"**, they will read **"Prize"** instead: the venue-home
panel, the Partner Dashboard ("Offer Prizes", "Create Prize"), Results, the admin panel, partner emails, the
Partner Manual, FAQs, the marketing page and the legal pages. Old links that say `?sheet=rewards` keep working.

**What does NOT change:** file names, function names and database names inside the code keep the word
"reward". Nobody sees them. CLAUDE.md gets a one-line glossary ("`reward` in code = **Prize** on screen"), and a
new automatic test fails if anyone writes "Reward" into on-screen text again. That test is the guard against
the old word coming back.

**Cost:** none. Wording only: no new database reads, scheduled jobs or API calls. No production data contains
the word (checked 2026-10-18: 0 prize names, 0 notifications).

**The phone app** shows the live website, so it changes when the website deploys. No app-store update is needed.
(If the App Store / Google Play *listing* text says "Rewards", that lives in App Store Connect / Play Console,
outside this repo. See open question Q1.)

**Ship it all at once.** Each phase is committed separately, but deploy only after Phase 5 so players never see
"Prizes" on one screen and "Rewards" on the next.

---

## 2. Decisions already made (Andrew, 2026-10-18), don't re-ask

1. **Scope = visible words only.** Code identifiers, file names, API route paths (`/api/owner/rewards`,
   `/api/nfl-pickem/rewards`), DB tables/columns/RPCs and migrations stay as they are. Exception: the **browser
   address** is visible, so `?sheet=rewards` → `?sheet=prizes` and Results `?step=reward` → `?step=prize`. The old
   values are accepted **forever**, because they are in sent emails and bookmarks.
2. **Reword each sentence; never find-and-replace.** Today a *Reward* is the offer and the *prize* is what the
   winner gets. After the rename the offer is a **Prize**, so every sentence that used both words is rewritten so it
   never says "prize" twice. Examples:
   - "Choose a valid prize for this reward." → "Choose what the winner gets."
   - "Reward archived. Prizes already awarded still work." → "Prize archived. Ones already won still work."
   - "Couldn't check this reward's prizes." → "Couldn't check who has won this prize."
3. **Player labels:** the venue-home panel becomes **"Prizes"**; the menu keeps **"Redeem Prizes"** (the verb tells
   them apart). `/redeem-prizes` URL unchanged.
4. **Also change:** (a) marketing and legal phrasing ("a digital gaming and **prizes** platform", "prize progress"),
   (b) Bingo / Pick 'Em / Fantasy **point claims** ("Claimed 2 Bingo rewards for +200 points" → wording about
   points/wins, e.g. "Collected 2 Bingo wins for +200 points"; "claim your reward" → "collect your points"),
   (c) the **admin panel** ("Rewards Manager" → "Prizes Manager", "Rewards & Events" → "Prizes & Events").

### Always keep (not our feature name)
- **Verbs:** "rewards quick thinking", "rewards the users that think the fastest" (`app/info/page.tsx`),
  "rewarding results" (`lib/socialShare/copyPresets.ts`).
- **Third-party product names:** "Toast's own Rewards button" (`lib/pos/providers.ts`).
- **Server log tags and code comments** (`[RewardRedeem]`, etc.). They are not on screen; changing them breaks
  log searches.
- **API JSON keys** (`rewards: [...]` in `/api/owner/results`, `resource: "rewards"` in `/api/admin`). Not visible,
  and renaming them causes deploy skew with open tabs.
- **Historical docs** (`docs/*-plan.md`, handoffs). They are dated records. Only *living* docs change (Phase 5).

---

## 3. Inventory (measured 2026-10-18)

- 561 tracked files mention "reward" (8,506 lines); 222 are docs and 96 tests. **~76 source files carry it in a
  string literal or JSX text** (list below). 84 test files mention it, and some pin copy.
- Vocabulary already in use: "prize" is the won item (`PrizeCard`, `prizeCardFace`, `/redeem-prizes`,
  `/api/prizes/*`, DB `weekly_prizes`, `prize_wins`). Keep it.
- DB `reward_points` (Bingo/Pick 'Em/Fantasy) is a points payout, a different concept. Never touched (DB).
- Pictures: `public/brand/email/prize-card-v2.png` says "GIFT CARD" (fine). The 8 `public/info/*.png`
  screenshots and `design-system/**` were **not** checked for baked-in "Rewards" text. That check is Phase 1.

---

## 4. Phases

| Phase | What | Model | Effort |
|---|---|---|---|
| 1 | Copy inventory + tripwire test (report mode) + picture check | Sonnet 5.5 | medium |
| 2 | Player-facing copy | Opus 5.5 | medium |
| 3 | Partner Dashboard copy + `?sheet=prizes` URL | Opus 5.5 | high |
| 4 | Admin panel, partner emails, Partner Manual, marketing & legal | Sonnet 5.5 | medium |
| 5 | Lock the tripwire, glossary in living docs, full gate, phone checklist | Sonnet 5.5 | medium |
| 6 | Review fixes: wrong error message, `/rules` disclaimer, stale screen text in scripts/checklist | Sonnet 5.5 | medium |
| 7 | Review fixes: make the wording tripwire count copies (+ cheap pre-filter) | Sonnet 5.5 | medium |
| 8 | Review fixes: old `?sheet=rewards` address on a mid-flow reload; drop the dead Results `step=reward` alias | Opus 5.5 | medium |
| 9 | Review fix: stop committing `next-env.d.ts` (needs Andrew's Q3), full gate, ready to push | Sonnet 5.5 | low |

Opus does Phases 2–3 because the wording needs judgement: the wizard's rules sentences (`lib/rewardTerms.ts`,
`lib/rewardGameSlots.ts`) are long, number-aware and full of "reward … prize" pairs. Phases 1, 4 and 5 are
mechanical or short-copy work.

Every phase: update the tests that pin changed copy in the same commit; run `npx tsc --noEmit`, `npm run lint`,
`npm run test` (not typecheck concurrently with build); commit locally; **do not push or deploy**; write the
handoff.

### Phase 1 — Inventory + tripwire (Sonnet 5.5, medium)
1. Add `tests/prizes-wording-contract.test.ts`. It scans `app/**/*.{ts,tsx}`, `components/**/*.{ts,tsx}`,
   `lib/**/*.{ts,tsx}` and `llms.txt` for `\b[Rr]ewards?\b` inside **string literals, template literals and JSX
   text** (not identifiers, imports or comments). Every hit must be in an allowlist in the test file
   (`{ file, snippet, reason }`). Seed the allowlist with **every current hit**, tagged `phase: 2 | 3 | 4` or
   `keep` (§2 "Always keep"). The test fails on any **new** hit, so nothing slips in while the rename is under way.
   Each later phase deletes its own entries; the allowlist shrinking to only `keep` entries shows the work is done.
2. Open the 8 `public/info/*.png` screenshots and the `design-system/**/README.md` + UI kit files; list any
   with visible "Reward" text in the handoff (they are fixed in Phase 4; screenshots may need Andrew to re-capture).
3. List test files that assert changed copy, grouped by the phase that will change them.
4. No copy changes in this phase.

### Phase 2 — Player-facing copy (Opus 5.5, medium)
Files: `components/venue/VenueChallengesPanel.tsx` (panel title "Prizes", "Active · 3 Prizes", "Prize won! Tap to
claim it."), `components/venue/venueHubShared.tsx` ("2 of 3 prizes left"), `components/venue/VenueHubClient.tsx`
(aria labels), `components/challenges/ChallengeRedeemPanel.tsx` ("Active Rewards"),
`components/nfl-pickem/NFLPickEmRewardBanner.tsx` ("Details in Prizes"),
`components/nfl-pickem/NFLPickEmLeaderboard.tsx`, `components/navigation/AccountMenuList.tsx`,
`components/join/JoinFlow.tsx`, `lib/competition.ts`, `lib/venueGameCards.ts` (tutorial copy; check at 350 px and
289 px cards per CLAUDE.md), `lib/prizeCardFace.ts` (card label `REWARD` → `PRIZE`, headline fallback "Reward" →
"Prize"; run `npm run prize-card:render` to eyeball, and do **not** overwrite `public/brand/email/*`),
`lib/rewardDescription.ts` + guest templates in `lib/rewardDefinitions.ts`, `app/faqs/page.tsx`.
Point claims: `components/activity/ActiveGamesPanel.tsx`, `lib/sportsBingo.ts`, `lib/fantasy.ts`, and any
Pick 'Em claim errors. Player-visible API error strings: `app/api/challenge-campaigns/*`,
`app/api/nfl-pickem/rewards/route.ts`.
Extra gate: `npm run test:god-mode-join` (JoinFlow touched).

### Phase 3 — Partner Dashboard copy + URL (Opus 5.5, high)
- Dashboard: `components/owner/dashboard/RewardsSection.tsx` ("Offer Prizes", "Offer a prize", "+ Offer another
  prize"), `app/owner/dashboard/page.tsx` ("View Prizes", "Now offer a prize for it →", load errors),
  `DashboardNotice.tsx`, `DashboardToast.tsx`, `components/owner/menu/ownerMenuItems.ts` (Results hint
  "Games, winners & prizes").
- Create flow: `components/owner/rewards/*`, `components/rewards/CreateRewardWizard.tsx` (**shared with admin**:
  the admin snapshot tests will change too; that is expected, but confirm only wording moved), `lib/rewardTerms.ts`,
  `lib/rewardGameSlots.ts`, `lib/rewardGameSlotCascade.ts`, `lib/rewards.ts` (all `REWARD_*_MESSAGE`),
  `lib/rewardDefinitions.ts` labels, `lib/rewardPrizeDraft.ts`, `lib/ownerRewardFlow.ts`,
  `lib/ownerRewardDisplay.ts`, `lib/ownerRewardRequests.ts`, `lib/liveTriviaRankedRewards.ts`,
  `lib/rankedPlaceRewards.ts`, `lib/rankedPlaceCardData.ts`, `lib/nflPickEmRewardWeeks.ts`, `lib/ownerCompetitions.ts`,
  `app/api/owner/rewards/**` error strings.
- Results: `components/owner/results/*` ("Prizes won at this game", "1 prize"), `lib/results/resultsDisplay.ts`,
  `lib/results/rewardSource.ts`, `lib/ownerHistory.ts` ("That prize wasn't found.").
- POS + social: `components/owner/pos/PosConnectionsSheet.tsx` (eyebrow "Prizes at the register"),
  `lib/posStaffInstructions.ts`, `/owner/pos-staff-sheet`, social share presets.
- **URL:** in `lib/ownerSheetParams.ts`, make `prizes` the sheet id and read `rewards` as an alias (normalise on
  read, never write it back). Same for the Results step `reward` → `prize`. `app/owner/competitions/page.tsx`
  redirects to `?sheet=prizes`. Add tests: an old `?sheet=rewards&step=detail` URL opens the same screen, and
  phone Back still steps/closes correctly (`lib/useOwnerSheet.ts` depth counter). Grep `lib/email/` for any link
  that writes `sheet=rewards`.
- Extra gates: `tests/owner-menu-contract.test.ts`, `tests/owner-dashboard-contract.test.ts`,
  `tests/results-registry-contract.test.ts` (must still pass unchanged in intent).

### Phase 4 — Admin, emails, Partner Manual, marketing & legal (Sonnet 5.5, medium)
- Admin: `components/admin/adminSectionMeta.ts`, `components/admin/sections/ChallengesSection.tsx`
  ("New Prize", "Prize created.", "Back to prize list"), `app/api/admin/route.ts` user-visible errors only
  (`resource=rewards` stays).
- Partner emails: `lib/email/partnerEmailCopy.ts` ("Offer Prizes", "Apply Prizes with Square", "When a guest wins
  one of your prizes … appears as a digital gift card in Redeem Prizes"). Run `npm run email:preview` and look.
- Partner Manual: `lib/partnerManual.ts`.
- Marketing: `app/info/page.tsx` (keep the verb uses), `llms.txt`, page `metadata` descriptions.
- Legal: `app/rules/page.tsx`, `app/delete-account/page.tsx`, `components/account/DeleteAccountPanel.tsx`
  (+ `/terms`, `/privacy`, `lib/legalInfo.ts`, which had no hits on 2026-10-18; re-check). **`/rules` is the
  official contest rules page: list every changed sentence in the handoff for Andrew to read.**
- Any pictures flagged in Phase 1.

### Phase 5 — Lock in + docs + final gate (Sonnet 5.5, medium)
1. Tripwire: the allowlist now holds only `keep` entries. Remove the phase tags, so any new "Reward" in on-screen
   text fails `npm run test`.
2. Glossary in **living** docs: CLAUDE.md (a "Naming Rule" line next to "credit allocation": *"Players and partners
   see **Prize**. Code, routes and DB keep `reward` (`lib/rewards.ts`, `challenge_campaigns.reward_definition_id`,
   `/api/owner/rewards`). Never write 'Reward' in on-screen text; `tests/prizes-wording-contract.test.ts`."*), plus
   the Rewards System section's on-screen terms, `AGENTS.md` "add a reward" checklist (note the on-screen word),
   `SYSTEM_CONTEXT.md` §8, design-system README. Do not edit dated plan/handoff docs.
3. Full gate: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run test:pwa-contract`,
   `npm run test:god-mode-join`, `npm run build`.
4. Add **section M** to `docs/partner-dashboard-app-redesign-device-checklist.md`: venue-home Prizes panel,
   a won-prize card, NFL banner, Create Prize wizard end to end, Results, an old `?sheet=rewards` bookmark, the
   partner email preview, `/rules`.
5. Handoff: commit list and "ready to push", which is Andrew's call.

### Review fixes (Phases 6–9, added 2026-10-18)

A code review of `d3130a6..072a5a6` (Phases 1–5) found 8 issues. The old-link aliases work; nothing is broken for
players. Each finding below was checked against the code before it was planned. The same rules as above apply to
every phase: same gates, commit locally, **do not push or deploy**, write `…_PHASE_<N>_HANDOFF.md`. Ship Phases 1–9
together.

### Phase 6 — Copy fixes (Sonnet 5.5, medium)
1. **Wrong error message (review #1).** `REWARD_INVALID_PRIZE_MESSAGE` (`lib/rewards.ts:140`) became "Choose what
   the winner gets." But `normalizeRewardPrize` (`lib/rewards.ts:921-989`) throws it for 12 cases, and most of them
   mean the partner *did* choose: a menu item at >100% off, a $0 gift card, a $0 place on a weekly ladder, a missing
   "other" item name, a forged `posDelivery`. **Fix: reword the one constant** so it covers both cases, e.g.
   *"Check what the winner gets: pick a prize and enter a valid amount."* Keep **one** constant. Both routes map
   400 by comparing `message === REWARD_INVALID_PRIZE_MESSAGE` (`app/api/owner/rewards/route.ts:101`,
   `app/api/admin/route.ts:1076`), so a second constant would need both routes changed, and it isn't worth it: the
   wizard checks amounts before submitting, so partners rarely see this message. Tests import the constant (no
   literal is pinned; `grep -rn "Choose what the winner gets"` is empty apart from `lib/rewards.ts`), so no test
   edits are expected. Keep the wording free of "reward" (the tripwire fails on it).
2. **`/rules` disclaimer (review #3).** `app/rules/page.tsx:23` dropped "reward" without adding "prize": *"…not
   involved in, any contest, challenge or sweepstakes…"*. **Fix:** *"…not involved in, any contest, prize, challenge
   or sweepstakes on Hightop Challenge."* Extend `tests/legal-pages-contract.test.ts:47` to pin the word `prize` in
   that sentence, so it can't be dropped again. **This is the official rules page: quote the before/after sentence in
   the handoff for Andrew to read.**
3. **Old screen text outside the scanned folders (review #2).** `scripts/measure-owner-load.cjs:93` waits for
   "Offer Rewards" → change to **"Offer Prizes"** (the title in `components/owner/dashboard/RewardsSection.tsx`).
   Then sweep for any other script or doc that *waits for or tells a person to tap* old on-screen words:
   `grep -rnE "Offer Rewards|Create Reward|View Rewards|Rewards Manager|Rewards & Events|Active Rewards" scripts docs/*checklist*.md`.
   Known 2026-10-18: `docs/partner-dashboard-app-redesign-device-checklist.md` lines 24, 88, 138, 139 (sections A,
   H, K) still say "Offer Rewards" / "Create Reward". Andrew uses that checklist on a phone, so change the **label he
   taps** to the new word; leave dated history docs and log text alone (`scripts/backfill-ranked-reward.cjs:54`
   "Reward:" and `scripts/audit-legacy-recurring-cadences.cjs:76` are console output for developers: keep them).
4. Run `node scripts/measure-owner-load.cjs` only if a local `next start` is already up. Don't start or kill
   Andrew's dev server (CLAUDE.md). Otherwise note "not run" in the handoff.

### Phase 7 — Harden the wording tripwire (Sonnet 5.5, medium)
1. **Count copies (review #4).** `tests/prizes-wording-contract.test.ts:76-78` turns hits into a `Set` keyed by
   `(file, text)`, so an allow-listed text (e.g. `"rewards"` in `app/owner/dashboard/page.tsx`, or "Failed to update
   reward." in `lib/rewardGameSlotCascade.ts`) also lets **every later copy** in that file through. **Fix:** count hits
   per key (a `Map<key, number>`), give `Allowed` an optional `count` (default 1), and fail when a file has **more** of a
   text than allowed (new copy) or **fewer** (stale entry: lower the count or delete the entry). Seed each `count` from
   today's real numbers (run the scanner once and print counts) so the test passes on day one. Add a unit case to
   the scanner self-test: two copies of one allowed text with `count: 1` must fail.
2. **Fix the header's promise.** Say exactly what is scanned (`app/`, `components/`, `lib/` `.ts/.tsx`, `llms.txt`)
   and that `scripts/` and docs are **not** (they legitimately use `reward` everywhere). Do not widen the scan to
   `scripts/`; Phase 6 item 3 was a one-time sweep.
3. **Cheap pre-filter (review #5, optional).** Measured 2026-10-18: the whole test file runs in ~1.3 s, so speed is
   not a real problem. Since the file is open anyway, skip the TypeScript parse when the raw file text doesn't match
   `REWARD_WORD` (`tests/helpers/rewardWordingScan.ts` `scanAllWording`). Same results, two lines. Note the before/after time
   in the handoff; if it isn't faster, drop it.

### Phase 8 — URL alias tidy-up (Opus 5.5, medium)
1. **Old id survives a mid-flow reload (review #6).** `normalizeLandedSheet` (`lib/ownerSheetParams.ts:262`) rewrites
   only depth-0 landings. A partner whose tab was on `?sheet=rewards&step=detail` (pushed by the old build, depth ≥ 1)
   reloads after the deploy and keeps the old id in the address bar. It still works, but the alias comment
   (`lib/ownerSheetParams.ts:31-34`) promises it is "never written". **Fix:** in `normalizeLandedSheet`, when depth > 0 **and**
   the raw `sheet` value is an alias, `replaceState` the same entry with the canonical id, **keeping its depth state**
   (`depthState(readSheetDepth(history.state))`) and step. No push, so the depth counter and Close (pop every entry)
   stay right. Return `false` from that branch (it didn't push), and check `useOwnerSheet` doesn't treat the
   return value as "a sheet was pushed". Extend `tests/lib.owner-sheet-params.test.ts:350` ("a reload mid-flow on an old
   ?sheet=rewards entry…") to assert the URL now reads `sheet=prizes` and Close still pops every entry, and add a
   case that a canonical `?sheet=prizes` mid-flow entry is left untouched (no extra history writes).
2. **Dead Results alias (review #7).** `screenOfStep` (`components/owner/results/ResultsSheet.tsx:61`) maps
   `step=reward` → `prize`, but the prize screen needs `rewardSel`, which only exists in memory. After any load,
   `available.prize` is false, the screen falls back to `"list"` and `correctStep(null)` runs: exactly what an unknown
   step does. **Fix:** delete the `reward` branch and fix the comment at line 46 ("was `reward`; the old step is still
   read") and line 60. Remove the `ResultsSheet.tsx` / `"reward"` `keep` entry from the tripwire allow-list (Phase 7's
   count check will demand it). Add or keep a test showing that `?sheet=history&step=reward` lands on the list with
   the step cleared. Plan §2 decision 1 ("old values accepted forever") still holds: the old link still opens Results;
   it just never could open a single prize.

### Phase 9 — `next-env.d.ts` + final gate (Sonnet 5.5, low)
1. **Generated file in commits (review #8).** `next-env.d.ts` says "should not be edited". Its import flips between
   `./.next/dev/types/routes.d.ts` (`next dev`) and `./.next/types/routes.d.ts` (`next build`), so it lands in unrelated
   commits (`2f44182`, `6d314a0`, `b1395e0`). **Needs Andrew's answer to Q3 first.** Recommended (and what the Next.js
   TypeScript docs advise): add `next-env.d.ts` to `.gitignore` and `git rm --cached next-env.d.ts` (the file stays on
   disk). Vercel's `next build` regenerates it. A fresh clone that runs `npx tsc --noEmit` before any dev/build must run
   `npx next typegen` first; add that line under "Build and Test Commands" in CLAUDE.md. If Andrew says keep tracking
   it, do nothing except leave it unstaged in future commits.
2. **Full gate:** `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run test:pwa-contract`,
   `npm run test:god-mode-join`, `npm run build` (typecheck not concurrently with build).
3. Update this plan's status line and write the final handoff: commit list `d3130a6` … Phase 9, "ready to push"
   (Andrew's call), and add to device checklist section M: the Create Prize wizard showing the new invalid-prize
   message (e.g. a $0 gift card, if the wizard lets it through) and `/rules` showing "contest, prize, challenge".

---

## 5. Risks

- **Mixed wording if deployed mid-way.** Mitigation: deploy after Phase 5 only.
- **"Prize prize" sentences.** Mitigation: hand-reworded (decision 2); Phase 3 at high effort; Andrew reads `/rules`.
- **Old links.** `?sheet=rewards` in sent emails/bookmarks. Mitigation: permanent alias + test.
- **Code says reward, screen says Prize.** A future developer or agent may copy the code word into new copy.
  Mitigation: the Phase 5 tripwire test + CLAUDE.md glossary.
- **Text length.** "Prizes" is shorter than "Rewards", so no overflow risk. Reworded sentences may be longer: check
  tutorial cards at 289 px.

## 6. Open questions for Andrew
- **Q1 (answered 2026-10-18: No, nothing outside the repo says "Rewards").** Do the App Store / Google Play listing texts (or any printed merch, partner sales decks, social posts)
  say "Rewards"? Those are outside the repo; you'd change them by hand.
- **Q2 (answered 2026-10-18: skip).** Should code names be renamed later? Not planned. It's optional cleanup with no visible effect (see §5).
- **Q3 (answered 2026-10-18: yes, ignore it).** Stop committing `next-env.d.ts` (a file Next.js writes itself; it keeps changing
  between dev and build)? Recommended: yes, ignore it. No effect on the website or the app.
