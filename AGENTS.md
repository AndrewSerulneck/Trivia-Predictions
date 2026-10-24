# AGENTS.md — Hightop Challenge

**Be concise by default.** Keep responses short — direct answers, no restating the task, no trailing summaries unless asked.

This file exists because some agent tools look for `AGENTS.md` by convention.
The canonical project rules live in **`CLAUDE.md`** (hard boundaries, code
style, naming rules) and **`SYSTEM_CONTEXT.md`** (architecture, product
direction) — read both before starting any task. This file does not duplicate
them; it documents recurring processes and active implementation-plan pointers below.

## Phase handoffs and planned Bingo / Pick ’Em work

Group Games terminology: `docs/group-games-terminology-plan.md`; **Phases 1–4 complete locally
(2026-10-24), not committed/pushed/deployed.** Final handoff:
`docs/group-games-terminology-plan_PHASE_4_HANDOFF.md`; validation/release preparation:
`docs/group-games-terminology-release-record-2026-10-24.md`. Scoped candidate passes 5,505 tests /
13 environment skips, typecheck/lint/build; fixture browser review covers 350/390/1280 px.
Category Blitz status spacing prevents new copy overlapping its icon. Existing email narrow-width
limits and a randomized root Bingo-test failure are documented, not silently fixed.
Group Games is the umbrella for Live Trivia and Category Blitz; dashboard headings are Active
Group Games / Active Prizes. Keep game names, timing statuses, identifiers, routes, filters and
push delivery unchanged. Publication is separate; use the isolated patches/manifest in the release
record, never deploy this dirty root. Preserve unrelated work.

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

**Manual-review reliability COMPLETE/LIVE, 2026-10-14:** All three phases complete. PR #9 merged at 2026-10-14T17:06:19Z; application main `dd45c62d5053ac53eb399344c9e26096704ff9fb`, READY `dpl_FoVD4MvfNVAWZT4hSbKN4noYF1Wa`, both domains/exact source verified 2026-10-14T17:08:42Z. Progress, row-specific repeat/hold reasons, unfinished-only explicit Continue and one shared $0.50 cap are live. Free hosted preview and both live diagnostics pass; Chromium live first record 189 ms, maximum gap 5,834 ms, clean 45,177 ms finish, 483 bytes, zero question/provider operations. Auth/no-cache refusals pass. 4,300 release tests / 13 skips, typecheck/lint/203-page build, SQL 26/16 and final CI 38603010097 / 38603020617 / 38603107780 pass; two existing test waits fixed, no related application change. Plan `docs/speed-trivia-review-reliability-plan.md`; final handoff `docs/speed-trivia-review-reliability-plan_PHASE_3_HANDOFF.md`. No paid audit/pilot, question mutation, migration, cap increase or root deployment. Real paid user-run timing/cost and physical-device observations are optional monitoring. Preserve dirty root future queue/schema work; publishing permission is resolved.

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

## Adding a colour to a light-capable screen

Venue Home, Pick 'Em, NFL Pick 'Em and Fantasy have a light version (`docs/light-theme-plan.md`).
**Adding a colour there = a token with a dark and a light value.** Never an arbitrary hex
(`text-[#fde68a]`), never `text-white` for body text, never a `dark:`/`light:` variant.

1. Add `--ht-<name>` to `:root` (the dark value: what the screen shows today) AND to
   `:root[data-theme="light"]` (light text ≥ 4.5:1 on white), in BOTH `app/globals.css` and
   `design-system/hightop-challenge-design-system/project/colors_and_type.css` (same values; the
   contract test compares them).
2. Needs an opacity modifier (`/80`)? Make it a channel triple `--ht-<name>-rgb: 253 230 138` and
   register `rgb(var(--ht-<name>-rgb) / <alpha-value>)`. Otherwise a plain `var(--ht-<name>)`.
   Don't convert the old plain tokens (`--ht-elevated` etc.) to triples: `bg-ht-elevated/40` emits
   nothing today, and making it work would change dark pixels.
3. Register it under `ht` in `tailwind.config.ts` `colors` (or `boxShadow` for a shadow).
4. Replacing an existing class? Prove dark is unchanged: add `P(old, new)` to
   `scripts/theme-pairs/make-pairs.cjs` and run the pair check, and/or the screenshot harness
   (`scripts/theme-screenshots.cjs`). The recipes are in `docs/light-theme-plan_PHASE_5_HANDOFF.md` §6.
5. `text-white` on a coloured tile stays white; body text becomes a token. Convert by meaning.

## Prize gift card redesign (built 2026-10-15; device pass open)

Plan: `docs/prize-gift-card-redesign-plan.md` (Andrew's decisions in §1 — don't re-ask; handoffs
`docs/prize-gift-card-redesign-plan_PHASE_<N>_HANDOFF.md`). Every prize on `/redeem-prizes` becomes
one midnight-navy digital gift card (`PRIZE_CARD` tokens in `lib/themeTokens.ts`). **Design rule for
all new UI: minimal and simple** — fewest words/colors/elements, one focal point, one accent, no
decorative borders; see the brand README "Minimal and simple". Andrew approved the card on
2026-10-15 (logo 2×) and added a flip. Phases 1–5 are done (uncommitted): tapping a card (not the
logo) flips it to its back — won / for / terms / expires, a "Redeemed {date, time}" stamp, and the
list's action ("Redeem" opens the live sheet; Confirm Redemption is still the only redeem). The one
face/back rules live in `lib/prizeCardFace.ts` (`prizeCardFace`, `prizeCardBack`), the which-button
rule in `prizeActionOf` (`components/prizes/PrizeWalletPanel.tsx`), the flip in `PrizeCard.tsx` (no
overflow/opacity/filter on the perspective root or the rotating element — iOS flattens the 3D).
Wallet tests reach the back's action through `tests/helpers/prizeCardBack.ts`. Partner copy (Phase 5):
the Welcome Email's `prizesSection` (`lib/email/partnerEmailCopy.ts`, picture
`public/brand/email/prize-card-v2.png` from `npm run prize-card:render -- --email` — a new picture
gets a NEW file name) and the Partner Manual section "Where Guests Find Their Prizes" (live
`PrizeCard` figure, sample face, no `back`). Phase 6 (review + wrap-up) is done; all six phases are
uncommitted. What's left is Andrew's phone pass, `docs/prize-gift-card-redesign-device-checklist.md`.

## Adding a new Reward definition

> On screen the word is **Prize** ("Create Prize", "Prizes panel"); `reward` stays in code, routes and DB. Write definition
> copy (`name`, `requirementTemplate`, `description`) with "prize", never "reward" — `tests/prizes-wording-contract.test.ts` fails on it.

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
   time; never write "this venue" (docs/reward-descriptions-plan.md §3). A
   third shape, `calendar: "super_bowl_squares"`, is the Squares prize's (one
   prize per chosen moment — docs/squares-and-brackets-plan.md Phase 4); a
   seasonal definition is hidden out of season by `offeredRewardDefinitions`.
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

## Add a competition to Results

The Partner Dashboard's Results page (`docs/partner-results-page-plan.md`) is competition-agnostic: the timeline,
standings, search, player breakdown and reward matching are shared. Registered today: Live Trivia and Super Bowl
Squares (`lib/results/adapters/squares.ts`, no breakdown — the model for a competition without one). To add
another (NFL Pick 'Em, Category Blitz, Bingo…) — only when Andrew asks:

1. **Registry entry** in `lib/results/competitions.ts`: `id`, `label`, `scoreUnit`, `hasBreakdown`.
2. **Adapter file** `lib/results/adapters/<competition>.ts` (`server-only`) implementing `ResultsAdapter`
   (`lib/results/types.ts`): `listGames` (venue-scoped, newest first, never splits a date, `gameKey` is an opaque
   string you can parse back), `getStandings` (full list, `entry` tokens from `makeResultsEntryTokens` — never a user
   id; throw `ResultsNotFoundError` for another venue's game, `ResultsUnavailableError` for a missing DB function) and,
   if `hasBreakdown`, `getBreakdown` (never select a typed answer). Model it on `adapters/liveTrivia.ts`.
3. **One line** in `lib/results/adapters/index.ts` (`RESULTS_ADAPTERS`; a missing one is a type error).
4. **Reward placement**, only if it has rewards: add its rule to `placeCycle` in `lib/results/rewardPlacement.ts`
   (venue-local dates; an item is never dated after it happened) and its cases to `tests/lib.results-reward-placement.test.ts`.
   Keep `lib/results/rewardSource.ts`'s date-window contract in mind.
5. **Tests**: run `tests/results-registry-contract.test.ts` (registry ↔ adapters agree; a fixture competition renders with
   no UI change) and `tests/results-privacy-contract.test.ts` (no ids, no typed answers, tokens scoped to venue + game);
   add adapter tests beside `tests/lib.results-sources.test.ts`.
6. **No UI change.** If you need one, the seam is wrong: fix the shared shape in `lib/results/types.ts` instead of
   branching on a competition id in `components/owner/results/`.

