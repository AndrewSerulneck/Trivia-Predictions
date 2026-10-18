# Rewards → Prizes rename — Phase 4 handoff (admin, emails, Partner Manual, marketing & legal)

Plan: `docs/rewards-to-prizes-rename-plan.md`. Phase 4 done 2026-10-18.

## Summary for Andrew (plain English)
- **What changed:** the admin panel ("Prizes Manager", "Prizes & Events", "New Prize"), the partner emails, the
  Partner Manual, the marketing page, `llms.txt` and the legal pages (rules, terms, privacy, support, delete-account)
  now say "Prize" wherever they said "Reward". Sentences were reworded so they never say "prize" twice.
- **Live?** No. One local commit, not pushed or deployed (deploy only after Phase 5).
- **Left:** Phase 5 (lock the test, glossary in living docs, full build gate, phone checklist section M).
- **Needs you:** please read the `/rules` changes below (official contest rules). And decide the Media Kit HTML (below).

### `/rules` — every changed sentence
| Before | After |
|---|---|
| (meta) …venue rewards: no purchase necessary, how winners are chosen, eligibility and prizes. | …venue prizes: no purchase necessary, how winners are chosen, eligibility and what you can win. |
| These rules apply to the rewards, challenges and prizes offered… | These rules apply to the prizes and challenges offered… |
| …any contest, reward, challenge or sweepstakes… | …any contest, challenge or sweepstakes… |
| Rewards are run by [entity] together with the… venue named on each reward. The venue supplies and honors the prize. | Prizes are run by [entity] … named on each prize. The venue supplies and honors it. |
| …of the venue offering the reward may play but may not win that venue's prizes. | …offering a prize may play but may not win that venue's prizes. |
| Rewards are skill-based; they are not a lottery… | Prizes are skill-based; they are not a lottery… |
| Each reward states a goal on the venue's Rewards panel… Where a reward has a limited number of prizes, the first players to qualify win until the prizes run out. Where a reward is won by the most correct picks… tiebreaker shown for that reward. | Each prize states a goal on the venue's Prizes panel… Where a prize is limited in number, the first players to qualify win until they run out. Where a prize is won by the most correct picks… tiebreaker shown for that prize. |
| …modest value as described on each reward. | …modest value as described on each one. |
| …may end, change or cancel a reward if it cannot run as planned. | …cancel a prize if it cannot run as planned. |

Other legal: `/terms` "We may change or end rewards" → "prizes"; `/privacy` "rewards progress and prizes" → "prize progress
and prizes won", "that a reward's prize was given out" → "that a prize was given out"; `/support` "email us the reward
and date" → "the prize and date"; `/delete-account` + `DeleteAccountPanel` "rewards progress" → "prize progress", "If you won
a reward, the record that the venue gave out that prize…" → "If you won a prize, the record that the venue gave it out…".

## For the next agent (Phase 5: lock in + docs + final gate — Sonnet 5.5, medium)
1. **Goal/scope:** plan §4 Phase 5 (items 1–5). Out of scope: code renames, dated plan/handoff docs, push/deploy.
2. **Starting state:** branch `main`; commits `d3130a6` (P1), `4847675` (P2), `88a1f65` (P3), then the Phase 4 commit
   "feat(wording): admin, emails, manual, marketing & legal Rewards → Prizes (Phase 4)". Nothing pushed/deployed; no data or migrations touched.
3. **Decisions:** plan §2. Same convention as Phase 3: the offer is a Prize, what a winner holds is "it"/"one".
   Email/manual: "When a guest wins a prize from you, we let them know right away. It appears as a digital gift card in Redeem Prizes…".
4. **Files changed:** `app/api/admin/route.ts` (2 errors), `app/{delete-account,info,privacy,rules,support,terms}/page.tsx`,
   `components/account/DeleteAccountPanel.tsx`, `components/admin/adminSectionMeta.ts`,
   `components/admin/sections/ChallengesSection.tsx`, `lib/email/partnerEmailCopy.ts`, `lib/partnerManual.ts`, `llms.txt`;
   tests: `prizes-wording-contract` (all `phase:4` entries deleted — only `keep` remain; `grep -c '"phase":' ` shows
   only `"keep"`), `owner-dashboard-contract`, `components.partner-manual-prizes`, `info-partner-login-contract`.
   The `Allowed.phase` type in the test still lists `2 | 3 | 4`: Phase 5 should narrow it to `"keep"` and drop tags.
5. **Traps:** the scanner works on literals; reword → delete the allowlist entry in the same change. The `info` page keeps
   the two verb uses ("rewards quick thinking", "rewards the users that think the fastest"). The Phase 1 handoff
   counted 49 phase-4 entries; all were reworded, none re-tagged `keep`. `ChallengesSection.tsx` code comments still say "reward" (not on screen).
6. **Verified:** `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` 404 files passed / 1 skipped, 4,807 passed / 13 skipped / 0 failed;
   `npm run email:preview` renders (output in `tmp/email-previews/`, not read visually). **Not verified:** build, a visual look at the emails/admin panel.
7. **Open questions for Andrew:** (a) `public/brand/Hightop Challenge - Advertiser Media Kit (Standalone) (4).html` says
   "Built-In Rewards Loop" / "Rewards loop"; it's a standalone sales file not linked from the app, **left unchanged** pending his call.
   (b) Read the `/rules` table above.
8. **First steps:** narrow the allowlist type to `keep`; add the CLAUDE.md "Naming Rule" glossary line, AGENTS.md checklist note,
   `SYSTEM_CONTEXT.md` §8, design-system README note; run the full gate incl. `npm run build`, `test:pwa-contract`, `test:god-mode-join`;
   add section M to the device checklist; write the Phase 5 handoff.
