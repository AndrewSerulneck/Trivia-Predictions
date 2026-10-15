# AGENTS.md — Hightop Challenge

**Be concise by default.** Keep responses short — direct answers, no restating the task, no trailing summaries unless asked.

This file exists because some agent tools look for `AGENTS.md` by convention.
The canonical project rules live in **`CLAUDE.md`** (hard boundaries, code
style, naming rules) and **`SYSTEM_CONTEXT.md`** (architecture, product
direction) — read both before starting any task. This file does not duplicate
them; it documents recurring processes and active implementation-plan pointers below.

## Phase handoffs and planned Bingo / Pick ’Em work

For every multi-phase plan, write `<PLAN_NAME>_PHASE_<N>_HANDOFF.md` next to the
plan before marking a phase complete; also write one when stopping part-way.
Update the plan's status to link it. Open with a plain-English developer summary,
then give the next agent the scope, branch/commit/deployment/data state, decisions,
changed paths/functions, traps, exact test/run commands and results, open questions,
and recommended next steps/model/effort. Assume no conversation context.

Current plan: `docs/bingo-pickem-reliability-plan.md` (2026-09-12). **Complete and
developer-accepted (2026-09-19): Andrew confirmed authenticated Prop Bingo works after the
atomic migration. Phase 6 was intentionally skipped; do not repair historical boards,
rewards or consequences. All offline gates pass. Physical-device and real-game timing checks
are optional operational monitoring, not unfinished plan phases.** Final handoff:
`docs/bingo-pickem-reliability-plan_PHASE_7_HANDOFF.md`. Release record:
`docs/bingo-pickem-reliability-release-record-2026-09-19.md`. Quality evidence:
`docs/bingo-board-quality-calibration-2026-09-19.md`. Incident audit:
`docs/bingo-brunswick-grove-2026-09-09-audit.md`; executable contract/inventory:
`docs/bingo-grading-capability-matrix.md`. Preserve ignored private evidence under
`tmp/bingo-incident-private/`; never commit player/consequence records.

Application release commit `62f027cd46528d771e154ccb5cc75df24f6d8173` is pushed to
`origin/main`. The linked database migration is applied; deployment status was not independently checked.

Adding a supported square requires a precise label, provider fields and IDs, a sanitized
real capture, hit/miss/boundary/missing/partial/correction regressions, and admission in
`lib/sportsBingoCapabilities.ts` before generation. Run all-four-league grading checks
and the original incident replay. Odds alone are not capability evidence. Preserve
legacy parsing; terminal-card corrections never belong in the active sweep. The new
`20260914010000_bingo_atomic_grading.sql` was applied to linked project `pkmxupsayzshvpirkaav`
at 2026-09-19T23:48Z and verified. Do not reapply or down-migrate it. Final release must add exact commit/deployment and
live/device verification facts to the Phase 7 handoff, release record and these context files.

## Speed Trivia uniqueness (complete/live)

**Manual-review reliability COMPLETE/LIVE, 2026-10-14:** All three phases complete. PR #9 merged at 2026-10-14T17:06:19Z; application main `dd45c62d5053ac53eb399344c9e26096704ff9fb`, READY `dpl_FoVD4MvfNVAWZT4hSbKN4noYF1Wa`, both domains/exact source verified 2026-10-14T17:08:42Z. Progress, row-specific repeat/hold reasons, unfinished-only explicit Continue and one shared $0.50 cap are live. Free hosted preview and both live diagnostics pass; Chromium live first record 189 ms, maximum gap 5,834 ms, clean 45,177 ms finish, 483 bytes, zero question/provider operations. Auth/no-cache refusals pass. 4,300 release tests / 13 skips, typecheck/lint/203-page build, SQL 26/16 and final CI 38603010097 / 38603020617 / 38603107780 pass; two existing test waits fixed, no related application change. Plan `docs/speed-trivia-review-reliability-plan.md`; final handoff `docs/speed-trivia-review-reliability-plan_PHASE_3_HANDOFF.md`. No paid audit/pilot, question mutation, migration, cap increase or root deployment. Real paid user-run timing/cost and physical-device observations are optional monitoring. Preserve dirty root future queue/schema work; publishing permission is resolved. Final documentation main `fbdcc3fba32acc90e6d9f3ad6829e85b813a2791`, READY `dpl_33xUyb9UBXZbHXbiU2ugRzaiwvph`, both domains/exact source verified 2026-10-14T17:15:05Z; final live browser/play probes also pass at 45 seconds. Application main CI 38603795144 and final documentation CI 38604775607 pass. Exact final metadata is in the local Phase 3 handoff supplement and ignored evidence; root future work remains uncommitted.

**Bulk approval timeout COMPLETE/LIVE, 2026-10-14:** User’s 200-question request hit the existing 300-second hosting timeout; five approvals committed. PR #8 merged at 2026-10-14T15:49:42Z; main `244ac0bb2d029c11ea150793ce2eab395f871f62`, READY `dpl_Gut4nT9YNfkHtaWkspupDQKzy9kA`, both live domains/exact source verified 2026-10-14T15:51:44.590Z. Manual Speed checking now has a 240-second deadline; interrupted responses trigger one read-only status check of at most 200 selected IDs, with no automatic re-approval or paid-cap increase. 4,272 tests / 13 skips, typecheck/lint/202-page build and both final online CI runs 38591881335 / 38591891546 pass. Standard NFL/MLB generated references refreshed after their 14-day expiry; two existing UI tests now await loaded/idle state, with no related runtime changes. Handoff `docs/speed-trivia-bulk-approval-timeout-2026-10-14.md`. No agent question mutation, new migration or paid question test. Root remains dirty on local main `1932091`; origin/main is the release SHA. Do not deploy root or resume the declined $225 audit.

**Manual Speed approval COMPLETE/LIVE, 2026-10-14:** Andrew explicitly approved publication after confirmation that approved facts block later approvals across all batches/requests. PR #7 merged; published main `05ae101097623ff3c91254856a3f14f39b48c00c`; READY deployment `dpl_qocmBBNTRMY8UXoeWSQNDJP5vYvk`; both domains/exact SHA independently verified 2026-10-14T14:06:52.417Z. Existing repeat checker remains fallible. New generation/edits/imports keep complete-bank pending/deleted/history protection. No production question mutations, migration, paid audit/test or normal-cap change. Handoff/release `docs/speed-trivia-manual-approval-2026-10-14.md`; sanitized evidence `tmp/speed-trivia-uniqueness-private/manual-approval-release-2026-10-14/`. Publishing permission is resolved; do not re-ask. $225 audit remains declined. Root local main stays `1932091` with unpublished work, while origin/main is the new SHA: preserve/reconcile dirty changes carefully; never deploy the root working tree.

**Manual approval implementation, 2026-10-14:** tested PR head `58543015896f3d46c52c2d9629698bab9ec3d31f` pushed only to `fix/speed-trivia-approved-only`; draft PR #7 https://github.com/AndrewSerulneck/Trivia-Predictions/pull/7, NOT live. Automatic approval review rejected direct main publication because it needs Andrew's explicit publishing approval. Do not bypass by merge/direct deployment. Handoff `docs/speed-trivia-manual-approval-2026-10-14.md`; isolated worktree `/private/tmp/speed-trivia-approval-release-2026-10-14` uses only the existing schema. Release 4,261 tests / 13 skips / typecheck / lint / 202-page build and SQL 26/16 pass; root 4,332 tests / 13 skips / 203-page build pass. Online CI 38568443755 / 38568450376 and both preview builds pass for the PR head. Root retains unpublished variety/migration work: never deploy the root working tree. No paid calls, data writes or migration. The $225 audit was declined; do not re-ask.

**Latest Andrew decision, 2026-10-14:** the $225 bulk audit was declined; he will use manual Question Review. Do NOT request that allowance again or run a bulk audit without a new explicit request. He authorized changing “Approve Selected” to compare solely with already approved active questions. This is restricted to unchanged pending→active manual approvals; new generation/edits/imports retain full-bank pending/deleted/history repeat protection. A narrow release is being prepared separately from the unapproved subject-variety migration. Frozen Phase 3 evidence remains historical unfinished preparation.

**Active follow-up, updated 2026-10-14:** `docs/speed-trivia-variety-and-backlog-plan.md` is the single plan for subject variety, pending backlog and reliable approvals. **Phases 1–2 complete locally; Phase 3 free preparation complete but paid audit unfinished, awaiting explicit $225 one-time total cap and question-data transfer approval. Resume Phase 3 (Sol/high); Phase 4 is NOT next yet.** Read `docs/speed-trivia-variety-and-backlog-plan_PHASE_3_HANDOFF.md` and `docs/speed-trivia-variety-phase-3-evidence.md`. Fresh revision 2551: 4,274 active / 7,083 pending / 2,537 deleted; all original pending versions unchanged. Frozen 215,636 tasks / 4,461 cached / 211,175 uncached; two verified private packages. Explicit unfinished proposal has all 7,083 not processed; no final survivors/retirements claimed. New paid calls/production writes/deployments: zero. 4,323 tests / 13 skips, typecheck/lint/203-page build pass. New migration `20261014020000` remains NOT applied; production lacks required leading-column nonpartial indexes on `trivia_answers(question_id)`, `live_showdown_answers(question_id)`, `venue_seen_questions(question_id)`. Prepare separate new index migrations and obtain exact production confirmation in Phase 4; never weaken the reference guard. HEAD and independently queried GitHub main `1932091`; Phase 1–3 changes remain local/uncommitted. Both hosting domains READY `dpl_C5JhQeDE9hKt2Qmi6TzGjnho7ZTV`; CLI source SHA absent/unverified. Workflow 264911476 observed active, schedule/cap unchanged. No new paid cap is approved; old $4 and both $0.50 pilots remain historical. Preserve applied uniqueness migration, signed admission, retired memory and ignored private evidence. Different facts sharing answers remain valid; concentration is separate. Execute one phase at a time, leave named handoffs, do not deploy incompatible runtime before approved cutover. Deferred editorial 4.1–4.4 remain archived; export PR #5 is merged.

Plan: `docs/speed-trivia-uniqueness-plan.md`. **Complete/live, 2026-10-13:** 2,534 reviewed
versions softly retired (862 active / 1,672 pending), retaining 990 approved keepers, all content/IDs
and history. All six original repeated facts have one active version. Final bank **4,274 active /
7,084 pending / 2,536 deleted**, total 13,894, numeric revision **2550**. Approved-Speed
[export PR #5](https://github.com/AndrewSerulneck/Trivia-Predictions/pull/5) verified (4,274 rows /
9 Speed files), open/unmerged; DB cleanup is already live. Ambiguous cases remain internal and
explicitly held; bounded audit is not exhaustive certification.

Final application SHA **`0b1f5e819971673ed617b2c1ef98f239c57e2096`** pushed; Vercel READY
**`dpl_Aw67UdWUXWbWcEWtaQP9ytc8UhrM`**, both domains/exact SHA verified. Nightly **264911476
restored active at 2026-10-13T19:23:18.329Z**, unchanged 02:15 UTC schedule / **$0.50** cap.
The original pilot admitted 2 pending rows then failed closed; Andrew explicitly approved one
additional pilot, which admitted 14 pending rows and exposed a 10-minute deadline classification
race. Strict label/deadline repairs are deployed and tested; both raw reports preserved. No third
pilot was run/authorized. Refreshed bank audit **$2.1268289** under a separately approved $4 cap;
audit + two pilots **$2.4519286 conservatively**, invoices unmeasured. Recurring $0.50 per
nightly/admin operation unchanged (at most $15/30 scheduled runs; admin additional, no shared
monthly counter). No budget replenishment or full-bank daily audit.

Read `docs/speed-trivia-uniqueness-plan_PHASE_5_HANDOFF.md` and
`docs/speed-trivia-uniqueness-phase-5-release-record.md` for exact frozen manifest/backup/undo/
pilot/restart/publication state. All required gates pass: 4,237 tests / 13 environment skips,
typecheck/lint/build and isolated SQL/concurrency. Seven future scheduled-run observations are
optional monitoring, not another phase. Andrew deferred editorial 4.1–4.4; don't revive them.
Different facts about one artist stay valid. Preserve signed admission, retired memory/history,
ignored private evidence and editor files. Applied migration `20261013120000` is immutable;
never reapply/edit/down-migrate or redo the original feature backfill. A future different production
migration or new paid expansion needs its own concrete authorization.

## Join Merch Store plan (Partner Dashboard)

Plan: `docs/join-merch-store-plan.md`. **Phases 1–4.6 built 2026-10-01** (look-only store;
Phases 5–6, real orders/payment and 3PL, are unscheduled — don't start them without Andrew).
A white "Order Join Merch" sheet (`?sheet=store`, `components/owner/store/`) on the Partner
Dashboard menu sells QR coasters, table tents and card sets; the final button is "Ordering opens
soon" and nothing is sent (no `fetch(` under `components/owner/store/`). Carts are per venue
(`lib/useVenueMerchCart.ts`). A free join-QR PNG/SVG download points at
`https://play.hightopchallenge.com` — **permanent** (printed on merch); single source
`lib/joinQr.ts`, files regenerated by `npm run store:qr`, pinned by `tests/lib.join-qr.test.ts`.
Read the plan's §1 "Decisions already made" before asking Andrew anything. Handoffs:
`docs/join-merch-store-plan_PHASE_<N>_HANDOFF.md`; phone pass:
`docs/join-merch-store-device-checklist.md`.

**Adding or repricing a merch product:** edit only
`lib/merchCatalog.ts` (one entry: id, name, description, image with real pixel size + alt, and
`pack` or `unit` pricing in integer cents with a SKU per sellable unit). Put the source photo in
`assets/store-src/`, run `npm run store:images`, then extend `tests/lib.merch-pricing.test.ts`. The
store UI reads the catalog, so no component change is needed.

## Adding a new Reward definition

The Rewards system (`docs/rewards-system-plan.md`) lets a venue offer a
pre-set challenge — complete a requirement within a time window, win a prize —
by picking from a slate of **reward definitions** rather than authoring one
free-form. Today there is one definition, the Live Trivia Challenge. To add
another:

1. **Add one entry to `REWARD_DEFINITIONS`** in `lib/rewardDefinitions.ts`:
   `id`, `name`, `gameType` (which game's points count), `challengeMode`
   (`"progress"` — leaderboard mode is retired from creation),
   `requiresScheduledGame` (the `OwnerScheduleGameType` the venue must already
   run, or `null` if the reward gates on nothing), `requirementTemplate`
   (player-facing copy, `{threshold}` substituted at expansion),
   `thresholdOptions` + `defaultThreshold`, `accent`, `glyph`, and
   `description` — the guest-facing sentences (`RewardDescriptionTemplates`:
   pick `calendar: "venue_schedule"` for a game the venue schedules or
   `"nfl_season"` for the NFL calendar, then fill that shape's templates with
   `{prize}`/`{threshold}`/… placeholders). `describeReward()` /
   `describeRewardWin()` in `lib/rewardDescription.ts` compose them at read
   time; never write "this venue" (docs/reward-descriptions-plan.md §3).
2. **Only if `requiresScheduledGame` points at a game with no existing lookup
   yet**, add a schedule lookup in `lib/rewards.ts` (mirror
   `getVenueLiveTriviaSchedules`) and wire it into
   `resolveRewardCreationContext` alongside the existing `live_trivia`
   branch. If the new definition's `requiresScheduledGame` is `null`, or
   reuses a game that's already wired, skip this step entirely.
3. **Nothing else changes.** The Create Reward wizard
   (`components/rewards/CreateRewardWizard.tsx`), both hosts (admin
   `ChallengesSection.tsx` and Partner Dashboard `app/owner/competitions/page.tsx`),
   `createReward()`'s expansion into `challenge_campaigns`, the multi-winner
   engine, the venue Rewards panel card states, and `PrizeWalletPanel`
   redemption rendering are all definition-agnostic — they read the registry,
   not a hardcoded list.
4. Add a Vitest case to `tests/lib.rewards-definitions.test.ts` for the new
   definition's cadence resolution and `createReward` expansion, and its
   description cases to `tests/lib.reward-description.test.ts`. A new
   `calendar` kind (neither a venue schedule nor the NFL season) is the one
   case that also needs a branch in `lib/rewardDescription.ts`.

Full rationale, the prize/quota data model, and the multi-winner ledger design
are in `docs/rewards-system-plan.md` (§3–§4).
