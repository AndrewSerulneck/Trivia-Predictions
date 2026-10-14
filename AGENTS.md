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

**Manual Speed approval update, 2026-10-14:** Andrew declined a $225 backlog audit and chose manual review. “Approve Selected” now checks only already-approved active Speed questions for unchanged pending→active approval; new generation/edits/imports retain full-bank pending/deleted/history repeat protection and signed admission. Batch results preserve actual saved IDs across rejection/failure. No migration, paid audit or normal-cap change. Release/handoff: `docs/speed-trivia-manual-approval-2026-10-14.md`. Root workspace has separate unpublished subject-variety work: do not deploy it before its own approved schema cutover.

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
